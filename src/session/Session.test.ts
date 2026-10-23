import { describe, expect, it } from "vitest";
import { IntentParser } from "../engine/IntentParser";
import { Session } from "./Session";

describe("Session", () => {
  it("runs a spoken session and undoes the last musical change", () => {
    let state = Session.create("Story");
    const phrases = [
      "arm track two",
      "bring the vocal up 3 db",
      "add some reverb to the vocal",
      "pan the vocal left",
      "master it louder",
      "set bpm to 100",
      "loop 4 bars",
    ];
    for (const phrase of phrases) {
      state = Session.applyCommand(state, phrase, IntentParser.parse(phrase)).state;
    }
    expect(state.project.tracks[1].armed).toBe(true);
    expect(state.project.tracks[0].armed).toBe(false);
    expect(state.project.tracks[0].gainDb).toBe(3);
    expect(state.project.tracks[0].reverb.enabled).toBe(true);
    expect(state.project.tracks[0].pan).toBeLessThan(0);
    expect(state.project.masterPreset).toBe("loud");
    expect(state.project.bpm).toBe(100);
    expect(state.project.loop).not.toBeNull();
    expect(state.messages.some((message) => message.role === "user" && message.text === "arm track two")).toBe(true);
    expect(state.messages.some((message) => message.role === "engineer" && message.text.includes("Room reverb"))).toBe(true);

    const undone = Session.applyCommand(state, "undo", IntentParser.parse("undo"));
    expect(undone.reply).toBe("Undone.");
    expect(undone.state.project.loop).toBeNull();
    expect(undone.state.project.bpm).toBe(100);

    const redone = Session.apply(undone.state, IntentParser.parse("redo"));
    expect(redone.state.project.loop).not.toBeNull();
  });

  it("refuses to undo while the transport is recording", () => {
    let state = Session.create("Story");
    state = Session.apply(state, IntentParser.parse("record")).state;
    expect(state.transport).toBe("recording");
    const blocked = Session.applyCommand(state, "undo", IntentParser.parse("undo"));
    expect(blocked.reply).toMatch(/stop the take/i);
    expect(blocked.state.past).toHaveLength(state.past.length);
  });

  it("prints a take onto the armed track and can undo it", () => {
    let state = Session.create("Story");
    state = Session.apply(state, IntentParser.parse("arm track two")).state;
    const samples = new Float32Array(480);
    const printed = Session.commitRecording(state, { samples, sampleRate: 48 }, 1);
    expect(printed.trackNames).toEqual(["Track 2"]);
    expect(printed.state.project.tracks[1].clips).toHaveLength(1);
    expect(printed.state.project.tracks[0].clips).toHaveLength(0);
    expect(printed.state.project.tracks[1].clips[0].startSec).toBe(1);
    expect(printed.durationSec).toBeCloseTo(10);
    const bufferId = printed.state.project.tracks[1].clips[0].bufferId;
    const undone = Session.apply(printed.state, IntentParser.parse("undo"));
    expect(undone.state.project.tracks[1].clips).toHaveLength(0);
    expect(undone.state.buffers[bufferId]).toBeDefined();
  });
});
