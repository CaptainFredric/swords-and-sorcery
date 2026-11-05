import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedTickScheduler } from '../src/fixedTickScheduler.mjs';

test('fixed-step host catches up a few missed ticks and publishes only the final snapshot', () => {
  const steps = [];
  let measured = 0;
  const clock = createFixedTickScheduler({ step: (at, publish) => steps.push({ at, publish }),
    measure: () => measured++ });
  assert.equal(clock.run(0), 1);
  assert.equal(clock.run(1/30), 1);
  assert.equal(clock.run(4/30), 3);
  assert.deepEqual(steps.map(s=>s.publish), [true,true,false,false,true]);
  assert.ok(Math.abs(steps[4].at - 4/30) < 1e-8);
  assert.equal(clock.stats().catchupSteps, 2);
  assert.equal(clock.stats().peakStepMs, 1);
});

test('extreme lag cannot create an unbounded catch-up loop or snapshot storm', () => {
  const publishing = [];
  const clock = createFixedTickScheduler({step:(at,publish)=>publishing.push(publish)});
  clock.run(1);
  assert.equal(clock.run(8), 3);
  assert.equal(publishing.filter(Boolean).length, 2);
  assert.ok(clock.stats().skippedSteps > 100);
  assert.equal(clock.run(8), 0);
});
