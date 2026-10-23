import type { PreampId } from "../model/types";
import { MicModel } from "./MicModel";
import { PreampModels } from "./VirtualMics";

/** Separate nondestructive stage that sits after the mic model and before the vocal chain. */
export class PreampModel {
  static render(samples: Float32Array, sampleRate: number, preampId: PreampId): Float32Array {
    return MicModel.shape(samples, sampleRate, PreampModels.get(preampId).curve);
  }
}
