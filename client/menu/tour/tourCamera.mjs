// The fight camera, worked out ahead. Each fight is filmed side on, a beat ahead of the action (the camera knows the
// script), from just far enough back, and slid just far enough sideways, that both knights and their blades fit the
// open part of the screen to the right of the menu's banner; and turned just enough that nothing solid stands between
// it and either knight: a wall, a brazier and its fire, a tree. Pure: plain [x, z] pairs in, the shot out;
// TourDirector.mjs makes it a camera.

import { CASTLEWARD } from '../../../shared/worlds/castleward.mjs';
import { buildCastlewardDecorPlan, insideCastlewardFootprint } from '../../worlds/castlewardDecor.mjs';

export const FIGHT_SHOT = Object.freeze({
  lead: 0.35,          // seconds: the shot frames where the knights are about to be
  minBack: 4.6,        // metres back from the pair: at least this, at most maxBack
  maxBack: 11,
  // a rival further off than this is framed as if he were only this far (and a fight lets him go, `framed`, when he
  // runs for it: the camera stays with the Spellblade)
  maxSpread: 5.4,
  reach: 0.55,         // how far a knight and his blade take up room either side of where he stands
  // the part of the screen the pair is kept in, as shares of its width from the left: right of the banner
  clear: Object.freeze([0.4, 0.96]),
  aspect: 4 / 3,       // the screen's shape, when nobody says (TourDirector passes the real one)
  rise: 1.7,           // the camera's height, a little more the further back it stands
  risePerBack: 0.04,
  aimHeight: 1.05,
  // a fight that wants a closer look (the Slush's scoop and drink: a small vessel at his hands and visor) comes in to
  // this, aimed this high, as far as its `near` says
  nearBack: 3.1,
  nearAim: 1.28,
  fov: 46,
  // turns tried in order (radians, positive toward the Spellblade's side of the pair): the least turned clear one wins
  swings: Object.freeze([0, 0.2, -0.2, 0.4, -0.4, 0.6, -0.6, 0.8, -0.8]),
});

// a small screen (a phone on its side, most of it banner): a wider lens and the pair kept to most of the clear part,
// so the knights stand a little smaller with room around them
export const COMPACT_SHOT = Object.freeze({ fov: 52, fill: 0.85, followFov: 52 });

/**
 * A fight's frame on the path: its origin, u toward the rival's side and v along the path (unit [x, z]), and `along`,
 * the path itself from there (a pose with `path` stands that far down it: a knight walking away down the road).
 */
export function fightFrame(path, fight, distance) {
  const anchor = path.at(distance);
  const side = fight.side ?? 1;
  return {
    origin: [anchor.x, anchor.z],
    u: [anchor.dir[1] * side, -anchor.dir[0] * side],
    v: [anchor.dir[0], anchor.dir[1]],
    distance,
    along: (d) => path.at(distance + d),
  };
}

/** Where a fight pose stands in the world: [x, z]. */
export function placeOnFrame(frame, pose) {
  if (Number.isFinite(pose.path) && frame.along) {
    const here = frame.along(pose.path);
    return [here.x, here.z];
  }
  const u = pose.u ?? 0;
  const v = pose.v ?? 0;
  return [frame.origin[0] + frame.u[0] * u + frame.v[0] * v, frame.origin[1] + frame.u[1] * u + frame.v[1] * v];
}

/**
 * Both knights of a fight at time t: { hero, rival } ([x, z]), whether the rival is still there to be seen, how
 * much the camera keeps him in the shot (`held`, 0..1: the fight's `framed`, or 1), and how much closer it comes
 * (`near`, 0..1: the hero's pose's, or 0).
 */
export function fightPair(fight, frame, t) {
  const heroPose = fight.hero(t);
  const hero = placeOnFrame(frame, heroPose);
  const pose = fight.rival(t);
  const rival = placeOnFrame(frame, pose.gone && pose.u === undefined ? { u: fight.reach } : pose);
  return { hero, rival, rivalHere: !pose.gone, held: pose.framed ?? 1, near: Math.max(0, Math.min(1, heroPose.near ?? 0)) };
}

