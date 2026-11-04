// The Spellblade's personality, in battle as much as out of it: gestures drawn with whatever parts of his body the
// fight and his machine leave him.
//
// Nothing here is a prohibition on fighting. Each thing the knight does claims the parts of the body it needs, and only
// those (bodyClaims): a sword stroke takes both arms, the trunk and the head; a Guard both arms; driving the ballista
// the left hand, laying and loosing it the right; the Fight-and-Flight's controls both hands, its dash and dive the
// legs and trunk as well. A gesture names the regions it must have and the ones it would like (GESTURES):
// - it starts only where its required regions are not claimed outright, so it is drawn alongside the fight, the
//   pursuit or the machine's work: shading his eyes with his free hand while the ballista looses, thumping the ram's
//   casing while its fist goes out, an L-sit while his hands fly the machine;
// - a region it only likes is given back the moment something claims it, and taken again when free;
// - a region it must have, once claimed, ends it: the whole gesture gives the body back over FADE_OUT and does not
//   resume. So the player never waits on one, and never loses control because the knight has decided to yawn;
// - a critical moment (death, a hard hit, a stagger, ejection, an ultimate, a dash) ends every gesture at once.
// None of it touches input, the camera, a machine, the knight's speed or any timing: it only draws the body.
//
// Two kinds of gesture:
// - incidental ones (a look round, a yawn, a glance at the machine, shading his eyes, frustration with the machine, an
//   L-sit) are scheduled, not sent. Each knight's time is cut into slots of SLOT seconds and each slot draws from a
//   generator seeded by his id and the slot, from the pool of the place he is in (on foot, or which machine), so every
//   observer sees the same knight make the same gesture at the same moment. A slot after one that fired rests, and a
//   slot does not repeat the gesture drawn two slots before;
// - reactions answer something that happened, from an event or an authoritative timestamp every observer has: a nod
//   for a kill (the death event), an appraisal when one ballista bolt runs through two knights (its impact events),
//   two thumps on the ram's casing as its fist goes out (the ram's strike time), timed to the piston's release.
//   Whether a reaction plays is drawn from the event itself (the bolt, the strike), so observers agree on that too.

export const SLOT = 7.5;               // seconds per scheduling slot
export const FADE_OUT = 0.14;          // seconds to give the body back when a required region is claimed
export const REGION_EASE = 0.12;       // seconds for an optional region to be taken again once free
export const JOIN = 0.3;               // a scheduled gesture starts only within this of its time (never joined late)
export const NOD_WAIT = 2.5;           // seconds a kill's nod may wait for the head to be free
export const APPRAISE_WAIT = 1.5;      // seconds an appraisal may wait for the head
export const APPRAISE_CHANCE = 0.65;   // the share of two-knight bolts he stops to admire
export const THUMP_CHANCE = 0.4;       // the share of the ram's strikes he thumps along with
export const THUMP_REST = 6;           // seconds after a thump before another (he is pleased, not a metronome)
export const THUMP_JOIN = 0.2;         // a thump seen late (latency) joins up to this far in, still on the piston's beat

import { soFistTiming } from '../../shared/sim/soFistGeometry.mjs';

const DEG = Math.PI / 180;

export const REGIONS = Object.freeze(['head', 'torso', 'armL', 'armR', 'legs']);
export const FREE = 0;
export const SOFT = 1;      // held by something a gesture may take over (a hand resting on a grip, an arm's swing)
export const HARD = 2;      // needed by what the knight is doing: no gesture may have it

/** The region a bone belongs to, for a gesture's turns. */
export function regionOf(bone) {
  if (/^(neck|head)/.test(bone)) return 'head';
  if (/^(spine|chest|clavicle|pelvis)/.test(bone)) return 'torso';
  if (/^(thigh|shin|foot|knee)/.test(bone)) return 'legs';
  if (/\.L$/.test(bone)) return 'armL';
  if (/\.R$/.test(bone)) return 'armR';
  return 'torso';
}

// the arms a gesture moves (third-person rig, root space): each hand bone's own y runs along its fingers and its z out
// of its palm (rodin/hands.py); the elbows hang out and down
export const GESTURE_ARMS = Object.freeze({
  L: Object.freeze({ shoulder: 'upper_arm.L', elbow: 'forearm.L', wrist: 'hand.L', grip: 'hand.L',
    aim: Object.freeze([0, 1, 0]), roll: Object.freeze([0, 0, 1]), pole: Object.freeze([-0.6, -0.7, 0.35]), exactRoll: true }),
  R: Object.freeze({ shoulder: 'upper_arm.R', elbow: 'forearm.R', wrist: 'hand.R', grip: 'hand.R',
    aim: Object.freeze([0, 1, 0]), roll: Object.freeze([0, 0, 1]), pole: Object.freeze([0.6, -0.7, 0.35]), exactRoll: true }),
});
// from the wrist to the middle of the palm (metres)
export const PALM_REACH = 0.075;

