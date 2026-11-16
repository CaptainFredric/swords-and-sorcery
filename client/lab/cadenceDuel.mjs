// The Combat Lab's duel: two knights on cadence combat's rules (shared/src/combatFrameData.mjs), stepped at a fixed
// rate. Pure and deterministic (a seeded random for the sparring knight), so the rules are tested in Node and the page
// only draws what happens. Not the server: the lab is where the rules are felt and tuned before the authoritative
// simulation (shared/sim/combat.mjs) takes them.
//
// A knight: moves, turns, cuts (a chain of up to three, carried on by pressing in time), guards (Perfect Parry, Parry,
// Block by when the guard went up), feints (a guard raised before his own cut goes live calls it off), is staggered,
// struck, and falls. Each cut's step moves him (root motion from the clip's markers), so the step shown is the step
// taken.

import { GAME, guardBlockCost, swordDamageFor } from '../../shared/src/combat.mjs';
import { aimQuality } from '../../shared/src/blade.mjs';
import {
  ACTIVE, CADENCE, CUTS, CUT_ORDER, DEFENCE, TIMING_BONUS, cutClipTime, emptyStats, hitStopFor, judgeCadence, judgeDefence, nextCutDelay,
} from '../../shared/src/combatFrameData.mjs';

export const DT = 1 / 60;
const MOVE_SPEED = 3.6;
const SPEED_WHILE = Object.freeze({ cut: 0.3, guard: 0.5, stagger: 0 });
const TURN_RATE = Math.PI * 2.2;     // the sparring knight's turn, rad/s
const BODY_GAP = 0.9;                // two knights never closer than this (m)
const REACH = GAME.swordRange + 0.2; // from one knight's middle to the other's
const ARC_HALF = Object.freeze([75, 75, 12]); // how far off the aim each cut can catch a body (degrees)
const FLINCH = 0.22;                 // a struck knight's cut not yet live is lost; he reels this long
const GUARD_BREAK = Object.freeze({ stagger: GAME.guardBreakStaggerMs / 1000, noGuard: 1.2 });
const STAMINA_REGEN = 22;
const WHIFF_TAP = 0.25;              // a guard held less than this and dropped with nothing met is a whiff
const RESPAWN = 2.4;

/** A seeded random (mulberry32). */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const forwardOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
const rightOf = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function knight(id, x, z, yaw) {
  return {
    id, pos: { x, z }, yaw, speed: 0, health: GAME.maxHealth, stamina: 100, alive: true, diedAt: null, spawn: { x, z, yaw },
    guard: { up: false, raisedAt: -Infinity, releasedAt: -Infinity, met: false, whiffUntil: -Infinity, brokenUntil: -Infinity },
    cut: null, chainLength: 0, staggerUntil: -Infinity, staggerKind: null, staggerAt: -Infinity, riposteUntil: -Infinity,
    reaction: null, // { kind: 'hit' | 'block' | 'parried', at, from: {x, z} }
    input: { move: { x: 0, z: 0 }, yaw, attack: false, guard: false, attackPressedAt: null },
    wasAttack: false, wasGuard: false, stats: emptyStats(), lastPress: null,
  };
}

/**
 * A duel. variants: the clip markers and root motion each cut's clip has (by cut name: { clip, clipContact, linkEntry,
 * clipEnd, rootMotion: [{ t, x, z }] }); a cut not named uses its own (CUTS). opponent: 'drill' | 'spar' | 'dummy'.
 */
export function createDuel({ variants = {}, opponent = 'drill', seed = 7 } = {}) {
  return {
    now: 0, tick: 0, events: [], variants, opponent, random: seeded(seed),
    player: knight('player', 0, 2.6, 0),
    foe: knight('foe', 0, -0.4, Math.PI),
    bot: { nextAttackAt: 1.5, guardPlan: null, chainWant: 1, pressAt: null },
  };
}

const clipOf = (duel, name) => duel.variants[name] ?? CUTS[name];

