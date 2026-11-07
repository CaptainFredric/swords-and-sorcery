// Edge of Victory: an authoritative battle-royale rule, not a damaging storm.
// All balance numbers below are provisional, intentionally confined to one place.
import { resolvePlayerWorld, surfaceHeightAt } from '../src/collision.mjs';
import { MOVEMENT } from '../src/movement.mjs';
import { isSpell } from '../src/spells.mjs';
import { normalizePreparedSpells } from '../src/preparedSpells.mjs';
import { edgeInside, edgeLimitPoint } from '../src/edgeBoundary.mjs';
export { edgeInside, edgeLimitPoint } from '../src/edgeBoundary.mjs';

export const EDGE_CONFIG = Object.freeze({
  center: Object.freeze({ x: 0, z: -1 }),
  stages: Object.freeze([
    Object.freeze({ second: 0, radius: 18 }),
    Object.freeze({ second: 75, radius: 15 }),
    Object.freeze({ second: 150, radius: 11 }),
    Object.freeze({ second: 225, radius: 8 }),
    Object.freeze({ second: 290, radius: 6.5 }),
  ]),
  playerClearance: MOVEMENT.playerRadius,
  pickupRange: 1.35,
  refusalCooldownSec: 9,
  defaultCompetitors: 4,
});

export const EDGE_REFUSALS = Object.freeze([
  'I shall not leave. To retreat is to not fight for today.',
  'No, I must get closer. I will not leave this place.',
]);

export function edgeRadiusAt(elapsed, stages = EDGE_CONFIG.stages) {
  const time = Math.max(0, elapsed);
  if (time <= stages[0].second) return stages[0].radius;
  for (let i = 1; i < stages.length; i += 1) {
    if (time > stages[i].second) continue;
    const prior = stages[i - 1], next = stages[i];
    const progress = (time - prior.second) / (next.second - prior.second);
    return prior.radius + (next.radius - prior.radius) * progress;
  }
  return stages.at(-1).radius; // stable fighting area: never contracts to a point
}

export function edgeNextStage(elapsed, stages = EDGE_CONFIG.stages) {
  return stages.find((stage) => stage.second > elapsed + 1e-6)?.second ?? null;
}

/** Find an actual supported, unoccupied spot. Do not invent a floor under a cliff.
 * Uses nearby corrections first; navigational waypoints are a last-resort fallback.
 */
function safeEdgePoint(wanted, world, center, radius, clearance) {
  const candidate = edgeLimitPoint(wanted, center, radius, clearance + 0.08);
  const solids = world?.solids ?? [];
  const check = (point) => {
    if (!edgeInside(point, center, radius, clearance)) return null;
    const ground = surfaceHeightAt(point.x, point.z, point.y + 1.5, world);
    if (ground === null || !Number.isFinite(ground)) return null;
    const pos = { x: point.x, y: ground, z: point.z };
    const resolved = resolvePlayerWorld(pos, clearance, solids);
    if (Math.hypot(resolved.x - pos.x, resolved.z - pos.z) > 0.045) return null;
    return pos;
  };
  const near = check(candidate);
  if (near) return near;
  // Backtrack toward the arena center, avoiding geometry and keeping a connected path where possible.
  for (let i = 1; i <= 24; i += 1) {
    const fraction = i / 25;
    const trial = { x: candidate.x + (center.x - candidate.x) * fraction,
      y: wanted.y, z: candidate.z + (center.z - candidate.z) * fraction };
    const safe = check(trial);
    if (safe) return safe;
  }
  const nav = (world?.navigation?.nodes ?? []).filter((p) => edgeInside(p, center, radius, clearance + 0.15))
    .sort((a, b) => Math.hypot(a.x - candidate.x, a.z - candidate.z) - Math.hypot(b.x - candidate.x, b.z - candidate.z));
  for (const point of nav) {
    const safe = check(point);
    if (safe) return safe;
  }
  return null;
}

