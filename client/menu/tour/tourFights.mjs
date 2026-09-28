// Three rivals on the Spellblade's round, and how each of them loses. Written like a fight choreographer's sheet:
// for every moment, where each knight stands, which way he faces, what he is doing, and what happens (a clash, a
// fireball, armour falling apart). Pure: time in, poses and cues out. TourDirector.mjs makes them real.
//
// Each fight happens at an anchor on the path. Its own frame: u runs from the Spellblade toward his rival (the rival
// waits `reach` along it), v runs the way the path goes. heading: the way a knight faces in that frame (0 toward
// the rival's side, pi/2 along the path, pi back toward the Spellblade). Time 0 is the moment the Spellblade stops
// at the anchor; before it he is still arriving, after `duration` he runs on.
//
// A pose: { u, v, lift, heading, clip, time, loop, rate, crouch, rotations, sword, spell } where sword/spell are
// { target, weight } for the arm solver in the knight's own root space (see swordArmIK.mjs), and a rival may also be
// { gone: true, u, v } (fled, or lying in pieces there). A rival's `framed` (0..1, 1 if not given) is a note for the
// camera: how much it keeps him in the shot.

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { const s = clamp01(t); return s * s * (3 - 2 * s); };
const mix = (a, b, t) => a + (b - a) * t;
const between = (t, a, b) => clamp01((t - a) / (b - a));

