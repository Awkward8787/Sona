import { describe, expect, it } from "vitest";
import { CommandCatalog } from "./CommandCatalog";
import { IntentParser } from "./IntentParser";
import type { Intent } from "./Intent";

function parse(phrase: string): Intent {
  return IntentParser.parse(phrase);
}

describe("IntentParser catalog", () => {
  it.each(CommandCatalog.examples())("parses “$phrase” as $type", ({ phrase, type }) => {
    expect(parse(phrase).type).toBe(type);
  });
});

describe("IntentParser phrasing", () => {
  it("ignores case, punctuation, and a polite prefix", () => {
    const intent = parse("Hey SONA, please bring the vocal up 3 dB!");
    expect(intent).toMatchObject({ type: "volume", mode: "relative", db: 3 });
  });

  it("arms track 2 from digits and keeps an extra arm additive", () => {
    expect(parse("Arm track 2.")).toMatchObject({ type: "arm", exclusive: true, track: { kind: "index", index: 2 } });
    expect(parse("arm the vocal too")).toMatchObject({ type: "arm", exclusive: false, track: { kind: "name", name: "vocal" } });
    expect(parse("also arm the vocal")).toMatchObject({ type: "arm", exclusive: false });
  });

  it("punches in at a named section, a bar word, or a time", () => {
    expect(parse("punch me in at the chorus")).toMatchObject({
      type: "record",
      at: { kind: "marker", marker: "chorus" },
    });
    expect(parse("punch me in at bar eight")).toMatchObject({ type: "record", at: { kind: "bar", bar: 8 } });
    expect(parse("record at 10 seconds")).toMatchObject({ type: "record", at: { kind: "seconds", seconds: 10 } });
  });

  it("keeps cut-as-edit distinct from a dB cut", () => {
    expect(parse("cut").type).toBe("split");
    expect(parse("cut here").type).toBe("split");
    expect(parse("cut the vocal by 3 db")).toMatchObject({ type: "volume", mode: "relative", db: -3 });
    expect(parse("cut 0.5 seconds off the start")).toMatchObject({ type: "trim", edge: "start", seconds: 0.5 });
  });

  it("does not treat master-it-louder as a fader move", () => {
    expect(parse("master it louder")).toEqual({ type: "master", preset: "louder" });
    expect(parse("bring the master up 2 db")).toMatchObject({
      type: "volume",
      target: { kind: "master" },
      mode: "relative",
      db: 2,
    });
    expect(parse("a bit louder")).toMatchObject({ type: "volume", mode: "relative", db: 1.5, target: { kind: "selected" } });
    expect(parse("much quieter")).toMatchObject({ type: "volume", db: -6 });
  });

  it("reads absolute levels, including a negative", () => {
    expect(parse("set the vocal to -6 db")).toMatchObject({ type: "volume", mode: "absolute", db: -6 });
    expect(parse("volume of the vocal to -6 db")).toMatchObject({ type: "volume", mode: "absolute", db: -6 });
    expect(parse("add 3 db to the vocal")).toMatchObject({ type: "volume", mode: "relative", db: 3 });
  });

  it("maps effect phrases onto presets", () => {
    expect(parse("add some reverb to the vocal")).toMatchObject({
      type: "addEffect",
      effect: "reverb",
      preset: "room",
      track: { kind: "name", name: "vocal" },
    });
    expect(parse("ADD HALL REVERB TO THE VOCAL")).toMatchObject({ effect: "reverb", preset: "hall" });
    expect(parse("add a plate reverb to the vocal")).toMatchObject({ preset: "plate" });
    expect(parse("give the vocal some reverb")).toMatchObject({ effect: "reverb", preset: "room" });
    expect(parse("throw some reverb on the vocal")).toMatchObject({ effect: "reverb" });
    expect(parse("compress the vocal")).toMatchObject({ effect: "compressor", preset: "vocal" });
    expect(parse("add a vocal compressor to track two")).toMatchObject({
      effect: "compressor",
      preset: "vocal",
      track: { kind: "index", index: 2 },
    });
    expect(parse("brighten the vocal")).toMatchObject({ effect: "eq", preset: "air" });
    expect(parse("add warmth to the vocal")).toMatchObject({ effect: "eq", preset: "warmth" });
    expect(parse("remove the reverb from the vocal")).toMatchObject({ type: "removeEffect", effect: "reverb" });
  });

  it("parses names, loops, and navigation without stealing stop or undo", () => {
    expect(parse("add a track called lead guitar")).toMatchObject({ type: "addTrack", name: "lead guitar" });
    expect(parse("rename the vocal to lead vocal")).toMatchObject({
      type: "renameTrack",
      name: "lead vocal",
      track: { kind: "name", name: "vocal" },
    });
    expect(parse("loop from 2 to 6 seconds")).toMatchObject({ type: "loop", mode: "range", startSec: 2, endSec: 6 });
    expect(parse("stop looping")).toEqual({ type: "loop", mode: "clear" });
    expect(parse("go back")).toEqual({ type: "undo" });
    expect(parse("go back to the top")).toEqual({ type: "seek", cue: { kind: "start" } });
    expect(parse("go to the vocal")).toMatchObject({ type: "select", track: { kind: "name", name: "vocal" } });
    expect(parse("pan the vocal to the left")).toMatchObject({ type: "pan", value: -0.65 });
    expect(parse("pan track two hard right")).toMatchObject({ type: "pan", value: 1 });
    expect(parse("play from the top")).toEqual({ type: "play", fromStart: true });
    expect(parse("rec")).toEqual({ type: "record", at: null });
    expect(parse("roll tape")).toEqual({ type: "record", at: null });
  });

  it("asks for a suggestion when the phrase is unknown", () => {
    expect(parse("make it slap")).toMatchObject({ type: "unknown" });
    expect(parse("   ")).toMatchObject({ type: "unknown" });
  });
});
