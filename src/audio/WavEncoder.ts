export class WavEncoder {
  static encode(channels: Float32Array[], sampleRate: number): Blob {
    return new Blob([WavEncoder.bytes(channels, sampleRate).buffer as ArrayBuffer], { type: "audio/wav" });
  }

  static download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  static bytes(channels: Float32Array[], sampleRate: number): Uint8Array {
    const source = channels.length > 0 ? channels : [new Float32Array(0)];
    const frames = source[0]?.length ?? 0;
    const blockAlign = source.length * 2;
    const buffer = new ArrayBuffer(44 + frames * blockAlign);
    const view = new DataView(buffer);
    WavEncoder.ascii(view, 0, "RIFF");
    view.setUint32(4, 36 + frames * blockAlign, true);
    WavEncoder.ascii(view, 8, "WAVE");
    WavEncoder.ascii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, source.length, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    WavEncoder.ascii(view, 36, "data");
    view.setUint32(40, frames * blockAlign, true);
    let offset = 44;
    for (let frame = 0; frame < frames; frame += 1) {
      for (const channel of source) {
        const sample = Math.max(-1, Math.min(1, channel[frame] ?? 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Uint8Array(buffer);
  }

  private static ascii(view: DataView, offset: number, text: string): void {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  }
}
