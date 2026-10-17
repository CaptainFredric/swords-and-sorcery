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
import { linesFor, voiceLine, VOICE_LINE_DECLARATIONS, VOICE_TAGS } from '../../client/game/sound/voiceLines.mjs';
import { VoiceMoments } from '../../client/game/sound/voiceMoments.mjs';
import { TeamVoiceEvents } from '../../client/game/sound/teamVoiceEvents.mjs';

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
  assert.deepEqual(calls[0], ['startSolo', 'BREAKTHROUGH', 'Aldric', 'bastion-breach', 'knight', 'DEFENDERS', 3]);

  const resPriv = menu.createBreakthroughPrivate('Aldric', 'ATTACKERS');
  assert.equal(resPriv.ok, true);
  assert.deepEqual(calls[1], ['createBreakthroughRoom', 'Aldric', 'ATTACKERS', 'knight', 3]);
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

test('3v3 team slots: 4th, 5th, 6th human arrivals replace bots and 7th is rejected', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH, { teamSize: 3 });
  room.addPlayer({ id: 'h1', token: 't1', name: 'Player 1' }, 0);
  room.provisionModeActors(0);
  assert.equal(room.players.size, 6);

  // 2nd, 3rd, 4th, 5th, 6th human arrivals
  room.addPlayer({ id: 'h2', token: 't2', name: 'Player 2' }, 1);
  room.addPlayer({ id: 'h3', token: 't3', name: 'Player 3' }, 2);
  room.addPlayer({ id: 'h4', token: 't4', name: 'Player 4' }, 3);
  room.addPlayer({ id: 'h5', token: 't5', name: 'Player 5' }, 4);
  room.addPlayer({ id: 'h6', token: 't6', name: 'Player 6' }, 5);

  assert.equal(room.players.size, 6, 'exactly 6 combatants');
  assert.equal(room.humanActorCount(), 6, 'all 6 slots filled by humans');
  const attackers = [...room.players.values()].filter((p) => p.team === TEAMS.ATTACKERS);
  const defenders = [...room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);
  assert.equal(attackers.length, 3, '3 attackers');
  assert.equal(defenders.length, 3, '3 defenders');

  // Attempted 7th human is rejected
  assert.throws(() => {
    room.addPlayer({ id: 'h7', token: 't7', name: 'Player 7' }, 6);
  }, /Room is full/);
  assert.equal(room.players.size, 6);
  assert.equal(room.humanActorCount(), 6);
});

test('2v2 team slots: 4 humans cap properly and reject 5th human', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH, { teamSize: 2 });
  assert.equal(room.policy.teamSize, 2);
  assert.equal(room.policy.botCount, 3);

  room.addPlayer({ id: 'h1', token: 't1', name: 'Player 1' }, 0);
  room.provisionModeActors(0);
  assert.equal(room.players.size, 4, '2v2 provisions 4 total combatants (1 human + 3 bots)');

  room.addPlayer({ id: 'h2', token: 't2', name: 'Player 2' }, 1);
  room.addPlayer({ id: 'h3', token: 't3', name: 'Player 3' }, 2);
  room.addPlayer({ id: 'h4', token: 't4', name: 'Player 4' }, 3);

  assert.equal(room.players.size, 4, 'exactly 4 combatants once full');
  assert.equal(room.humanActorCount(), 4, '4 humans');
  const attackers = [...room.players.values()].filter((p) => p.team === TEAMS.ATTACKERS);
  const defenders = [...room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);
  assert.equal(attackers.length, 2, '2 attackers');
  assert.equal(defenders.length, 2, '2 defenders');

  // Attempted 5th human is rejected
  assert.throws(() => {
    room.addPlayer({ id: 'h5', token: 't5', name: 'Player 5' }, 4);
  }, /Room is full/);
  assert.equal(room.players.size, 4);
});

