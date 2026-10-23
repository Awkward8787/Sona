import type { MarkerName } from "../model/types";
import { Numbers } from "../model/Numbers";
import { boothPhrase } from "./BoothPhrases";
import type { Cue, EffectName, Intent, TrackRef, VolumeTarget } from "./Intent";

const MARKERS = ["intro", "verse", "chorus", "bridge"] as const;

export class IntentParser {
  static parse(raw: string): Intent {
    const early = IntentParser.beforeFiller(raw);
    if (early) return early;
    const text = IntentParser.normalize(raw);
    if (!text) return { type: "unknown", text: raw.trim() };
    const booth = boothPhrase(text);
    if (booth) return booth;
    const rules = [
      IntentParser.help,
      IntentParser.undoRedo,
      IntentParser.metronome,
      IntentParser.bpm,
      IntentParser.transportLoop,
      IntentParser.exportCommand,
      IntentParser.master,
      IntentParser.loop,
      IntentParser.marker,
      IntentParser.navigation,
      IntentParser.record,
      IntentParser.effects,
      IntentParser.volume,
      IntentParser.pan,
      IntentParser.muteSolo,
      IntentParser.arm,
      IntentParser.trackEdit,
      IntentParser.trim,
      IntentParser.split,
      IntentParser.playStop,
    ];
    for (const rule of rules) {
      const intent = rule(text);
      if (intent) return intent;
    }
    return { type: "unknown", text: raw.trim() };
  }

