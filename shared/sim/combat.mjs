import { GAME, SWORD_CHAIN, SWORD_STRIKE_TIMES, guardProfile, nextChainStep, resolveSwordVsGuard } from '../src/combat.mjs';
import { blastDamage, blastDistance, burnFrom, chillScale, spellFor, strongerChill } from '../src/spells.mjs';
import { findSwordWorldHit, segmentAabbHit, surfaceHeightAt } from '../src/collision.mjs';
import { SPRINT, movePlayer, resolveSprint, tryStartDash } from '../src/movement.mjs';
import { separatePlayers } from '../src/separation.mjs';
import { chooseSpawn } from './spawns.mjs';
import { recordTransform, sampleTransform } from './history.mjs';

const EYE_HEIGHT = 1.35;
const SWORD_ARC_COS = Math.cos((110 * Math.PI / 180) / 2);
const RESPAWN_SEC = 3;
const SPAWN_PROTECTION_SEC = 1;
const GUARD_REGEN_DELAY_SEC = 1;
const GUARD_REGEN_PER_SEC = 40;
const HEALTH_REGEN_DELAY_SEC = 5;
const HEALTH_REGEN_PER_SEC = 20;
const ABYSS_ATTRIBUTION_SEC = 5;
let projectileCounter = 0;

function forwardFromYaw(yaw) {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

function normalize3(v) {
  const m = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

function playerCenter(player) {
  return { x: player.position.x, y: player.position.y + 0.9, z: player.position.z };
}

function resetAtSpawn(player, spawn, nowSec) {
  player.position = { x: spawn.x, y: spawn.y, z: spawn.z };
  player.velocity = { x: 0, y: 0, z: 0 };
  player.grounded = true;
  player.jumpHeld = false;
  player.yaw = spawn.yaw ?? 0;
  player.pitch = 0;
  player.input = { forward: 0, right: 0, jump: false, yaw: player.yaw, pitch: 0 };
  player.health = 100;
  player.guardStamina = guardProfile(player.knightClass).capacity;
  player.guarding = false;
  player.sprinting = false;
  player.sprintBlend = 0;
  player.guardStartedAt = -Infinity;
  player.lastGuardDrainAt = -Infinity;
  stopSwordChain(player);
  player.attackStartedAt = -Infinity;
  player.attackRestartAt = -Infinity;
  player.staggerUntil = -Infinity;
  player.spellReadyAt = Math.max(player.spellReadyAt ?? 0, nowSec);
  player.castEndsAt = 0;
  player.pendingSpell = null;
  player.burn = null;
  player.chill = null;
  player.speedScale = 1;
  player.spawnProtectionUntil = nowSec + SPAWN_PROTECTION_SEC;
  player.alive = true;
  player.respawnAt = 0;
  player.lastDamageAt = -Infinity;
  player.lastAttackerId = null;
  player.lastKnockbackAt = -Infinity;
  player.history = [];
  recordTransform(player, nowSec);
}

// The sword chain (SWORD_CHAIN in shared/src/combat.mjs): a press starts one or asks for its next strike; a release
// only lets go, and the swing under way still lands. Stopping one outright is for a parry, a wall, a guard, a spell
// and a fall.
function startSwordChain(player, nowSec) {
  player.attackActive = true;
  player.attackStartedAt = nowSec;
  player.attackNextStrike = 0;
  player.attackCommitted = 1;
  player.attackCommitBy = null;
  player.attackQueued = false;
}

function stopSwordChain(player) {
  player.attackActive = false;
  player.attackHeld = false;
  player.attackQueued = false;
  player.attackNextStrike = 0;
  player.attackCommitted = 0;
  player.attackCommitBy = null;
}

export function beginAttack(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil) return false;
  player.attackHeld = true;
  // a fresh press: a chain begins, or (mid-chain, or still recovering from one) its next strike is asked for
  if (!player.attackActive && nowSec >= (player.attackRestartAt ?? -Infinity)) startSwordChain(player, nowSec);
  else player.attackQueued = true;
  player.guarding = false;
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'attackStarted', playerId, at: nowSec });
  return true;
}

/**
 * The attack button let go: the swing under way still lands, but no further strike begins (outside play: all stops).
 * releasedAt: when it was let go (the word takes a moment to arrive). A swing that began after that, only because the
 * button still seemed held, never really began: it is taken back (the player's own view ended the chain there).
 */