// Motion warping: a cut's step is its clip's, scaled so the blow arrives at striking distance from the knight in
// front of him, never through him (the full step when nobody is there, none when he is already close). The clip's
// own feet then slide by what was taken off: the cost, until stride warping bends the legs to match.
export const STRIKE_DISTANCE = 1.5;
function stepWarp(duel, k, name, linked) {
  const clip = clipOf(duel, name);
  if (!clip.rootMotion?.length) return 1;
  const startup = linked ? CUTS[name].startup.linked : CUTS[name].startup.fresh;
  const from = sampleRoot(clip.rootMotion, cutClipTime(clip, 0, { linked, startup }));
  const to = clip.rootMotion[clip.rootMotion.length - 1];
  const ahead = from.z - to.z; // (clip space: -z ahead)
  if (!(ahead > 0.01)) return 1;
  const other = k === duel.player ? duel.foe : duel.player;
  const f = forwardOf(k.yaw);
  const dx = other.pos.x - k.pos.x, dz = other.pos.z - k.pos.z;
  const along = dx * f.x + dz * f.z, across = Math.abs(dx * f.z - dz * f.x);
  // (only a knight in front, near his line, is aimed at)
  if (!other.alive || along <= 0 || across > 1.2 || along > STRIKE_DISTANCE + ahead + 1) return 1;
  return Math.max(0, Math.min(1, (along - STRIKE_DISTANCE) / ahead));
}

// --- cuts
function startCut(duel, k, name, { linked = false } = {}) {
  const now = duel.now;
  const riposte = now < k.riposteUntil;
  const cut = CUTS[name];
  const startup = (linked ? cut.startup.linked : cut.startup.fresh) * (riposte ? 0.8 : 1);
  k.cut = {
    name, index: CUT_ORDER.indexOf(name), linked, riposte, startedAt: now, contactAt: now + startup, startup,
    resolved: false, press: null, grade: k.cut?.nextGrade ?? 'held', nextGrade: null, nextAt: null, chainStep: (linked ? (k.cut?.chainStep ?? 0) + 1 : 1),
    tellSent: false, rootPrev: null, warp: stepWarp(duel, k, name, linked),
  };
  if (riposte) k.riposteUntil = -Infinity;
  k.chainLength = k.cut.chainStep;
  if (k.id === 'player') k.stats.longestChain = Math.max(k.stats.longestChain, k.chainLength);
  duel.events.push({ type: 'cutStart', who: k.id, cut: name, linked, riposte, grade: k.cut.grade, at: now, contactAt: k.cut.contactAt });
}

function endChain(duel, k, why) {
  if (!k.cut) return;
  if (why === 'lapsed') k.lapsed = { at: duel.now, cut: k.cut.name, contactAt: k.cut.contactAt };
  duel.events.push({ type: 'chainEnd', who: k.id, why, at: duel.now, length: k.chainLength });
  k.cut = null;
  k.chainLength = 0;
}

/** A fresh press of the attack button. */
function pressAttack(duel, k, pressedAt = duel.now) {
  const now = duel.now;
  // (judged when it was pressed, not on the step that read it: never later than now, never before the last step)
  const at = Math.max(now - DT, Math.min(now, pressedAt));
  if (!k.alive || now < k.staggerUntil) return;
  if (k.guard.up) lowerGuard(duel, k);
  const c = k.cut;
  if (!c) {
    // a press just after a chain lapsed was meant for it: late (the chain starts over from the forehand)
    if (k.lapsed && now - k.lapsed.at < 0.35) {
      const offsetMs = Math.round((at - k.lapsed.contactAt - CADENCE.beat) * 1000);
      if (k.id === 'player') { k.stats.presses += 1; k.stats.cadenceAbsMs += Math.abs(offsetMs); }
      k.lastPress = { grade: 'late', offsetMs, at: now, cut: k.lapsed.cut };
      duel.events.push({ type: 'press', who: k.id, grade: 'late', offsetMs, at: now, cut: k.lapsed.cut });
    }
    k.lapsed = null;
    startCut(duel, k, 'forehand');
    return;
  }
  if (c.press) return; // one press per cut counts
  const judged = judgeCadence(at - c.contactAt);
  c.press = { at, ...judged };
  k.stats.presses += k.id === 'player' ? 1 : 0;
  if (k.id === 'player') {
    if (judged.grade === 'perfect') k.stats.onBeat += 1;
    k.stats.cadenceAbsMs += Math.abs(judged.offset) * 1000;
  }
  k.lastPress = { grade: judged.grade, offsetMs: Math.round(judged.offset * 1000), at, cut: c.name };
  duel.events.push({ type: 'press', who: k.id, grade: judged.grade, offsetMs: Math.round(judged.offset * 1000), at, cut: c.name });
}

