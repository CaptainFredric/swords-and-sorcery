// Touch input math, kept free of the DOM so it runs in node tests.
//
// The left half of the screen is a floating joystick: it appears where the thumb lands. Tilt beyond the dead zone
// moves; pushing it to the rim straight ahead sprints (like holding Shift), so a thumb can sprint without letting
// go of the stick. The right half turns the view.

export const TOUCH = Object.freeze({
  stickRadius: 56,          // px from the stick centre to its rim
  deadZone: 0.14,           // share of the radius that does nothing
  sprintAt: 0.92,           // share of the radius that engages sprint...
  sprintForward: 0.75,      // ...when the stick points at least this much straight ahead
  lookYawPerPx: 0.0058,     // radians of turn per px of drag
  lookPitchPerPx: 0.0048,
});

/**
 * @param {number} dx thumb offset from where the stick was planted (px, +x right)
 * @param {number} dy (px, +y down the screen)
 * @returns {{forward:number, right:number, magnitude:number, sprint:boolean, knob:{x:number,y:number}}}
 */
export function stickVector(dx, dy, { radius = TOUCH.stickRadius, deadZone = TOUCH.deadZone } = {}) {
  const distance = Math.hypot(dx, dy);
  const clamped = Math.min(distance, radius);
  const unitX = distance > 1e-6 ? dx / distance : 0;
  const unitY = distance > 1e-6 ? dy / distance : 0;
  const knob = { x: unitX * clamped, y: unitY * clamped };
  const raw = clamped / radius;
  if (raw <= deadZone) return { forward: 0, right: 0, magnitude: 0, sprint: false, knob };
  const magnitude = (raw - deadZone) / (1 - deadZone);
  const forward = -unitY * magnitude;
  const right = unitX * magnitude;
  const sprint = raw >= TOUCH.sprintAt && -unitY >= TOUCH.sprintForward;
  return { forward, right, magnitude, sprint, knob };
}

export function lookDelta(dx, dy) {
  return { yaw: -dx * TOUCH.lookYawPerPx, pitch: -dy * TOUCH.lookPitchPerPx };
}

// A phone or tablet: coarse pointer with no hover (a touchscreen laptop with a mouse keeps the mouse controls).
export function isTouchPrimary(matchMedia = globalThis.matchMedia?.bind(globalThis)) {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}
