import type { LyricWord } from "../model/types";

/**
 * Browsers often have no per-word speech timestamps.
 * Split a real transcript evenly across the span the recognizer was actually active.
 * This does not invent words that were not in the transcript.
 */
export function wordsFromSpan(text: string, startSec: number, endSec: number): LyricWord[] {
  const tokens = text.trim().split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length === 0) return [];
  const start = Math.max(0, Math.min(startSec, endSec));
  const end = Math.max(start, Math.max(startSec, endSec));
  const span = Math.max(0.05, end - start);
  const step = span / tokens.length;
  return tokens.map((token, index) => ({
    text: token,
    startSec: start + index * step,
    endSec: start + (index + 1) * step,
  }));
}