/**
 * What the knight's actions and his machine hold of his body this frame: { claims: { region: FREE | SOFT | HARD },
 * critical }. c: his context (RemotePlayers' gesture context). Critical: something that must have the whole body at
 * once (death, a hard hit, a stagger, ejection, an ultimate, a dash, his machine struck): every gesture ends.
 */
export function bodyClaims(c) {
  const claims = { head: FREE, torso: FREE, armL: FREE, armR: FREE, legs: FREE };
  const take = (level, ...regions) => { for (const r of regions) claims[r] = Math.max(claims[r], level); };
  const critical = Boolean(c.dead || c.struck || c.staggered || c.ejecting || c.ultimate || c.dashing || c.machineStruck);
  if (critical) {
    take(HARD, ...REGIONS);
    return { claims, critical: true };
  }
  // the fight: a stroke wants both hands, the trunk and the eyes on its mark; a Guard both arms (the head is his own:
  // a knight who looks away behind his guard is a confident one); a spell the throwing hand, trunk and eyes
  if (c.attacking) take(HARD, 'armL', 'armR', 'torso', 'head');
  if (c.guarding) { take(HARD, 'armL', 'armR'); take(SOFT, 'torso'); }
  if (c.casting) take(HARD, 'armL', 'torso', 'head');
  switch (c.machine) {
    case 'ballista':
      // seated; the left hand steers, the right lays the bolt on the traverse wheel and looses it with the lever
      take(HARD, 'legs');
      take(SOFT, 'armL', 'armR', 'torso');
      if (c.steering) take(HARD, 'armL');
      if (c.aiming) take(HARD, 'armR');
      break;
    case 'ram':
      // braced on its platform, both hands on the handlebars (the fist is sent from them); the left steers
      take(HARD, 'legs');
      take(SOFT, 'armL', 'armR', 'torso');
      if (c.steering) take(HARD, 'armL');
      break;
    case 'flight':
      // both hands on the controls (the repeater's grip and the sword), always; the legs hang in the harness, free,
      // unless the machine is dashing, diving, taking off, landing or struck, when they brace with the trunk
      take(HARD, 'armL', 'armR');
      take(SOFT, 'legs', 'torso');
      if (c.flightIntense) take(HARD, 'legs', 'torso');
      break;
    default:
      // on foot: moving, the legs are the gait's and the arms swing; in the air, the legs are the jump's
      if (c.moving || c.airborne) take(HARD, 'legs');
      if (c.moving) take(SOFT, 'armL', 'armR', 'torso');
  }
  return { claims, critical: false };
}

// The pools, by where the knight is (which is authoritative and changes rarely, so observers draw from the same pool):
// each gesture's share of a slot's draw. Within a pool the draw ignores what he is doing that moment; whether it shows
// is then the body's affair (bodyClaims) and `when` (also from authoritative state).
export const POOLS = Object.freeze({
  foot: Object.freeze({ look: 3, yawn: 1.2 }),
  ballista: Object.freeze({ look: 2, glance: 2, shade: 1.6, frustration: 1, yawn: 0.5 }),
  ram: Object.freeze({ look: 2, glance: 2, frustration: 1.2, yawn: 0.4 }),
  flight: Object.freeze({ look: 2, glance: 1.4, lsit: 1.6 }),
});
export const poolOf = (c) => c.machine ?? 'foot';

// what each gesture needs: how long it lasts, the regions it must have and the ones it would like, any extra condition
// for it to start, and a weighting of its share by the machine's state (authoritative)
export const GESTURES = Object.freeze({
  look: Object.freeze({ seconds: 2.2, needs: ['head'], likes: ['torso'] }),
  glance: Object.freeze({ seconds: 1.9, needs: ['head'], likes: [] }),
  yawn: Object.freeze({ seconds: 2.7, needs: ['armL'], likes: ['head', 'torso'], when: (c) => !c.sprinting && !c.airborne }),
  frustration: Object.freeze({ seconds: 2.9, needs: ['armR'], likes: ['head'],
    // (more likely while the machine makes him wait)
    bias: (c) => (c.machineReloading ? 3 : 1) }),
  shade: Object.freeze({ seconds: 3.2, needs: ['armL'], likes: ['head'] }),
  lsit: Object.freeze({ seconds: 3.4, needs: ['legs'], likes: [], when: (c) => Boolean(c.airborne) }),
  // reactions (never drawn: an event starts them)
  nod: Object.freeze({ seconds: 1.0, needs: ['head'], likes: ['torso'], reaction: true }),
  appraise: Object.freeze({ seconds: 2.7, needs: ['head'], likes: ['torso'], reaction: true }),
  thump: Object.freeze({ seconds: 1.2, needs: ['armR'], likes: ['head'], reaction: true }),
});

