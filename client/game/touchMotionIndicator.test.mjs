import test from 'node:test';
import assert from 'node:assert/strict';
import { touchMotionIndicator, TOUCH_MOTION_LABELS } from './touchMotionIndicator.mjs';

const knight = (overrides = {}) => ({
  id: 'knight', alive: true, sprinting: false,
  operatingRamId: null, operatingBallistaId: null, operatingFightFlightId: null,
  ...overrides,
});
const ram = (overrides = {}) => ({
  id: 'ram-1', health: 1400, operatorId: 'knight',
  charging: false, retired: false, ...overrides,
});

test('the cavity is idle until the server confirms actual sprint', () => {
  assert.equal(touchMotionIndicator(knight()), 'idle');
  assert.equal(touchMotionIndicator(knight({ sprinting: true })), 'sprinting');
  assert.equal(TOUCH_MOTION_LABELS.sprinting, 'SPRINTING');
  assert.equal(touchMotionIndicator(knight({ sprinting: false })), 'idle',
    'a joystick held short of a valid sprint is not labelled sprinting');
  assert.equal(touchMotionIndicator(knight({ sprinting: true, alive: false })), 'idle');
  assert.equal(touchMotionIndicator(knight({ sprinting: true }), null, { active: false }), 'idle');
  assert.equal(touchMotionIndicator(knight({ sprinting: true }), null, { inspectionFlight: true }), 'idle');
});
test('ram charge only when authoritative ram is actively accelerating under this driver', () => {
  const owner=knight({ operatingRamId: 'ram-1', sprinting: true });
  assert.equal(touchMotionIndicator(owner, { soFistication: ram({ charging: true }) }), 'charging');
  assert.equal(TOUCH_MOTION_LABELS.charging,'CHARGING');
  assert.equal(touchMotionIndicator(owner, { soFistication: ram() }), 'idle',
    'a pressed charge button is not proof the ram has enough pressure');
  assert.equal(touchMotionIndicator(owner, { soFistication: ram({ charging: true, operatorId: 'enemy' }) }), 'idle');
  assert.equal(touchMotionIndicator(owner, { soFistication: ram({ charging: true, id: 'previous-machine' }) }), 'idle');
  assert.equal(touchMotionIndicator(owner, { soFistication: ram({ charging: true, health: 0 }) }), 'idle');
  assert.equal(touchMotionIndicator(owner, { soFistication: ram({ charging: true, retired: true }) }), 'idle');
  assert.equal(touchMotionIndicator(owner, null), 'idle');
});
test('mount transitions cannot display infantry sprint while operating other siege engines', () => {
  assert.equal(touchMotionIndicator(knight({ sprinting:true, operatingBallistaId:'ballista-1' })), 'idle');
  assert.equal(touchMotionIndicator(knight({ sprinting:true, operatingFightFlightId:'flight-1' })), 'idle');
  assert.equal(touchMotionIndicator(knight({ operatingRamId:'ram-1' }), {
    soFistication:ram({ charging:true }),
  }, { active:false }), 'idle');
});