function raiseGuard(duel, k, { held = false } = {}) {
  const now = duel.now;
  if (!k.alive || now < k.staggerUntil || now < k.guard.whiffUntil || now < k.guard.brokenUntil || k.stamina <= 0) return false;
  // a cut not yet live is called off (a feint); one already live finishes first
  if (k.cut && !k.cut.resolved) {
    if (now < k.cut.contactAt - ACTIVE.before) { duel.events.push({ type: 'feint', who: k.id, at: now, cut: k.cut.name }); endChain(duel, k, 'feint'); }
    else return false;
  } else if (k.cut) endChain(duel, k, 'guard');
  // (a guard that comes back up by itself, the button held through, only blocks: it was not raised in time for anything)
  k.guard = { ...k.guard, up: true, raisedAt: held ? -Infinity : now, met: false };
  duel.events.push({ type: 'guardUp', who: k.id, at: now });
  return true;
}

function lowerGuard(duel, k) {
  const now = duel.now;
  if (!k.guard.up) return;
  const held = now - k.guard.raisedAt;
  k.guard = { ...k.guard, up: false, releasedAt: now };
  if (held < WHIFF_TAP && !k.guard.met) {
    k.guard.whiffUntil = now + DEFENCE.whiffOpening;
    if (k.id === 'player') k.stats.whiffs += 1;
    duel.events.push({ type: 'whiff', who: k.id, at: now });
  }
}

function stagger(duel, k, seconds, kind) {
  k.staggerUntil = Math.max(k.staggerUntil, duel.now + seconds);
  k.staggerKind = kind;
  k.staggerAt = duel.now;
  if (k.cut) endChain(duel, k, kind);
  if (k.guard.up) k.guard = { ...k.guard, up: false, releasedAt: duel.now };
}

// --- contact: the blow resolved on its contact frame
function resolveContact(duel, a, d) {
  const c = a.cut;
  c.resolved = true;
  const now = duel.now;
  const dx = d.pos.x - a.pos.x, dz = d.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const f = forwardOf(a.yaw);
  const off = Math.acos(Math.max(-1, Math.min(1, (f.x * dx + f.z * dz) / (dist || 1)))) * 180 / Math.PI;
  const offAim = Math.max(0, off - Math.atan2(0.45, Math.max(dist, 0.1)) * 180 / Math.PI);
  const live = d.alive && dist <= REACH && offAim <= ARC_HALF[c.index];
  const base = { type: 'contact', who: a.id, target: d.id, cut: c.name, grade: c.grade, riposte: c.riposte, at: now };
  if (!live) { duel.events.push({ ...base, outcome: 'miss' }); return; }
  const quality = aimQuality(offAim);
  if (d.id === 'player') d.stats.blows += 1;
  const defence = judgeDefence({ guarding: d.guard.up, guardedAt: d.guard.raisedAt, contactAt: now });
  if (defence.tier !== 'none') d.guard.met = true;
  if (defence.tier === 'perfect') {
    stagger(duel, a, DEFENCE.perfectStagger, 'perfectParried');
    d.riposteUntil = now + DEFENCE.riposteWindow;
    if (d.id === 'player') d.stats.perfectParries += 1;
    d.reaction = { kind: 'parry', at: now };
    duel.events.push({ ...base, outcome: 'perfect', leadMs: Math.round(defence.lead * 1000), hitStop: hitStopFor({ outcome: 'perfect' }) });
    return;
  }
  if (defence.tier === 'parry') {
    stagger(duel, a, DEFENCE.parryStagger, 'parried');
    if (d.id === 'player') d.stats.parries += 1;
    d.reaction = { kind: 'parry', at: now };
    duel.events.push({ ...base, outcome: 'parry', leadMs: Math.round(defence.lead * 1000), hitStop: hitStopFor({ outcome: 'parry' }) });
    return;
  }
  if (defence.tier === 'block') {
    d.stamina = Math.max(0, d.stamina - guardBlockCost() * (0.6 + 0.4 * quality));
    if (d.id === 'player') d.stats.blocks += 1;
    d.reaction = { kind: 'block', at: now };
    if (d.stamina <= 1e-9) {
      stagger(duel, d, GUARD_BREAK.stagger, 'guardBreak');
      d.guard.brokenUntil = now + GUARD_BREAK.noGuard;
      duel.events.push({ ...base, outcome: 'guardBreak', leadMs: Math.round(defence.lead * 1000), hitStop: hitStopFor({ outcome: 'block' }) * 1.6 });
    } else {
      duel.events.push({ ...base, outcome: 'block', leadMs: Math.round(defence.lead * 1000), hitStop: hitStopFor({ outcome: 'block' }) });
    }
    return;
  }
  // a hit
  const bonus = c.riposte ? TIMING_BONUS.riposte : (TIMING_BONUS[c.grade] ?? 1);
  const damage = Math.round(swordDamageFor(quality) * bonus);
  d.health = Math.max(0, d.health - damage);
  if (a.id === 'player') { a.stats.hits += 1; if (quality >= 0.8) a.stats.cleanHits += 1; }
  if (d.id === 'player') d.stats.taken += 1;
  d.reaction = { kind: 'hit', at: now, from: { x: a.pos.x, z: a.pos.z } };
  // a cut not yet live is lost to the blow
  if (d.cut && !d.cut.resolved && now < d.cut.contactAt - ACTIVE.before) { endChain(duel, d, 'struck'); d.staggerUntil = Math.max(d.staggerUntil, now + FLINCH); d.staggerKind = 'flinch'; d.staggerAt = now; }
  duel.events.push({ ...base, outcome: 'hit', quality: +quality.toFixed(2), damage, hitStop: hitStopFor({ outcome: 'hit', quality, grade: c.grade, riposte: c.riposte }) });
  if (d.health <= 0) {
    d.alive = false; d.diedAt = now;
    if (d.cut) endChain(duel, d, 'fell');
    duel.events.push({ type: 'fell', who: d.id, at: now });
  }
}

