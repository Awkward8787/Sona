/** Stored (uncompressed) ZIP. Enough for a handful of WAV stems. */
export class ZipStore {
  static store(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
    const locals: Uint8Array[] = [];
    const centrals: Uint8Array[] = [];
    let offset = 0;
    for (const file of files) {
      const name = new TextEncoder().encode(file.name);
      const crc = ZipStore.crc(file.data);
      const local = new DataView(new ArrayBuffer(30 + name.length));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(8, 0, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, file.data.length, true);
      local.setUint32(22, file.data.length, true);
      local.setUint16(26, name.length, true);
      new Uint8Array(local.buffer).set(name, 30);
      locals.push(new Uint8Array(local.buffer), file.data);
      const central = new DataView(new ArrayBuffer(46 + name.length));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, file.data.length, true);
      central.setUint32(24, file.data.length, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      new Uint8Array(central.buffer).set(name, 46);
      centrals.push(new Uint8Array(central.buffer));
      offset += 30 + name.length + file.data.length;
    }
    const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const total = parts.reduce((sum, item) => sum + item.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of parts) {
      out.set(part, cursor);
      cursor += part.length;
    }
    return out;
  }

  private static crc(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i += 1) {
      crc ^= data[i] ?? 0;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
}
