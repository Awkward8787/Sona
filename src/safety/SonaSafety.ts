import type { DawCommand } from "../daw/DawCommand";
import { describeCommand } from "../daw/DawCommand";
import type { Project } from "../model/types";

export interface ReviewedPlan {
  commands: DawCommand[];
  needsConfirm: boolean;
  question: string;
  preview: string;
}

/** Decides whether a plan may run. It does not change the session. */
export class SonaSafety {
  static review(project: Project, playheadSec: number, commands: DawCommand[]): ReviewedPlan {
    const reasons: string[] = [];
    for (const item of commands) {
      const reason = SonaSafety.reason(project, playheadSec, item);
      if (reason) reasons.push(reason);
    }
    const preview = commands.map((item) => describeCommand({ command: item, inverse: item })).join(" · ");
    if (reasons.length === 0) {
      return { commands, needsConfirm: false, question: "", preview };
    }
    return {
      commands,
      needsConfirm: true,
      question: `${reasons[0]} ${preview ? `Preview: ${preview}.` : ""} Say yes and I'll do it. Undo still brings it back.`,
      preview,
    };
  }

  private static reason(project: Project, playheadSec: number, command: DawCommand): string | null {
    if (command.action === "delete-track") return `Delete ${command.track}?`;
    if (command.action === "clear") return "Clear the session?";
    if (command.action === "delete-take") return `Delete take ${command.amount}? The raw audio stays in the session.`;
    if (command.action === "gain" && typeof command.amount === "number" && Math.abs(command.amount) >= 6) {
      return `${command.amount > 0 ? "That's a big boost" : "That's a big cut"} on ${command.track} (${command.amount} dB).`;
    }
    if (command.action === "gain-set" && typeof command.amount === "number") {
      const current = SonaSafety.currentDb(project, command.track);
      if (current != null && Math.abs(command.amount - current) >= 6) {
        return `That's a big level move on ${command.track}.`;
      }
    }
    if (command.action === "record" && SonaSafety.overlaps(project, playheadSec)) {
      return "This prints over audio that's already there. The earlier take stays underneath.";
    }
    return null;
  }

  private static currentDb(project: Project, track: string): number | null {
    if (track === "master") return project.masterGainDb;
    const found = project.tracks.find((item) => item.name.toLowerCase() === track.toLowerCase());
    return found ? found.gainDb : null;
  }

  private static overlaps(project: Project, playheadSec: number): boolean {
    const armed = project.tracks.filter((track) => track.armed);
    const tracks = armed.length > 0 ? armed : project.tracks.slice(0, 1);
    return tracks.some((track) =>
      track.clips.some((clip) => playheadSec >= clip.startSec - 0.001 && playheadSec < clip.startSec + clip.durationSec),
    );
  }
}
