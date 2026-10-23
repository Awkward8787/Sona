import type { Transport } from "../model/types";

/** Command listening, performance listening, and audio analysis stay separate. */
export type ListenChannel = "command" | "performance" | "analysis";

export const LISTEN_CHANNELS: readonly ListenChannel[] = ["command", "performance", "analysis"];

export interface ListenInput {
  text: string;
  transport: Transport;
  source: "speech" | "typed";
  /** Session state may open the command channel during a take. Speech still needs it or the wake word. */
  commandsWhileRecording: boolean;
}

export interface ListenRoute {
  channel: Exclude<ListenChannel, "analysis">;
  text: string;
  woke: boolean;
}

/**
 * Speech during a take is performance (lyrics), not a mix command,
 * unless it is addressed with "SONA" or the session has commands open.
 * Audio analysis is not this function — Ears never reads a transcript.
 */
export class ListenContext {
  static classify(input: ListenInput): ListenRoute {
    const wake = ListenContext.peelWake(input.text);
    const recording = input.transport === "recording";
    const speech = input.source === "speech";
    if (recording && speech && !wake.woke && !input.commandsWhileRecording) {
      return { channel: "performance", text: input.text.trim(), woke: false };
    }
    return { channel: "command", text: wake.woke ? wake.rest : input.text.trim(), woke: wake.woke };
  }

  static peelWake(text: string): { woke: boolean; rest: string } {
    const cleaned = text.trim();
    const match = cleaned.match(/^(?:hey\s+)?sona\b[\s,.:;-]*/i);
    if (!match) return { woke: false, rest: cleaned };
    return { woke: true, rest: cleaned.slice(match[0].length).trim() };
  }
}
