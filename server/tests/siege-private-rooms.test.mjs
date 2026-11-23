// Private and public Siege Blades rooms carry their own rules (format, rounds or cap, sides, bots) to the
// authoritative mode, never a generic match time; Renown Trials stay one player's trial.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { Room } from '../../shared/sim/Room.mjs';
import { applyRoomCommand, serializeLobby } from '../../shared/sim/wire.mjs';
import { lobbyControls, siegeRulesText } from '../../client/menu/lobbyControls.mjs';
import { modeLabel } from '../../client/menu/lobbyView.mjs';

const manager = () => new RoomManager();

test('a private Siege room takes its format and rounds to the mode state', () => {
  const room = manager().createCustomRoom({ isPrivate: true, mode: 'SIEGE_BLADES', teamSize: 2, botSkill: 'champion',
    siegeBladesSettings: { format: 'MATCH', matchRounds: 5 } }, 0);
  assert.equal(room.policy.teamSize, 2);
  assert.deepEqual({ ...room.siegeBladesSettings },
    { format: 'MATCH', matchRounds: 5, endlessRoundCap: 25, clashStarts: null, teamSize: 2, botDifficulty: 'champion' });
  room.addPlayer({ id: 'host', token: 'host', name: 'Host' }, 0);
  room.startMatch(1);
  assert.equal(room.siegeBlades?.format, 'MATCH');
  assert.equal(room.siegeBlades?.matchRounds, 5);
  assert.equal(room.siegeBlades?.teamSize, 2);
  assert.equal(room.siegeBlades?.botDifficulty, 'champion');
});

test('a client cannot pass arbitrary fields into a room through its settings', () => {
  const room = manager().createCustomRoom({ isPrivate: true, mode: 'SIEGE_BLADES', format: 'ENDLESS', endlessRoundCap: 10,
    machineSelection: 'fixed', clashStarts: true, state: 'ENDED', hostOverride: 'me', practice: true }, 0);
  assert.equal(room.state, 'WAITING');
  assert.deepEqual(Object.keys(room.siegeBladesSettings).sort(),
    ['botDifficulty', 'clashStarts', 'endlessRoundCap', 'format', 'matchRounds', 'teamSize']);
  assert.equal(room.siegeBladesSettings.format, 'ENDLESS');
  assert.equal(room.siegeBladesSettings.endlessRoundCap, 10);
  for (const bad of [{ matchRounds: 99 }, { format: 'MARATHON' }, { endlessRoundCap: 7 }, { teamSize: 5 }, { clashStarts: 'yes' }])
    assert.throws(() => manager().createCustomRoom({ isPrivate: true, mode: 'SIEGE_BLADES', ...bad }, 0), JSON.stringify(bad));
});

test('the host re-configuring a waiting room reaches the mode, and its lobby shows rounds, not time', () => {
  const room = new Room('SIEGE', { isPrivate: true });
  room.addPlayer({ id: 'host', token: 'host', name: 'Host' }, 0);
  room.addPlayer({ id: 'guest', token: 'guest', name: 'Guest' }, 0);
  const host = room.players.get('host'), guest = room.players.get('guest');
  const configure = (who, settings) => applyRoomCommand(room, who, { type: 'configureRoom', settings }, 1);
  assert.equal(configure(host, { mode: 'SIEGE_BLADES', teamSize: 1, format: 'ENDLESS', endlessRoundCap: 50 }).lobby, true);
  assert.ok(configure(guest, { mode: 'SIEGE_BLADES', matchRounds: 7 }).rejected, 'only the host sets rules');
  assert.equal(room.siegeBladesSettings.format, 'ENDLESS');
  assert.equal(room.siegeBladesSettings.endlessRoundCap, 50);
  // a later change keeps what it does not mention
  assert.equal(configure(host, { teamSize: 2 }).lobby, true);
  assert.equal(room.siegeBladesSettings.format, 'ENDLESS');
  assert.equal(room.siegeBladesSettings.teamSize, 2);
  assert.equal(configure(host, { format: 'MATCH', matchRounds: 7 }).lobby, true);
  const lobby = serializeLobby(room);
  assert.deepEqual(lobby.siegeRules, { format: 'MATCH', matchRounds: 7, endlessRoundCap: 50 });
  const guestView = lobbyControls(lobby, 'guest');
  assert.match(guestView, /ROUNDS<\/dt><dd>7 ROUNDS/);
  assert.doesNotMatch(guestView, /<dt>TIME/);
  const hostView = lobbyControls(lobby, 'host');
  assert.match(hostView, /name="matchRounds"/);
  assert.match(hostView, /data-time-field hidden/);
  room.startMatch(2);
  assert.equal(room.siegeBlades.matchRounds, 7);
  assert.equal(room.siegeBlades.teamSize, 2);
  // leaving the mode clears its rules
  const other = new Room('BACK', { isPrivate: true });
  other.addPlayer({ id: 'h', token: 'h', name: 'H' }, 0);
  applyRoomCommand(other, other.players.get('h'), { type: 'configureRoom', settings: { mode: 'SIEGE_BLADES' } }, 1);
  applyRoomCommand(other, other.players.get('h'), { type: 'configureRoom', settings: { mode: 'FFA' } }, 1);
  assert.equal(other.siegeBladesSettings, null);
  assert.equal(serializeLobby(other).siegeRules, null);
});

test('Renown Trials cannot become a shared room: a clear refusal, never a Free-for-All in its place', () => {
  for (const isPrivate of [true, false])
    assert.throws(() => manager().createCustomRoom({ isPrivate, mode: 'RENOWN_TRIALS' }, 0), /solo trial/);
  const room = new Room('R', { isPrivate: true });
  room.addPlayer({ id: 'host', token: 'host', name: 'Host' }, 0);
  assert.match(applyRoomCommand(room, room.players.get('host'), { type: 'configureRoom', settings: { mode: 'RENOWN_TRIALS' } }, 1).rejected ?? '', /solo trial/);
  assert.equal(room.mode, 'FFA');
  const trial = manager().createSoloRoom('RENOWN_TRIALS', 0);
  assert.match(trial.joinError(), /solo trial/);
  assert.equal(modeLabel('RENOWN_TRIALS'), 'RAMPAGE TO RENOWN');
  assert.equal(modeLabel('SIEGE_BLADES'), 'SIEGE BLADES');
  assert.equal(siegeRulesText({ format: 'ENDLESS', endlessRoundCap: 0 }), 'ENDLESS · NO CAP');
});

test('a rematch of a private Siege room plays the same rules from round one', () => {
  const room = manager().createCustomRoom({ isPrivate: true, mode: 'SIEGE_BLADES', teamSize: 1,
    format: 'MATCH', matchRounds: 7 }, 0);
  room.addPlayer({ id: 'host', token: 'host', name: 'Host' }, 0);
  room.startMatch(1);
  room.siegeBlades.roundNumber = 4; room.siegeBlades.scores.ATTACKERS = 3;
  room.state = 'FINISHED';
  assert.equal(room.requestRematch('host', 10), true);
  for (let t = 10; t < 20 && room.state !== 'PLAYING'; t += 0.5) room.tick(t);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.siegeBlades.matchRounds, 7);
  assert.equal(room.siegeBlades.format, 'MATCH');
  assert.equal(room.siegeBlades.roundNumber, 1);
  assert.equal(room.siegeBlades.scores.ATTACKERS, 0);
});
