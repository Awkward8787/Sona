import type { StoredBuffer } from "../model/types";
import { VoiceFeatures } from "./VoiceFeatures";

export interface EarNote {
  id: "clipping" | "quiet" | "sibilance" | "mud" | "noise" | "timing" | "silence";
  summary: string;
  offer: string;
}

export interface EarReport {
  peakDb: number;
  rmsDb: number;
  lufsEstimate: number;
  notes: EarNote[];
  bpm: number | null;
  key: string | null;
}

/**
 * Audio analysis only. This module does not read speech transcripts and does not edit the session.
 * LUFS here is a rough RMS offset, not BS.1770.
 */
export class SonaEars {
  static inspect(buffer: StoredBuffer, bpm: number): EarReport {
    const samples = buffer.channels[0] ?? new Float32Array();
    const peak = SonaEars.peak(samples);
    const rms = SonaEars.rms(samples);
    const peakDb = SonaEars.db(peak);
    const rmsDb = SonaEars.db(rms);
    const notes: EarNote[] = [];
    if (samples.length === 0 || rmsDb < -50) {
      notes.push({
        id: "silence",
        summary: "I'm not hearing a signal.",
        offer: "Move in and give me another pass.",
      });
    } else {
      if (peak >= 0.98 || peakDb >= -0.2) {
        notes.push({
          id: "clipping",
          summary: "Vocal is clipping.",
          offer: "Want me to pull it down?",
        });
      }
      if (rmsDb < -30 && peak < 0.98) {
        notes.push({
          id: "quiet",
          summary: "This take is quiet.",
          offer: "Want me to bring it up 3 dB?",
        });
      }
      if (SonaEars.sibilant(samples, buffer.sampleRate)) {
        notes.push({
          id: "sibilance",
          summary: "The top is harsh — sibilance is sticking out.",
          offer: "Want me to take the edge off?",
        });
      }
      if (SonaEars.muddy(samples, buffer.sampleRate)) {
        notes.push({
          id: "mud",
          summary: "Low mids are muddy.",
          offer: "Want me to pull them back?",
        });
      }
      if (SonaEars.noisy(samples, buffer.sampleRate)) {
        notes.push({
          id: "noise",
          summary: "The noise floor is up. I won't pretend to denoise it.",
          offer: "Want me to sit the take 2 dB lower?",
        });
      }
      const drift = SonaEars.timingDrift(samples, buffer.sampleRate, bpm);
      if (drift) {
        notes.push({
          id: "timing",
          summary: `Timing is drifting off the ${bpm} grid.`,
          offer: "Want the click on for the next pass?",
        });
      }
    }
    return {
      peakDb: Math.round(peakDb * 10) / 10,
      rmsDb: Math.round(rmsDb * 10) / 10,
      lufsEstimate: Math.round((rmsDb - 0.691) * 10) / 10,
      notes,
      bpm: SonaEars.estimateBpm(samples, buffer.sampleRate),
      key: SonaEars.estimateKey(samples, buffer.sampleRate),
    };
  }

  static explain(report: EarReport): string {
    if (report.notes.length === 0) {
      return `Nothing's jumping out. Peak ${report.peakDb} dB, and the loudness estimate is ${report.lufsEstimate} LUFS — that's an estimate, not a broadcast meter.`;
    }
    const lines = report.notes.map((note) => `${note.summary} ${note.offer}`);
    return lines.join(" ");
  }

  static peak(samples: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i] ?? 0));
    return peak;
  }

  static rms(samples: Float32Array): number {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const sample = samples[i] ?? 0;
      sum += sample * sample;
    }
    return Math.sqrt(sum / samples.length);
  }

  static db(linear: number): number {
    if (linear <= 1e-8) return -96;
    return 20 * Math.log10(linear);
  }

  static sibilant(samples: Float32Array, sampleRate: number): boolean {
    const hiss = VoiceFeatures.energy(samples, sampleRate, 7000);
    const mid = VoiceFeatures.energy(samples, sampleRate, 1000);
    return hiss > 0.02 && hiss > mid * 1.8;
  }

  static muddy(samples: Float32Array, sampleRate: number): boolean {
    const low = VoiceFeatures.energy(samples, sampleRate, 280);
    const high = VoiceFeatures.energy(samples, sampleRate, 3000);
    return low > 0.02 && low > high * 2.4;
  }

  static noisy(samples: Float32Array, sampleRate: number): boolean {
    const window = Math.max(1, Math.floor(sampleRate * 0.05));
    if (samples.length < window * 4) return false;
    const levels: number[] = [];
    for (let start = 0; start + window <= samples.length; start += window) {
      levels.push(SonaEars.rms(samples.subarray(start, start + window)));
    }
    levels.sort((a, b) => a - b);
    const quiet = levels[Math.floor(levels.length * 0.2)] ?? 0;
    const mid = levels[Math.floor(levels.length * 0.5)] ?? 0;
    return SonaEars.db(quiet) > -42 && SonaEars.db(mid) - SonaEars.db(quiet) < 12;
  }

  static timingDrift(samples: Float32Array, sampleRate: number, bpm: number): boolean {
    const onsets = SonaEars.onsets(samples, sampleRate);
    if (onsets.length < 3) return false;
    const beat = 60 / Math.max(1, bpm);
    const offsets = onsets.map((time) => {
      const nearest = Math.round(time / beat) * beat;
      return Math.abs(time - nearest);
    });
    offsets.sort((a, b) => a - b);
    const median = offsets[Math.floor(offsets.length / 2)] ?? 0;
    return median > 0.04;
  }

  static onsets(samples: Float32Array, sampleRate: number): number[] {
    const hop = Math.max(1, Math.floor(sampleRate * 0.01));
    const times: number[] = [];
    let previous = 0;
    for (let start = 0; start + hop <= samples.length; start += hop) {
      const energy = SonaEars.rms(samples.subarray(start, start + hop));
      if (energy > 0.08 && energy > previous * 1.8) times.push(start / sampleRate);
      previous = energy;
    }
    return times;
  }

  static estimateBpm(samples: Float32Array, sampleRate: number): number | null {
    const hop = Math.max(1, Math.floor(sampleRate * 0.02));
    const env: number[] = [];
    for (let start = 0; start + hop <= samples.length; start += hop) {
      env.push(SonaEars.rms(samples.subarray(start, start + hop)));
    }
    if (env.length < 20) return null;
    let bestLag = -1;
    let best = 0;
    const minLag = Math.round(60 / 180 / 0.02);
    const maxLag = Math.min(env.length - 2, Math.round(60 / 60 / 0.02));
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      let score = 0;
      for (let i = 0; i + lag < env.length; i += 1) score += (env[i] ?? 0) * (env[i + lag] ?? 0);
      if (score > best) {
        best = score;
        bestLag = lag;
      }
    }
    if (bestLag < 0 || best <= 0) return null;
    const bpm = Math.round(60 / (bestLag * 0.02));
    if (bpm < 60 || bpm > 180) return null;
    return bpm;
  }

  static estimateKey(samples: Float32Array, sampleRate: number): string | null {
    const frame = samples.subarray(0, Math.min(samples.length, sampleRate));
    const hz = VoiceFeatures.pitch(frame, sampleRate);
    if (!hz) return null;
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const midi = Math.round(69 + 12 * Math.log2(hz / 440));
    const name = names[((midi % 12) + 12) % 12];
    return name ?? null;
  }
}
