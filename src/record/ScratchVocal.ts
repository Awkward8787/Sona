import { Ids } from "../model/Ids";
import { ProjectOps } from "../model/ProjectOps";
import type { Clip, Project, StoredBuffer, Take, Track } from "../model/types";

/**
 * Two generated tones so a session can comp without a microphone.
 * They are not a vocal performance and they carry no invented lyrics.
 */
export class ScratchVocal {
  static place(project: Project): { project: Project; buffers: StoredBuffer[]; reply: string } {
    const host = ScratchVocal.host(project);
    if (!host) return { project, buffers: [], reply: "There's no vocal track for a scratch tone." };
    const first = ScratchVocal.tone(4.5, 196, 0.22);
    const second = ScratchVocal.tone(3.2, 247, 0.18);
    const firstNumber = host.takes.length + 1;
    const secondNumber = host.takes.length + 2;
    const takeOne = ScratchVocal.take(host, firstNumber, first, 0);
    const takeTwo = ScratchVocal.take(host, secondNumber, second, 0);
    const clip: Clip = {
      id: Ids.next(),
      bufferId: first.id,
      startSec: 0,
      offsetSec: 0,
      durationSec: ScratchVocal.seconds(first),
      sourceDurationSec: ScratchVocal.seconds(first),
    };
    let next = ProjectOps.updateTrack(project, host.id, (track) => ({
      ...track,
      takes: [...track.takes, takeOne, takeTwo],
      clips: [...track.clips, clip].sort((a, b) => a.startSec - b.startSec),
    }));
    next = { ...next, selectedTrackId: host.id, selectedClipId: clip.id };
    return {
      project: next,
      buffers: [first, second],
      reply: `Scratch tones are on ${host.name}. Take ${takeOne.number} is in the arrangement. Take ${takeTwo.number} is only a comp lane. Neither one is a microphone recording.`,
    };
  }

  private static host(project: Project): Track | null {
    return project.tracks.find((track) => /vocal|lead/i.test(track.name))
      ?? project.tracks.find((track) => track.id === project.selectedTrackId)
      ?? project.tracks.find((track) => !/beat|instrument/i.test(track.name))
      ?? null;
  }

  private static take(track: Track, number: number, buffer: StoredBuffer, startSec: number): Take {
    return {
      id: Ids.next(),
      number,
      rawBufferId: buffer.id,
      startSec,
      durationSec: ScratchVocal.seconds(buffer),
      words: [],
      micId: track.micId,
      preampId: track.preampId,
    };
  }

  private static seconds(buffer: StoredBuffer): number {
    const channel = buffer.channels[0];
    return channel && buffer.sampleRate > 0 ? channel.length / buffer.sampleRate : 0;
  }

  private static tone(seconds: number, frequency: number, gain: number, sampleRate = 44100): StoredBuffer {
    const length = Math.floor(seconds * sampleRate);
    const samples = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      const time = index / sampleRate;
      const env = Math.min(1, time * 12) * Math.min(1, (seconds - time) * 8);
      const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5 * time);
      samples[index] = Math.sin(2 * Math.PI * frequency * vibrato * time) * env * gain;
    }
    return { id: Ids.next(), sampleRate, channels: [samples] };
  }
}
