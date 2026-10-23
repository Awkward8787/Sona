import { describe, expect, it } from "vitest";
import { WavEncoder } from "./WavEncoder";

describe("WavEncoder", () => {
  it("writes a 16-bit stereo wav header and interleaved frames", () => {
    const bytes = WavEncoder.bytes(
      [new Float32Array([0, 0.5]), new Float32Array([0, -0.5])],
      44100,
    );
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(bytes.byteLength).toBe(52);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0);
    expect(view.getInt16(48, true)).toBeGreaterThan(16000);
    expect(view.getInt16(50, true)).toBeLessThan(-16000);
  });
});
