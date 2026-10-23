import { AudioBuffers } from "./AudioBuffers";
import { Impulse } from "./Impulse";
import { Gain } from "../model/Gain";
import { ProjectOps } from "../model/ProjectOps";
import { MasterPresets } from "../engine/EffectPresets";
import { MicChain } from "../mic/MicChain";
import { SonaTune } from "../tune/SonaTune";
import { VolumeAutomation } from "../model/VolumeAutomation";
import type { Bus, BusKind, Project, StoredBuffer, Track } from "../model/types";

export interface PlayAnchor {
  contextTime: number;
  fromSec: number;
}

export interface CapturedAudio {
  samples: Float32Array;
  sampleRate: number;
}

interface TrackNodes {
  input: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  makeup: GainNode;
  dry: GainNode;
  wet: GainNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  highpass: BiquadFilterNode;
  convolver: ConvolverNode;
  panner: StereoPannerNode;
  fader: GainNode;
  deessLow: BiquadFilterNode;
  deessHigh: BiquadFilterNode;
  deessComp: DynamicsCompressorNode;
  deessHighGain: GainNode;
  analyser: AnalyserNode;
}

interface BusNodes {
  id: string;
  kind: BusKind;
  input: GainNode;
  panner: StereoPannerNode;
  fader: GainNode;
  analyser: AnalyserNode;
}

interface BuiltGraph {
  inputs: Map<string, GainNode>;
  masterComp: DynamicsCompressorNode;
  masterMakeup: GainNode;
  masterGain: GainNode;
  tracks: Map<string, TrackNodes>;
  buses: Map<string, BusNodes>;
}

export interface MixLevels {
  master: number;
  tracks: Record<string, number>;
  buses: Record<string, number>;
}

const CAPTURE_WORKLET = `
class SonaCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("sona-capture", SonaCapture);
`;

/** Phase 2 can replace the prototype engine with another implementation of this port. */
export interface AudioEnginePort {
  unlock(): Promise<AudioContext>;
  sync(project: Project, stored: Record<string, StoredBuffer>): boolean;
  play(fromSec: number): PlayAnchor;
  stop(): void;
  clock(): number | null;
  audition(buffer: StoredBuffer, loop: boolean): void;
  stopAudition(): void;
  prepareInput(): Promise<void>;
  startCapture(): void;
  stopCapture(): CapturedAudio | null;
  setCaptureOpen(open: boolean): void;
  setMonitor(enabled: boolean): void;
  setInputGain(db: number): void;
  meter(): number;
  livePeaks(buckets?: number): Float32Array;
  dispose(): void;
}

