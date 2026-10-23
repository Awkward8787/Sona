import type { CompressorSettings, EqSettings, MasterPreset, ReverbSettings } from "../model/types";
import { ProjectFactory } from "../model/ProjectFactory";

export class EffectPresets {
  static reverb(preset: string): ReverbSettings {
    const name = EffectPresets.known(preset, ["room", "hall", "plate"], "room");
    const table: Record<string, Pick<ReverbSettings, "mix" | "decay">> = {
      room: { mix: 0.22, decay: 0.7 },
      hall: { mix: 0.34, decay: 2.1 },
      plate: { mix: 0.28, decay: 1.4 },
    };
    return { enabled: true, preset: name, ...table[name] };
  }

  static eq(preset: string): EqSettings {
    const name = EffectPresets.known(preset, ["warmth", "air", "presence", "vocal", "flat"], "vocal");
    const table: Record<string, Pick<EqSettings, "lowDb" | "midDb" | "highDb">> = {
      warmth: { lowDb: 3.5, midDb: 0.5, highDb: -1 },
      air: { lowDb: -1, midDb: 0.5, highDb: 4 },
      presence: { lowDb: -1.5, midDb: 3, highDb: 2 },
      vocal: { lowDb: -2, midDb: 2, highDb: 2.5 },
      flat: { lowDb: 0, midDb: 0, highDb: 0 },
    };
    return { enabled: true, preset: name, ...table[name] };
  }

  static compressor(preset: string): CompressorSettings {
    const name = EffectPresets.known(preset, ["gentle", "vocal", "punch"], "vocal");
    const table: Record<string, Omit<CompressorSettings, "enabled" | "preset">> = {
      gentle: { threshold: -18, ratio: 2, attack: 0.02, release: 0.25, makeupDb: 1.5 },
      vocal: { threshold: -22, ratio: 3.2, attack: 0.012, release: 0.18, makeupDb: 3 },
      punch: { threshold: -16, ratio: 4.5, attack: 0.005, release: 0.12, makeupDb: 2.5 },
    };
    return { enabled: true, preset: name, ...table[name] };
  }

  static disableEq(): EqSettings {
    return { ...ProjectFactory.eqOff() };
  }

  static disableCompressor(): CompressorSettings {
    const current = ProjectFactory.compressorOff();
    return { ...current, enabled: false };
  }

  static disableReverb(): ReverbSettings {
    return { ...ProjectFactory.reverbOff(), enabled: false };
  }

  private static known(preset: string, allowed: string[], fallback: string): string {
    const name = preset.trim().toLowerCase();
    return allowed.includes(name) ? name : fallback;
  }
}

export interface MasterChain {
  threshold: number;
  knee: number;
  ratio: number;
  attack: number;
  release: number;
  makeupDb: number;
}

export class MasterPresets {
  static chain(preset: MasterPreset): MasterChain {
    switch (preset) {
      case "off":
        return { threshold: 0, knee: 0, ratio: 1, attack: 0.01, release: 0.25, makeupDb: 0 };
      case "broadcast":
        return { threshold: -20, knee: 12, ratio: 2.5, attack: 0.02, release: 0.25, makeupDb: 2 };
      case "streaming":
        return { threshold: -18, knee: 6, ratio: 4, attack: 0.008, release: 0.18, makeupDb: 5 };
      case "loud":
        return { threshold: -14, knee: 3, ratio: 8, attack: 0.003, release: 0.12, makeupDb: 8 };
    }
  }

  static resolve(preset: MasterPreset | "louder" | "quieter"): MasterPreset {
    if (preset === "louder") return "loud";
    if (preset === "quieter") return "broadcast";
    return preset;
  }

  static label(preset: MasterPreset): string {
    switch (preset) {
      case "off":
        return "Master bypass is on. The limiter is out.";
      case "broadcast":
        return "Master is set for broadcast. Less push, more control.";
      case "streaming":
        return "Master is set for streaming. A gentle limiter is on.";
      case "loud":
        return "Master is louder. The limiter is in.";
    }
  }
}