// --- each cut's own clock: tell, contact, what comes next, its step
function stepCut(duel, k, other) {
  const c = k.cut;
  if (!c) return;
  const now = duel.now;
  if (!c.tellSent && now >= c.contactAt - CUTS[c.name].tellLead) {
    c.tellSent = true;
    duel.events.push({ type: 'tell', who: k.id, cut: c.name, at: now, contactAt: c.contactAt });
  }
  // root motion: the clip's own step, along his facing
  const clip = clipOf(duel, c.name);
  if (clip.rootMotion?.length) {
    const t = cutClipTime(clip, now - c.startedAt, { linked: c.linked, startup: c.startup });
    const r = sampleRoot(clip.rootMotion, t);
    if (c.rootPrev) {
      const dxl = r.x - c.rootPrev.x, dzl = r.z - c.rootPrev.z;
      const f = forwardOf(k.yaw), rt = rightOf(k.yaw);
      // (clip space: x right, -z ahead)
      const w = c.warp ?? 1;
      move(duel, k, { x: (rt.x * dxl - f.x * dzl) * w, z: (rt.z * dxl - f.z * dzl) * w }, other);
    }
    c.rootPrev = r;
  }
  if (!c.resolved && now + 1e-9 >= c.contactAt) resolveContact(duel, k, other);
  if (!k.cut || !c.resolved) return;
  // after contact: the next cut, on the press's grade or the held button's slow cadence, or the chain lapses
  const since = now - c.contactAt;
  if (c.nextAt == null) {
    const grade = c.press && c.press.grade !== 'late' ? c.press.grade : (k.input.attack ? 'held' : null);
    if (grade) { c.nextGrade = grade; c.nextAt = c.contactAt + (c.index === 2 ? Math.min(nextCutDelay(grade), CADENCE.finisherRestart) : nextCutDelay(grade)); }
  }
  if (c.nextAt != null && now + 1e-9 >= c.nextAt) {
    const chop = c.index === 2;
    const grade = c.nextGrade;
    k.cut = { ...c, nextGrade: grade, chainStep: chop ? 0 : c.chainStep };
    startCut(duel, k, chop ? 'forehand' : CUT_ORDER[c.index + 1], { linked: !chop });
    return;
  }
  if (since > CADENCE.lapse && c.nextAt == null) endChain(duel, k, 'lapsed');
}

function sampleRoot(curve, t) {
  if (t <= curve[0].t) return curve[0];
  for (let i = 1; i < curve.length; i += 1) {
    if (t <= curve[i].t) {
      const a = curve[i - 1], b = curve[i], w = (t - a.t) / (b.t - a.t || 1);
      return { t, x: a.x + (b.x - a.x) * w, z: a.z + (b.z - a.z) * w };
    }
  }
  return curve[curve.length - 1];
}