export class AudioEngine implements AudioEnginePort {
  private ctx: AudioContext | null = null;
  private masterIn: GainNode | null = null;
  private masterComp: DynamicsCompressorNode | null = null;
  private masterMakeup: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private clickGain: GainNode | null = null;
  private trackNodes = new Map<string, TrackNodes>();
  private busNodes = new Map<string, BusNodes>();
  private trackKey = "";
  private audioBuffers = new Map<string, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];
  private project: Project | null = null;
  private stored: Record<string, StoredBuffer> = {};
  private stream: MediaStream | null = null;
  private mic: MediaStreamAudioSourceNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private inputGain: GainNode | null = null;
  private captureOpen = true;
  private monitorOn = false;
  private inputGainDb = 0;
  private auditionNode: AudioBufferSourceNode | null = null;
  private capturing = false;
  private chunks: Float32Array[] = [];
  private liveMin: number[] = [];
  private liveMax: number[] = [];
  private liveFill = 0;
  private readonly bucketSize = 256;
  private metroTimer: number | null = null;
  private nextBeat = 0;
  private anchor: PlayAnchor | null = null;
  private running = false;
  private metroKey = "";
  private meterData: Float32Array<ArrayBuffer> | null = null;
  private static readonly impulses = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

  dispose(): void {
    this.stop();
    this.capturing = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.ctx?.close();
    this.ctx = null;
  }

  async unlock(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.buildMaster(this.ctx);
      if (this.project) this.sync(this.project, this.stored);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  sync(project: Project, stored: Record<string, StoredBuffer>): boolean {
    this.project = project;
    this.stored = stored;
    if (!this.ctx || !this.masterIn) return false;
    this.ensureBuffers();
    const rebuilt = this.ensureTracks();
    this.applyParams(true);
    this.applyMaster(true);
    const key = `${project.bpm}:${project.metronome}`;
    if (this.running && key !== this.metroKey) {
      this.metroKey = key;
      this.startMetronome();
    }
    return rebuilt;
  }

  play(fromSec: number): PlayAnchor {
    const ctx = this.ctx;
    const startAt = (ctx?.currentTime ?? 0) + 0.05;
    this.anchor = { contextTime: startAt, fromSec };
    this.running = true;
    this.applyParams(true);
    this.stopSources();
    const buffers = new Map(this.audioBuffers);
    if (ctx && this.project) AudioEngine.stage(ctx, this.project, this.stored, buffers);
    if (ctx && this.project) this.schedule(ctx, this.project, buffers, this.inputs(), fromSec, startAt);
    this.metroKey = this.project ? `${this.project.bpm}:${this.project.metronome}` : "";
    this.startMetronome();
    return this.anchor;
  }

  audition(buffer: StoredBuffer, loop: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    this.stopAudition();
    const source = this.ctx.createBufferSource();
    source.buffer = AudioBuffers.toContext(this.ctx, buffer.channels, buffer.sampleRate);
    source.loop = loop;
    source.connect(this.masterGain);
    source.start();
    this.auditionNode = source;
  }

  stopAudition(): void {
    if (!this.auditionNode) return;
    try {
      this.auditionNode.stop();
    } catch {
      /* already stopped */
    }
    this.auditionNode.disconnect();
    this.auditionNode = null;
  }

  stop(): void {
    this.running = false;
    this.stopSources();
    this.stopMetronome();
    this.anchor = null;
  }

  clock(): number | null {
    if (!this.ctx || !this.anchor) return null;
    return this.anchor.fromSec + (this.ctx.currentTime - this.anchor.contextTime);
  }

  async prepareInput(): Promise<void> {
    const ctx = await this.unlock();
    if (this.mic) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    this.mic = ctx.createMediaStreamSource(this.stream);
    this.inputGain = ctx.createGain();
    this.inputGain.gain.value = Gain.toLinear(this.inputGainDb);
    this.mic.connect(this.inputGain);
    this.sink = ctx.createGain();
    this.sink.gain.value = this.monitorOn ? 0.35 : 0;
    this.inputGain.connect(this.sink);
    this.sink.connect(ctx.destination);
    try {
      await this.attachWorklet(ctx);
    } catch {
      this.attachProcessor(ctx);
    }
  }

  startCapture(): void {
    this.chunks = [];
    this.liveMin = [];
    this.liveMax = [];
    this.liveFill = 0;
    this.capturing = true;
  }

  stopCapture(): CapturedAudio | null {
    this.capturing = false;
    if (!this.ctx || this.chunks.length === 0) return null;
    const samples = AudioBuffers.concat(this.chunks);
    this.chunks = [];
    if (samples.length === 0) return null;
    return { samples, sampleRate: this.ctx.sampleRate };
  }

  livePeaks(buckets = 80): Float32Array {
    const out = new Float32Array(buckets * 2);
    if (this.liveMax.length === 0) return out;
    for (let i = 0; i < buckets; i += 1) {
      const index = Math.min(this.liveMax.length - 1, Math.floor((i * this.liveMax.length) / buckets));
      out[i * 2] = this.liveMin[index] ?? 0;
      out[i * 2 + 1] = this.liveMax[index] ?? 0;
    }
    return out;
  }

  meter(): number {
    return AudioEngine.level(this.analyser, this.meterData, (data) => {
      this.meterData = data;
    });
  }

  levels(): MixLevels {
    const tracks: Record<string, number> = {};
    this.trackNodes.forEach((nodes, id) => {
      tracks[id] = AudioEngine.level(nodes.analyser, null, () => undefined);
    });
    const buses: Record<string, number> = {};
    this.busNodes.forEach((nodes, id) => {
      buses[id] = AudioEngine.level(nodes.analyser, null, () => undefined);
    });
    return { master: this.meter(), tracks, buses };
  }

  static async render(project: Project, stored: Record<string, StoredBuffer>, sampleRate: number): Promise<AudioBuffer> {
    const end = Math.min(600, Math.max(0.25, ProjectOps.contentEnd(project) + 1.6));
    const ctx = new OfflineAudioContext(2, Math.ceil(end * sampleRate), sampleRate);
    const buffers = new Map<string, AudioBuffer>();
    AudioEngine.stage(ctx, project, stored, buffers);
    const graph = AudioEngine.buildGraph(ctx, project);
    AudioEngine.applyStatic(graph, project, ctx);
    graph.masterGain.connect(ctx.destination);
    AudioEngine.schedule(ctx, project, buffers, graph.inputs, 0, 0);
    return ctx.startRendering();
  }

  private buildMaster(ctx: AudioContext): void {
    this.masterIn = ctx.createGain();
    this.masterComp = ctx.createDynamicsCompressor();
    this.masterMakeup = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.clickGain = ctx.createGain();
    this.clickGain.gain.value = 1;
    this.masterIn.connect(this.masterComp);
    this.masterComp.connect(this.masterMakeup);
    this.masterMakeup.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.clickGain.connect(ctx.destination);
  }

  private ensureBuffers(): void {
    if (!this.ctx) return;
    for (const [id, stored] of Object.entries(this.stored)) {
      if (this.audioBuffers.has(id)) continue;
      this.audioBuffers.set(id, AudioBuffers.toContext(this.ctx, stored.channels, stored.sampleRate));
    }
  }

  private ensureTracks(): boolean {
    if (!this.ctx || !this.project || !this.masterIn) return false;
    const buses = this.project.buses ?? [];
    const key = `${this.project.tracks.map((track) => `${track.id}:${track.busId}`).join("|")}#${buses.map((bus) => bus.id).join("|")}`;
    if (key === this.trackKey) return false;
    this.trackNodes.forEach((nodes) => {
      nodes.analyser.disconnect();
      nodes.wet.disconnect();
      nodes.delayWet.disconnect();
    });
    this.busNodes.forEach((bus) => bus.analyser.disconnect());
    this.trackNodes.clear();
    this.busNodes.clear();
    for (const bus of buses) {
      this.busNodes.set(bus.id, AudioEngine.createBus(this.ctx, bus, this.masterIn));
    }
    for (const track of this.project.tracks) {
      const nodes = AudioEngine.trackNodes(this.ctx);
      AudioEngine.wireTrack(nodes, track, this.busNodes, this.masterIn);
      this.trackNodes.set(track.id, nodes);
    }
    this.trackKey = key;
    return true;
  }

  private inputs(): Map<string, GainNode> {
    const inputs = new Map<string, GainNode>();
    this.trackNodes.forEach((nodes, id) => inputs.set(id, nodes.input));
    return inputs;
  }

  private static buildGraph(ctx: BaseAudioContext, project: Project): BuiltGraph {
    const masterIn = ctx.createGain();
    const masterComp = ctx.createDynamicsCompressor();
    const masterMakeup = ctx.createGain();
    const masterGain = ctx.createGain();
    masterIn.connect(masterComp);
    masterComp.connect(masterMakeup);
    masterMakeup.connect(masterGain);
    const tracks = new Map<string, TrackNodes>();
    const buses = new Map<string, BusNodes>();
    const inputs = new Map<string, GainNode>();
    for (const bus of project.buses ?? []) buses.set(bus.id, AudioEngine.createBus(ctx, bus, masterIn));
    for (const track of project.tracks) {
      const nodes = AudioEngine.trackNodes(ctx);
      AudioEngine.wireTrack(nodes, track, buses, masterIn);
      tracks.set(track.id, nodes);
      inputs.set(track.id, nodes.input);
    }
    return { inputs, masterComp, masterMakeup, masterGain, tracks, buses };
  }

  private static createBus(ctx: BaseAudioContext, bus: Bus, master: GainNode): BusNodes {
    const input = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const fader = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    input.connect(panner);
    panner.connect(fader);
    fader.connect(analyser);
    analyser.connect(master);
    return { id: bus.id, kind: bus.kind, input, panner, fader, analyser };
  }

  private static wireTrack(nodes: TrackNodes, track: Track, buses: Map<string, BusNodes>, master: GainNode): void {
    const group = buses.get(track.busId);
    nodes.analyser.connect(group ? group.input : master);
    const reverb = [...buses.values()].find((bus) => bus.kind === "reverb");
    const delay = [...buses.values()].find((bus) => bus.kind === "delay");
    if (reverb) nodes.wet.connect(reverb.input);
    else nodes.wet.connect(nodes.panner);
    if (delay) nodes.delayWet.connect(delay.input);
    else nodes.delayWet.connect(nodes.panner);
  }

  private static trackNodes(ctx: BaseAudioContext): TrackNodes {
    const input = ctx.createGain();
    const low = ctx.createBiquadFilter();
    const mid = ctx.createBiquadFilter();
    const high = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 140;
    mid.type = "peaking";
    mid.frequency.value = 1200;
    mid.Q.value = 0.8;
    high.type = "highshelf";
    high.frequency.value = 6500;
    const comp = ctx.createDynamicsCompressor();
    comp.knee.value = 8;
    const makeup = ctx.createGain();
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0;
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 180;
    const convolver = ctx.createConvolver();
    const panner = ctx.createStereoPanner();
    const fader = ctx.createGain();
    const deessLow = ctx.createBiquadFilter();
    const deessHigh = ctx.createBiquadFilter();
    deessLow.type = "lowpass";
    deessHigh.type = "highpass";
    deessLow.Q.value = 0.707;
    deessHigh.Q.value = 0.707;
    const deessComp = ctx.createDynamicsCompressor();
    deessComp.attack.value = 0.003;
    deessComp.release.value = 0.08;
    deessComp.knee.value = 2;
    const deessHighGain = ctx.createGain();
    deessHighGain.gain.value = 0;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    input.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(deessLow);
    high.connect(deessHigh);
    deessHigh.connect(deessComp);
    deessComp.connect(deessHighGain);
    deessLow.connect(comp);
    deessHighGain.connect(comp);
    comp.connect(makeup);
    makeup.connect(dry);
    dry.connect(panner);
    makeup.connect(delay);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayWet);
    makeup.connect(highpass);
    highpass.connect(convolver);
    convolver.connect(wet);
    panner.connect(fader);
    fader.connect(analyser);
    return {
      input, low, mid, high, comp, makeup, dry, wet, delay, delayFeedback, delayWet, highpass, convolver, panner, fader,
      deessLow, deessHigh, deessComp, deessHighGain, analyser,
    };
  }

  private applyParams(live: boolean): void {
    if (!this.project) return;
    const now = this.ctx?.currentTime ?? 0;
    const auto = this.running && this.anchor && this.ctx
      ? { fromSec: Math.max(0, this.clock() ?? this.anchor.fromSec), origin: Math.max(now, this.anchor.contextTime) }
      : null;
    for (const track of this.project.tracks) {
      const nodes = this.trackNodes.get(track.id);
      if (!nodes || !this.ctx) continue;
      AudioEngine.applyTrack(nodes, this.project, track, this.ctx, live, now, auto);
    }
    for (const bus of this.project.buses ?? []) {
      const nodes = this.busNodes.get(bus.id);
      if (nodes) AudioEngine.applyBus(nodes, bus, live, now);
    }
  }

  private applyMaster(live: boolean): void {
    if (!this.project || !this.masterComp || !this.masterMakeup || !this.masterGain) return;
    const now = this.ctx?.currentTime ?? 0;
    AudioEngine.applyMasterNodes(this.masterComp, this.masterMakeup, this.masterGain, this.project, live, now);
  }

  private static applyStatic(graph: BuiltGraph, project: Project, ctx: BaseAudioContext): void {
    graph.tracks.forEach((nodes, id) => {
      const track = project.tracks.find((item) => item.id === id);
      if (track) {
        const auto = track.automation.length > 0 ? { fromSec: 0, origin: 0 } : null;
        AudioEngine.applyTrack(nodes, project, track, ctx, false, 0, auto);
      }
    });
    graph.buses.forEach((nodes, id) => {
      const bus = project.buses.find((item) => item.id === id);
      if (bus) AudioEngine.applyBus(nodes, bus, false, 0);
    });
    AudioEngine.applyMasterNodes(graph.masterComp, graph.masterMakeup, graph.masterGain, project, false, 0);
  }

  private static applyTrack(
    nodes: TrackNodes,
    project: Project,
    track: Track,
    ctx: BaseAudioContext,
    live: boolean,
    now: number,
    auto: { fromSec: number; origin: number } | null,
  ): void {
    AudioEngine.setGain(nodes.low.gain, track.eq.enabled ? track.eq.lowDb : 0, live, now);
    AudioEngine.setGain(nodes.mid.gain, track.eq.enabled ? track.eq.midDb : 0, live, now);
    AudioEngine.setGain(nodes.high.gain, track.eq.enabled ? track.eq.highDb : 0, live, now);
    const deess = track.deesser;
    const nyquist = Math.max(1000, ctx.sampleRate * 0.45);
    const split = deess?.enabled ? deess.frequency : nyquist;
    nodes.deessLow.frequency.value = split;
    nodes.deessHigh.frequency.value = deess?.frequency ?? 7000;
    nodes.deessComp.threshold.value = deess?.enabled ? deess.threshold : 0;
    nodes.deessComp.ratio.value = deess?.enabled ? Math.max(1, deess.ratio) : 1;
    AudioEngine.setGain(nodes.deessHighGain.gain, deess?.enabled ? 1 : 0, live, now);
    const compOn = track.compressor.enabled;
    nodes.comp.threshold.value = compOn ? track.compressor.threshold : 0;
    nodes.comp.ratio.value = compOn ? track.compressor.ratio : 1;
    nodes.comp.attack.value = track.compressor.attack;
    nodes.comp.release.value = track.compressor.release;
    AudioEngine.setGain(nodes.makeup.gain, compOn ? Gain.toLinear(track.compressor.makeupDb) : 1, live, now);
    const mix = track.reverb.enabled ? Math.max(0, Math.min(1, track.reverb.mix)) : 0;
    AudioEngine.setGain(nodes.dry.gain, 1, live, now);
    AudioEngine.setGain(nodes.wet.gain, mix, live, now);
    if (track.reverb.enabled) nodes.convolver.buffer = AudioEngine.impulse(ctx, track.reverb.decay);
    const spread = track.width ? Math.sign(track.pan || 1) * track.width * 0.12 : 0;
    const pan = Math.max(-1, Math.min(1, track.pan + (track.pan === 0 ? 0 : spread)));
    AudioEngine.setGain(nodes.panner.pan, pan, live, now);
    nodes.delay.delayTime.value = track.delay?.timeSec ?? 0.28;
    AudioEngine.setGain(nodes.delayFeedback.gain, track.delay?.enabled ? track.delay.feedback : 0, live, now);
    AudioEngine.setGain(nodes.delayWet.gain, track.delay?.enabled ? track.delay.mix : 0, live, now);
    AudioEngine.writeFader(nodes.fader.gain, project, track, live, now, auto);
  }

  private static applyBus(nodes: BusNodes, bus: Bus, live: boolean, now: number): void {
    AudioEngine.setGain(nodes.panner.pan, bus.pan, live, now);
    AudioEngine.setGain(nodes.fader.gain, bus.mute ? 0 : Gain.toLinear(bus.gainDb), live, now);
  }

  private static writeFader(
    param: AudioParam,
    project: Project,
    track: Track,
    live: boolean,
    now: number,
    auto: { fromSec: number; origin: number } | null,
  ): void {
    if (!ProjectOps.audible(project, track)) {
      AudioEngine.setGain(param, 0, live, now);
      return;
    }
    if (!auto || track.automation.length === 0) {
      AudioEngine.setGain(param, Gain.toLinear(track.gainDb), live, now);
      return;
    }
    const points = VolumeAutomation.ordered(track.automation);
    const origin = Math.max(now, auto.origin);
    param.cancelScheduledValues(origin);
    param.setValueAtTime(Gain.toLinear(VolumeAutomation.valueAt(points, auto.fromSec)), origin);
    for (const point of points) {
      if (point.timeSec <= auto.fromSec + 0.001) continue;
      param.linearRampToValueAtTime(
        Math.max(0, Gain.toLinear(point.gainDb)),
        origin + (point.timeSec - auto.fromSec),
      );
    }
  }

  private static level(
    analyser: AnalyserNode | null,
    cached: Float32Array<ArrayBuffer> | null,
    keep: (data: Float32Array<ArrayBuffer>) => void,
  ): number {
    if (!analyser) return 0;
    const size = analyser.fftSize;
    const data = cached && cached.length === size ? cached : new Float32Array(new ArrayBuffer(size * 4));
    keep(data);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
    return Math.min(1, Math.sqrt(sum / data.length) * 4);
  }

  private static applyMasterNodes(
    comp: DynamicsCompressorNode,
    makeup: GainNode,
    gain: GainNode,
    project: Project,
    live: boolean,
    now: number,
  ): void {
    const chain = MasterPresets.chain(project.masterPreset);
    comp.threshold.value = chain.threshold;
    comp.knee.value = chain.knee;
    comp.ratio.value = chain.ratio;
    comp.attack.value = chain.attack;
    comp.release.value = chain.release;
    AudioEngine.setGain(makeup.gain, Gain.toLinear(chain.makeupDb), live, now);
    AudioEngine.setGain(gain.gain, Gain.toLinear(project.masterGainDb), live, now);
  }

  private static setGain(param: AudioParam, value: number, live: boolean, now: number): void {
    if (!live) {
      param.value = value;
      return;
    }
    param.setTargetAtTime(value, now, 0.015);
  }

  private static impulse(ctx: BaseAudioContext, decay: number): AudioBuffer {
    const cache = AudioEngine.impulses.get(ctx) ?? new Map<string, AudioBuffer>();
    AudioEngine.impulses.set(ctx, cache);
    const key = decay.toFixed(2);
    const existing = cache.get(key);
    if (existing) return existing;
    const channels = Impulse.reverb(ctx.sampleRate, decay);
    const buffer = ctx.createBuffer(2, channels[0].length, ctx.sampleRate);
    buffer.copyToChannel(channels[0] as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(channels[1] as Float32Array<ArrayBuffer>, 1);
    cache.set(key, buffer);
    return buffer;
  }

  private static schedule(
    ctx: BaseAudioContext,
    project: Project,
    buffers: Map<string, AudioBuffer>,
    inputs: Map<string, GainNode>,
    fromSec: number,
    when: number,
  ): AudioBufferSourceNode[] {
    const sources: AudioBufferSourceNode[] = [];
    for (const track of project.tracks) {
      const input = inputs.get(track.id);
      if (!input) continue;
      for (const clip of track.clips) {
        const clipEnd = clip.startSec + clip.durationSec;
        if (clipEnd <= fromSec + 0.001) continue;
        const buffer = buffers.get(`${track.id}:${clip.id}`) ?? buffers.get(clip.bufferId);
        if (!buffer) continue;
        const offset = clip.offsetSec + Math.max(0, fromSec - clip.startSec);
        const delay = Math.max(0, clip.startSec - fromSec);
        const duration = clipEnd - Math.max(fromSec, clip.startSec);
        if (duration <= 0.001) continue;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(input);
        source.start(when + delay, Math.min(offset, Math.max(0, buffer.duration - 0.001)), duration);
        sources.push(source);
      }
    }
    return sources;
  }

  private schedule(
    ctx: BaseAudioContext,
    project: Project,
    buffers: Map<string, AudioBuffer>,
    inputs: Map<string, GainNode>,
    fromSec: number,
    when: number,
  ): void {
    this.sources = AudioEngine.schedule(ctx, project, buffers, inputs, fromSec, when);
  }

  private stopSources(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    this.sources = [];
  }

  private startMetronome(): void {
    this.stopMetronome();
    if (!this.ctx || !this.project?.metronome || !this.anchor) return;
    const beat = 60 / this.project.bpm;
    const from = this.clock() ?? this.anchor.fromSec;
    this.nextBeat = Math.max(0, Math.ceil((from - 0.001) / beat));
    const tick = () => {
      if (!this.ctx || !this.anchor || !this.project?.metronome) return;
      const horizon = this.ctx.currentTime + 0.16;
      const length = 60 / this.project.bpm;
      while (this.nextBeat < 100000) {
        const timeline = this.nextBeat * length;
        const when = this.anchor.contextTime + (timeline - this.anchor.fromSec);
        if (when > horizon) break;
        if (when >= this.ctx.currentTime - 0.02) this.click(when, this.nextBeat % 4 === 0);
        this.nextBeat += 1;
      }
    };
    tick();
    this.metroTimer = window.setInterval(tick, 25);
  }

  private stopMetronome(): void {
    if (this.metroTimer !== null) window.clearInterval(this.metroTimer);
    this.metroTimer = null;
  }

  private click(when: number, accent: boolean): void {
    if (!this.ctx || !this.clickGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1760 : 1175;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.15 : 0.07, when + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    osc.connect(gain);
    gain.connect(this.clickGain);
    osc.start(when);
    osc.stop(when + 0.06);
  }

  private async attachWorklet(ctx: AudioContext): Promise<void> {
    if (!this.mic || !this.sink) return;
    const url = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    this.worklet = new AudioWorkletNode(ctx, "sona-capture");
    this.worklet.port.onmessage = (event: MessageEvent<unknown>) => this.consumeMessage(event.data);
    (this.inputGain ?? this.mic).connect(this.worklet);
    this.worklet.connect(this.sink);
  }

  private attachProcessor(ctx: AudioContext): void {
    if (!this.mic || !this.sink) return;
    this.processor = ctx.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (event) => this.consume(event.inputBuffer.getChannelData(0));
    (this.inputGain ?? this.mic).connect(this.processor);
    this.processor.connect(this.sink);
  }

  private consumeMessage(data: unknown): void {
    if (data instanceof Float32Array) this.consume(data);
    else if (data instanceof ArrayBuffer) this.consume(new Float32Array(data));
  }

  setCaptureOpen(open: boolean): void {
    this.captureOpen = open;
  }

  setMonitor(enabled: boolean): void {
    this.monitorOn = enabled;
    if (this.sink) this.sink.gain.value = enabled ? 0.35 : 0;
  }

  setInputGain(db: number): void {
    this.inputGainDb = db;
    if (this.inputGain) this.inputGain.gain.value = Gain.toLinear(db);
  }

  private static stage(
    ctx: BaseAudioContext,
    project: Project,
    stored: Record<string, StoredBuffer>,
    into: Map<string, AudioBuffer>,
  ): void {
    for (const [id, item] of Object.entries(stored)) {
      if (!into.has(id)) into.set(id, AudioBuffers.toContext(ctx, item.channels, item.sampleRate));
    }
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        const raw = stored[clip.bufferId];
        if (!raw) continue;
        let staged = MicChain.render(raw, track.micId ?? "modern-condenser", track.preampId ?? "clean", track.micNudge ?? 0);
        if (track.tune?.enabled && track.tune.strength > 0) staged = SonaTune.correct(staged, track.tune);
        into.set(`${track.id}:${clip.id}`, AudioBuffers.toContext(ctx, staged.channels, staged.sampleRate));
      }
    }
  }

  private consume(input: Float32Array): void {
    if (!this.capturing || !this.captureOpen || input.length === 0) return;
    const copy = new Float32Array(input);
    this.chunks.push(copy);
    let offset = 0;
    while (offset < copy.length) {
      if (this.liveFill === 0) {
        this.liveMin.push(1);
        this.liveMax.push(-1);
      }
      const index = this.liveMin.length - 1;
      const take = Math.min(this.bucketSize - this.liveFill, copy.length - offset);
      let min = this.liveMin[index] ?? 1;
      let max = this.liveMax[index] ?? -1;
      for (let i = 0; i < take; i += 1) {
        const sample = copy[offset + i];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      this.liveMin[index] = min;
      this.liveMax[index] = max;
      this.liveFill += take;
      offset += take;
      if (this.liveFill >= this.bucketSize) this.liveFill = 0;
    }
  }
}
