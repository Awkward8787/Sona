import { describe, expect, it } from "vitest";
import { ProjectFactory } from "../model/ProjectFactory";
import { ProjectOps } from "../model/ProjectOps";
import type { Clip } from "../model/types";
import { IntentExecutor, type SessionSnapshot } from "./IntentExecutor";
import { IntentParser } from "./IntentParser";

function snapshot(playheadSec = 0): SessionSnapshot {
  return { project: ProjectFactory.create("Test"), transport: "stopped", playheadSec };
}

function run(phrase: string, state = snapshot()) {
  const intent = IntentParser.parse(phrase);
  return { intent, result: IntentExecutor.execute(state, intent) };
}

function withClip(state: SessionSnapshot, duration = 4): SessionSnapshot {
  const track = state.project.tracks[0];
  const clip: Clip = {
    id: "clip-1",
    bufferId: "buf-1",
    startSec: 0,
    offsetSec: 0,
    durationSec: duration,
    sourceDurationSec: duration,
  };
  const project = ProjectOps.withSelectedClip(ProjectOps.addClip(state.project, track.id, clip), clip.id);
  return { ...state, project };
}

describe("IntentExecutor", () => {
  it("arms track two exclusively", () => {
    const { result } = run("arm track two");
    expect(result.reply).toBe("Armed Track 2.");
    expect(result.project.tracks[1].armed).toBe(true);
    expect(result.project.tracks[0].armed).toBe(false);
    expect(result.project.selectedTrackId).toBe(result.project.tracks[1].id);
    expect(result.mutate).toBe(true);
  });

  it("adds an arm without clearing the others", () => {
    const armed = run("arm track two").result;
    const next = IntentExecutor.execute(
      { project: armed.project, transport: "stopped", playheadSec: 0 },
      IntentParser.parse("arm the vocal too"),
    );
    expect(next.project.tracks[0].armed).toBe(true);
    expect(next.project.tracks[1].armed).toBe(true);
  });

  it("rides the vocal fader by 3 dB and the master separately", () => {
    const vocal = run("bring the vocal up 3 db").result;
    expect(vocal.project.tracks[0].gainDb).toBe(3);
    expect(vocal.reply).toContain("Vocal");
    expect(vocal.reply).toContain("+3 dB");
    const master = run("bring the master up 2 db").result;
    expect(master.project.masterGainDb).toBe(2);
    expect(master.project.tracks[0].gainDb).toBe(0);
  });

  it("sets an absolute level and refuses to pass the ceiling", () => {
    const set = run("set the vocal to -6 db").result;
    expect(set.project.tracks[0].gainDb).toBe(-6);
    const hot = IntentExecutor.execute(
      { ...snapshot(), project: { ...set.project, tracks: set.project.tracks.map((track, index) => index === 0 ? { ...track, gainDb: 11 } : track) } },
      IntentParser.parse("bring the vocal up 3 db"),
    );
    expect(hot.project.tracks[0].gainDb).toBe(12);
    expect(hot.reply).toContain("+12 dB");
  });

  it("puts room reverb on the vocal and a louder master on the bus", () => {
    const verb = run("add some reverb to the vocal").result;
    expect(verb.project.tracks[0].reverb.enabled).toBe(true);
    expect(verb.project.tracks[0].reverb.preset).toBe("room");
    expect(verb.reply).toBe("Room reverb is on Vocal.");
    const master = run("master it louder").result;
    expect(master.project.masterPreset).toBe("loud");
    expect(master.reply).toContain("louder");
    const again = IntentExecutor.execute(
      { project: master.project, transport: "stopped", playheadSec: 0 },
      IntentParser.parse("master it louder"),
    );
    expect(again.mutate).toBe(false);
  });

  it("pans, mutes, solos, and names a new track", () => {
    expect(run("pan the vocal left").result.project.tracks[0].pan).toBe(-0.65);
    expect(run("pan track two hard right").result.project.tracks[1].pan).toBe(1);
    expect(run("mute the vocal").result.project.tracks[0].mute).toBe(true);
    expect(run("solo the vocal").result.project.tracks[0].solo).toBe(true);
    const added = run("add a track called guitar").result;
    expect(added.project.tracks.map((track) => track.name)).toEqual(["Vocal", "Track 2", "guitar"]);
    expect(added.project.selectedTrackId).toBe(added.project.tracks[2].id);
    const renamed = IntentExecutor.execute(
      { project: added.project, transport: "stopped", playheadSec: 0 },
      IntentParser.parse("rename track two to keys"),
    );
    expect(renamed.project.tracks[1].name).toBe("keys");
  });

  it("punches in at the chorus and will not seek while rolling", () => {
    const { result } = run("punch me in at the chorus");
    expect(result.transport).toBe("recording");
    expect(result.effect).toBe("record");
    expect(result.playheadSec).toBeCloseTo(24, 5);
    expect(result.reply).toContain("chorus");
    const blocked = IntentExecutor.execute(
      { project: result.project, transport: "recording", playheadSec: result.playheadSec },
      IntentParser.parse("go to the start"),
    );
    expect(blocked.playheadSec).toBeCloseTo(24, 5);
    expect(blocked.reply).toMatch(/rolling/i);
  });

  it("loops four bars from the current bar and clears it", () => {
    const looped = run("loop 4 bars", snapshot(2.5)).result;
    expect(looped.project.loop).toEqual({ startSec: 2, endSec: 10 });
    const cleared = IntentExecutor.execute(
      { project: looped.project, transport: "stopped", playheadSec: 2.5 },
      IntentParser.parse("stop looping"),
    );
    expect(cleared.project.loop).toBeNull();
    expect(cleared.effect).not.toBe("stop");
  });

  it("splits and trims the clip under the playhead", () => {
    const state = withClip(snapshot(2));
    const split = IntentExecutor.execute(state, IntentParser.parse("cut")).project;
    const clips = split.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].durationSec).toBeCloseTo(2);
    expect(clips[1].durationSec).toBeCloseTo(2);
    expect(clips[0].bufferId).toBe(clips[1].bufferId);
    const trimmed = IntentExecutor.execute(
      { ...state, playheadSec: 1 },
      IntentParser.parse("trim 1 second off the end"),
    );
    expect(trimmed.project.tracks[0].clips[0].durationSec).toBeCloseTo(3);
  });

  it("refuses to bounce an empty session and bounces once there is audio", () => {
    const empty = run("bounce it").result;
    expect(empty.effect).toBe("none");
    expect(empty.reply).toMatch(/record/i);
    const filled = IntentExecutor.execute(withClip(snapshot()), IntentParser.parse("export the mix"));
    expect(filled.effect).toBe("export");
    expect(filled.mutate).toBe(false);
  });

  it("suggests a real command for something it does not know", () => {
    const result = run("sprinkle some magic").result;
    expect(result.mutate).toBe(false);
    expect(result.reply.toLowerCase()).toContain("arm track two");
  });

  it("keeps the last track and rejects a tempo out of range", () => {
    const only = run("delete track two").result;
    expect(only.project.tracks).toHaveLength(1);
    const stuck = IntentExecutor.execute(
      { project: only.project, transport: "stopped", playheadSec: 0 },
      IntentParser.parse("delete the vocal"),
    );
    expect(stuck.mutate).toBe(false);
    expect(stuck.project.tracks).toHaveLength(1);
    expect(run("set bpm to 10").result.project.bpm).toBe(120);
    expect(run("tempo 90").result.project.bpm).toBe(90);
    expect(run("click on").result.project.metronome).toBe(true);
  });

  it("selects without marking the project dirty for undo", () => {
    const selected = run("select track two").result;
    expect(selected.mutate).toBe(false);
    expect(selected.project.selectedTrackId).toBe(selected.project.tracks[1].id);
  });
});
