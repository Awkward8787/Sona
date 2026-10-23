import type { LyricWord, Take } from "../model/types";

export class LyricPunch {
  static readonly PREROLL = 0.75;

  static find(takes: Take[], phrase: string): { startSec: number; takeNumber: number } | null {
    const wanted = LyricPunch.tokens(phrase);
    if (wanted.length === 0) return null;
    for (const take of takes) {
      const start = LyricPunch.sequence(take.words, wanted);
      if (start != null) return { startSec: Math.max(0, start - LyricPunch.PREROLL), takeNumber: take.number };
    }
    return null;
  }

  static sequence(words: LyricWord[], wanted: string[]): number | null {
    const tokens = words.map((word) => LyricPunch.tokens(word.text)[0] ?? "");
    for (let i = 0; i <= tokens.length - wanted.length; i += 1) {
      let match = true;
      for (let j = 0; j < wanted.length; j += 1) {
        if (tokens[i + j] !== wanted[j]) {
          match = false;
          break;
        }
      }
      if (match) return words[i]?.startSec ?? null;
    }
    return null;
  }

  static tokens(phrase: string): string[] {
    return phrase
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
  }
}
