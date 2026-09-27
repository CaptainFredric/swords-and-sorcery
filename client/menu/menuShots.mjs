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
});

const SCREEN_SHOTS = Object.freeze({
  MAIN_MENU: 'main',
  SOLO_MENU: 'solo',
  PRIVATE_MENU: 'private',
  HOW_TO_PLAY: 'how',
  LOBBY: 'lobby',
});

/** The shot for a screen id (or a shot name); anything unknown gets the front door. */
export function menuShotFor(name) {
  return MENU_SHOTS[SCREEN_SHOTS[name] ?? name] ?? MENU_SHOTS.main;
}

// ease in and out (no jolt at either end of a camera move)
export function easeShot(u) {
  const t = Math.max(0, Math.min(1, u));
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

export function lerpShot(a, b, t) {
  const mix = (x, y) => x * (1 - t) + y * t;
  return {
    camera: a.camera.map((value, i) => mix(value, b.camera[i])),
    target: a.target.map((value, i) => mix(value, b.target[i])),
    fov: mix(a.fov, b.fov),
  };
}
