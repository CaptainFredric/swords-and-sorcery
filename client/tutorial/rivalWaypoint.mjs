import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { projectToScreen } from '../ui/screenProjection.mjs';
import { isTitle, isBlocking } from './TutorialView.mjs';

const PROXIMITY_SUPPRESS_DIST = 5.5;
const COMBAT_CLOSE_DIST = 3.5;
const COMBAT_MODES = new Set(['duel', 'guard-lesson', 'final-fight', 'final-guard']);

/**
 * Calculates screen projection and metadata for the Rival / Passage objective marker.
 *
 * Distinguishes between tracking Rival directly (labeled 'RIVAL' with distance to Rival)
 * and guiding through impassable terrain/barriers (labeled 'PASSAGE' with distance to the passage).
 *
 * @param {object} params
 * @param {object} [params.session] Active TutorialSession if any
 * @param {object} params.local Local player state ({ position: {x, y, z}, alive, health })
 * @param {object} params.snapshot Current game snapshot
 * @param {object} params.camera Camera object (Three.js or mock)
 * @param {object} [params.THREE]
 * @returns {{ x: number, y: number, clamped: boolean, isBehind: boolean, angle: number, dist: number, name: string } | null}
 */
export function computeRivalWaypoint({ session, local, snapshot, camera, THREE } = {}) {
  if (!snapshot?.tutorial && !session) return null;
  if (!local || local.health <= 0 || (local.alive !== undefined && !local.alive)) return null;

  if (session) {
    if (session.director?.state && session.director.state !== 'running') return null;
    const progress = session.director?.progress;
    if (progress) {
      if (['complete', 'completed'].includes(progress.state)) return null;
      const beat = progress.current;
      if (isTitle(beat) || isBlocking(beat)) return null;
    }
    if (session.director?.facts?.has('rival-defeated')) return null;
  }

  let rivalPos = null;
  if (session?.rivalId) {
    const actor = session.host?.room?.players?.get(session.rivalId);
    if (actor) rivalPos = actor.position;
  }
  if (!rivalPos && snapshot?.players) {
    const localId = local.id ?? session?.host?.player?.id;
    const snapRival = snapshot.players.find(p => p.id !== localId);
    if (snapRival) rivalPos = snapRival.position;
  }
  if (!rivalPos) return null;

  const playerPos = local.position;
  let targetPos = rivalPos;
  let heightOffset = 2.3;
  let name = 'RIVAL';
  let isPassage = false;
  let passageKind = null;

  // Obstacle-aware navigation:
  // 1. Opening Slalom (gates A, B, C)
  if (rivalPos.z <= -10 && playerPos.z > 0) {
    if (playerPos.z > 168) {
      targetPos = { x: 68, y: 0, z: 168 };
      heightOffset = 1.6;
      name = 'PASSAGE';
      isPassage = true;
      passageKind = 'gate';
    } else if (playerPos.z > 110) {
      targetPos = { x: -68, y: 0, z: 110 };
      heightOffset = 1.6;
      name = 'PASSAGE';
      isPassage = true;
      passageKind = 'gate';
    } else if (playerPos.z > 52) {
      targetPos = { x: 68, y: 0, z: 52 };
      heightOffset = 1.6;
      name = 'PASSAGE';
      isPassage = true;
      passageKind = 'gate';
    }
  }
  // 2. Mill Lane entrance through 1.7m stone field wall
  else if (rivalPos.z < -533 && playerPos.z > -533 && playerPos.z < -500) {
    targetPos = { x: 26, y: 0, z: -531.5 };
    heightOffset = 1.6;
    name = 'PASSAGE';
    isPassage = true;
    passageKind = 'lane';
  }
  // 3. Broken Bridge Ravine (guide to takeoff ramp before chasm)
  else if (rivalPos.z < -676 && playerPos.z > -663 && playerPos.z < -580) {
    targetPos = { x: 32, y: 2, z: -662.4 };
    heightOffset = 1.6;
    name = 'PASSAGE';
    isPassage = true;
    passageKind = 'bridge';
  }

  const dist = Math.hypot(targetPos.x - playerPos.x, targetPos.z - playerPos.z);
  const rivalDist = Math.hypot(rivalPos.x - playerPos.x, rivalPos.z - playerPos.z);

  const projected = projectToScreen(targetPos, camera, { heightOffset, THREE });
  if (!projected) return null;

  // Proximity suppression:
  // For direct Rival tracking, hide when Rival is in close view to prevent obscuring face/action
  if (!isPassage && !projected.clamped && rivalDist <= PROXIMITY_SUPPRESS_DIST) {
    return null;
  }
  // For passage guidance, hide when the player is right at the threshold
  if (isPassage && !projected.clamped && dist <= 2.0) {
    return null;
  }

  // Close combat suppression
  const inCombat = COMBAT_MODES.has(session?.rival?.mode);
  if (inCombat && rivalDist <= COMBAT_CLOSE_DIST) {
    return null;
  }

  return {
    x: projected.x,
    y: projected.y,
    clamped: projected.clamped,
    isBehind: projected.isBehind,
    angle: projected.angle,
    dist,
    name,
    passageKind,
  };
}
