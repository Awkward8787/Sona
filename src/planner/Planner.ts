import type { EarNote } from "../ears/SonaEars";
import { command, type DawCommand } from "../daw/DawCommand";
import { IntentParser } from "../engine/IntentParser";
import type { Cue, Intent, TrackRef, VolumeTarget } from "../engine/Intent";
import type { ArtistProfile } from "../memory/SonaMemory";
import type { Project } from "../model/types";

export interface PlanContext {
  /** Read only. The planner must not write to this object. */
  project: Project;
  profile: ArtistProfile;
  ears: EarNote[];
}

export interface Plan {
  commands: DawCommand[];
  clarify: string | null;
}

export interface Planner {
  plan(text: string, context: PlanContext): Plan;
}

/**
 * Pure data. Planning never changes the session.
 * An LLM can implement Planner later; this one does not call a network.
 */
export class DeterministicPlanner implements Planner {
  plan(text: string, context: PlanContext): Plan {
    const clauses = DeterministicPlanner.clauses(text);
    if (clauses.length === 1) return this.one(text, context);
    const commands: DawCommand[] = [];
    for (const clause of clauses) {
      const piece = this.one(clause, context);
      if (piece.clarify && piece.commands.length === 0) return piece;
      commands.push(...piece.commands);
    }
    return { commands, clarify: null };
  }

  private one(text: string, context: PlanContext): Plan {
    const normalized = IntentParser.normalize(text);
    const intent = IntentParser.parse(text);
    if (intent.type === "unknown") {
      return { commands: [], clarify: null };
    }
    if (intent.type === "fixVocal") return DeterministicPlanner.fix(normalized, context);
    if (intent.type === "recallMemory") return { commands: DeterministicPlanner.recall(context), clarify: null };
    if (intent.type === "applyChain") return { commands: DeterministicPlanner.chain(context), clarify: null };
    if (intent.type === "master" && /^(?:master|master it|master the mix|master this)$/.test(normalized)) {
      return { commands: [command("master", "master", context.profile.loudnessTarget)], clarify: null };
    }
    if (intent.type === "addEffect" && intent.presetSpecified !== true) {
      const preset = DeterministicPlanner.chainPreset(intent.effect, context.profile);
      return { commands: [command(DeterministicPlanner.track(intent.track, context.project), "effect", `${intent.effect}:${preset}`)], clarify: null };
    }
    const commands = DeterministicPlanner.intentCommands(intent, context);
    return { commands, clarify: null };
  }