/** The way the camera looks at a fight turned by `swing`: along the path, turned toward the rival's side. */
export function lookFor(frame, swing) {
  const c = Math.cos(swing);
  const s = Math.sin(swing);
  return [frame.v[0] * c + frame.u[0] * s, frame.v[1] * c + frame.u[1] * s];
}

/**
 * The shot of the pair looking along `look`: { position: [x, y, z], target: [x, y, z], fov }. The camera backs off
 * until both knights fit the `clear` part of the screen (shares of its width) at this `aspect`, and slides sideways
 * to set them in the middle of it. `held` below 1 lets go of the rival (he is framed that much of the way to him).
 * fov/fill (COMPACT_SHOT on a small screen): the lens, and how much of the clear part the pair may take.
 */
export function fightShot(hero, rival, look, { aspect = FIGHT_SHOT.aspect, clear = FIGHT_SHOT.clear, held = 1, fov = FIGHT_SHOT.fov, fill = 1, near = 0 } = {}, shot = FIGHT_SHOT) {
  const closer = Math.max(0, Math.min(1, near));
  const dx = rival[0] - hero[0];
  const dz = rival[1] - hero[1];
  const apart = Math.hypot(dx, dz);
  const scale = (apart > shot.maxSpread ? shot.maxSpread / apart : 1) * Math.max(0, Math.min(1, held));
  const other = [hero[0] + dx * scale, hero[1] + dz * scale];
  const middle = [(hero[0] + other[0]) / 2, (hero[1] + other[1]) / 2];
  // screen-left, looking along a horizontal direction d, is (d.z, -d.x) in this world; right is the opposite
  const right = [-look[1], look[0]];
  // each knight across the view (to the right) and along it (away), from the middle of the pair
  const knights = [hero, other].map(([x, z]) => {
    const ox = x - middle[0];
    const oz = z - middle[1];
    return { across: ox * right[0] + oz * right[1], along: ox * look[0] + oz * look[1] };
  });
  // a point `across` right of the middle, `depth` ahead of a camera slid `slide` to the right, shows on screen at
  // (across - slide) / (depth * spread) from the centre, from -1 at the left edge to 1 at the right
  const spread = Math.tan((fov * Math.PI) / 360) * aspect;
  const [clearFrom, clearTo] = clear.map((share) => share * 2 - 1);
  const mid = (clearFrom + clearTo) / 2;
  const from = mid - ((clearTo - clearFrom) / 2) * fill;
  const to = mid + ((clearTo - clearFrom) / 2) * fill;
  let back = shot.minBack + ((shot.nearBack ?? shot.minBack) - shot.minBack) * closer;
  let slide = 0;
  for (;;) {
    let least = -Infinity;
    let most = Infinity;
    for (const { across, along } of knights) {
      const depth = back + along;
      least = Math.max(least, across + shot.reach - to * depth * spread);
      most = Math.min(most, across - shot.reach - from * depth * spread);
    }
    slide = (least + most) / 2;
    if (least <= most || back >= shot.maxBack) break;
    back = Math.min(shot.maxBack, back + 0.1);
  }
  const x = middle[0] + right[0] * slide;
  const z = middle[1] + right[1] * slide;
  return {
    position: [x - look[0] * back, shot.rise + back * shot.risePerBack, z - look[1] * back],
    target: [x, shot.aimHeight + ((shot.nearAim ?? shot.aimHeight) - shot.aimHeight) * closer, z],
    fov,
  };
}

/**
 * The follow camera's aim, turned level about the eye just enough that he stands in the `clear` part of the screen
 * (shares of its width), `reach` either side of him included: where the banner takes more of a narrow screen, he runs
 * further right of it. eye/target: [x, y, z]; hero: [x, z]. Returns the target (the same one if he is already clear).
 */
