import { Ids } from "../model/Ids";
import { ProjectFactory } from "../model/ProjectFactory";
import { ProjectOps } from "../model/ProjectOps";
import type { Clip, Project, StoredBuffer } from "../model/types";

/** A generated drum pattern so a booth can start without a session file. Not a commercial beat. */
export class ScratchBeat {
  static buffer(bpm: number, bars = 8, sampleRate = 44100): StoredBuffer {
    const beat = 60 / Math.max(1, bpm);
    const duration = beat * 4 * bars;
    const length = Math.floor(duration * sampleRate);
    const samples = new Float32Array(length);
    const beats = bars * 4;
    for (let index = 0; index < beats; index += 1) {
      const at = Math.floor(index * beat * sampleRate);
      ScratchBeat.kick(samples, at, sampleRate, index % 4 === 0 ? 0.85 : 0.55);
      if (index % 2 === 1) ScratchBeat.hat(samples, at, sampleRate, 0.22);
      else ScratchBeat.hat(samples, Math.floor(at + beat * 0.5 * sampleRate), sampleRate, 0.12);
    }
    return { id: Ids.next(), sampleRate, channels: [samples] };
  }

  static place(project: Project, buffer: StoredBuffer): { project: Project; buffer: StoredBuffer } {
    const existing = project.tracks.find((track) => track.name.toLowerCase() === "beat");
    const track = { ...(existing ?? ProjectFactory.track("Beat", project.tracks.length)), armed: false };
    const clip: Clip = {
      id: Ids.next(),
      bufferId: buffer.id,
      startSec: 0,
      offsetSec: 0,
      durationSec: buffer.channels[0].length / buffer.sampleRate,
      sourceDurationSec: buffer.channels[0].length / buffer.sampleRate,
    };
    let next = existing ? project : ProjectOps.touch(project, { tracks: [...project.tracks, track] });
    next = ProjectOps.addClip(next, track.id, clip);
    return { project: next, buffer };
  }

  private static kick(samples: Float32Array, at: number, sampleRate: number, gain: number): void {
    const length = Math.floor(sampleRate * 0.12);
    for (let i = 0; i < length && at + i < samples.length; i += 1) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 18);
      const freq = 140 * Math.exp(-t * 14) + 45;
      samples[at + i] += Math.sin(2 * Math.PI * freq * t) * env * gain;
    }
  }

  private static hat(samples: Float32Array, at: number, sampleRate: number, gain: number): void {
    const length = Math.floor(sampleRate * 0.04);
    let state = (at * 17) % 1000;
    for (let i = 0; i < length && at + i < samples.length; i += 1) {
      state = (state * 1103515245 + 12345) % 2147483647;
      const noise = state / 2147483647 * 2 - 1;
      const env = Math.exp((-i / sampleRate) * 80);
      samples[at + i] += noise * env * gain;
    }
  }
}
