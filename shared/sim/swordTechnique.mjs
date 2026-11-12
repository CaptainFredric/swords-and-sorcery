// The Sword Techniques in the room (shared/src/swordTechniques.mjs has their rules): Rigid Riposte and Whirl Like the
// Wind as one authoritative action each, on the knight's own clock. One state (player.techniqueState), one button
// (player.techniqueHeld), one cooldown (player.techniqueReadyAt); damage, Guard, Steel, Stagger, prowess and the
// world go through the room's ordinary rules (handed in by combat.mjs as `rules`, so nothing is done twice).
//
// The blade is the authored one: the guard and point sampled from the clip being played, stood where the knight was
// at each moment (their recorded transforms), swept in steps of a few centimetres. A knight is met where the sword
// really passes; a blade or a spell is turned only where the sword really is.

import { BLADE, occluded, segmentDistance, sweepBlade } from '../src/blade.mjs';
import { MOVEMENT } from '../src/movement.mjs';
import { postureOf } from '../src/body.mjs';
import { STAGGER } from '../src/stagger.mjs';
import { GAME, guardProfile, resolveSwordVsGuard } from '../src/combat.mjs';
import { PROWESS, gainProwess } from '../src/prowess.mjs';
import { areAllies } from '../src/teams.mjs';
import { steelBlunt, steelTakes } from '../src/steel.mjs';
import { recastReady, recordUse } from '../src/practiceRecast.mjs';
import { sampleTransform } from './history.mjs';
import {
  WHIRL_LIFT_SPELL, placeTechniqueBlade, swordTechniqueFor, techniqueBlade, techniqueMoment, techniqueOverAt,
} from '../src/swordTechniques.mjs';

// the sweep: no step of it carries the guard or the point further than this (metres), and never fewer than this many
// a second
const MAX_SAMPLE_TRAVEL = 0.035;
const MIN_SAMPLES_PER_SEC = 120;
// what a spell in flight is, to a blade that meets it (its half-thickness, metres)
const SPELL_RADIUS = 0.22;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const length = (v) => Math.hypot(v.x, v.y, v.z);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/** The technique blade of `player` at `atSec` in the world ({ base, tip, moment }), or null when there is none. */
export function techniqueBladeAt(player, atSec) {
  const state = player?.techniqueState;
  const moment = techniqueMoment(state, atSec);
  if (!moment) return null;
  const local = techniqueBlade(moment.clip, moment.time);
  if (!local) return null;
  const placed = sampleTransform(player, atSec);
  // (a thrust is carried along its committed facing, whatever the knight has turned to look at since)
  const yaw = moment.phase === 'thrust' && Number.isFinite(state.yaw) ? state.yaw : placed.yaw;
  return { ...placeTechniqueBlade(local, placed.position, yaw), moment, position: placed.position, yaw };
}

function eyeOf(player, atSec) {
  const placed = sampleTransform(player, atSec);
  return { x: placed.position.x, y: placed.position.y + postureOf(placed).eye, z: placed.position.z };
}

// what a blade lying from `base` to `tip` meets first, of these bodies and this world
function contactAt(blade, bodies, world, { stops = true } = {}) {
  const delta = sub(blade.tip, blade.base), reach = length(delta);
  if (reach < 1e-6) return null;
  const direction = { x: delta.x / reach, y: delta.y / reach, z: delta.z / reach };
  return sweepBlade(blade.base, direction, direction, bodies, stops ? world.solids ?? [] : [], {
    blade: { ...BLADE, from: 0, to: reach }, ground: stops ? world.floors : null, world: stops,
  });
}

/**
 * Whether `defender`'s technique blade turns something coming at them between `fromSec` and `toSec`: `incoming`
 * { base, tip, radius? } (an enemy's blade as it lies, a spell's path over the tick). Only where the sword really is:
 * a Riposte's while it is held up across the front, a Whirl's as it goes round. Returns where they met, or null.
 */