export function followAim(eye, hero, target, { aspect = FIGHT_SHOT.aspect, clear = FIGHT_SHOT.clear, fov = FIGHT_SHOT.fov, reach = FIGHT_SHOT.reach } = {}) {
  const look = [target[0] - eye[0], target[2] - eye[2]];
  const length = Math.hypot(look[0], look[1]);
  if (length < 1e-6) return target;
  const l = [look[0] / length, look[1] / length];
  const toHero = [hero[0] - eye[0], hero[1] - eye[2]];
  const along = toHero[0] * l[0] + toHero[1] * l[1];
  if (along < 0.5) return target;
  // right of a horizontal look d is (-d.z, d.x); a point shows at (across / along) / spread from the centre
  const across = toHero[0] * -l[1] + toHero[1] * l[0];
  const spread = Math.tan((fov * Math.PI) / 360) * aspect;
  const half = reach / (along * spread);
  const [from, to] = clear.map((share) => share * 2 - 1);
  const at = across / along / spread;
  let want = at;
  if (from + half > to - half) want = (from + to) / 2;
  else if (at < from + half) want = from + half;
  else if (at > to - half) want = to - half;
  if (want === at) return target;
  // turn the look left by the difference (he moves right on screen), about the eye
  const turn = -(Math.atan(want * spread) - Math.atan2(across, along));
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const turned = [l[0] * c - l[1] * s, l[0] * s + l[1] * c];
  return [eye[0] + turned[0] * length, target[1], eye[2] + turned[1] * length];
}

/** Everything in Castleward that could stand between a camera and a fight, as boxes { min: [x, y, z], max }. */
export function castlewardBlockers(world = CASTLEWARD, decor = buildCastlewardDecorPlan()) {
  const boxes = [];
  const box = (x, y, z, sx, sy, sz) => boxes.push({ min: [x - sx / 2, y - sy / 2, z - sz / 2], max: [x + sx / 2, y + sy / 2, z + sz / 2] });
  for (const solid of world.solids) {
    const [x, y, z] = solid.center;
    const [sx, sy, sz] = solid.size;
    const bottom = y - sy / 2;
    if (solid.id === 'market-stall-base') {
      // the stall's awning, on posts well above its counter, sloping out over the green (CastlewardRenderer #stall)
      boxes.push({ min: [x - sx / 2 - 0.2, bottom, z - sz / 2 - 0.35], max: [x + sx / 2 + 0.2, bottom + 2.4, z + sz / 2 + 0.2] });
    } else if (solid.id === 'market-well') {
      box(x, bottom + 1.55, z, 1.9, 3.1, 1.9);             // its posts and little slate roof
    } else if (solid.kind === 'pavilion') {
      // walls to the eaves, a cone to the apex and a pennant on top (kitProps.pavilion): stacked, narrowing boxes
      box(x, bottom + 0.75, z, 3.9, 1.5, 3.9);
      box(x, bottom + 2.05, z, 3.0, 1.1, 3.0);
      box(x, bottom + 3.35, z, 1.6, 1.5, 1.6);
    } else {
      // a brazier's fire burns above its bowl; houses have roofs above their walls
      const above = solid.kind === 'brazier' ? 0.8 : /house/.test(solid.id) ? 1.6 : 0;
      box(x, y + above / 2, z, sx, sy + above, sz);
    }
  }
  // a raised floor (the Bailey, the wall walks) is solid down to the ground, as far as a camera is concerned
  for (const floor of world.floors) {
    if (floor.y >= 1) box(floor.center[0], floor.y / 2, floor.center[2], floor.size[0], floor.y, floor.size[2]);
  }
  for (const tree of decor.trees) box(tree.x, 3, tree.z, 2.6 * tree.scale, 6, 2.6 * tree.scale);
  const tall = { lantern: [0.4, 2.3], pennant: [0.3, 3.4], target: [1.3, 1.8], rack: [1.9, 1.5] };
  for (const prop of world.props ?? []) {
    const [width, height] = tall[prop.kind] ?? [0, 0];
    if (!width) continue;
    const top = prop.height ?? height;
    box(prop.x, top / 2, prop.z, width, top, width);
    // a pennant's cloth flies from the top of its pole, 0.9 m out to the south (CastlewardRenderer, kitProps.pennant)
    if (prop.kind === 'pennant') boxes.push({ min: [prop.x - 0.15, top - 0.6, prop.z - 0.95], max: [prop.x + 0.15, top + 0.1, prop.z + 0.05] });
  }
  return boxes;
}