export function endAttack(room, playerId, nowSec, releasedAt = nowSec) {
  const player = room.players.get(playerId);
  if (!player) return;
  player.attackHeld = false;
  if (room.state !== 'PLAYING' || !player.alive) {
    const was = player.attackActive;
    stopSwordChain(player);
    if (was) room.events.push({ type: 'attackEnded', playerId, at: nowSec });
    return;
  }
  const committed = player.attackCommitted ?? 0;
  const began = player.attackStartedAt + (SWORD_CHAIN.starts[committed - 1] ?? Infinity);
  if (player.attackActive && committed > 1 && player.attackCommitBy === 'held' && player.attackNextStrike < committed && releasedAt < began - 1e-9) {
    player.attackCommitted = committed - 1;
    // the swing before it has landed, so the chain is over (where the next would have begun)
    if (player.attackNextStrike >= player.attackCommitted) {
      stopSwordChain(player);
      room.events.push({ type: 'attackEnded', playerId, at: nowSec });
    }
  }
}

/** Stop a sword chain outright: nothing further lands (a practice dummy told to stop, for one). */
export function cancelAttack(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (!player) return;
  const was = player.attackActive;
  stopSwordChain(player);
  if (was) room.events.push({ type: 'attackEnded', playerId, at: nowSec });
}

export function setGuard(room, playerId, guarding, nowSec) {
  const player = room.players.get(playerId);
  if (!player || !player.alive) return false;
  if (guarding && room.state !== 'PLAYING') return false;
  if (guarding && (player.guardStamina <= 0 || nowSec < player.staggerUntil)) return false;
  player.guarding = Boolean(guarding);
  if (guarding) {
    player.guardStartedAt = nowSec;
    stopSwordChain(player);
  }
  room.events.push({ type: guarding ? 'guardStarted' : 'guardEnded', playerId, at: nowSec });
  return true;
}

export function tryDash(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil) return false;
  const ok = tryStartDash(player, direction, nowSec);
  if (ok) room.events.push({ type: 'dash', playerId, direction, at: nowSec });
  return ok;
}

/** Gather the Spellblade's spell in the palm; it flies when the gather ends (see stepRoom). */
export function tryCastSpell(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil || nowSec < player.spellReadyAt) return false;
  const spell = spellFor(player.spell);
  player.spellReadyAt = nowSec + spell.cooldownSec;
  player.castEndsAt = nowSec + spell.gatherSec;
  player.pendingSpell = { spell: spell.id, direction: normalize3(direction) };
  player.guarding = false;
  stopSwordChain(player);
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'spellCast', playerId, spell: spell.id, at: nowSec, castEndsAt: player.castEndsAt });
  return true;
}

function transformFor(player, atSec) {
  return sampleTransform(player, atSec);
}

function isInGuardCone(defender, attacker, atSec) {
  const d = transformFor(defender, atSec);
  const a = transformFor(attacker, atSec);
  const toAttackerX = a.position.x - d.position.x;
  const toAttackerZ = a.position.z - d.position.z;
  const mag = Math.hypot(toAttackerX, toAttackerZ) || 1;
  const f = forwardFromYaw(d.yaw);
  const dot = f.x * (toAttackerX / mag) + f.z * (toAttackerZ / mag);
  return dot >= Math.cos((115 * Math.PI / 180) / 2);
}

function targetBlockedByWorld(attackerTransform, targetTransform, world) {
  const start = [attackerTransform.position.x, attackerTransform.position.y + EYE_HEIGHT, attackerTransform.position.z];
  const end = [targetTransform.position.x, targetTransform.position.y + 0.9, targetTransform.position.z];
  for (const box of world.solids ?? []) {
    if (segmentAabbHit(start, end, box)) return true;
  }
  return false;
}

