// Edge of Victory: an authoritative battle-royale rule, not a damaging storm.
// All balance numbers below are provisional, intentionally confined to one place.
import { resolvePlayerWorld, surfaceHeightAt, segmentAabbHit } from '../src/collision.mjs';
import { getBiByeSolids } from './biByeLlista.mjs';
import { soFistSolids } from './soFistGeometry.mjs';
import { fightFlightSolids } from './fightFlight.mjs';
import { MOVEMENT } from '../src/movement.mjs';
import { isSpell } from '../src/spells.mjs';
import { normalizePreparedSpells } from '../src/preparedSpells.mjs';
import { edgeInside, edgeLimitPoint, edgeRadiusAt, edgeNextStage } from '../src/edgeBoundary.mjs';
export { edgeInside, edgeLimitPoint, edgeRadiusAt, edgeNextStage } from '../src/edgeBoundary.mjs';

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

/**
 * The ordinary world collision contract remains authoritative. Corrections
 * never introduce an imaginary support surface or cross a solid between feet
 * positions. For sudden contraction, cover the distance over multiple ticks,
 * rather than snapping a knight several metres through a wall.
 */
export function edgeSafeFootPoint(room, actor, desired, world = room.world, { stepLimit = .38, requireInside = false } = {}) {
  const edge = room.edgeOfVictory;
  if (!edge || !actor?.position) return null;
  const clearance = MOVEMENT.playerRadius;
  const old = actor.position, solids = [
    ...(world?.solids??[]), ...getBiByeSolids(room.biByeLlista),
    ...soFistSolids(room.soFistication), ...fightFlightSolids(room.fightFlight),
    ...[...room.players.values()].filter(p=>p.alive&&p.id!==actor.id)
      .map(p=>({center:[p.position.x,p.position.y+.9,p.position.z],size:[.94,1.8,.94]})),
  ];
  const radius = edge.radius, center = edge.center;
  const target = edgeLimitPoint(desired,center,radius,clearance+.06);
  const oldR = Math.hypot(old.x-center.x,old.z-center.z);
  const validate = (x,z) => {
    const to = { x, y: old.y, z };
    const newR = Math.hypot(x-center.x,z-center.z);
    if (requireInside && !edgeInside(to,center,radius,clearance)) return null;
    if (newR > oldR+1e-4 && !edgeInside(old,center,radius,clearance)) return null;
    const feet = surfaceHeightAt(x,z,old.y+1.4,world);
    // A contraction may catch a knight on the east gallery. Walking off a
    // supported ledge into a REAL lower floor is legal; normal gravity handles
    // the descent, not an instant vertical teleport. A true abyss remains closed.
    const drop = Boolean(actor.grounded && feet!==null && old.y-feet>.65);
    if(actor.grounded && (feet===null || feet>old.y+.5 || old.y-feet>3.3))return null;
    if (actor.grounded && !drop) {
      const footR = clearance * 0.55;
      for (const [fx, fz] of [[-footR, 0], [footR, 0], [0, -footR], [0, footR]]) {
        if (surfaceHeightAt(x + fx, z + fz, old.y + 1.4, world) === null) return null;
      }
    }
    if (actor.grounded) {
      for (const t of [.25,.5,.75]) {
        const tx=old.x+(x-old.x)*t,tz=old.z+(z-old.z)*t;
        const floor=surfaceHeightAt(tx,tz,old.y+1.4,world);
        if(floor===null || floor>old.y+.55 || old.y-floor>3.3)return null;
      }
    }
    const y = actor.grounded && !drop ? feet : old.y;
    const posed = {x,y,z};
    const resolved = resolvePlayerWorld(posed,clearance,solids,1.8);
    if (Math.hypot(resolved.x-x,resolved.z-z)>.025) return null;
    // Only permanent wall volumes block a walk-to-exit route. A mounted
    // machine's own hull surrounds its operator station and is dealt with
    // by that machine's separately validated exit contract.
    for (const solid of world?.solids??[]) {
      if (segmentAabbHit([old.x,old.y+.9,old.z],[x,y+.9,z],solid)) return null;
    }
    return {...posed,edgeLeaveLedge:drop};
  };
  const dx=target.x-old.x,dz=target.z-old.z,distance=Math.hypot(dx,dz);
  if (distance < 1e-5) return validate(target.x,target.z);
  const step = Math.min(distance,stepLimit);
  const heading = Math.atan2(dz,dx);
  // Try the most direct inward progress first; fan out around obstacles.
  for (const degrees of [0,20,-20,40,-40,65,-65,90,-90]) {
    const a=heading+degrees*Math.PI/180;
    const point=validate(old.x+Math.cos(a)*step,old.z+Math.sin(a)*step);
    if (point) return point;
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
    if(!edgeInside(pickup.position,state.center,state.radius,.4)){
      pickup.available=false;
      room.events.push({type:'edgePickupExpired',pickupId:pickup.id,at:nowSec});
      continue;
    }
    for (const player of edgeAlive(room)) {
      if (Math.hypot(player.position.x - pickup.position.x, player.position.z - pickup.position.z) > state.config.pickupRange
        || Math.abs(player.position.y - pickup.position.y) > 1.4) continue;
      if ((room.world?.solids??[]).some(box=>segmentAabbHit(
        [player.position.x,player.position.y+.8,player.position.z],
        [pickup.position.x,pickup.position.y+.8,pickup.position.z],box)))continue;
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
  if (!state || room.state !== 'PLAYING' || !actor?.alive || actor.operatingBallistaId || actor.operatingRamId || actor.operatingFightFlightId) return false;
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
      && nowSec - (actor.lastKnockbackAt ?? -Infinity) > .6
      && nowSec - (actor.edgeLastRefusalAt ?? -Infinity) >= state.config.refusalCooldownSec) {
    actor.edgeLastRefusalAt = nowSec;
    const text = EDGE_REFUSALS[(actor.edgeRefusalCount ?? 0) % EDGE_REFUSALS.length];
    actor.edgeRefusalCount = (actor.edgeRefusalCount ?? 0) + 1;
    room.events.push({ type: 'spellbladeLine', playerId: actor.id,
      speaker: actor.name, text, at: nowSec });
  }
  if (edgeInside(actor.position, center, radius, clearance)) return false;
  const spot = edgeSafeFootPoint(room, actor, actor.position, world, {stepLimit: .38});
  if (!spot) {
    // Never choose an unverified fallback through architecture or an abyss.
    // Remain alive and try again on the next tick, including after contraction.
    if (edgeInside(before, center, radius, clearance)) actor.position = { ...before };
    return true;
  }
  actor.position = {x:spot.x,y:spot.y,z:spot.z};
  if(spot.edgeLeaveLedge){
    actor.grounded=false;actor.velocity.y=Math.min(0,actor.velocity?.y??0);
  }
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
  for (const player of edgeAlive(room)) if (!player.operatingRamId && !player.operatingBallistaId && !player.operatingFightFlightId)
    edgeConstrainActor(room, player, player.position, nowSec, world);
  edgeCollectSpells(room, nowSec);
  updateEdgeSurvivors(room, nowSec);
}

export function edgeSnapshot(room) {
  const state = room.edgeOfVictory;
  if (!state) return null;
  return {
    phase: state.phase, center: { ...state.center }, radius: state.radius,
    startedAt: state.startedAt, stages: state.config.stages,
    nextStageAt: state.nextStageAt, remaining: [...state.remaining],
    playersRemaining: state.remaining.length, eliminated: state.eliminated.map((p) => ({ ...p })),
    winnerId: state.winnerId,
    pickups: state.pickups.map((p) => ({ ...p, position: { ...p.position } })),
  };
}
