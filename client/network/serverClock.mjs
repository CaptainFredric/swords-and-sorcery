// A snapshot is stamped when simulated, not when the browser receives it.
// Computing serverNow from the *latest arrival* makes the clock jump backward
// whenever packets arrive in bursts. Keep a monotonic clock and slowly adjust
// its offset to the network observations instead.
export class ServerClock {
  constructor() { this.reset(); }
  reset() { this.offset = null; this.lastServerTime = null; this.lastNow = -Infinity; }
  observe(serverTime, receivedAtMs) {
    if (!Number.isFinite(serverTime) || !Number.isFinite(receivedAtMs)) return;
    if (this.lastServerTime !== null && serverTime < this.lastServerTime - 1) this.reset(); // host restart
    if (this.lastServerTime !== null && serverTime < this.lastServerTime) return;
    const observed = serverTime - receivedAtMs / 1000;
    if (this.offset === null) this.offset = observed;
    else {
      // Prefer the lowest-latency samples; don't chase each late packet.
      const difference = observed - this.offset;
      this.offset += Math.max(-0.001, Math.min(0.005, difference));
    }
    this.lastServerTime = serverTime;
  }
  now(localNowMs) {
    if (this.offset === null) return 0;
    const estimate = localNowMs / 1000 + this.offset;
    this.lastNow = Math.max(this.lastNow, this.lastServerTime, estimate);
    return this.lastNow;
  }
}
