import { Ids } from "../model/Ids";
import type { PreampId, StoredBuffer, VirtualMicId } from "../model/types";
import { MicModel } from "./MicModel";
import { PreampModel } from "./PreampModel";

/**
 * RAW → Mic Model → Preamp Model.
 * The returned buffer is a render. The input buffer's sample arrays are not written.
 */
export class MicChain {
  static render(raw: StoredBuffer, micId: VirtualMicId, preampId: PreampId, nudge = 0): StoredBuffer {
    const channels = raw.channels.map((channel) => {
      const mic = MicModel.render(channel, raw.sampleRate, micId, nudge);
      return PreampModel.render(mic, raw.sampleRate, preampId);
    });
    return {
      id: Ids.next(),
      sampleRate: raw.sampleRate,
      channels: channels.length > 0 ? channels : [new Float32Array()],
    };
  }
}
