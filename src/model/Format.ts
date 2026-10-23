export class Format {
  static time(sec: number): string {
    const safe = Math.max(0, sec);
    const minutes = Math.floor(safe / 60);
    const seconds = safe - minutes * 60;
    return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
  }

  static bars(sec: number, bpm: number): string {
    const bar = (60 / Math.max(1, bpm)) * 4;
    const index = Math.floor(Math.max(0, sec) / bar) + 1;
    const beat = Math.floor(((Math.max(0, sec) % bar) / bar) * 4) + 1;
    return `${index}.${beat}`;
  }

  static filename(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `sona-${slug || "session"}-mix.wav`;
  }
}