  private static beforeFiller(raw: string): Intent | null {
    let text = raw.toLowerCase().trim();
    text = text.replace(/['’]/g, "");
    text = text.replace(/[^a-z0-9\s]/g, " ");
    text = text.replace(/\s+/g, " ").trim();
    for (let i = 0; i < 4; i += 1) text = text.replace(/^(?:hey|hi|ok|okay|please|sona)\s+/, "");
    if (/^(?:lets|let us)\s+work$/.test(text)) return { type: "sessionStart" };
    return null;
  }

  static normalize(raw: string): string {
    let text = raw.toLowerCase().trim();
    text = text.replace(/['’]/g, "");
    text = text.replace(/(\d)\.(?!\d)/g, "$1");
    text = text.replace(/(?<!\d)\./g, " ");
    text = text.replace(/-(\d)/g, "neg$1");
    text = text.replace(/([a-z])-([a-z])/g, "$1$2");
    text = text.replace(/[^a-z0-9.\s-]/g, " ");
    text = text.replace(/neg(\d)/g, "-$1");
    text = text.replace(/\bdecibels?\b/g, "db");
    text = text.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+db\b/g, (_, word: string) => {
      return `${Numbers.word(word) ?? word} db`;
    });
    text = text.replace(/\s+/g, " ").trim();
    const filler = /^(?:hey|hi|ok|okay|please|sona|can you|could you|would you|will you|lets|let us|go ahead and|just)\s+/;
    for (let i = 0; i < 6 && filler.test(text); i += 1) text = text.replace(filler, "");
    text = text.replace(/\s+please$/, "").trim();
    return text;
  }

  private static help(text: string): Intent | null {
    if (/^(?:help|what can you do|what can i say|commands|what do you understand)$/.test(text)) {
      return { type: "help" };
    }
    return null;
  }

  private static undoRedo(text: string): Intent | null {
    if (text === "undo" || text === "undo that" || text === "go back" || text === "take that back") {
      return { type: "undo" };
    }
    if (text === "redo" || text === "redo that") return { type: "redo" };
    return null;
  }

  private static metronome(text: string): Intent | null {
    if (/^toggle\s+(?:the\s+)?(?:metronome|click|click track)$/.test(text)) {
      return { type: "metronome", enabled: "toggle" };
    }
    const match = text.match(/^(?:turn\s+)?(?:the\s+)?(?:metronome|click|click track)\s+(on|off)$/);
    if (!match) return null;
    return { type: "metronome", enabled: match[1] === "on" };
  }

  private static bpm(text: string): Intent | null {
    const match = text.match(/^(?:set\s+)?(?:the\s+)?(?:bpm|tempo)\s+(?:to\s+|at\s+)?(\d+(?:\.\d+)?)$/)
      ?? text.match(/^(\d+(?:\.\d+)?)\s*bpm$/);
    if (!match) return null;
    return { type: "setBpm", bpm: Math.round(Number(match[1])) };
  }

  private static transportLoop(text: string): Intent | null {
    if (/^(?:clear the loop|stop looping|loop off|unloop|disable the loop|turn the loop off)$/.test(text)) {
      return { type: "loop", mode: "clear" };
    }
    return null;
  }

  private static exportCommand(text: string): Intent | null {
    if (/\bstems\b/.test(text) && /^(?:bounce|export|download|render)\b/.test(text)) {
      return { type: "export", target: "stems" };
    }
    if (/^(?:bounce|export|download|render)(?:\s+(?:it|the mix|the track|a wav|to wav|wav|the session|my master|the master|master))?$/.test(text)) {
      return { type: "export", target: "master" };
    }
    if (text === "print it" || text === "print the mix") return { type: "export", target: "master" };
    return null;
  }

  private static master(text: string): Intent | null {
    if (text === "master it louder" || text === "master louder" || text === "make the master louder") {
      return { type: "master", preset: "louder" };
    }
    if (text === "master it quieter" || text === "master quieter" || text === "make the master quieter") {
      return { type: "master", preset: "quieter" };
    }
    if (/^(?:master off|bypass the master|master bypass|unmaster)$/.test(text)) {
      return { type: "master", preset: "off" };
    }
    const named = text.match(/^master(?:\s+(?:it|the mix|this))?\s+for\s+(streaming|broadcast|loud)$/);
    if (named?.[1] === "streaming" || named?.[1] === "broadcast" || named?.[1] === "loud") {
      return { type: "master", preset: named[1] };
    }
    if (/^(?:master|master it|master the mix|master this)$/.test(text)) {
      return { type: "master", preset: "streaming" };
    }
    return null;
  }

  private static loop(text: string): Intent | null {
    if (text === "loop" || text === "loop this" || text === "loop it") {
      return { type: "loop", mode: "bars", bars: 4 };
    }
    const bars = text.match(/^loop\s+(\d+)\s+bars?$/);
    if (bars) return { type: "loop", mode: "bars", bars: Number(bars[1]) };
    const marker = text.match(/^loop\s+(?:the\s+)?(intro|verse|chorus|bridge)$/);
    if (marker) return { type: "loop", mode: "marker", marker: marker[1] as MarkerName };
    const range = text.match(/^loop\s+from\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?\s+to\s+(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)?$/);
    if (range) {
      return { type: "loop", mode: "range", startSec: Number(range[1]), endSec: Number(range[2]) };
    }
    return null;
  }

  private static marker(text: string): Intent | null {
    const match = text.match(/^(?:mark|set)\s+(?:the\s+)?(intro|verse|chorus|bridge)(?:\s+here)?$/);
    if (!match) return null;
    return { type: "setMarker", marker: match[1] as MarkerName };
  }

  private static navigation(text: string): Intent | null {
    if (/^(?:rewind|back to the top|back to the start|go to the start|go to the top|go to the beginning|go back to the top|go back to the start)$/.test(text)) {
      return { type: "seek", cue: { kind: "start" } };
    }
    const match = text.match(/^(?:go to|skip to|jump to)\s+(.+)$/);
    if (!match) return null;
    const cue = IntentParser.cue(match[1]);
    if (cue) return { type: "seek", cue };
    return { type: "select", track: IntentParser.track(match[1]) };
  }

  private static record(text: string): Intent | null {
    const at = text.match(/^(?:punch(?:\s+me)?\s+in|record|rec)\s+(?:at\s+|on\s+)?(?:the\s+)?(.+)$/);
    if (at && at[1] && !/^(?:recording|tape)$/.test(at[1])) {
      const cue = IntentParser.cue(at[1]);
      if (cue) return { type: "record", at: cue };
      if (at[1].length > 2) return { type: "record", at: { kind: "lyric", text: at[1] } };
    }
    if (/^(?:record|rec|start recording|roll|roll tape|punch in|punch me in)$/.test(text)) {
      return { type: "record", at: null };
    }
    return null;
  }

  private static effects(text: string): Intent | null {
    const brighten = text.match(/^brighten\s+(?:the\s+)?(.+)$/);
    if (brighten) return { type: "addEffect", track: IntentParser.track(brighten[1]), effect: "eq", preset: "air", presetSpecified: true };
    const compress = text.match(/^compress\s+(?:the\s+)?(.+)$/);
    if (compress) {
      return { type: "addEffect", track: IntentParser.track(compress[1]), effect: "compressor", preset: "vocal", presetSpecified: false };
    }
    const color = text.match(/^(?:add|give)\s+(?:some\s+)?(warmth|air|presence)\s+(?:to\s+)?(?:the\s+)?(.+)$/);
    if (color && color[1] && color[2]) {
      return { type: "addEffect", track: IntentParser.track(color[2]), effect: "eq", preset: color[1], presetSpecified: true };
    }
    const space = text.match(/^(?:add|put|throw)\s+(?:some\s+)?(room|hall|plate)\s+(?:reverb\s+)?(?:on|to)\s+(?:the\s+)?(.+)$/);
    if (space && space[1] && space[2]) {
      return { type: "addEffect", track: IntentParser.track(space[2]), effect: "reverb", preset: space[1], presetSpecified: true };
    }

    const give = text.match(/^give\s+(?:the\s+)?(.+?)\s+(?:some|a little|a bit of|a)\s+(?:(room|hall|plate|warmth|air|presence|vocal|gentle|punch)\s+)?(reverb|eq|compression|compressor)$/);
    if (give) {
      return {
        type: "addEffect",
        track: IntentParser.track(give[1]),
        effect: IntentParser.effectName(give[3]),
        preset: give[2] ?? IntentParser.defaultPreset(IntentParser.effectName(give[3])),
        presetSpecified: Boolean(give[2]),
      };
    }

    const removed = text.match(/^(?:remove|clear|bypass|disable)\s+(?:the\s+)?(reverb|eq|compression|compressor)(?:\s+(?:from|on|off))+\s*(?:the\s+)?(.+)$/)
      ?? text.match(/^take\s+(?:the\s+)?(reverb|eq|compression|compressor)\s+off\s+(?:the\s+)?(.+)$/)
      ?? text.match(/^turn\s+(?:the\s+)?(reverb|eq|compression|compressor)\s+off(?:\s+(?:on|for))?\s*(?:the\s+)?(.+)$/);
    if (removed) {
      return { type: "removeEffect", track: IntentParser.track(removed[2]), effect: IntentParser.effectName(removed[1]) };
    }

    const added = text.match(/^(?:add|put|throw|insert|enable|engage)\s+(?:some\s+|a\s+little\s+|a\s+bit\s+of\s+|a\s+)?(?:(room|hall|plate|vocal|gentle|punch|warmth|air|presence|flat)\s+)?(reverb|eq|compression|compressor)(?:\s+(?:to|on|onto))?\s*(?:the\s+)?(.*)$/);
    if (added) {
      const effect = IntentParser.effectName(added[2]);
      const trackPhrase = added[3].trim();
      return {
        type: "addEffect",
        track: trackPhrase ? IntentParser.track(trackPhrase) : { kind: "selected" },
        effect,
        preset: added[1] ?? IntentParser.defaultPreset(effect),
        presetSpecified: Boolean(added[1]),
      };
    }
    return null;
  }

  private static volume(text: string): Intent | null {
    const looks = /\bdb\b/.test(text)
      || /\b(louder|quieter|softer)\b/.test(text)
      || /\b(volume|gain|level)\b/.test(text)
      || /\b(boost|nudge)\b/.test(text)
      || /^(?:bring|turn|raise|lower|drop|cut|add)\b/.test(text);
    if (!looks) return null;
    if (/\b(reverb|compressor|compression|eq|track called|metronome|click)\b/.test(text)) return null;

    const dbMatch = text.match(/(-?\d+(?:\.\d+)?)\s*db/);
    const db = dbMatch ? Number(dbMatch[1]) : null;
    let direction: -1 | 0 | 1 = 0;
    if (/\b(down|lower|drop|quieter|softer)\b/.test(text) || (/\bcut\b/.test(text) && db !== null)) direction = -1;
    else if (/\b(up|raise|boost|bump|louder)\b/.test(text) || (/\badd\b/.test(text) && db !== null)) direction = 1;

    const absolute = db !== null && /\bto\b/.test(text) && /\b(set|volume|level|gain)\b/.test(text);
    if (!absolute && direction === 0) return null;

    const rest = text
      .replace(/-?\d+(?:\.\d+)?\s*db/g, " ")
      .replace(/\b(bring|bump|push|turn|take|move|nudge|raise|lower|boost|cut|drop|set|volume|level|gain|of|by|up|down|to|bit|little|touch|slightly|much|lot|the|please|louder|quieter|softer|some|add|from|db|a)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (rest.split(" ").filter(Boolean).length > 4) return null;

    const target = IntentParser.volumeTarget(rest);
    if (absolute && db !== null) return { type: "volume", target, mode: "absolute", db };
    let amount = db ?? 3;
    if (db === null && /\b(bit|little|touch|slightly)\b/.test(text)) amount = 1.5;
    if (db === null && /\b(much|lot)\b/.test(text)) amount = 6;
    return { type: "volume", target, mode: "relative", db: direction * amount };
  }

  private static pan(text: string): Intent | null {
    if (text === "center" || text === "centre" || text === "center it" || text === "centre it") {
      return { type: "pan", track: { kind: "selected" }, value: 0 };
    }
    const center = text.match(/^(?:center|centre)\s+(?:the\s+)?(.+)$/);
    if (center) return { type: "pan", track: IntentParser.track(center[1]), value: 0 };

    const positions: Array<[string, number]> = [
      ["hard left", -1],
      ["full left", -1],
      ["all the way left", -1],
      ["slightly left", -0.35],
      ["a bit left", -0.35],
      ["hard right", 1],
      ["full right", 1],
      ["all the way right", 1],
      ["slightly right", 0.35],
      ["a bit right", 0.35],
      ["center", 0],
      ["centre", 0],
      ["middle", 0],
      ["left", -0.65],
      ["right", 0.65],
    ];
    for (const [phrase, value] of positions) {
      if (text === `pan ${phrase}` || text === `pan it ${phrase}`) {
        return { type: "pan", track: { kind: "selected" }, value };
      }
    }
    const choices = positions.map(([phrase]) => phrase).join("|");
    const match = text.match(new RegExp(`^pan\\s+(?:the\\s+)?(.+?)\\s+(?:to\\s+(?:the\\s+)?)?(${choices})$`));
    if (!match) return null;
    const value = positions.find(([phrase]) => phrase === match[2])?.[1] ?? 0;
    return { type: "pan", track: IntentParser.track(match[1]), value };
  }

  private static muteSolo(text: string): Intent | null {
    if (text === "mute") return { type: "mute", track: { kind: "selected" }, muted: "toggle" };
    if (text === "unmute") return { type: "mute", track: { kind: "selected" }, muted: false };
    if (text === "solo") return { type: "solo", track: { kind: "selected" }, solo: "toggle" };
    if (text === "unsolo") return { type: "solo", track: { kind: "selected" }, solo: false };
    const match = text.match(/^(mute|unmute|solo|unsolo)\s+(?:the\s+)?(.+)$/);
    if (!match) return null;
    const track = IntentParser.track(match[2]);
    if (match[1] === "mute") return { type: "mute", track, muted: true };
    if (match[1] === "unmute") return { type: "mute", track, muted: false };
    if (match[1] === "solo") return { type: "solo", track, solo: true };
    return { type: "solo", track, solo: false };
  }

  private static arm(text: string): Intent | null {
    if (text === "disarm all" || text === "unarm all" || text === "disarm everything") {
      return { type: "disarm", track: "all" };
    }
    const disarm = text.match(/^(?:disarm|unarm)\s+(?:the\s+)?(.+)$/);
    if (disarm) return { type: "disarm", track: IntentParser.track(disarm[1]) };
    const arm = text.match(/^(?:also\s+)?arm\s+(?:only\s+)?(?:the\s+)?(.+)$/);
    if (!arm) return null;
    const exclusive = !text.startsWith("also ") && !/\s+(?:too|as well)$/.test(text);
    const phrase = arm[1].replace(/\s+(?:too|as well)$/, "");
    return { type: "arm", track: IntentParser.track(phrase), exclusive };
  }

  private static trackEdit(text: string): Intent | null {
    const select = text.match(/^(?:select|choose|pick)\s+(?:the\s+)?(.+)$/);
    if (select) return { type: "select", track: IntentParser.track(select[1]) };
    const renamed = text.match(/^rename\s+(.+?)\s+to\s+(.+)$/);
    if (renamed) return { type: "renameTrack", track: IntentParser.track(renamed[1]), name: renamed[2] };
    const called = text.match(/^call\s+(track\s+\S+)\s+(.+)$/);
    if (called) return { type: "renameTrack", track: IntentParser.track(called[1]), name: called[2] };
    if (/^(?:add|new|create|make)(?:\s+a)?\s+track$/.test(text)) return { type: "addTrack", name: null };
    const added = text.match(/^(?:add|new|create|make)(?:\s+a)?\s+track(?:\s+(?:called|named))?\s+(.+)$/);
    if (added) return { type: "addTrack", name: added[1].trim() };
    const removed = text.match(/^(?:delete|remove)\s+(?:the\s+)?(.+?)(?:\s+track)?$/);
    if (removed && !/\b(reverb|eq|compression|compressor)\b/.test(removed[1])) {
      return { type: "deleteTrack", track: IntentParser.track(removed[1]) };
    }
    return null;
  }

  private static trim(text: string): Intent | null {
    if (text === "trim" || text === "trim it" || text === "crop" || text === "crop it") {
      return { type: "trim", edge: "auto", seconds: null };
    }
    const amount = text.match(/^(?:trim|crop|cut)\s+(\d+(?:\.\d+)?)\s*seconds?\s+off\s+(?:the\s+)?(start|beginning|end|tail)$/);
    if (amount) {
      const edge = amount[2] === "end" || amount[2] === "tail" ? "end" : "start";
      return { type: "trim", edge, seconds: Number(amount[1]) };
    }
    const by = text.match(/^(?:trim|crop)\s+(?:the\s+)?(start|beginning|end|tail)\s+by\s+(\d+(?:\.\d+)?)\s*seconds?$/);
    if (by) {
      const edge = by[1] === "end" || by[1] === "tail" ? "end" : "start";
      return { type: "trim", edge, seconds: Number(by[2]) };
    }
    const edge = text.match(/^(?:trim|crop)\s+(?:the\s+)?(start|beginning|end|tail)$/);
    if (edge) return { type: "trim", edge: edge[1] === "end" || edge[1] === "tail" ? "end" : "start", seconds: null };
    return null;
  }

  private static split(text: string): Intent | null {
    if (/^(?:split|slice|cut)(?:\s+here|\s+it|\s+this)?$/.test(text)) return { type: "split" };
    return null;
  }

  private static playStop(text: string): Intent | null {
    if (/^play(?:\s+it)?\s+from\s+the\s+(?:top|start|beginning)$/.test(text)) {
      return { type: "play", fromStart: true };
    }
    if (/^(?:play|play it|play it back|hit play|start playback|playback|start playing)$/.test(text)) {
      return { type: "play", fromStart: false };
    }
    if (/^(?:stop|stop it|stop playback|stop recording|stop playing)$/.test(text)) return { type: "stop" };
    return null;
  }

  private static cue(dest: string): Cue | null {
    const text = dest.trim().replace(/^(?:the|at|on)\s+/, "");
    if (/^(?:start|top|beginning)$/.test(text)) return { kind: "start" };
    if (text === "hook") return { kind: "marker", marker: "chorus" };
    if ((MARKERS as readonly string[]).includes(text)) return { kind: "marker", marker: text as MarkerName };
    const bar = text.match(/^bar\s+(.+)$/);
    if (bar) {
      const value = Numbers.parseInteger(bar[1]);
      if (value !== null && value >= 1) return { kind: "bar", bar: value };
    }
    const seconds = text.match(/^(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)$/);
    if (seconds) return { kind: "seconds", seconds: Number(seconds[1]) };
    return null;
  }

  private static track(phrase: string): TrackRef {
    const text = phrase.trim().toLowerCase().replace(/^(?:the|this|that)\s+/, "").replace(/\s+track$/, "");
    if (!text || /^(?:it|this|that|track|selected|current|selected track|current track)$/.test(text)) {
      return { kind: "selected" };
    }
    const indexed = text.match(/^track\s+(.+)$/);
    if (indexed) {
      const value = Numbers.parseInteger(indexed[1]);
      if (value !== null) return { kind: "index", index: value };
      const named = indexed[1].replace(/^(?:named|called)\s+/, "");
      return { kind: "name", name: named };
    }
    return { kind: "name", name: text };
  }

  private static volumeTarget(rest: string): VolumeTarget {
    if (!rest || /^(?:it|this|that|me)$/.test(rest)) return { kind: "selected" };
    if (/^(?:master(?:\s+bus)?|output|mix|mix bus)$/.test(rest)) return { kind: "master" };
    return IntentParser.track(rest);
  }

  private static effectName(token: string): EffectName {
    if (token === "eq") return "eq";
    if (token === "reverb") return "reverb";
    return "compressor";
  }

  private static defaultPreset(effect: EffectName): string {
    if (effect === "reverb") return "room";
    if (effect === "eq") return "vocal";
    return "vocal";
  }
}
