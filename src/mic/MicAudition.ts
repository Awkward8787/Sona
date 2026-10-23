import type { RankedMic } from "./FindMyMic";

/** A/B of two renders of one raw sample. Toggle swaps which rank is in front. Loop stays on. */
export interface MicAuditionState {
  ranks: [number, number];
  active: number;
  looping: true;
  rawBufferId: string;
}

export class MicAudition {
  static start(ranking: RankedMic[], ranks: [number, number], rawBufferId: string): MicAuditionState | null {
    const [a, b] = ranks;
    if (!ranking.some((item) => item.rank === a) || !ranking.some((item) => item.rank === b)) return null;
    return { ranks: [a, b], active: a, looping: true, rawBufferId };
  }

  static toggle(state: MicAuditionState): MicAuditionState {
    const active = state.active === state.ranks[0] ? state.ranks[1] : state.ranks[0];
    return { ...state, active, looping: true };
  }

  static micId(ranking: RankedMic[], state: MicAuditionState): RankedMic | null {
    return ranking.find((item) => item.rank === state.active) ?? null;
  }
}
