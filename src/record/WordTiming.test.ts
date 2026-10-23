import { describe, expect, it } from "vitest";
import { wordsFromSpan } from "./WordTiming";

describe("word timing fallback", () => {
  it("splits only the real transcript across the recognizer span", () => {
    const words = wordsFromSpan("I been on the road", 2, 4);
    expect(words.map((word) => word.text)).toEqual(["I", "been", "on", "the", "road"]);
    expect(words[0]?.startSec).toBeCloseTo(2);
    expect(words.at(-1)?.endSec).toBeCloseTo(4);
    expect(wordsFromSpan("   ", 0, 1)).toEqual([]);
  });
});