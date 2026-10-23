import type { VirtualMicId } from "../model/types";
import type { MicCurve } from "./VirtualMics";
import { VirtualMics } from "./VirtualMics";

/**
 * Nondestructive mic stage. Always returns a new sample array.
 * The capture itself stays the raw take.
 */
export class MicModel {
  static render(samples: Float32Array, sampleRate: number, micId: VirtualMicId, nudge = 0): Float32Array {
    const curve = MicModel.nudged(VirtualMics.get(micId).curve, nudge);
    return MicModel.shape(samples, sampleRate, curve);
  }

  static shape(samples: Float32Array, sampleRate: number, curve: MicCurve): Float32Array {
    const out = new Float32Array(samples.length);
    const lowA = Math.exp((-2 * Math.PI * 180) / sampleRate);
    const presenceA = Math.exp((-2 * Math.PI * 3200) / sampleRate);
    const highA = Math.exp((-2 * Math.PI * 5500) / sampleRate);
    let low = 0;
    let presence = 0;
    let high = 0;
    const lowGain = MicModel.db(curve.lowDb + curve.proximity * 3);
    const midGain = MicModel.db(curve.midDb);
    const presenceGain = MicModel.db(curve.presenceDb);
    const highGain = MicModel.db(curve.highDb);
    const drive = 1 + curve.saturation * 5;
    for (let i = 0; i < samples.length; i += 1) {
      const x = samples[i] ?? 0;
      low = lowA * low + (1 - lowA) * x;
      presence = presenceA * presence + (1 - presenceA) * x;
      high = highA * high + (1 - highA) * x;
      const presenceBand = presence - low;
      const air = x - high;
      const mid = x - low - air;
      const colored = low * lowGain + mid * midGain + presenceBand * presenceGain + air * highGain;
      const shaped = Math.tanh(colored * drive) / Math.tanh(drive);
      out[i] = Math.max(-1, Math.min(1, shaped));
    }
    return out;
  }

  private static nudged(curve: MicCurve, nudge: number): MicCurve {
    const amount = Math.max(0, Math.min(1, nudge));
    if (amount === 0) return curve;
    return {
      ...curve,
      lowDb: curve.lowDb + amount * Math.sign(curve.lowDb || 1) * 0.8,
      highDb: curve.highDb + amount * Math.sign(curve.highDb || 1) * 0.8,
      saturation: Math.min(0.85, curve.saturation + amount * 0.12),
    };
  }

  private static db(value: number): number {
    return 10 ** (value / 20);
  }
}
