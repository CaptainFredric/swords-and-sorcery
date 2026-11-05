import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerClock } from './serverClock.mjs';

test('server time does not jump backward when late snapshots arrive in bursts', () => {
  const clock=new ServerClock();
  assert.equal(clock.now(500),0);
  clock.observe(100,1000);
  const first=clock.now(1040);
  clock.observe(100+1/30,1120); // server advanced 33ms; arrival took 120ms
  const later=clock.now(1120);
  assert.ok(later>=first,'clock is monotonic');
  clock.observe(100+2/30,1130); // fast burst
  assert.ok(clock.now(1130)>=later);
  const previous=clock.now(1130);
  assert.ok(clock.now(1200)>previous);
});

test('a restarted server resets the epoch without carrying the previous monotonic floor', () => {
  const clock=new ServerClock();
  clock.observe(500,1000);
  clock.now(1100);
  clock.observe(5,1200);
  assert.ok(clock.now(1200)>=5 && clock.now(1200)<6);
});