function candidateSwordTarget(room, attacker, world, atSec) {
  const attackerTransform = transformFor(attacker, atSec);
  const forward = forwardFromYaw(attackerTransform.yaw);
  let best = null;
  for (const target of room.players.values()) {
    if (target.id === attacker.id || !target.alive) continue;
    const targetTransform = transformFor(target, atSec);
    const dx = targetTransform.position.x - attackerTransform.position.x;
    const dz = targetTransform.position.z - attackerTransform.position.z;
    const dy = (targetTransform.position.y + 0.9) - (attackerTransform.position.y + EYE_HEIGHT);
    const horizontal = Math.hypot(dx, dz);
    const distance = Math.hypot(horizontal, dy);
    if (distance > GAME.swordRange || horizontal < 1e-6) continue;
    const dot = forward.x * (dx / horizontal) + forward.z * (dz / horizontal);
    if (dot < SWORD_ARC_COS) continue;
    if (targetBlockedByWorld(attackerTransform, targetTransform, world)) continue;
    if (!best || distance < best.distance) best = { target, distance, attackerTransform, targetTransform };
  }
  return best;
}

function recoilFromWall(attacker, hit, nowSec, room) {
  const f = forwardFromYaw(attacker.yaw);
  attacker.velocity.x = -f.x * 3.1;
  attacker.velocity.z = -f.z * 3.1;
  stopSwordChain(attacker);
  attacker.attackRestartAt = nowSec + 0.22;
  room.events.push({
    type: 'swordWorldImpact',
    playerId: attacker.id,
    point: { x: hit.point[0], y: hit.point[1], z: hit.point[2] },
    normal: { x: hit.normal[0], y: hit.normal[1], z: hit.normal[2] },
    surfaceId: hit.box.id,
    at: nowSec,
  });
}

function resolveSwordStrike(room, attacker, strikeIndex, nowSec, world) {
  const strikeAt = attacker.attackStartedAt + SWORD_STRIKE_TIMES[strikeIndex];
  const attackerTransform = transformFor(attacker, strikeAt);
  const f = forwardFromYaw(attackerTransform.yaw);
  const origin = [attackerTransform.position.x, attackerTransform.position.y + EYE_HEIGHT, attackerTransform.position.z];
  const worldHit = findSwordWorldHit(origin, [f.x, 0, f.z], GAME.swordRange, world.solids ?? []);
  const candidate = candidateSwordTarget(room, attacker, world, strikeAt);

  if (worldHit && (!candidate || worldHit.distance <= candidate.distance)) {
    recoilFromWall(attacker, worldHit, nowSec, room);
    return;
  }

  if (!candidate) {
    room.events.push({ type: 'swordMiss', playerId: attacker.id, strikeIndex, at: nowSec });
    return;
  }

  const target = candidate.target;
  if (target.spawnProtectionUntil > nowSec) {
    room.events.push({ type: 'swordProtected', playerId: attacker.id, targetId: target.id, strikeIndex, at: nowSec });
    return;
  }

  if (target.guarding && isInGuardCone(target, attacker, strikeAt)) {
    const guardResult = resolveSwordVsGuard({
      guarding: true,
      guardAgeMs: (nowSec - target.guardStartedAt) * 1000,
      stamina: target.guardStamina,
      profile: guardProfile(target.knightClass),
    });
    target.guardStamina = guardResult.staminaAfter;
    if (guardResult.kind === 'parry') {
      target.parries += 1;
      attacker.staggerUntil = nowSec + GAME.parryStaggerMs / 1000;
      stopSwordChain(attacker);
      room.events.push({ type: 'parry', attackerId: attacker.id, defenderId: target.id, at: nowSec });
      return;
    }
    target.lastGuardDrainAt = nowSec;
    if (guardResult.kind === 'guardBreak') {
      target.guarding = false;
      target.staggerUntil = nowSec + GAME.guardBreakStaggerMs / 1000;
      room.events.push({ type: 'guardBreak', attackerId: attacker.id, defenderId: target.id, at: nowSec });
    } else {
      room.events.push({ type: 'block', attackerId: attacker.id, defenderId: target.id, at: nowSec });
    }
    return;
  }

  const push = { x: f.x * 1.7, y: strikeIndex === 2 ? 0.8 : 0.2, z: f.z * 1.7 };
  applyDamage(room, attacker.id, target.id, GAME.swordDamage, 'sword', nowSec, push);
  room.events.push({ type: 'swordHit', playerId: attacker.id, targetId: target.id, strikeIndex, at: nowSec });
}