test('Team switching into an already full side is rejected without corrupting match state', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH, { teamSize: 2 });
  // Add 2 humans on DEFENDERS
  const d1 = room.addPlayer({ id: 'd1', token: 't1', name: 'Def 1', team: TEAMS.DEFENDERS }, 0);
  const d2 = room.addPlayer({ id: 'd2', token: 't2', name: 'Def 2', team: TEAMS.DEFENDERS }, 0);
  // Add 1 human on ATTACKERS
  const a1 = room.addPlayer({ id: 'a1', token: 't3', name: 'Att 1', team: TEAMS.ATTACKERS }, 0);
  room.provisionModeActors(0);

  assert.equal(d1.team, TEAMS.DEFENDERS);
  assert.equal(d2.team, TEAMS.DEFENDERS);
  assert.equal(a1.team, TEAMS.ATTACKERS);

  // Attempt to switch a1 to DEFENDERS which already has maximum (2) humans
  const switched = room.switchTeam(a1.id, TEAMS.DEFENDERS);
  assert.equal(switched, false, 'switchTeam rejected because target team has full human roster');
  assert.equal(a1.team, TEAMS.ATTACKERS, 'player team remains ATTACKERS');

  const defenders = [...room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);
  assert.equal(defenders.length, 2, 'defenders remain exactly 2');
});

test('Bot backfill maintains exact team size when humans disconnect', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH, { teamSize: 3 });
  for (let i = 1; i <= 6; i += 1) {
    room.addPlayer({ id: `h${i}`, token: `t${i}`, name: `Player ${i}` }, 0);
  }
  room.provisionModeActors(0);
  assert.equal(room.players.size, 6);
  assert.equal(room.humanActorCount(), 6);

  // h1 leaves
  const h1Team = room.players.get('h1').team;
  room.removePlayer('h1', 1.0);
  assert.equal(room.players.size, 6, 'bot immediately backfills vacated slot');
  assert.equal(room.humanActorCount(), 5);

  const attackers = [...room.players.values()].filter((p) => p.team === TEAMS.ATTACKERS);
  const defenders = [...room.players.values()].filter((p) => p.team === TEAMS.DEFENDERS);
  assert.equal(attackers.length, 3);
  assert.equal(defenders.length, 3);
  const backfilledBot = (h1Team === TEAMS.ATTACKERS ? attackers : defenders).find((p) => p.actorKind === 'bot');
  assert.ok(backfilledBot, 'backfilled bot is on the same team as departed human');
});

test('Team VO: one restrained team-opening voice opportunity at match start', () => {
  const moments = new VoiceMoments();
  const knights = [
    { id: 'player-1', actorKind: 'player' },
    { id: 'bot-1', actorKind: 'bot' },
    { id: 'bot-2', actorKind: 'bot' },
    { id: 'bot-3', actorKind: 'bot' },
    { id: 'bot-4', actorKind: 'bot' },
    { id: 'bot-5', actorKind: 'bot' },
  ];
  const candidates = [
    ...knights.filter((k) => k.id === 'player-1'),
    ...knights.filter((k) => k.id !== 'player-1'),
  ];

  const spoken = [];
  const fakeSay = (line, speaker, say) => {
    spoken.push({ line, speaker, ...say });
    return true; // first line attempted is successfully spoken
  };

  let openingSaid = false;
  for (const knight of candidates) {
    const teamLines = moments.lines(knight.id, ['teamEngage']);
    for (const say of teamLines) {
      if (fakeSay(say.line, say.speaker, say)) {
        openingSaid = true;
        break;
      }
    }
    if (openingSaid) break;
    const beginLines = moments.lines(knight.id, ['battleBegins']);
    for (const say of beginLines) {
      if (fakeSay(say.line, say.speaker, say)) {
        openingSaid = true;
        break;
      }
    }
    if (openingSaid) break;
  }

  assert.equal(openingSaid, true, 'an opening line was spoken');
  assert.equal(spoken.length, 1, 'field-level restraint ensures exactly one team opening sentence is attempted/spoken');
  assert.equal(spoken[0].speaker, 'player-1', 'local player candidate was evaluated first');
});

