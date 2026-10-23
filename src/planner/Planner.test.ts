import { describe, expect, it } from "vitest";
import { ActionEngine } from "../action/ActionEngine";
import { ProjectFactory } from "../model/ProjectFactory";
import { SonaMemory } from "../memory/SonaMemory";
import { SonaPipeline } from "../pipeline/SonaPipeline";
import { SonaSafety } from "../safety/SonaSafety";
import { Session } from "../session/Session";
import { DeterministicPlanner } from "./Planner";

const planner = new DeterministicPlanner();
const env = { ranking: null, sampleBufferId: null, audition: null };

describe("planner output", () => {
  it("is pure data and undo restores the session exactly", () => {
    const project = ProjectFactory.create();
    Object.freeze(project);
    Object.freeze(project.tracks);
    const snapshot = JSON.stringify(project);
    const plan = planner.plan("bring the vocal up 3 db", {
      project,
      profile: SonaMemory.defaults(),
      ears: [],
    });
    expect(JSON.stringify(project)).toBe(snapshot);
    expect(plan.commands).toEqual([
      { track: "vocal", action: "gain", amount: 3, mode: "nondestructive" },
    ]);
    expect(JSON.parse(JSON.stringify(plan.commands))).toEqual(plan.commands);
    expect(plan.commands.every((item) => item.mode === "nondestructive")).toBe(true);

    const session = Session.create();
    const before = session.project;
    const applied = ActionEngine.run(session, SonaMemory.defaults(), [], [], plan.commands, env);
    expect(applied.session.project.tracks[0]?.gainDb).toBe(3);
    expect(applied.log[0]?.inverse).toEqual({
      track: "vocal",
      action: "gain",
      amount: -3,
      mode: "nondestructive",
    });
    const undone = ActionEngine.undo(applied.session, applied.profile, applied.log, applied.future);
    expect(undone.session.project).toBe(before);
    expect(undone.session.project).toEqual(before);
  });

  it("keeps memory defaults out of specified presets", () => {
    const project = ProjectFactory.create();
    const profile = {
      ...SonaMemory.defaults(),
      loudnessTarget: "broadcast" as const,
      reverbTaste: "hall",
      preferredVocalChain: { eq: "vocal", compressor: "vocal", reverb: "hall" },
    };
    const context = { project, profile, ears: [] };
    expect(planner.plan("add some reverb to the vocal", context).commands[0]).toMatchObject({
      action: "effect",
      amount: "reverb:hall",
      mode: "nondestructive",
    });
    expect(planner.plan("add hall reverb to the vocal", context).commands[0]?.amount).toBe("reverb:hall");
    expect(planner.plan("master it louder", context).commands[0]?.amount).toBe("louder");
    expect(planner.plan("master it", context).commands[0]?.amount).toBe("broadcast");
    expect(planner.plan("add a track called rhythm and blues", context).commands).toHaveLength(1);
    expect(planner.plan("add a track called rhythm and blues", context).commands[0]?.action).toBe("add-track");
  });

  it("emits the investor demo as commands and does not touch the project", () => {
    const project = ProjectFactory.create();
    const snapshot = JSON.stringify(project);
    const context = { project, profile: SonaMemory.defaults(), ears: [{ id: "clipping" as const, summary: "Vocal is clipping.", offer: "Want me to pull it down?" }] };
    const phrases = [
      ["load the beat", "scratch-beat"],
      ["find my mic", "find-mic"],
      ["punch me in at i been on the road", "punch"],
      ["widen the doubles", "widen"],
      ["what you hearing", "analyze"],
      ["fix the vocal", "gain"],
      ["make it brighter", "mix"],
      ["master it", "master"],
      ["bounce my master", "export"],
    ] as const;
    for (const [phrase, action] of phrases) {
      const plan = planner.plan(phrase, context);
      expect(plan.commands[0]?.action).toBe(action);
      expect(plan.commands[0]?.mode).toBe("nondestructive");
    }
    expect(JSON.stringify(project)).toBe(snapshot);
  });
});

describe("safety", () => {
  it("asks before a big move and lets a small one through", () => {
    const project = ProjectFactory.create();
    const small = planner.plan("bring the vocal up 3 db", { project, profile: SonaMemory.defaults(), ears: [] });
    expect(SonaSafety.review(project, 0, small.commands).needsConfirm).toBe(false);
    const big = planner.plan("bring the vocal up 6 db", { project, profile: SonaMemory.defaults(), ears: [] });
    const review = SonaSafety.review(project, 0, big.commands);
    expect(review.needsConfirm).toBe(true);
    expect(review.question.toLowerCase()).toContain("preview");
    const removed = planner.plan("delete track two", { project, profile: SonaMemory.defaults(), ears: [] });
    expect(SonaSafety.review(project, 0, removed.commands).needsConfirm).toBe(true);

    const state = SonaPipeline.create(Session.create());
    const asked = SonaPipeline.turn(state, "bring the vocal up 6 db");
    expect(asked.session.project.tracks[0]?.gainDb).toBe(0);
    expect(asked.pending?.commands[0]?.amount).toBe(6);
    const declined = SonaPipeline.turn(asked, "no");
    expect(declined.reply).toBe("Left it alone.");
    expect(declined.session.project.tracks[0]?.gainDb).toBe(0);
    const confirmed = SonaPipeline.turn(asked, "yes");
    expect(confirmed.session.project.tracks[0]?.gainDb).toBe(6);
    const undone = SonaPipeline.turn(confirmed, "undo");
    expect(undone.session.project.tracks[0]?.gainDb).toBe(0);
  });
});
