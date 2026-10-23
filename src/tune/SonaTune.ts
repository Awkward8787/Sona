import { Ids } from "../model/Ids";
import type { StoredBuffer, TuneSettings } from "../model/types";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/**
 * Monophonic scale snap. Not formant-preserving and not live Auto-Tune.
 * Returns a new buffer. The input samples are not written.
 */
export class SonaTune {
  static correct(buffer: StoredBuffer, settings: TuneSettings): StoredBuffer {
    const strength = Math.max(0, Math.min(1, settings.strength));
    const channels = buffer.channels.map((channel) => SonaTune.shift(channel, buffer.sampleRate, settings, strength));
    return { id: Ids.next(), sampleRate: buffer.sampleRate, channels };
  }

  static dominantHz(samples: Float32Array, sampleRate: number): number | null {
    const minLag = Math.max(2, Math.floor(sampleRate / 1000));
    const maxLag = Math.min(samples.length - 2, Math.floor(sampleRate / 70));
    if (maxLag <= minLag) return null;
    let bestLag = -1;
    let best = 0;
    const step = samples.length > 4000 ? 2 : 1;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let corr = 0;
      let energy = 0;
      for (let i = 0; i < samples.length - lag; i += step) {
        const a = samples[i] ?? 0;
        const b = samples[i + lag] ?? 0;
        corr += a * b;
        energy += a * a;
      }
      const norm = energy > 1e-8 ? corr / energy : 0;
      if (norm > best) {
        best = norm;
        bestLag = lag;
      }
    }
    if (bestLag < 0 || best < 0.4) return null;
    return sampleRate / bestLag;
  }

  static nearestHz(hz: number, key: string, scale: "major" | "minor"): number {
    const root = NAMES.indexOf(key.toUpperCase() as (typeof NAMES)[number]);
    const degrees = (scale === "minor" ? MINOR : MAJOR).map((degree) => (degree + (root < 0 ? 0 : root)) % 12);
    const midi = 69 + 12 * Math.log2(hz / 440);
    let best = hz;
    let distance = Number.POSITIVE_INFINITY;
    for (let candidate = Math.floor(midi) - 3; candidate <= Math.ceil(midi) + 3; candidate += 1) {
      if (!degrees.includes(((candidate % 12) + 12) % 12)) continue;
      const freq = 440 * 2 ** ((candidate - 69) / 12);
      const delta = Math.abs(freq - hz);
      if (delta < distance) {
        distance = delta;
        best = freq;
      }
    }
    return best;
  }

  private static shift(samples: Float32Array, sampleRate: number, settings: TuneSettings, strength: number): Float32Array {
    const out = new Float32Array(samples.length);
    const weight = new Float32Array(samples.length);
    const win = Math.min(2048, samples.length);
    if (win < 256 || strength === 0) return samples.slice();
    const hop = Math.max(128, Math.floor(win / 4));
    for (let pos = 0; pos + win <= samples.length; pos += hop) {
      const frame = samples.subarray(pos, pos + win);
      const detected = SonaTune.dominantHz(frame, sampleRate);
      const target = detected ? SonaTune.nearestHz(detected, settings.key, settings.scale) : null;
      const ratio = detected && target ? 1 + (target / detected - 1) * strength : 1;
      for (let j = 0; j < win; j += 1) {
        const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (win - 1));
        const src = j * ratio;
        const left = Math.floor(src);
        const mix = src - left;
        const a = frame[Math.min(win - 1, Math.max(0, left))] ?? 0;
        const b = frame[Math.min(win - 1, left + 1)] ?? a;
        out[pos + j] += (a * (1 - mix) + b * mix) * hann;
        weight[pos + j] += hann;
      }
    }
    for (let i = 0; i < out.length; i += 1) {
      const scale = weight[i] ?? 0;
      out[i] = scale > 1e-6 ? (out[i] ?? 0) / scale : samples[i] ?? 0;
    }
    return out;
  }
}
