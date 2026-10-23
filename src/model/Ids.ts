export class Ids {
  static next(): string {
    return crypto.randomUUID();
  }
}
