import { describe, expect, it } from "vitest";
import { SonaMemory } from "../memory/SonaMemory";
import { ProjectOps } from "../model/ProjectOps";
import type { Project } from "../model/types";
import { Session } from "../session/Session";
import { command } from "../daw/DawCommand";
import { ActionEngine } from "./ActionEngine";

const env = { ranking: null, sampleBufferId: null, audition: null };

function apply(commands: ReturnType<typeof command>[], session = Session.create("Desk")) {
  return ActionEngine.run(session, SonaMemory.defaults(), [], [], commands, env);
}

function snapshot(project: Project) {
  return JSON.stringify({ ...project, updatedAt: 0 });
}

describe("action engine inverses", () => {
  it("restores each desk command when its inverse runs", () => {
    const vocal = Session.create("Desk").project.tracks[0]?.name ?? "Vocal";
    const cases: ReturnType<typeof command>[][] = [
      [command(vocal, "gain", 3)],
      [command(vocal, "gain-set", -4)],
      [command(vocal, "pan", -0.4)],
      [command(vocal, "mute", "true")],
      [command(vocal, "solo", "true")],
      [command(vocal, "deesser", "on")],
      [command(vocal, "eq-band", "high:2.5")],
      [command(vocal, "comp-threshold", "-24")],
      [command(vocal, "send-level", "reverb:0.45")],
      [command(vocal, "send-level", "delay:0.3")],
      [command(vocal, "tune-enable", "on")],
      [command(vocal, "bus-assign", "bus-beat")],
      [command("Vocals", "bus-gain", -6)],
      [command("Reverb", "bus-mute", "on")],
      [command("session", "punch-region", "1:5")],
      [command("session", "loop-range", "2:8")],
      [command("session", "marker-at", "verse:3")],
      [command(vocal, "automation-set", JSON.stringify([{ id: "p1", timeSec: 1, gainDb: -3 }]))],
    ];
    for (const commands of cases) {
      const session = Session.create("Desk");
      const before = snapshot(session.project);
      const ran = apply(commands, session);
      expect(snapshot(ran.session.project)).not.toBe(before);
      expect(ran.log[0]?.inverse.mode).toBe("nondestructive");
      expect(ran.log[0]?.command).toEqual(commands[0]);
      const back = ActionEngine.run(ran.session, ran.profile, [], [], [ran.log[0]!.inverse], env);
      expect(snapshot(back.session.project)).toBe(before);
    }
  });

  it("puts a comp lane back with the inverse of use-take", () => {
    const seeded = apply([command("vocal", "scratch-vocal", null)]);
    const vocal = seeded.session.project.tracks.find((track) => /vocal/i.test(track.name));
    expect(vocal?.takes).toHaveLength(2);
    expect(vocal?.clips).toHaveLength(1);
    const beforeClips = JSON.stringify(vocal?.clips);
    const used = ActionEngine.run(
      seeded.session,
      seeded.profile,
      [],
      [],
      [command(vocal?.name ?? "Vocal", "use-take", 2)],
      env,
    );
    const after = used.session.project.tracks.find((track) => track.id === vocal?.id);
    expect(after?.clips[0]?.bufferId).toBe(vocal?.takes[1]?.rawBufferId);
    const back = ActionEngine.run(used.session, used.profile, [], [], [used.log[0]!.inverse], env);
    const restored = back.session.project.tracks.find((track) => track.id === vocal?.id);
    expect(JSON.stringify(restored?.clips)).toBe(beforeClips);
  });

  it("moves a clip and the inverse puts it back", () => {
    const seeded = apply([command("beat", "scratch-beat", null)]);
    const beat = seeded.session.project.tracks.find((track) => track.name === "Beat");
    const clip = beat?.clips[0];
    expect(clip).toBeTruthy();
    const moved = { ...clip!, startSec: 2 };
    const ran = ActionEngine.run(
      seeded.session,
      seeded.profile,
      [],
      [],
      [command("Beat", "clip-set", JSON.stringify(moved))],
      env,
    );
    const placed = ran.session.project.tracks.find((track) => track.name === "Beat")?.clips[0];
    expect(placed?.startSec).toBe(2);
    const back = ActionEngine.run(ran.session, ran.profile, [], [], [ran.log[0]!.inverse], env);
    expect(back.session.project.tracks.find((track) => track.name === "Beat")?.clips[0]?.startSec).toBe(0);
  });

  it("undo restores the session object from the log, including a split", () => {
    const seeded = apply([command("beat", "scratch-beat", null)]);
    const session = { ...seeded.session, playheadSec: 1 };
    const split = ActionEngine.run(session, seeded.profile, seeded.log, [], [command("Beat", "split", null)], env);
    const beat = split.session.project.tracks.find((track) => track.name === "Beat");
    expect(beat?.clips.length).toBe(2);
    const undone = ActionEngine.undo(split.session, split.profile, split.log, split.future);
    expect(undone.session.project).toBe(session.project);
    expect(undone.session.project.tracks.find((track) => track.name === "Beat")?.clips).toHaveLength(1);
  });

  it("keeps a lyric command from moving the mix", () => {
    const ran = apply([command("Vocal", "lyric", "turn me up")]);
    expect(ran.session.project.tracks[0]?.gainDb).toBe(0);
    expect(ran.reply).toMatch(/performance/i);
    expect(ran.log[0]?.command.action).toBe("lyric");
  });

  it("solos a group bus without touching the other group's tracks", () => {
    const seeded = apply([command("beat", "scratch-beat", null)]);
    const soloed = ActionEngine.run(seeded.session, seeded.profile, [], [], [command("Beat", "bus-solo", "on")], env);
    const project = soloed.session.project;
    const beat = project.tracks.find((track) => track.name === "Beat");
    const vocal = project.tracks.find((track) => track.name === "Vocal");
    expect(beat && ProjectOps.audible(project, beat)).toBe(true);
    expect(vocal && ProjectOps.audible(project, vocal)).toBe(false);
    const back = ActionEngine.run(soloed.session, soloed.profile, [], [], [soloed.log[0]!.inverse], env);
    expect(back.session.project.buses.find((bus) => bus.id === "bus-beat")?.solo).toBe(false);
  });
});
