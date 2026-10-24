import { Ids } from "./Ids";
import type { AutomationPoint } from "./types";

/** Absolute volume points. Playback reads them; they do not rewrite audio. */
export class VolumeAutomation {
  static valueAt(points: AutomationPoint[], timeSec: number): number {
    const ordered = VolumeAutomation.ordered(points);
    const first = ordered[0];
    if (!first) return 0;
    if (timeSec <= first.timeSec) return first.gainDb;
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const next = ordered[index];
      if (!previous || !next) continue;
      if (timeSec <= next.timeSec) {
        const span = next.timeSec - previous.timeSec;
        const blend = span <= 0 ? 1 : (timeSec - previous.timeSec) / span;
        return previous.gainDb + (next.gainDb - previous.gainDb) * blend;
      }
    }
    return ordered[ordered.length - 1]?.gainDb ?? first.gainDb;
  }

  static withPoint(points: AutomationPoint[], timeSec: number, gainDb: number): AutomationPoint[] {
    const kept = points.filter((point) => Math.abs(point.timeSec - timeSec) > 0.05);
    kept.push({ id: Ids.next(), timeSec: Math.max(0, timeSec), gainDb });
    return VolumeAutomation.ordered(kept);
  }

  static without(points: AutomationPoint[], id: string): AutomationPoint[] {
    return points.filter((point) => point.id !== id);
  }

  static ordered(points: AutomationPoint[]): AutomationPoint[] {
    return [...points].sort((a, b) => a.timeSec - b.timeSec);
  }
}