export function applyDamage(room, attackerId, victimId, amount, source, nowSec, knockback = null) {
  const victim = room.players.get(victimId);
  if (!victim || !victim.alive || victim.spawnProtectionUntil > nowSec) return false;
  victim.health = Math.max(0, victim.health - amount);
  victim.lastDamageAt = nowSec;
  victim.lastAttackerId = attackerId;
  if (knockback) {
    victim.velocity.x += knockback.x ?? 0;
    victim.velocity.y += knockback.y ?? 0;
    victim.velocity.z += knockback.z ?? 0;
    victim.lastKnockbackAt = nowSec;
  }
  room.events.push({ type: 'damage', attackerId, victimId, source, amount, health: victim.health, at: nowSec });
  if (victim.health <= 0) killPlayer(room, victimId, attackerId, source, nowSec);
  return true;
}

export function killPlayer(room, victimId, attackerId, source, nowSec) {
  const victim = room.players.get(victimId);
  if (!victim || !victim.alive) return false;
  let credited = attackerId;
  if (!credited && victim.lastAttackerId && nowSec - victim.lastKnockbackAt <= ABYSS_ATTRIBUTION_SEC) credited = victim.lastAttackerId;
  victim.alive = false;
  victim.health = 0;
  victim.guarding = false;
  stopSwordChain(victim);
  victim.respawnAt = nowSec + RESPAWN_SEC;
  if (credited && credited !== victimId) {
    room.recordKill(credited, victimId, nowSec);
    if (source === 'abyss') {
      const killer = room.players.get(credited);
      if (killer) killer.abyssKills += 1;
    }
  } else {
    victim.deaths += 1;
  }
  room.events.push({ type: 'death', victimId, killerId: credited, source, respawnAt: victim.respawnAt, at: nowSec });
  return true;
}

function spawnSpell(room, player, nowSec) {
  const pending = player.pendingSpell;
  if (!pending) return;
  const spell = spellFor(pending.spell);
  const direction = pending.direction;
  const id = `f${++projectileCounter}`;
  const f = forwardFromYaw(player.yaw);
  const horizontalFallback = { x: f.x, y: 0, z: f.z };
  const dir = Math.hypot(direction.x, direction.y, direction.z) > 0.01 ? direction : horizontalFallback;
  const normalized = normalize3(dir);
  const projectile = {
    id,
    ownerId: player.id,
    spell: spell.id,
    position: { x: player.position.x + normalized.x * 0.7, y: player.position.y + 1.25, z: player.position.z + normalized.z * 0.7 },
    velocity: { x: normalized.x * spell.speed, y: normalized.y * spell.speed, z: normalized.z * spell.speed },
    bornAt: nowSec,
  };
  room.projectiles.set(id, projectile);
  player.pendingSpell = null;
  player.castEndsAt = 0;
  room.events.push({ type: 'projectileSpawned', projectile: structuredClone(projectile), at: nowSec });
}

// the blast: damage by distance, a shove away from its heart, then what the spell leaves behind (a burn, a chill)
function explodeSpell(room, projectile, point, nowSec, worldHit = false, directVictimId = null) {
  room.projectiles.delete(projectile.id);
  const spell = spellFor(projectile.spell);
  // fire throws a body back; cold only staggers it a little
  const shove = spell.chill ? 0.5 : 1;
  for (const player of room.players.values()) {
    if (!player.alive || player.id === projectile.ownerId) continue;
    const center = playerCenter(player);
    const direct = player.id === directVictimId;
    const distance = direct ? 0 : blastDistance(point, player.position);
    if (distance > spell.radius) continue;
    const amount = blastDamage(spell, distance);
    const away = normalize3({ x: center.x - point.x, y: Math.max(0.15, center.y - point.y), z: center.z - point.z });
    const hit = applyDamage(room, projectile.ownerId, player.id, amount, spell.id, nowSec, {
      x: away.x * 4.3 * shove, y: away.y * 2.3 * shove, z: away.z * 4.3 * shove,
    });
    if (!hit || !player.alive) continue;
    // a fresh burn replaces one already licking (it never stacks); a blast too far out to catch leaves any burn be
    const burn = burnFrom(spell, distance, projectile.ownerId, nowSec);
    if (burn) player.burn = burn;
    if (spell.chill) {
      player.chill = strongerChill(player.chill, { slow: spell.chill.slow, startedAt: nowSec, until: nowSec + spell.chill.seconds }, nowSec);
    }
  }
  room.events.push({
    type: 'projectileImpact', projectileId: projectile.id, ownerId: projectile.ownerId, spell: spell.id, radius: spell.radius, point, worldHit, at: nowSec,
  });
}

