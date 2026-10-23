import type { VirtualMicId } from "../model/types";
import type { VoiceFeatureValues } from "../ears/VoiceFeatures";
import { VirtualMics } from "./VirtualMics";

export interface RankedMic {
  rank: number;
  id: VirtualMicId;
  name: string;
  score: number;
  reason: string;
}

/**
 * Deterministic ranking of the four original models.
 * A dark voice is steered toward a brighter model; a harsh voice toward a smoother one.
 */
export class FindMyMic {
  static readonly CHOSEN_REPLY = "Got it. I'll use that as your preferred mic.";

  static rank(features: VoiceFeatureValues): RankedMic[] {
    const scored = VirtualMics.all().map((mic) => ({
      mic,
      score: FindMyMic.score(mic.id, features),
    }));
    scored.sort((a, b) => b.score - a.score || VirtualMics.index(a.mic.id) - VirtualMics.index(b.mic.id));
    return scored.map((item, index) => ({
      rank: index + 1,
      id: item.mic.id,
      name: item.mic.name,
      score: Math.round(item.score * 1000) / 1000,
      reason: FindMyMic.reason(item.mic.id, features),
    }));
  }

  static present(ranking: RankedMic[]): string {
    const lines = ranking.map((item) => `${item.rank}. ${item.name} — ${item.reason}`);
    return `Here's how I'd mic this voice.\n${lines.join("\n")}\nSay "let me hear 1 and 3", or call a number.`;
  }

  static choose(ranking: RankedMic[], rank: number): RankedMic | null {
    return ranking.find((item) => item.rank === rank) ?? null;
  }

  static score(id: VirtualMicId, features: VoiceFeatureValues): number {
    const { brightness, sibilance, tilt, range } = features;
    switch (id) {
      case "warm-tube":
        return sibilance * 3 + (1 - brightness) * 2 + Math.max(0, -tilt);
      case "smooth-vintage":
        return sibilance * 2.2 + (1 - brightness) * 1.2 + (1 - Math.abs(range - 0.5));
      case "modern-condenser":
        return (1 - Math.abs(brightness - 0.55)) * 2 + (1 - sibilance) * 1.5 + range;
      case "bright-presence":
        return (1 - brightness) * 2.5 + (1 - sibilance) * 1.4 + (1 - range) * 0.8 + Math.max(0, -tilt) * 0.4;
      default: {
        const neverId: never = id;
        return neverId;
      }
    }
  }

  static reason(id: VirtualMicId, features: VoiceFeatureValues): string {
    switch (id) {
      case "warm-tube":
        return features.sibilance > 0.5
          ? "Softens a sharp top without dulling the take."
          : "Adds weight and a little tube color to a thin voice.";
      case "modern-condenser":
        return "Keeps the voice honest, detailed, and even.";
      case "smooth-vintage":
        return features.sibilance > 0.5
          ? "Rounds off harshness and keeps the midrange smooth."
          : "A darker vintage shape when the voice needs less edge.";
      case "bright-presence":
        return features.brightness < 0.4
          ? "Opens a dark voice up and puts it in front."
          : "Adds air and presence when you want the vocal to cut.";
      default: {
        const neverId: never = id;
        return neverId;
      }
    }
  }
}
