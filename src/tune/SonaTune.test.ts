import { describe, expect, it } from "vitest";
import type { StoredBuffer } from "../model/types";
import { SonaTune } from "./SonaTune";

describe("tune", () => {
  it("snaps a sharp note toward the scale and leaves the source alone", () => {
    const rate = 44100;
    const length = Math.floor(rate * 0.45);
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i += 1) samples[i] = Math.sin((2 * Math.PI * 466 * i) / rate) * 0.5;
    const source = Array.from(samples);
    const buffer: StoredBuffer = { id: "tune", sampleRate: rate, channels: [samples] };
    const tuned = SonaTune.correct(buffer, { enabled: true, strength: 1, key: "C", scale: "major" });
    expect(Array.from(samples)).toEqual(source);
    expect(SonaTune.nearestHz(466, "C", "major")).toBeCloseTo(440, 0);
    const hz = SonaTune.dominantHz(tuned.channels[0] ?? new Float32Array(), rate);
    expect(hz).not.toBeNull();
    expect(Math.abs((hz ?? 0) - 440)).toBeLessThan(Math.abs(466 - 440));
  });
});