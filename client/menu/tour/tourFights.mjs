// The rivals on the Spellblade's round, and how each of them loses. Written like a fight choreographer's sheet:
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
// camera: how much it keeps him in the shot. The Slush adds a few: the hero's `vessel` ({ kind, shown, tilt, fill })
// and `near` (0..1: how much closer the camera comes), and the rival's `frozen` and `melt` (0..1).

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
// 2. The Whirlwind: a blow each way; then he spins, fast, round and round, slowing to a stop, and stands there dizzy.
// He shakes it off, turns his back and walks away down the path; behind him the rival, who has not moved since the
// spin, falls apart into his armour. `turns`: how many times round (it varies from round to round).
export function makeWhirlwind({ turns = 4 } = {}) {
  const SPIN = [2.0, 4.3];          // from a standstill to fast, then slowing to nothing
  const DIZZY = 5.9;                // swaying until then
  const WALK = [6.25, 8.85];        // then away down the path
  const AWAY = 2.6;                 // metres he walks before he runs on
  const walked = (t) => {
    const q = between(t, WALK[0], WALK[1]);
    // eases into the walk, then keeps its pace (he is still walking when he runs on)
    return (AWAY * (q < 0.15 ? (q * q) / 0.3 : q - 0.075)) / 0.925;
  };
  const turned = (t) => (t <= SPIN[0] ? 0 : turns * 2 * Math.PI * (1 - (1 - between(t, SPIN[0], SPIN[1])) ** 2.4));
  // the dizzy spell: strongest as the spin runs out, gone as he steadies
  const dizzy = (t) => between(t, SPIN[1] - 0.5, SPIN[1] + 0.1) * (1 - between(t, DIZZY - 0.4, DIZZY + 0.15));
  const sway = (t) => 4.4 * Math.max(0, t - SPIN[1] + 0.5);
  return {
    id: 'whirlwind',
    key: `whirlwind:${turns}`,
    reach: 1.9,
    duration: WALK[1],
    side: -1,
    // he leaves the fight walking, this far down the path at this pace
    exit: AWAY,
    exitSpeed: AWAY / ((WALK[1] - WALK[0]) * 0.925),
    hero(t) {
      const d = dizzy(t);
      const phase = sway(t);
      let heading;
      if (t < SPIN[0]) heading = keyed([[0, Math.PI / 2], [0.35, 0]], t);
      else if (t <= SPIN[1]) heading = -turned(t);
      else if (t < DIZZY) heading = 0.32 * Math.sin(phase * 0.8) * d;
      else heading = keyed([[DIZZY, 0.32 * Math.sin(sway(DIZZY) * 0.8) * dizzy(DIZZY)], [WALK[0], Math.PI / 2]], t);
      const clip = clipAt([
        [-1, 'Idle', { loop: true }],
        [0.3, 'Guard'],
        [1.15, 'Slash_2'],
        [1.95, 'Idle', { loop: true }],
        [WALK[0], 'Run', { loop: true, rate: 0.28 }],
      ], t);
      // the blade held straight out through the fast turns, the arms coming in as it slows
      const out = between(t, 1.95, 2.15) * (1 - between(t, SPIN[1] - 0.9, SPIN[1] - 0.2));
      const sword = arm(blade([0.7, 1.35, -0.2], [1, 0.02, -0.12], [0, 1, 0]), out);
      const spell = arm(blade([-0.62, 1.32, -0.06], [0, -1, 0]), out);
      const rotations = [];
      if (d > 1e-3) {
        // the world going round: body and head circling out of step, the knees soft
        rotations.push(
          { bone: 'spine', axis: [1, 0, 0], angle: 0.13 * Math.cos(phase) * d },
          { bone: 'spine', axis: [0, 0, 1], angle: 0.13 * Math.sin(phase) * d },
          { bone: 'head', axis: [1, 0, 0], angle: -0.22 * Math.cos(phase - 0.7) * d },
          { bone: 'head', axis: [0, 0, 1], angle: -0.22 * Math.sin(phase - 0.7) * d },
          { bone: 'upper_arm.R', axis: [0, 0, 1], angle: -0.25 * d },
          { bone: 'upper_arm.L', axis: [0, 0, 1], angle: 0.25 * d },
        );
      }
      // steadying: a quick shake of the head
      const shake = between(t, DIZZY - 0.1, DIZZY) * (1 - between(t, DIZZY + 0.2, WALK[0]));
      if (shake > 1e-3) rotations.push({ bone: 'head', axis: [0, 1, 0], angle: 0.35 * Math.sin((t - DIZZY) * 38) * shake });
      // a stumble to one side and back as he sways
      const u = 0.16 * Math.sin(phase * 0.5) * d;
      const crouch = out * 0.22 + d * (0.14 + 0.08 * Math.abs(Math.sin(phase)));
      const pose = { u, v: 0, lift: 0, heading, ...clip, crouch, rotations, sword, spell, snap: t > SPIN[0] && t < SPIN[1] };
      if (t >= WALK[0]) pose.path = walked(t);
      return pose;
    },
    rival(t) {
      if (t >= 7.25) return { gone: true, u: 1.9, v: 0 };
      const clip = clipAt([
        [-99, 'Idle', { loop: true }],
        [-0.9, 'Guard'],
        [0.35, 'Slash_1'],
        [1.1, 'Guard'],
        // caught in the whirlwind: he stands exactly as he was, and never moves again
        [2.0, 'Guard', { hold: 1.0 }],
      ], t);
      // the blows of the spin land as small shudders, then nothing
      const shudder = t > 2.2 && t < 3.3 ? Math.sin(t * 60) * 0.04 * (1 - between(t, 3.0, 3.3)) : 0;
      return { u: 1.9, v: 0, lift: 0, heading: Math.PI, ...clip, crouch: 0, rotations: shudder ? [{ bone: 'chest', axis: [0, 1, 0], angle: shudder }] : [] };
    },
    cues: [
      { at: 0.35, type: 'swing', by: 'rival' },
      { at: 0.76, type: 'clash' },
      { at: 1.15, type: 'swing', by: 'hero' },
      { at: 1.56, type: 'clash' },
      { at: 2.0, type: 'spin', by: 'hero', seconds: 1.4 },
      { at: 2.25, type: 'hit', on: 'rival' },
      { at: 2.55, type: 'hit', on: 'rival' },
      { at: 2.9, type: 'hit', on: 'rival' },
      { at: 4.1, type: 'dizzy', by: 'hero', seconds: 1.9 },
      { at: 7.25, type: 'shatter', on: 'rival' },
      { at: 7.9, type: 'voice', line: 'killTaunt', chance: 0.5 },
    ],
  };
}
const WHIRLWIND = makeWhirlwind();

