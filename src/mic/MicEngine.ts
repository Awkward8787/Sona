import { ProjectOps } from "../model/ProjectOps";
import { TrackResolver } from "../model/TrackResolver";
import type { MicMove } from "../engine/Intent";
import type { PreampId, Project, VirtualMicId } from "../model/types";
import { VirtualMics } from "./VirtualMics";

export class MicEngine {
  static applyMove(project: Project, move: MicMove): { project: Project; reply: string } {
    const resolved = TrackResolver.resolve(project, { kind: "selected" });
    if (!resolved.ok) return { project, reply: resolved.reason };
    const next = MicEngine.nudge(resolved.track.micId, resolved.track.micNudge, move);
    const updated = ProjectOps.updateTrack(project, resolved.track.id, (track) => ({
      ...track,
      micId: next.micId,
      micNudge: next.nudge,
    }));
    const name = VirtualMics.name(next.micId);
    const nudged = next.nudge > resolved.track.micNudge ? " I nudged it a little further." : "";
    return { project: updated, reply: `${resolved.track.name} is on ${name}.${nudged} The raw take is unchanged.` };
  }

  static applyMic(project: Project, micId: VirtualMicId): { project: Project; reply: string } {
    const resolved = TrackResolver.resolve(project, { kind: "selected" });
    if (!resolved.ok) return { project, reply: resolved.reason };
    const updated = ProjectOps.updateTrack(project, resolved.track.id, (track) => ({
      ...track,
      micId,
      micNudge: 0,
    }));
    return {
      project: updated,
      reply: `${resolved.track.name} is on ${VirtualMics.name(micId)}. The raw take is unchanged.`,
    };
  }

  static applyPreamp(project: Project, preampId: PreampId): { project: Project; reply: string } {
    const resolved = TrackResolver.resolve(project, { kind: "selected" });
    if (!resolved.ok) return { project, reply: resolved.reason };
    const updated = ProjectOps.updateTrack(project, resolved.track.id, (track) => ({ ...track, preampId }));
    return { project: updated, reply: `${resolved.track.name} preamp is ${preampId}. The mic model stayed put.` };
  }

  /** Relative language picks the closest model, or nudges when the artist is already on it. */
  static nudge(current: VirtualMicId, nudge: number, move: MicMove): { micId: VirtualMicId; nudge: number } {
    const target = MicEngine.target(move);
    if (current === target) return { micId: current, nudge: Math.min(1, nudge + 0.2) };
    return { micId: target, nudge: 0 };
  }

  static target(move: MicMove): VirtualMicId {
    if (move === "warmer") return "warm-tube";
    if (move === "darker") return "smooth-vintage";
    return "bright-presence";
  }
}
