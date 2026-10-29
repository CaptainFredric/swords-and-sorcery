// Standard uncompressed (Store) ZIP archive builder for browser and Node environments.
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}

export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const encoder = new TextEncoder();

export class ZipArchive {
  constructor() {
    this.entries = [];
  }

  /**
   * Add a file to the archive.
   * @param {string} filename 
   * @param {Uint8Array|ArrayBuffer|string} content 
   */
  add(filename, content) {
    let bytes;
    if (typeof content === 'string') {
      bytes = encoder.encode(content);
    } else if (content instanceof Uint8Array) {
      bytes = content;
    } else if (content instanceof ArrayBuffer) {
      bytes = new Uint8Array(content);
    } else {
      throw new TypeError(`Unsupported content type for file ${filename}`);
    }
    const nameBytes = encoder.encode(filename.replace(/\\/g, '/'));
    const crc = crc32(bytes);
    this.entries.push({
      nameBytes,
      bytes,
      crc,
      size: bytes.length,
    });
  }

  /**
   * Build the complete ZIP archive as a Uint8Array.
   * @returns {Uint8Array}
   */
  build() {
    let totalSize = 0;
    // Calculate total size
    for (const entry of this.entries) {
      entry.localHeaderOffset = totalSize;
      totalSize += 30 + entry.nameBytes.length + entry.size;
    }
    const centralDirectoryOffset = totalSize;
    let centralDirectorySize = 0;
    for (const entry of this.entries) {
      centralDirectorySize += 46 + entry.nameBytes.length;
    }
    totalSize += centralDirectorySize + 22; // + End of Central Directory

    const out = new Uint8Array(totalSize);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    let offset = 0;

    // 1. Write Local File Headers and Data
    for (const entry of this.entries) {
      view.setUint32(offset, 0x04034b50, true); // Local file header signature
      view.setUint16(offset + 4, 20, true);    // Version needed to extract (2.0)
      view.setUint16(offset + 6, 0x0800, true);// General purpose bit flag (UTF-8)
      view.setUint16(offset + 8, 0, true);     // Compression method (0 = Store)
      view.setUint16(offset + 10, 0, true);    // Last mod file time
      view.setUint16(offset + 12, 0, true);    // Last mod file date
      view.setUint32(offset + 14, entry.crc, true); // CRC-32
      view.setUint32(offset + 18, entry.size, true); // Compressed size
      view.setUint32(offset + 22, entry.size, true); // Uncompressed size
      view.setUint16(offset + 26, entry.nameBytes.length, true); // File name length
      view.setUint16(offset + 28, 0, true);    // Extra field length
      offset += 30;

      out.set(entry.nameBytes, offset);
      offset += entry.nameBytes.length;

      out.set(entry.bytes, offset);
      offset += entry.size;
    }

    // 2. Write Central Directory
    for (const entry of this.entries) {
      view.setUint32(offset, 0x02014b50, true); // Central directory header signature
      view.setUint16(offset + 4, 20, true);    // Version made by
      view.setUint16(offset + 6, 20, true);    // Version needed to extract
      view.setUint16(offset + 8, 0x0800, true);// General purpose bit flag (UTF-8)
      view.setUint16(offset + 10, 0, true);    // Compression method (0 = Store)
      view.setUint16(offset + 12, 0, true);    // Last mod file time
      view.setUint16(offset + 14, 0, true);    // Last mod file date
      view.setUint32(offset + 16, entry.crc, true); // CRC-32
      view.setUint32(offset + 20, entry.size, true); // Compressed size
      view.setUint32(offset + 24, entry.size, true); // Uncompressed size
      view.setUint16(offset + 28, entry.nameBytes.length, true); // File name length
      view.setUint16(offset + 30, 0, true);    // Extra field length
      view.setUint16(offset + 32, 0, true);    // File comment length
      view.setUint16(offset + 34, 0, true);    // Disk number start
      view.setUint16(offset + 36, 0, true);    // Internal file attributes
      view.setUint32(offset + 38, 0, true);    // External file attributes
      view.setUint32(offset + 42, entry.localHeaderOffset, true); // Relative offset of local header
      offset += 46;

      out.set(entry.nameBytes, offset);
      offset += entry.nameBytes.length;
    }

    // 3. Write End of Central Directory Record
    view.setUint32(offset, 0x06054b50, true); // End of central directory signature
    view.setUint16(offset + 4, 0, true);      // Number of this disk
    view.setUint16(offset + 6, 0, true);      // Disk where central directory starts
    view.setUint16(offset + 8, this.entries.length, true);  // Number of central directory records on this disk
    view.setUint16(offset + 10, this.entries.length, true); // Total number of central directory records
    view.setUint32(offset + 12, centralDirectorySize, true); // Size of central directory
    view.setUint32(offset + 16, centralDirectoryOffset, true);// Offset of start of central directory
    view.setUint16(offset + 20, 0, true);     // Comment length

    return out;
  }

  /**
   * Convert archive to a downloadable Blob.
   * @returns {Blob}
   */
  toBlob() {
    return new Blob([this.build()], { type: 'application/zip' });
  }
}
