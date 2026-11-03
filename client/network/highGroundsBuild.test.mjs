import test from 'node:test';
import assert from 'node:assert/strict';
import { GameLink } from './GameLink.mjs';
import { LocalHost } from './LocalHost.mjs';
import { HIGH_GROUNDS_RULES } from '../../shared/sim/highGroundsMode.mjs';

// The whole path a player's build order takes, as the menu starts it: the link the page calls, the local host, the
// room. (The room's own tests called the room directly, and the link never carried the order: the foundry's buttons
// did nothing.)
function soloHighGrounds() {
  const remote = { on: () => {}, highGroundsBuild: () => { throw new Error('a solo match must not go online'); } };
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: () => {} });
  const link = new GameLink({ remote, local });
  link.startSolo('HIGH_GROUNDS', 'Aden', 'high-grounds', 'KNIGHT', 'ATTACKERS', 4);
  local.room.startMatch(local.now());
  const me = local.room.players.get(local.player.id);
  return { link, local, room: local.room, me };
}

test('a High Grounds match begins beside your own foundry, within reach of its controls', () => {
  const { room, me } = soloHighGrounds();
  assert.equal(room.mode, 'HIGH_GROUNDS');
  const foundry = room.highGrounds.foundries.find((f) => f.team === me.team);
  const spawn = room.initialSpawnFor(me, 0, 0);
  assert.equal(spawn.forward, false, 'the first spawn is the home camp, not the forward camp');
  assert.ok(Math.hypot(spawn.x - foundry.x, spawn.z - foundry.z) <= HIGH_GROUNDS_RULES.foundryInteractRadius);
});

test('the link carries a build order to the foundry, and every machine can be built from the camp', () => {
  for (const [machine, field] of [['bi-bye-llista', 'biByeLlista'], ['so-fist-ication', 'soFistication'],
    ['fight-and-flight', 'fightFlight']]) {
    const { link, room, me } = soloHighGrounds();
    assert.equal(typeof link.highGroundsBuild, 'function');
    const spawn = room.initialSpawnFor(me, 0, 0);
    Object.assign(me.position, { x: spawn.x, y: spawn.y, z: spawn.z });
    link.highGroundsBuild(machine);
    assert.ok(room[field], `${machine} was built from the home camp`);
    assert.equal(room[field].team, me.team);
  }
});
