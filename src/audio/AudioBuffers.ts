export class AudioBuffers {
  static concat(chunks: Float32Array[]): Float32Array {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const out = new Float32Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  static resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate || input.length === 0) return input;
    const length = Math.max(1, Math.round((input.length * toRate) / fromRate));
    const out = new Float32Array(length);
    const last = input.length - 1;
    for (let i = 0; i < length; i += 1) {
      const position = (i * fromRate) / toRate;
      const left = Math.min(last, Math.floor(position));
      const right = Math.min(last, left + 1);
      const mix = position - left;
      out[i] = input[left] * (1 - mix) + input[right] * mix;
    }
    return out;
  }

  static toContext(ctx: BaseAudioContext, channels: Float32Array[], sampleRate: number): AudioBuffer {
    const rendered = sampleRate === ctx.sampleRate
      ? channels
      : channels.map((channel) => AudioBuffers.resample(channel, sampleRate, ctx.sampleRate));
    const buffer = ctx.createBuffer(rendered.length, rendered[0]?.length ?? 1, ctx.sampleRate);
    rendered.forEach((channel, index) => buffer.copyToChannel(channel as Float32Array<ArrayBuffer>, index));
    return buffer;
  }
}