export function createEdgeOfVictoryState(world, nowSec, config = EDGE_CONFIG) {
  // Use established, playable world spawns: no random points inside rubble or an abyss.
  const spots = [world?.spawnPoints?.[2], world?.spawnPoints?.[7], world?.spawnPoints?.[8], world?.spawnPoints?.[4]]
    .filter(Boolean);
  const spells = ['gale', 'frostfire', 'steel', 'fireball'];
  return {
    phase: 'CONTRACTING',
    startedAt: nowSec,
    center: { ...config.center },
    radius: config.stages[0].radius,
    nextStageAt: nowSec + (config.stages[1]?.second ?? 0),
    eliminated: [],
    remaining: [],
    winnerId: null,
    pickups: spots.map((p, i) => ({
      id: 'edge-spell-' + i, kind: 'spell', spell: spells[i % spells.length],
      position: { x: p.x, y: p.y, z: p.z }, available: true, collectedBy: null,
    })),
    config,
  };
}

export function edgeSpawnOrder(world, count, center = EDGE_CONFIG.center) {
  const candidates = (world?.spawnPoints ?? []).filter((p) => edgeInside(p, center, EDGE_CONFIG.stages[0].radius, MOVEMENT.playerRadius + .2));
  const selected = [];
  if (!candidates.length) return [];
  selected.push(candidates[0]);
  while (selected.length < Math.min(count, candidates.length)) {
    const unused = candidates.filter((p) => !selected.includes(p));
    unused.sort((a, b) => {
      const score = (p) => Math.min(...selected.map((s) => Math.hypot(p.x - s.x, p.z - s.z)));
      return score(b) - score(a);
    });
    selected.push(unused[0]);
  }
  return selected;
}

export function edgeAlive(room) {
  return [...room.players.values()].filter((p) => p.alive && (p.actorKind === 'human' || p.actorKind === 'bot'));
}

export function updateEdgeSurvivors(room, nowSec) {
  const state = room.edgeOfVictory;
  if (!state || room.state !== 'PLAYING') return;
  state.remaining = edgeAlive(room).map((p) => p.id);
  if (state.remaining.length === 1) {
    state.winnerId = state.remaining[0];
    state.phase = 'FINISHED';
    room.finish(state.winnerId, nowSec, 'last-knight-standing');
  } else if (!state.remaining.length) {
    state.phase = 'FINISHED';
    room.finish(null, nowSec, 'no-survivors');
  }
}

export function eliminateEdgePlayer(room, playerId, nowSec, reason = 'defeated') {
  const state = room.edgeOfVictory;
  if (!state || room.state !== 'PLAYING') return;
  if (!state.eliminated.some((p) => p.id === playerId))
    state.eliminated.push({ id: playerId, at: nowSec, reason });
  updateEdgeSurvivors(room, nowSec);
}

export function edgeCollectSpells(room, nowSec) {
  const state = room.edgeOfVictory;
  if (!state || room.state !== 'PLAYING') return;
  for (const pickup of state.pickups) {
    if (!pickup.available || !isSpell(pickup.spell)) continue;
    for (const player of edgeAlive(room)) {
      if (Math.hypot(player.position.x - pickup.position.x, player.position.z - pickup.position.z) > state.config.pickupRange
        || Math.abs(player.position.y - pickup.position.y) > 2.2) continue;
      pickup.available = false; pickup.collectedBy = player.id;
      player.spell = pickup.spell;
      // The collected spell becomes the selected spell in the existing three-slot system.
      player.preparedSpells = normalizePreparedSpells(pickup.spell, player.preparedSpells);
      player.preparedSpellSelected = false;
      room.events.push({ type: 'edgeSpellCollected', playerId: player.id,
        pickupId: pickup.id, spell: pickup.spell, at: nowSec });
      break; // one actor only, even if two clients try to collect in the same tick
    }
  }
}

