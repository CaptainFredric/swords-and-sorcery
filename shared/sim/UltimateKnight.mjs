import { PROWESS } from '../src/prowess.mjs';
import { postureOf } from '../src/body.mjs';
import { activeUltimate } from '../src/ultimates.mjs';
import { beginAttack, endAttack, setGuard, castPreparedSpell, tryDash } from './combat.mjs';
import { stepBotControllers } from './BotController.mjs';
import { wayToward } from './botNav.mjs';

const CYCLE = Object.freeze(['sunder', 'vortex', 'chivalry']);
const PREPARED = Object.freeze(['fireball', 'frostfire', 'gale']);
const REFILL_SEC = 3;

/** Only the Practice opponent owns this demonstration clock. Combat owns every ability clock. */
export function setupUltimateKnight(actor, nowSec) {
  actor.name = 'The Ultimate Knight';
  actor.botProfile = 'rival';
  actor.ultimate = actor.startingUltimate = CYCLE[0];
  actor.spell = actor.startingSpell = PREPARED[0];
  actor.preparedSpells = [...PREPARED];
  actor.startingPreparedSpells = [...PREPARED];
  actor.prowess = PROWESS.full;
  actor.ultimateKnight = { cycle: 0, tracked: null, committed: null, refillAt: nowSec,
    demonstration: null, castSlot: -1, dashSlot: -1, spellIndex: 0, navigation: {} };
}

function reconcile(actor, nowSec) {
  const demo = actor.ultimateKnight;
  // Retain the real state object: combat may commit and kill the actor before our next step.
  const tracked = demo.tracked;
  if (tracked?.phase === 'active' && demo.committed !== tracked) {
    demo.committed = tracked;
    demo.cycle = (demo.cycle + 1) % CYCLE.length;
  }
  if (tracked && actor.ultimateState !== tracked) {
    if (demo.committed === tracked) demo.refillAt = Math.max(nowSec, actor.recoverUntil ?? nowSec) + REFILL_SEC;
    demo.tracked = null;
  }
  if (actor.ultimateState) demo.tracked = actor.ultimateState;
}

function targetFor(room, actor) {
  let target = null; let nearest = Infinity;
  for (const player of room.players.values()) {
    if (player.actorKind !== 'human' || !player.alive || !player.connected) continue;
    const distance = Math.hypot(player.position.x - actor.position.x, player.position.z - actor.position.z);
    if (distance < nearest) { target = player; nearest = distance; }
  }
  return target;
}

function demonstrateChivalry(room, actor, nowSec, world) {
  const demo = actor.ultimateKnight; const state = actor.ultimateState;
  if (demo.demonstration !== state) {
    demo.demonstration = state; demo.castSlot = -1; demo.dashSlot = -1; demo.spellIndex = 0;
  }
  const target = targetFor(room, actor);
  if (!target) {
    if (actor.attackHeld) endAttack(room, actor.id, nowSec);
    if (actor.guardHeld) setGuard(room, actor.id, false, nowSec);
    actor.input = { forward: 0, right: 0, jump: false, attack: false, guard: false, yaw: actor.yaw, pitch: actor.pitch };
    return;
  }
  const dx = target.position.x - actor.position.x; const dz = target.position.z - actor.position.z;
  const dy = target.position.y + postureOf(target).center - actor.position.y - postureOf(actor).eye + 0.1;
  const distance = Math.hypot(dx, dz); const length = Math.hypot(dx, dy, dz) || 1;
  const direction = { x: dx / length, y: dy / length, z: dz / length };
  actor.yaw = Math.atan2(-dx, -dz); actor.pitch = Math.asin(direction.y);
  const age = Math.max(0, nowSec - state.commitAt); const loop = Math.floor(age / 3); const phase = age % 3;
  const guard = phase < 0.8 || (phase >= 1.7 && phase < 2.3);
  const sword = distance < 3.3 && phase < 2.5;
  const way = wayToward(world, actor, target, demo.navigation, nowSec);
  const movementYaw = way ? Math.atan2(-(way.x - actor.position.x), -(way.z - actor.position.z)) : actor.yaw;
  const relative = movementYaw - actor.yaw;
  const forward = distance > 2.6 ? 0.55 : distance < 1.3 ? -0.3 : 0;
  actor.input = { forward: forward * Math.cos(relative), right: -forward * Math.sin(relative), jump: false,
    attack: sword, guard, yaw: actor.yaw, pitch: actor.pitch };
  if (guard !== actor.guardHeld || (guard && !actor.guarding)) setGuard(room, actor.id, guard, nowSec);
  if (sword && !actor.attackHeld) beginAttack(room, actor.id, nowSec);
  else if (!sword && actor.attackHeld) endAttack(room, actor.id, nowSec);
  const slot = phase >= 1.8 ? loop * 2 + 1 : phase >= 0.9 ? loop * 2 : -1;
  if (slot >= 0 && slot !== demo.castSlot) {
    demo.castSlot = slot;
    castPreparedSpell(room, actor.id, PREPARED[demo.spellIndex++ % PREPARED.length], direction, nowSec);
  }
  if (phase >= 1.8 && demo.dashSlot !== loop) {
    demo.dashSlot = loop;
    tryDash(room, actor.id, { x: direction.x, z: direction.z }, nowSec);
  }
}

export function stepUltimateKnight(room, actor, nowSec, world = room.world, { random = Math.random } = {}) {
  if (room.mode !== 'PRACTICE' || room.state !== 'PLAYING' || actor.practiceMode !== 'ULTIMATE_KNIGHT') return;
  if (!actor.ultimateKnight) setupUltimateKnight(actor, nowSec);
  reconcile(actor, nowSec);
  if (!actor.alive) return;
  const demo = actor.ultimateKnight;
  if (!actor.ultimateState) {
    actor.ultimate = CYCLE[demo.cycle];
    if (nowSec >= demo.refillAt) actor.prowess = PROWESS.full;
  }
  if (activeUltimate(actor, nowSec)?.id === 'chivalry') {
    demonstrateChivalry(room, actor, nowSec, world);
  } else {
    if (demo.demonstration) { demo.demonstration = null; actor.ai = null; }
    // There is one Practice actor; this route runs its ordinary controller exactly once.
    stepBotControllers(room, nowSec, world, { random, actorKinds: ['dummy'], aggression: 0.55 });
  }
  reconcile(actor, nowSec);
}
