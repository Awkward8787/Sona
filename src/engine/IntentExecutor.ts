import { CuePoint } from "../model/CuePoint";
import { Gain } from "../model/Gain";
import { Format } from "../model/Format";
import { ProjectFactory } from "../model/ProjectFactory";
import { ProjectOps } from "../model/ProjectOps";
import { ClipEdits } from "../model/ClipEdits";
import { TrackResolver } from "../model/TrackResolver";
import type { MasterPreset, Project, Track, Transport } from "../model/types";
import { EffectPresets, MasterPresets } from "./EffectPresets";
import { EngineerReplies } from "./EngineerReplies";
import type { EffectName, Intent, TrackRef, VolumeTarget } from "./Intent";

export type EngineEffect = "none" | "play" | "stop" | "record" | "export";

export interface SessionSnapshot {
  project: Project;
  transport: Transport;
  playheadSec: number;
}

export interface Execution {
  project: Project;
  transport: Transport;
  playheadSec: number;
  reply: string;
  effect: EngineEffect;
  mutate: boolean;
}

export class IntentExecutor {
  static execute(state: SessionSnapshot, intent: Intent): Execution {
    switch (intent.type) {
      case "record":
        return IntentExecutor.record(state, intent);
      case "stop":
        return IntentExecutor.stop(state);
      case "play":
        return IntentExecutor.play(state, intent.fromStart);
      case "seek":
        return IntentExecutor.seek(state, intent);
      case "arm":
        return IntentExecutor.arm(state, intent);
      case "disarm":
        return IntentExecutor.disarm(state, intent);
      case "select":
        return IntentExecutor.select(state, intent.track);
      case "addTrack":
        return IntentExecutor.addTrack(state, intent.name);
      case "renameTrack":
        return IntentExecutor.rename(state, intent.track, intent.name);
      case "deleteTrack":
        return IntentExecutor.deleteTrack(state, intent.track);
      case "volume":
        return IntentExecutor.volume(state, intent.target, intent.mode, intent.db);
      case "mute":
        return IntentExecutor.mute(state, intent.track, intent.muted);
      case "solo":
        return IntentExecutor.solo(state, intent.track, intent.solo);
      case "pan":
        return IntentExecutor.pan(state, intent.track, intent.value);
      case "addEffect":
        return IntentExecutor.addEffect(state, intent.track, intent.effect, intent.preset);
      case "removeEffect":
        return IntentExecutor.removeEffect(state, intent.track, intent.effect);
      case "trim":
        return IntentExecutor.trim(state, intent.edge, intent.seconds);
      case "split":
        return IntentExecutor.split(state);
      case "loop":
        return IntentExecutor.loop(state, intent);
      case "master":
        return IntentExecutor.master(state, intent.preset);
      case "export":
        return IntentExecutor.exportMix(state, intent.target);
      case "sessionStart":
      case "findMic":
      case "hearMics":
      case "chooseMic":
      case "toggleAudition":
      case "setMic":
      case "setPreamp":
      case "saveTake":
      case "deleteTake":
      case "compareTakes":
      case "compTakes":
      case "tune":
      case "mixAdjust":
      case "widenDoubles":
      case "commandWindow":
      case "recallMemory":
      case "importBeat":
      case "loadScratch":
      case "loadScratchVocal":
      case "micCheck":
      case "monitor":
      case "inputGain":
      case "rememberName":
      case "applyChain":
      case "analyze":
      case "fixVocal":
      case "clearProject":
        return IntentExecutor.extended(state, intent);
      case "setBpm":
        return IntentExecutor.setBpm(state, intent.bpm);
      case "metronome":
        return IntentExecutor.metronome(state, intent.enabled);
      case "setMarker":
        return IntentExecutor.setMarker(state, intent.marker);
      case "help":
        return IntentExecutor.hold(state, EngineerReplies.help());
      case "undo":
      case "redo":
        return IntentExecutor.hold(state, intent.type === "undo" ? "Undone." : "Redone.");
      case "unknown":
        return IntentExecutor.hold(state, EngineerReplies.unknown(intent.text));
      default: {
        const neverIntent: never = intent;
        return neverIntent;
      }
    }
  }