export function techniqueTurns(defender, incoming, fromSec, toSec, world = {}) {
  const state = defender?.techniqueState;
  if (!state || !defender.alive || Number.isFinite(state.endAt)) return null;
  const technique = swordTechniqueFor(state.id);
  if (!technique) return null;
  const reach = BLADE.radius + (incoming.radius ?? BLADE.radius);
  const span = Math.max(0, toSec - fromSec);
  const steps = Math.max(1, Math.ceil(span * MIN_SAMPLES_PER_SEC));
  for (let i = 0; i <= steps; i += 1) {
    const at = fromSec + span * (i / steps);
    const blade = techniqueBladeAt(defender, at);
    if (!blade?.moment.intercepts) continue;
    const near = segmentDistance(incoming.base, incoming.tip, blade.base, blade.tip);
    if (near.distance > reach) continue;
    const point = lerp(blade.base, blade.tip, near.t);
    // (not through a wall: something solid between the knight and where the blades would meet)
    if (occluded(eyeOf(defender, at), point, world.solids ?? [])) continue;
    return { point, at, technique };
  }
  return null;
}

/** Whether a technique may begin now, and if not, why (for tests and the HUD's reasons). */
export function techniqueBlocked(room, player, nowSec, rules) {
  const technique = swordTechniqueFor(player?.technique);
  if (!technique) return 'none';
  if (room.state !== 'PLAYING' || !player.alive) return 'dead';
  if (player.techniqueState) return 'busy';
  if (nowSec < (player.staggerUntil ?? -Infinity)) return 'staggered';
  if (player.ultimateState || nowSec < (player.recoverUntil ?? -Infinity)) return 'ultimate';
  if (player.pendingSpell || player.gauntlet || nowSec < (player.castEndsAt ?? -Infinity)) return 'hands';
  if (player.operatingBallistaId || player.operatingRamId || player.operatingFightFlightId) return 'mounted';
  if (player.restlessCarrying || nowSec < (player.oneHitFrozenUntil ?? -Infinity)) return 'held';
  const practice = rules.practising(room, player);
  if (!recastReady(player, 'technique', nowSec, practice)) return 'cooldown';
  if (!player.grounded) {
    // in the air a Riposte is the Dash (it needs one ready, and takes it); a Whirl needs Gale Garner carried
    if (technique.kind === 'riposte' && !recastReady(player, 'dash', nowSec, practice)) return 'dash';
    if (technique.kind === 'whirl' && player.spell !== WHIRL_LIFT_SPELL) return 'airborne';
  }
  return null;
}

/** The technique's button goes down: it begins if it can. Returns the state begun, or null. */
export function beginSwordTechnique(room, player, nowSec, rules) {
  if (techniqueBlocked(room, player, nowSec, rules)) return null;
  const technique = swordTechniqueFor(player.technique);
  const practice = rules.practising(room, player);
  const airborne = !player.grounded;
  // the sword is the technique's: a chain under way ends, a raised guard comes down
  rules.stopSwordChain(room, player, nowSec);
  player.attackHeld = false;
  player.attackQueued = false;
  player.guarding = false;
  player.guardAuto = false;
  player.sprinting = false;
  if (technique.kind === 'riposte' && airborne) {
    // (the ordinary Dash's clock, by the yard's rule or the match's; no second movement is begun)
    recordUse(player, 'dash', nowSec, MOVEMENT.dashCooldown, practice);
  }
  const state = player.techniqueState = {
    id: technique.id, startedAt: nowSec, airborne,
    sampledTo: nowSec, hitIds: new Set(), revolutions: technique.kind === 'whirl' ? 1 : 0,
    // (a Whirl may climb on a held Jump only with Gale Garner carried; the spell itself is not cast or spent)
    ...(technique.kind === 'whirl' ? { spinAt: nowSec + technique.enterSec, lift: player.spell === WHIRL_LIFT_SPELL, lifting: false } : {}),
  };
  room.events.push({ type: 'techniqueStart', playerId: player.id, technique: technique.id, airborne, at: nowSec });
  return state;
}

