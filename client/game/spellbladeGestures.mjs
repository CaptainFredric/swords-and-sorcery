// The Spellblade's personality: occasional gestures, in battle as much as out of it.
//
// A gesture is the lowest layer of a knight's body. Above it, in order: death, ejection and hard reactions; combat
// (strikes, the guard, casting, a dash, an ultimate); machine work (firing, a flight's dash, dive or takeoff); movement and
// riding. It shows with whatever limbs those leave free: a look needs only the head, a yawn one hand, the flight's L-sit
// the legs the harness can spare. When anything above wants the body back, the gesture gives it back at once (over
// FADE_OUT) and does not resume. It never touches input, the camera, the machine or the knight's speed: the player
// never waits on one, and never loses control because the knight has decided to yawn.
//
// Gestures happen while moving, chasing, flying and working a machine, with enemies about: only not in the middle of an
// exchange of blows (COMBAT_QUIET after the last strike, guard, cast or hit), so a knight between fights still looks
// round, nods at his own work, yawns at the opposition, thumps a stubborn machine.
//
// They are scheduled, not sent. Each knight's time is cut into slots of SLOT seconds; each slot draws from a generator
// seeded by the knight's id and the slot, so every observer sees the same knight make the same gesture at the same
// moment, and a snapshot, a remount or a reset neither repeats nor restarts one. A slot after one that fired rests, and a
// slot never repeats the gesture of the slot before last. A kill's nod is the one gesture an event starts (every
// observer has the event).

export const SLOT = 7.5;               // seconds per scheduling slot
export const COMBAT_QUIET = 1.4;       // seconds after the last strike, guard, cast or hit before a gesture may start
export const FADE_OUT = 0.14;          // seconds to give the body back when something above wants it
export const JOIN = 0.3;               // a scheduled gesture starts only within this of its time (never joined late)
export const NOD_WAIT = 2.5;           // seconds a kill's nod may wait for the strike that won it to finish

const DEG = Math.PI / 180;

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

// what each gesture needs: how long it lasts, its share of a slot's draw, which limbs, and where it may happen
// (c: the knight's context; see gestureContext in RemotePlayers.mjs)
export const GESTURES = Object.freeze({
  look: Object.freeze({ seconds: 2.2, weight: 3, limbs: ['head'], when: (c) => !c.flightIntense }),
  glance: Object.freeze({ seconds: 1.9, weight: 2, limbs: ['head'], when: (c) => Boolean(c.machine) && !c.flightIntense }),
  yawn: Object.freeze({ seconds: 2.7, weight: 1, limbs: ['head', 'armL'], when: (c) => !c.machine && !c.sprinting && !c.airborne }),
  frustration: Object.freeze({ seconds: 2.9, weight: 1, limbs: ['head', 'armR'],
    when: (c) => (c.machine === 'ballista' || c.machine === 'ram') && !c.machineBusy,
    // (more likely while the machine makes him wait)
    bias: (c) => (c.machineReloading ? 3 : 1) }),
  shade: Object.freeze({ seconds: 2.6, weight: 1.4, limbs: ['head', 'armL'], when: (c) => c.machine === 'ballista' && !c.machineBusy }),
  lsit: Object.freeze({ seconds: 2.0, weight: 0.9, limbs: ['legs'], when: (c) => c.machine === 'flight' && c.airborne && !c.flightIntense }),
  nod: Object.freeze({ seconds: 1.0, weight: 0, limbs: ['head'], when: () => true }),
});

/** The chance that a slot holds a gesture, by what the knight is doing (on foot and moving: less often). */
export function slotChance(c) {
  if (c.dead) return 0;
  if (c.machine) return 0.42;
  return c.moving ? 0.3 : 0.45;
}