  private static record(state: SessionSnapshot, intent: Extract<Intent, { type: "record" }>): Execution {
    if (state.transport === "recording") return IntentExecutor.hold(state, "Already rolling.");
    let project = state.project;
    let armed = project.tracks.filter((track) => track.armed);
    let mutate = false;
    if (armed.length === 0) {
      const selected = project.tracks.find((track) => track.id === project.selectedTrackId) ?? project.tracks[0];
      if (!selected) return IntentExecutor.hold(state, "Add a track and I'll roll.");
      project = ProjectOps.updateTrack(project, selected.id, (track) => ({ ...track, armed: true }));
      armed = project.tracks.filter((track) => track.armed);
      mutate = true;
    }
    const playheadSec = intent.at ? CuePoint.seconds(project, intent.at) : state.playheadSec;
    const names = armed.map((track) => track.name).join(" and ");
    const reply = intent.at
      ? `Punching in at ${CuePoint.label(intent.at)}. Rolling on ${names}.`
      : mutate
        ? `Nothing was armed, so ${names} is armed. Rolling.`
        : `Rolling on ${names}.`;
    return {
      project,
      transport: "recording",
      playheadSec,
      reply,
      effect: "record",
      mutate,
    };
  }

  private static stop(state: SessionSnapshot): Execution {
    if (state.transport === "stopped") return IntentExecutor.hold(state, "We're stopped.", "stop");
    return {
      project: state.project,
      transport: "stopped",
      playheadSec: state.playheadSec,
      reply: "Stopped.",
      effect: "stop",
      mutate: false,
    };
  }

  private static play(state: SessionSnapshot, fromStart: boolean): Execution {
    if (state.transport === "recording") {
      return IntentExecutor.hold(state, "I'm recording. Say stop when the take is done.");
    }
    return {
      project: state.project,
      transport: "playing",
      playheadSec: fromStart ? 0 : state.playheadSec,
      reply: fromStart ? "Playing from the top." : "Playing.",
      effect: "play",
      mutate: false,
    };
  }

  private static seek(state: SessionSnapshot, intent: Extract<Intent, { type: "seek" }>): Execution {
    if (state.transport === "recording") {
      return IntentExecutor.hold(state, "I'm rolling. Stop first, then I'll move.");
    }
    const playheadSec = CuePoint.seconds(state.project, intent.cue);
    return {
      project: state.project,
      transport: state.transport,
      playheadSec,
      reply: `At ${CuePoint.label(intent.cue)}.`,
      effect: state.transport === "playing" ? "play" : "none",
      mutate: false,
    };
  }

  private static arm(state: SessionSnapshot, intent: Extract<Intent, { type: "arm" }>): Execution {
    const resolved = TrackResolver.resolve(state.project, intent.track);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    const tracks = state.project.tracks.map((track) => ({
      ...track,
      armed: intent.exclusive ? track.id === resolved.track.id : track.armed || track.id === resolved.track.id,
    }));
    const changed = tracks.some((track, index) => track.armed !== state.project.tracks[index].armed);
    const project = ProjectOps.touch(state.project, { tracks, selectedTrackId: resolved.track.id });
    if (!changed && state.project.selectedTrackId === resolved.track.id) {
      return IntentExecutor.hold(state, `${resolved.track.name} is already armed.`);
    }
    const reply = intent.exclusive ? `Armed ${resolved.track.name}.` : `${resolved.track.name} is armed too.`;
    return IntentExecutor.changed(state, project, reply);
  }

  private static disarm(state: SessionSnapshot, intent: Extract<Intent, { type: "disarm" }>): Execution {
    if (intent.track === "all") {
      if (!state.project.tracks.some((track) => track.armed)) return IntentExecutor.hold(state, "Nothing is armed.");
      const tracks = state.project.tracks.map((track) => ({ ...track, armed: false }));
      return IntentExecutor.changed(state, ProjectOps.touch(state.project, { tracks }), "All tracks disarmed. Arm one before you roll.");
    }
    const resolved = TrackResolver.resolve(state.project, intent.track);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    if (!resolved.track.armed) return IntentExecutor.hold(state, `${resolved.track.name} is already disarmed.`);
    const project = ProjectOps.updateTrack(state.project, resolved.track.id, (track) => ({ ...track, armed: false }));
    return IntentExecutor.changed(state, project, `${resolved.track.name} is disarmed.`);
  }