// burns lick at their victims (credited to whoever threw the fire); chills thaw on their own
function stepAfflictions(room, player, nowSec) {
  const burn = player.burn;
  if (burn && nowSec >= burn.nextAt) {
    burn.licksLeft -= 1;
    burn.nextAt += burn.interval;
    if (burn.licksLeft <= 0) player.burn = null;
    applyDamage(room, burn.attackerId, player.id, burn.perLick, 'burn', nowSec);
  }
  if (player.chill && nowSec >= player.chill.until) player.chill = null;
  player.speedScale = chillScale(player.chill, nowSec);
}

function stepProjectiles(room, dt, nowSec, world) {
  for (const projectile of [...room.projectiles.values()]) {
    const before = { ...projectile.position };
    const after = {
      x: before.x + projectile.velocity.x * dt,
      y: before.y + projectile.velocity.y * dt,
      z: before.z + projectile.velocity.z * dt,
    };
    let nearestWorld = null;
    for (const box of world.solids ?? []) {
      const hit = segmentAabbHit([before.x, before.y, before.z], [after.x, after.y, after.z], box);
      if (hit && (!nearestWorld || hit.t < nearestWorld.t)) nearestWorld = hit;
    }
    if (nearestWorld) {
      explodeSpell(room, projectile, { x: nearestWorld.point[0], y: nearestWorld.point[1], z: nearestWorld.point[2] }, nowSec, true);
      continue;
    }
    // a spell thrown at the ground (at someone's feet) bursts where it meets it, instead of sinking through
    const ground = surfaceHeightAt(after.x, after.z, before.y, world);
    if (ground !== null && after.y <= ground && before.y > ground) {
      const t = (before.y - ground) / (before.y - after.y);
      explodeSpell(room, projectile, {
        x: before.x + (after.x - before.x) * t,
        y: ground + 0.05,
        z: before.z + (after.z - before.z) * t,
      }, nowSec, true);
      continue;
    }

    let direct = null;
    for (const target of room.players.values()) {
      if (!target.alive || target.id === projectile.ownerId || target.spawnProtectionUntil > nowSec) continue;
      const c = playerCenter(target);
      const d = Math.hypot(c.x - after.x, c.y - after.y, c.z - after.z);
      if (d < 0.75) { direct = target; break; }
    }
    if (direct) {
      projectile.position = after;
      explodeSpell(room, projectile, after, nowSec, false, direct.id);
      continue;
    }

    projectile.position = after;
    if (nowSec - projectile.bornAt > 4) room.projectiles.delete(projectile.id);
  }
}

function respawnPlayer(room, player, nowSec, world) {
  const enemies = [...room.players.values()].filter((p) => p.id !== player.id && p.alive);
  const spawnPoints = world?.spawnPoints ?? room.world?.spawnPoints ?? [];
  if (spawnPoints.length === 0) throw new Error(`World ${room.worldId ?? 'unknown'} has no spawn points`);
  const choice = chooseSpawn(spawnPoints, enemies, room.recentSpawnUse, nowSec);
  const spawn = choice?.spawn ?? spawnPoints[0];
  if (choice) room.recentSpawnUse.set(choice.index, nowSec);
  resetAtSpawn(player, spawn, nowSec);
  room.events.push({ type: 'respawn', playerId: player.id, position: { ...player.position }, at: nowSec });
}

