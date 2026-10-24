import type { MarkerName, MasterPreset, PreampId, VirtualMicId } from "../model/types";

export type TrackRef =
  | { kind: "index"; index: number }
  | { kind: "name"; name: string }
  | { kind: "selected" };

export type VolumeTarget = TrackRef | { kind: "master" };

export type EffectName = "eq" | "compressor" | "reverb";

export type Cue =
  | { kind: "start" }
  | { kind: "marker"; marker: MarkerName }
  | { kind: "bar"; bar: number }
  | { kind: "seconds"; seconds: number }
  | { kind: "lyric"; text: string };

export type MicMove = "warmer" | "brighter" | "darker" | "presence";

export type MixAxis = "brighter" | "air" | "harsh" | "mud" | "reverb" | "delay";

export type Intent =
  | { type: "record"; at: Cue | null }
  | { type: "stop" }
  | { type: "play"; fromStart: boolean }
  | { type: "seek"; cue: Cue }
  | { type: "arm"; track: TrackRef; exclusive: boolean }
  | { type: "disarm"; track: TrackRef | "all" }
  | { type: "select"; track: TrackRef }
  | { type: "addTrack"; name: string | null }
  | { type: "renameTrack"; track: TrackRef; name: string }
  | { type: "deleteTrack"; track: TrackRef }
  | { type: "volume"; target: VolumeTarget; mode: "relative" | "absolute"; db: number }
  | { type: "mute"; track: TrackRef; muted: boolean | "toggle" }
  | { type: "solo"; track: TrackRef; solo: boolean | "toggle" }
  | { type: "pan"; track: TrackRef; value: number }
  | { type: "addEffect"; track: TrackRef; effect: EffectName; preset: string; presetSpecified?: boolean }
  | { type: "removeEffect"; track: TrackRef; effect: EffectName }
  | { type: "trim"; edge: "start" | "end" | "auto"; seconds: number | null }
  | { type: "split" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "loop"; mode: "clear" }
  | { type: "loop"; mode: "bars"; bars: number }
  | { type: "loop"; mode: "range"; startSec: number; endSec: number }
  | { type: "loop"; mode: "marker"; marker: MarkerName }
  | { type: "master"; preset: MasterPreset | "louder" | "quieter" }
  | { type: "export"; target: "master" | "stems" }
  | { type: "sessionStart" }
  | { type: "findMic" }
  | { type: "hearMics"; ranks: [number, number] }
  | { type: "chooseMic"; rank: number }
  | { type: "toggleAudition" }
  | { type: "setMic"; mic: VirtualMicId | null; move: MicMove | null }
  | { type: "setPreamp"; preamp: PreampId }
  | { type: "saveTake" }
  | { type: "deleteTake"; number: number }
  | { type: "compareTakes"; a: number; b: number }
  | { type: "compTakes"; assignments: Array<{ take: number; marker: MarkerName }> }
  | { type: "tune"; tighter: boolean | null; key: string | null; scale: "major" | "minor" | null }
  | { type: "mixAdjust"; axis: MixAxis }
  | { type: "widenDoubles" }
  | { type: "commandWindow"; open: boolean }
  | { type: "recallMemory" }
  | { type: "importBeat" }
  | { type: "loadScratch" }
  | { type: "loadScratchVocal" }
  | { type: "micCheck" }
  | { type: "monitor"; enabled: boolean }
  | { type: "inputGain"; db: number }
  | { type: "rememberName"; name: string }
  | { type: "applyChain" }
  | { type: "analyze" }
  | { type: "fixVocal" }
  | { type: "clearProject" }
  | { type: "setBpm"; bpm: number }
  | { type: "metronome"; enabled: boolean | "toggle" }
  | { type: "setMarker"; marker: MarkerName }
  | { type: "help" }
  | { type: "unknown"; text: string };

export type IntentType = Intent["type"];