// does the segment from a to b pass through the box, grown by margin? (slabs)
function crosses(a, b, box, margin) {
  let enter = 0;
  let leave = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    const d = b[axis] - a[axis];
    const lo = box.min[axis] - margin;
    const hi = box.max[axis] + margin;
    if (Math.abs(d) < 1e-9) {
      if (a[axis] < lo || a[axis] > hi) return false;
      continue;
    }
    let near = (lo - a[axis]) / d;
    let far = (hi - a[axis]) / d;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    leave = Math.min(leave, far);
    if (enter > leave) return false;
  }
  return true;
}

// the heights a knight is seen at (hips and shoulders): a low wall at his feet is fine, a brazier in his face is not
const SEEN_AT = [0.75, 1.5];
// and the room the camera keeps from anything at all, so nothing fills the lens
const ELBOW_ROOM = 0.5;

// how far a point is from a box (0 inside it)
function gap(point, box) {
  let sum = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const d = Math.max(box.min[axis] - point[axis], 0, point[axis] - box.max[axis]);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Is the camera at `eye` ([x, y, z]) kept from seeing a knight standing at [x, z]: something in between, or something
 * right up against the lens?
 */
export function blocked(eye, at, blockers, margin = 0.2) {
  if (blockers.some((box) => gap(eye, box) < ELBOW_ROOM + margin - 0.2)) return true;
  return SEEN_AT.some((y) => blockers.some((box) => box.max[1] > 0.6 && crosses(eye, [at[0], y, at[1]], box, margin)));
}

// ------------------------------------------------------------------------------------------------ on the run
// Following him on the run: from behind and to his left, so he runs on the right of the frame; where that would put
// the camera in a stall's awning, a gatepost or a hedge, it comes in closer and higher over his shoulder instead.
export const FOLLOW_SETTINGS = Object.freeze([
  Object.freeze({ back: 5.4, side: 2.4, up: 2.2 }),
  Object.freeze({ back: 5.0, side: 1.6, up: 2.7 }),
  Object.freeze({ back: 4.4, side: 1.0, up: 3.3 }),
  Object.freeze({ back: 3.8, side: 0.5, up: 3.8 }),
  Object.freeze({ back: 3.2, side: 0.2, up: 4.2 }),
  Object.freeze({ back: 2.6, side: 0, up: 4.4 }),
]);

/** Where the follow camera stands for him at a point of the path ({ x, z, dir }), with a setting: [x, y, z]. */
export function followEye(here, { back, side, up }) {
  const [fx, fz] = here.dir;
  return [here.x - fx * back + fz * side, up, here.z - fz * back - fx * side];
}

/**
 * The follow camera's setting all the way round the path, worked out once: every quarter metre, the first setting that
 * sees him clearly from inside the walls (planned with a wider `margin` than a sightline needs); each careful stretch
 * begins `early` and eases in and out over `ease` metres, so the camera glides into it. Returns
 * { at(distance) → { back, side, up } }.
 */
export function followPlan(path, blockers, { settings = FOLLOW_SETTINGS, margin = 0.25, early = 2, ease = 2 } = {}) {
  const step = 0.25;
  const count = Math.ceil(path.length / step);
  const wrap = (i) => ((i % count) + count) % count;
  const pick = [];
  for (let i = 0; i < count; i += 1) {
    const here = path.at(i * step);
    const clear = settings.findIndex((setting) => {
      const eye = followEye(here, setting);
      return insideCastlewardFootprint(eye[0], eye[2], -0.3) && !blocked(eye, [here.x, here.z], blockers, margin);
    });
    pick.push(clear < 0 ? settings.length - 1 : clear);
  }
  // the most careful setting within `early` metres either way, then blurred over `ease` metres either way
  const reach = Math.round(early / step);
  const careful = pick.map((_, i) => Math.max(...Array.from({ length: 2 * reach + 1 }, (__, k) => pick[wrap(i + k - reach)])));
  const blur = Math.round(ease / step);
  const smooth = careful.map((_, i) => {
    const sum = { back: 0, side: 0, up: 0 };
    for (let k = -blur; k <= blur; k += 1) {
      const setting = settings[careful[wrap(i + k)]];
      sum.back += setting.back; sum.side += setting.side; sum.up += setting.up;
    }
    const n = 2 * blur + 1;
    return { back: sum.back / n, side: sum.side / n, up: sum.up / n };
  });
  return {
    at(distance) {
      const f = ((distance % path.length) + path.length) % path.length / step;
      const i = Math.floor(f);
      const a = smooth[wrap(i)];
      const b = smooth[wrap(i + 1)];
      const t = f - i;
      return { back: a.back + (b.back - a.back) * t, side: a.side + (b.side - a.side) * t, up: a.up + (b.up - a.up) * t };
    },
  };
}

// the screens a fight is checked on: an old 4:3 monitor, a wide one, and a phone on its side with a wider banner
const CHECKED_ON = [{ aspect: 4 / 3 }, { aspect: 16 / 9 }, { aspect: 2.16, clear: [0.45, 0.96] }];

/** How many moments of a fight (every 0.15 s) the camera, turned by `swing`, cannot see a knight. */
export function blockedMoments(fight, frame, swing, blockers, shot = FIGHT_SHOT) {
  const look = lookFor(frame, swing);
  let count = 0;
  for (let t = -0.4; t <= fight.duration; t += 0.15) {
    const { hero, rival, rivalHere, held, near } = fightPair(fight, frame, t + shot.lead);
    const inShot = rivalHere && held > 0.5 && Math.hypot(rival[0] - hero[0], rival[1] - hero[1]) <= shot.maxSpread;
    const hidden = CHECKED_ON.some((screen) => {
      const { position } = fightShot(hero, rival, look, { ...screen, held, near }, shot);
      return blocked(position, hero, blockers) || (inShot && blocked(position, rival, blockers));
    });
    if (hidden) count += 1;
  }
  return count;
}

/**
 * The turn nearest the fight's own preference (its `shot.swing`, or side on) that keeps it in clear view the whole way
 * (or the clearest one, if none is).
 */
export function chooseSwing(fight, frame, blockers, shot = FIGHT_SHOT) {
  const prefer = fight.shot?.swing ?? 0;
  const order = [prefer, ...[...shot.swings].sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer))];
  let best = { swing: prefer, count: Infinity };
  for (const swing of order) {
    const count = blockedMoments(fight, frame, swing, blockers, shot);
    if (count === 0) return swing;
    if (count < best.count) best = { swing, count };
  }
  return best.swing;
}