/** A number keyed over time: [[t, value], ...], eased between keys, held beyond the ends. */
export function keyed(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    if (t <= keys[i][0]) return mix(keys[i - 1][1], keys[i][1], smooth((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  }
  return keys[keys.length - 1][1];
}

/** Which clip is playing at t: [[start, clip, { loop, rate, hold }], ...] (hold: freeze at that clip time). */
export function clipAt(sheet, t) {
  let entry = sheet[0];
  for (const candidate of sheet) if (t >= candidate[0]) entry = candidate;
  const [start, clip, { loop = false, rate = 1, hold = null } = {}] = entry;
  const time = hold ?? Math.max(0, (t - start) * rate);
  return { clip, time, loop };
}

const blade = (wrist, aim, roll = [1, 0, 0]) => ({ wrist, aim, roll });
const arm = (target, weight = 1) => (weight > 1e-3 ? { target, weight } : null);

// the Spellblade turns to face his rival as he stops, and back to the path before he goes
function faceRival(t, duration) {
  return keyed([[0, Math.PI / 2], [0.35, 0], [duration - 0.6, 0], [duration - 0.1, Math.PI / 2]], t);
}

// ---------------------------------------------------------------------------------------------------------------
// 1. The Fireball: they trade blows, he breaks the guard, leaps back and burns his rival to a crisp, and runs on.
const FIREBALL = {
  id: 'fireball',
  reach: 1.9,
  duration: 6.6,
  side: -1,
  // filmed from behind the Spellblade's shoulder: the fireball flies away into the rival, who burns facing the camera
  shot: { swing: 0.5 },
  hero(t) {
    const heading = faceRival(t, 6.6);
    const clip = clipAt([
      [-1, 'Idle', { loop: true }],
      [0.3, 'Slash_1'],
      [1.1, 'Guard'],
      [1.95, 'Slash_3'],
      [2.75, 'Air', { rate: 1 / 0.7 * 0.6 }],
      [3.5, 'Cast'],
      [4.5, 'Idle', { loop: true }],
      [5.5, 'Run', { loop: true, rate: 0.55 }],
      [6.3, 'Idle', { loop: true }],
    ], t);
    // the leap back: 2.4 m away from the rival in an arc, landing into a crouch; then back to the path
    const u = keyed([[2.7, 0], [3.45, -2.4], [5.5, -2.4], [6.3, 0]], t);
    const lift = t > 2.75 && t < 3.45 ? Math.sin(Math.PI * between(t, 2.75, 3.45)) * 0.75 : 0;
    const crouch = keyed([[3.4, 0], [3.5, 0.45], [3.9, 0.12], [4.3, 0]], t);
    return { u, v: 0, lift, heading, ...clip, crouch, rotations: [] };
  },
  rival(t) {
    const clip = clipAt([
      [-99, 'Idle', { loop: true }],
      [-0.9, 'Guard'],
      [1.15, 'Slash_2'],
      [1.9, 'Guard'],
      [2.38, 'Stagger'],
      [3.0, 'Guard'],
      [4.2, 'Stagger'],
      [4.8, 'Stagger'],
      [5.4, 'Death'],
    ], t);
    // shoved back by the guard break, then blown back by the fireball; he burns where he falls
    const u = 1.9 + keyed([[2.38, 0], [2.8, 0.45], [3.6, 0.2], [4.2, 0.1], [4.5, 0.75], [5.4, 0.9], [6.4, 1.1]], t);
    // flailing while he burns
    const flail = t > 4.3 && t < 5.5 ? Math.sin(t * 17) * 0.5 : 0;
    const rotations = flail ? [
      { bone: 'upper_arm.L', axis: [0, 0, 1], angle: -0.9 + flail },
      { bone: 'upper_arm.R', axis: [0, 0, 1], angle: 0.6 - flail },
      { bone: 'head', axis: [0, 1, 0], angle: flail * 0.6 },
    ] : [];
    return { u, v: 0, lift: 0, heading: Math.PI, ...clip, crouch: 0, rotations };
  },
  cues: [
    { at: 0.3, type: 'swing', by: 'hero' },
    { at: 0.72, type: 'clash' },
    { at: 1.15, type: 'swing', by: 'rival' },
    { at: 1.55, type: 'clash' },
    { at: 1.95, type: 'swing', by: 'hero', heavy: true },
    { at: 2.36, type: 'clash', heavy: true },
    { at: 3.5, type: 'gather', by: 'hero', spell: 'fireball' },
    { at: 3.86, type: 'cast', by: 'hero', spell: 'fireball', flight: 0.3 },
    { at: 4.16, type: 'impact', on: 'rival', spell: 'fireball' },
    { at: 4.2, type: 'burn', on: 'rival', seconds: 2.4 },
    { at: 4.9, type: 'voice', line: 'killTaunt', chance: 0.5 },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// 2. The Whirlwind: a blow each way, then he spins, and spins, and spins; strolls once round his frozen rival, sword on
// his shoulder; and the rival falls apart into his armour.
const WHIRLWIND = {
  id: 'whirlwind',
  reach: 1.9,
  duration: 9.8,
  side: -1,
  hero(t) {
    // the spin: three full turns, gathering speed and slowing to face him again
    const spin = t >= 2.0 && t <= 3.8 ? smooth(between(t, 2.0, 3.8)) * Math.PI * 6 : 0;
    // the stroll: once round the rival at his reach, walking the circle and watching him over his shoulder
    const around = between(t, 4.4, 8.4);
    const angle = Math.PI + smooth(around) * Math.PI * 2;
    const strolling = t > 4.4 && t < 8.4;
    const u = strolling ? 1.9 + Math.cos(angle) * 1.9 : 0;
    const v = strolling ? Math.sin(angle) * 1.9 : 0;
    const walkHeading = angle - Math.PI / 2;
    let heading = faceRival(t, 9.8) - spin;
    if (strolling) heading = keyed([[4.4, 0], [4.8, walkHeading], [8.0, walkHeading], [8.4, Math.PI * 2]], t) % (Math.PI * 2);
    if (strolling && t > 4.8 && t < 8.0) heading = walkHeading;
    const clip = clipAt([
      [-1, 'Idle', { loop: true }],
      [0.3, 'Guard'],
      [1.15, 'Slash_2'],
      [1.95, 'Idle', { loop: true }],
      [4.5, 'Run', { loop: true, rate: 0.42 }],
      [8.3, 'Idle', { loop: true }],
    ], t);
    const spinning = between(t, 1.95, 2.15) * (1 - between(t, 3.7, 3.95));
    const shouldering = between(t, 4.2, 4.6) * (1 - between(t, 8.3, 8.7));
    let sword = null;
    let spell = null;
    if (spinning > 1e-3) {
      // the blade held straight out at the shoulder, the other arm out for balance
      sword = arm(blade([0.7, 1.35, -0.2], [1, 0.02, -0.12], [0, 1, 0]), spinning);
      spell = arm(blade([-0.62, 1.32, -0.06], [0, -1, 0]), spinning);
    } else if (shouldering > 1e-3) {
      // the blade rested on his shoulder, pointing back: in no hurry at all
      sword = arm(blade([0.2, 1.52, -0.12], [0.15, 0.45, 0.88], [1, 0, 0]), shouldering);
    }
    const crouch = spinning * 0.22;
    const rotations = strolling ? [{ bone: 'head', axis: [0, 1, 0], angle: 0.9 * between(t, 4.6, 5.0) * (1 - between(t, 8.0, 8.4)) }] : [];
    return { u, v, lift: 0, heading, ...clip, crouch, rotations, sword, spell };
  },
  rival(t) {
    if (t >= 8.25) return { gone: true, u: 1.9, v: 0 };
    const clip = clipAt([
      [-99, 'Idle', { loop: true }],
      [-0.9, 'Guard'],
      [0.35, 'Slash_1'],
      [1.1, 'Guard'],
      // caught in the whirlwind: he stands exactly as he was, and never moves again
      [2.0, 'Guard', { hold: 1.0 }],
    ], t);
    // the blows of the spin land as small shudders, then nothing
    const shudder = t > 2.2 && t < 3.9 ? Math.sin(t * 60) * 0.04 * (1 - between(t, 3.6, 3.9)) : 0;
    return { u: 1.9, v: 0, lift: 0, heading: Math.PI, ...clip, crouch: 0, rotations: shudder ? [{ bone: 'chest', axis: [0, 1, 0], angle: shudder }] : [] };
  },
  cues: [
    { at: 0.35, type: 'swing', by: 'rival' },
    { at: 0.76, type: 'clash' },
    { at: 1.15, type: 'swing', by: 'hero' },
    { at: 1.56, type: 'clash' },
    { at: 2.0, type: 'spin', by: 'hero', seconds: 1.8 },
    { at: 2.4, type: 'hit', on: 'rival' },
    { at: 2.95, type: 'hit', on: 'rival' },
    { at: 3.45, type: 'hit', on: 'rival' },
    { at: 8.25, type: 'shatter', on: 'rival' },
    { at: 8.8, type: 'voice', line: 'killTaunt', chance: 0.5 },
  ],
};

// ---------------------------------------------------------------------------------------------------------------
// 3. The White Flag: the rival throws a fireball; the Spellblade ducks it, cuts the rival's sword in half as he lunges,
// turns what is left into a white flag with a flick of sorcery, and the rival, after a long look at it, runs.
const WHITE_FLAG = {
  id: 'whiteFlag',
  reach: 1.9,
  duration: 11.8,
  // the rival stands on the South Road's side of the path, and runs off down it
  side: -1,
  shot: { swing: 0.4 },
  hero(t) {
    const heading = faceRival(t, 11.8);
    const clip = clipAt([
      [-1, 'Idle', { loop: true }],
      [0.3, 'Slash_1'],
      [1.1, 'Guard'],
      [1.9, 'Idle', { loop: true }],
      [3.5, 'Slash_2'],
      [4.3, 'Idle', { loop: true }],
      [4.6, 'Run', { loop: true, rate: 0.35 }],
      [5.1, 'Idle', { loop: true }],
      [6.0, 'Run', { loop: true, rate: 0.35 }],
      [6.5, 'Idle', { loop: true }],
    ], t);
    // the duck: down low, head tucked, as the fireball passes where his head was
    const duck = between(t, 2.55, 2.75) * (1 - between(t, 3.2, 3.5));
    const crouch = duck * 0.95;
    const rotations = duck > 1e-3 ? [
      { bone: 'spine', axis: [-1, 0, 0], angle: 0.45 * duck },
      { bone: 'chest', axis: [-1, 0, 0], angle: 0.25 * duck },
      { bone: 'head', axis: [-1, 0, 0], angle: 0.35 * duck },
    ] : [];
    // a step in to work the change, a step back to admire it
    const u = keyed([[4.6, 0], [5.1, 0.55], [6.0, 0.55], [6.5, 0]], t);
    // the flick of sorcery: the spell hand thrust toward the rival's sword
    const flick = between(t, 5.05, 5.3) * (1 - between(t, 5.7, 6.0));
    const spell = flick > 1e-3 ? arm(blade([-0.12, 1.36, -0.62], [0, 0, -1]), flick) : null;
    // he watches him go, then raises his sword to the sky
    return { u, v: 0, lift: 0, heading, ...clip, crouch, rotations, spell, sword: null, rally: t >= 8.3 && t < 11.2 ? t - 8.3 : null };
  },
  rival(t) {
    if (t >= 9.9) return { gone: true, u: 12.5, v: 1.0, framed: 0 };
    const clip = clipAt([
      [-99, 'Idle', { loop: true }],
      [-0.9, 'Guard'],
      [1.15, 'Slash_2'],
      [1.9, 'Dash'],
      [2.3, 'Cast'],
      [3.3, 'Dash'],
      // the lunge, and there he stays: stuck in the stab
      [3.55, 'Slash_3', { hold: 0.34 }],
      [7.35, 'Run', { loop: true, rate: 1.1 }],
    ], t);
    // hops back to throw, lunges in, then (after the long look) turns and runs for it
    const u = keyed([[1.9, 1.9], [2.2, 3.0], [3.3, 3.0], [3.6, 1.35], [7.35, 1.35], [9.9, 12.5]], t);
    const v = keyed([[7.35, 0], [9.9, 1.0]], t);
    // he turns tail (through facing the camera) and runs the way his feet are going
    const heading = keyed([[7.0, Math.PI], [7.4, Math.PI * 2 + 0.09], [9.9, Math.PI * 2 + 0.09]], t);
    // the long look down at the flag, then off he goes, flag held high
    const look = between(t, 5.6, 6.1) * (1 - between(t, 7.0, 7.3));
    const rotations = look > 1e-3 ? [
      { bone: 'head', axis: [-1, 0, 0], angle: 0.75 * look },
      { bone: 'neck', axis: [-1, 0, 0], angle: 0.2 * look },
      { bone: 'chest', axis: [-1, 0, 0], angle: 0.1 * look },
    ] : [];
    // with the flag in his hand he brings it up before his face to look at it; running, he holds it high
    const holding = between(t, 5.35, 5.8);
    const fleeing = between(t, 7.35, 7.6);
    let sword = null;
    if (fleeing > 1e-3) sword = arm(blade([0.32, 1.95, -0.08], [0.1, 1, 0.1]), 1);
    else if (holding > 1e-3) sword = arm(blade([0.2, 1.22, -0.36], [0, 1, 0.12]), holding);
    // the camera follows him a moment as he bolts, then lets him go and stays with the Spellblade
    return { u, v, lift: 0, heading, ...clip, crouch: 0, rotations, sword, framed: 1 - between(t, 8.4, 9.2) };
  },
  cues: [
    { at: 0.3, type: 'swing', by: 'hero' },
    { at: 0.72, type: 'clash' },
    { at: 1.15, type: 'swing', by: 'rival' },
    { at: 1.55, type: 'clash' },
    { at: 2.3, type: 'gather', by: 'rival', spell: 'fireball' },
    { at: 2.62, type: 'cast', by: 'rival', spell: 'fireball', flight: 0.55, over: true },
    { at: 3.17, type: 'impact', on: 'behind', spell: 'fireball' },
    { at: 3.5, type: 'swing', by: 'hero' },
    { at: 3.9, type: 'cut', on: 'rival' },
    { at: 5.25, type: 'flag', on: 'rival' },
    { at: 8.6, type: 'voice', line: 'victory', chance: 0.6 },
  ],
};

export const FIGHTS = Object.freeze([FIREBALL, WHIRLWIND, WHITE_FLAG]);
