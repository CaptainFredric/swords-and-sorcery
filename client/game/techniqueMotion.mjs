// The Sword Techniques felt from inside the helm, and their beats, on the server's own technique clock. Nothing here
// moves anyone or decides a hit: the server's lunge, revolutions and contacts are untouched.
//
// Third person the techniques' bodies are their authored clips (Codex's Candidate v3: the Riposte's brace, leap and
// landing, the Whirl's pivots, lifted steps and stepping brake). A procedural body drawn over them (a sink, a torso
// drive, a lean) was taken out on 2026-11-19: it doubled beats v3 authors and moved the planted feet 6.5 to 8.8 cm.
//
// Rigid Riposte (shared/src/swordTechniqueContracts.mjs): a 0.22 s brace that intercepts, then a committed 5.7 m lunge
// over the next 0.26 s, then recovery. Whirl Like the Wind: a revolution every 0.6 s, eased out on release.
//
// First person: the arms' offsets (metres and radians, as FirstPersonMotion's), the view's lean (radians) and a field of
// view kick (degrees). The first-person Riposte's arms are fpTechniques.mjs.

const clamp01 = (t) => Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
const smooth = (t) => { const s = clamp01(t); return s * s * (3 - 2 * s); };
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;

export const RIPOSTE_MOTION = Object.freeze({
  brace: 0.22,          // the server's brace (contract activeFrom)
  driveTo: 0.48,        // the lunge's end (contract activeUntil)
  release: 0.12,        // how fast the coil lets go into the drive
  air: Object.freeze([0.25, 0.43]),   // the feet off the ground
  hold: 0.08,           // the landed lunge held before rising
  rise: 0.3,            // and risen out of
});

/** How far into each part of the Riposte the knight is, `age` seconds after it began (0..1 each). */
export function ripostePhases(age, m = RIPOSTE_MOTION) {
  const a = Number.isFinite(age) ? age : 0;
  const coil = a < m.brace ? smooth(a / (m.brace * 0.85)) : 1 - easeOut((a - m.brace) / m.release);
  const drive = a < m.brace ? 0 : easeOut((a - m.brace) / m.release);
  const air = a < m.air[0] || a > m.air[1] ? 0 : Math.sin(Math.PI * (a - m.air[0]) / (m.air[1] - m.air[0]));
  const rise = smooth((a - m.driveTo - m.hold) / m.rise);
  return { coil, drive: drive * (1 - rise), air, rise };
}

/** First person: the Riposte felt from inside the helm. */
export function riposteView(age) {
  const { coil, drive, air } = ripostePhases(age);
  return {
    // the arms drawn in and the point lifted for the brace, then thrown forward with the body
    weapon: { x: 0.015 * coil, y: -0.012 * coil, z: 0.05 * coil - 0.07 * drive, rx: 0.06 * coil - 0.04 * drive, ry: 0, rz: -0.03 * coil },
    // the view sinks a touch and rolls with the coil, then drops its chin into the drive (a degree or two at most)
    camera: { y: -0.03 * coil - 0.02 * drive + 0.015 * air, pitch: 0.025 * coil - 0.035 * drive, roll: -0.02 * coil + 0.012 * drive, yaw: 0 },
    // the lunge's rush: a small widening of the view, gone as it lands
    fov: 6 * air,
  };
}

export const WHIRL_MOTION = Object.freeze({
  revolution: 0.6,
  lean: 0.16,         // radians into the turn at full spin
  lag: 0.22,          // how far the chest leads the sword round
  build: 0.35,        // seconds to full lean from the first instant
  ease: 0.25,         // and out of it on the release
});

/**
 * How much of the Whirl's spin the body has: 0..1, building from its start and easing after it ends. `action`: the
 * snapshot's { phase, startedAt, endsAt }.
 */
export function whirlSpin(action, serverNow, m = WHIRL_MOTION) {
  if (!action) return 0;
  const age = serverNow - (action.initialStartedAt ?? action.startedAt ?? serverNow);
  const build = smooth(age / m.build);
  if (action.phase === 'recovery' || action.phase === 'interrupted') {
    const since = serverNow - ((action.endsAt ?? serverNow) - 0.25);
    return build * (1 - smooth(since / m.ease));
  }
  return build;
}

/** First person: the Whirl's pull felt in the view (a lean and a weight in the arms; the authored arms do the rest). */
export function whirlView(action, serverNow, m = WHIRL_MOTION) {
  const spin = whirlSpin(action, serverNow, m);
  if (spin < 1e-3) return null;
  const age = serverNow - (action.initialStartedAt ?? action.startedAt ?? serverNow);
  const beat = 0.75 + 0.25 * Math.cos(2 * Math.PI * (age / m.revolution));
  return {
    weapon: { x: -0.02 * spin * beat, y: -0.015 * spin, z: 0, rx: 0, ry: 0.05 * spin * beat, rz: 0.04 * spin * beat },
    camera: { y: -0.02 * spin, pitch: -0.01 * spin, roll: 0.03 * spin * beat, yaw: 0 },
    fov: 3 * spin,
  };
}

/** Which revolution of a Whirl under way this is (0, 1, ...), or null when none is (for its sound, once a turn). */
export function whirlRevolution(action, serverNow, m = WHIRL_MOTION) {
  if (action?.id !== 'whirl_wind' || action.phase === 'recovery' || action.phase === 'interrupted') return null;
  const age = serverNow - (action.initialStartedAt ?? action.startedAt ?? serverNow);
  return age >= 0 ? Math.floor(age / m.revolution) : null;
}