  private static select(state: SessionSnapshot, ref: TrackRef): Execution {
    const resolved = TrackResolver.resolve(state.project, ref);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    const project = { ...state.project, selectedTrackId: resolved.track.id };
    return {
      project,
      transport: state.transport,
      playheadSec: state.playheadSec,
      reply: `${resolved.track.name} is selected.`,
      effect: "none",
      mutate: false,
    };
  }

  private static addTrack(state: SessionSnapshot, name: string | null): Execution {
    if (state.project.tracks.length >= ProjectFactory.MAX_TRACKS) {
      return IntentExecutor.hold(state, "That's as many tracks as this session holds.");
    }
    const label = (name ?? `Track ${state.project.tracks.length + 1}`).trim().slice(0, 40);
    if (!label) return IntentExecutor.hold(state, "Give the track a name and I'll add it.");
    if (state.project.tracks.some((track) => track.name.toLowerCase() === label.toLowerCase())) {
      return IntentExecutor.hold(state, `There's already a track named ${label}.`);
    }
    const track = ProjectFactory.track(label, state.project.tracks.length);
    const project = ProjectOps.touch(state.project, {
      tracks: [...state.project.tracks, track],
      selectedTrackId: track.id,
    });
    return IntentExecutor.changed(state, project, `Added ${label}.`);
  }

  private static rename(state: SessionSnapshot, ref: TrackRef, name: string): Execution {
    const resolved = TrackResolver.resolve(state.project, ref);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    const label = name.trim().slice(0, 40);
    if (!label) return IntentExecutor.hold(state, "I need a name for that track.");
    if (state.project.tracks.some((track) => track.id !== resolved.track.id && track.name.toLowerCase() === label.toLowerCase())) {
      return IntentExecutor.hold(state, `There's already a track named ${label}.`);
    }
    if (resolved.track.name === label) return IntentExecutor.hold(state, `${label} already has that name.`);
    const project = ProjectOps.updateTrack(state.project, resolved.track.id, (track) => ({ ...track, name: label }));
    return IntentExecutor.changed(state, project, `Renamed ${resolved.track.name} to ${label}.`);
  }

  private static deleteTrack(state: SessionSnapshot, ref: TrackRef): Execution {
    if (state.transport === "recording") return IntentExecutor.hold(state, "Stop the take before we pull a track.");
    const resolved = TrackResolver.resolve(state.project, ref);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    if (state.project.tracks.length === 1) return IntentExecutor.hold(state, "I need at least one track in the session.");
    const index = state.project.tracks.findIndex((track) => track.id === resolved.track.id);
    const tracks = state.project.tracks.filter((track) => track.id !== resolved.track.id);
    const selected = tracks[Math.max(0, index - 1)] ?? tracks[0];
    const project = ProjectOps.touch(state.project, {
      tracks,
      selectedTrackId: state.project.selectedTrackId === resolved.track.id ? selected.id : state.project.selectedTrackId,
      selectedClipId: null,
    });
    return IntentExecutor.changed(state, project, `Removed ${resolved.track.name}.`);
  }

