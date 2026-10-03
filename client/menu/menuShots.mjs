// Camera shots for the menu, in Castleward world space. The Spellblade stands on the north green at (-1, 0, 5.5); the
// gatehouse and keep rise behind him. Looking north, +x (east) is on the left of the screen; each camera aims about
// 17 degrees east of him so he stands on the right third, clear of the menu banner. Pure (no three.js) so shots can be tested.

function shot(camera, target, fov) {
  return Object.freeze({ camera: Object.freeze(camera), target: Object.freeze(target), fov });
}

export const MENU_SHOTS = Object.freeze({
  // establishing: high over the town, before settling on the Spellblade
  intro: shot([13, 9, -8], [0.5, 3.5, 12], 46),
  // the front door: the Spellblade on the right third, the gate and keep behind the menu banner
  main: shot([1.4, 1.35, -0.8], [0.35, 3.1, 13.66], 42),
  solo: shot([0.8, 1.4, 1.2], [-0.35, 2.0, 12.14], 38),
  private: shot([1.6, 1.1, 0.2], [-0.39, 5.8, 16.08], 42),
  how: shot([-4.6, 1.6, 0.2], [2.38, 1.7, 5.88], 38),
  lobby: shot([0.6, 2.4, -2.4], [2.15, 3.0, 13.52], 44),
  // the Armory: close on the Spellblade and the spell in his palm, still on the right third
  armory: shot([0.9, 1.55, 1.6], [-0.55, 1.3, 7.42], 40),
});

const SCREEN_SHOTS = Object.freeze({
  MAIN_MENU: 'main',
  SOLO_MENU: 'solo',
  ROOMS_MENU: 'lobby',
  PRIVATE_MENU: 'private',
  HOW_TO_PLAY: 'how',
  LOBBY: 'lobby',
  ARMORY: 'armory',
});

/** The shot for a screen id (or a shot name); anything unknown gets the front door. */
export function menuShotFor(name) {
  return MENU_SHOTS[SCREEN_SHOTS[name] ?? name] ?? MENU_SHOTS.main;
}

/**
 * Whether the camera has arrived at one of the menu's shots: { to (the shot it is going to), duration, elapsed }. Never
 * while it still holds the establishing shot it opens on: the Spellblade's round begins from the front door's shot
 * (which it keeps as its home), so it must not begin before the camera has come down to it. (Begun from the
 * establishing shot, the round took that for home, and the camera went out, in and out again as the menu opened.)
 */
export function shotSettled({ to, duration, elapsed }) {
  return to !== MENU_SHOTS.intro && (duration === 0 || elapsed >= duration);
}

// ease in and out (no jolt at either end of a camera move)
export function easeShot(u) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * t * (t * (6 * t - 15) + 10);
}

export function lerpShot(a, b, t) {
  const mix = (x, y) => x * (1 - t) + y * t;
  return {
    camera: a.camera.map((value, i) => mix(value, b.camera[i])),
    target: a.target.map((value, i) => mix(value, b.target[i])),
    fov: mix(a.fov, b.fov),
  };
}

export function menuMoveSeconds(from, to) {
  return Math.hypot(...from.camera.map((v,i)=>v-to.camera[i])) > 4 ? 1.05 : .85;
}
