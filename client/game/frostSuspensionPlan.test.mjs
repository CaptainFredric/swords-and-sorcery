import test from 'node:test';
import assert from 'node:assert/strict';
import { frostSuspensionProfile } from './frostSuspensionPlan.mjs';
import { ONE_HIT_FROST_LINGER_SEC } from '../../shared/src/oneHitStatus.mjs';

test('Half Frost has a bounded shallow dome sharing the real contact timing', () => {
  const half = frostSuspensionProfile(1, 3.4);
  assert.equal(half.contactSeconds, ONE_HIT_FROST_LINGER_SEC);
  assert.ok(half.height > 1.5 && half.height < half.radius);
  assert.equal(half.shards, 34);
  assert.equal(half.mist, 21);
});

test('Full Frost enriches the same contact visualization without extending damage', () => {
  const half = frostSuspensionProfile(1, 3.4);
  const full = frostSuspensionProfile(2, 3.4);
  assert.equal(full.contactSeconds, half.contactSeconds);
  assert.equal(full.radius, half.radius);
  assert.ok(full.shards > half.shards && full.mist > half.mist);
});

test('aerial, missing or uninfused contacts do not allocate the dome', () => {
  assert.equal(frostSuspensionProfile(0, 3.4), null);
  assert.equal(frostSuspensionProfile(1, 0), null);
  const reduced = frostSuspensionProfile(1, 3.4, .45);
  assert.ok(reduced.shards < frostSuspensionProfile(1, 3.4).shards);
  assert.ok(reduced.mist < frostSuspensionProfile(1, 3.4).mist);
});