// a small seeded generator (mulberry32) and a string hash (FNV-1a), so every client draws the same numbers
function hash(text) {
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

// a slot's own draw, before the rests and repeats between slots: { kind, at, seconds, side, variant } or null
function drawSlot(id, s, c, avoid = null) {
  const draw = seeded(hash(`${id}:${s}`));
  if (draw() >= slotChance(c)) return null;
  const pickAt = draw();
  const eligible = Object.entries(GESTURES)
    .filter(([kind, g]) => g.weight > 0 && g.when(c))
    .map(([kind, g]) => [kind, g, g.weight * (g.bias?.(c) ?? 1)]);
  if (!eligible.length) return null;
  const total = eligible.reduce((sum, [, , w]) => sum + w, 0);
  let pick = pickAt * total;
  let index = eligible.findIndex(([, , w]) => (pick -= w) < 0);
  if (index < 0) index = eligible.length - 1;
  // never the same gesture as the slot before last (the next one along instead, if there is another)
  if (avoid && eligible[index][0] === avoid && eligible.length > 1) index = (index + 1) % eligible.length;
  const [kind, g] = eligible[index];
  const at = s * SLOT + draw() * Math.max(0.5, SLOT - g.seconds);
  return { kind, at, seconds: g.seconds, side: draw() < 0.5 ? -1 : 1, variant: draw(), slot: s };
}

/** The gesture a slot holds for this knight in this context, after the rests and repeats, or null. */
export function slotGesture(id, s, c) {
  // a slot after one that held a gesture rests
  if (drawSlot(id, s - 1, c)) return null;
  return drawSlot(id, s, c, drawSlot(id, s - 2, c)?.kind ?? null);
}

/**
 * The scheduled gesture under way at `now` (server seconds) for this knight in this context, or null:
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

/** Is anything above a gesture using the body? (the nod asks this; the others also wait out COMBAT_QUIET) */
export function bodyBusy(c) {
  return Boolean(c.dead || c.staggered || c.attacking || c.guarding || c.casting || c.dashing || c.ultimate || c.ejecting
    || c.machineFiring || c.machineCritical);
}

/** May a scheduled gesture show now? */
export function gestureAllowed(c, now) {
  if (bodyBusy(c)) return false;
  return !(now - (c.lastCombatAt ?? -Infinity) < COMBAT_QUIET);
}

const smooth = (t) => { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); };
/** How much of a gesture shows at `age` of `seconds`: in over `rise`, out over `fall`. */
export function envelope(age, seconds, rise = 0.35, fall = 0.4) {
  if (!(age >= 0) || age > seconds) return 0;
  return Math.min(smooth(age / rise), smooth((seconds - age) / fall));
}

/**
 * A gesture's pose at its age, in the knight's own frame (+x his right, +y up, -z ahead):
 * - turns: [{ bone, axis, angle }] root-space turns added to the pose (at full strength: scale by weight);
 * - hand: { side, at, aim, palm, open }: a hand's palm centre, relative to the head bone, its fingers along `aim` and its
 *   palm facing `palm`; `open`: the fingers straightened out of whatever grip they had (flat, to shade the eyes);
 * - strike: { side, lift, reach }: the fist raised `lift` and `reach` forward of where the pose holds it (on a machine's
 *   grip: so it comes down on the casing it was holding);
 * - legs: { hip, knee }: the flight L-sit's hip lift (radians) and how much of the knee's bend to straighten (0..1);
 * - weight: 0..1, through the gesture's envelope.
 */
export function gesturePose(g) {
  const { kind, age, seconds, side = 1, variant = 0 } = g;
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
      // a hand flat at the brow, palm down, and a slow scan of the distance under it
      const scan = Math.sin(p * Math.PI * 2) * 0.5 + (p - 0.5) * 0.4;
      head(5 * DEG, side * 24 * DEG * scan);
      return { turns, hand: { side: 'L', at: [0.02, 0.17, -0.17], aim: [0.8, 0.1, -0.55], palm: [0, -1, 0.1], open: true }, weight: w };
    }
    case 'frustration': {
      // a shake of the helmet, a look down at the machine, two blows of the fist on its casing, and back to work
      const shake = p < 0.32 ? Math.sin((p / 0.32) * Math.PI * 4) * Math.sin((p / 0.32) * Math.PI) : 0;
      const down = smooth((p - 0.25) / 0.15) * (1 - smooth((p - 0.85) / 0.15));
      head(-24 * DEG * down, 14 * DEG * shake);
      // up, and down on the casing; up, and down again (each blow lands at a low point of `beat`)
      const beat = (q) => (p > q && p < q + 0.16 ? Math.sin(((p - q) / 0.16) * Math.PI) : 0);
      const raise = Math.max(beat(0.42), beat(0.62));
      return { turns, strike: { side: 'R', lift: 0.26 * raise * down, reach: 0.06 * raise * down }, weight: w };
    }
    case 'lsit': {
      // both legs up straight before him in the harness, held a moment, and down again: delight, in plate. (60 degrees
      // keeps the boots clear below the repeater's housing in front of his hips, checked in game.)
      const up = smooth(p / 0.3) * (1 - smooth((p - 0.72) / 0.28));
      return { turns, legs: { hip: 60 * DEG * up, knee: up }, weight: envelope(age, seconds, 0.2, 0.3) };
    }
    default:
      return { turns, weight: 0 };
  }
}

/**
 * One knight's gesture state: which gesture is under way, and how much of it shows. `update` returns the gesture's
 * pose for this frame (gesturePose, its weight scaled by any fade), or null.
 */
export class GestureLayer {
  constructor() {
    this.active = null;     // { kind, at, seconds, side, variant }
    this.fading = null;     // { from, at }: interrupted, giving the body back
    this.lastStarted = null;
    this.nodAt = null;
  }

  /** A kill: the nod waits (up to NOD_WAIT) for the strike that won it to finish. */
  nod(at) {
    if (Number.isFinite(at)) this.nodAt = at;
  }

