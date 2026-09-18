import crypto from 'node:crypto';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE_BYTES = 64 * 1024;

function makeFrame(payload, opcode = 0x1) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x80 | opcode, data.length]);
  } else if (data.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}

export class WebSocketPeer {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.onMessage = () => {};
    this.onClose = () => {};
    socket.on('data', (chunk) => this.#consume(chunk));
    socket.on('close', () => this.#closed());
    socket.on('end', () => this.#closed());
    socket.on('error', () => this.#closed());
  }

  sendJson(value) {
    if (this.closed || this.socket.destroyed) return;
    this.socket.write(makeFrame(JSON.stringify(value), 0x1));
  }

  close() {
    if (this.closed) return;
    try { this.socket.write(makeFrame(Buffer.alloc(0), 0x8)); } catch {}
    this.socket.end();
    this.#closed();
  }

  #closed() {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }

  #consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      if (this.buffer.length < 2) return;
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) { this.close(); return; }
        length = Number(big);
        offset = 10;
      }
      if (length > MAX_MESSAGE_BYTES) { this.close(); return; }
      const maskBytes = masked ? 4 : 0;
      if (this.buffer.length < offset + maskBytes + length) return;
      let mask = null;
      if (masked) {
        mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      const payload = Buffer.from(this.buffer.subarray(offset, offset + length));
      this.buffer = this.buffer.subarray(offset + length);
      if (mask) for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];

      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this.socket.write(makeFrame(payload, 0xA)); continue; }
      if (opcode !== 0x1) continue;
      try { this.onMessage(JSON.parse(payload.toString('utf8'))); } catch {
        this.sendJson({ type: 'error', message: 'Malformed message' });
      }
    }
  }
}

export function acceptWebSocket(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n',
  ].join('\r\n'));
  return new WebSocketPeer(socket);
}