function move(duel, k, delta, other) {
  const nx = k.pos.x + delta.x, nz = k.pos.z + delta.z;
  const gap = Math.hypot(nx - other.pos.x, nz - other.pos.z);
  if (other.alive && gap < BODY_GAP) {
    // slide along the other knight, never into him
    const ax = (nx - other.pos.x) / (gap || 1), az = (nz - other.pos.z) / (gap || 1);
    k.pos.x = other.pos.x + ax * BODY_GAP; k.pos.z = other.pos.z + az * BODY_GAP;
  } else { k.pos.x = nx; k.pos.z = nz; }
  // the yard: a ring of 9 m
  const r = Math.hypot(k.pos.x, k.pos.z);
  if (r > 9) { k.pos.x *= 9 / r; k.pos.z *= 9 / r; }
}

function stepKnight(duel, k, other) {
  const now = duel.now;
  if (!k.alive) {
    if (now - k.diedAt > RESPAWN) respawn(duel);
    return;
  }
  const inp = k.input;
  if (now >= k.staggerUntil) {
    k.yaw = inp.yaw;
    if (inp.guard && !k.wasGuard) raiseGuard(duel, k);
    else if (inp.guard && !k.guard.up && !k.cut) raiseGuard(duel, k, { held: true }); // a held guard comes back up when it can
    if (!inp.guard && k.guard.up) lowerGuard(duel, k);
    if (inp.attackPressedAt != null) { pressAttack(duel, k, inp.attackPressedAt); inp.attackPressedAt = null; }
  } else inp.attackPressedAt = null;
  k.wasGuard = inp.guard;
  if (k.guard.up) k.stamina = Math.max(0, k.stamina);
  else k.stamina = Math.min(100, k.stamina + STAMINA_REGEN * DT);
  // walking
  const scale = now < k.staggerUntil ? SPEED_WHILE.stagger : k.cut ? SPEED_WHILE.cut : k.guard.up ? SPEED_WHILE.guard : 1;
  const f = forwardOf(k.yaw), r = rightOf(k.yaw);
  const mx = inp.move.x, mz = inp.move.z;
  const len = Math.hypot(mx, mz);
  const vx = len > 0 ? (r.x * mx + f.x * mz) / Math.max(1, len) : 0, vz = len > 0 ? (r.z * mx + f.z * mz) / Math.max(1, len) : 0;
  k.speed = Math.hypot(vx, vz) * MOVE_SPEED * scale;
  k.moveDir = { x: mx, z: mz };
  if (k.speed > 0) move(duel, k, { x: vx * MOVE_SPEED * scale * DT, z: vz * MOVE_SPEED * scale * DT }, other);
  stepCut(duel, k, other);
}

function respawn(duel) {
  for (const k of [duel.player, duel.foe]) {
    Object.assign(k, knight(k.id, k.spawn.x, k.spawn.z, k.spawn.yaw), { stats: k.stats, input: { ...k.input, yaw: k.spawn.yaw, attackPressedAt: null } });
  }
  duel.bot = { nextAttackAt: duel.now + 1.2, guardPlan: null, chainWant: 1, pressAt: null };
  duel.events.push({ type: 'respawn', at: duel.now });
}

