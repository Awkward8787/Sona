import { Ids } from "../model/Ids";
import { CuePoint } from "../model/CuePoint";
import { ProjectOps } from "../model/ProjectOps";
import type { MarkerName, Project, Take, Track } from "../model/types";

export class CompTakes {
  static comp(project: Project, track: Track, assignments: Array<{ take: number; marker: MarkerName }>): Project | null {
    let next = project;
    let changed = false;
    for (const assignment of assignments) {
      const take = track.takes.find((item) => item.number === assignment.take);
      if (!take) return null;
      const span = CuePoint.markerSpan(project, assignment.marker);
      const clip = CompTakes.slice(take, span.startSec, span.endSec);
      if (!clip) continue;
      const without = CompTakes.clearSpan(next, track.id, span.startSec, span.endSec);
      next = ProjectOps.addClip(without, track.id, clip);
      changed = true;
    }
    return changed ? next : null;
  }

  static slice(take: Take, startSec: number, endSec: number): { id: string; bufferId: string; startSec: number; offsetSec: number; durationSec: number; sourceDurationSec: number } | null {
    const takeEnd = take.startSec + take.durationSec;
    const start = Math.max(startSec, take.startSec);
    const end = Math.min(endSec, takeEnd);
    if (end - start < 0.05) return null;
    return {
      id: Ids.next(),
      bufferId: take.rawBufferId,
      startSec: start,
      offsetSec: start - take.startSec,
      durationSec: end - start,
      sourceDurationSec: take.durationSec,
    };
  }

  private static clearSpan(project: Project, trackId: string, startSec: number, endSec: number): Project {
    return ProjectOps.updateTrack(project, trackId, (track) => ({
      ...track,
      clips: track.clips.filter((clip) => clip.startSec + clip.durationSec <= startSec + 0.01 || clip.startSec >= endSec - 0.01),
    }));
  }
}
