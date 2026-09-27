// Server-wide random one-on-one. Seekers wait in arrival order and are paired two at a time; one server keeps the
// queue in memory (more than one server would need a shared store such as Redis).

export const MATCHMAKING = Object.freeze({
  // after this long without a challenger, a seeker is offered a bot to fight while they keep waiting
  botOfferAfterSec: 30,
});

export class Matchmaker {
  constructor({ botOfferAfterSec = MATCHMAKING.botOfferAfterSec } = {}) {
    this.botOfferAfterSec = botOfferAfterSec;
    this.queue = [];
  }

  get size() {
    return this.queue.length;
  }

  has(key) {
    return this.queue.some((entry) => entry.key === key);
  }

  entry(key) {
    return this.queue.find((entry) => entry.key === key) ?? null;
  }

  /** Join the queue (a seeker already in it keeps their place). */
  enqueue(key, name, nowSec) {
    const existing = this.entry(key);
    if (existing) {
      existing.name = name;
      return existing;
    }
    const entry = { key, name, since: nowSec, botOffered: false };
    this.queue.push(entry);
    return entry;
  }

  /** Put a seeker back at the front (their partner vanished as they were being paired). */
  requeueFront(entry) {
    if (!entry || this.has(entry.key)) return;
    this.queue.unshift(entry);
  }

  cancel(key) {
    const before = this.queue.length;
    this.queue = this.queue.filter((entry) => entry.key !== key);
    return this.queue.length !== before;
  }

  /** Pairs to put into duels now: first come, first served. */
  takePairs() {
    const pairs = [];
    while (this.queue.length >= 2) pairs.push([this.queue.shift(), this.queue.shift()]);
    return pairs;
  }

  /** Seekers who have waited long enough to be offered a bot (each is offered once). */
  dueBotOffers(nowSec) {
    const due = [];
    for (const entry of this.queue) {
      if (!entry.botOffered && nowSec - entry.since >= this.botOfferAfterSec) {
        entry.botOffered = true;
        due.push(entry);
      }
    }
    return due;
  }
}
