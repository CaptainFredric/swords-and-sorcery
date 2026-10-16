import { TEAMS } from '../src/teams.mjs';

/**
 * Creates an authoritative objective state for a room.
 */
export function createObjectiveState(worldObjectives = []) {
  const objectives = (worldObjectives.length ? worldObjectives : [
    {
      id: 'outer-gate',
      name: 'The Outer Gate',
      x: 0,
      y: 0,
      z: -2,
      radius: 6.0,
      captureSec: 15,
      decayRate: 0.5,
    },
    {
      id: 'high-sanctum',
      name: 'The High Sanctum',
      x: 0,
      y: 0.3,
      z: 25,
      radius: 5.5,
      captureSec: 20,
      decayRate: 0.5,
    },
  ]).map((obj, i) => Object.freeze({
    id: obj.id || `objective-${i + 1}`,
    name: obj.name || `Objective ${i + 1}`,
    position: Object.freeze({ x: obj.x, y: obj.y ?? 0, z: obj.z }),
    radius: obj.radius ?? 6.0,
    captureSec: obj.captureSec ?? 15,
    decayRate: obj.decayRate ?? 0.5,
  }));

  return {
    index: 0,
    phase: 0,
    objectives,
    progress: 0,
    completed: false,
    attackersCount: 0,
    defendersCount: 0,
    contested: false,
    capturing: false,
    decaying: false,
    wasContested: false,
    lastContestedAt: -Infinity,
    lastCaptureProgressAt: -Infinity,
    lastCapturedId: null,
    lastCapturedName: null,
    lastCapturedAt: -Infinity,
  };
}

/**
 * Advances objective simulation tick authoritatively.
 */
export function stepObjectives(room, dt, nowSec) {
  if (room.state !== 'PLAYING' || !room.objectiveState || room.objectiveState.completed) return;
  const state = room.objectiveState;
  const currentObj = state.objectives[state.index];
  if (!currentObj) return;

  const center = currentObj.position;
  const radiusSq = currentObj.radius * currentObj.radius;

  let attackers = 0;
  let defenders = 0;
  for (const player of room.players.values()) {
    if (!player.alive) continue;
    const dx = player.position.x - center.x;
    const dz = player.position.z - center.z;
    if (dx * dx + dz * dz <= radiusSq) {
      if (player.team === TEAMS.ATTACKERS) attackers += 1;
      else if (player.team === TEAMS.DEFENDERS) defenders += 1;
    }
  }

  state.attackersCount = attackers;
  state.defendersCount = defenders;

  if (attackers > 0 && defenders > 0) {
    state.contested = true;
    state.capturing = false;
    state.decaying = false;
    if (!state.wasContested) {
      state.wasContested = true;
      state.lastContestedAt = nowSec;
      room.events.push({
        type: 'objectiveContested',
        objectiveId: currentObj.id,
        index: state.index,
        at: nowSec,
      });
    }
  } else if (attackers > 0 && defenders === 0) {
    state.contested = false;
    state.wasContested = false;
    state.capturing = true;
    state.decaying = false;
    // Base capture rate plus bonus for extra attackers on the objective
    const multiplier = 1 + (attackers - 1) * 0.35;
    const added = (multiplier / currentObj.captureSec) * dt;
    state.progress = Math.min(1, state.progress + added);
    state.lastCaptureProgressAt = nowSec;

    if (state.progress >= 1) {
      state.progress = 1;
      state.lastCapturedId = currentObj.id;
      state.lastCapturedName = currentObj.name;
      state.lastCapturedAt = nowSec;
      room.events.push({
        type: 'objectiveCaptured',
        objectiveId: currentObj.id,
        objectiveName: currentObj.name,
        index: state.index,
        at: nowSec,
      });

      if (state.index + 1 < state.objectives.length) {
        state.index += 1;
        state.phase += 1;
        state.progress = 0;
        state.capturing = false;
        const nextObj = state.objectives[state.index];
        room.events.push({
          type: 'objectiveAdvanced',
          nextIndex: state.index,
          nextObjectiveId: nextObj.id,
          nextObjectiveName: nextObj.name,
          at: nowSec,
        });
      } else {
        state.completed = true;
        state.capturing = false;
        room.finish(TEAMS.ATTACKERS, nowSec, 'objective');
      }
    }
  } else {
    state.contested = false;
    state.wasContested = false;
    state.capturing = false;
    if (state.progress > 0) {
      state.decaying = true;
      const decayRate = (currentObj.decayRate / currentObj.captureSec) * dt;
      state.progress = Math.max(0, state.progress - decayRate);
    } else {
      state.decaying = false;
    }
  }
}