export function edgeConstrainActor(room, actor, oldPosition, nowSec, world = room.world, clearance = MOVEMENT.playerRadius) {
  const state = room.edgeOfVictory;
  if (!state || room.state !== 'PLAYING' || !actor?.alive) return false;
  const center = state.center, radius = state.radius;
  const before = oldPosition ?? actor.position;
  const dx = actor.position.x - center.x, dz = actor.position.z - center.z;
  const norm = Math.hypot(dx, dz) || 1;
  const atEdge = norm >= radius - clearance - 0.25;
  const f = Math.max(-1, Math.min(1, actor.input?.forward ?? 0));
  const r = Math.max(-1, Math.min(1, actor.input?.right ?? 0));
  const yaw = actor.input?.yaw ?? actor.yaw ?? 0;
  const intendedX = -Math.sin(yaw) * f + Math.cos(yaw) * r;
  const intendedZ = -Math.cos(yaw) * f - Math.sin(yaw) * r;
  const attemptedRetreat = (intendedX * dx + intendedZ * dz) / norm > 0.18;
  const forcedOutside = !edgeInside(before, center, radius, clearance);
  // Shared movePlayer may already have projected the motion inside the circle.
  // Detect the *input* against the edge, not merely an illegal end position.
  if (atEdge && attemptedRetreat && !forcedOutside
      && nowSec - (actor.edgeLastRefusalAt ?? -Infinity) >= state.config.refusalCooldownSec) {
    actor.edgeLastRefusalAt = nowSec;
    const text = EDGE_REFUSALS[(actor.edgeRefusalCount ?? 0) % EDGE_REFUSALS.length];
    actor.edgeRefusalCount = (actor.edgeRefusalCount ?? 0) + 1;
    room.events.push({ type: 'spellbladeLine', playerId: actor.id,
      speaker: actor.name, text, at: nowSec });
  }
  if (edgeInside(actor.position, center, radius, clearance)) return false;
  const wanted = edgeLimitPoint(actor.position, center, radius, clearance + 0.04);
  const spot = safeEdgePoint({ ...wanted, y: actor.position.y }, world, center, radius, clearance);
  if (!spot) {
    if (edgeInside(before, center, radius, clearance)) actor.position = { ...before };
    return true;
  }
  actor.position = { x: spot.x, y: forcedOutside && actor.grounded ? spot.y : actor.position.y, z: spot.z };
  const nx = actor.position.x - center.x, nz = actor.position.z - center.z;
  const length = Math.hypot(nx, nz) || 1;
  const radialSpeed = ((actor.velocity?.x ?? 0) * nx + (actor.velocity?.z ?? 0) * nz) / length;
  if (radialSpeed > 0) {
    actor.velocity.x -= radialSpeed * nx / length;
    actor.velocity.z -= radialSpeed * nz / length;
  }
  return true;
}

export function stepEdgeOfVictory(room, nowSec, world = room.world) {
  const state = room.edgeOfVictory;
  if (!state || room.state !== 'PLAYING') return;
  const elapsed = nowSec - state.startedAt;
  const newRadius = edgeRadiusAt(elapsed, state.config.stages);
  const next = edgeNextStage(elapsed, state.config.stages);
  state.radius = newRadius;
  state.nextStageAt = next === null ? null : state.startedAt + next;
  for (const player of edgeAlive(room)) edgeConstrainActor(room, player, player.position, nowSec, world);
  edgeCollectSpells(room, nowSec);
  updateEdgeSurvivors(room, nowSec);
}

export function edgeSnapshot(room) {
  const state = room.edgeOfVictory;
  if (!state) return null;
  return {
    phase: state.phase, center: { ...state.center }, radius: state.radius,
    nextStageAt: state.nextStageAt, remaining: [...state.remaining],
    playersRemaining: state.remaining.length, eliminated: state.eliminated.map((p) => ({ ...p })),
    winnerId: state.winnerId,
    pickups: state.pickups.map((p) => ({ ...p, position: { ...p.position } })),
  };
}
