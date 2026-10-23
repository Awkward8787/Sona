import { EngineerReplies } from "../engine/EngineerReplies";
import { IntentExecutor, type EngineEffect, type Execution } from "../engine/IntentExecutor";
import type { Intent } from "../engine/Intent";
import { Ids } from "../model/Ids";
import { ProjectFactory } from "../model/ProjectFactory";
import { ProjectOps } from "../model/ProjectOps";
import type { ChatMessage, Clip, LyricWord, Project, StoredBuffer, Take, Transport } from "../model/types";

export interface SessionState {
  project: Project;
  buffers: Record<string, StoredBuffer>;
  transport: Transport;
  playheadSec: number;
  past: Project[];
  future: Project[];
  messages: ChatMessage[];
}

export interface ApplyResult {
  state: SessionState;
  effect: EngineEffect;
  reply: string;
}

export class Session {
  static readonly HISTORY_LIMIT = 50;
  static readonly MESSAGE_LIMIT = 80;

  static create(name?: string): SessionState {
    return {
      project: ProjectFactory.create(name),
      buffers: {},
      transport: "stopped",
      playheadSec: 0,
      past: [],
      future: [],
      messages: [EngineerReplies.greeting()],
    };
  }

  static fromSaved(project: Project, buffers: Record<string, StoredBuffer>, messages: ChatMessage[]): SessionState {
    return {
      project,
      buffers,
      transport: "stopped",
      playheadSec: 0,
      past: [],
      future: [],
      messages: messages.length > 0 ? messages : [EngineerReplies.greeting()],
    };
  }

  static applyCommand(state: SessionState, text: string, intent: Intent): ApplyResult {
    const result = Session.reduce(state, intent);
    return {
      ...result,
      state: Session.withMessages(result.state, [
        EngineerReplies.message("user", text.trim()),
        EngineerReplies.message("engineer", result.reply),
      ]),
    };
  }

  static apply(state: SessionState, intent: Intent): ApplyResult {
    return Session.reduce(state, intent);
  }

  static note(state: SessionState, text: string): SessionState {
    return Session.withMessages(state, [EngineerReplies.message("engineer", text)]);
  }

  static seek(state: SessionState, playheadSec: number): SessionState {
    return { ...state, playheadSec: Math.max(0, playheadSec) };
  }

  static select(state: SessionState, trackId: string, clipId: string | null): SessionState {
    if (state.project.selectedTrackId === trackId && state.project.selectedClipId === clipId) return state;
    return {
      ...state,
      project: { ...state.project, selectedTrackId: trackId, selectedClipId: clipId },
    };
  }

  static preview(state: SessionState, project: Project): SessionState {
    return { ...state, project };
  }

  static commitEdit(state: SessionState, before: Project, project: Project): SessionState {
    if (JSON.stringify(before.tracks) === JSON.stringify(project.tracks) && before.masterGainDb === project.masterGainDb && before.masterPreset === project.masterPreset) {
      return { ...state, project: before };
    }
    return {
      ...state,
      project: ProjectOps.touch(project, {}),
      past: Session.push(state.past, before),
      future: [],
    };
  }

  static commitRecording(
    state: SessionState,
    captured: { samples: Float32Array; sampleRate: number },
    startSec: number,
    words: LyricWord[] = [],
  ): { state: SessionState; trackNames: string[]; durationSec: number } {
    const durationSec = captured.samples.length / captured.sampleRate;
    const bufferId = Ids.next();
    const armed = state.project.tracks.filter((track) => track.armed);
    const selected = state.project.tracks.find((track) => track.id === state.project.selectedTrackId);
    const targets = armed.length > 0 ? armed : selected ? [selected] : state.project.tracks.slice(0, 1);
    let project = state.project;
    let lastClip: string | null = null;
    for (const track of targets) {
      const clip: Clip = {
        id: Ids.next(),
        bufferId,
        startSec: Math.max(0, startSec),
        offsetSec: 0,
        durationSec,
        sourceDurationSec: durationSec,
      };
      lastClip = clip.id;
      const take: Take = {
        id: Ids.next(),
        number: track.takes.length + 1,
        rawBufferId: bufferId,
        startSec: Math.max(0, startSec),
        durationSec,
        words,
        micId: track.micId,
        preampId: track.preampId,
      };
      project = ProjectOps.addClip(project, track.id, clip);
      project = ProjectOps.updateTrack(project, track.id, (item) => ({ ...item, takes: [...item.takes, take] }));
    }
    if (lastClip) project = { ...project, selectedClipId: lastClip };
    return {
      trackNames: targets.map((track) => track.name),
      durationSec,
      state: {
        ...state,
        project,
        buffers: {
          ...state.buffers,
          [bufferId]: { id: bufferId, sampleRate: captured.sampleRate, channels: [captured.samples] },
        },
        past: Session.push(state.past, state.project),
        future: [],
      },
    };
  }

  private static reduce(state: SessionState, intent: Intent): ApplyResult {
    if (intent.type === "undo" || intent.type === "redo") return Session.history(state, intent.type);
    const execution = IntentExecutor.execute(
      { project: state.project, transport: state.transport, playheadSec: state.playheadSec },
      intent,
    );
    return { state: Session.store(state, execution), effect: execution.effect, reply: execution.reply };
  }

  private static history(state: SessionState, kind: "undo" | "redo"): ApplyResult {
    if (state.transport === "recording") {
      return { state, effect: "none", reply: "Stop the take before undo." };
    }
    if (kind === "undo") {
      const previous = state.past[state.past.length - 1];
      if (!previous) return { state, effect: "none", reply: "Nothing to undo." };
      return {
        state: {
          ...state,
          project: previous,
          past: state.past.slice(0, -1),
          future: Session.push(state.future, state.project),
        },
        effect: "none",
        reply: "Undone.",
      };
    }
    const next = state.future[state.future.length - 1];
    if (!next) return { state, effect: "none", reply: "Nothing to redo." };
    return {
      state: {
        ...state,
        project: next,
        future: state.future.slice(0, -1),
        past: Session.push(state.past, state.project),
      },
      effect: "none",
      reply: "Redone.",
    };
  }

  private static store(state: SessionState, execution: Execution): SessionState {
    return {
      ...state,
      project: execution.project,
      transport: execution.transport,
      playheadSec: execution.playheadSec,
      past: execution.mutate ? Session.push(state.past, state.project) : state.past,
      future: execution.mutate ? [] : state.future,
    };
  }

  private static withMessages(state: SessionState, extra: ChatMessage[]): SessionState {
    const messages = [...state.messages, ...extra];
    return {
      ...state,
      messages: messages.length > Session.MESSAGE_LIMIT ? messages.slice(messages.length - Session.MESSAGE_LIMIT) : messages,
    };
  }

  private static push(stack: Project[], project: Project): Project[] {
    return [...stack, project].slice(-Session.HISTORY_LIMIT);
  }
}