/** End a technique now (`end`: 'done', 'released', 'spent', 'world', 'parried', 'interrupted'): its cooldown starts. */
export function endSwordTechnique(room, player, nowSec, end, rules, { at = nowSec } = {}) {
  const state = player.techniqueState;
  if (!state || Number.isFinite(state.endAt)) return;
  const technique = swordTechniqueFor(state.id);
  state.endAt = at;
  state.end = end;
  state.airborne = !player.grounded;
  recordUse(player, 'technique', at, technique.cooldownSec, rules.practising(room, player), { readyAt: techniqueOverAt(state) });
  room.events.push({ type: 'techniqueEnd', playerId: player.id, technique: technique.id, end, revolutions: state.revolutions, at: nowSec });
}

/** Whatever breaks a knight off (a broken balance, a death, a mount): the technique stops where it is. */
export function cancelSwordTechnique(room, player, nowSec, rules, { clear = false } = {}) {
  const state = player.techniqueState;
  if (!state) return;
  if (!Number.isFinite(state.endAt)) endSwordTechnique(room, player, nowSec, 'interrupted', rules);
  if (clear) player.techniqueState = null;
}

// --- the blows

// a technique's blade on a knight's guard: turned by a perfect one, paid for by any other (and it may break)
function meetGuard(room, attacker, target, technique, point, nowSec, rules) {
  const automatic = rules.chivalryParries(target, attacker, nowSec);
  if (!automatic && !(target.guarding && rules.isInGuardCone(target, attacker, nowSec))) return null;
  const result = resolveSwordVsGuard({
    guarding: true, guardAgeMs: automatic ? 0 : (nowSec - target.guardStartedAt) * 1000, stamina: target.guardStamina,
    profile: guardProfile(target.knightClass), pressure: technique.guardPressure,
  });
  target.guardStamina = result.staminaAfter;
  const at = { x: point.x, y: point.y, z: point.z };
  if (result.kind === 'parry') {
    target.parries += 1;
    // (whoever turns a technique earns for it as for any parry)
    gainProwess(room, target, PROWESS.parry);
    room.events.push({ type: 'parry', attackerId: attacker.id, defenderId: target.id, technique: technique.id, ...(automatic ? { automatic: true } : {}), point: at, at: nowSec });
    return 'parry';
  }
  target.lastGuardDrainAt = nowSec;
  if (result.kind === 'guardBreak') {
    rules.breakGuard(target, GAME.guardBreakStaggerMs / 1000, nowSec);
    room.events.push({ type: 'guardBreak', attackerId: attacker.id, defenderId: target.id, technique: technique.id, impact: 0, impacts: 1, point: at, at: nowSec });
    rules.staggerBy(room, target, STAGGER.gain.guardBreak, nowSec, attacker.id);
    return 'guardBreak';
  }
  room.events.push({ type: 'block', attackerId: attacker.id, defenderId: target.id, technique: technique.id, quality: 1, impact: 0, impacts: 1, point: at, at: nowSec });
  rules.staggerBy(room, target, technique.stagger * STAGGER.gain.blocked, nowSec, attacker.id);
  return 'block';
}

// the technique's own blade turned (a perfect guard, an enemy's technique): its user is staggered as by any parry
function turned(room, attacker, by, nowSec, rules) {
  const technique = swordTechniqueFor(attacker.techniqueState.id);
  endSwordTechnique(room, attacker, nowSec, technique.kind === 'riposte' ? 'parried' : 'interrupted', rules);
  attacker.staggerUntil = Math.max(attacker.staggerUntil ?? -Infinity, nowSec + (technique.parriedSec ?? GAME.parryStaggerMs / 1000));
  rules.staggerBy(room, attacker, STAGGER.gain.parried, nowSec, by.id);
}

/**
 * The technique's blade has met a knight (`met`: sweepBlade's contact, `blade` the sword as it lay). Returns 'hit',
 * 'block', 'guardBreak', 'parry', 'turned' (their own technique blade met it) or 'protected'.
 */
