import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';

// The mill lane between the sheepfold and the bridge: Rival jumps his way through it ahead of the Spellblade.
function fixture() {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => .25 }); session.start();
  const tick = (n = 1) => { for (let i = 0; i < n; i += 1) { now += 1 / 30; host.tick(); } };
  return { host, session, tick, rival: () => host.room.players.get(session.rivalId) };
}

test('Rival takes the mill lane by its mouth and jumps his way through it: trunk, bales, wain and fence, the brook at a Sprint', () => {
  const { host, session, tick, rival } = fixture();
  const lane = GREENER_ROUTE.millLane;
  session.stage('bridge-dash'); session.director.resumeAt('bridge-arrival'); session.rival.enter('rival-bridge', host.now());
  rival().position = { x: lane.centerX, y: 0, z: lane.entryZ + 6 };
  session.rival.waypoint = GREENER_ROUTE.chaseWaypoints.findIndex(point => point.id === 'mill-lane-entry');
  host.player.position = { x: lane.centerX, y: 0, z: lane.entryZ + 20 };
  let lowest = Infinity, northmost = -Infinity, onWain = false;
  for (let i = 0; i < 30 * 15 && rival().position.z > lane.exitZ - 1; i += 1) {
    tick();
    lowest = Math.min(lowest, rival().position.y);
    northmost = Math.max(northmost, rival().position.z);
    onWain ||= rival().grounded && rival().position.y > lane.wain.height - 0.05;
  }
  assert.ok(rival().position.z < lane.exitZ - 1, `through the lane (at ${rival().position.z.toFixed(1)})`);
  assert.ok(northmost < lane.entryZ + 7, 'never back north for the long way round');
  assert.ok(onWain, 'over the fence by way of the wain');
  assert.ok(lowest > -0.2, 'never in the brook');
  host.close();
});
