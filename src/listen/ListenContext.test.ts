import { describe, expect, it } from "vitest";
import { LISTEN_CHANNELS, ListenContext } from "./ListenContext";
import { SonaPipeline } from "../pipeline/SonaPipeline";
import { Session } from "../session/Session";

describe("context-aware listening", () => {
  it("keeps command, performance, and analysis apart", () => {
    expect(LISTEN_CHANNELS).toEqual(["command", "performance", "analysis"]);
    expect(ListenContext.classify({
      text: "turn me up",
      transport: "recording",
      source: "speech",
      commandsWhileRecording: false,
    }).channel).toBe("performance");
    expect(ListenContext.classify({
      text: "SONA, turn me up",
      transport: "recording",
      source: "speech",
      commandsWhileRecording: false,
    })).toMatchObject({ channel: "command", text: "turn me up", woke: true });
    expect(ListenContext.classify({
      text: "turn me up",
      transport: "stopped",
      source: "speech",
      commandsWhileRecording: false,
    }).channel).toBe("command");
  });

  it("does not mix a lyric while the take is rolling", () => {
    const state = SonaPipeline.create(Session.create());
    const rolling = { ...state, session: { ...state.session, transport: "recording" as const } };
    const lyric = SonaPipeline.turn(rolling, "turn me up", "speech");
    expect(lyric.channel).toBe("performance");
    expect(lyric.session.project.tracks[0]?.gainDb).toBe(0);
    expect(lyric.log.at(-1)?.command).toEqual({
      track: "Vocal",
      action: "lyric",
      amount: "turn me up",
      mode: "nondestructive",
    });
    expect(lyric.log.some((entry) => entry.command.action === "gain")).toBe(false);

    const addressed = SonaPipeline.turn(rolling, "SONA, turn me up", "speech");
    expect(addressed.channel).toBe("command");
    expect(addressed.session.project.tracks[0]?.gainDb).toBe(3);

    const allowed = SonaPipeline.turn({ ...rolling, commandsWhileRecording: true }, "turn me up", "speech");
    expect(allowed.session.project.tracks[0]?.gainDb).toBe(3);
  });
});
