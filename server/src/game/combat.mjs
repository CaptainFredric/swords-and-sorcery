import { GAME, SWORD_STRIKE_TIMES, fireballSplashDamage, resolveSwordVsGuard } from '../../../shared/src/combat.mjs';
import { findSwordWorldHit, segmentAabbHit, surfaceHeightAt } from '../../../shared/src/collision.mjs';
import { SPRINT, movePlayer, resolveSprint, tryStartDash } from '../../../shared/src/movement.mjs';
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
  player.guardStamina = 100;
  player.guarding = false;
  player.sprinting = false;
  player.guardStartedAt = -Infinity;
  player.lastGuardDrainAt = -Infinity;
  player.attackActive = false;
  player.attackHeld = false;
  player.attackStartedAt = -Infinity;
  player.attackNextStrike = 0;
  player.attackRestartAt = -Infinity;
  player.staggerUntil = -Infinity;
  player.fireballReadyAt = Math.max(player.fireballReadyAt ?? 0, nowSec);
  player.castEndsAt = 0;
  player.pendingFireball = null;
  player.spawnProtectionUntil = nowSec + SPAWN_PROTECTION_SEC;
  player.alive = true;
  player.respawnAt = 0;
  player.lastDamageAt = -Infinity;
  player.lastAttackerId = null;
  player.lastKnockbackAt = -Infinity;
  player.history = [];
  recordTransform(player, nowSec);
}

export function beginAttack(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil) return false;
  player.attackHeld = true;
  if (!player.attackActive) {
    player.attackActive = true;
    player.attackStartedAt = nowSec;
    player.attackNextStrike = 0;
  }
  player.guarding = false;
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'attackStarted', playerId, at: nowSec });
  return true;
}

export function endAttack(room, playerId, nowSec) {
  const player = room.players.get(playerId);
  if (!player) return;
  player.attackHeld = false;
  player.attackActive = false;
  player.attackNextStrike = 0;
  room.events.push({ type: 'attackEnded', playerId, at: nowSec });
}

