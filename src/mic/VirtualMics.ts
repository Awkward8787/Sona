import type { PreampId, VirtualMicId } from "../model/types";

export interface MicCurve {
  lowDb: number;
  midDb: number;
  highDb: number;
  presenceDb: number;
  saturation: number;
  proximity: number;
}

/** Licensing metadata lives on every registry entry. Branded models are not registered in the MVP. */
export interface ModelLicense {
  status: "original" | "licensed" | "unsupported";
  holder: string | null;
  note: string;
}

export interface MicRegistration {
  id: VirtualMicId;
  name: string;
  license: ModelLicense;
  curve: MicCurve;
}

export interface PreampRegistration {
  id: PreampId;
  name: string;
  license: ModelLicense;
  curve: MicCurve;
}

const ORIGINAL: ModelLicense = {
  status: "original",
  holder: null,
  note: "Original SONA curve. Not a model of any manufactured microphone or preamp.",
};

const MICS: MicRegistration[] = [
  {
    id: "warm-tube",
    name: "Warm Tube",
    license: ORIGINAL,
    curve: { lowDb: 4, midDb: 1, highDb: -2.2, presenceDb: -0.6, saturation: 0.48, proximity: 0.72 },
  },
  {
    id: "modern-condenser",
    name: "Modern Condenser",
    license: ORIGINAL,
    curve: { lowDb: -1.2, midDb: 1.1, highDb: 3.2, presenceDb: 1.6, saturation: 0.08, proximity: 0.16 },
  },
  {
    id: "smooth-vintage",
    name: "Smooth Vintage",
    license: ORIGINAL,
    curve: { lowDb: 2.2, midDb: 0.4, highDb: -1.4, presenceDb: 0.2, saturation: 0.24, proximity: 0.42 },
  },
  {
    id: "bright-presence",
    name: "Bright Presence",
    license: ORIGINAL,
    curve: { lowDb: -2.4, midDb: 1.4, highDb: 5, presenceDb: 3.4, saturation: 0.12, proximity: 0.08 },
  },
];

const PREAMPS: PreampRegistration[] = [
  {
    id: "clean",
    name: "Clean",
    license: ORIGINAL,
    curve: { lowDb: 0, midDb: 0, highDb: 0.4, presenceDb: 0, saturation: 0.02, proximity: 0 },
  },
  {
    id: "warm",
    name: "Warm",
    license: ORIGINAL,
    curve: { lowDb: 1.6, midDb: 0.4, highDb: -0.8, presenceDb: 0, saturation: 0.32, proximity: 0.2 },
  },
  {
    id: "smooth",
    name: "Smooth",
    license: ORIGINAL,
    curve: { lowDb: 0.4, midDb: -0.4, highDb: -1.2, presenceDb: -0.4, saturation: 0.16, proximity: 0.1 },
  },
  {
    id: "air",
    name: "Air",
    license: ORIGINAL,
    curve: { lowDb: -0.6, midDb: 0.2, highDb: 2.4, presenceDb: 1.2, saturation: 0.06, proximity: 0 },
  },
];

export class VirtualMics {
  static all(): MicRegistration[] {
    return MICS;
  }

  static get(id: VirtualMicId): MicRegistration {
    const found = MICS.find((mic) => mic.id === id);
    if (!found) throw new Error(`Unknown mic model ${id}`);
    return found;
  }

  static name(id: VirtualMicId): string {
    return VirtualMics.get(id).name;
  }

  static byName(phrase: string): VirtualMicId | null {
    const text = phrase.toLowerCase().replace(/\s+/g, " ").trim();
    const found = MICS.find((mic) => text.includes(mic.name.toLowerCase()));
    return found?.id ?? null;
  }

  static pair(id: VirtualMicId): PreampId {
    if (id === "warm-tube") return "warm";
    if (id === "smooth-vintage") return "smooth";
    if (id === "bright-presence") return "air";
    return "clean";
  }

  static index(id: VirtualMicId): number {
    return MICS.findIndex((mic) => mic.id === id);
  }
}

export class PreampModels {
  static all(): PreampRegistration[] {
    return PREAMPS;
  }

  static get(id: PreampId): PreampRegistration {
    const found = PREAMPS.find((preamp) => preamp.id === id);
    if (!found) throw new Error(`Unknown preamp model ${id}`);
    return found;
  }
}