/** The chance that a slot holds a gesture. */
export function slotChance(c) {
  return c.dead ? 0 : c.machine ? 0.42 : 0.4;
}

// a small seeded generator (mulberry32) and a string hash (FNV-1a), so every client draws the same numbers
export function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A number in 0..1 drawn from a key alone: the same for every observer. */
export const drawn = (key) => seeded(hash(String(key)))();

// a slot's own draw, before the rests and repeats between slots: { kind, at, seconds, side, variant } or null
function drawSlot(id, s, c, avoid = null) {
  const draw = seeded(hash(`${id}:${s}`));
  if (draw() >= slotChance(c)) return null;
  const pickAt = draw();
  const pool = Object.entries(POOLS[poolOf(c)] ?? POOLS.foot).map(([kind, w]) => [kind, w * (GESTURES[kind].bias?.(c) ?? 1)]);
  const total = pool.reduce((sum, [, w]) => sum + w, 0);
  let pick = pickAt * total;
  let index = pool.findIndex(([, w]) => (pick -= w) < 0);
  if (index < 0) index = pool.length - 1;
  // never the same gesture as the slot before last (the next one along instead)
  if (avoid && pool[index][0] === avoid && pool.length > 1) index = (index + 1) % pool.length;
  const kind = pool[index][0];
  const g = GESTURES[kind];
  const at = s * SLOT + draw() * Math.max(0.5, SLOT - g.seconds);
  return { kind, at, seconds: g.seconds, side: draw() < 0.5 ? -1 : 1, variant: draw(), slot: s };
}

/** The gesture a slot holds for this knight where he is, after the rests and repeats, or null. */
export function slotGesture(id, s, c) {
  // a slot after one that held a gesture rests
  if (drawSlot(id, s - 1, c)) return null;
  return drawSlot(id, s, c, drawSlot(id, s - 2, c)?.kind ?? null);
}

/**
 * The scheduled gesture under way at `now` (server seconds) for this knight where he is, or null:
 * { kind, at (its start), age, seconds, side (-1 / 1), variant (0..1) }.
 */
export function scheduledGesture(id, now, c) {
  if (!Number.isFinite(now)) return null;
  const slot = Math.floor(now / SLOT);
  // (a gesture may run on past the end of its slot)
  for (const s of [slot, slot - 1]) {
    const g = slotGesture(id, s, c);
    if (!g) continue;
    const age = now - g.at;
    if (age >= 0 && age <= g.seconds) return { ...g, age };
  }
  return null;
}

/** May a gesture of this kind start now, by the body's claims and its own condition? */
export function canStart(kind, c, claims = bodyClaims(c).claims) {
  const g = GESTURES[kind];
  if (!g || c.dead) return false;
  if (g.needs.some((r) => claims[r] === HARD)) return false;
  return g.when ? Boolean(g.when(c)) : true;
}

const smooth = (t) => { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); };
/** How much of a gesture shows at `age` of `seconds`: in over `rise`, out over `fall`. */
export function envelope(age, seconds, rise = 0.35, fall = 0.4) {
  if (!(age >= 0) || age > seconds) return 0;
  return Math.min(smooth(age / rise), smooth((seconds - age) / fall));
}
// a hump from 0 up to 1 and back over [a, b]
const hump = (t, a, b) => (t > a && t < b ? Math.sin(((t - a) / (b - a)) * Math.PI) : 0);

/**
 * The ram's thump: when its two blows land, from the strike's start (seconds). The second meets the piston's release
 * (`release`, as soFistTiming gives it) when there is time for one before it; when the fist goes out at once (a Beat
 * to the Punch counter), the first meets the release and the second the fist's flight.
 */
export function thumpBeats(release) {
  const r = Number.isFinite(release) ? release : 0.68;
  return r >= 0.5 ? [r - 0.34, r] : [r, r + 0.32];
}