  private static volume(state: SessionSnapshot, target: VolumeTarget, mode: "relative" | "absolute", db: number): Execution {
    if (target.kind === "master") {
      const current = state.project.masterGainDb;
      const requested = mode === "absolute" ? db : current + db;
      const next = Gain.clampMaster(requested);
      if (next === current) return IntentExecutor.hold(state, `The master is already at ${Gain.format(current)}.`);
      const project = ProjectOps.touch(state.project, { masterGainDb: next });
      const limited = next !== requested;
      const reply = limited
        ? `The master only goes to ${Gain.format(next)}. It's there.`
        : `Master is at ${Gain.format(next)}.`;
      return IntentExecutor.changed(state, project, reply);
    }
    const resolved = TrackResolver.resolve(state.project, target);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    const current = resolved.track.gainDb;
    const requested = mode === "absolute" ? db : current + db;
    const next = Gain.clamp(requested);
    if (next === current) return IntentExecutor.hold(state, `${resolved.track.name} is already at ${Gain.format(current)}.`);
    const project = ProjectOps.updateTrack(state.project, resolved.track.id, (track) => ({ ...track, gainDb: next }));
    const verb = next > current ? "up" : "down";
    const reply = next !== requested
      ? `${resolved.track.name} only goes to ${Gain.format(next)}. It's there.`
      : mode === "absolute"
        ? `${resolved.track.name} is at ${Gain.format(next)}.`
        : `${resolved.track.name} is ${verb} ${Gain.format(Math.abs(next - current))}, now at ${Gain.format(next)}.`;
    return IntentExecutor.changed(state, project, reply);
  }

  private static mute(state: SessionSnapshot, ref: TrackRef, muted: boolean | "toggle"): Execution {
    const resolved = TrackResolver.resolve(state.project, ref);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    const next = muted === "toggle" ? !resolved.track.mute : muted;
    if (next === resolved.track.mute) {
      return IntentExecutor.hold(state, next ? `${resolved.track.name} is already muted.` : `${resolved.track.name} is already open.`);
    }
    const project = ProjectOps.updateTrack(state.project, resolved.track.id, (track) => ({ ...track, mute: next }));
    return IntentExecutor.changed(state, project, next ? `Muted ${resolved.track.name}.` : `${resolved.track.name} is open.`);
  }

  private static solo(state: SessionSnapshot, ref: TrackRef, solo: boolean | "toggle"): Execution {
    const resolved = TrackResolver.resolve(state.project, ref);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    const next = solo === "toggle" ? !resolved.track.solo : solo;
    if (next === resolved.track.solo) {
      return IntentExecutor.hold(state, next ? `${resolved.track.name} is already soloed.` : `${resolved.track.name} is already out of solo.`);
    }
    const project = ProjectOps.updateTrack(state.project, resolved.track.id, (track) => ({ ...track, solo: next }));
    return IntentExecutor.changed(state, project, next ? `Soloed ${resolved.track.name}.` : `${resolved.track.name} is out of solo.`);
  }

  private static pan(state: SessionSnapshot, ref: TrackRef, value: number): Execution {
    const resolved = TrackResolver.resolve(state.project, ref);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    const pan = Math.max(-1, Math.min(1, value));
    if (Math.abs(pan - resolved.track.pan) < 0.001) {
      return IntentExecutor.hold(state, `${resolved.track.name} is already ${EngineerReplies.pan(pan)}.`);
    }
    const project = ProjectOps.updateTrack(state.project, resolved.track.id, (track) => ({ ...track, pan }));
    return IntentExecutor.changed(state, project, `Panned ${resolved.track.name} ${EngineerReplies.pan(pan)}.`);
  }

  private static addEffect(state: SessionSnapshot, ref: TrackRef, effect: EffectName, preset: string): Execution {
    const resolved = TrackResolver.resolve(state.project, ref);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    const project = ProjectOps.updateTrack(state.project, resolved.track.id, (track) => IntentExecutor.withEffect(track, effect, preset));
    const applied = IntentExecutor.effectLabel(project.tracks.find((track) => track.id === resolved.track.id) as Track, effect);
    const already = IntentExecutor.effectLabel(resolved.track, effect);
    if (already.enabled && already.preset === applied.preset) {
      return IntentExecutor.hold(state, `${IntentExecutor.pretty(applied.preset, effect)} is already on ${resolved.track.name}.`);
    }
    return IntentExecutor.changed(state, project, `${IntentExecutor.pretty(applied.preset, effect)} is on ${resolved.track.name}.`);
  }