export function stepRoom(room, dt, nowSec, world = room.world) {
  if (!world) throw new Error(`Room ${room.code ?? 'unknown'} has no world`);
  room.tick(nowSec);
  if (room.state !== 'PLAYING') return room.events;

  for (const player of room.players.values()) {
    if (!player.alive) {
      if (nowSec >= player.respawnAt && room.state === 'PLAYING') respawnPlayer(room, player, nowSec, world);
      continue;
    }

    if (player.pendingSpell && nowSec >= player.castEndsAt) spawnSpell(room, player, nowSec);
    stepAfflictions(room, player, nowSec);
    if (!player.alive) continue;

    const guardCapacity = guardProfile(player.knightClass).capacity;
    if (!player.guarding && nowSec - player.lastGuardDrainAt >= GUARD_REGEN_DELAY_SEC && player.guardStamina < guardCapacity) {
      player.guardStamina = Math.min(guardCapacity, player.guardStamina + GUARD_REGEN_PER_SEC * dt);
    }
    if (nowSec - player.lastDamageAt >= HEALTH_REGEN_DELAY_SEC && player.health < GAME.maxHealth) {
      player.health = Math.min(GAME.maxHealth, player.health + HEALTH_REGEN_PER_SEC * dt);
    }

    const staggered = nowSec < player.staggerUntil;
    // sprint: its own state, decided from the real stamina; it spends the guard's bar slowly and holds off regen
    player.sprinting = resolveSprint({
      wantsSprint: Boolean(player.input?.sprint),
      forward: player.input?.forward,
      right: player.input?.right,
      grounded: player.grounded,
      stamina: player.guardStamina,
      sprinting: player.sprinting,
      blocked: staggered || player.guarding || player.attackActive || Boolean(player.pendingSpell),
    });
    if (player.sprinting) {
      player.guardStamina = Math.max(0, player.guardStamina - SPRINT.staminaPerSec * dt);
      player.lastGuardDrainAt = nowSec;
    }

    const input = staggered
      ? { forward: 0, right: 0, jump: false, yaw: player.yaw, pitch: player.pitch }
      : player.input;
    const moved = movePlayer(player, input, dt, nowSec, world);
    player.position = moved.position;
    player.velocity = moved.velocity;
    player.grounded = moved.grounded;
    player.jumpHeld = moved.jumpHeld;
    player.dashUntil = moved.dashUntil;
    player.dashReadyAt = moved.dashReadyAt;
    player.dashDir = moved.dashDir;
    player.sprintBlend = moved.sprintBlend;
    player.yaw = input.yaw ?? player.yaw;
    player.pitch = input.pitch ?? player.pitch;
    recordTransform(player, nowSec);

    if (player.position.y < (world.abyssY ?? -9)) {
      killPlayer(room, player.id, null, 'abyss', nowSec);
      continue;
    }

    if (player.attackActive && nowSec >= player.staggerUntil) {
      // the chain in time order: committed strikes land; as each next swing would begin, it is committed if the
      // button is still held (or was pressed again), or the chain ends there, the swing before it having landed
      const elapsed = nowSec - player.attackStartedAt;
      for (;;) {
        const step = player.attackActive ? nextChainStep({ committed: player.attackCommitted ?? 1, landed: player.attackNextStrike }, elapsed) : null;
        if (!step) break;
        if (step.kind === 'land') {
          player.attackNextStrike += 1;
          room.events.push({ type: 'swordSwing', playerId: player.id, strikeIndex: step.strike, at: nowSec });
          resolveSwordStrike(room, player, step.strike, nowSec, world);
        } else if (player.attackHeld || player.attackQueued) {
          player.attackCommitted = (player.attackCommitted ?? 1) + 1;
          // (a fresh press asked for it outright; a hold may yet turn out to have been let go just before)
          player.attackCommitBy = player.attackQueued ? 'queued' : 'held';
          player.attackQueued = false;
        } else {
          stopSwordChain(player);
          room.events.push({ type: 'attackEnded', playerId: player.id, at: nowSec });
        }
      }
      if (player.attackActive && player.attackNextStrike >= SWORD_STRIKE_TIMES.length) {
        // the whole chain is done: a held (or pressed again) button starts the next one a beat later
        const again = player.attackHeld || player.attackQueued;
        const held = player.attackHeld;
        stopSwordChain(player);
        player.attackHeld = held;
        player.attackQueued = again;
        player.attackRestartAt = nowSec + SWORD_CHAIN.restart;
      }
    } else if ((player.attackHeld || player.attackQueued) && !player.attackActive && nowSec >= (player.attackRestartAt ?? -Infinity) && nowSec >= player.staggerUntil) {
      startSwordChain(player, nowSec);
    }
  }

  // bodies do not share space: overlapping Spellblades are eased apart (never off a ledge or into a wall)
  separatePlayers([...room.players.values()], world);
  stepProjectiles(room, dt, nowSec, world);
  room.tickNumber += 1;
  return room.events;
}
