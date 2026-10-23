import { ActionEngine, type ActionResult } from "../action/ActionEngine";
import type { CommandLogEntry } from "../daw/DawCommand";
import { command } from "../daw/DawCommand";
import type { EarNote } from "../ears/SonaEars";
import { SonaEars } from "../ears/SonaEars";
import { EngineerReplies } from "../engine/EngineerReplies";
import { IntentParser } from "../engine/IntentParser";
import { ListenContext, type ListenChannel } from "../listen/ListenContext";
import type { ArtistProfile } from "../memory/SonaMemory";
import { SonaMemory } from "../memory/SonaMemory";
import { FindMyMic, type RankedMic } from "../mic/FindMyMic";
import type { MicAuditionState } from "../mic/MicAudition";
import type { StoredBuffer } from "../model/types";
import { DeterministicPlanner } from "../planner/Planner";
import { SonaSafety } from "../safety/SonaSafety";
import type { SessionState } from "../session/Session";
import { VoiceFeatures } from "../ears/VoiceFeatures";

export interface PipelineState {
  session: SessionState;
  profile: ArtistProfile;
  log: CommandLogEntry[];
  future: CommandLogEntry[];
  sessionActive: boolean;
  commandsWhileRecording: boolean;
  pending: { commands: ReturnType<DeterministicPlanner["plan"]>["commands"]; question: string } | null;
  ranking: RankedMic[] | null;
  audition: MicAuditionState | null;
  sampleBufferId: string | null;
  ears: EarNote[];
  channel: ListenChannel;
}

export interface TurnResult extends PipelineState {
  reply: string;
  effect: ActionResult["effect"];
  exportTarget: "master" | "stems" | null;
  monitor?: boolean | null;
  inputGainDb?: number | null;
}

const planner = new DeterministicPlanner();

export class SonaPipeline {
  static create(session: SessionState, profile: ArtistProfile = SonaMemory.defaults()): PipelineState {
    const stamped = SonaMemory.applyToProject(session.project, profile);
    return {
      session: stamped === session.project ? session : { ...session, project: stamped },
      profile,
      log: [],
      future: [],
      sessionActive: false,
      commandsWhileRecording: false,
      pending: null,
      ranking: null,
      audition: null,
      sampleBufferId: null,
      ears: [],
      channel: "command",
    };
  }

  static turn(state: PipelineState, text: string, source: "speech" | "typed" = "typed"): TurnResult {
    const pending = SonaPipeline.answerPending(state, text);
    if (pending) return pending;

    const route = ListenContext.classify({
      text,
      transport: state.session.transport,
      source,
      commandsWhileRecording: state.commandsWhileRecording,
    });

    if (route.channel === "performance") {
      const track = state.session.project.tracks.find((item) => item.id === state.session.project.selectedTrackId)?.name ?? "vocal";
      const ran = ActionEngine.run(state.session, state.profile, state.log, state.future, [command(track, "lyric", route.text)], SonaPipeline.env(state));
      return SonaPipeline.finish(state, ran, "performance", route.text);
    }

    if (route.woke && !route.text) {
      return { ...state, channel: "command", reply: "I'm listening.", effect: "none", exportTarget: null };
    }

    const plan = planner.plan(route.text || text, {
      project: state.session.project,
      profile: state.profile,
      ears: state.ears,
    });

    if (plan.commands.length === 1 && (plan.commands[0]?.action === "undo" || plan.commands[0]?.action === "redo") && state.session.transport === "recording") {
      return { ...state, pending: null, channel: "command", reply: "Stop the take before undo.", effect: "none", exportTarget: null };
    }
    if (plan.commands.length === 1 && plan.commands[0]?.action === "undo") {
      const undone = ActionEngine.undo(state.session, state.profile, state.log, state.future);
      return SonaPipeline.finish({ ...state, pending: null }, undone, "command", text);
    }
    if (plan.commands.length === 1 && plan.commands[0]?.action === "redo") {
      const redone = ActionEngine.redo(state.session, state.profile, state.log, state.future);
      return SonaPipeline.finish({ ...state, pending: null }, redone, "command", text);
    }
    if (plan.clarify) {
      return { ...state, pending: null, channel: "command", reply: plan.clarify, effect: "none", exportTarget: null };
    }
    if (plan.commands.length === 0) {
      return { ...state, channel: "command", reply: EngineerReplies.unknown(text), effect: "none", exportTarget: null };
    }

    const review = SonaSafety.review(state.session.project, state.session.playheadSec, plan.commands);
    if (review.needsConfirm) {
      return {
        ...state,
        pending: { commands: plan.commands, question: review.question },
        channel: "command",
        reply: review.question,
        effect: "none",
        exportTarget: null,
      };
    }
    const ran = ActionEngine.run(state.session, state.profile, state.log, state.future, plan.commands, SonaPipeline.env(state));
    const active = plan.commands.some((item) => item.action === "session") ? true : state.sessionActive;
    return SonaPipeline.finish({ ...state, sessionActive: active, pending: null }, ran, "command", text);
  }

