import { AudioEngine } from "../audio/AudioEngine";
import { WavEncoder } from "../audio/WavEncoder";
import type { Project, StoredBuffer } from "../model/types";
import { ZipStore } from "./ZipStore";

export class ExportEngine {
  static async master(project: Project, buffers: Record<string, StoredBuffer>, sampleRate = 44100): Promise<Blob> {
    const audio = await AudioEngine.render(project, buffers, sampleRate);
    return WavEncoder.encode(ExportEngine.channels(audio), audio.sampleRate);
  }

  static async stems(project: Project, buffers: Record<string, StoredBuffer>, sampleRate = 44100): Promise<Blob> {
    const files: Array<{ name: string; data: Uint8Array }> = [];
    for (const track of project.tracks) {
      if (track.clips.length === 0) continue;
      const soloed: Project = {
        ...project,
        tracks: project.tracks.map((item) => ({ ...item, solo: item.id === track.id, mute: false })),
      };
      const audio = await AudioEngine.render(soloed, buffers, sampleRate);
      const safe = track.name.replace(/[^\w.-]+/g, "-").replace(/^-|-$/g, "") || "track";
      files.push({ name: `${safe}.wav`, data: WavEncoder.bytes(ExportEngine.channels(audio), audio.sampleRate) });
    }
    return new Blob([ZipStore.store(files).buffer as ArrayBuffer], { type: "application/zip" });
  }

  private static channels(audio: AudioBuffer): Float32Array[] {
    const channels: Float32Array[] = [];
    for (let index = 0; index < audio.numberOfChannels; index += 1) channels.push(audio.getChannelData(index).slice());
    return channels;
  }
}
