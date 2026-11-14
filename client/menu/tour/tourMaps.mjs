// The round's maps: where the Spellblade (or whoever has the round: tourCast.mjs) makes it, besides the Castleward
// green. Each map is a world of the game's own, a closed route through hand-placed points on its level ground (clear of
// every wall, pillar, cart and tent), and the three places on it where a rival waits. A visit to the front door starts
// on Castleward as it always has; after a round or two the round moves on to another map (a slightly shuffled carousel:
// TourDirector), each time from another start point on its route, maybe the other way round it, with its own number of
// rounds. Pure: no three.js; tested in tourMaps.test.mjs (every metre of every route on standable ground).
//
// World space as the worlds have it: x east, z north, y up. Points are [x, z].
//
// Adding a map (one entry in TOUR_MAPS): a world the game really has (shared/worlds, in the registry: never a stand-in),
// its renderer's loader (`load`: fetched only when the round is going there), its level ground (`footprint`), what
// stands on it for the camera (`blockers`, `props`), and a route of points with three `anchors`. tourMaps.test.mjs then
// walks every metre of it every way round and stages every fight at every stop: fix the points until it passes.

import { CASTLEWARD } from '../../../shared/worlds/castleward.mjs';
import { COURT_OF_MERIT } from '../../../shared/worlds/courtOfMerit.mjs';
import { OUTERWORKS } from '../../../shared/worlds/outerworks.mjs';
import { surfaceHeightAt } from '../../../shared/src/collision.mjs';
import { insideCastlewardFootprint } from '../../worlds/castlewardDecor.mjs';
import { castlewardBlockers, footprintFor, worldBlockers } from './tourCamera.mjs';
import { TOUR_POINTS, buildTourPath } from './tourPath.mjs';
import { FIGHT_DISTANCES } from './tourSchedule.mjs';

// a prop drawn on the ground that nothing collides with (worldProps.mjs draws them), as the room it takes: [wide, tall]
const PROP_ROOM = Object.freeze({
  tent: [3.6, 2.8], cart: [2.8, 1.7], brazier: [0.9, 1.6], standard: [0.5, 3.6], lantern: [0.45, 2.3], rack: [1.9, 1.5],
  woodpile: [1.6, 1.0], barrel: [0.8, 1.0], crate: [0.9, 0.9], sacks: [1.0, 0.8], stakes: [1.6, 1.0],
});

/** The props of a world as boxes { min, max } (what the camera must see past, and a knight walk round). */
export function propBoxes(world) {
  return (world.props ?? []).filter((prop) => Number.isFinite(prop.x) && Number.isFinite(prop.z)).map((prop) => {
    const [wide, tall] = PROP_ROOM[prop.kind] ?? [1, 1.2];
    return { min: [prop.x - wide / 2, 0, prop.z - wide / 2], max: [prop.x + wide / 2, prop.height ?? tall, prop.z + wide / 2], kind: prop.kind };
  });
}

export const TOUR_MAPS = Object.freeze({
  castleward: Object.freeze({
    id: 'castleward',
    name: 'Castleward',
    world: CASTLEWARD,
    footprint: insideCastlewardFootprint,
    blockers: () => castlewardBlockers(),
    // (Castleward's own props are already among its blockers, kind by kind: tourCamera.castlewardBlockers)
    props: () => [],
    // a visit always opens here, the round as it was first written; later visits to it take it from elsewhere
    routes: Object.freeze([Object.freeze({ id: 'green', points: TOUR_POINTS, stops: FIGHT_DISTANCES })]),
  }),
  // The Court of Merit at dusk: round the arena floor between its pillars and its stands, clear of the tribunal steps
  'court-of-merit': Object.freeze({
    id: 'court-of-merit',
    name: 'The Court of Merit',
    world: COURT_OF_MERIT,
    load: () => import('../../worlds/CourtOfMeritRenderer.mjs').then((module) => module.CourtOfMeritRenderer),
    footprint: footprintFor(COURT_OF_MERIT, { bounds: [-17.4, 17.4, -17.6, 10] }),
    blockers: () => worldBlockers(COURT_OF_MERIT),
    props: () => [],
    routes: Object.freeze([
      Object.freeze({
        id: 'arena',
        points: Object.freeze([
          [-5, 8.6], [0, 8.9], [5, 8.6], [10.8, 8.4], [12.6, 3.6], [13, -2], [12.6, -8], [11, -12.6], [5.5, -12.4], [0, -11.8],
          [-5.5, -12.4], [-11, -12.6], [-12.6, -8], [-13, -2], [-12.6, 3.6], [-10.8, 8.4],
        ]),
        // the east and west sides of the floor, and its south end before the portal
        anchors: Object.freeze([[12.9, 0.8], [2.8, -12.1], [-12.9, -4.8]]),
      }),
    ]),
  }),
  // The Outerworks' bailey: inside the breach, round the bailey between its siege stores and under the gate's towers
  outerworks: Object.freeze({
    id: 'outerworks',
    name: 'The Outerworks',
    world: OUTERWORKS,
    load: () => import('../../worlds/OuterworksRenderer.mjs').then((module) => module.OuterworksRenderer),
    footprint: footprintFor(OUTERWORKS, { bounds: [-17.6, 16.6, 6.2, 37] }),
    blockers: () => worldBlockers(OUTERWORKS, propBoxes(OUTERWORKS)),
    props: () => propBoxes(OUTERWORKS),
    routes: Object.freeze([
      Object.freeze({
        id: 'bailey',
        points: Object.freeze([
          [-5, 9.2], [2.5, 9.4], [9.5, 10.2], [12.9, 14], [13.1, 21], [12.6, 28], [9.5, 32.4], [3, 33.3], [-3, 33.2], [-8, 30.8],
          [-9.6, 26], [-6.8, 21.6], [-5.4, 16], [-5.4, 12],
        ]),
        // the south of the bailey inside the breach, its east lane north of the cistern, and under the gate towers
        anchors: Object.freeze([[2.5, 9.4], [13, 22.5], [-1, 33.2]]),
      }),
    ]),
  }),
});

