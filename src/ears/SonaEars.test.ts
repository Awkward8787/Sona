import { describe, expect, it } from "vitest";
import type { StoredBuffer } from "../model/types";
import { SonaEars } from "./SonaEars";

function buffer(samples: Float32Array, sampleRate = 44100): StoredBuffer {
  return { id: "ear", sampleRate, channels: [samples] };
}

function sine(freq: number, seconds: number, gain: number, rate = 44100): Float32Array {
  const length = Math.floor(rate * seconds);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = Math.sin((2 * Math.PI * freq * i) / rate) * gain;
  return out;
}

describe("ears", () => {
  it("flags clipping, quiet, sibilance, mud, noise, and timing", () => {
    const clipped = SonaEars.inspect(buffer(sine(440, 0.2, 0.99)), 120);
    expect(clipped.notes.some((note) => note.id === "clipping")).toBe(true);
    expect(clipped.notes.find((note) => note.id === "clipping")?.offer).toMatch(/pull it down/i);

    const quiet = SonaEars.inspect(buffer(sine(440, 0.2, 0.02)), 120);
    expect(quiet.notes.some((note) => note.id === "quiet")).toBe(true);

    const silent = SonaEars.inspect(buffer(new Float32Array(4410)), 120);
    expect(silent.notes.some((note) => note.id === "silence")).toBe(true);

    const harsh = SonaEars.inspect(buffer(sine(7000, 0.3, 0.5)), 120);
    expect(harsh.notes.some((note) => note.id === "sibilance")).toBe(true);

    const mud = SonaEars.inspect(buffer(sine(280, 0.3, 0.6)), 120);
    expect(mud.notes.some((note) => note.id === "mud")).toBe(true);

    const noise = new Float32Array(44100);
    for (let i = 0; i < noise.length; i += 1) noise[i] = ((i * 17) % 100) / 100 * 0.08 - 0.04;
    expect(SonaEars.inspect(buffer(noise), 120).notes.some((note) => note.id === "noise")).toBe(true);

    const drift = new Float32Array(44100 * 2);
    for (const at of [0.12, 0.62, 1.12, 1.62]) {
      const start = Math.floor(at * 44100);
      for (let i = 0; i < 800; i += 1) drift[start + i] = 0.8;
    }
    expect(SonaEars.inspect(buffer(drift), 120).notes.some((note) => note.id === "timing")).toBe(true);

    const grid = new Float32Array(44100 * 2);
    for (const at of [0, 0.5, 1, 1.5]) {
      const start = Math.floor(at * 44100);
      for (let i = 0; i < 800; i += 1) grid[start + i] = 0.8;
    }
    expect(SonaEars.inspect(buffer(grid), 120).notes.some((note) => note.id === "timing")).toBe(false);
  });

  it("estimates a key and does not read a transcript", () => {
    const report = SonaEars.inspect(buffer(sine(440, 0.5, 0.4)), 120);
    expect(report.key).toBe("A");
    expect(typeof report.lufsEstimate).toBe("number");
    expect(SonaEars.inspect.length).toBe(2);
  });
});
