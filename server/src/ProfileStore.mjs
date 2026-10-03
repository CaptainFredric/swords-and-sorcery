import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CHALLENGES, publicChallengeState } from '../../shared/src/challenges.mjs';
import { CLOTH } from '../../shared/src/cosmetics.mjs';

export function assessMatchReward(room, player, finishedAt) {
  let reason = 'earned';
  if (room.state !== 'FINISHED' || !['FFA', 'DUEL', 'BOT_DUEL'].includes(room.mode)) reason = 'training';
  else if (room.finishReason === 'forfeit') reason = 'forfeit';
  else if (player.actorKind !== 'human' || !player.connected) reason = 'left';
  else if (room.matchStartedAt === null || finishedAt - room.matchStartedAt < 30) reason = 'short';
  else if (!(player.kills + player.deaths + player.parries > 0)) reason = 'inactive';
  if (reason !== 'earned') return { amount: 0, reason, completion: 0, victory: 0 };
  const victory = room.winnerId === player.id ? 10 : 0;
  return { amount: 20 + victory, reason, completion: 20, victory };
}
export function matchReward(room, player, finishedAt) { return assessMatchReward(room, player, finishedAt).amount; }

const PROFILE_VERSION = 2;
const CHALLENGE_VERSION = 1;
const emptyChallenges = () => ({ version: CHALLENGE_VERSION, progress: {}, completed: {}, rewarded: [] });
const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

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
        if (![1, PROFILE_VERSION].includes(profile.version) || !Number.isSafeInteger(profile.balance) || profile.balance < 0
          || !Array.isArray(profile.owned) || !Array.isArray(profile.receipts)
          || !profile.owned.includes(profile.equipped)) throw new Error('Invalid profile');
        if (profile.version === 1) {
          this.write(token, { ...profile, version: PROFILE_VERSION, challenges: emptyChallenges() });
        } else {
          const challenges = profile.challenges;
          if (!isRecord(challenges) || challenges.version !== CHALLENGE_VERSION
            || !isRecord(challenges.progress) || !isRecord(challenges.completed) || !Array.isArray(challenges.rewarded)) {
            throw new Error('Invalid challenge state');
          }
          this.profiles.set(key, profile);
        }
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
    const lastReward = profile.lastReward ? structuredClone(profile.lastReward) : null;
    if (Array.isArray(lastReward?.challenges)) lastReward.challenges = lastReward.challenges.filter((id) => Object.hasOwn(CHALLENGES, id));
    return { balance: profile.balance, owned: [...profile.owned], equipped: profile.equipped,
      lastReward, challenges: publicChallengeState(profile.challenges) };
  }
  open(token = null) {
    if (token) return { profile: this.view(this.read(token)) };
    token = crypto.randomBytes(32).toString('hex');
    const profile = this.write(token, { version: PROFILE_VERSION, balance: 0, owned: ['crimson'], equipped: 'crimson', receipts: [], challenges: emptyChallenges() });
    return { token, profile };
  }
  reward(token, matchId, amount, details = {}) {
    return this.settleMatch(token, matchId, amount, {}, details);
  }

  /** One eligible match's base reward and observed feats, committed together. Callers decide match eligibility. */
  settleMatch(token, matchId, amount, challengeProgress = {}, details = {}) {
    const current = this.read(token);
    if (current.receipts.includes(matchId)) return this.view(current);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 30) throw new Error('Invalid reward');
    const prior = current.challenges;
    const progress = { ...prior.progress };
    const completed = { ...prior.completed };
    const rewarded = [...prior.rewarded];
    const paid = new Set(rewarded);
    const newlyCompleted = [];
    let challengeAmount = 0;
    const completedAt = Number.isFinite(details.completedAt) && details.completedAt > 0 ? details.completedAt : Date.now();
    for (const [id, observed] of Object.entries(isRecord(challengeProgress) ? challengeProgress : {})) {
      if (!Object.hasOwn(CHALLENGES, id) || !Number.isFinite(observed) || observed < 0) continue;
      const challenge = CHALLENGES[id];
      const previous = Number.isFinite(progress[id]) ? Math.max(0, Math.floor(progress[id])) : 0;
      const value = Math.min(challenge.goal, Math.max(previous, Math.floor(observed)));
      if (value > 0) progress[id] = value;
      if (!completed[id] && value >= challenge.goal) {
        completed[id] = completedAt;
        newlyCompleted.push(id);
      }
      if (completed[id] && !paid.has(id)) {
        challengeAmount += challenge.reward.renown ?? 0;
        paid.add(id);
        rewarded.push(id);
      }
    }
    const total = amount + challengeAmount;
    const balance = current.balance + total;
    if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Invalid reward');
    return this.write(token, { ...current, balance,
      challenges: { ...prior, version: CHALLENGE_VERSION, progress, completed, rewarded },
      receipts: [...current.receipts, matchId],
      lastReward: { matchId, amount: total, reason: details.reason ?? (total ? 'earned' : 'ineligible'),
        completion: amount > 0 ? 20 : 0, victory: amount === 30 ? 10 : 0, challengeAmount, challenges: newlyCompleted },
    });
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