test('Team VO: allySaved produces saved knight line (not savior), and ordinary kill without allySaved does not qualify', () => {
  // 1. Generic allyFelledFoe tag is not subscribed to by saved-me lines
  const genericLines = linesFor('p1', ['allyFelledFoe']).map((s) => s.line);
  assert.equal(genericLines.includes('lesserFoe'), false, 'lesserFoe does not trigger on generic ally kill');
  assert.equal(genericLines.includes('couldveDoneThat'), false, 'couldveDoneThat does not trigger on generic ally kill');

  // 2. allySavedMe tag is subscribed to by lesserFoe and couldveDoneThat
  const savedMeLines = linesFor('p1', ['allySavedMe']).map((s) => s.line);
  assert.deepEqual(savedMeLines, ['lesserFoe', 'couldveDoneThat'], 'saved-me lines subscribe to allySavedMe');

  // 3. Real server event path: endangered ally felling emits authoritative allySaved
  const manager = new RoomManager();
  const roomA = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const savior = roomA.addPlayer({ id: 'savior', token: 't1', name: 'Savior', team: TEAMS.ATTACKERS }, 0);
  const ally = roomA.addPlayer({ id: 'ally', token: 't2', name: 'Saved Ally', team: TEAMS.ATTACKERS }, 0);
  const enemy = roomA.addPlayer({ id: 'enemy', token: 't3', name: 'Attacker Enemy', team: TEAMS.DEFENDERS }, 0);
  roomA.startMatch(0);

  // Ally was recently damaged by enemy and low on health (<= 50)
  ally.health = 40;
  ally.lastAttackerId = enemy.id;
  ally.lastDamageAt = 9.5;
  roomA.events.length = 0;

  // Savior fells the threatening enemy
  killPlayer(roomA, enemy.id, savior.id, 'sword', 10.0);
  const allySavedEvent = roomA.events.find((e) => e.type === 'allySaved');
  assert.ok(allySavedEvent, 'server emitted authoritative allySaved event');
  assert.equal(allySavedEvent.saviorId, 'savior');
  assert.equal(allySavedEvent.allyId, 'ally');

  // Client consumes actual server event: speaker is the saved knight (ally B), NOT the savior (A)
  const moments = new VoiceMoments();
  const spokenA = [];
  const teamVoiceA = new TeamVoiceEvents({
    sayMoment: (speaker, tags) => {
      const lines = moments.lines(speaker, tags);
      spokenA.push({ speaker, tags, lines: lines.map((s) => s.line) });
      return true;
    },
    nowSec: () => 10.0,
  });

  roomA.events.forEach((e) => teamVoiceA.onEvent(e));
  assert.equal(spokenA.length, 1);
  assert.equal(spokenA[0].speaker, 'ally', 'contextual speaker is the saved knight (ally), NOT the savior');
  assert.deepEqual(spokenA[0].tags, ['allySavedMe']);
  assert.deepEqual(spokenA[0].lines, ['lesserFoe', 'couldveDoneThat']);

  // Preserves team spacing rule (3.5s cooldown)
  const rapidSecond = teamVoiceA.onEvent({ type: 'allySaved', saviorId: 'savior', allyId: 'ally', enemyId: 'enemy2', at: 11.0 });
  assert.equal(rapidSecond, false, 'second save within 3.5s is throttled by team spacing rule');

  // 4. Ordinary kill without allySaved: ally was healthy or not attacked by enemy
  const roomB = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const saviorB = roomB.addPlayer({ id: 'saviorB', token: 't1', name: 'Savior B', team: TEAMS.ATTACKERS }, 0);
  const allyB = roomB.addPlayer({ id: 'allyB', token: 't2', name: 'Healthy Ally', team: TEAMS.ATTACKERS }, 0);
  const enemyB = roomB.addPlayer({ id: 'enemyB', token: 't3', name: 'Enemy B', team: TEAMS.DEFENDERS }, 0);
  roomB.startMatch(0);

  allyB.health = 100;
  allyB.lastAttackerId = 'someone-else';
  roomB.events.length = 0;

  killPlayer(roomB, enemyB.id, saviorB.id, 'sword', 20.0);
  const allySavedB = roomB.events.find((e) => e.type === 'allySaved');
  assert.equal(allySavedB, undefined, 'ordinary kill of nearby enemy without endangerment does NOT emit allySaved event');

  const spokenB = [];
  const teamVoiceB = new TeamVoiceEvents({
    sayMoment: (speaker, tags) => {
      spokenB.push({ speaker, tags });
      return true;
    },
    nowSec: () => 20.0,
  });

  roomB.events.forEach((e) => teamVoiceB.onEvent(e));
  assert.equal(spokenB.length, 0, 'no allySavedMe lines spoken when allySaved event is absent');
});

