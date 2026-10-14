import { GREENER_ROUTE } from './greenerPastures.mjs';
import { MOVEMENT, SPRINT } from '../src/movement.mjs';

// The line through the mill lane (GREENER_ROUTE.millLane), as a body runs it on the ordinary movement rules: down the
// middle, a Jump at each thing in the way, onto the wain and off it over the fence, then a Sprint for the brook and a
// Jump at its lip. One that lands in the brook wades to the ford, comes up it, goes back for a run-up and tries
// again. The tutorial's Rival runs it so; the world's tests prove it at every simulation rate.
//
// mind: the runner's own memory between steps ({} to begin). Returns the input for this step and whether it is through.

const LANE = GREENER_ROUTE.millLane;
// how far before a thing's near face to leave the ground: further at a Sprint (the clearance comes later in the air)
const lead = (speed) => 0.2 * speed + 0.6;
// the brook's lip: close (a Sprint-Jump carries 8.8 m; the brook is 6.8 m)
const BROOK_LEAD = 0.6;
// the run-up a Sprint needs before the brook (it builds in half a second)
const RUN_UP = 7;
// breath enough for a Sprint at the brook (a winded runner gets his back first, rather than jump short)
const BREATH = SPRINT.restartStamina + 12;

export function inMillLane(position) {
  return position.x > LANE.minX - 1 && position.x < LANE.maxX + 1 && position.z < LANE.entryZ + 2 && position.z > LANE.exitZ - 1.5;
}

export function millLaneStep(state, mind = {}) {
  const { position, grounded } = state;
  const speed = Math.hypot(state.velocity?.x ?? 0, state.velocity?.z ?? 0);
  const toward = (x, z) => Math.atan2(position.x - x, position.z - z);
  if (position.z < LANE.exitZ - 1) return { done: true, forward: 0, sprint: false, jump: false, yaw: 0 };
  // in the brook: across to the ford, up it, and back up the lane for a run-up
  if (position.y < -0.5) {
    mind.retry = true;
    const fordX = (LANE.ford.minX + LANE.ford.maxX) / 2;
    const target = position.x < LANE.ford.minX + 0.6 ? { x: fordX, z: position.z } : { x: fordX, z: LANE.brook.maxZ + 2 };
    return { forward: 1, sprint: false, jump: false, yaw: toward(target.x, target.z) };
  }
  if (mind.retry) {
    if (position.z < LANE.brook.maxZ + RUN_UP) return { forward: 1, sprint: false, jump: false, yaw: toward(LANE.centerX, LANE.brook.maxZ + RUN_UP + 1) };
    mind.retry = false;
  }
  // before the brook's run-up, winded: he gets his breath back first
  if (position.z < LANE.fence.minZ - 0.5 && position.z > LANE.brook.maxZ + 2 && grounded && (state.guardStamina ?? Infinity) < BREATH && !mind.going) {
    return { forward: 0, sprint: false, jump: false, yaw: toward(LANE.centerX, position.z - 6) };
  }
  if (position.z < LANE.fence.minZ - 0.5) mind.going = true;
  const onWain = position.y > LANE.wain.height - 0.1;
  const ahead = [
    { face: LANE.log.maxZ, lead: lead(speed) },
    { face: LANE.bales.maxZ, lead: lead(speed) },
    { face: LANE.wain.maxZ, lead: lead(speed), ground: true },
    { face: LANE.fence.maxZ, lead: 1.4, wain: true },
    { face: LANE.brook.maxZ, lead: BROOK_LEAD },
  ].find((thing) => thing.face < position.z + 0.05 && (!thing.wain || onWain) && !(thing.ground && onWain));
  const d = ahead ? position.z - ahead.face : Infinity;
  // (down the middle, which is the wain's line: the fence is crossed only from the wain; a Sprint once over it)
  const sprint = position.z < LANE.fence.minZ + 0.2;
  return { forward: 1, sprint, jump: Boolean(grounded && ahead && d <= ahead.lead), yaw: toward(LANE.centerX, position.z - 6) };
}

/** A running Jump's reach and a Sprint-Jump's (metres in the air, ground to ground), on the movement rules. */
export function jumpReach(speed) {
  return speed * 2 * MOVEMENT.jumpImpulse / MOVEMENT.gravity;
}
