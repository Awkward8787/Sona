import { Ids } from "./Ids";
import { CuePoint } from "./CuePoint";
import type {
  CompressorSettings,
  DelaySettings,
  EqSettings,
  Markers,
  Project,
  ReverbSettings,
  Track,
  TuneSettings,
} from "./types";

export class ProjectFactory {
  static readonly MAX_TRACKS = 16;

  private static readonly colors = ["#e6c48a", "#d9d4cb", "#cbb59a", "#f0e6d4", "#b9c6c2", "#e2b8a2"];

  static create(name = "Session 1"): Project {
    const now = Date.now();
    const vocal = ProjectFactory.track("Vocal", 0);
    vocal.armed = true;
    const second = ProjectFactory.track("Track 2", 1);
    return {
      id: Ids.next(),
      name,
      bpm: 120,
      metronome: false,
      tracks: [vocal, second],
      selectedTrackId: vocal.id,
      selectedClipId: null,
      masterPreset: "off",
      masterGainDb: 0,
      loop: null,
      markers: ProjectFactory.defaultMarkers(120),
      createdAt: now,
      updatedAt: now,
    };
  }

  static track(name: string, index: number): Track {
    return {
      id: Ids.next(),
      name,
      color: ProjectFactory.colors[index % ProjectFactory.colors.length],
      armed: false,
      mute: false,
      solo: false,
      gainDb: 0,
      pan: 0,
      width: 0,
      clips: [],
      eq: ProjectFactory.eqOff(),
      compressor: ProjectFactory.compressorOff(),
      reverb: ProjectFactory.reverbOff(),
      micId: "modern-condenser",
      preampId: "clean",
      micNudge: 0,
      takes: [],
      tune: ProjectFactory.tuneOff(),
      delay: ProjectFactory.delayOff(),
    };
  }

  static tuneOff(): TuneSettings {
    return { enabled: false, strength: 0.55, key: "C", scale: "major" };
  }

  static delayOff(): DelaySettings {
    return { enabled: false, mix: 0.22, timeSec: 0.28, feedback: 0.28 };
  }

  static hydrate(project: Project): Project {
    return {
      ...project,
      tracks: project.tracks.map((track, index) => ProjectFactory.hydrateTrack(track, index)),
    };
  }

  static hydrateTrack(track: Track, index: number): Track {
    const blank = ProjectFactory.track(track.name || `Track ${index + 1}`, index);
    return {
      ...blank,
      ...track,
      micId: track.micId ?? blank.micId,
      preampId: track.preampId ?? blank.preampId,
      micNudge: track.micNudge ?? 0,
      takes: track.takes ?? [],
      tune: track.tune ?? blank.tune,
      delay: track.delay ?? blank.delay,
      eq: track.eq ?? blank.eq,
      compressor: track.compressor ?? blank.compressor,
      reverb: track.reverb ?? blank.reverb,
      clips: track.clips ?? [],
      width: track.width ?? 0,
    };
  }

  static defaultMarkers(bpm: number): Markers {
    const bar = CuePoint.barSeconds(bpm);
    return {
      intro: 0,
      verse: bar * 4,
      chorus: bar * 12,
      bridge: bar * 20,
    };
  }

  static eqOff(): EqSettings {
    return { enabled: false, preset: "flat", lowDb: 0, midDb: 0, highDb: 0 };
  }

  static compressorOff(): CompressorSettings {
    return {
      enabled: false,
      preset: "gentle",
      threshold: -18,
      ratio: 2,
      attack: 0.02,
      release: 0.25,
      makeupDb: 0,
    };
  }

  static reverbOff(): ReverbSettings {
    return { enabled: false, preset: "room", mix: 0.22, decay: 0.7 };
  }
}
