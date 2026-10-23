export class Gain {
  static readonly MIN_DB = -60;
  static readonly MAX_DB = 12;
  static readonly MIN_MASTER_DB = -12;
  static readonly MAX_MASTER_DB = 12;

  static toLinear(db: number): number {
    return Math.pow(10, db / 20);
  }

  static clamp(db: number): number {
    return Math.min(Gain.MAX_DB, Math.max(Gain.MIN_DB, db));
  }

  static clampMaster(db: number): number {
    return Math.min(Gain.MAX_MASTER_DB, Math.max(Gain.MIN_MASTER_DB, db));
  }

  static format(db: number): string {
    const rounded = Math.round(db * 10) / 10;
    const body = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
    return rounded > 0 ? `+${body} dB` : `${body} dB`;
  }
}
