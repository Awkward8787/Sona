export class Numbers {
  private static readonly words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };

  static word(token: string): number | null {
    return Numbers.words[token.toLowerCase()] ?? null;
  }

  static parse(token: string): number | null {
    const trimmed = token.trim().toLowerCase();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
    return Numbers.word(trimmed);
  }

  static parseInteger(token: string): number | null {
    const value = Numbers.parse(token);
    if (value === null || !Number.isFinite(value)) return null;
    return Math.round(value);
  }
}
