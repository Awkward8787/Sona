import type { MarkerName } from "../model/types";
import type { Cue, EffectName, Intent, TrackRef, VolumeTarget } from "./Intent";
import { IntentParser } from "./IntentParser";

export class LlmIntent {
  static enabled(): boolean {
    return Boolean(import.meta.env.VITE_SONA_LLM_URL);
  }

  static instructions(): string {
    return [
      "You convert a studio engineer's request into SONA intent JSON.",
      'Respond with {"intent": { "type": ... }} and no prose.',
      "Use only types from the SONA Intent union: record, stop, play, seek, arm, disarm, select, addTrack, renameTrack, deleteTrack, volume, mute, solo, pan, addEffect, removeEffect, trim, split, undo, redo, loop, master, export, setBpm, metronome, setMarker, help.",
      "Track refs are {kind:'index', index}, {kind:'name', name}, or {kind:'selected'}.",
      "If you are unsure, return {\"intent\": {\"type\": \"unknown\", \"text\": <original>}}.",
    ].join(" ");
  }

  static async complete(text: string): Promise<Intent | null> {
    const url = import.meta.env.VITE_SONA_LLM_URL;
    if (!url) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const key = import.meta.env.VITE_SONA_LLM_KEY;
      if (key) headers.authorization = `Bearer ${key}`;
      const response = await fetch(url, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({ text, schema: "sona.intent.v1", instructions: LlmIntent.instructions() }),
      });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      if (!LlmIntent.isRecord(payload)) return null;
      return LlmIntent.coerce("intent" in payload ? payload.intent : payload);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  static coerce(value: unknown): Intent | null {
    if (!LlmIntent.isRecord(value) || typeof value.type !== "string") return null;
    switch (value.type) {
      case "stop":
      case "split":
      case "undo":
      case "redo":
      case "help":
        return { type: value.type };
      case "export":
        return { type: "export", target: value.target === "stems" ? "stems" : "master" };
      case "play":
        return typeof value.fromStart === "boolean" ? { type: "play", fromStart: value.fromStart } : null;
      case "record":
        if (value.at == null) return { type: "record", at: null };
        {
          const at = LlmIntent.cue(value.at);
          return at ? { type: "record", at } : null;
        }
      case "seek": {
        const cue = LlmIntent.cue(value.cue);
        return cue ? { type: "seek", cue } : null;
      }
      case "arm": {
        const track = LlmIntent.track(value.track);
        return track && typeof value.exclusive === "boolean" ? { type: "arm", track, exclusive: value.exclusive } : null;
      }
      case "disarm":
        if (value.track === "all") return { type: "disarm", track: "all" };
        {
          const track = LlmIntent.track(value.track);
          return track ? { type: "disarm", track } : null;
        }
      case "select": {
        const track = LlmIntent.track(value.track);
        return track ? { type: "select", track } : null;
      }
      case "addTrack":
        return value.name == null || typeof value.name === "string" ? { type: "addTrack", name: value.name ?? null } : null;
      case "renameTrack": {
        const track = LlmIntent.track(value.track);
        return track && typeof value.name === "string" ? { type: "renameTrack", track, name: value.name } : null;
      }
      case "deleteTrack": {
        const track = LlmIntent.track(value.track);
        return track ? { type: "deleteTrack", track } : null;
      }
      case "volume": {
        const target = LlmIntent.volumeTarget(value.target);
        if (!target || (value.mode !== "relative" && value.mode !== "absolute") || typeof value.db !== "number") return null;
        return { type: "volume", target, mode: value.mode, db: value.db };
      }
      case "mute": {
        const track = LlmIntent.track(value.track);
        if (!track || (value.muted !== true && value.muted !== false && value.muted !== "toggle")) return null;
        return { type: "mute", track, muted: value.muted };
      }
      case "solo": {
        const track = LlmIntent.track(value.track);
        if (!track || (value.solo !== true && value.solo !== false && value.solo !== "toggle")) return null;
        return { type: "solo", track, solo: value.solo };
      }
      case "pan": {
        const track = LlmIntent.track(value.track);
        return track && typeof value.value === "number" ? { type: "pan", track, value: value.value } : null;
      }
      case "addEffect": {
        const track = LlmIntent.track(value.track);
        const effect = LlmIntent.effect(value.effect);
        return track && effect && typeof value.preset === "string"
          ? { type: "addEffect", track, effect, preset: value.preset }
          : null;
      }
      case "removeEffect": {
        const track = LlmIntent.track(value.track);
        const effect = LlmIntent.effect(value.effect);
        return track && effect ? { type: "removeEffect", track, effect } : null;
      }
      case "trim":
        if ((value.edge === "start" || value.edge === "end" || value.edge === "auto") && (value.seconds == null || typeof value.seconds === "number")) {
          return { type: "trim", edge: value.edge, seconds: value.seconds ?? null };
        }
        return null;
      case "loop":
        return LlmIntent.loop(value);
      case "master":
        if (value.preset === "off" || value.preset === "broadcast" || value.preset === "streaming" || value.preset === "loud" || value.preset === "louder" || value.preset === "quieter") {
          return { type: "master", preset: value.preset };
        }
        return null;
      case "setBpm":
        return typeof value.bpm === "number" ? { type: "setBpm", bpm: value.bpm } : null;
      case "metronome":
        if (value.enabled === true || value.enabled === false || value.enabled === "toggle") {
          return { type: "metronome", enabled: value.enabled };
        }
        return null;
      case "setMarker":
        return LlmIntent.marker(value.marker) ? { type: "setMarker", marker: value.marker as MarkerName } : null;
      case "unknown":
        return typeof value.text === "string" ? { type: "unknown", text: value.text } : null;
      default:
        return null;
    }
  }