  private static removeEffect(state: SessionSnapshot, ref: TrackRef, effect: EffectName): Execution {
    const resolved = TrackResolver.resolve(state.project, ref);
    if (!resolved.ok) return IntentExecutor.hold(state, resolved.reason);
    if (!IntentExecutor.effectLabel(resolved.track, effect).enabled) {
      return IntentExecutor.hold(state, `${IntentExecutor.effectNoun(effect)} is already off ${resolved.track.name}.`);
    }
    const project = ProjectOps.updateTrack(state.project, resolved.track.id, (track) => {
      if (effect === "eq") return { ...track, eq: { ...track.eq, enabled: false } };
      if (effect === "reverb") return { ...track, reverb: { ...track.reverb, enabled: false } };
      return { ...track, compressor: { ...track.compressor, enabled: false } };
    });
    return IntentExecutor.changed(state, project, `${IntentExecutor.effectNoun(effect)} is off ${resolved.track.name}.`);
  }

  private static trim(state: SessionSnapshot, edge: "start" | "end" | "auto", seconds: number | null): Execution {
    if (state.transport === "recording") return IntentExecutor.hold(state, "Stop the take before we trim.");
    const found = ProjectOps.findClip(state.project, state.playheadSec);
    if (!found) return IntentExecutor.hold(state, "Move the playhead into a clip and I'll trim it.");
    const edited = ProjectOps.applyTrim(state.project, state.playheadSec, edge, seconds);
    if (!edited || Math.abs(edited.clip.durationSec - found.clip.durationSec) < 0.001) {
      return IntentExecutor.hold(state, "That trim doesn't leave a clip. Move the playhead inside it.");
    }
    const where = edge === "start" ? "start" : edge === "end" ? "end" : "edge";
    const reply = seconds !== null
      ? `Took ${seconds} ${seconds === 1 ? "second" : "seconds"} off the ${where} of ${found.track.name}.`
      : `Trimmed the ${where} of ${found.track.name}.`;
    return IntentExecutor.changed(state, edited.project, reply);
  }

  private static split(state: SessionSnapshot): Execution {
    if (state.transport === "recording") return IntentExecutor.hold(state, "Stop the take before we cut.");
    const found = ProjectOps.findClip(state.project, state.playheadSec);
    if (!found) return IntentExecutor.hold(state, "Move the playhead into a clip and I'll cut it.");
    const parts = ClipEdits.split(found.clip, state.playheadSec);
    if (!parts) return IntentExecutor.hold(state, "The playhead is on the edge. Move into the clip.");
    const project = ProjectOps.replaceClip(state.project, found.clip.id, parts[0], parts[1]);
    return IntentExecutor.changed(state, project, `Split ${found.track.name} at ${Format.time(state.playheadSec)}.`);
  }

  private static loop(state: SessionSnapshot, intent: Extract<Intent, { type: "loop" }>): Execution {
    if (intent.mode === "clear") {
      if (!state.project.loop) return IntentExecutor.hold(state, "Nothing is looping.");
      return IntentExecutor.changed(state, ProjectOps.touch(state.project, { loop: null }), "Loop is clear.");
    }
    let startSec = 0;
    let endSec = 0;
    if (intent.mode === "bars") {
      if (intent.bars < 1 || intent.bars > 64) return IntentExecutor.hold(state, "Ask me for between 1 and 64 bars.");
      const bar = CuePoint.barSeconds(state.project.bpm);
      startSec = Math.floor(state.playheadSec / bar) * bar;
      endSec = startSec + intent.bars * bar;
    } else if (intent.mode === "range") {
      startSec = Math.max(0, intent.startSec);
      endSec = intent.endSec;
      if (endSec <= startSec) return IntentExecutor.hold(state, "The loop end has to come after the start.");
    } else {
      const span = CuePoint.markerSpan(state.project, intent.marker);
      startSec = span.startSec;
      endSec = span.endSec;
    }
    const project = ProjectOps.touch(state.project, { loop: { startSec, endSec } });
    const reply = intent.mode === "bars"
      ? `Looping ${intent.bars} ${intent.bars === 1 ? "bar" : "bars"}.`
      : intent.mode === "marker"
        ? `Looping the ${intent.marker}.`
        : `Looping from ${Format.time(startSec)} to ${Format.time(endSec)}.`;
    return IntentExecutor.changed(state, project, reply);
  }

