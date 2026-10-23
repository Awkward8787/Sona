import { ClipEdits } from "./ClipEdits";
import type { Clip, Project, Track } from "./types";

export class ProjectOps {
  static touch(project: Project, patch: Partial<Project>): Project {
    return { ...project, ...patch, updatedAt: Date.now() };
  }

  static updateTrack(project: Project, id: string, fn: (track: Track) => Track): Project {
    let changed = false;
    const tracks = project.tracks.map((track) => {
      if (track.id !== id) return track;
      const next = fn(track);
      if (next !== track) changed = true;
      return next;
    });
    if (!changed) return project;
    return ProjectOps.touch(project, { tracks });
  }

  static addClip(project: Project, trackId: string, clip: Clip): Project {
    return ProjectOps.updateTrack(project, trackId, (track) => ({
      ...track,
      clips: [...track.clips, clip].sort((a, b) => a.startSec - b.startSec),
    }));
  }

  static withSelectedClip(project: Project, clipId: string | null): Project {
    if (project.selectedClipId === clipId) return project;
    return { ...project, selectedClipId: clipId };
  }

  static replaceClip(project: Project, clipId: string, next: Clip | null, extra?: Clip): Project {
    let selected = project.selectedClipId;
    let changed = false;
    const tracks = project.tracks.map((track) => {
      const index = track.clips.findIndex((clip) => clip.id === clipId);
      if (index < 0) return track;
      changed = true;
      const clips = track.clips.slice();
      if (next) clips.splice(index, 1, next);
      else clips.splice(index, 1);
      if (extra) clips.push(extra);
      clips.sort((a, b) => a.startSec - b.startSec);
      if (extra && selected === clipId) selected = extra.id;
      if (!next && selected === clipId) selected = clips[0]?.id ?? null;
      return { ...track, clips };
    });
    if (!changed) return project;
    return ProjectOps.touch(project, { tracks, selectedClipId: selected });
  }

  static findClip(project: Project, playheadSec: number): { track: Track; clip: Clip } | null {
    if (project.selectedClipId) {
      for (const track of project.tracks) {
        const clip = track.clips.find((item) => item.id === project.selectedClipId);
        if (clip && ProjectOps.contains(clip, playheadSec)) return { track, clip };
      }
    }
    const selected = project.tracks.find((track) => track.id === project.selectedTrackId);
    const onSelected = selected ? ProjectOps.clipOnTrack(selected, playheadSec) : null;
    if (selected && onSelected) return { track: selected, clip: onSelected };
    for (const track of project.tracks) {
      const clip = ProjectOps.clipOnTrack(track, playheadSec);
      if (clip) return { track, clip };
    }
    return null;
  }

  static clipOnTrack(track: Track, playheadSec: number): Clip | null {
    return track.clips.find((clip) => ProjectOps.contains(clip, playheadSec)) ?? null;
  }

  static contains(clip: Clip, playheadSec: number): boolean {
    return playheadSec > clip.startSec + 0.001 && playheadSec < clip.startSec + clip.durationSec - 0.001;
  }

  static contentEnd(project: Project): number {
    let end = 0;
    for (const track of project.tracks) {
      for (const clip of track.clips) end = Math.max(end, clip.startSec + clip.durationSec);
    }
    return end;
  }

  static hasAudio(project: Project): boolean {
    return project.tracks.some((track) => track.clips.length > 0);
  }

  static anySolo(project: Project): boolean {
    return project.tracks.some((track) => track.solo);
  }

  static audible(project: Project, track: Track): boolean {
    if (track.mute) return false;
    const bus = (project.buses ?? []).find((item) => item.id === track.busId);
    if (bus?.mute) return false;
    if (ProjectOps.anySolo(project)) return track.solo;
    const groups = (project.buses ?? []).filter((item) => item.kind === "group");
    if (groups.some((item) => item.solo)) return Boolean(bus?.solo);
    return true;
  }

  static applyTrim(
    project: Project,
    playheadSec: number,
    edge: "start" | "end" | "auto",
    seconds: number | null,
  ): { project: Project; clip: Clip; track: Track } | null {
    const found = ProjectOps.findClip(project, playheadSec);
    if (!found) return null;
    let next: Clip | null = null;
    if (seconds !== null) {
      next = edge === "start" ? ClipEdits.trimStartBy(found.clip, seconds) : ClipEdits.trimEndBy(found.clip, -seconds);
      if (edge === "auto") next = ClipEdits.trimEndBy(found.clip, -seconds);
    } else if (edge === "start") {
      next = ClipEdits.trimStartTo(found.clip, playheadSec);
    } else if (edge === "end") {
      next = ClipEdits.trimEndTo(found.clip, playheadSec);
    } else {
      const fromStart = playheadSec - found.clip.startSec;
      const fromEnd = found.clip.startSec + found.clip.durationSec - playheadSec;
      next = fromStart <= fromEnd
        ? ClipEdits.trimStartTo(found.clip, playheadSec)
        : ClipEdits.trimEndTo(found.clip, playheadSec);
    }
    if (!next) return null;
    return {
      project: ProjectOps.replaceClip(project, found.clip.id, next),
      clip: next,
      track: found.track,
    };
  }
}