/**
 * A gesture's pose at its age, in the knight's own frame (+x his right, +y up, -z ahead):
 * - turns: [{ bone, axis, angle }] root-space turns added to the pose (at full strength: scale by weight);
 * - hand: { side, at, aim, palm, open, frame }: a hand's palm centre, relative to the head bone, its fingers along `aim`
 *   and its palm facing `palm`; `open`: the fingers straightened out of whatever grip they had (flat, to shade the eyes);
 *   frame 'head': all three in the head's frame (the hand turns with the helmet), else the knight's;
 * - strike: { side, reach, lift }: the fist taken `reach` (0..1) of the way from where its machine holds it to the
 *   machine's casing (the animator has the casing from the machine's pose), raised `lift` metres above that line; at
 *   reach 1 and lift 0 it is on the casing;
 * - legs: { lift, dir: { L, R }, knee: { L, R } }: the L-sit: each leg straightened and laid along `dir` (root space) by
 *   `lift` (0..1), then its knee bent `knee` radians (a kick);
 * - weight: 0..1, through the gesture's envelope.
 * data: a reaction's own facts (the appraisal's bearing, the thump's beats).
 */
export function gesturePose(g) {
  const { kind, age, seconds, side = 1, variant = 0, data = null } = g;
  const w = envelope(age, seconds);
  const p = Math.max(0, Math.min(1, age / seconds));
  const turns = [];
  // (positive pitch: the face up; positive yaw: to his left)
  const head = (pitch, yaw, roll = 0) => {
    if (yaw) turns.push({ bone: 'neck', axis: [0, 1, 0], angle: yaw * 0.35 }, { bone: 'head', axis: [0, 1, 0], angle: yaw * 0.65 });
    if (pitch) turns.push({ bone: 'neck', axis: [1, 0, 0], angle: pitch * 0.3 }, { bone: 'head', axis: [1, 0, 0], angle: pitch * 0.7 });
    if (roll) turns.push({ bone: 'head', axis: [0, 0, 1], angle: roll });
  };
  switch (kind) {
    case 'look': {
      // the helmet turns to one side and back, the chest a little with it; now and then a second, smaller look the
      // other way before it settles
      const twice = variant > 0.6;
      const a = twice ? Math.sin(Math.min(1, p / 0.55) * Math.PI) : Math.sin(p * Math.PI);
      const b = twice && p > 0.55 ? Math.sin(((p - 0.55) / 0.45) * Math.PI) * -0.55 : 0;
      const yaw = side * (30 + 18 * variant) * DEG * (a + b);
      head(4 * DEG * a, yaw);
      turns.push({ bone: 'chest', axis: [0, 1, 0], angle: yaw * 0.2 });
      return { turns, weight: w };
    }
    case 'glance': {
      // down at the machine and a little to one side, and back up
      const a = Math.sin(p * Math.PI);
      head(-26 * DEG * a, side * 14 * DEG * a);
      return { turns, weight: w };
    }
    case 'nod': {
      // two short dips of the helmet, the second smaller, and the chest lifting: a knight pleased with his work
      const first = p < 0.45 ? Math.sin((p / 0.45) * Math.PI) : 0;
      const second = p >= 0.45 && p < 0.85 ? 0.55 * Math.sin(((p - 0.45) / 0.4) * Math.PI) : 0;
      head(-14 * DEG * (first + second), 0);
      turns.push({ bone: 'chest', axis: [1, 0, 0], angle: 4 * DEG * Math.sin(p * Math.PI) });
      return { turns, weight: envelope(age, seconds, 0.1, 0.2) };
    }
    case 'appraise': {
      // the bolt through two of them: he looks out where it went (data.bearing, radians to his left), and along the
      // line it cut, the chest turning with him and lifting; then one slow, satisfied nod, and back to the machine
      const bearing = Math.max(-65 * DEG, Math.min(65 * DEG, data?.bearing ?? 0));
      const out = smooth(age / 0.45) * (1 - smooth((age - 1.9) / 0.6));
      // (past the bearing a little and back, as one following a bolt's path)
      const along = hump(age, 0.45, 1.4) * Math.sign(bearing || side) * 9 * DEG;
      const yaw = (bearing + along) * out;
      const nodAt = 1.4;
      const nod = hump(age, nodAt, nodAt + 0.55) + 0.4 * hump(age, nodAt + 0.55, nodAt + 0.9);
      head(5 * DEG * out - 15 * DEG * nod, yaw);
      turns.push({ bone: 'chest', axis: [0, 1, 0], angle: yaw * 0.25 }, { bone: 'chest', axis: [1, 0, 0], angle: 5 * DEG * out });
      return { turns, weight: envelope(age, seconds, 0.2, 0.45) };
    }
    case 'yawn': {
      // the gauntlet up over the visor's mouth, the helmet tipped back and the shoulders up; then a weary settle
      const lift = Math.sin(Math.min(1, p / 0.75) * Math.PI);
      const settle = smooth((p - 0.7) / 0.3) * (1 - smooth((p - 0.9) / 0.1));
      head(18 * DEG * lift - 6 * DEG * settle, 0, side * 4 * DEG * lift);
      turns.push({ bone: 'chest', axis: [1, 0, 0], angle: 5 * DEG * lift });
      turns.push({ bone: 'clavicle.L', axis: [0, 0, 1], angle: -7 * DEG * lift }, { bone: 'clavicle.R', axis: [0, 0, 1], angle: 7 * DEG * lift });
      return { turns, hand: { side: 'L', at: [0.05, -0.01, -0.22], aim: [0.75, 0.62, 0.05], palm: [0, -0.1, 1] }, weight: w };
    }
    case 'shade': {
      // a hand flat at the brow, palm down, its edge just above the visor's slit, and a slow scan of the horizon under
      // it: out to one side, across, and back
      const scan = Math.sin(p * Math.PI * 2) * 0.55 + (p - 0.5) * 0.35;
      head(4 * DEG, side * 26 * DEG * scan);
      // (in the head's frame: the palm 3 cm before the brow, just over the eye slit, which is the top of the visor's T;
      // the helmet's front is 28 cm before the head bone, the slit 7 to 11 cm above it)
      return { turns, hand: { side: 'L', frame: 'head', at: [0.03, 0.16, -0.33], aim: [0.92, 0.05, -0.38], palm: [0, -1, 0.2], open: true }, weight: envelope(age, seconds, 0.35, 0.45) };
    }
    case 'frustration': {
      // a shake of the helmet, a look down at the machine, two blows of the fist on its casing, and back to work
      const shake = p < 0.32 ? Math.sin((p / 0.32) * Math.PI * 4) * Math.sin((p / 0.32) * Math.PI) : 0;
      const down = smooth((p - 0.25) / 0.15) * (1 - smooth((p - 0.85) / 0.15));
      head(-24 * DEG * down, 14 * DEG * shake);
      // over the casing, then up off it and down on it, twice (each blow lands where `lift` comes back to 0)
      const t = age;
      const reach = smooth((t - 0.75) / 0.35) * (1 - smooth((t - 2.25) / 0.4));
      const lift = 0.28 * (hump(t, 0.95, 1.4) + hump(t, 1.4, 1.85)) + 0.16 * smooth((t - 0.75) / 0.2) * (1 - smooth((t - 0.95) / 0.1));
      return { turns, strike: { side: 'R', reach, lift }, weight: w };
    }
    case 'thump': {
      // the ram's fist goes out, and he helps it: the fist off the handlebar, up, down on the casing; up, and down again
      // as the piston lets go; his helmet down at the casing, and up after the fist as it flies
      const [b1, b2] = data?.beats ?? thumpBeats(0.68);
      const t = age;
      const reach = smooth((t - (b1 - 0.3)) / 0.18) * (1 - smooth((t - (b2 + 0.12)) / 0.3));
      const lift = 0.24 * smooth((t - (b1 - 0.3)) / 0.12) * (1 - smooth((t - (b1 - 0.12)) / 0.12)) + 0.3 * hump(t, b1, b2);
      const down = smooth((t - (b1 - 0.35)) / 0.2) * (1 - smooth((t - b2) / 0.15));
      const after = smooth((t - b2) / 0.15) * (1 - smooth((t - (b2 + 0.35)) / 0.3));
      head(-20 * DEG * down + 8 * DEG * after, 0);
      return { turns, strike: { side: 'R', reach, lift }, weight: envelope(age, seconds, 0.12, 0.3) };
    }
    case 'lsit': {
      // both legs up level before him in the harness, held a moment and swung a little, as a boy's from a wall, and
      // down again: delight, in plate. Laid along a line (not turned by an angle from wherever the harness had them),
      // so the L is level whatever the riding pose; splayed a touch, either side of the machine's front
      const up = smooth(age / 0.55) * (1 - smooth((age - (seconds - 0.6)) / 0.6));
      const swing = smooth((age - 0.45) / 0.5) * (1 - smooth((age - (seconds - 0.8)) / 0.4));
      const rate = 2 * Math.PI * (1.05 + 0.2 * variant);
      const leg = (s, phase) => {
        const kick = Math.sin(rate * age + phase);
        const pitch = (-3 + 6 * kick * swing) * DEG;          // (positive: the toes up)
        const splay = s * (7 + 2 * variant) * DEG;
        return { dir: [Math.sin(splay), Math.sin(pitch), -Math.cos(splay) * Math.cos(pitch)], knee: Math.max(0, -kick) * 26 * DEG * swing };
      };
      const L = leg(-1, 0);
      const R = leg(1, Math.PI * (0.85 + 0.3 * variant));
      return { turns, legs: { lift: up, dir: { L: L.dir, R: R.dir }, knee: { L: L.knee, R: R.knee } }, weight: envelope(age, seconds, 0.2, 0.3) };
    }
    default:
      return { turns, weight: 0 };
  }
}

