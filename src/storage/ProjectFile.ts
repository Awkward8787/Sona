import { ProjectFactory } from "../model/ProjectFactory";
import type { Project, StoredBuffer } from "../model/types";

interface PackedBuffer {
  id: string;
  sampleRate: number;
  channels: string[];
}

interface PackedProject {
  kind: "sona-project";
  version: 2;
  project: Project;
  buffers: PackedBuffer[];
}

/** A local project file. Samples stay PCM floats inside JSON, not a second session format. */
export class ProjectFile {
  static readonly KIND = "sona-project";
  static readonly VERSION = 2;

  static pack(project: Project, buffers: Record<string, StoredBuffer>): string {
    const packed: PackedProject = {
      kind: ProjectFile.KIND,
      version: ProjectFile.VERSION,
      project,
      buffers: Object.values(buffers).map((buffer) => ({
        id: buffer.id,
        sampleRate: buffer.sampleRate,
        channels: buffer.channels.map((channel) => ProjectFile.encode(channel)),
      })),
    };
    return JSON.stringify(packed);
  }

  static unpack(text: string): { project: Project; buffers: Record<string, StoredBuffer> } | null {
    try {
      const parsed = JSON.parse(text) as PackedProject;
      if (parsed.kind !== ProjectFile.KIND || parsed.version !== ProjectFile.VERSION || !parsed.project) return null;
      const buffers: Record<string, StoredBuffer> = {};
      for (const buffer of parsed.buffers ?? []) {
        buffers[buffer.id] = {
          id: buffer.id,
          sampleRate: buffer.sampleRate,
          channels: buffer.channels.map((channel) => ProjectFile.decode(channel)),
        };
      }
      return { project: ProjectFactory.hydrate(parsed.project), buffers };
    } catch {
      return null;
    }
  }

  static filename(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `sona-${slug || "session"}.sona.json`;
  }

  private static encode(channel: Float32Array): string {
    const bytes = new Uint8Array(channel.buffer, channel.byteOffset, channel.byteLength);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ?? 0);
    return btoa(binary);
  }

  private static decode(text: string): Float32Array {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Float32Array(copy.buffer);
  }
}