  update(id, now, c) {
    if (!Number.isFinite(now)) return null;
    if (c.dead) { this.active = null; this.fading = null; this.nodAt = null; return null; }
    // the nod, once the body is free (it may take over from a scheduled gesture: it is the knight's answer to a kill)
    if (this.nodAt !== null) {
      if (now - this.nodAt > NOD_WAIT) this.nodAt = null;
      else if (now >= this.nodAt && !bodyBusy(c)) {
        this.active = { kind: 'nod', at: now, seconds: GESTURES.nod.seconds, side: 1, variant: 0 };
        this.fading = null;
        this.nodAt = null;
      }
    }
    if (this.active && now - this.active.at > this.active.seconds) this.active = null;
    // the scheduled one, joined only at its start
    if (!this.active && gestureAllowed(c, now)) {
      const g = scheduledGesture(id, now, c);
      if (g && g.age <= JOIN && g.at !== this.lastStarted) {
        this.active = { kind: g.kind, at: g.at, seconds: g.seconds, side: g.side, variant: g.variant };
        this.lastStarted = g.at;
        this.fading = null;
      }
    }
    if (!this.active) return null;
    const spec = GESTURES[this.active.kind];
    // something above wants the body, or the limbs it needs are no longer free: give them back, and do not resume
    const keep = this.active.kind === 'nod' ? !bodyBusy(c) : gestureAllowed(c, now) && spec.when(c);
    if (!keep && !this.fading) this.fading = { at: now };
    const pose = gesturePose({ ...this.active, age: now - this.active.at });
    if (this.fading) {
      const left = 1 - (now - this.fading.at) / FADE_OUT;
      if (left <= 0) { this.active = null; this.fading = null; return null; }
      pose.weight *= left;
    }
    pose.kind = this.active.kind;
    return pose.weight > 1e-3 ? pose : null;
  }
}

// how long a Fight-and-Flight stays busy after each of these (seconds)
const FLIGHT_BUSY = Object.freeze({ dash: 1.4, impact: 1.6, takeoff: 1.2, landing: 1.0 });

/** Is a Fight-and-Flight doing something a rider's body must not play over (a dash, dive, run, impact...)? */
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

// how long each machine's own work holds its operator (seconds)
const MACHINE_BUSY = Object.freeze({ ballistaShot: 0.8, ballistaHit: 0.8, ramStrike: 1.4, ramCycle: 4, flightShot: 0.5 });

/**
 * What each machine's operator is doing, from a snapshot, by operator id: { airborne, intense, firing, busy (both hands
 * on the work), reloading, critical, ejecting, moving }. Shared by every observer (it reads only the snapshot).
 */
export function gestureMachines(snapshot, now) {
  const out = new Map();
  if (!snapshot || !Number.isFinite(now)) return out;
  const since = (at) => (Number.isFinite(at) ? now - at : Infinity);
  const flight = snapshot.fightFlight;
  if (flight?.operatorId) {
    const firing = since(flight.lastShotAt) < MACHINE_BUSY.flightShot;
    out.set(flight.operatorId, {
      airborne: !flight.grounded, intense: flightIntense(flight, now), firing, busy: firing,
      ejecting: Number.isFinite(flight.ejectHoldStartedAt),
      moving: Math.hypot(flight.velocity?.x ?? 0, flight.velocity?.z ?? 0) > 1,
    });
  }
  const ballista = snapshot.bibyeBallista;
  if (ballista?.operatorId) {
    const fired = Math.min(since(ballista.firedAt), since(ballista.mobileFiredAt), since(ballista.upperFiredAt));
    const firing = ballista.state === 'FIRING' || fired < MACHINE_BUSY.ballistaShot;
    const moving = Math.abs(ballista.speed ?? 0) > 0.3;
    out.set(ballista.operatorId, {
      firing, moving,
      // (driving, firing, working the clutch lever or changing mode: both hands are on the machine)
      busy: firing || moving || ballista.coupling === 'ENGAGING' || since(ballista.modeTransitionEndsAt) < 0,
      reloading: ballista.state === 'RELOADING' || ballista.state === 'SPENT',
      critical: since(ballista.lastHitAt) < MACHINE_BUSY.ballistaHit,
    });
  }
  const ram = snapshot.soFistication;
  if (ram?.operatorId) {
    const struck = since(ram.strikeAt);
    const firing = struck < MACHINE_BUSY.ramStrike;
    const moving = Math.abs(ram.speed ?? 0) > 0.5;
    out.set(ram.operatorId, {
      firing, moving,
      busy: firing || moving || Boolean(ram.charging) || ram.skill?.phase === 'primed',
      // (the fist drawing back for the next blow: he has to wait for it)
      reloading: struck >= MACHINE_BUSY.ramStrike && struck < MACHINE_BUSY.ramCycle,
    });
  }
  return out;
}
