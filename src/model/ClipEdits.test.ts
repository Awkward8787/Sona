import { describe, expect, it } from "vitest";
import { ClipEdits } from "./ClipEdits";
import type { Clip } from "./types";

function clip(): Clip {
  return {
    id: "c",
    bufferId: "b",
    startSec: 2,
    offsetSec: 0.5,
    durationSec: 4,
    sourceDurationSec: 8,
  };
}

describe("ClipEdits", () => {
  it("moves a clip but not before zero", () => {
    expect(ClipEdits.move(clip(), -3).startSec).toBe(0);
    expect(ClipEdits.move(clip(), 5).startSec).toBe(5);
  });

  it("trims the start into the buffer and the end back", () => {
    const start = ClipEdits.trimStartBy(clip(), 1);
    expect(start.offsetSec).toBeCloseTo(1.5);
    expect(start.durationSec).toBeCloseTo(3);
    expect(start.startSec).toBeCloseTo(3);
    const end = ClipEdits.trimEndBy(clip(), -1);
    expect(end.durationSec).toBeCloseTo(3);
    expect(end.offsetSec).toBeCloseTo(0.5);
  });

  it("will not trim the clip away or past the source", () => {
    const tiny = ClipEdits.trimStartBy(clip(), 100);
    expect(tiny.durationSec).toBeGreaterThanOrEqual(ClipEdits.MIN_DURATION);
    const grown = ClipEdits.trimEndBy(clip(), 100);
    expect(grown.offsetSec + grown.durationSec).toBeLessThanOrEqual(grown.sourceDurationSec + 0.0001);
  });

  it("splits one clip into two that share the recording", () => {
    const parts = ClipEdits.split(clip(), 4);
    expect(parts).not.toBeNull();
    if (!parts) return;
    expect(parts[0].durationSec).toBeCloseTo(2);
    expect(parts[1].startSec).toBeCloseTo(4);
    expect(parts[1].offsetSec).toBeCloseTo(2.5);
    expect(parts[1].durationSec).toBeCloseTo(2);
    expect(parts[0].bufferId).toBe(parts[1].bufferId);
    expect(parts[0].id).not.toBe(parts[1].id);
    expect(ClipEdits.split(clip(), 2.01)).toBeNull();
  });
});