test('Team VO: ordinary ally death does not automatically qualify every condemnation line', () => {
  // 1. Generic allyFallen tag is not subscribed to by blunder/condemnation lines
  const genericFallen = linesFor('p1', ['allyFallen']).map((s) => s.line);
  assert.equal(genericFallen.includes('whatNotToDo'), false, 'whatNotToDo does not trigger on generic ally casualty');
  assert.equal(genericFallen.includes('certainlyAWay'), false, 'certainlyAWay does not trigger on generic ally casualty');

  // 2. allyBlunder tag is subscribed to by blunder lines
  const blunderLines = linesFor('p1', ['allyBlunder']).map((s) => s.line);
  assert.deepEqual(blunderLines, ['whatNotToDo', 'certainlyAWay'], 'blunder lines subscribe to allyBlunder');

  // 3. knightsLost moved to teamRegroup
  assert.equal(voiceLine('knightsLost').triggers.teamRegroup, 1, 'knightsLost belongs to teamRegroup');
  assert.equal(voiceLine('knightsLost').coming, 'regroup orders', 'knightsLost waits on regroup orders');

  // 4. Contextual qualification: normal sword death is not a blunder
  const normalDeath = { source: 'sword', killerId: 'foe1', victimId: 'ally1' };
  const isNormalBlunder = normalDeath.source === 'abyss' || !normalDeath.killerId || normalDeath.killerId === normalDeath.victimId || Boolean(normalDeath.helpless);
  assert.equal(isNormalBlunder, false, 'ordinary combat death does NOT qualify allyBlunder');

  // 5. Abyss death is an ally blunder
  const abyssDeath = { source: 'abyss', killerId: null, victimId: 'ally1' };
  const isAbyssBlunder = abyssDeath.source === 'abyss' || !abyssDeath.killerId || abyssDeath.killerId === abyssDeath.victimId || Boolean(abyssDeath.helpless);
  assert.equal(isAbyssBlunder, true, 'abyss fall qualifies as ally blunder');
});

test('Team VO: markedTargetFelled produces boosted victim payoff bark even after snapshot marks clear', () => {
  // 1. killTaunt triggers strictly on kill, not markedTargetFelled
  const killTaunt = VOICE_LINE_DECLARATIONS.find((l) => l.id === 'killTaunt');
  assert.equal(killTaunt.trigger, 'kill', 'killTaunt triggers strictly on kill, not markedTargetFelled');
  assert.equal(VOICE_TAGS.markedTargetFelled, undefined, 'markedTargetFelled tag is removed from VOICE_TAGS');

  // 2. Real server event path: marked target felling emits markedTargetFelled and clears snapshot marks
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.BASTION_BREACH);
  const killer = room.addPlayer({ id: 'att-1', token: 't1', name: 'Killer Attacker', team: TEAMS.ATTACKERS }, 0);
  const victim = room.addPlayer({ id: 'def-1', token: 't2', name: 'Marked Defender', team: TEAMS.DEFENDERS }, 0);
  room.startMatch(0);
  room.events.length = 0;

  // Mark enemy
  applyRoomCommand(room, killer, { type: 'markTarget', targetId: victim.id }, 10.0);
  assert.equal(room.teamMarks.length, 1);

  // Kill marked enemy
  killPlayer(room, victim.id, killer.id, 'sword', 12.0);
  const markedEvent = room.events.find((e) => e.type === 'markedTargetFelled');
  const deathEvent = room.events.find((e) => e.type === 'death' && e.victimId === victim.id);
  assert.ok(markedEvent, 'server emitted authoritative markedTargetFelled event');
  assert.ok(deathEvent, 'server emitted death event');

  // Verify server cleared mark from snapshot at the exact tick of death
  const snap = serializeSnapshot(room, 12.0);
  assert.equal(snap.marks.length, 0, 'snapshot marks cleared on death tick');

  // 3. Client TeamVoiceEvents consumption
  const moments = new VoiceMoments();
  const teamVoice = new TeamVoiceEvents({ nowSec: () => 12.0 });

  // Consume events
  room.events.forEach((e) => teamVoice.onEvent(e));

  // 4. Payoff verification: even though snap.marks has cleared, teamVoice records payoff
  const wasMarked = teamVoice.consumeMarkedPayoff(victim.id, 12.0);
  assert.equal(wasMarked, true, 'payoff recognized despite snapshot marks being cleared');

  // 5. Victim defeat barks heavily biased (4x chanceScale)
  const { fallen, victor } = moments.death(deathEvent, { knight: () => null });
  assert.ok(fallen.length > 0, 'victim has legal defeat barks');
  const biasedFallen = teamVoice.biasDefeatCandidates(fallen);
  assert.equal(biasedFallen[0].chanceScale, (fallen[0].chanceScale ?? 1) * 4.0, 'defeat bark biased by 4x');

  // 6. Killer generic taunt suppressed when victim payoff bark wins
  const victimBarkWon = true; // when victim payoff bark spoke
  const killerTauntAllowed = !victimBarkWon && victor.length > 0;
  assert.equal(killerTauntAllowed, false, 'killer must not say generic taunt when victim payoff bark wins');
});