  private static master(state: SessionSnapshot, preset: MasterPreset | "louder" | "quieter"): Execution {
    const next = MasterPresets.resolve(preset);
    if (state.project.masterPreset === next) {
      return IntentExecutor.hold(state, `The master is already on the ${next} preset.`);
    }
    const project = ProjectOps.touch(state.project, { masterPreset: next });
    return IntentExecutor.changed(state, project, MasterPresets.label(next));
  }

  private static exportMix(state: SessionSnapshot, target: "master" | "stems" = "master"): Execution {
    if (state.transport === "recording") return IntentExecutor.hold(state, "Stop the take, then I'll bounce.");
    if (!ProjectOps.hasAudio(state.project)) return IntentExecutor.hold(state, "Nothing to bounce yet. Record a pass first.");
    return {
      project: state.project,
      transport: state.transport,
      playheadSec: state.playheadSec,
      reply: target === "stems" ? "Bouncing a WAV for each track." : "Bouncing the mix.",
      effect: "export",
      mutate: false,
    };
  }

  private static extended(state: SessionSnapshot, intent: Intent): Execution {
    return IntentExecutor.hold(state, `${intent.type} runs through the command log.`);
  }

  private static setBpm(state: SessionSnapshot, bpm: number): Execution {
    if (bpm < 40 || bpm > 240) return IntentExecutor.hold(state, "Tempo stays between 40 and 240.");
    if (state.project.bpm === bpm) return IntentExecutor.hold(state, `Tempo is already ${bpm}.`);
    return IntentExecutor.changed(state, ProjectOps.touch(state.project, { bpm }), `Tempo is ${bpm}.`);
  }

  private static metronome(state: SessionSnapshot, enabled: boolean | "toggle"): Execution {
    const next = enabled === "toggle" ? !state.project.metronome : enabled;
    if (next === state.project.metronome) return IntentExecutor.hold(state, next ? "The click is already on." : "The click is already off.");
    return IntentExecutor.changed(state, ProjectOps.touch(state.project, { metronome: next }), next ? "Click is on." : "Click is off.");
  }

  private static setMarker(state: SessionSnapshot, marker: Extract<Intent, { type: "setMarker" }>["marker"]): Execution {
    const markers = { ...state.project.markers, [marker]: state.playheadSec };
    const project = ProjectOps.touch(state.project, { markers });
    const label = marker.charAt(0).toUpperCase() + marker.slice(1);
    return IntentExecutor.changed(state, project, `${label} is marked at ${Format.time(state.playheadSec)}.`);
  }

  private static withEffect(track: Track, effect: EffectName, preset: string): Track {
    if (effect === "eq") return { ...track, eq: EffectPresets.eq(preset) };
    if (effect === "reverb") return { ...track, reverb: EffectPresets.reverb(preset) };
    return { ...track, compressor: EffectPresets.compressor(preset) };
  }

  private static effectLabel(track: Track, effect: EffectName): { enabled: boolean; preset: string } {
    if (effect === "eq") return track.eq;
    if (effect === "reverb") return track.reverb;
    return track.compressor;
  }

  private static effectNoun(effect: EffectName): string {
    if (effect === "eq") return "EQ";
    if (effect === "reverb") return "Reverb";
    return "Compression";
  }

  private static pretty(preset: string, effect: EffectName): string {
    const name = preset.charAt(0).toUpperCase() + preset.slice(1);
    if (effect === "eq") return `${name} EQ`;
    if (effect === "reverb") return `${name} reverb`;
    return `${name} compression`;
  }

  private static hold(state: SessionSnapshot, reply: string, effect: EngineEffect = "none"): Execution {
    return {
      project: state.project,
      transport: state.transport,
      playheadSec: state.playheadSec,
      reply,
      effect,
      mutate: false,
    };
  }

  private static changed(state: SessionSnapshot, project: Project, reply: string): Execution {
    return {
      project,
      transport: state.transport,
      playheadSec: state.playheadSec,
      reply,
      effect: "none",
      mutate: true,
    };
  }
}
