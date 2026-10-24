import type { StudioMode } from "../model/types";

/** View selection only. Switching modes does not write the session. */
export class StudioModes {
  static readonly all: readonly StudioMode[] = ["artist", "creator", "engineer"];

  static is(value: string): value is StudioMode {
    return (StudioModes.all as readonly string[]).includes(value);
  }

  static select(current: StudioMode, next: string): StudioMode {
    return StudioModes.is(next) ? next : current;
  }

  /** Real surfaces each mode has to draw. Empty controls are not on this list. */
  static surfaces(mode: StudioMode): readonly string[] {
    if (mode === "artist") return ["status", "waveform", "lyrics", "takes", "heard", "did"];
    if (mode === "creator") {
      return ["timeline", "clips", "comp-lanes", "beat-import", "markers", "drag", "trim", "split", "move", "loop", "punch"];
    }
    return [
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
    ];
  }
}
