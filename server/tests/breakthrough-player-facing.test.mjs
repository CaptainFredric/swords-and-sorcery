import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepRoom, killPlayer } from '../../shared/sim/combat.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { applyRoomCommand, serializeLobby, serializeSnapshot } from '../../shared/sim/wire.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { WORLD_IDS } from '../../shared/worlds/registry.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { LocalHost } from '../../client/network/LocalHost.mjs';
import { MenuController } from '../../client/menu/MenuController.mjs';
import { lobbyView } from '../../client/menu/lobbyView.mjs';
import { challengeCopy, arenaGateCopy } from '../../client/menu/challengeCard.mjs';
import { breakthroughHudView } from '../../client/ui/HUD.mjs';

test('MenuController exposes solo and private Breakthrough entry paths with team preference', () => {
  const calls = [];
  const fakeSocket = {
    startSolo: (...args) => calls.push(['startSolo', ...args]),
    createBreakthroughRoom: (...args) => calls.push(['createBreakthroughRoom', ...args]),
  };
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
  };
  const menu = new MenuController(fakeSocket, storage);
  assert.equal(menu.soloTeam(), 'AUTO');
  menu.chooseSoloTeam('DEFENDERS');
  assert.equal(menu.soloTeam(), 'DEFENDERS');

  const resSolo = menu.breakthrough('Aldric');
  assert.equal(resSolo.ok, true);
  assert.deepEqual(calls[0], ['startSolo', 'BREAKTHROUGH', 'Aldric', 'bastion-breach', 'knight', 'DEFENDERS']);

  const resPriv = menu.createBreakthroughPrivate('Aldric', 'ATTACKERS');
  assert.equal(resPriv.ok, true);
  assert.deepEqual(calls[1], ['createBreakthroughRoom', 'Aldric', 'ATTACKERS', 'knight']);
});

test('LocalHost starts a bot-filled 3v3 Breakthrough match and supports preferred team assignment', () => {
  let joined = null;
  const host = new LocalHost({
    now: () => 0,
    every: () => 1,
    cancel: () => {},
    later: (fn) => fn(),
  });
  host.on('joined', (msg) => { joined = msg; });

  host.startSolo(GAME_MODES.BREAKTHROUGH, 'Vanguard', 'bastion-breach', 'knight', false, TEAMS.DEFENDERS);
  assert.ok(joined);
  assert.equal(joined.mode, GAME_MODES.BREAKTHROUGH);
  assert.equal(joined.worldId, WORLD_IDS.BASTION_BREACH);
  assert.equal(host.room.players.size, 6, '1 human + 5 bots provisioned');
  assert.equal(host.player.team, TEAMS.DEFENDERS, 'human assigned to requested Defenders side');

  const attackers = [...host.room.players.values()].filter((p) => p.team === TEAMS.ATTACKERS);
  const defenders = [...host.room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);
  assert.equal(attackers.length, 3);
  assert.equal(defenders.length, 3);
});

test('Human arrival replaces bot and human departure refills bot to keep 3v3 balanced', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const h1 = room.addPlayer({ id: 'h1', token: 't1', name: 'Host' }, 0);
  room.provisionModeActors(0);
  assert.equal(room.players.size, 6);

  const h2 = room.addPlayer({ id: 'h2', token: 't2', name: 'Guest' }, 1);
  assert.equal(room.players.size, 6, 'still 6 combatants');
  assert.notEqual(h1.team, h2.team, 'humans balanced across teams');

  room.removePlayer('h2', 2);
  assert.equal(room.players.size, 6, 'vacated human slot refilled by a bot');
  const attackers = [...room.players.values()].filter((p) => p.team === TEAMS.ATTACKERS);
  const defenders = [...room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);
  assert.equal(attackers.length, 3);
  assert.equal(defenders.length, 3);
});

test('Lobby team switch swaps human with opposing bot while keeping 3v3 balance', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const h1 = room.addPlayer({ id: 'h1', token: 't1', name: 'Host' }, 0);
  room.provisionModeActors(0);
  assert.equal(h1.team, TEAMS.ATTACKERS);

  applyRoomCommand(room, h1, { type: 'switchTeam' }, 1);
  assert.equal(h1.team, TEAMS.DEFENDERS);
  const attackers = [...room.players.values()].filter((p) => p.team === TEAMS.ATTACKERS);
  const defenders = [...room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);
  assert.equal(attackers.length, 3);
  assert.equal(defenders.length, 3);

  const view = lobbyView(serializeLobby(room), { localId: 'h1', serverNow: 1 });
  assert.equal(view.mode, 'BREAKTHROUGH · 3V3');
  assert.equal(view.world, 'BASTION BREACH');
  const myRow = view.players.find((p) => p.you);
  assert.match(myRow.status, /DEFENDERS/);
});

