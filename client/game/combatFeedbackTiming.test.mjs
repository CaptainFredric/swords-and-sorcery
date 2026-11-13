import test from 'node:test';
import assert from 'node:assert/strict';
import { combatStatusDurationMs, compactCombatStatusDurationMs } from './combatFeedbackTiming.mjs';

test('CLANG is an impact-frame cue rather than a lingering subtitle', () => {
  const duration = combatStatusDurationMs('CLANG!');
  assert.ok(duration >= 140);
  assert.ok(duration <= 220);
});

test('important combat messages remain visible longer than CLANG', () => {
  const clang = combatStatusDurationMs('CLANG!');
  const parry = combatStatusDurationMs('PARRY');
  const broken = combatStatusDurationMs('GUARD BROKEN');
  const kill = combatStatusDurationMs('SLAIN  +1');
  assert.ok(parry > clang);
  assert.ok(broken > parry);
  assert.ok(kill >= broken);
});

test('unknown status messages retain a restrained default duration', () => {
  const duration = combatStatusDurationMs('FIGHT!');
  assert.ok(duration >= 350 && duration <= 550);
});

test('Ultimate, view and ordinary notices are briefer without making impact-frame labels vanish',()=>{
  assert.equal(compactCombatStatusDurationMs('CLANG!'),180);
  assert.ok(compactCombatStatusDurationMs('VIEW: THIRD PERSON')<combatStatusDurationMs('VIEW: THIRD PERSON'));
  assert.equal(compactCombatStatusDurationMs('FIGHT!',1400),1148);
  assert.equal(compactCombatStatusDurationMs('THUNDER ALL THAT RUSTS',1200),984);
  assert.equal(compactCombatStatusDurationMs('PARRY'),279);
  assert.equal(compactCombatStatusDurationMs('DO NOT FLASH',0),0);
  assert.equal(compactCombatStatusDurationMs('CLANG!',180),180);
});