function landTechnique(room, attacker, target, met, blade, nowSec, world, rules) {
  const state = attacker.techniqueState;
  const technique = swordTechniqueFor(state.id);
  if (target.spawnProtectionUntil > nowSec) return 'protected';
  // their own technique's sword, if it lies across this one
  const theirs = techniqueTurns(target, { base: blade.base, tip: blade.tip }, nowSec, nowSec, world);
  if (theirs) {
    room.events.push({ type: 'parry', attackerId: attacker.id, defenderId: target.id, technique: technique.id, by: theirs.technique.id, point: theirs.point, at: nowSec });
    turned(room, attacker, target, nowSec, rules);
    return 'turned';
  }
  const guarded = meetGuard(room, attacker, target, technique, met.point, nowSec, rules);
  if (guarded === 'parry') { turned(room, attacker, target, nowSec, rules); return 'parry'; }
  if (guarded) return guarded;
  let raw, clean;
  if (technique.kind === 'riposte') {
    // run through the middle, or caught off to one side: how far the lunge's own line (where the knight committed
    // it, from where they stand) passes from the body's
    const from = sampleTransform(attacker, nowSec).position;
    const yaw = Number.isFinite(state.yaw) ? state.yaw : attacker.yaw;
    const along = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const off = Math.abs((target.position.x - from.x) * along.z - (target.position.z - from.z) * along.x);
    clean = off <= technique.cleanWithin;
    raw = clean ? technique.damage : technique.grazeDamage;
  } else {
    // met on the blade's body, or only by its point
    const reach = length(sub(blade.tip, blade.base)) || 1;
    clean = met.along <= reach * (1 - technique.pointShare);
    raw = clean ? technique.damage : technique.glanceDamage;
  }
  const armour = steelBlunt(target.steel, raw, nowSec);
  target.steel = steelTakes(target.steel, nowSec);
  const dx = target.position.x - attacker.position.x, dz = target.position.z - attacker.position.z;
  const apart = Math.hypot(dx, dz);
  const away = apart > 1e-6 ? { x: dx / apart, z: dz / apart } : { x: -Math.sin(attacker.yaw), z: -Math.cos(attacker.yaw) };
  rules.applyDamage(room, attacker.id, target.id, armour.amount, technique.id, nowSec, { x: away.x * technique.shove, y: technique.lift, z: away.z * technique.shove }, {
    steel: armour.strength, turned: Math.round(raw) - armour.amount, clean, rawDamage: raw, skipSteel: true,
    // (a technique earns its user no prowess: the one it hurts still earns from it)
    noProwess: true,
  });
  rules.staggerBy(room, target, technique.stagger, nowSec, attacker.id);
  room.events.push({ type: 'techniqueHit', playerId: attacker.id, targetId: target.id, technique: technique.id, clean, steel: armour.strength,
    ...(technique.kind === 'whirl' ? { revolution: state.revolutions } : {}), point: { x: met.point.x, y: met.point.y, z: met.point.z }, at: nowSec });
  return 'hit';
}

// the knights this blade could meet at a moment (not its user, not allies, not ones it has already met this time round)
function bodiesAt(room, attacker, atSec, hitIds) {
  const bodies = [];
  for (const target of room.players.values()) {
    if (target.id === attacker.id || !target.alive || hitIds.has(target.id) || areAllies(room, attacker.id, target.id)) continue;
    const placed = sampleTransform(target, atSec);
    bodies.push({ id: target.id, base: placed.position, top: postureOf(placed).crown });
  }
  return bodies;
}

/**
 * Sweep the technique's sword from `state.sampledTo` to `untilSec`: every moment between, in steps of a few
 * centimetres. `stops`: the world stops this blade (a thrust is driven into what it meets; a Whirl rings off it and
 * goes on). Returns what ended the sweep ('parry' / 'turned' / 'world'), or null.
 */
