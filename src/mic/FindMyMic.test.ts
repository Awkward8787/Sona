import { describe, expect, it } from "vitest";
import { ActionEngine } from "../action/ActionEngine";
import { SonaMemory } from "../memory/SonaMemory";
import { ProjectFactory } from "../model/ProjectFactory";
import { SonaPipeline } from "../pipeline/SonaPipeline";
import { Session } from "../session/Session";
import type { StoredBuffer } from "../model/types";
import { FindMyMic } from "./FindMyMic";
import { MicChain } from "./MicChain";
import { VirtualMics } from "./VirtualMics";

function tone(freq: number, seconds = 0.25, rate = 44100, gain = 0.4): StoredBuffer {
  const length = Math.floor(rate * seconds);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) samples[i] = Math.sin((2 * Math.PI * freq * i) / rate) * gain;
  return { id: "sample", sampleRate: rate, channels: [samples] };
}

describe("find my mic", () => {
  it("ranks the four original models deterministically", () => {
    const dark = { tilt: -0.8, brightness: 0.15, sibilance: 0.2, range: 0.5 };
    const once = FindMyMic.rank(dark);
    const twice = FindMyMic.rank(dark);
    expect(once.map((item) => item.id)).toEqual(twice.map((item) => item.id));
    expect(once.map((item) => item.name)).toEqual([
      "Bright Presence",
      "Warm Tube",
      "Modern Condenser",
      "Smooth Vintage",
    ]);
    expect(once.every((item) => item.reason.length > 0 && !item.reason.includes("\n"))).toBe(true);
    const harsh = FindMyMic.rank({ tilt: 0.4, brightness: 0.9, sibilance: 0.85, range: 0.6 });
    expect(harsh[0]?.name).toBe("Smooth Vintage");
    expect(harsh[1]?.name).toBe("Warm Tube");
  });

  it("keeps branded models out of the registry", () => {
    const names = VirtualMics.all().map((mic) => mic.name);
    expect(names).toEqual(["Warm Tube", "Modern Condenser", "Smooth Vintage", "Bright Presence"]);
    expect(VirtualMics.all().every((mic) => mic.license.status === "original" && mic.license.holder === null)).toBe(true);
    expect(JSON.stringify(VirtualMics.all())).not.toMatch(/neumann|shure|telefunken|u\s*67|sm7/i);
  });

  it("leaves the raw buffer untouched when mics swap and when A/B renders", () => {
    const raw = tone(220);
    const before = Array.from(raw.channels[0] ?? []);
    const warm = MicChain.render(raw, "warm-tube", "warm");
    const bright = MicChain.render(raw, "bright-presence", "air");
    expect(Array.from(raw.channels[0] ?? [])).toEqual(before);
    expect(warm.channels[0]).not.toBe(raw.channels[0]);
    expect(warm.channels[0]?.[40]).not.toBe(before[40]);
    expect(bright.id).not.toBe(raw.id);

    const created = SonaPipeline.create(Session.create());
    let state = SonaPipeline.finishFindMic(created, raw);
    expect(created.session.buffers[raw.id]).toBeUndefined();
    expect(state.log.at(-1)?.command).toMatchObject({ track: "session", action: "store-raw", amount: "find-mic", mode: "nondestructive" });
    expect(state.session.buffers[raw.id]).toBe(raw);
    const undone = ActionEngine.undo(state.session, state.profile, state.log, state.future);
    expect(undone.session.project).toBe(created.session.project);
    expect(Array.from(raw.channels[0] ?? [])).toEqual(before);
    state = SonaPipeline.turn(state, "let me hear 1 and 3");
    expect(state.audition).toMatchObject({ ranks: [1, 3], active: 1, looping: true, rawBufferId: raw.id });
    expect(Array.from(raw.channels[0] ?? [])).toEqual(before);
    const toggled = SonaPipeline.turn(state, "toggle");
    expect(toggled.audition?.active).toBe(3);
    const chosen = SonaPipeline.turn(state, "Three.");
    expect(chosen.reply).toBe("Got it. I'll use that as your preferred mic.");
    expect(chosen.profile.preferredMicId).toBe(state.ranking?.[2]?.id);
    const next = SonaMemory.applyToProject(ProjectFactory.create(), chosen.profile);
    expect(next.tracks[0]?.micId).toBe(chosen.profile.preferredMicId);
    expect(next.tracks[1]?.micId).toBe(chosen.profile.preferredMicId);
    expect(Array.from(raw.channels[0] ?? [])).toEqual(before);
  });
});