export const TOUR_MAP_IDS = Object.freeze(Object.keys(TOUR_MAPS));

// how a route's stops must lie for the round to run: the first far enough from the start for him to get going and
// stop, each far enough from the last for its fight to finish and its rival to be out of the way, the last far enough
// from the end
export const STOP_SPACING = Object.freeze({ first: 8, between: 14, last: 8 });

/**
 * A route made into the round's path: `reverse` runs it the other way, `start` begins it at another of its points.
 * Returns { key, id, route, path, stops (distances along it, in order), world, footprint, blockers, props }, or null if
 * the stops would not lie as STOP_SPACING needs from that start.
 */
export function mapPlan(id, { route = 0, reverse = false, start = 0 } = {}) {
  const map = TOUR_MAPS[id];
  const base = map?.routes[route];
  if (!base) return null;
  const turned = reverse ? [...base.points].reverse() : [...base.points];
  const points = [...turned.slice(start), ...turned.slice(0, start)];
  const path = buildTourPath(points);
  const stops = !reverse && start === 0 && base.stops
    ? [...base.stops]
    : (base.anchors ?? base.stops.map((d) => { const at = buildTourPath(base.points).at(d); return [at.x, at.z]; })).map((point) => path.distanceNear(point)).sort((a, b) => a - b);
  if (!stopsFit(stops, path.length)) return null;
  return {
    key: `${id}:${base.id}:${reverse ? 'back' : 'on'}:${start}`, id, name: map.name, route: base.id, reverse, start,
    path, stops, world: map.world, footprint: map.footprint, blockers: map.blockers(), props: map.props(),
  };
}

export function stopsFit(stops, length, spacing = STOP_SPACING) {
  if (stops.length !== 3 || stops[0] < spacing.first || length - stops[stops.length - 1] < spacing.last) return false;
  return stops.every((d, i) => i === 0 || d - stops[i - 1] >= spacing.between);
}

/** Every way a map's routes can be run: [{ route, reverse, start }], each of which makes a plan. */
export function mapVariants(id) {
  const map = TOUR_MAPS[id];
  const variants = [];
  map.routes.forEach((base, route) => {
    for (const reverse of [false, true]) {
      for (let start = 0; start < base.points.length; start += 1) {
        if (mapPlan(id, { route, reverse, start })) variants.push({ route, reverse, start });
      }
    }
  });
  return variants;
}

/**
 * The carousel's next leg: a map other than the one it is on (none twice before every one has had its turn: `seen`),
 * one of its ways round, and how many rounds it stays for (1 or 2). random: 0..1.
 */
export function nextLeg(random, { from = null, seen = [], maps = TOUR_MAP_IDS } = {}) {
  const fresh = maps.filter((id) => id !== from && !seen.includes(id));
  const pool = fresh.length ? fresh : maps.filter((id) => id !== from);
  const id = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? maps[0];
  const variants = mapVariants(id);
  const variant = variants[Math.min(variants.length - 1, Math.floor(random() * variants.length))] ?? { route: 0, reverse: false, start: 0 };
  return { id, ...variant, rounds: random() < 0.55 ? 1 : 2 };
}

/**
 * What is wrong with a plan's path, if anything, sampled every `step` metres: off the map's level ground (no floor
 * there at the knights' height, or not well inside it), or too near something solid or a prop (`room` metres: a knight
 * and his sword's swing clear of it). [] if nothing.
 */
export function routeIssues(plan, { step = 0.25, room = 0.75 } = {}) {
  const issues = [];
  const low = (plan.world.solids ?? []).filter((solid) => solid.center[1] - solid.size[1] / 2 <= 1.8);
  for (let d = 0; d < plan.path.length; d += step) {
    const { x, z } = plan.path.at(d);
    const floor = surfaceHeightAt(x, z, 0.3, plan.world);
    if (floor === null || Math.abs(floor) > 0.05) issues.push({ d, x, z, what: `no level floor (${floor})` });
    if (!plan.footprint(x, z, -0.6)) issues.push({ d, x, z, what: 'outside the level ground' });
    for (const solid of low) {
      const gap = Math.hypot(Math.max(0, Math.abs(x - solid.center[0]) - solid.size[0] / 2), Math.max(0, Math.abs(z - solid.center[2]) - solid.size[2] / 2));
      if (gap <= room) issues.push({ d, x, z, what: `${solid.id ?? solid.kind ?? 'solid'} ${gap.toFixed(2)} m away` });
    }
    for (const prop of plan.props) {
      const gap = Math.hypot(Math.max(0, prop.min[0] - x, x - prop.max[0]), Math.max(0, prop.min[2] - z, z - prop.max[2]));
      if (gap <= room) issues.push({ d, x, z, what: `${prop.kind} ${gap.toFixed(2)} m away` });
    }
  }
  return issues;
}