  /** Rank a real buffer. The Action Engine stores it; this method does not write buffers itself. */
  static finishFindMic(state: PipelineState, buffer: StoredBuffer): TurnResult {
    const features = VoiceFeatures.fromBuffer(buffer);
    const ranking = FindMyMic.rank(features);
    const stored = ActionEngine.storeRaw(state.session, state.profile, state.log, state.future, buffer, "find-mic");
    return {
      ...state,
      session: stored.session,
      log: stored.log,
      future: stored.future,
      ranking,
      sampleBufferId: buffer.id,
      channel: "analysis",
      reply: FindMyMic.present(ranking),
      effect: "none",
      exportTarget: null,
    };
  }

  static noteEars(state: PipelineState, buffer: StoredBuffer): TurnResult {
    const report = SonaEars.inspect(buffer, state.session.project.bpm);
    const clipping = report.notes.find((note) => note.id === "clipping");
    if (!clipping) {
      return { ...state, ears: report.notes, channel: "analysis", reply: SonaEars.explain(report), effect: "none", exportTarget: null };
    }
    const track = state.session.project.tracks.find((item) => item.armed)?.name ?? "vocal";
    return {
      ...state,
      ears: report.notes,
      channel: "analysis",
      pending: { commands: [command(track, "gain", -3)], question: "Vocal is clipping. Want me to pull it down?" },
      reply: "Vocal is clipping. Want me to pull it down?",
      effect: "none",
      exportTarget: null,
    };
  }

  private static answerPending(state: PipelineState, text: string): TurnResult | null {
    if (!state.pending) return null;
    const peeled = ListenContext.peelWake(text);
    const answer = IntentParser.normalize(peeled.woke ? peeled.rest : text);
    if (/^(?:yes|yeah|yep|do it|confirm)$/.test(answer)) {
      const ran = ActionEngine.run(state.session, state.profile, state.log, state.future, state.pending.commands, SonaPipeline.env(state));
      return SonaPipeline.finish({ ...state, pending: null }, ran, "command", text);
    }
    if (/^(?:no|nope|cancel|never mind)$/.test(answer)) {
      return { ...state, pending: null, channel: "command", reply: "Left it alone.", effect: "none", exportTarget: null };
    }
    return SonaPipeline.turn({ ...state, pending: null }, text, "typed");
  }

  private static env(state: PipelineState) {
    return { ranking: state.ranking, sampleBufferId: state.sampleBufferId, audition: state.audition };
  }

  private static finish(state: PipelineState, ran: ActionResult, channel: ListenChannel, text: string): TurnResult {
    return {
      ...state,
      session: ran.session,
      profile: SonaMemory.noteCommand(ran.profile, text),
      log: ran.log,
      future: ran.future,
      commandsWhileRecording: ran.commandsWhileRecording ?? state.commandsWhileRecording,
      audition: ran.audition ?? state.audition,
      channel,
      reply: ran.reply,
      effect: ran.effect,
      exportTarget: ran.exportTarget,
      monitor: ran.monitor,
      inputGainDb: ran.inputGainDb,
    };
  }
}