// ---------------------------------------------------------------------------------------------------------------
// 3. The White Flag: the rival throws a fireball; the Spellblade ducks it, cuts the rival's sword in half as he lunges,
// turns what is left into a white flag with a flick of sorcery, and the rival, after a long look at it, runs.
// `flee`: where the rival runs to, [u, v] in the fight's frame (each stop on the round has its own way out)
export function makeWhiteFlag({ flee = [12.5, 1] } = {}) {
  const [fleeU, fleeV] = flee;
  // he turns tail the short way round to face the way his feet are going
  const away = Math.atan2(fleeV, fleeU - 1.35);
  const turnTo = Math.PI + Math.atan2(Math.sin(away - Math.PI), Math.cos(away - Math.PI));
  return {
    key: `whiteFlag:${fleeU},${fleeV}`,
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
      if (t >= 9.9) return { gone: true, u: fleeU, v: fleeV, framed: 0 };
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
      const u = keyed([[1.9, 1.9], [2.2, 3.0], [3.3, 3.0], [3.6, 1.35], [7.35, 1.35], [9.9, fleeU]], t);
      const v = keyed([[7.35, 0], [9.9, fleeV]], t);
      // he turns tail and runs the way his feet are going
      const heading = keyed([[7.0, Math.PI], [7.4, turnTo], [9.9, turnTo]], t);
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
}
const WHITE_FLAG = makeWhiteFlag();

// ---------------------------------------------------------------------------------------------------------------
// 4. The Slush: a short exchange; he freezes his rival solid with Frostfire, regards his work a moment, and puts an
// ordinary Fireball into the statue, which melts down into a heap of slush. He produces a vessel from his belt on his
// way over, scoops some up, drinks it, and gives his verdict; puts the vessel away, and walks back to the path. None
// of it is remarked on. The drinking is the Poor Taste take itself: its slurp, two small smacks, a considered "Ahhh",
// and then the words (SLUSH.take, in seconds into it), so the take begins as the vessel reaches his visor.
//
// What varies from round to round: the vessel (a pewter tankard or a small wooden pail), who presses the opening
// exchange (the rival comes at him, or he goes at the rival), how deep he drinks, and whether he tips out what is left
// before putting the vessel away. (The slush takes the colour of whichever knight it was: TourDirector.)
export const SLUSH = Object.freeze({
  reach: 3.3,           // where the rival waits: he comes on as the Spellblade arrives
  meet: 1.95,           // where he stands for the exchange, is frozen, melted and drunk
  backTo: -0.75,        // the half step the Spellblade gives himself to cast in
  scoopFrom: 1.2,       // where the Spellblade stands to scoop (the heap three quarters of a metre ahead of him)
  freezeAt: 3.06,       // the Frostfire lands...
  frozenBy: 3.5,        // ...and he is solid
  fireballAt: 4.68,     // the Fireball lands...
  melt: Object.freeze([4.72, 5.77]),
  goneAt: 5.8,          // ...and nothing of him is left but the slush
  drinkAt: 7.7,         // the take begins (its slurp is the drink)
  // the take, in its own seconds: the slurp, the smacks, the "Ahhh" and the words (client/assets/voice/poor-taste-1)
  take: Object.freeze({ slurp: Object.freeze([0.08, 1.5]), smacks: Object.freeze([2.02, 2.56]), ahh: Object.freeze([2.92, 3.9]), words: Object.freeze([4.4, 5.5]) }),
});

export const SLUSH_VARIANTS = Object.freeze({
  vessel: Object.freeze(['cup', 'pail']),
  opening: Object.freeze(['charge', 'press']),
  drink: Object.freeze(['quaff', 'sip']),
  finish: Object.freeze(['stow', 'dregs']),
});

export function makeSlush({ vessel = 'cup', opening = 'charge', drink = 'quaff', finish = 'stow' } = {}) {
  const S = SLUSH;
  const take = (at) => S.drinkAt + at;
  const pour = finish === 'dregs';
  // the vessel away at his hip (after the dregs, if he tips them out), then back to the path
  const away = pour ? [13.8, 14.05] : [13.3, 13.6];
  const walk = [away[1], away[1] + 0.85];
  const duration = walk[1] + 0.1;
  const deep = drink === 'quaff';
  return {
    id: 'slush',
    key: `slush:${vessel}:${opening}:${drink}:${finish}`,
    variant: Object.freeze({ vessel, opening, drink, finish }),
    reach: S.reach,
    duration,
    // the rival across the path from where the camera films it: the vessel is in his spell hand (his left), and so it
    // is on the camera's side of him as he scoops and drinks
    side: 1,
    // filmed a little from his side: the Frostfire and the Fireball fly across the frame, and the heap is in view
    shot: { swing: 0.3 },
    hero(t) {
      // he faces his rival as he stops, and the heap as he scoops; to drink he turns three quarters to the camera, his
      // vessel hand toward it (which way that is depends on the side of the path the stop puts the rival: `side`);
      // walking back he faces the path, and turns along it as he gets there
      const drinking = (this.side ?? 1) > 0 ? -1.1 : -2.7;
      const heading = keyed([
        [0, Math.PI / 2], [0.35, 0], [7.3, 0], [7.6, drinking], [walk[0], drinking], [walk[0] + 0.3, -2.75], [walk[1] - 0.2, -2.75], [duration, -1.5 * Math.PI],
      ], t);
      const press = opening === 'press';
      const clip = clipAt([
        [-1, 'Idle', { loop: true }],
        ...(press
          ? [[0.6, 'Slash_1'], [1.25, 'Guard'], [1.95, 'Guard']]
          : [[0.65, 'Guard'], [1.4, 'Slash_2'], [1.95, 'Guard']]),
        [2.4, 'Cast'],
        [3.4, 'Idle', { loop: true }],
        [4.15, 'Cast'],
        [5.0, 'Idle', { loop: true }],
        // the hurry over, vessel in hand
        [6.0, 'Run', { loop: true, rate: 0.55 }],
        [6.5, 'Idle', { loop: true }],
        [walk[0], 'Run', { loop: true, rate: 0.3 }],
        [walk[1], 'Idle', { loop: true }],
      ], t);
      // in a step to swing (pressing), back a half step to cast; over to the heap in a hurry; back to the path
      const u = keyed([
        [0.5, 0], ...(press ? [[0.75, 0.25], [1.1, 0.25], [1.35, 0]] : []),
        [1.95, 0], [2.35, S.backTo], [6.0, S.backTo], [6.5, S.scoopFrom], [walk[0], S.scoopFrom], [walk[1], 0],
      ], t);
      // the scoop: down quickly, a bend over the heap, and straight back up
      const down = between(t, 6.55, 6.85) * (1 - between(t, 7.05, 7.35));
      const crouch = 0.8 * down;
      const rotations = [];
      if (down > 1e-3) rotations.push({ bone: 'spine', axis: [-1, 0, 0], angle: 0.55 * down }, { bone: 'chest', axis: [-1, 0, 0], angle: 0.25 * down }, { bone: 'head', axis: [-1, 0, 0], angle: 0.12 * down });
      // his work regarded: a small settle, his attention on the statue (no more than that)
      const regard = between(t, 3.55, 3.75) * (1 - between(t, 4.0, 4.2));
      if (regard > 1e-3) rotations.push({ bone: 'chest', axis: [1, 0, 0], angle: 0.05 * regard }, { bone: 'head', axis: [-1, 0, 0], angle: 0.08 * regard }, { bone: 'head', axis: [0, 0, 1], angle: 0.07 * regard });
      // watching it go down
      const watch = between(t, 4.9, 5.3) * (1 - between(t, 5.8, 6.0));
      if (watch > 1e-3) rotations.push({ bone: 'head', axis: [-1, 0, 0], angle: 0.18 * watch });
      // the drink: his head back as the vessel tips, then the tasting (a small nod at each smack), the "Ahhh" (a
      // settle back), and the verdict, with a look down at what is left in the vessel
      const tip = between(t, take(0.05), take(0.5)) * (1 - between(t, take(S.take.slurp[1] - 0.05), take(S.take.slurp[1] + 0.3)));
      if (tip > 1e-3) rotations.push({ bone: 'head', axis: [1, 0, 0], angle: (deep ? 0.36 : 0.14) * tip }, { bone: 'neck', axis: [1, 0, 0], angle: (deep ? 0.12 : 0.04) * tip });
      for (const smack of S.take.smacks) {
        const nod = Math.sin(Math.PI * between(t, take(smack) - 0.02, take(smack) + 0.16));
        if (nod > 1e-3) rotations.push({ bone: 'head', axis: [-1, 0, 0], angle: 0.07 * nod });
      }
      const ahh = between(t, take(S.take.ahh[0]), take(S.take.ahh[0] + 0.3)) * (1 - between(t, take(S.take.ahh[1] - 0.2), take(S.take.ahh[1] + 0.2)));
      if (ahh > 1e-3) rotations.push({ bone: 'head', axis: [1, 0, 0], angle: 0.08 * ahh }, { bone: 'chest', axis: [1, 0, 0], angle: 0.04 * ahh });
      const verdict = between(t, take(S.take.words[0] - 0.25), take(S.take.words[0])) * (1 - between(t, away[0] - 0.1, away[0] + 0.2));
      if (verdict > 1e-3) rotations.push({ bone: 'head', axis: [-1, 0, 0], angle: 0.13 * verdict });
      return { u, v: 0, lift: 0, heading, ...clip, crouch, rotations, spell: this.hand(t), sword: null, vessel: this.vessel(t), near: this.near(t) };
    },
    // the vessel in his spell hand: where the hand holds it (the knight's root space), and how it is carried:
    // { shown, tilt (radians: + tips its rim toward him, - away from him), fill (0..1) }
    vessel(t) {
      const shown = t >= 5.98 && t < away[1] - 0.05;
      if (!shown) return { kind: vessel, shown: false, tilt: 0, fill: 0 };
      // dipped into the heap rim first, then up; tipped back to his visor as he drinks; tipped out (the dregs)
      const dip = between(t, 6.8, 6.92) * (1 - between(t, 6.98, 7.15));
      const sup = between(t, take(0.0), take(0.45)) * (1 - between(t, take(S.take.slurp[1] - 0.05), take(S.take.slurp[1] + 0.3)));
      const drained = between(t, take(0.1), take(S.take.slurp[1]));
      const tipOut = pour ? between(t, 13.45, 13.65) * (1 - between(t, 13.7, 13.85)) : 0;
      const tilt = -1.35 * dip + (deep ? 2.1 : 1.45) * sup - 2.3 * tipOut;
      const filled = between(t, 6.93, 7.0);
      const fill = filled * (1 - drained * (deep ? 0.85 : 0.55)) * (1 - between(t, 13.5, 13.7) * (pour ? 1 : 0));
      return { kind: vessel, shown, tilt, fill };
    },
    // the spell hand: to the belt for the vessel, out in front with it, down into the heap, up to the visor, down to
    // the chest for the tasting, out to the side for the dregs, back to the belt
    hand(t) {
      if (t < 5.82 || t > walk[0] + 0.1) return null;
      const keys = [
        [5.82, [-0.3, 1.0, -0.05]], [5.96, [-0.32, 0.98, 0.04]],
        [6.2, [-0.24, 1.08, -0.34]], [6.55, [-0.22, 1.08, -0.38]],
        [6.85, [-0.16, 0.34, -0.62]], [6.95, [-0.14, 0.26, -0.66]], [7.2, [-0.18, 0.95, -0.5]],
        [take(-0.3), [-0.06, 1.42, -0.36]], [take(0.05), [-0.03, 1.5, -0.27]], [take(S.take.slurp[1]), [-0.03, 1.5, -0.27]],
        [take(S.take.slurp[1] + 0.35), [-0.14, 1.2, -0.38]],
        ...(pour ? [[13.4, [-0.14, 1.2, -0.38]], [13.6, [-0.55, 1.12, -0.32]], [13.8, [-0.5, 1.1, -0.3]]] : [[away[0], [-0.14, 1.2, -0.38]]]),
        [away[1], [-0.32, 0.98, 0.04]],
      ];
      const reach = between(t, 5.82, 5.9) * (1 - between(t, away[1], walk[0] + 0.1));
      const at = [0, 1, 2].map((axis) => keyed(keys.map(([time, point]) => [time, point[axis]]), t));
      // the palm toward the vessel's side (it is held by its body or its rim, upright)
      return arm(blade(at, [0.85, 0.15, -0.5], [0, 1, 0]), reach);
    },
    // how much closer the camera comes (0..1): in for the scoop and the drink, out again as he walks back
    near(t) {
      return between(t, 6.0, 6.7) * (1 - between(t, away[0], walk[1]));
    },
    rival(t) {
      if (t >= S.goneAt) return { gone: true, u: S.meet, v: 0 };
      const press = opening === 'press';
      const clip = clipAt([
        [-99, 'Idle', { loop: true }],
        [-0.9, 'Guard'],
        ...(press
          ? [[0.0, 'Run', { loop: true, rate: 0.32 }], [0.5, 'Guard'], [1.3, 'Slash_2'], [1.95, 'Guard']]
          : [[0.1, 'Run', { loop: true, rate: 0.6 }], [0.7, 'Slash_1'], [1.35, 'Guard']]),
        // the Frostfire takes him mid-flinch, and there he stays
        [S.freezeAt, 'Stagger'],
        [S.freezeAt + 0.14, 'Stagger', { hold: 0.16 }],
      ], t);
      // he comes on at the Spellblade, recoils an inch from the frost, and does not move again
      const u = keyed([[press ? 0.0 : 0.1, S.reach], [press ? 0.55 : 0.7, S.meet], [S.freezeAt, S.meet], [S.freezeAt + 0.14, S.meet + 0.12]], t);
      // frozen (0..1): the frost closing over him; melt (0..1): the statue giving way into the heap
      const frozen = between(t, S.freezeAt, S.frozenBy);
      const melt = between(t, S.melt[0], S.melt[1]);
      return { u, v: 0, lift: 0, heading: Math.PI, ...clip, crouch: 0, rotations: [], frozen, melt };
    },
    cues: [
      ...(opening === 'press'
        ? [{ at: 0.6, type: 'swing', by: 'hero' }, { at: 1.0, type: 'clash' }, { at: 1.3, type: 'swing', by: 'rival' }, { at: 1.72, type: 'clash' }]
        : [{ at: 0.7, type: 'swing', by: 'rival' }, { at: 1.12, type: 'clash' }, { at: 1.4, type: 'swing', by: 'hero' }, { at: 1.82, type: 'clash' }]),
      { at: 2.4, type: 'gather', by: 'hero', spell: 'frostfire', release: 0.32 },
      { at: 2.72, type: 'cast', by: 'hero', spell: 'frostfire', flight: 0.34 },
      { at: S.freezeAt, type: 'impact', on: 'rival', spell: 'frostfire', radius: 1.6 },
      { at: S.freezeAt, type: 'freeze', on: 'rival', seconds: S.frozenBy - S.freezeAt },
      { at: 4.15, type: 'gather', by: 'hero', spell: 'fireball', release: 0.25 },
      { at: 4.4, type: 'cast', by: 'hero', spell: 'fireball', flight: 0.28 },
      { at: S.fireballAt, type: 'impact', on: 'rival', spell: 'fireball', radius: 1.4 },
      { at: S.melt[0], type: 'melt', on: 'rival', seconds: S.melt[1] - S.melt[0] },
      { at: 4.95, type: 'slush', on: 'rival' },
      { at: 5.98, type: 'vessel', by: 'hero', kind: vessel },
      { at: 6.95, type: 'scoop', by: 'hero', kind: vessel },
      // the drink, and the verdict: the moment the vessel reaches his visor (the take is the drinking)
      { at: S.drinkAt, type: 'voice', moment: 'slushEnd', chance: 1 },
      ...(pour ? [{ at: 13.6, type: 'dregs', by: 'hero', kind: vessel }] : []),
      { at: away[1] - 0.05, type: 'stow', by: 'hero', kind: vessel },
    ],
  };
}

export const FIGHTS = Object.freeze([FIREBALL, WHIRLWIND, WHITE_FLAG]);

// the ways the White Flag's rival can run for it, longest first (a stop on the round takes the first that clears)
export const FLEE_ROUTES = Object.freeze([[12.5, 1], [10, 4], [10, -3], [5, -8], [2, -9], [3, 9], [6, 8]]);

/**
 * The fights the round can stage, by name: each gives the versions of itself to try at a stop, in order of
 * preference (random: this round's dice, for what varies from round to round). A new fight joins by adding a line.
 */
export const FIGHT_POOL = Object.freeze({
  fireball: () => [FIREBALL],
  whirlwind: (random = Math.random) => [makeWhirlwind({ turns: 3 + Math.floor(random() * 3) })],
  whiteFlag: () => FLEE_ROUTES.map((flee) => makeWhiteFlag({ flee })),
  // (a round's dice choose each of its variations)
  slush: (random = Math.random) => {
    const pick = (options) => options[Math.min(options.length - 1, Math.floor(random() * options.length))];
    return [makeSlush(Object.fromEntries(Object.entries(SLUSH_VARIANTS).map(([name, options]) => [name, pick(options)])))];
  },
});