// --- the sparring knight. Drill: one cut at a time, plainly told, never guarding (parry practice). Spar: chains of
// one to three at a fair cadence, and a guard raised against the player's cuts, sometimes in time, sometimes not.
// Dummy: stands and takes it (cadence practice). He keeps a real rhythm: no reading the player's buttons.
function stepBot(duel) {
  const k = duel.foe, p = duel.player, b = duel.bot, now = duel.now, rnd = duel.random;
  const inp = k.input;
  inp.attackPressedAt = null;
  if (!k.alive) return;
  const dx = p.pos.x - k.pos.x, dz = p.pos.z - k.pos.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(-dx, -dz);
  const turn = wrap(want - inp.yaw);
  inp.yaw = wrap(inp.yaw + Math.max(-TURN_RATE * DT, Math.min(TURN_RATE * DT, turn)));
  if (duel.opponent === 'dummy') { inp.move = { x: 0, z: 0 }; inp.guard = false; inp.attack = false; return; }
  // keep a fighting distance
  const ideal = 2.1;
  inp.move = { x: 0, z: !p.alive ? 0 : dist > ideal + 0.35 ? 1 : dist < ideal - 0.6 ? -0.6 : 0 };
  // defence (spar): against a cut the player has begun, a guard at some lead before its contact, held a moment
  if (duel.opponent === 'spar' && p.cut && !p.cut.resolved && !b.guardPlan && !k.cut && rnd() < 0.6) {
    const lead = 0.02 + rnd() * 0.33;
    b.guardPlan = { at: p.cut.contactAt - lead, until: p.cut.contactAt + 0.25, against: p.cut.startedAt };
  }
  if (b.guardPlan) {
    // a feinted cut leaves the guard tapped and dropped (the opening a feint makes)
    if (!p.cut || p.cut.startedAt !== b.guardPlan.against) b.guardPlan.until = Math.min(b.guardPlan.until, now + 0.12);
    inp.guard = now >= b.guardPlan.at && now < b.guardPlan.until;
    if (now >= b.guardPlan.until) { b.guardPlan = null; inp.guard = false; }
  } else inp.guard = false;
  // attack
  if (k.cut) {
    const c = k.cut;
    if (c.resolved && !c.press && c.chainStep < b.chainWant && c.index < 2) {
      if (b.pressAt == null) b.pressAt = c.contactAt + CADENCE.beat + (rnd() - 0.5) * 0.16;
      if (now >= b.pressAt) { inp.attackPressedAt = now; b.pressAt = null; }
    }
    inp.attack = false;
    return;
  }
  b.pressAt = null;
  if (now >= b.nextAttackAt && dist < GAME.swordRange + 0.3 && p.alive && now >= k.staggerUntil && !inp.guard) {
    if (duel.opponent === 'drill') {
      // one cut, any of the three, plainly told
      const name = CUT_ORDER[Math.floor(rnd() * 3)];
      startCut(duel, k, name);
      b.chainWant = 1;
      b.nextAttackAt = now + 1.7 + rnd() * 0.9;
    } else {
      inp.attackPressedAt = now;
      b.chainWant = 1 + Math.floor(rnd() * 3);
      b.nextAttackAt = now + 1.4 + b.chainWant * 0.55 + rnd() * 1.0;
    }
  }
}

/** One fixed step. Returns the events it raised. */
export function stepDuel(duel) {
  duel.events = [];
  duel.now = +(duel.tick * DT).toFixed(6);
  duel.tick += 1;
  stepBot(duel);
  stepKnight(duel, duel.player, duel.foe);
  stepKnight(duel, duel.foe, duel.player);
  return duel.events;
}

/** The player's controls for the next step. pressed: a fresh attack press this step. */
export function setPlayerInput(duel, { move = { x: 0, z: 0 }, yaw, attack = false, pressed = false, guard = false, pressedAt = null }) {
  const inp = duel.player.input;
  inp.move = move;
  if (Number.isFinite(yaw)) inp.yaw = yaw;
  inp.attack = attack;
  inp.guard = guard;
  if (pressed) inp.attackPressedAt = Number.isFinite(pressedAt) ? Math.min(duel.now, pressedAt) : duel.now;
}

/**
 * What a knight's body shows (presentation, from the simulation's state): the clip, where in it, and a key that
 * changes whenever the clip or its segment changes (the moment the body inertializes into it).
 */
export function presentKnight(duel, k, now = duel.now) {
  if (!k.alive) return { clip: 'Death', time: Math.min(1.2, now - k.diedAt), key: `death:${k.diedAt}`, loop: false };
  if (now < k.staggerUntil) {
    if (k.staggerKind === 'flinch') return { clip: 'Stagger', time: Math.min(0.6, (now - k.staggerAt) * 1.6), key: `flinch:${k.staggerAt}` };
    return { clip: 'Stagger', time: Math.min(0.6, (now - k.staggerAt) * (0.6 / Math.max(0.3, k.staggerUntil - k.staggerAt))), key: `stagger:${k.staggerAt}` };
  }
  if (k.cut) {
    const clip = clipOf(duel, k.cut.name);
    const t = cutClipTime(clip, now - k.cut.startedAt, { linked: k.cut.linked, startup: k.cut.startup });
    return { clip: clip.clip, time: t, key: `cut:${k.cut.startedAt}:${k.cut.name}`, cut: k.cut.name };
  }
  if (k.guard.up) {
    if ((k.reaction?.kind === 'block' || k.reaction?.kind === 'parry') && now - k.reaction.at < 0.32) return { clip: 'Block_Impact', time: now - k.reaction.at, key: `block:${k.reaction.at}` };
    return { clip: 'Guard', time: Math.min(0.35, now - k.guard.raisedAt), key: `guard:${k.guard.raisedAt}` };
  }
  if (k.speed > 0.3) return { clip: 'Walk', time: (now * (k.speed / 2.4)) % 0.9, key: 'walk', loop: true };
  return { clip: 'Idle', time: now % 2, key: 'idle', loop: true };
}
