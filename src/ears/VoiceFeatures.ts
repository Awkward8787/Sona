import type { StoredBuffer } from "../model/types";

/** Normalized voice (or program) features used by Find My Mic. Same input → same numbers. */
export interface VoiceFeatureValues {
  /** Spectral tilt, about −1 (dark) to +1 (bright). */
  tilt: number;
  /** High-band share, 0–1. */
  brightness: number;
  /** 5–8 kHz share against the mid band, 0–1. */
  sibilance: number;
  /** Pitch span normalized by two octaves, 0–1. */
  range: number;
}

export class VoiceFeatures {
  static fromBuffer(buffer: StoredBuffer): VoiceFeatureValues {
    const samples = buffer.channels[0] ?? new Float32Array();
    const rate = buffer.sampleRate || 44100;
    const low = VoiceFeatures.energy(samples, rate, 180);
    const mid = VoiceFeatures.energy(samples, rate, 1000);
    const high = VoiceFeatures.energy(samples, rate, 6500);
    const hiss = VoiceFeatures.energy(samples, rate, 7500);
    const brightness = high / (high + low + 1e-9);
    const sibilance = hiss / (hiss + mid + 1e-9);
    const tilt = Math.max(-1, Math.min(1, Math.log10((high + 1e-9) / (low + 1e-9)) / 2));
    const range = VoiceFeatures.pitchRange(samples, rate);
    return {
      tilt: VoiceFeatures.round(tilt),
      brightness: VoiceFeatures.round(brightness),
      sibilance: VoiceFeatures.round(sibilance),
      range: VoiceFeatures.round(range),
    };
  }

  static energy(samples: Float32Array, sampleRate: number, hz: number): number {
    if (samples.length === 0) return 0;
    const omega = (2 * Math.PI * hz) / sampleRate;
    const coeff = 2 * Math.cos(omega);
    let s1 = 0;
    let s2 = 0;
    const step = Math.max(1, Math.floor(samples.length / 16000));
    let count = 0;
    for (let i = 0; i < samples.length; i += step) {
      const s0 = (samples[i] ?? 0) + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
      count += 1;
    }
    const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    return Math.sqrt(Math.max(0, power)) / Math.max(1, count);
  }

  private static pitchRange(samples: Float32Array, sampleRate: number): number {
    const window = 2048;
    if (samples.length < window) return 0;
    const pitches: number[] = [];
    const hop = Math.max(window, Math.floor(samples.length / 8));
    for (let start = 0; start + window < samples.length && pitches.length < 8; start += hop) {
      const hz = VoiceFeatures.pitch(samples.subarray(start, start + window), sampleRate);
      if (hz) pitches.push(hz);
    }
    if (pitches.length < 2) return 0.35;
    const low = Math.min(...pitches);
    const high = Math.max(...pitches);
    const semis = 12 * Math.log2(high / low);
    return Math.max(0, Math.min(1, semis / 24));
  }

  static pitch(frame: Float32Array, sampleRate: number): number | null {
    const minLag = Math.max(2, Math.floor(sampleRate / 1000));
    const maxLag = Math.min(frame.length - 2, Math.floor(sampleRate / 70));
    if (maxLag <= minLag) return null;
    let bestLag = -1;
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let corr = 0;
      let energy = 0;
      const limit = frame.length - lag;
      const step = limit > 1500 ? 2 : 1;
      for (let i = 0; i < limit; i += step) {
        const a = frame[i] ?? 0;
        const b = frame[i + lag] ?? 0;
        corr += a * b;
        energy += a * a;
      }
      const norm = energy > 1e-8 ? corr / energy : 0;
      if (norm > best) {
        best = norm;
        bestLag = lag;
      }
    }
    if (bestLag < 0 || best < 0.45) return null;
    return sampleRate / bestLag;
  }

  private static round(value: number): number {
    return Math.round(value * 1000) / 1000;
  }
}
