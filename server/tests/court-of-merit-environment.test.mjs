// The Court of Merit as a place to fight and be judged: closed to the void for a knight standing or crouched, one
// level of floor with nothing to hide behind or run round for ever, every rival able to reach the champion, and the
// Rightful Renowner fixed where its ceremony expects it and in plain view from every spawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorld } from '../../shared/worlds/registry.mjs';
import { routeBetween, runClear } from '../../shared/sim/botNav.mjs';
import { findSwordWorldHit } from '../../shared/src/collision.mjs';
import { floodWorld } from '../../scripts/world-audit.mjs';

const court = getWorld('court-of-merit');

test('no knight can walk, crouch or hop out of the court, nor stand under a floor', () => {
  for (const height of [1.8, 1.2]) {
    const flood = floodWorld(court, { height });
    assert.deepEqual(flood.leaks, [], `${height} m body found the void at ${JSON.stringify(flood.leaks.slice(0, 3))}`);
    assert.equal(flood.headClips.length, 0);
  }
});

test('the Rightful Renowner stands exactly where the ceremony expects it', () => {
  const body = court.solids.find((s) => s.id === 'renowner-tribunal-body');
  const podium = court.solids.find((s) => s.id === 'renowner-tribunal-podium');
  assert.deepEqual(body.center.map(v=>+v.toFixed(3)), [0, 3.65, 16.2]);
  assert.deepEqual(body.size.map((v) => +v.toFixed(3)), [2.432, 4.5, 2.186]);
  assert.deepEqual(podium.center.map(v=>+v.toFixed(3)), [0, 1.32, 16.2]);
  assert.ok(Math.abs(body.center[1] - body.size[1] / 2 - podium.center[1] - podium.size[1] / 2)<1e-9);
});

test('nothing on the trial floor is thick enough to run round while a blade reaches across it', () => {
  const onFloor = court.solids.filter((s) => Math.abs(s.center[0]) < 17.5 && s.center[2] > -17.5 && s.center[2] < 10.4);
  for (const s of onFloor) {
    // a sword (2.35 m from the eyes) reaches past a solid narrower than about two body widths
    assert.ok(Math.min(s.size[0], s.size[2]) <= 1.2, `${s.id} is ${s.size[0]} x ${s.size[2]} m`);
  }
  // and the champion's high ground is only the tribunal, which the rivals reach by its stairs
  const raised = court.floors.filter((f) => f.y > 0.05).map((f) => f.id).sort();
  assert.deepEqual(raised, ['tribunal-dais', 'tribunal-seat-floor']);
});

test('every wave entrance reaches the champion and the tribunal; the Renowner is in sight from every spawn', () => {
  const champion = court.spawnPoints[0];
  for (const s of court.spawnPoints.slice(1)) {
    assert.ok(runClear(court, s, champion) || routeBetween(court, s, champion), `rival at ${JSON.stringify(s)} cannot reach the champion`);
    assert.ok(runClear(court, s, { x: 0, y: 0.8, z: 13 }) || routeBetween(court, s, { x: 0, y: 0.8, z: 13 }), 'the tribunal is out of reach');
    const eye = [s.x, (s.y ?? 0) + 1.5, s.z];
    const head = [0, 5.2, 16.2];
    const dir = head.map((v, i) => v - eye[i]);
    const hit = findSwordWorldHit(eye, dir, Math.hypot(...dir), court.solids.filter((x) => !x.id.startsWith('renowner-')));
    assert.equal(hit, null, `from ${JSON.stringify(s)} the Renowner is hidden by ${hit?.box?.id}`);
  }
});
