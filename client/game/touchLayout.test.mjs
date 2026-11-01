import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ON_FOOT_LAYOUT,
  DEFAULT_FLIGHT_LAYOUT,
  mirrorLayoutHorizontal,
  clampPlacement,
  loadTouchLayout,
  saveTouchLayout,
  applyLayoutItem,
  MIN_BUTTON_SIZE,
  MAX_BUTTON_SIZE,
} from './touchLayout.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('touch layout defaults: on-foot and flight layouts contain all required controls', () => {
  // On-foot controls
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.stick);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.attack);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.guard);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.dash);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.jump);
  assert.ok(DEFAULT_ON_FOOT_LAYOUT.spell);

  // Flight controls: Section A & B specification
  assert.ok(DEFAULT_FLIGHT_LAYOUT.stick);
  assert.equal(DEFAULT_FLIGHT_LAYOUT.flightRise, undefined, 'rail is anchored to the stick, not a legacy button');
  assert.equal(DEFAULT_FLIGHT_LAYOUT.flightLower, undefined);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.guard);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.attack);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.jump);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeWeapon);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeSkill);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.dash);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.ultimate);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeView);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.interact);

  // Check Section A right-side combat ladder arrangement:
  // Bottom row: Guard (left), Sword (right)
  assert.equal(DEFAULT_FLIGHT_LAYOUT.guard.bottom, 24);
  assert.equal(DEFAULT_FLIGHT_LAYOUT.attack.bottom, 24);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.guard.right > DEFAULT_FLIGHT_LAYOUT.attack.right, 'Guard is left of Sword');

  // Second row: Bolt (left, wider), Jump (right)
  assert.equal(DEFAULT_FLIGHT_LAYOUT.jump.bottom, 105);
  assert.equal(DEFAULT_FLIGHT_LAYOUT.siegeWeapon.bottom, 105);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeWeapon.right > DEFAULT_FLIGHT_LAYOUT.jump.right, 'Bolt is left of Jump');
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeWeapon.width > DEFAULT_FLIGHT_LAYOUT.jump.size, 'Bolt has a wider sustained-fire target');

  // Third row: Fire Away (left), Dash (right)
  assert.equal(DEFAULT_FLIGHT_LAYOUT.siegeSkill.bottom, 172);
  assert.equal(DEFAULT_FLIGHT_LAYOUT.dash.bottom, 172);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.siegeSkill.right > DEFAULT_FLIGHT_LAYOUT.dash.right, 'Fire Away is left of Dash');

  // Above ordinary cluster: Ultimate
  assert.ok(DEFAULT_FLIGHT_LAYOUT.ultimate.bottom > DEFAULT_FLIGHT_LAYOUT.dash.bottom, 'Ultimate is above Dash');

  // Vertical flight rail is mechanically attached to the stick and mirrors with it.
  assert.ok(DEFAULT_FLIGHT_LAYOUT.stick.left > 0);
  assert.ok(DEFAULT_FLIGHT_LAYOUT.attack.width > DEFAULT_FLIGHT_LAYOUT.attack.height, 'Sword has a wider aim-and-attack target');
});

test('mirrorLayoutHorizontal swaps left and right anchors and marks customized', () => {
  const orig = {
    stick: { left: 118, bottom: 110, size: 112 },
    attack: { right: 24, bottom: 24, size: 74 },
  };
  const mirrored = mirrorLayoutHorizontal(orig);
  assert.equal(mirrored.stick.right, 118);
  assert.equal(mirrored.stick.left, undefined);
  assert.equal(mirrored.attack.left, 24);
  assert.equal(mirrored.attack.right, undefined);
  assert.equal(mirrored.stick.custom, true);
  assert.equal(mirrored.attack.custom, true);
});

test('clampPlacement enforces minimum target dimensions and safe screen bounds', () => {
  const viewport = { width: 800, height: 450 };

  // Too small size is clamped to MIN_BUTTON_SIZE
  const small = clampPlacement({ right: 20, bottom: 20, size: 20 }, viewport);
  assert.equal(small.size, MIN_BUTTON_SIZE);

  // Too large size is clamped to MAX_BUTTON_SIZE
  const large = clampPlacement({ right: 20, bottom: 20, size: 200 }, viewport);
  assert.equal(large.size, MAX_BUTTON_SIZE);

  // Position out of bounds is clamped inside viewport
  const outOfBounds = clampPlacement({ left: -50, top: -100, size: 50 }, viewport);
  assert.ok(outOfBounds.left >= 4);
  assert.ok(outOfBounds.top >= 4);

  const overflowRight = clampPlacement({ right: 900, bottom: 600, size: 50 }, viewport);
  assert.ok(overflowRight.right <= viewport.width - 50);
  assert.ok(overflowRight.bottom <= viewport.height - 50);
});

test('loadTouchLayout and saveTouchLayout roundtrip via storage', () => {
  const storage = memoryStorage();
  const initial = loadTouchLayout(storage);
  assert.equal(initial.handedness, 'right');
  assert.equal(initial.opacity, 0.85);

  initial.opacity = 0.6;
  initial.handedness = 'left';
  initial.flight.attack.size = 85;
  saveTouchLayout(initial, storage);

  const reloaded = loadTouchLayout(storage);
  assert.equal(reloaded.opacity, 0.6);
  assert.equal(reloaded.handedness, 'left');
  assert.equal(reloaded.flight.attack.size, 85);
});

test('applyLayoutItem sets inline CSS custom properties only when customized', () => {
  const element = {
    style: {
      setProperty: (k, v) => { element.style[k] = v; },
    },
  };

  // Not custom: does not overwrite CSS
  applyLayoutItem(element, { right: 24, bottom: 24, size: 74, custom: false });
  assert.equal(element.style.right, undefined);

  // Custom: applies positions and size
  applyLayoutItem(element, { right: 30, bottom: 40, size: 70, custom: true });
  assert.match(element.style.right, /30px/);
  assert.match(element.style.bottom, /40px/);
  assert.equal(element.style['--size'], '70px');
});
