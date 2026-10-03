import { CHALLENGES } from '../src/challenges.mjs';
import { GAME_MODES } from '../src/modes.mjs';
import { SPELLS } from '../src/spells.mjs';

const MODES = new Set([GAME_MODES.FFA, GAME_MODES.DUEL, GAME_MODES.BOT_DUEL]);
const CONTACT_SOURCES = new Set(['sword', 'fireball', 'frostfire', 'gale', 'gauntlet', 'vortex', 'rupture']);

/** Match memory only. Profile settlement owns persistence and rewards. */
export function resetChallengeTracking(room) {
  room.challengeFacts = [];
  room.challengeTracking = { players: new Map(), bentProjectiles: new Map() };
}

/** Authoritative combat queues facts independently from public presentation events. */
export function recordChallengeFact(room, fact) {
  if (!MODES.has(room?.mode) || !fact || typeof fact !== 'object' || !Number.isFinite(fact.at)) return;
  if (!room.challengeTracking) resetChallengeTracking(room);
  room.challengeFacts.push({ ...fact });
}

function knight(room, id) { return typeof id === 'string' && room.players.has(id); }
function enemies(room, attacker, victim) { return attacker !== victim && knight(room, attacker) && knight(room, victim); }
function stateFor(room, id) {
  if (!knight(room, id) || room.players.get(id).actorKind !== 'human') return null;
  let state = room.challengeTracking.players.get(id);
  if (!state) {
    state = { progress: {}, chains: new Map(), parried: new Map(), mixed: new Map(), lowHealth: false };
    room.challengeTracking.players.set(id, state);
  }
  return state;
}
function advance(state, id, value = 1) {
  if (state) state.progress[id] = Math.max(state.progress[id] ?? 0, Math.min(CHALLENGES[id].goal, value));
}
function validDamage(room, fact) {
  return enemies(room, fact.attackerId, fact.victimId) && (CONTACT_SOURCES.has(fact.source) || fact.source === 'burn');
}
function realDamage(room, f) {
  return validDamage(room, f) && Number.isFinite(f.amount) && f.amount > 0
    && Number.isFinite(f.rawDamage) && f.rawDamage >= 0
    && Number.isFinite(f.healthBefore) && f.healthBefore > 0 && Number.isFinite(f.healthAfter) && f.healthAfter >= 0
    && Math.abs(f.healthBefore - f.healthAfter - f.amount) < 1e-6;
}

function chainContact(state, f) {
  if (!state || f.contact !== true || f.source !== 'sword' || f.ordinary !== true || typeof f.chainId !== 'string' || !f.chainId
    || !Number.isInteger(f.strikeIndex) || f.strikeIndex < 0 || f.strikeIndex > 2) return;
  let chain = state.chains.get(f.chainId);
  if (!chain) {
    chain = { victimId: f.victimId, next: 0, interrupted: false };
    state.chains.set(f.chainId, chain);
  }
  if (chain.interrupted) return;
  if (chain.victimId !== f.victimId) { chain.interrupted = true; return; }
  if (f.strikeIndex !== chain.next) return;
  chain.next += 1;
  advance(state, 'three_part_argument', chain.next);
}

function mixedContact(state, victimId, contact) {
  if (!state) return;
  const prior = state.mixed.get(victimId) ?? [];
  const recent = prior.filter(c => Math.abs(c.at - contact.at) <= 1.5);
  recent.push(contact);
  state.mixed.set(victimId, recent);
  for (const sword of recent.filter(c => c.kind === 'sword')) {
    for (const spell of recent.filter(c => c.kind === 'spell')) {
      if (Math.abs(sword.at - spell.at) > 1.5) continue;
      if (sword.guarding || spell.guarding || recent.some(c => c.kind === 'guard'
        && Math.max(c.at, sword.at, spell.at) - Math.min(c.at, sword.at, spell.at) <= 1.5)) {
        advance(state, 'both_hands_full');
        return;
      }
    }
  }
}

