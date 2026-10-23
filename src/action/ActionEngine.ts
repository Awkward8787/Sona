import { Ids } from "../model/Ids";
import { ProjectFactory } from "../model/ProjectFactory";
import type { EngineEffect, Execution } from "../engine/IntentExecutor";
import { IntentExecutor } from "../engine/IntentExecutor";
import { EngineerReplies } from "../engine/EngineerReplies";
import type { EffectName, Intent } from "../engine/Intent";
import { command, type CommandLogEntry, type DawCommand } from "../daw/DawCommand";
import type { ArtistProfile } from "../memory/SonaMemory";
import { SonaMemory } from "../memory/SonaMemory";
import { Session, type SessionState } from "../session/Session";
import { ProjectCommands } from "./ProjectCommands";
import { ScratchBeat } from "../record/ScratchBeat";
import { SonaEars } from "../ears/SonaEars";
import { FindMyMic, type RankedMic } from "../mic/FindMyMic";
import { MicChain } from "../mic/MicChain";
import { MicAudition, type MicAuditionState } from "../mic/MicAudition";
import type { MixAxis } from "../engine/Intent";
import type { LyricWord, MarkerName, PreampId, Project, StoredBuffer, VirtualMicId } from "../model/types";
import { ProjectOps } from "../model/ProjectOps";

export interface ActionEnv {
  ranking: RankedMic[] | null;
  sampleBufferId: string | null;
  audition: MicAuditionState | null;
}

export interface ActionResult {
  session: SessionState;
  profile: ArtistProfile;
  log: CommandLogEntry[];
  future: CommandLogEntry[];
  reply: string;
  effect: EngineEffect | "import" | "findMic";
  exportTarget: "master" | "stems" | null;
  commandsWhileRecording: boolean | null;
  audition: MicAuditionState | null;
  monitor: boolean | null;
  inputGainDb: number | null;
}

/**
 * The only writer. Brain and Planner hand it DawCommand values.
 * Each command is stored with an inverse and a snapshot so undo restores that state exactly.
 */
export class ActionEngine {
  static run(
    session: SessionState,
    profile: ArtistProfile,
    log: CommandLogEntry[],
    future: CommandLogEntry[],
    commands: DawCommand[],
    env: ActionEnv,
    keepFuture = false,
  ): ActionResult {
    let nextSession = session;
    let nextProfile = profile;
    let nextLog = log;
    let reply = "";
    let effect: ActionResult["effect"] = "none";
    let exportTarget: ActionResult["exportTarget"] = null;
    let commandsWhileRecording: boolean | null = null;
    let audition = env.audition;
    let monitor: boolean | null = null;
    let inputGainDb: number | null = null;

    for (const item of commands) {
      const before = {
        project: nextSession.project,
        transport: nextSession.transport,
        playheadSec: nextSession.playheadSec,
        profile: nextProfile,
      };
      const applied = ActionEngine.applyOne(nextSession, nextProfile, item, { ...env, audition });
      nextSession = applied.session;
      nextProfile = applied.profile;
      if (applied.effect !== "none") effect = applied.effect;
      if (applied.exportTarget) exportTarget = applied.exportTarget;
      if (applied.commandsWhileRecording != null) commandsWhileRecording = applied.commandsWhileRecording;
      if (applied.audition) audition = applied.audition;
      if (applied.monitor != null) monitor = applied.monitor;
      if (applied.inputGainDb != null) inputGainDb = applied.inputGainDb;
      reply = applied.reply || reply;
      nextLog = [
        ...nextLog,
        {
          id: Ids.next(),
          command: item,
          inverse: applied.inverse,
          before,
        },
      ].slice(-80);
    }

    return {
      session: nextSession,
      profile: nextProfile,
      log: nextLog,
      future: keepFuture ? future : commands.length > 0 ? [] : future,
      reply,
      effect,
      exportTarget,
      commandsWhileRecording,
      audition,
      monitor,
      inputGainDb,
    };
  }

  static undo(session: SessionState, profile: ArtistProfile, log: CommandLogEntry[], future: CommandLogEntry[]): ActionResult {
    const entry = log[log.length - 1];
    if (!entry) {
      return ActionEngine.idle(session, profile, log, future, "Nothing to undo.");
    }
    return {
      ...ActionEngine.idle(session, profile, log.slice(0, -1), [...future, entry], "Undone."),
      session: {
        ...session,
        project: entry.before.project,
        transport: entry.before.transport,
        playheadSec: entry.before.playheadSec,
      },
      profile: entry.before.profile,
    };
  }

