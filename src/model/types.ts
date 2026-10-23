export type MasterPreset = "off" | "broadcast" | "streaming" | "loud";

export type MarkerName = "intro" | "verse" | "chorus" | "bridge";

export type Transport = "stopped" | "playing" | "recording";

export type StudioMode = "artist" | "creator" | "engineer";

/** Original SONA virtual microphones. Branded models are not in this union. */
export type VirtualMicId = "warm-tube" | "modern-condenser" | "smooth-vintage" | "bright-presence";

/** SONA preamp stage, separate from the mic model and from the hardware preamp. */
export type PreampId = "clean" | "warm" | "smooth" | "air";

export interface LyricWord {
  text: string;
  startSec: number;
  endSec: number;
}

export interface Take {
  id: string;
  number: number;
  /** Points at the unmodified capture. Mic and preamp never rewrite this buffer. */
  rawBufferId: string;
  startSec: number;
  durationSec: number;
  words: LyricWord[];
  micId: VirtualMicId;
  preampId: PreampId;
}

export interface TuneSettings {
  enabled: boolean;
  strength: number;
  key: string;
  scale: "major" | "minor";
}

export interface DelaySettings {
  enabled: boolean;
  mix: number;
  timeSec: number;
  feedback: number;
}

export interface EqSettings {
  enabled: boolean;
  preset: string;
  lowDb: number;
  midDb: number;
  highDb: number;
}

export interface CompressorSettings {
  enabled: boolean;
  preset: string;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  makeupDb: number;
}

export interface ReverbSettings {
  enabled: boolean;
  preset: string;
  mix: number;
  decay: number;
}

/** Split-band de-esser. The high band is compressed; the raw take is not rewritten. */
export interface DeesserSettings {
  enabled: boolean;
  frequency: number;
  threshold: number;
  ratio: number;
}

export interface AutomationPoint {
  id: string;
  timeSec: number;
  gainDb: number;
}

export type BusKind = "group" | "reverb" | "delay";

export interface Bus {
  id: string;
  name: string;
  kind: BusKind;
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export interface Clip {
  id: string;
  bufferId: string;
  startSec: number;
  offsetSec: number;
  durationSec: number;
  sourceDurationSec: number;
}

export interface Track {
  id: string;
  name: string;
  color: string;
  armed: boolean;
  mute: boolean;
  solo: boolean;
  gainDb: number;
  pan: number;
  /** Stereo spread for doubles. 0 is unchanged. Playback only — raw audio stays put. */
  width: number;
  clips: Clip[];
  eq: EqSettings;
  compressor: CompressorSettings;
  reverb: ReverbSettings;
  /** Nondestructive SONA mic stage. Playback renders from the raw clip buffer. */
  micId: VirtualMicId;
  /** Nondestructive SONA preamp stage, after the mic model and before the vocal chain. */
  preampId: PreampId;
  /** Extra color when a relative move ("warmer") is already on that model. */
  micNudge: number;
  takes: Take[];
  tune: TuneSettings;
  delay: DelaySettings;
  /** Group bus this track sums into. Reverb and delay are sends, not this id. */
  busId: string;
  deesser: DeesserSettings;
  /** Absolute volume points. While playing they replace the static fader. */
  automation: AutomationPoint[];
}

export interface Markers {
  intro: number;
  verse: number;
  chorus: number;
  bridge: number;
}

export interface LoopRegion {
  startSec: number;
  endSec: number;
}

export interface Project {
  id: string;
  name: string;
  bpm: number;
  metronome: boolean;
  tracks: Track[];
  selectedTrackId: string | null;
  selectedClipId: string | null;
  masterPreset: MasterPreset;
  masterGainDb: number;
  loop: LoopRegion | null;
  /** Record only inside this span when it is set. Null records from the playhead. */
  punch: LoopRegion | null;
  markers: Markers;
  buses: Bus[];
  createdAt: number;
  updatedAt: number;
}

export interface StoredBuffer {
  id: string;
  sampleRate: number;
  channels: Float32Array[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "engineer";
  text: string;
  at: number;
}