function observeDamage(room, f) {
  if (!realDamage(room, f)) return;
  const victim = stateFor(room, f.victimId);
  if (victim && f.healthAfter <= 15) victim.lowHealth = true;
  if (f.contact === true && CONTACT_SOURCES.has(f.source) && Number.isFinite(f.steel) && f.steel > 0.005
    && Number.isFinite(f.rawDamage) && f.rawDamage >= f.healthBefore && f.rawDamage > f.amount && f.healthAfter > 0) {
    advance(victim, 'polished_under_pressure');
  }
  const attacker = stateFor(room, f.attackerId);
  chainContact(attacker, f);
  if (f.contact === true && f.source === 'sword' && f.ordinary === true && f.chivalry === true && f.dashing === true) advance(attacker, 'passing_remark');
  if (f.contact === true && f.chivalry === true) {
    if (f.source === 'sword' && f.ordinary === true) mixedContact(attacker, f.victimId, { at: f.at, kind: 'sword', guarding: f.guarding === true });
    else if (f.prepared === true && Object.hasOwn(SPELLS, f.source) && SPELLS[f.source].kind !== 'ward') {
      mixedContact(attacker, f.victimId, { at: f.at, kind: 'spell', guarding: f.guarding === true });
    }
  }
  const bent = room.challengeTracking.bentProjectiles.get(f.projectileId);
  if (f.contact === true && f.ordinaryProjectile === true && ['fireball', 'frostfire'].includes(f.source)
    && bent?.ownerId === f.attackerId && f.at >= bent.at) advance(attacker, 'wind_correction');
}

/** Drain once, after combat finishes its whole tick and before any match settlement. */
export function observeChallengeFacts(room) {
  if (!room) return;
  if (!room.challengeTracking) resetChallengeTracking(room);
  const facts = room.challengeFacts.splice(0);
  if (!MODES.has(room.mode)) return;
  for (const f of facts) {
    if (!f || !Number.isFinite(f.at)) continue;
    switch (f.type) {
      case 'damage': observeDamage(room, f); break;
      case 'swordChainInterrupted': {
        const state = stateFor(room, f.playerId);
        if (!state || typeof f.chainId !== 'string' || !f.chainId) break;
        const chain = state.chains.get(f.chainId) ?? { next: 0, victimId: null };
        chain.interrupted = true;
        state.chains.set(f.chainId, chain);
        break;
      }
      case 'parry':
        if (enemies(room, f.defenderId, f.attackerId)) stateFor(room, f.defenderId)?.parried.set(f.attackerId, f.at);
        break;
      case 'death': {
        if (!enemies(room, f.killerId, f.victimId)) break;
        const state = stateFor(room, f.killerId);
        const parriedAt = state?.parried.get(f.victimId);
        if (Number.isFinite(parriedAt) && f.at >= parriedAt && f.at - parriedAt <= 5) advance(state, 'turnabout');
        if (f.source === 'abyss' && f.displacementSource === 'gale' && f.displacementBy === f.killerId
          && Number.isFinite(f.displacementAt) && f.at >= f.displacementAt && f.at - f.displacementAt <= 5) advance(state, 'mind_the_gap');
        break;
      }
      case 'projectileBent':
        if (f.ordinary === true && knight(room, f.ownerId)
          && f.ownerId === f.benderId && typeof f.projectileId === 'string' && f.projectileId) {
          room.challengeTracking.bentProjectiles.set(f.projectileId, { ownerId: f.ownerId, at: f.at });
        }
        break;
      case 'guardContact':
        if (f.chivalry === true && enemies(room, f.playerId, f.enemyId)) mixedContact(stateFor(room, f.playerId), f.enemyId, { at: f.at, kind: 'guard' });
        break;
      case 'ultimateInterrupted':
        if (f.phase === 'startup' && ['stagger', 'sunder', 'death'].includes(f.source) && Number.isFinite(f.commitAt)
          && f.at < f.commitAt && enemies(room, f.by, f.victimId)) advance(stateFor(room, f.by), 'not_yet');
        break;
      case 'matchFinished':
        if ([GAME_MODES.DUEL, GAME_MODES.BOT_DUEL].includes(room.mode) && f.reason !== 'forfeit') {
          const state = stateFor(room, f.winnerId);
          if (state?.lowHealth) advance(state, 'against_better_judgment');
        }
        break;
    }
  }
}

/** Private settlement input. Never expose this map directly as HUD/public challenge state. */
export function challengeProgressFor(room, playerId) {
  return { ...(room?.challengeTracking?.players.get(playerId)?.progress ?? {}) };
}
