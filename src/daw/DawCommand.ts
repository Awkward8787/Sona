import type { ArtistProfile } from "../memory/SonaMemory";
import type { Project, Transport } from "../model/types";

/**
 * The only shape the Brain and Planner may emit.
 * They are plain data. Nothing here touches a session.
 */
export interface DawCommand {
  track: string;
  action: string;
  amount: number | string | null;
  mode: "nondestructive";
}

export interface CommandLogEntry {
  id: string;
  command: DawCommand;
  inverse: DawCommand;
  /** Snapshot taken before the command ran. Undo puts this back so the session matches exactly. */
  before: {
    project: Project;
    transport: Transport;
    playheadSec: number;
    profile: ArtistProfile;
  };
}

export function command(track: string, action: string, amount: number | string | null = null): DawCommand {
  return { track, action, amount, mode: "nondestructive" };
}

export function describeCommand(entry: { command: DawCommand; inverse: DawCommand }): string {
  return `${label(entry.command)}  ·  undo ${label(entry.inverse)}`;
}

function label(item: DawCommand): string {
  const amount = item.amount == null || item.amount === "" ? "" : ` ${item.amount}`;
  return `${item.track} ${item.action}${amount}`;
}
