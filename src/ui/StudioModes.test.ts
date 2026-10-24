import { describe, expect, it } from "vitest";
import { ProjectFactory } from "../model/ProjectFactory";
import type { StudioMode } from "../model/types";
import { StudioModes } from "./StudioModes";

describe("studio modes", () => {
  it("switches the view and leaves the session alone", () => {
    const project = ProjectFactory.create();
    const frozen = JSON.stringify(project);
    let mode: StudioMode = "artist";
    mode = StudioModes.select(mode, "creator");
    expect(mode).toBe("creator");
    mode = StudioModes.select(mode, "engineer");
    expect(mode).toBe("engineer");
    mode = StudioModes.select(mode, "not-a-mode");
    expect(mode).toBe("engineer");
    mode = StudioModes.select(mode, "artist");
    expect(mode).toBe("artist");
    expect(JSON.stringify(project)).toBe(frozen);
    expect(StudioModes.all).toEqual(["artist", "creator", "engineer"]);
  });

  it("gives each mode a real surface and keeps the engineer desk off the placeholder", () => {
    expect(StudioModes.surfaces("artist")).toEqual(["status", "waveform", "lyrics", "takes", "heard", "did"]);
    expect(StudioModes.surfaces("creator")).toContain("comp-lanes");
    expect(StudioModes.surfaces("creator")).toContain("punch");
    expect(StudioModes.surfaces("creator")).toContain("loop");
    const engineer = StudioModes.surfaces("engineer");
    expect(engineer).toEqual(expect.arrayContaining([
      "gain",
      "pan",
      "mute",
      "solo",
      "eq",
      "compressor",
      "de-esser",
      "tune",
      "reverb-send",
      "delay-send",
      "buses",
      "master",
      "meters",
      "automation",
      "command-log",
    ]));
    expect(engineer.join(" ")).not.toMatch(/coming in phase 2/i);
  });
});
