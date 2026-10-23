import test from 'node:test';
import assert from 'node:assert/strict';
import { biByeUpperAnimation, biByeAnimation, biByeWheelSteering, biByeWheelTravel } from './biByePresentation.mjs';

test('spent state retains the firing recovery until its authored completion event', () => {
  const b = { mode: 'DEPLOYED', state: 'SPENT', firedAt: 10, reloadStartedAt: 12.2 };
  assert.equal(biByeAnimation(b, 10.8).name, '02_BiBye_TwoStage_Fire');
  assert.equal(biByeAnimation(b, 12.19).name, '02_BiBye_TwoStage_Fire');
  assert.equal(biByeAnimation({ ...b, state: 'RELOADING' }, 12.2).time, 0);
  assert.equal(biByeAnimation({ ...b, state: 'RELOADING' }, 15.2).time, 4);
});
test('late snapshots and repeated volleys seek their own authoritative action clock', () => {
  assert.equal(biByeAnimation({ mode: 'DEPLOYED', state: 'FIRING', firedAt: 11 }, 11.5).time, .5);
  assert.equal(biByeAnimation({ mode: 'DEPLOYED', state: 'FIRING', firedAt: 20 }, 20.1).time.toFixed(1), '0.1');
});
test('mobile recoil and reload share the real three second cooldown', () => {
  const b = { mode: 'MOBILE', state: 'LOADED', mobileFiredAt: 4, smallBoltReadyAt: 7 };
  assert.equal(biByeAnimation(b, 4.3).name, '09_BiBye_Mobile_Shot1_Fire');
  assert.equal(biByeAnimation(b, 5).name, '10_BiBye_Mobile_Shot1_Reload');
  assert.equal(biByeAnimation(b, 7).name, '06_BiBye_Travel_Ready');
});
test('destroyed animation reaches its stable terminal pose', () => {
  assert.deepEqual(biByeAnimation({ mode: 'DESTROYED', destroyedAt: 2 }, 10), { name: '12_BiBye_Damaged_Destroyed', time: 1.8 });
});
test('wheel steering gives inner and outer wheels different angles with correct countersteer', () => {
  const right = biByeWheelSteering(1);
  assert.ok(right[1] < right[0] && right[0] < 0);
  assert.ok(right[5] > right[4] && right[4] > 0);
  assert.deepEqual(biByeWheelSteering(0), [0, 0, 0, 0, 0, 0]);
});
test('each wheel rolls from its own signed ground travel and holds when stationary', () => {
  const a = { x: 0, z: 0, heading: 0 };
  const straight = biByeWheelTravel(a, { ...a, z: -.55 }, biByeWheelSteering(0));
  for (const roll of straight) assert.ok(Math.abs(roll - 1) < 1e-8);
  for (const roll of biByeWheelTravel(a, a, biByeWheelSteering(1))) assert.equal(Math.abs(roll), 0);
  const turn = biByeWheelTravel(a, { x: .005, z: -.1, heading: -.025 }, biByeWheelSteering(1));
  assert.ok(turn[0] < turn[1]);
});

test('upper recoil and recock remain independent of the main reload action',()=>{
 const b={mode:'DEPLOYED',state:'RELOADING',reloadStartedAt:2.2,upperFiredAt:3,upperShotKind:'independent',smallBoltReadyAt:5.7};
 assert.equal(biByeAnimation(b,3.3).name,'04_BiBye_Mechanical_Reload');
 assert.equal(biByeUpperAnimation(b,3.3).name,'09_BiBye_Mobile_Shot1_Fire_Upper');
 assert.equal(biByeUpperAnimation(b,4).name,'10_BiBye_Mobile_Shot1_Reload_Upper');
 assert.equal(biByeUpperAnimation(b,5.7).name,'01_BiBye_LoadedIdle_Upper');
});