  private static loop(value: Record<string, unknown>): Intent | null {
    if (value.mode === "clear") return { type: "loop", mode: "clear" };
    if (value.mode === "bars" && typeof value.bars === "number") return { type: "loop", mode: "bars", bars: value.bars };
    if (value.mode === "range" && typeof value.startSec === "number" && typeof value.endSec === "number") {
      return { type: "loop", mode: "range", startSec: value.startSec, endSec: value.endSec };
    }
    if (value.mode === "marker" && LlmIntent.marker(value.marker)) {
      return { type: "loop", mode: "marker", marker: value.marker as MarkerName };
    }
    return null;
  }

  private static track(value: unknown): TrackRef | null {
    if (!LlmIntent.isRecord(value)) return null;
    if (value.kind === "selected") return { kind: "selected" };
    if (value.kind === "index" && typeof value.index === "number") return { kind: "index", index: value.index };
    if (value.kind === "name" && typeof value.name === "string") return { kind: "name", name: value.name };
    return null;
  }

  private static volumeTarget(value: unknown): VolumeTarget | null {
    if (!LlmIntent.isRecord(value)) return null;
    if (value.kind === "master") return { kind: "master" };
    return LlmIntent.track(value);
  }

  private static cue(value: unknown): Cue | null {
    if (!LlmIntent.isRecord(value)) return null;
    if (value.kind === "start") return { kind: "start" };
    if (value.kind === "marker" && LlmIntent.marker(value.marker)) return { kind: "marker", marker: value.marker as MarkerName };
    if (value.kind === "bar" && typeof value.bar === "number") return { kind: "bar", bar: value.bar };
    if (value.kind === "seconds" && typeof value.seconds === "number") return { kind: "seconds", seconds: value.seconds };
    if (value.kind === "lyric" && typeof value.text === "string") return { kind: "lyric", text: value.text };
    return null;
  }

  private static effect(value: unknown): EffectName | null {
    if (value === "eq" || value === "compressor" || value === "reverb") return value;
    return null;
  }

  private static marker(value: unknown): value is MarkerName {
    return value === "intro" || value === "verse" || value === "chorus" || value === "bridge";
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}

export class Engineer {
  static async interpret(text: string): Promise<Intent> {
    const local = IntentParser.parse(text);
    if (local.type !== "unknown" || !LlmIntent.enabled()) return local;
    const remote = await LlmIntent.complete(text);
    if (!remote || remote.type === "unknown") return local;
    return remote;
  }
}
