import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';

function fixture() {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => 0.25 });
  session.start();
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now += 1 / 30;
      host.tick();
    }
  };
  return {
    host,
    session,
    tick,
    now: () => now,
    player: () => host.player,
    rival: () => host.room.players.get(session.rivalId),
  };
}

test('Fireball chapter entry stages player and Rival at the clearing, not the opening pursuit', () => {
  const { host, session, player, rival } = fixture();

  const success = session.beginChapter('fireball');
  assert.equal(success, true, 'beginChapter("fireball") succeeds');

  // Verify player position matches the fireball checkpoint (-44, 0, -312)
  const expectedPlayer = GREENER_ROUTE.checkpointPositions.fireball;
  assert.equal(player().position.x, expectedPlayer.x);
  assert.equal(player().position.y, expectedPlayer.y);
  assert.equal(player().position.z, expectedPlayer.z);

  // Verify Rival position matches the fireball waypoint (-43.04, 0, -326.96)
  const expectedRival = GREENER_ROUTE.waypointById.fireball;
  assert.equal(rival().position.x, expectedRival.x);
  assert.equal(rival().position.y, expectedRival.y);
  assert.equal(rival().position.z, expectedRival.z);

  // Must not be at earlier pursuit checkpoint (11.63, 0, -38)
  const pursuitCheckpoint = GREENER_ROUTE.checkpointPositions.pursuit;
  assert.notEqual(player().position.z, pursuitCheckpoint.z);
  assert.notEqual(rival().position.z, GREENER_ROUTE.waypointById.escape.z);

  // Checkpoint is recorded as 'fireball'
  assert.equal(session.checkpoint, 'fireball');

  // Spell permissions and equipped spell
  assert.equal(session.allows('spell', false), true, 'Fireball permission granted');
  assert.equal(player().spell, 'fireball');

  // Rival enters escape mode
  assert.equal(session.rival.mode, 'escape');
  assert.equal(session.rival.standingConfrontation, false);

  host.close();
});

test('retrying during Fireball chapter respawns at clearing and preserves spell permissions without regression to pursuit', () => {
  const { host, session, tick, player, rival } = fixture();

  session.beginChapter('fireball');
  assert.equal(session.checkpoint, 'fireball');

  // Player runs forward with input
  player().input = { forward: 1, right: 0, yaw: 0, pitch: 0, sprint: true, jump: false, crouch: false };
  tick(30);
  assert.ok(player().position.z < -312, 'Player has moved forward into clearing');

  // Trigger retry (e.g. death or manual retry during fireball encounter)
  session.retry({ automatic: true });

  // Verify player respawns at the fireball checkpoint, not pursuit
  const expectedPlayer = GREENER_ROUTE.checkpointPositions.fireball;
  assert.equal(player().position.x, expectedPlayer.x);
  assert.equal(player().position.y, expectedPlayer.y);
  assert.equal(player().position.z, expectedPlayer.z);

  // Verify Rival respawns at fireball waypoint
  const expectedRival = GREENER_ROUTE.waypointById.fireball;
  assert.equal(rival().position.x, expectedRival.x);
  assert.equal(rival().position.y, expectedRival.y);
  assert.equal(rival().position.z, expectedRival.z);

  // Checkpoint remains 'fireball'
  assert.equal(session.checkpoint, 'fireball');

  // Permissions and spell remain ready
  assert.equal(session.allows('spell', false), true);
  assert.equal(player().spell, 'fireball');
  assert.equal(session.rival.mode, 'escape');

  host.close();
});

test('Fireball hit advances encounter into dead-end and bridge without losing story facts', () => {
  const { host, session, tick, player, rival } = fixture();

  session.beginChapter('fireball');
  session.director.resumeAt('halt-order');
  tick(2);

  // Standoff active
  assert.equal(session.rival.standingConfrontation, true);

  // Hit Rival with Fireball
  session.events([{
    type: 'damage',
    victimId: rival().id,
    attackerId: player().id,
    amount: 20,
    source: 'fireball',
    health: 80,
  }]);

  assert.equal(session.firstFireballHit, true, 'firstFireballHit recorded');
  assert.equal(session.director.facts.has('fireball-hit'), true, 'fireball-hit fact established');

  // Complete cold complaint -> resumes fleeing
  session.director.completeDialogue({ id: 'rival-cold' });
  tick(5);
  assert.equal(session.rival.standingConfrontation, false, 'Standoff ends after fireball hit');

  // Advance to dead-end
  session.director.resumeAt('dead-end-arrival');
  tick(2);
  assert.equal(session.firstFireballHit, true, 'firstFireballHit persists in dead-end');

  // Advance to bridge
  session.director.resumeAt('bridge-arrival');
  tick(2);
  assert.equal(session.checkpoint, 'bridge-dash');
  assert.equal(session.firstFireballHit, true, 'firstFireballHit persists across bridge');

  host.close();
});