  static redo(session: SessionState, profile: ArtistProfile, log: CommandLogEntry[], future: CommandLogEntry[]): ActionResult {
    const entry = future[future.length - 1];
    if (!entry) return ActionEngine.idle(session, profile, log, future, "Nothing to redo.");
    return ActionEngine.run(
      session,
      profile,
      log,
      future.slice(0, -1),
      [entry.command],
      { ranking: null, sampleBufferId: null, audition: null },
      true,
    );
  }

  private static idle(
    session: SessionState,
    profile: ArtistProfile,
    log: CommandLogEntry[],
    future: CommandLogEntry[],
    reply: string,
  ): ActionResult {
    return {
      session,
      profile,
      log,
      future,
      reply,
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  private static applyOne(
    session: SessionState,
    profile: ArtistProfile,
    item: DawCommand,
    env: ActionEnv,
  ): {
    session: SessionState;
    profile: ArtistProfile;
    reply: string;
    inverse: DawCommand;
    effect: ActionResult["effect"];
    exportTarget: "master" | "stems" | null;
    commandsWhileRecording: boolean | null;
    audition: MicAuditionState | null;
    monitor: boolean | null;
    inputGainDb: number | null;
  } {
    const base = {
      session,
      profile,
      effect: "none" as ActionResult["effect"],
      exportTarget: null as "master" | "stems" | null,
      commandsWhileRecording: null as boolean | null,
      audition: null as MicAuditionState | null,
      monitor: null as boolean | null,
      inputGainDb: null as number | null,
    };
    if (item.action === "lyric") {
      return { ...base, reply: "Kept that in the performance, not the mix.", inverse: command(item.track, "noop", null) };
    }
    if (item.action === "noop") {
      return { ...base, reply: "", inverse: command(item.track, "noop", null) };
    }
    if (item.action === "analyze") return ActionEngine.analyze(session, profile, item);
    if (item.action === "scratch-beat") return ActionEngine.scratch(session, profile, item);
    if (item.action === "find-mic") {
      return {
        ...base,
        reply: "Give me about fifteen seconds of you. I'll rank Warm Tube, Modern Condenser, Smooth Vintage, and Bright Presence.",
        inverse: command("session", "noop", null),
        effect: "findMic",
      };
    }
    if (item.action === "import-beat") {
      return { ...base, reply: "Drop the instrumental, or pick the file.", inverse: command("beat", "noop", null), effect: "import" };
    }
    if (item.action === "choose-mic") return ActionEngine.choose(session, profile, item, env);
    if (item.action === "audition") return ActionEngine.audition(session, profile, item, env);
    if (item.action === "toggle-audition") return ActionEngine.toggle(session, profile, env);
    if (item.action === "command-window") {
      const open = item.amount === "open";
      return {
        ...base,
        reply: open ? "I'll take commands during the take." : "During the take, talk is lyrics unless you say SONA.",
        inverse: command("session", "command-window", open ? "closed" : "open"),
        commandsWhileRecording: open,
      };
    }
    if (item.action === "remember-name" && typeof item.amount === "string") {
      return {
        ...base,
        profile: SonaMemory.rememberName(profile, item.amount),
        reply: `Got it. I'll call you ${item.amount}.`,
        inverse: command("session", "remember-name", profile.name),
      };
    }
    if (item.action === "session") {
      return { ...base, reply: "Let's work. I'm listening. Headphones on — I'll duck while I talk so I don't print myself.", inverse: command("session", "noop", null) };
    }
    if (item.action === "help") {
      return { ...base, reply: EngineerReplies.help(), inverse: command("session", "noop", null) };
    }
    if (item.action === "clear") {
      const fresh = ProjectFactory.create(session.project.name);
      return {
        ...base,
        session: { ...session, project: fresh, transport: "stopped", playheadSec: 0 },
        reply: "Session cleared. Your raw files from before are still undoable.",
        inverse: command("session", "noop", null),
      };
    }
    if (item.action === "widen") {
      const result = ProjectCommands.widen(session.project);
      return {
        ...base,
        session: { ...session, project: result.project },
        reply: result.reply,
        inverse: command("doubles", "noop", null),
      };
    }
    if (item.action === "mix" && typeof item.amount === "string") {
      const result = ProjectCommands.mix(session.project, item.amount as MixAxis);
      return { ...base, session: { ...session, project: result.project }, reply: result.reply, inverse: command(item.track, "noop", null) };
    }
    if (item.action === "tune" || item.action === "tune-key" || item.action === "tune-strength") {
      return ActionEngine.tune(session, profile, item);
    }
    if (item.action === "mic" && typeof item.amount === "string") {
      const result = ProjectCommands.mic(session.project, item.amount as VirtualMicId);
      return { ...base, session: { ...session, project: result.project }, reply: result.reply, inverse: command(item.track, "mic", ProjectCommands.selected(session.project)?.micId ?? null) };
    }
    if (item.action === "mic-move" && typeof item.amount === "string") {
      const current = ProjectCommands.selected(session.project)?.micId ?? null;
      const result = ProjectCommands.micMove(session.project, item.amount as "warmer" | "brighter" | "darker" | "presence");
      return { ...base, session: { ...session, project: result.project }, reply: result.reply, inverse: command(item.track, "mic", current) };
    }
    if (item.action === "preamp" && typeof item.amount === "string") {
      const result = ProjectCommands.preamp(session.project, item.amount as PreampId);
      return { ...base, session: { ...session, project: result.project }, reply: result.reply, inverse: command(item.track, "preamp", ProjectCommands.selected(session.project)?.preampId ?? "clean") };
    }
    if (item.action === "punch" && typeof item.amount === "string") {
      const result = ProjectCommands.punch(session.project, session.playheadSec, item.amount);
      return {
        ...base,
        session: { ...session, project: result.project, playheadSec: result.playheadSec, transport: result.roll ? "recording" : session.transport },
        reply: result.reply,
        effect: result.roll ? "record" : "none",
        inverse: command("transport", "stop", null),
      };
    }
    if (item.action === "comp" && typeof item.amount === "string") {
      const assignments = item.amount.split(",").map((pair) => {
        const [take, marker] = pair.split(":");
        return { take: Number(take), marker: marker as MarkerName };
      });
      const result = ProjectCommands.comp(session.project, assignments);
      return { ...base, session: { ...session, project: result.project }, reply: result.reply, inverse: command(item.track, "noop", null) };
    }
    if (item.action === "save-take") {
      const result = ProjectCommands.saveTake(session.project);
      return { ...base, session: { ...session, project: result.project }, reply: result.reply, inverse: command(item.track, "noop", null) };
    }
    if (item.action === "delete-take") {
      const result = ProjectCommands.deleteTake(session.project, Number(item.amount));
      return { ...base, session: { ...session, project: result.project }, reply: result.reply, inverse: command(item.track, "noop", null) };
    }
    if (item.action === "input-gain" && typeof item.amount === "number") {
      return { ...base, reply: `Input ${item.amount > 0 ? "up" : "down"} ${Math.abs(item.amount)} dB.`, inverse: command("input", "input-gain", -item.amount), inputGainDb: item.amount };
    }
    if (item.action === "monitor") {
      const enabled = item.amount === "on";
      return { ...base, reply: enabled ? "Input monitor is on. Use headphones." : "Input monitor is off.", inverse: command("input", "monitor", enabled ? "off" : "on"), monitor: enabled };
    }
    if (item.action === "mic-check") {
      return { ...base, reply: ActionEngine.micCheck(session), inverse: command("input", "noop", null) };
    }
    if (item.action === "metronome") {
      const intent: Intent = { type: "metronome", enabled: item.amount === "toggle" ? "toggle" : item.amount === "on" || item.amount === "true" };
      return ActionEngine.via(session, profile, intent, command("session", "metronome", session.project.metronome ? "on" : "off"));
    }

    const intent = ActionEngine.toIntent(item, session);
    if (!intent) return { ...base, reply: "I couldn't turn that into a session move.", inverse: command(item.track, "noop", null) };
    return ActionEngine.via(session, profile, intent, ActionEngine.inverseFor(item, session));
  }

  private static via(session: SessionState, profile: ArtistProfile, intent: Intent, inverse: DawCommand): ReturnType<typeof ActionEngine.applyOne> {
    const execution = IntentExecutor.execute(
      { project: session.project, transport: session.transport, playheadSec: session.playheadSec },
      intent,
    );
    return {
      session: ActionEngine.write(session, execution),
      profile,
      reply: execution.reply,
      inverse,
      effect: execution.effect,
      exportTarget: intent.type === "export" ? intent.target : null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  private static write(session: SessionState, execution: Execution): SessionState {
    return {
      ...session,
      project: execution.project,
      transport: execution.transport,
      playheadSec: execution.playheadSec,
    };
  }

  private static inverseFor(item: DawCommand, session: SessionState): DawCommand {
    if (item.action === "gain" && typeof item.amount === "number") return command(item.track, "gain", -item.amount);
    if (item.action === "gain-set") {
      const track = session.project.tracks.find((entry) => entry.name.toLowerCase() === item.track.toLowerCase());
      const previous = item.track === "master" ? session.project.masterGainDb : track?.gainDb ?? 0;
      return command(item.track, "gain-set", previous);
    }
    if (item.action === "master") return command("master", "master", session.project.masterPreset);
    if (item.action === "pan") {
      const track = session.project.tracks.find((entry) => entry.name.toLowerCase() === item.track.toLowerCase());
      return command(item.track, "pan", track?.pan ?? 0);
    }
    return command(item.track, "noop", null);
  }

  private static toIntent(item: DawCommand, session: SessionState): Intent | null {
    const track = { kind: "name" as const, name: item.track };
    if (item.action === "gain" && typeof item.amount === "number") {
      return { type: "volume", target: item.track === "master" ? { kind: "master" } : track, mode: "relative", db: item.amount };
    }
    if (item.action === "gain-set" && typeof item.amount === "number") {
      return { type: "volume", target: item.track === "master" ? { kind: "master" } : track, mode: "absolute", db: item.amount };
    }
    if (item.action === "select") return { type: "select", track };
    if (item.action === "arm") return { type: "arm", track, exclusive: item.amount !== "add" };
    if (item.action === "disarm") return { type: "disarm", track: item.track === "all" ? "all" : track };
    if (item.action === "record") return { type: "record", at: null };
    if (item.action === "stop") return { type: "stop" };
    if (item.action === "play") return { type: "play", fromStart: item.amount === "top" };
    if (item.action === "seek") {
      if (item.amount === "start") return { type: "seek", cue: { kind: "start" } };
      if (item.amount === "intro" || item.amount === "verse" || item.amount === "chorus" || item.amount === "bridge") {
        return { type: "seek", cue: { kind: "marker", marker: item.amount } };
      }
      if (typeof item.amount === "string" && item.amount.startsWith("bar ")) {
        return { type: "seek", cue: { kind: "bar", bar: Number(item.amount.replace("bar ", "")) } };
      }
      return { type: "seek", cue: { kind: "start" } };
    }
    if (item.action === "add-track") return { type: "addTrack", name: typeof item.amount === "string" ? item.amount : null };
    if (item.action === "rename" && typeof item.amount === "string") return { type: "renameTrack", track, name: item.amount };
    if (item.action === "delete-track") return { type: "deleteTrack", track };
    if (item.action === "effect" && typeof item.amount === "string") {
      const [effect, preset] = item.amount.split(":");
      if (effect === "eq" || effect === "compressor" || effect === "reverb") {
        return { type: "addEffect", track, effect: effect as EffectName, preset: preset ?? "vocal", presetSpecified: true };
      }
    }
    if (item.action === "remove-effect" && (item.amount === "eq" || item.amount === "compressor" || item.amount === "reverb")) {
      return { type: "removeEffect", track, effect: item.amount };
    }
    if (item.action === "split") return { type: "split" };
    if (item.action === "trim" && typeof item.amount === "string") {
      const [edge, seconds] = item.amount.split(":");
      const parsed = seconds ? Number(seconds) : null;
      if (edge === "start" || edge === "end" || edge === "auto") {
        return { type: "trim", edge, seconds: parsed };
      }
    }
    if (item.action === "master" && typeof item.amount === "string") {
      return { type: "master", preset: item.amount as "off" | "broadcast" | "streaming" | "loud" | "louder" | "quieter" };
    }
    if (item.action === "export") return { type: "export", target: item.amount === "stems" ? "stems" : "master" };
    if (item.action === "bpm" && typeof item.amount === "number") return { type: "setBpm", bpm: item.amount };
    if (item.action === "marker" && typeof item.amount === "string") return { type: "setMarker", marker: item.amount as MarkerName };
    if (item.action === "mute") return { type: "mute", track, muted: item.amount === "false" ? false : item.amount === "toggle" ? "toggle" : true };
    if (item.action === "solo") return { type: "solo", track, solo: item.amount === "false" ? false : item.amount === "toggle" ? "toggle" : true };
    if (item.action === "pan" && typeof item.amount === "number") return { type: "pan", track, value: item.amount };
    if (item.action === "loop" && typeof item.amount === "number") return { type: "loop", mode: "bars", bars: item.amount };
    if (item.action === "loop" && item.amount === "clear") return { type: "loop", mode: "clear" };
    void session;
    return null;
  }

  private static analyze(session: SessionState, profile: ArtistProfile, item: DawCommand): ReturnType<typeof ActionEngine.applyOne> {
    const track = ProjectCommands.selected(session.project);
    const clip = track?.clips[track.clips.length - 1];
    const buffer = clip ? session.buffers[clip.bufferId] : undefined;
    const reply = buffer
      ? SonaEars.explain(SonaEars.inspect(buffer, session.project.bpm))
      : "I don't have audio on the selected track yet. Load a beat or record a pass and ask me again.";
    return {
      session,
      profile,
      reply,
      inverse: command(item.track, "noop", null),
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  private static scratch(session: SessionState, profile: ArtistProfile, item: DawCommand): ReturnType<typeof ActionEngine.applyOne> {
    const buffer = ScratchBeat.buffer(session.project.bpm);
    const placed = ScratchBeat.place(session.project, buffer);
    return {
      session: { ...session, project: placed.project, buffers: { ...session.buffers, [buffer.id]: buffer } },
      profile,
      reply: "Beat is up. It's a scratch pattern I generated so you can record on it — import your instrumental when you have the file.",
      inverse: command(item.track, "noop", null),
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  private static choose(session: SessionState, profile: ArtistProfile, item: DawCommand, env: ActionEnv): ReturnType<typeof ActionEngine.applyOne> {
    const rank = typeof item.amount === "number" ? item.amount : Number(item.amount);
    const picked = env.ranking ? FindMyMic.choose(env.ranking, rank) : null;
    if (!picked) {
      return {
        session,
        profile,
        reply: "Rank the mics first. Say find my mic.",
        inverse: command("session", "noop", null),
        effect: "none",
        exportTarget: null,
        commandsWhileRecording: null,
        audition: null,
        monitor: null,
        inputGainDb: null,
      };
    }
    const nextProfile = SonaMemory.rememberMic(profile, picked.id);
    const mic = ProjectCommands.mic(session.project, picked.id);
    const preamp = ProjectCommands.preamp(mic.project, nextProfile.preferredPreampId ?? "clean");
    return {
      session: { ...session, project: preamp.project },
      profile: nextProfile,
      reply: FindMyMic.CHOSEN_REPLY,
      inverse: command("session", "mic", profile.preferredMicId),
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  private static audition(session: SessionState, profile: ArtistProfile, item: DawCommand, env: ActionEnv): ReturnType<typeof ActionEngine.applyOne> {
    const parts = String(item.amount ?? "").split(",").map((value) => Number(value));
    const ranks: [number, number] = [parts[0] ?? 1, parts[1] ?? 2];
    const raw = env.sampleBufferId ? session.buffers[env.sampleBufferId] : undefined;
    if (!env.ranking || !raw) {
      return {
        session,
        profile,
        reply: "Rank the mics first. Say find my mic.",
        inverse: command("sample", "noop", null),
        effect: "none",
        exportTarget: null,
        commandsWhileRecording: null,
        audition: null,
        monitor: null,
        inputGainDb: null,
      };
    }
    const audition = MicAudition.start(env.ranking, ranks, raw.id);
    if (!audition) {
      return {
        session,
        profile,
        reply: "Those numbers aren't on the list.",
        inverse: command("sample", "noop", null),
        effect: "none",
        exportTarget: null,
        commandsWhileRecording: null,
        audition: null,
        monitor: null,
        inputGainDb: null,
      };
    }
    const first = env.ranking.find((entry) => entry.rank === ranks[0]);
    const second = env.ranking.find((entry) => entry.rank === ranks[1]);
    if (first && second) {
      MicChain.render(raw, first.id, "clean");
      MicChain.render(raw, second.id, "clean");
    }
    return {
      session,
      profile,
      reply: `Playing ${ranks[0]}${first ? `, ${first.name}` : ""}. Toggle for ${ranks[1]}${second ? `, ${second.name}` : ""}. Same raw sample, looping.`,
      inverse: command("sample", "noop", null),
      effect: "play",
      exportTarget: null,
      commandsWhileRecording: null,
      audition,
      monitor: null,
      inputGainDb: null,
    };
  }

  private static toggle(session: SessionState, profile: ArtistProfile, env: ActionEnv): ReturnType<typeof ActionEngine.applyOne> {
    if (!env.audition) {
      return {
        session,
        profile,
        reply: "Nothing is up for A/B.",
        inverse: command("sample", "noop", null),
        effect: "none",
        exportTarget: null,
        commandsWhileRecording: null,
        audition: null,
        monitor: null,
        inputGainDb: null,
      };
    }
    const audition = MicAudition.toggle(env.audition);
    return {
      session,
      profile,
      reply: `Now playing ${audition.active}. Still the same raw sample.`,
      inverse: command("sample", "toggle-audition", null),
      effect: "play",
      exportTarget: null,
      commandsWhileRecording: null,
      audition,
      monitor: null,
      inputGainDb: null,
    };
  }

  private static tune(session: SessionState, profile: ArtistProfile, item: DawCommand): ReturnType<typeof ActionEngine.applyOne> {
    const previous = ProjectCommands.selected(session.project)?.tune;
    let tighter: boolean | null = null;
    let key: string | null = null;
    let scale: "major" | "minor" | null = null;
    if (item.action === "tune" && item.amount === "tighter") tighter = true;
    if (item.action === "tune" && item.amount === "less") tighter = false;
    if (item.action === "tune-strength" && typeof item.amount === "number") {
      const track = ProjectCommands.selected(session.project);
      if (track) {
        const project = {
          ...session.project,
          tracks: session.project.tracks.map((entry) => entry.id === track.id ? { ...entry, tune: { ...entry.tune, strength: item.amount as number, enabled: true } } : entry),
        };
        return {
          session: { ...session, project },
          profile,
          reply: `Tune strength is ${Math.round((item.amount as number) * 100)}%.`,
          inverse: command(item.track, "tune-strength", previous?.strength ?? 0.55),
          effect: "none",
          exportTarget: null,
          commandsWhileRecording: null,
          audition: null,
          monitor: null,
          inputGainDb: null,
        };
      }
    }
    if (item.action === "tune-key" && typeof item.amount === "string") {
      const [root, mode] = item.amount.split(" ");
      key = root ?? "C";
      scale = mode === "minor" ? "minor" : "major";
    }
    const result = ProjectCommands.tune(session.project, tighter, key, scale);
    return {
      session: { ...session, project: result.project },
      profile,
      reply: result.reply,
      inverse: command(item.track, "tune-key", previous ? `${previous.key} ${previous.scale}` : null),
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  private static micCheck(session: SessionState): string {
    const track = ProjectCommands.selected(session.project);
    const clip = track?.clips[track.clips.length - 1];
    const buffer: StoredBuffer | undefined = clip ? session.buffers[clip.bufferId] : undefined;
    if (!buffer) return "Arm a track and give me a few words. I'll tell you if it's clipping or too quiet.";
    const report = SonaEars.inspect(buffer, session.project.bpm);
    return SonaEars.explain(report);
  }

  /**
   * Stores a capture without rewriting its samples.
   * The pipeline calls this; it does not assign session.buffers itself.
   */
  static storeRaw(
    session: SessionState,
    profile: ArtistProfile,
    log: CommandLogEntry[],
    future: CommandLogEntry[],
    buffer: StoredBuffer,
    label: string,
  ): ActionResult {
    void future;
    const before = {
      project: session.project,
      transport: session.transport,
      playheadSec: session.playheadSec,
      profile,
    };
    const item = command("session", "store-raw", label);
    return {
      session: { ...session, buffers: { ...session.buffers, [buffer.id]: buffer } },
      profile,
      log: [...log, { id: Ids.next(), command: item, inverse: command("session", "noop", null), before }].slice(-80),
      future: [],
      reply: "",
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  /** Mouse and transport edits that are already a next project. Still one log entry with an inverse snapshot. */
  static applyProject(
    session: SessionState,
    profile: ArtistProfile,
    log: CommandLogEntry[],
    future: CommandLogEntry[],
    project: Project,
    item: DawCommand,
  ): ActionResult {
    if (ActionEngine.sameProject(session.project, project)) {
      return ActionEngine.idle(session, profile, log, future, "");
    }
    const before = {
      project: session.project,
      transport: session.transport,
      playheadSec: session.playheadSec,
      profile,
    };
    return {
      session: { ...session, project: ProjectOps.touch(project, {}) },
      profile,
      log: [...log, { id: Ids.next(), command: item, inverse: command(item.track, "noop", null), before }].slice(-80),
      future: [],
      reply: "",
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  /** A finished take. Raw samples are stored once and pointed at by the clip and the take. */
  static commitCapture(
    session: SessionState,
    profile: ArtistProfile,
    log: CommandLogEntry[],
    future: CommandLogEntry[],
    captured: { samples: Float32Array; sampleRate: number },
    startSec: number,
    words: LyricWord[] = [],
  ): ActionResult {
    if (captured.sampleRate <= 0 || captured.samples.length < captured.sampleRate * 0.05) {
      return ActionEngine.idle(session, profile, log, future, "That pass was too short to keep.");
    }
    const before = {
      project: session.project,
      transport: session.transport,
      playheadSec: session.playheadSec,
      profile,
    };
    const committed = Session.commitRecording(session, captured, startSec, words);
    const names = committed.trackNames.join(" and ") || "track";
    const item = command(names, "commit-take", words.length > 0 ? words.map((word) => word.text).join(" ") : null);
    return {
      session: { ...committed.state, past: session.past, future: session.future, transport: "stopped" },
      profile,
      log: [...log, { id: Ids.next(), command: item, inverse: command(names, "noop", null), before }].slice(-80),
      future: [],
      reply: `Take is in on ${names}, ${committed.durationSec.toFixed(1)} seconds. The raw audio is stored untouched.`,
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  private static sameProject(a: Project, b: Project): boolean {
    return JSON.stringify({ ...a, updatedAt: 0 }) === JSON.stringify({ ...b, updatedAt: 0 });
  }

  static seek(
    session: SessionState,
    profile: ArtistProfile,
    log: CommandLogEntry[],
    future: CommandLogEntry[],
    playheadSec: number,
  ): ActionResult {
    const at = Math.max(0, playheadSec);
    if (Math.abs(at - session.playheadSec) < 0.01) return ActionEngine.idle(session, profile, log, future, "");
    const before = {
      project: session.project,
      transport: session.transport,
      playheadSec: session.playheadSec,
      profile,
    };
    const item = command("transport", "seek", Math.round(at * 100) / 100);
    return {
      session: { ...session, playheadSec: at },
      profile,
      log: [...log, { id: Ids.next(), command: item, inverse: command("transport", "seek", Math.round(session.playheadSec * 100) / 100), before }].slice(-80),
      future: [],
      reply: "",
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }

  static placeBeat(
    session: SessionState,
    profile: ArtistProfile,
    log: CommandLogEntry[],
    future: CommandLogEntry[],
    buffer: StoredBuffer,
  ): ActionResult {
    void future;
    const before = {
      project: session.project,
      transport: session.transport,
      playheadSec: session.playheadSec,
      profile,
    };
    const placed = ScratchBeat.place(session.project, buffer);
    const item = command("beat", "place-beat", buffer.id);
    return {
      session: { ...session, project: placed.project, buffers: { ...session.buffers, [buffer.id]: buffer } },
      profile,
      log: [...log, { id: Ids.next(), command: item, inverse: command("beat", "noop", null), before }].slice(-80),
      future: [],
      reply: "Beat is on the Beat track. The file is the raw instrumental.",
      effect: "none",
      exportTarget: null,
      commandsWhileRecording: null,
      audition: null,
      monitor: null,
      inputGainDb: null,
    };
  }
}