/**
 * One knight's gestures: which are under way, how much of each region each one has, the reactions waiting for the
 * body. `update` returns this frame's poses (gesturePose, each turn scaled by its region's share, and the weight of its
 * hand, strike or legs by theirs), or an empty list.
 */
export class GestureLayer {
  constructor() {
    this.active = [];          // { kind, at, seconds, side, variant, data, regions: { region: 0..1 }, fading, scheduled, pool }
    this.pending = [];         // reactions waiting: { kind, at, until, data, side, exact }
    this.lastStarted = null;   // the scheduled gesture last started (its start time)
    this.seen = new Set();     // reactions already answered (by their key)
    this.lastThumpAt = -Infinity;
    this.lastAt = null;
  }

  #remember(key) {
    this.seen.add(key);
    if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value);
  }

  // a reaction waiting for the body until `until`
  #react(reaction) {
    this.pending = [...this.pending.filter((r) => r.kind !== reaction.kind), reaction];
    return true;
  }

  /** A kill: the nod waits (up to NOD_WAIT) for the head to be free of the strike that won it. */
  nod(at) {
    if (!Number.isFinite(at) || this.seen.has(`nod:${at}`)) return false;
    this.#remember(`nod:${at}`);
    return this.#react({ kind: 'nod', at, until: at + NOD_WAIT, side: 1 });
  }

  /**
   * One of his ballista bolts through a second knight: now and then (drawn from the bolt, the same for every observer)
   * he stops to admire it. bearing: where it went, radians to his left of where he faces.
   */
  appraise(at, key, bearing = 0) {
    if (!Number.isFinite(at) || this.seen.has(`appraise:${key}`)) return false;
    this.#remember(`appraise:${key}`);
    if (drawn(`appraise:${key}`) >= APPRAISE_CHANCE) return false;
    return this.#react({ kind: 'appraise', at: at + 0.2, until: at + 0.2 + APPRAISE_WAIT, data: { bearing }, side: bearing >= 0 ? 1 : -1 });
  }

  /**
   * The ram's fist sent out at `strikeAt` (its authoritative time, shifted by how far behind the machine is drawn),
   * released `release` seconds later: now and then (drawn from the strike) he thumps the casing along with it, the
   * second blow on the piston's release.
   */
  thump(strikeAt, key, release) {
    if (!Number.isFinite(strikeAt) || this.seen.has(`thump:${key}`)) return false;
    this.#remember(`thump:${key}`);
    if (strikeAt - this.lastThumpAt < THUMP_REST || drawn(`thump:${key}`) >= THUMP_CHANCE) return false;
    const beats = thumpBeats(release);
    // (the gesture starts as the fist leaves the handlebar, so the first blow lands on its beat)
    const at = strikeAt + Math.max(0, beats[0] - 0.32);
    const shift = at - strikeAt;
    this.lastThumpAt = strikeAt;
    return this.#react({ kind: 'thump', at, until: at + THUMP_JOIN, exact: true, data: { beats: beats.map((b) => b - shift) }, side: 1 });
  }

  // a gesture starting: anything using a region it must have gives way; it takes its regions at once (its envelope
  // eases it in)
  #start(g, now, claims) {
    const spec = GESTURES[g.kind];
    // (one that only likes such a region lends it, and goes on: a hand stays at the brow while the head appraises)
    for (const a of this.active) {
      if (!a.fading && GESTURES[a.kind].needs.some((r) => spec.needs.includes(r))) a.fading = { at: now };
    }
    const regions = {};
    for (const r of [...spec.needs, ...spec.likes]) regions[r] = claims[r] === HARD ? 0 : 1;
    this.active.push({ kind: g.kind, at: g.at, seconds: g.seconds ?? spec.seconds, side: g.side ?? 1, variant: g.variant ?? 0,
      data: g.data ?? null, regions, fading: null, scheduled: Boolean(g.scheduled), pool: g.pool ?? null });
  }

  // is a region in use by an active gesture that needs it?
  #busy(regions, { reactionsOnly = false } = {}) {
    return this.active.some((a) => !a.fading && (!reactionsOnly || !a.scheduled) && GESTURES[a.kind].needs.some((r) => regions.includes(r)));
  }

  update(id, now, c) {
    if (!Number.isFinite(now)) return [];
    const dt = this.lastAt === null ? 0 : Math.max(0, Math.min(0.25, now - this.lastAt));
    this.lastAt = now;
    if (c.dead) { this.active = []; this.pending = []; return []; }
    const { claims, critical } = bodyClaims(c);
    if (critical) this.pending = [];
    // the ram's fist going out (its authoritative strike time, from the snapshot): perhaps a thump along with it
    if (c.machine === 'ram' && Number.isFinite(c.ramStrikeAt)) this.thump(c.ramStrikeAt + (c.machineLag ?? 0), c.ramStrikeKey, c.ramRelease);
    // finished ones go
    this.active = this.active.filter((a) => now - a.at <= a.seconds);
    // something claims what a gesture must have (or everything wants the body), or he left the place it belongs to: it
    // gives the body back, and does not resume
    for (const a of this.active) {
      const spec = GESTURES[a.kind];
      const lost = critical || spec.needs.some((r) => claims[r] === HARD) || (a.pool && a.pool !== poolOf(c));
      if (lost && !a.fading) a.fading = { at: now };
    }
    // reactions, once the body is free for them (they outrank what is only incidental)
    const waiting = [];
    for (const r of this.pending) {
      if (now > r.until) continue;
      if (now < r.at) { waiting.push(r); continue; }
      if (canStart(r.kind, c, claims) && !this.#busy(GESTURES[r.kind].needs, { reactionsOnly: true })) {
        this.#start({ ...r, at: r.exact ? r.at : now }, now, claims);
      } else waiting.push(r);
    }
    this.pending = waiting;
    // the scheduled one, joined only at its start, where its regions are free
    if (!critical) {
      const g = scheduledGesture(id, now, c);
      if (g && g.age <= JOIN && g.at !== this.lastStarted && canStart(g.kind, c, claims)
        && !this.#busy([...GESTURES[g.kind].needs, ...GESTURES[g.kind].likes])) {
        this.lastStarted = g.at;
        this.#start({ ...g, scheduled: true, pool: poolOf(c) }, now, claims);
      }
    }
    // each region a gesture only likes: given back while something claims it (an action, or another gesture that needs
    // it), taken again when free
    const step = dt / REGION_EASE;
    const poses = [];
    const kept = [];
    const needed = (r, self) => this.active.some((o) => o !== self && !o.fading && GESTURES[o.kind].needs.includes(r));
    for (const a of this.active) {
      let fade = 1;
      if (a.fading) {
        fade = 1 - (now - a.fading.at) / FADE_OUT;
        if (fade <= 0) continue;
      }
      kept.push(a);
      const spec = GESTURES[a.kind];
      for (const r of spec.likes) {
        const want = claims[r] === HARD || needed(r, a) ? 0 : 1;
        // (given back twice as fast as it is taken)
        a.regions[r] = want > a.regions[r] ? Math.min(want, a.regions[r] + step) : Math.max(want, a.regions[r] - step * 2);
      }
      const pose = gesturePose({ ...a, age: now - a.at });
      const weight = pose.weight * fade;
      if (weight <= 1e-3) continue;
      const share = (region) => (spec.needs.includes(region) ? 1 : a.regions[region] ?? 0);
      pose.turns = pose.turns.map((t) => ({ ...t, angle: t.angle * share(regionOf(t.bone)) })).filter((t) => Math.abs(t.angle) > 1e-5);
      pose.weight = weight;
      pose.kind = a.kind;
      poses.push(pose);
    }
    this.active = kept;
    return poses;
  }
}

