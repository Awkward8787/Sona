import type { Cue } from "../engine/Intent";
import type { MarkerName, Project } from "./types";

export class CuePoint {
  static barSeconds(bpm: number): number {
    return (60 / Math.max(1, bpm)) * 4;
  }

  static seconds(project: Project, cue: Cue): number {
    switch (cue.kind) {
      case "start":
        return 0;
      case "marker":
        return Math.max(0, project.markers[cue.marker]);
      case "bar":
        return Math.max(0, (cue.bar - 1) * CuePoint.barSeconds(project.bpm));
      case "seconds":
        return Math.max(0, cue.seconds);
      case "lyric":
        return 0;
    }
  }

  static label(cue: Cue): string {
    switch (cue.kind) {
      case "start":
        return "the top";
      case "marker":
        return `the ${cue.marker}`;
      case "bar":
        return `bar ${cue.bar}`;
      case "seconds":
        return `${cue.seconds} seconds`;
      case "lyric":
        return `"${cue.text}"`;
    }
  }

  static markerSpan(project: Project, marker: MarkerName): { startSec: number; endSec: number } {
    const startSec = project.markers[marker];
    const later = (Object.values(project.markers) as number[])
      .filter((time) => time > startSec + 0.05)
      .sort((a, b) => a - b);
    const endSec = later[0] ?? startSec + CuePoint.barSeconds(project.bpm) * 8;
    return { startSec, endSec };
  }
}
