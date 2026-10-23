import { Ids } from "./Ids";
import type { Clip } from "./types";

export class ClipEdits {
  static readonly MIN_DURATION = 0.05;

  static move(clip: Clip, startSec: number): Clip {
    return { ...clip, startSec: Math.max(0, startSec) };
  }

  static trimStartBy(clip: Clip, deltaSec: number): Clip {
    const maxDelta = clip.durationSec - ClipEdits.MIN_DURATION;
    const delta = Math.min(maxDelta, Math.max(-clip.offsetSec, deltaSec));
    const durationSec = Math.max(ClipEdits.MIN_DURATION, clip.durationSec - delta);
    const applied = clip.durationSec - durationSec;
    return {
      ...clip,
      startSec: Math.max(0, clip.startSec + applied),
      offsetSec: Math.max(0, clip.offsetSec + applied),
      durationSec,
    };
  }

  static trimEndBy(clip: Clip, deltaSec: number): Clip {
    const room = clip.sourceDurationSec - clip.offsetSec - clip.durationSec;
    const delta = Math.min(room, Math.max(ClipEdits.MIN_DURATION - clip.durationSec, deltaSec));
    return { ...clip, durationSec: clip.durationSec + delta };
  }

  static trimStartTo(clip: Clip, playheadSec: number): Clip | null {
    const delta = playheadSec - clip.startSec;
    if (delta <= 0 || delta >= clip.durationSec - ClipEdits.MIN_DURATION) return null;
    return ClipEdits.trimStartBy(clip, delta);
  }

  static trimEndTo(clip: Clip, playheadSec: number): Clip | null {
    const next = playheadSec - clip.startSec;
    if (next < ClipEdits.MIN_DURATION || next >= clip.durationSec) return null;
    return { ...clip, durationSec: next };
  }

  static split(clip: Clip, playheadSec: number): [Clip, Clip] | null {
    const at = playheadSec - clip.startSec;
    if (at <= ClipEdits.MIN_DURATION || at >= clip.durationSec - ClipEdits.MIN_DURATION) return null;
    const left: Clip = { ...clip, durationSec: at };
    const right: Clip = {
      ...clip,
      id: Ids.next(),
      startSec: playheadSec,
      offsetSec: clip.offsetSec + at,
      durationSec: clip.durationSec - at,
    };
    return [left, right];
  }
}