// how long a Fight-and-Flight's body work lasts after each of these (seconds)
const FLIGHT_BUSY = Object.freeze({ dash: 1.4, impact: 1.6, takeoff: 1.2, landing: 1.0 });

/**
 * Is a Fight-and-Flight doing something its rider braces his legs and trunk for (a dash, a dive, the rotor's skill, an
 * offensive run, an impact, taking off or landing)? Ordinary flight, pursuit and firing are not.
 */
export function flightIntense(m, now) {
  if (!m) return false;
  if (!['AIRBORNE', 'GROUNDED'].includes(m.mode)) return true;           // taking off, landing, falling, diving, destroyed
  if (m.terminalDive || m.terminalPrep || m.offensiveRun || m.emergencyBrakeActive) return true;
  if (m.skill && m.skill.phase && m.skill.phase !== 'idle') return true;
  if (Number.isFinite(m.ejectHoldStartedAt)) return true;
  const since = (at) => (Number.isFinite(at) ? now - at : Infinity);
  if (since(m.flightDashStartedAt) < FLIGHT_BUSY.dash || since(m.runReleasedAt) < FLIGHT_BUSY.dash) return true;
  if (since(m.lastImpactAt) < FLIGHT_BUSY.impact) return true;
  if (since(m.takeoffAt) < FLIGHT_BUSY.takeoff || since(m.landingAt) < FLIGHT_BUSY.landing) return true;
  return false;
}