function sweep(room, player, untilSec, world, rules, { stops, single }) {
  const state = player.techniqueState;
  let from = state.sampledTo;
  if (!(untilSec > from + 1e-9)) return null;
  let before = techniqueBladeAt(player, from);
  // (the stretch is cut wherever a row of the track falls, so no authored frame is skipped)
  const cuts = [];
  for (let t = Math.ceil(from * 60 - 1e-9) / 60; t < untilSec - 1e-9; t += 1 / 60) if (t > from + 1e-9) cuts.push(t);
  cuts.push(untilSec);
  for (const end of cuts) {
    const after = techniqueBladeAt(player, end);
    if (!before || !after) { before = after; from = end; continue; }
    const travel = Math.max(length(sub(after.base, before.base)), length(sub(after.tip, before.tip)));
    const steps = Math.max(1, Math.ceil((end - from) * MIN_SAMPLES_PER_SEC), Math.ceil(travel / MAX_SAMPLE_TRAVEL));
    for (let j = 1; j <= steps; j += 1) {
      const at = from + (end - from) * (j / steps);
      const blade = techniqueBladeAt(player, at);
      state.sampledTo = at;
      if (!blade) continue;
      const eye = eyeOf(player, at);
      // (knights hidden behind something solid at this moment: passed over now, not for the rest of the sweep)
      const hidden = new Set();
      for (;;) {
        const met = contactAt(blade, bodiesAt(room, player, at, state.hitIds).filter((body) => !hidden.has(body.id)), world, { stops });
        if (!met) break;
        if (met.kind !== 'body') {
          // (driven into the world: the thrust stops there)
          room.events.push({ type: 'techniqueWorldContact', playerId: player.id, technique: state.id, point: met.point,
            ...(met.normal ? { normal: { x: met.normal[0], y: met.normal[1], z: met.normal[2] } } : {}), material: met.solid?.material ?? 'stone', at: at });
          return 'world';
        }
        // (a knight behind something solid is not met)
        if (occluded(eye, met.point, world.solids ?? [])) { hidden.add(met.id); continue; }
        state.hitIds.add(met.id);
        const outcome = landTechnique(room, player, room.players.get(met.id), met, blade, at, world, rules);
        if (outcome === 'parry' || outcome === 'turned') return outcome;
        if (single && outcome !== 'protected') return 'struck';
      }
    }
    before = after;
    from = end;
  }
  state.sampledTo = untilSec;
  return null;
}

// what a Whirl's blade clips of the world as it comes round: a ring where it first touches a thing, never stopped
function whirlWorld(room, player, blade, world, nowSec) {
  const state = player.techniqueState;
  const seen = (state.world ??= { touching: new Set(), rang: new Map() });
  const now = new Set();
  const line = sub(blade.tip, blade.base), reach = length(line);
  if (reach < 1e-6) return;
  const direction = { x: line.x / reach, y: line.y / reach, z: line.z / reach };
  for (const solid of world.solids ?? []) {
    if (solid.blade === false) continue;
    const met = sweepBlade(blade.base, direction, direction, [], [solid], { blade: { ...BLADE, from: 0, to: reach } });
    if (met?.kind !== 'solid') continue;
    const key = solid.id ?? solid;
    now.add(key);
    if (seen.touching.has(key) || nowSec < (seen.rang.get(key) ?? -Infinity) + 0.5) continue;
    seen.rang.set(key, nowSec);
    room.events.push({ type: 'techniqueWorldContact', playerId: player.id, technique: state.id, point: met.point,
      normal: { x: met.normal[0], y: met.normal[1], z: met.normal[2] }, material: solid.material ?? 'stone', passing: true, at: nowSec });
  }
  seen.touching = now;
}

/**
 * A knight's technique, a tick on. Called once the knight has been moved and their transform recorded. `rules`: the
 * room's ordinary outcome rules (combat.mjs).
 */