export function setGuard(room, playerId, guarding, nowSec) {
  const player = room.players.get(playerId);
  if (!player || !player.alive) return false;
  if (guarding && room.state !== 'PLAYING') return false;
  if (guarding && (player.guardStamina <= 0 || nowSec < player.staggerUntil)) return false;
  player.guarding = Boolean(guarding);
  if (guarding) {
    player.guardStartedAt = nowSec;
    player.attackActive = false;
    player.attackHeld = false;
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

export function tryCastFireball(room, playerId, direction, nowSec) {
  const player = room.players.get(playerId);
  if (room.state !== 'PLAYING' || !player || !player.alive || nowSec < player.staggerUntil || nowSec < player.fireballReadyAt) return false;
  player.fireballReadyAt = nowSec + GAME.fireballCooldownSec;
  player.castEndsAt = nowSec + 0.3;
  player.pendingFireball = normalize3(direction);
  player.guarding = false;
  player.attackActive = false;
  player.attackHeld = false;
  player.spawnProtectionUntil = Math.min(player.spawnProtectionUntil, nowSec);
  room.events.push({ type: 'fireballCast', playerId, at: nowSec, castEndsAt: player.castEndsAt });
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
  attacker.attackActive = false;
  attacker.attackHeld = false;
  attacker.attackNextStrike = 0;
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
    });
    target.guardStamina = guardResult.staminaAfter;
    if (guardResult.kind === 'parry') {
      target.parries += 1;
      attacker.staggerUntil = nowSec + GAME.parryStaggerMs / 1000;
      attacker.attackActive = false;
      attacker.attackHeld = false;
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
  victim.attackActive = false;
  victim.attackHeld = false;
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

function spawnFireball(room, player, nowSec) {
  const direction = player.pendingFireball;
  if (!direction) return;
  const id = `f${++projectileCounter}`;
  const f = forwardFromYaw(player.yaw);
  const horizontalFallback = { x: f.x, y: 0, z: f.z };
  const dir = Math.hypot(direction.x, direction.y, direction.z) > 0.01 ? direction : horizontalFallback;
  const normalized = normalize3(dir);
  const projectile = {
    id,
    ownerId: player.id,
    position: { x: player.position.x + normalized.x * 0.7, y: player.position.y + 1.25, z: player.position.z + normalized.z * 0.7 },
    velocity: { x: normalized.x * 24, y: normalized.y * 24, z: normalized.z * 24 },
    bornAt: nowSec,
  };
  room.projectiles.set(id, projectile);
  player.pendingFireball = null;
  player.castEndsAt = 0;
  room.events.push({ type: 'projectileSpawned', projectile: structuredClone(projectile), at: nowSec });
}

function explodeFireball(room, projectile, point, nowSec, worldHit = false, directVictimId = null) {
  room.projectiles.delete(projectile.id);
  for (const player of room.players.values()) {
    if (!player.alive || player.id === projectile.ownerId) continue;
    const center = playerCenter(player);
    const distance = Math.hypot(center.x - point.x, center.y - point.y, center.z - point.z);
    if (distance > GAME.fireballSplashRadius) continue;
    const amount = player.id === directVictimId ? GAME.fireballDirectDamage : fireballSplashDamage(distance);
    const away = normalize3({ x: center.x - point.x, y: Math.max(0.15, center.y - point.y), z: center.z - point.z });
    applyDamage(room, projectile.ownerId, player.id, amount, 'fireball', nowSec, {
      x: away.x * 4.3, y: away.y * 2.3, z: away.z * 4.3,
    });
  }
  room.events.push({ type: 'projectileImpact', projectileId: projectile.id, ownerId: projectile.ownerId, point, worldHit, at: nowSec });
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
      explodeFireball(room, projectile, { x: nearestWorld.point[0], y: nearestWorld.point[1], z: nearestWorld.point[2] }, nowSec, true);
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
      explodeFireball(room, projectile, after, nowSec, false, direct.id);
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

    if (player.pendingFireball && nowSec >= player.castEndsAt) spawnFireball(room, player, nowSec);

    if (!player.guarding && nowSec - player.lastGuardDrainAt >= GUARD_REGEN_DELAY_SEC && player.guardStamina < GAME.guardMax) {
      player.guardStamina = Math.min(GAME.guardMax, player.guardStamina + GUARD_REGEN_PER_SEC * dt);
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
      blocked: staggered || player.guarding || player.attackActive || Boolean(player.pendingFireball),
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
    player.yaw = input.yaw ?? player.yaw;
    player.pitch = input.pitch ?? player.pitch;
    recordTransform(player, nowSec);

    if (player.position.y < (world.abyssY ?? -9)) {
      killPlayer(room, player.id, null, 'abyss', nowSec);
      continue;
    }

    if (player.attackActive && nowSec >= player.staggerUntil) {
      const elapsed = nowSec - player.attackStartedAt;
      while (player.attackActive && player.attackNextStrike < SWORD_STRIKE_TIMES.length && elapsed + 1e-9 >= SWORD_STRIKE_TIMES[player.attackNextStrike]) {
        const strike = player.attackNextStrike;
        player.attackNextStrike += 1;
        room.events.push({ type: 'swordSwing', playerId: player.id, strikeIndex: strike, at: nowSec });
        resolveSwordStrike(room, player, strike, nowSec, world);
      }
      if (player.attackActive && player.attackNextStrike >= SWORD_STRIKE_TIMES.length) {
        player.attackActive = false;
        player.attackRestartAt = nowSec + 0.28;
      }
    } else if (player.attackHeld && !player.attackActive && nowSec >= (player.attackRestartAt ?? -Infinity) && nowSec >= player.staggerUntil) {
      player.attackActive = true;
      player.attackStartedAt = nowSec;
      player.attackNextStrike = 0;
    }
  }

  stepProjectiles(room, dt, nowSec, world);
  room.tickNumber += 1;
  return room.events;
}