// how long a machine's own moments hold its operator (seconds)
const MACHINE = Object.freeze({ ballistaHit: 0.5, ramFired: 1.4, ramCycle: 4, traverse: 0.06 });

/**
 * What each machine's operator is doing, from a snapshot, by operator id. Shared by every observer (it reads only the
 * snapshot, and `memory`, which keeps each ballista's last laying to tell when it is being traversed).
 * - ballista: { steering (the left hand), aiming (the right, on the traverse wheel, the clutch or the lever), firedAt
 *   (the last bolt loosed), reloading, struck, moving };
 * - ram: { steering, strikeAt (the fist's authoritative send-off), release (s after it), key, reloading, moving };
 * - flight: { airborne, intense, ejecting, moving, firing }.
 */
export function gestureMachines(snapshot, now, memory = null) {
  const out = new Map();
  if (!snapshot || !Number.isFinite(now)) return out;
  const since = (at) => (Number.isFinite(at) ? now - at : Infinity);
  const flight = snapshot.fightFlight;
  if (flight?.operatorId) {
    out.set(flight.operatorId, {
      airborne: !flight.grounded, intense: flightIntense(flight, now),
      firing: since(flight.lastShotAt) < 0.5,
      ejecting: Number.isFinite(flight.ejectHoldStartedAt),
      moving: Math.hypot(flight.velocity?.x ?? 0, flight.velocity?.z ?? 0) > 1,
    });
  }
  const ballista = snapshot.bibyeBallista;
  if (ballista?.operatorId) {
    const yaw = ballista.mainYaw ?? ballista.yaw ?? 0;
    const last = memory?.get(ballista.id);
    const rate = last && now > last.at ? Math.abs(Math.atan2(Math.sin(yaw - last.yaw), Math.cos(yaw - last.yaw))) / (now - last.at) : 0;
    // (held a moment, so a snapshot that repeats a laying does not drop the hand off the wheel and back)
    const turningUntil = rate > MACHINE.traverse ? now + 0.25 : last?.turningUntil ?? -Infinity;
    if (memory && (!last || now > last.at)) memory.set(ballista.id, { yaw, at: now, turningUntil });
    const firedAt = Math.max(...[ballista.firedAt, ballista.mobileFiredAt, ballista.upperFiredAt].map((v) => (Number.isFinite(v) ? v : -Infinity)));
    out.set(ballista.operatorId, {
      steering: Math.abs(ballista.speed ?? 0) > 0.3,
      aiming: now < turningUntil || ['ENGAGING', 'COUPLED', 'FIRING', 'RELEASING'].includes(ballista.coupling)
        || Number.isFinite(ballista.trackingSince) || since(ballista.modeTransitionEndsAt) < 0,
      firedAt,
      reloading: ballista.state === 'RELOADING' || ballista.state === 'SPENT',
      struck: since(ballista.lastHitAt) < MACHINE.ballistaHit,
      moving: Math.abs(ballista.speed ?? 0) > 0.3,
    });
  }
  const ram = snapshot.soFistication;
  if (ram?.operatorId) {
    const struck = since(ram.strikeAt);
    const moving = Math.abs(ram.speed ?? 0) > 0.5;
    out.set(ram.operatorId, {
      // (turning while it moves: the left hand works the handlebar; going straight, one hand holds it)
      steering: moving && Math.abs(ram.steer ?? 0) > 0.15,
      moving,
      strikeAt: Number.isFinite(ram.strikeAt) ? ram.strikeAt : null,
      release: soFistTiming(ram).release,
      key: `${ram.id}:${ram.strikeAt}`,
      // (the fist drawing back for the next blow: he has to wait for it)
      reloading: struck >= MACHINE.ramFired && struck < MACHINE.ramCycle,
    });
  }
  return out;
}
