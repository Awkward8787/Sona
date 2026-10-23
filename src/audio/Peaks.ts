export class Peaks {
  static compute(channel: Float32Array, buckets: number): Float32Array {
    const count = Math.max(1, buckets);
    const out = new Float32Array(count * 2);
    if (channel.length === 0) return out;
    for (let i = 0; i < count; i += 1) {
      const start = Math.floor((i * channel.length) / count);
      const end = Math.max(start + 1, Math.floor(((i + 1) * channel.length) / count));
      let min = 1;
      let max = -1;
      for (let j = start; j < end && j < channel.length; j += 1) {
        const sample = channel[j];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      out[i * 2] = min;
      out[i * 2 + 1] = max;
    }
    return out;
  }

  static slice(channel: Float32Array, sampleRate: number, offsetSec: number, durationSec: number): Float32Array {
    const start = Math.max(0, Math.floor(offsetSec * sampleRate));
    const end = Math.min(channel.length, Math.ceil((offsetSec + durationSec) * sampleRate));
    return channel.subarray(start, Math.max(start, end));
  }
}
