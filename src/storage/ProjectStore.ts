import { ProjectFactory } from "../model/ProjectFactory";
import type { ChatMessage, Project, StoredBuffer } from "../model/types";

export interface SessionSummary {
  id: string;
  name: string;
  updatedAt: number;
}

export interface LoadedSession {
  project: Project;
  messages: ChatMessage[];
  buffers: Record<string, StoredBuffer>;
}

interface SavedSession {
  project: Project;
  messages: ChatMessage[];
}

interface SavedBuffer {
  sampleRate: number;
  channels: ArrayBuffer[];
}

export class ProjectStore {
  private db: IDBDatabase | null = null;
  private known = new Set<string>();

  async open(): Promise<void> {
    if (this.db) return;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("sona", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions");
        if (!db.objectStoreNames.contains("buffers")) db.createObjectStore("buffers");
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Couldn't open the local session store."));
    });
  }

  async save(project: Project, buffers: Record<string, StoredBuffer>, messages: ChatMessage[]): Promise<void> {
    const db = await this.connection();
    const saved: SavedSession = { project, messages: messages.slice(-80) };
    await ProjectStore.put(db, "sessions", project.id, saved);
    const fresh = Object.values(buffers).filter((buffer) => !this.known.has(buffer.id));
    if (fresh.length > 0) {
      await ProjectStore.transaction(db, "buffers", "readwrite", (store) => {
        for (const buffer of fresh) {
          const channels = buffer.channels.map((channel) => {
            const copy = new ArrayBuffer(channel.byteLength);
            new Float32Array(copy).set(channel);
            return copy;
          });
          store.put({ sampleRate: buffer.sampleRate, channels } satisfies SavedBuffer, buffer.id);
        }
      });
      fresh.forEach((buffer) => this.known.add(buffer.id));
    }
    await ProjectStore.put(db, "meta", "last", project.id);
  }

  async load(id: string): Promise<LoadedSession | null> {
    const db = await this.connection();
    const saved = await ProjectStore.get<SavedSession>(db, "sessions", id);
    if (!saved?.project) return null;
    const ids = new Set<string>();
    for (const track of saved.project.tracks) {
      for (const clip of track.clips) ids.add(clip.bufferId);
    }
    const buffers: Record<string, StoredBuffer> = {};
    for (const bufferId of ids) {
      const stored = await ProjectStore.get<SavedBuffer>(db, "buffers", bufferId);
      if (!stored) continue;
      buffers[bufferId] = {
        id: bufferId,
        sampleRate: stored.sampleRate,
        channels: stored.channels.map((channel) => new Float32Array(channel.slice(0))),
      };
      this.known.add(bufferId);
    }
    return { project: ProjectFactory.hydrate(saved.project), messages: saved.messages ?? [], buffers };
  }

  async list(): Promise<SessionSummary[]> {
    const db = await this.connection();
    const all = await ProjectStore.values<SavedSession>(db, "sessions");
    return all
      .map((item) => ({ id: item.project.id, name: item.project.name, updatedAt: item.project.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async lastId(): Promise<string | null> {
    const db = await this.connection();
    const id = await ProjectStore.get<string>(db, "meta", "last");
    return id ?? null;
  }

  async remove(id: string): Promise<void> {
    const db = await this.connection();
    const saved = await ProjectStore.get<SavedSession>(db, "sessions", id);
    const bufferIds = new Set<string>();
    saved?.project.tracks.forEach((track) => track.clips.forEach((clip) => bufferIds.add(clip.bufferId)));
    await ProjectStore.transaction(db, "sessions", "readwrite", (store) => store.delete(id));
    if (bufferIds.size > 0) {
      await ProjectStore.transaction(db, "buffers", "readwrite", (store) => {
        bufferIds.forEach((bufferId) => store.delete(bufferId));
      });
      bufferIds.forEach((bufferId) => this.known.delete(bufferId));
    }
    const last = await this.lastId();
    if (last === id) await ProjectStore.put(db, "meta", "last", "");
  }

  private async connection(): Promise<IDBDatabase> {
    await this.open();
    if (!this.db) throw new Error("Local session store is unavailable.");
    return this.db;
  }

  private static put(db: IDBDatabase, name: string, key: IDBValidKey, value: unknown): Promise<void> {
    return ProjectStore.transaction(db, name, "readwrite", (store) => {
      store.put(value, key);
    });
  }

  private static get<T>(db: IDBDatabase, name: string, key: IDBValidKey): Promise<T | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, "readonly");
      const request = tx.objectStore(name).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Couldn't read the local session."));
    });
  }

  private static values<T>(db: IDBDatabase, name: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, "readonly");
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => resolve((request.result as T[]) ?? []);
      request.onerror = () => reject(request.error ?? new Error("Couldn't list local sessions."));
    });
  }

  private static transaction(
    db: IDBDatabase,
    name: string,
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode);
      run(tx.objectStore(name));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Couldn't write the local session."));
      tx.onabort = () => reject(tx.error ?? new Error("Local save was aborted."));
    });
  }
}
