import type { MasterPreset, PreampId, Project, VirtualMicId } from "../model/types";
import { VirtualMics } from "../mic/VirtualMics";

export interface VocalChain {
  eq: string;
  compressor: string;
  reverb: string;
}

export interface ArtistProfile {
  name: string | null;
  preferredMicId: VirtualMicId | null;
  preferredPreampId: PreampId | null;
  preferredVocalChain: VocalChain;
  loudnessTarget: MasterPreset;
  tuneStrength: number;
  reverbTaste: string;
  inputGainDb: number;
  favoritePresets: string[];
  pastCommands: string[];
}

export class SonaMemory {
  static defaults(): ArtistProfile {
    return {
      name: null,
      preferredMicId: null,
      preferredPreampId: null,
      preferredVocalChain: { eq: "vocal", compressor: "vocal", reverb: "room" },
      loudnessTarget: "streaming",
      tuneStrength: 0.55,
      reverbTaste: "room",
      inputGainDb: 0,
      favoritePresets: [],
      pastCommands: [],
    };
  }

  static rememberMic(profile: ArtistProfile, micId: VirtualMicId): ArtistProfile {
    return {
      ...profile,
      preferredMicId: micId,
      preferredPreampId: VirtualMics.pair(micId),
    };
  }

  static rememberName(profile: ArtistProfile, name: string): ArtistProfile {
    return { ...profile, name: name.trim() };
  }

  static noteCommand(profile: ArtistProfile, text: string): ArtistProfile {
    const pastCommands = [...profile.pastCommands, text.trim()].slice(-20);
    return { ...profile, pastCommands };
  }

  /** New takes and new sessions pick up the preferred mic. Existing raw audio is not rewritten. */
  static applyToProject(project: Project, profile: ArtistProfile): Project {
    if (!profile.preferredMicId) return project;
    const micId = profile.preferredMicId;
    const preampId = profile.preferredPreampId ?? VirtualMics.pair(micId);
    return {
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, micId, preampId })),
    };
  }
}

export class SonaMemoryStore {
  private db: IDBDatabase | null = null;

  async load(): Promise<ArtistProfile> {
    try {
      const db = await this.open();
      const stored = await SonaMemoryStore.get<ArtistProfile>(db, "profile");
      return stored ? { ...SonaMemory.defaults(), ...stored } : SonaMemory.defaults();
    } catch {
      return SonaMemory.defaults();
    }
  }

  async save(profile: ArtistProfile): Promise<void> {
    try {
      const db = await this.open();
      await SonaMemoryStore.put(db, "profile", profile);
    } catch {
      /* the session still holds the profile in memory */
    }
  }

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("sona-memory", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("profile")) request.result.createObjectStore("profile");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("memory"));
    });
    return this.db;
  }

  private static get<T>(db: IDBDatabase, key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const request = db.transaction("profile").objectStore("profile").get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private static put(db: IDBDatabase, key: string, value: ArtistProfile): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = db.transaction("profile", "readwrite").objectStore("profile").put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
