import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CLOTH } from '../../shared/src/cosmetics.mjs';

export function matchReward(room, player, finishedAt) {
  if (room.state !== 'FINISHED' || !['FFA', 'DUEL', 'BOT_DUEL'].includes(room.mode)
    || room.finishReason === 'forfeit' || room.matchStartedAt === null
    || finishedAt - room.matchStartedAt < 30 || player.actorKind !== 'human' || !player.connected
    || !(player.kills + player.deaths + player.parries > 0)) return 0;
  return 20 + (room.winnerId === player.id ? 10 : 0);
}

// One process owns this directory. Credentials are random bearer secrets; only hashes are stored on disk.
// Each transaction replaces one complete profile atomically. A failed write never mutates the cached wallet.
export class ProfileStore {
  constructor(directory) {
    this.directory = directory;
    this.profiles = new Map();
  }
  key(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Guest profile unavailable. Keep your saved identity and reconnect.');
    return crypto.createHash('sha256').update(token).digest('hex');
  }
  read(token) {
    const key = this.key(token);
    if (!this.profiles.has(key)) {
      try {
        const profile = JSON.parse(fs.readFileSync(path.join(this.directory, `${key}.json`), 'utf8'));
        if (profile.version !== 1 || !Number.isSafeInteger(profile.balance) || profile.balance < 0
          || !Array.isArray(profile.owned) || !Array.isArray(profile.receipts)
          || !profile.owned.includes(profile.equipped)) throw new Error('Invalid profile');
        this.profiles.set(key, profile);
      } catch { throw new Error('Guest profile unavailable. Keep your saved identity and reconnect.'); }
    }
    return this.profiles.get(key);
  }
  write(token, profile) {
    const key = this.key(token);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, `${key}.json`);
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(profile), { mode: 0o600 });
      fs.renameSync(temp, file);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
    this.profiles.set(key, profile);
    return this.view(profile);
  }
  view(profile) {
    return { balance: profile.balance, owned: [...profile.owned], equipped: profile.equipped, lastReward: profile.lastReward ?? null };
  }
  open(token = null) {
    if (token) return { profile: this.view(this.read(token)) };
    token = crypto.randomBytes(32).toString('hex');
    const profile = this.write(token, { version: 1, balance: 0, owned: ['crimson'], equipped: 'crimson', receipts: [] });
    return { token, profile };
  }
  reward(token, matchId, amount) {
    const current = this.read(token);
    if (current.receipts.includes(matchId)) return this.view(current);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 30) throw new Error('Invalid reward');
    return this.write(token, { ...current, balance: current.balance + amount,
      receipts: [...current.receipts, matchId], lastReward: { matchId, amount } });
  }
  purchase(token, id) {
    const current = this.read(token);
    if (!Object.hasOwn(CLOTH, id)) throw new Error('Unknown cloth');
    if (current.owned.includes(id)) return this.view(current);
    if (current.balance < CLOTH[id].price) throw new Error('Earn more Renown to unlock this cloth.');
    return this.write(token, { ...current, balance: current.balance - CLOTH[id].price, owned: [...current.owned, id] });
  }
  equip(token, id) {
    const current = this.read(token);
    if (!current.owned.includes(id)) throw new Error('This cloth must be owned before equipping.');
    if (current.equipped === id) return this.view(current);
    return this.write(token, { ...current, equipped: id });
  }
}