test('Phase-aware spawns: Defenders spawn near Outer Gate in Phase 0 and Sanctum in Phase 1', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const att = room.addPlayer({ id: 'att', token: 't1', name: 'Attacker', team: TEAMS.ATTACKERS }, 0);
  const def = room.addPlayer({ id: 'def', token: 't2', name: 'Defender', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  assert.ok(def.position.z >= 10 && def.position.z <= 16, `Phase 0 defender z=${def.position.z} should be near Gatehouse`);
  assert.ok(att.position.z <= -26, `Phase 0 attacker z=${att.position.z} should be in staging camp`);

  room.objectiveState.index = 1;
  room.objectiveState.phase = 1;
  const defSpawn1 = room.initialSpawnFor(def, 0, 10);
  const attSpawn1 = room.initialSpawnFor(att, 0, 10);
  assert.ok(defSpawn1.z >= 32, `Phase 1 defender spawn z=${defSpawn1.z} should be in Sanctum rear bastion`);
  assert.ok(attSpawn1.z >= -5 && attSpawn1.z <= 2, `Phase 1 attacker spawn z=${attSpawn1.z} should be in captured courtyard`);
});

test('Breakthrough HUD view and Challenge/Gate copy communicate role and objective states', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  room.addPlayer({ id: 'att', token: 't1', name: 'Attacker', team: TEAMS.ATTACKERS }, 0);
  room.addPlayer({ id: 'def', token: 't2', name: 'Defender', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);

  const snap0 = serializeSnapshot(room, 10);
  const hudAtt = breakthroughHudView(snap0.players[0], snap0, 10);
  assert.equal(hudAtt.visible, true);
  assert.equal(hudAtt.stateLabel, 'CAPTURE');
  assert.equal(hudAtt.phaseLabel, 'OBJECTIVE 1 OF 2');

  room.objectiveState.contested = true;
  room.objectiveState.progress = 0.42;
  const snapContested = serializeSnapshot(room, 15);
  const hudDef = breakthroughHudView(snapContested.players[1], snapContested, 15);
  assert.equal(hudDef.stateKey, 'contested');
  assert.equal(hudDef.stateLabel, 'CONTESTED');
  assert.equal(hudDef.progressPct, 42);

  const cCopy = challengeCopy({ mode: 'BREAKTHROUGH', players: snap0.players, localId: 'def', worldId: 'bastion-breach' });
  assert.equal(cCopy.you, 'DEFENDERS');
  assert.equal(cCopy.foe, 'ATTACKERS');
  const gCopy = arenaGateCopy({ mode: 'BREAKTHROUGH', worldId: 'bastion-breach', team: 'ATTACKERS' });
  assert.equal(gCopy.title, 'BASTION BREACH');
  assert.match(gCopy.sub, /CAPTURE THE OUTER GATE/);
});

test('Team target & objective marking (ping) and semantic markedTargetFelled event', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const att = room.addPlayer({ id: 'att', token: 't1', name: 'Attacker', team: TEAMS.ATTACKERS }, 0);
  room.addPlayer({ id: 'def', token: 't2', name: 'Warden Enemy', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);
  room.events.length = 0;

  applyRoomCommand(room, att, { type: 'markTarget', targetId: 'def' }, 5.0);
  const snap = serializeSnapshot(room, 5.1);
  assert.equal(snap.marks.length, 1);
  assert.equal(snap.marks[0].kind, 'enemy');
  assert.equal(snap.marks[0].targetId, 'def');

  killPlayer(room, 'def', 'att', 'sword', 6.0);
  assert.equal(room.events.some((e) => e.type === 'markedTargetFelled' && e.victimId === 'def' && e.killerId === 'att'), true);
});

test('Single-human Solo Breakthrough rematch succeeds and resets objective state', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const human = room.addPlayer({ id: 'h1', token: 't1', name: 'SoloPlayer' }, 0);
  room.provisionModeActors(0);
  room.startMatch(0);
  room.finish(TEAMS.ATTACKERS, 50, 'objective');
  assert.equal(room.state, 'FINISHED');

  const ok = room.requestRematch(human.id, 52);
  assert.equal(ok, true, '1-human Breakthrough room accepts rematch vote');
  assert.equal(room.state, 'REMATCH_COUNTDOWN');

  stepRoom(room, 1 / 30, 56);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.objectiveState.index, 0);
  assert.equal(room.objectiveState.progress, 0);
});

test('Bot urgency: Defender bot rushes into uncontested ring when Attackers are capturing', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const defBot = room.addServerActor({ id: 'bot-def-1', actorKind: 'bot', team: TEAMS.DEFENDERS }, 0);
  const attOutside = room.addPlayer({ id: 'att-out', token: 't1', name: 'Bait', team: TEAMS.ATTACKERS }, 0);
  room.startMatch(0);

  room.objectiveState.attackersCount = 1;
  room.objectiveState.defendersCount = 0;
  room.objectiveState.capturing = true;
  room.objectiveState.progress = 0.4;

  defBot.position = { x: 0, y: 0, z: 9 };
  attOutside.position = { x: 8, y: 0, z: 9 };

  stepBotControllers(room, 10.0, room.world);
  assert.equal(defBot.ai.targetId, null, 'defender bot ignores side bait to contest objective ring first');
  assert.ok(defBot.input.forward > 0.5, 'defender bot moves forward toward objective');
});
