import { describe, expect, it } from "vitest";
import { Ids } from "../model/Ids";
import { ProjectFactory } from "../model/ProjectFactory";
import { ProjectCommands } from "../action/ProjectCommands";
import { CompTakes } from "./CompTakes";
import type { StoredBuffer, Take } from "../model/types";

describe("punch and comp", () => {
  it("finds a lyric and punches in with pre-roll", () => {
    const project = ProjectFactory.create();
    const take: Take = {
      id: Ids.next(),
      number: 1,
      rawBufferId: "raw-1",
      startSec: 0,
      durationSec: 4,
      micId: "modern-condenser",
      preampId: "clean",
      words: [
        { text: "I", startSec: 1, endSec: 1.2 },
        { text: "been", startSec: 1.2, endSec: 1.4 },
        { text: "on", startSec: 1.4, endSec: 1.55 },
        { text: "the", startSec: 1.55, endSec: 1.7 },
        { text: "road", startSec: 1.7, endSec: 2.1 },
      ],
    };
    project.tracks[0] = { ...project.tracks[0], takes: [take] };
    const hit = ProjectCommands.punch(project, 0, "I been on the road");
    expect(hit.roll).toBe(true);
    expect(hit.playheadSec).toBeCloseTo(0.25, 2);
    const missing = ProjectCommands.punch(project, 0, "not in the take");
    expect(missing.roll).toBe(false);
  });

  it("comps takes without rewriting raw samples", () => {
    const project = ProjectFactory.create();
    const verse: StoredBuffer = { id: "verse-raw", sampleRate: 1000, channels: [Float32Array.from([0.2, 0.3, 0.4])] };
    const hook: StoredBuffer = { id: "hook-raw", sampleRate: 1000, channels: [Float32Array.from([0.5, 0.6])] };
    const verseCopy = Array.from(verse.channels[0] ?? []);
    const hookCopy = Array.from(hook.channels[0] ?? []);
    const vocal = project.tracks[0];
    if (!vocal) throw new Error("missing vocal");
    vocal.takes = [
      { id: "a", number: 2, rawBufferId: verse.id, startSec: 8, durationSec: 16, words: [], micId: "warm-tube", preampId: "warm" },
      { id: "b", number: 3, rawBufferId: hook.id, startSec: 24, durationSec: 16, words: [], micId: "bright-presence", preampId: "air" },
    ];
    const next = CompTakes.comp(project, vocal, [
      { take: 2, marker: "verse" },
      { take: 3, marker: "chorus" },
    ]);
    expect(next).not.toBeNull();
    const clips = next?.tracks[0]?.clips ?? [];
    expect(clips.map((clip) => clip.bufferId)).toEqual([verse.id, hook.id]);
    expect(clips[0]?.startSec).toBeCloseTo(8, 2);
    expect(clips[1]?.startSec).toBeCloseTo(24, 2);
    expect(Array.from(verse.channels[0] ?? [])).toEqual(verseCopy);
    expect(Array.from(hook.channels[0] ?? [])).toEqual(hookCopy);
  });
});