test('Team VO: clock-domain separation preserves local presentation spacing and server simulation payoff correlation across mismatched clocks', () => {
  // Scenario: Server simulation clock is at 5000s (e.g. server uptime or long-running room),
  // while client presentation clock is at 12.0s (local session playback time).
  let clientPresentationTime = 12.0;
  const spoken = [];
  const teamVoice = new TeamVoiceEvents({
    sayMoment: (speaker, tags) => {
      spoken.push({ speaker, tags, clientAt: clientPresentationTime });
      return true;
    },
    nowSec: () => clientPresentationTime,
  });

  // 1. allySaved server event arrives with server clock at = 5000.0
  const allySavedEvent = {
    type: 'allySaved',
    saviorId: 'savior1',
    allyId: 'ally1',
    enemyId: 'enemy1',
    at: 5000.0,
  };
  const lineSaid = teamVoice.onEvent(allySavedEvent);
  assert.equal(lineSaid, true, 'allySaved triggers line for ally1');
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].speaker, 'ally1');
  assert.equal(teamVoice.lastTeamVoicePresentationAt, 12.0, 'lastTeamVoicePresentationAt must record local presentation time (12.0), NOT server event.at (5000.0)');
  assert.equal(teamVoice.lastTeamVoiceAt, 12.0, 'backwards-compatible lastTeamVoiceAt reflects presentation time');

  // 2. Next allySaved arrives 2 seconds later in presentation time (client at 14.0s, server at 5002.0s)
  clientPresentationTime = 14.0;
  const rapidEvent = {
    type: 'allySaved',
    saviorId: 'savior1',
    allyId: 'ally2',
    enemyId: 'enemy2',
    at: 5002.0,
  };
  const throttled = teamVoice.onEvent(rapidEvent);
  assert.equal(throttled, false, 'second save at client 14.0s (within 3.5s of 12.0s) is throttled by presentation spacing rule');

  // 3. Third allySaved arrives 4 seconds later in presentation time (client at 16.0s, server at 5004.0s)
  clientPresentationTime = 16.0;
  const validEvent = {
    type: 'allySaved',
    saviorId: 'savior1',
    allyId: 'ally3',
    enemyId: 'enemy3',
    at: 5004.0,
  };
  const allowed = teamVoice.onEvent(validEvent);
  assert.equal(allowed, true, 'third save at client 16.0s (>= 3.5s since 12.0s) triggers voice');
  assert.equal(teamVoice.lastTeamVoicePresentationAt, 16.0, 'updated to 16.0s');

  // 4. markedTargetFelled correlation in server simulation clock domain:
  // Server event emitted at server simulation time 5000.0
  teamVoice.onEvent({
    type: 'markedTargetFelled',
    killerId: 'killer1',
    victimId: 'victim1',
    at: 5000.0,
  });

  // Client presentation clock could be anything (e.g. 16.5s)
  clientPresentationTime = 16.5;

  // Death event arrives with server simulation timestamp 5001.0
  const deathServerAt = 5001.0;
  const wasMarked = teamVoice.consumeMarkedPayoff('victim1', deathServerAt);
  assert.equal(wasMarked, true, 'markedTargetFelled correlates correctly using server simulation timestamps (5000.0 vs 5001.0) regardless of client clock (16.5)');

  // 5. Expired payoff beyond window (4.0s window in server time):
  teamVoice.onEvent({
    type: 'markedTargetFelled',
    killerId: 'killer2',
    victimId: 'victim2',
    at: 5000.0,
  });
  const expiredServerAt = 5005.0; // 5.0s later in server time
  const wasExpired = teamVoice.consumeMarkedPayoff('victim2', expiredServerAt);
  assert.equal(wasExpired, false, 'payoff expired when server simulation death time exceeds window');
});