export function stepSwordTechnique(room, player, nowSec, world, rules) {
  const state = player.techniqueState;
  if (!state) return;
  const technique = swordTechniqueFor(state.id);
  if (!technique || !player.alive) { player.techniqueState = null; return; }
  if (Number.isFinite(state.endAt)) {
    if (nowSec >= techniqueOverAt(state)) player.techniqueState = null;
    return;
  }
  // what breaks it off: a broken balance, a mount
  if (nowSec < (player.staggerUntil ?? -Infinity) || player.operatingBallistaId || player.operatingRamId || player.operatingFightFlightId) {
    endSwordTechnique(room, player, nowSec, 'interrupted', rules);
    return;
  }
  if (technique.kind === 'riposte') {
    const thrustAt = state.startedAt + technique.enterSec + technique.braceSec;
    if (nowSec < thrustAt) { state.sampledTo = Math.min(nowSec, thrustAt); return; }
    if (!Number.isFinite(state.yaw)) {
      // the thrust is committed: where the knight faced as the brace ended (their transform then)
      state.yaw = sampleTransform(player, thrustAt).yaw;
      state.sampledTo = thrustAt;
      room.events.push({ type: 'techniqueThrust', playerId: player.id, technique: technique.id, yaw: state.yaw, at: thrustAt });
    }
    const until = Math.min(nowSec, thrustAt + technique.thrustSec);
    if (!state.spent) {
      const outcome = sweep(room, player, until, world, rules, { stops: true, single: true });
      if (outcome) {
        state.spent = true;
        // (the body stops where the point met something; the arm's thrust plays out)
        state.lungeEndAt = state.sampledTo;
        player.velocity = { x: 0, y: player.velocity?.y ?? 0, z: 0 };
        if (outcome === 'parry' || outcome === 'turned') return;
      }
    }
    if (nowSec >= thrustAt + technique.thrustSec && !Number.isFinite(state.endAt)) endSwordTechnique(room, player, nowSec, 'done', rules, { at: thrustAt + technique.thrustSec });
    return;
  }
  // a Whirl
  if (nowSec < state.spinAt) { state.sampledTo = nowSec; return; }
  if (state.sampledTo < state.spinAt) state.sampledTo = state.spinAt;
  // (climbing on a held Jump, with Gale Garner carried: which clip the body shows)
  state.lifting = Boolean(state.lift && player.input?.jump && !player.grounded);
  for (;;) {
    const revolutionEnd = state.spinAt + state.revolutions * technique.revolutionSec;
    const until = Math.min(nowSec, revolutionEnd);
    const outcome = sweep(room, player, until, world, rules, { stops: false, single: false });
    if (outcome === 'parry' || outcome === 'turned') return;
    if (nowSec < revolutionEnd) break;
    // once round: again, if the button is still held and the prowess is there to pay for it
    const held = Boolean(player.techniqueHeld);
    if (held && (player.prowess ?? 0) >= technique.extraRevolutionCost - 1e-9) {
      player.prowess = Math.max(0, (player.prowess ?? 0) - technique.extraRevolutionCost);
      state.revolutions += 1;
      state.hitIds = new Set();
      room.events.push({ type: 'techniqueRevolution', playerId: player.id, technique: technique.id, revolution: state.revolutions, prowess: player.prowess, at: revolutionEnd });
      continue;
    }
    endSwordTechnique(room, player, nowSec, held ? 'spent' : 'released', rules, { at: revolutionEnd });
    return;
  }
  const blade = techniqueBladeAt(player, nowSec);
  if (blade) whirlWorld(room, player, blade, world, nowSec);
}

/**
 * A spell in flight, from `before` to `after` this tick: the first technique blade it meets (never its owner's, nor
 * an ally's), as { player, t (0..1 along its path), point }, or null.
 */
export function techniqueMeetsProjectile(room, projectile, before, after, fromSec, toSec, world) {
  let best = null;
  for (const player of room.players.values()) {
    if (!player.techniqueState || !player.alive || player.id === projectile.ownerId || areAllies(room, projectile.ownerId, player.id)) continue;
    const met = techniqueTurns(player, { base: before, tip: after, radius: SPELL_RADIUS }, fromSec, toSec, world);
    if (!met) continue;
    const path = sub(after, before), span = length(path) || 1;
    const along = sub(met.point, before);
    const t = Math.max(0, Math.min(1, (along.x * path.x + along.y * path.y + along.z * path.z) / (span * span)));
    if (!best || t < best.t) best = { player, t, point: met.point, technique: met.technique };
  }
  return best;
}