// how far a solid's footprint is from a point (0 inside)
function footGap(x, z, solid) {
  return Math.hypot(
    Math.max(0, Math.abs(x - solid.center[0]) - solid.size[0] / 2),
    Math.max(0, Math.abs(z - solid.center[2]) - solid.size[2] / 2),
  );
}

/**
 * Whether a fight has room where its frame puts it: the rival's place clear by a sword's swing, and wherever the
 * fight takes either knight (a leap back, a walk away, a run for it), on open ground and clear of anything standing.
 */
export function fightFits(fight, frame, world = CASTLEWARD) {
  const low = world.solids.filter((solid) => solid.center[1] - solid.size[1] / 2 <= 1.8);
  const clear = ([x, z], room) => low.every((solid) => footGap(x, z, solid) > room) && insideCastlewardFootprint(x, z, -0.6);
  if (!clear(placeOnFrame(frame, { u: fight.reach }), 1.1)) return false;
  for (let t = -1; t <= fight.duration; t += 0.1) {
    const { hero, rival, rivalHere } = fightPair(fight, frame, t);
    if (!clear(hero, 0.45) || (rivalHere && !clear(rival, 0.45))) return false;
  }
  return true;
}

/**
 * Where on the round a fight can happen at the path `distance`: the side of the path its rival stands (its own
 * preference first) and the turn of its camera, as { fight (placed on that side), frame, swing }; null if neither
 * side has room or a clear view. Fights are interchangeable between the round's stops as long as this finds one.
 */
export function placeFight(path, fight, distance, blockers, world = CASTLEWARD) {
  const preferred = fight.side ?? 1;
  for (const side of [preferred, -preferred]) {
    const placed = { ...fight, side };
    const frame = fightFrame(path, placed, distance);
    if (!fightFits(placed, frame, world)) continue;
    const swing = chooseSwing(placed, frame, blockers);
    if (blockedMoments(placed, frame, swing, blockers) > 0) continue;
    return { fight: placed, frame, swing };
  }
  return null;
}
