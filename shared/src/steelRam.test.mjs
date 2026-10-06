import test from 'node:test';
import assert from 'node:assert/strict';
import { STEEL_RAM, chargeTarget, ramContact, ramEffect, ramStrength } from './steelRam.mjs';
import { STEEL, callSteel } from './steel.mjs';

// The Steel Dash Ram's own rules: how strong a ram a dash is, what it does at that strength, and whom a dash meets.

test('a dash is a ram as strong as the plate is as it begins; plate all but worn off makes none', () => {
  const steel = callSteel(0);
  assert.equal(ramStrength(steel, 1), 1, 'full plate');
  assert.ok(Math.abs(ramStrength(steel, STEEL.fullSec + STEEL.fadeSec / 2) - 0.5) < 1e-9, 'half worn');
  assert.equal(ramStrength(steel, STEEL.fullSec + STEEL.fadeSec * 0.9), 0, 'a tenth left: no ram');
  assert.equal(ramStrength(null, 1), 0, 'no plate');
});

test('full plate rams for 12, a 4 m/s shove and 24 balance; half-worn for half; a guard braces against it', () => {
  assert.deepEqual(ramEffect(1), { damage: 12, shove: 4, lift: 0.25, stagger: 24, guardStamina: 0 });
  const half = ramEffect(0.5);
  assert.equal(half.damage, 6);
  assert.equal(half.shove, 2);
  assert.equal(half.stagger, 12);
  const braced = ramEffect(1, { guarded: true });
  assert.equal(braced.damage, 0, 'no harm through a guard');
  assert.equal(braced.guardStamina, STEEL_RAM.guard.stamina);
  assert.ok(Math.abs(braced.shove - 4 * 0.45) < 1e-9 && Math.abs(braced.stagger - 24 * 0.4) < 1e-9);
  assert.equal(ramEffect(0.5, { guarded: true }).guardStamina, STEEL_RAM.guard.stamina / 2, 'the guard pays by the ram\'s strength');
});

test('a dash meets the first body on its way, between ticks too; never one it is leaving, nor one well above it', () => {
  const at = (x, z, y = 0) => ({ x, y, z });
  // a whole tick's travel (2.8 m) that would carry it past a body standing in the middle of it
  const met = ramContact(at(0, 0), at(0, -2.8), [{ id: 'b', position: at(0, -1.4) }]);
  assert.equal(met.id, 'b');
  assert.ok(Math.abs(met.at.z - (-1.4 + STEEL_RAM.reach)) < 1e-9, 'stopped where the two bodies meet');
  assert.ok(Math.abs(met.normal.z + 1) < 1e-9);
  // the first of two in line
  assert.equal(ramContact(at(0, 0), at(0, -5), [{ id: 'far', position: at(0, -3.5) }, { id: 'near', position: at(0.2, -2) }]).id, 'near');
  // off to one side of the way: missed
  assert.equal(ramContact(at(0, 0), at(0, -5), [{ id: 'b', position: at(1.2, -2) }]), null);
  // already touching: only a way into them is a ram
  assert.equal(ramContact(at(0, 0), at(0, 0.9), [{ id: 'b', position: at(0, -0.6) }]), null, 'dashing away');
  assert.equal(ramContact(at(0, 0), at(0, -0.9), [{ id: 'b', position: at(0, -0.6) }]).t, 0, 'dashing into them');
  // over their head
  assert.equal(ramContact(at(0, 0, 2), at(0, -5, 2), [{ id: 'b', position: at(0, -2) }]), null);
});

test('a Steel charge is at the nearest knight nearly straight ahead and near enough', () => {
  const bodies = [{ id: 'ahead', position: { x: 0.5, y: 0, z: -5 } }, { id: 'aside', position: { x: 4, y: 0, z: -2 } }, { id: 'far', position: { x: 0, y: 0, z: -12 } }];
  assert.equal(chargeTarget({ x: 0, y: 0, z: 0 }, { x: 0, z: -1 }, bodies), 'ahead');
  assert.equal(chargeTarget({ x: 0, y: 0, z: 0 }, { x: 0, z: 1 }, bodies), null, 'away from all of them');
  assert.equal(chargeTarget({ x: 0, y: 0, z: 0 }, { x: 0, z: -1 }, bodies.slice(1)), null, 'aside and too far');
});
