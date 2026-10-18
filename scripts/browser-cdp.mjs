export class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      const timer = setTimeout(() => reject(new Error('Timed out connecting to Chrome DevTools')), 10000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Chrome DevTools WebSocket failed')); });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data));
        if (message.id) {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`));
          else pending.resolve(message.result ?? {});
          return;
        }
        for (const listener of this.events.get(message.method) || []) listener(message.params || {});
      });
    });
  }

  on(method, listener) {
    const list = this.events.get(method) || [];
    list.push(listener);
    this.events.set(method, list);
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`CDP socket is not open for ${method}`));
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
  }

  close() { this.socket?.close(); }
}

