import type { TrackRef } from "../engine/Intent";
import type { Project, Track } from "./types";

export type ResolveResult = { ok: true; track: Track } | { ok: false; reason: string };

export class TrackResolver {
  static resolve(project: Project, ref: TrackRef): ResolveResult {
    if (ref.kind === "selected") {
      const track = project.tracks.find((item) => item.id === project.selectedTrackId) ?? project.tracks[0];
      if (!track) return { ok: false, reason: "There's no track to work on yet." };
      return { ok: true, track };
    }
    if (ref.kind === "index") {
      const track = project.tracks[ref.index - 1];
      if (!track) {
        return {
          ok: false,
          reason: `There's no track ${ref.index}. I have ${project.tracks.length} ${project.tracks.length === 1 ? "track" : "tracks"}.`,
        };
      }
      return { ok: true, track };
    }
    const query = ref.name.trim().toLowerCase();
    const exact = project.tracks.filter((track) => track.name.toLowerCase() === query);
    if (exact.length === 1) return { ok: true, track: exact[0] };
    const partial = project.tracks.filter((track) => {
      const name = track.name.toLowerCase();
      return name.includes(query) || query.includes(name);
    });
    if (partial.length === 1) return { ok: true, track: partial[0] };
    if (partial.length > 1) {
      return { ok: false, reason: `Which one — ${partial.map((track) => track.name).join(" or ")}?` };
    }
    const names = project.tracks.map((track) => track.name).join(", ") || "no tracks";
    return { ok: false, reason: `I don't see ${ref.name}. I've got ${names}.` };
  }

  static describe(ref: TrackRef): string {
    if (ref.kind === "index") return `track ${ref.index}`;
    if (ref.kind === "name") return ref.name;
    return "the selected track";
  }
}
