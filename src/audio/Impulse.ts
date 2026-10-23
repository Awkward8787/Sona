export class Impulse {
  static reverb(sampleRate: number, decaySec: number): Float32Array[] {
    const length = Math.max(1, Math.floor(sampleRate * Math.max(0.05, decaySec)));
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const envelope = Math.pow(1 - i / length, 2.4);
      left[i] = (Math.random() * 2 - 1) * envelope * 0.45;
      right[i] = (Math.random() * 2 - 1) * envelope * 0.45;
    }
    return [left, right];
  }
}