  private static clauses(text: string): string[] {
    const normalized = IntentParser.normalize(text);
    const parts = normalized.split(/\s+(?:and then|then|and)\s+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return [text];
    if (parts.every((part) => IntentParser.parse(part).type !== "unknown")) return parts;
    return [text];
  }

  private static fix(normalized: string, context: PlanContext): Plan {
    if (context.ears.length === 0) {
      return { commands: [], clarify: "Fix what — level, harshness, or mud?" };
    }
    if (context.ears.length > 1 && /^(?:fix it|fix that)$/.test(normalized)) {
      const list = context.ears.map((note) => note.summary).join(" ");
      return { commands: [], clarify: `I hear a few things. ${list} Say which one.` };
    }
    const note = context.ears[0];
    if (!note) return { commands: [], clarify: "Fix what — level, harshness, or mud?" };
    const mapped = DeterministicPlanner.fixCommand(note, context);
    return mapped ? { commands: [mapped], clarify: null } : { commands: [], clarify: note.offer };
  }

  private static fixCommand(note: EarNote, context: PlanContext): DawCommand | null {
    const track = DeterministicPlanner.selected(context.project);
    if (note.id === "clipping") return command(track, "gain", -3);
    if (note.id === "quiet") return command(track, "gain", 3);
    if (note.id === "sibilance") return command(track, "deesser", "on");
    if (note.id === "mud") return command(track, "mix", "mud");
    if (note.id === "noise") return command(track, "gain", -2);
    if (note.id === "timing") return command("session", "metronome", "on");
    return null;
  }

  private static recall(context: PlanContext): DawCommand[] {
    const track = DeterministicPlanner.selected(context.project);
    const commands: DawCommand[] = [];
    if (context.profile.preferredMicId) commands.push(command(track, "mic", context.profile.preferredMicId));
    commands.push(...DeterministicPlanner.chain(context));
    commands.push(command("master", "master", context.profile.loudnessTarget));
    commands.push(command(track, "tune-strength", context.profile.tuneStrength));
    return commands;
  }

  private static chain(context: PlanContext): DawCommand[] {
    const track = DeterministicPlanner.selected(context.project);
    const chain = context.profile.preferredVocalChain;
    return [
      command(track, "effect", `eq:${chain.eq}`),
      command(track, "effect", `compressor:${chain.compressor}`),
      command(track, "effect", `reverb:${chain.reverb}`),
    ];
  }

  private static chainPreset(effect: "eq" | "compressor" | "reverb", profile: ArtistProfile): string {
    if (effect === "eq") return profile.preferredVocalChain.eq;
    if (effect === "compressor") return profile.preferredVocalChain.compressor;
    return profile.reverbTaste || profile.preferredVocalChain.reverb;
  }

  private static intentCommands(intent: Intent, context: PlanContext): DawCommand[] {
    const project = context.project;
    switch (intent.type) {
      case "volume":
        return [command(DeterministicPlanner.volumeTrack(intent.target, project), intent.mode === "absolute" ? "gain-set" : "gain", intent.db)];
      case "pan":
        return [command(DeterministicPlanner.track(intent.track, project), "pan", intent.value)];
      case "mute":
        return [command(DeterministicPlanner.track(intent.track, project), "mute", String(intent.muted))];
      case "solo":
        return [command(DeterministicPlanner.track(intent.track, project), "solo", String(intent.solo))];
      case "arm":
        return [command(DeterministicPlanner.track(intent.track, project), "arm", intent.exclusive ? "exclusive" : "add")];
      case "select":
        return [command(DeterministicPlanner.track(intent.track, project), "select", null)];
      case "disarm":
        return [command(intent.track === "all" ? "all" : DeterministicPlanner.track(intent.track, project), "disarm", null)];
      case "record":
        if (intent.at?.kind === "lyric") return [command(DeterministicPlanner.selected(project), "punch", intent.at.text)];
        return [command(DeterministicPlanner.selected(project), "record", intent.at ? DeterministicPlanner.cueAmount(intent.at) : null)];
      case "stop":
        return [command("transport", "stop", null)];
      case "play":
        return [command("transport", "play", intent.fromStart ? "top" : null)];
      case "seek":
        return [command("transport", "seek", DeterministicPlanner.cueAmount(intent.cue))];
      case "addTrack":
        return [command("session", "add-track", intent.name)];
      case "renameTrack":
        return [command(DeterministicPlanner.track(intent.track, project), "rename", intent.name)];
      case "deleteTrack":
        return [command(DeterministicPlanner.track(intent.track, project), "delete-track", null)];
      case "addEffect":
        return [command(DeterministicPlanner.track(intent.track, project), "effect", `${intent.effect}:${intent.preset}`)];
      case "removeEffect":
        return [command(DeterministicPlanner.track(intent.track, project), "remove-effect", intent.effect)];
      case "trim":
        return [command(DeterministicPlanner.selected(project), "trim", `${intent.edge}:${intent.seconds ?? ""}`)];
      case "split":
        return [command(DeterministicPlanner.selected(project), "split", null)];
      case "loop":
        return [command("transport", "loop", intent.mode === "bars" ? intent.bars : intent.mode)];
      case "master":
        return [command("master", "master", intent.preset)];
      case "export":
        return [command("master", "export", intent.target)];
      case "setBpm":
        return [command("session", "bpm", intent.bpm)];
      case "metronome":
        return [command("session", "metronome", String(intent.enabled))];
      case "setMarker":
        return [command("session", "marker", intent.marker)];
      case "sessionStart":
        return [command("session", "session", "on")];
      case "findMic":
        return [command("session", "find-mic", null)];
      case "hearMics":
        return [command("sample", "audition", `${intent.ranks[0]},${intent.ranks[1]}`)];
      case "chooseMic":
        return [command("session", "choose-mic", intent.rank)];
      case "toggleAudition":
        return [command("sample", "toggle-audition", null)];
      case "setMic":
        return [command(DeterministicPlanner.selected(project), intent.mic ? "mic" : "mic-move", intent.mic ?? intent.move)];
      case "setPreamp":
        return [command(DeterministicPlanner.selected(project), "preamp", intent.preamp)];
      case "widenDoubles":
        return [command("doubles", "widen", 0.8)];
      case "mixAdjust":
        return [command(DeterministicPlanner.selected(project), "mix", intent.axis)];
      case "tune":
        if (intent.key) return [command(DeterministicPlanner.selected(project), "tune-key", `${intent.key} ${intent.scale ?? "major"}`)];
        if (intent.tighter === true) return [command(DeterministicPlanner.selected(project), "tune", "tighter")];
        if (intent.tighter === false) return [command(DeterministicPlanner.selected(project), "tune", "less")];
        return [command(DeterministicPlanner.selected(project), "tune", "on")];
      case "analyze":
        return [command(DeterministicPlanner.selected(project), "analyze", null)];
      case "loadScratch":
        return [command("beat", "scratch-beat", null)];
      case "loadScratchVocal":
        return [command("vocal", "scratch-vocal", null)];
      case "importBeat":
        return [command("beat", "import-beat", null)];
      case "compTakes":
        return [command(DeterministicPlanner.selected(project), "comp", intent.assignments.map((item) => `${item.take}:${item.marker}`).join(","))];
      case "saveTake":
        return [command(DeterministicPlanner.selected(project), "save-take", null)];
      case "deleteTake":
        return [command(DeterministicPlanner.selected(project), "delete-take", intent.number)];
      case "compareTakes":
        return [command(DeterministicPlanner.selected(project), "compare-takes", `${intent.a},${intent.b}`)];
      case "clearProject":
        return [command("session", "clear", null)];
      case "commandWindow":
        return [command("session", "command-window", intent.open ? "open" : "closed")];
      case "inputGain":
        return [command("input", "input-gain", intent.db)];
      case "monitor":
        return [command("input", "monitor", intent.enabled ? "on" : "off")];
      case "rememberName":
        return [command("session", "remember-name", intent.name)];
      case "micCheck":
        return [command("input", "mic-check", null)];
      case "help":
        return [command("session", "help", null)];
      case "undo":
        return [command("session", "undo", null)];
      case "redo":
        return [command("session", "redo", null)];
      case "fixVocal":
      case "recallMemory":
      case "applyChain":
      case "unknown":
        return [];
      default: {
        const neverIntent: never = intent;
        return neverIntent;
      }
    }
  }

  private static track(ref: TrackRef, project: Project): string {
    if (ref.kind === "selected") return DeterministicPlanner.selected(project);
    if (ref.kind === "index") return project.tracks[ref.index - 1]?.name ?? `track ${ref.index}`;
    return ref.name;
  }

  private static volumeTrack(target: VolumeTarget, project: Project): string {
    if (target.kind === "master") return "master";
    return DeterministicPlanner.track(target, project);
  }

  private static selected(project: Project): string {
    return project.tracks.find((track) => track.id === project.selectedTrackId)?.name ?? project.tracks[0]?.name ?? "session";
  }

  private static cueAmount(cue: Cue): string {
    if (cue.kind === "start") return "start";
    if (cue.kind === "marker") return cue.marker;
    if (cue.kind === "bar") return `bar ${cue.bar}`;
    if (cue.kind === "seconds") return `${cue.seconds}s`;
    return cue.text;
  }
}
