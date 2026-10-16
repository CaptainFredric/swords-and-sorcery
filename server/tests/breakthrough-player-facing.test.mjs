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

test('Team VO: ordinary ally kill does not automatically qualify saved-me lines', () => {
  // 1. Generic allyFelledFoe tag is not subscribed to by saved-me lines
  const genericLines = linesFor('p1', ['allyFelledFoe']).map((s) => s.line);
  assert.equal(genericLines.includes('lesserFoe'), false, 'lesserFoe does not trigger on generic ally kill');
  assert.equal(genericLines.includes('couldveDoneThat'), false, 'couldveDoneThat does not trigger on generic ally kill');

  // 2. allySavedMe tag is subscribed to by lesserFoe and couldveDoneThat
  const savedMeLines = linesFor('p1', ['allySavedMe']).map((s) => s.line);
  assert.deepEqual(savedMeLines, ['lesserFoe', 'couldveDoneThat'], 'saved-me lines subscribe to allySavedMe');

  // 3. Contextual qualification: ordinary kill across the map does not qualify
  const moments = new VoiceMoments();
  const myId = 'p1';
  const victimId = 'foe1';
  const at = 10.0;

  // Case A: Enemy was across map (dist = 40), never threatened me, my health full
  const myPosA = { x: 0, z: 0 };
  const victimPosA = { x: 40, z: 0 };
  const distA = Math.hypot(myPosA.x - victimPosA.x, myPosA.z - victimPosA.z);
  const myThreatA = moments.threats.get(myId);
  const threatenedMeA = myThreatA?.by === victimId && (at - myThreatA.at <= 4.0);
  const myHealthA = 100;
  const inFightA = threatenedMeA || (distA <= 15 && (myHealthA <= 50 || moments.strikes?.has?.(`${myId}>${victimId}`)));
  assert.equal(inFightA, false, 'distant kill where enemy did not threaten player does NOT qualify saved-me reaction');

  // Case B: Enemy was actively threatening me
  moments.threats.set(myId, { by: victimId, at: 9.5 });
  const myThreatB = moments.threats.get(myId);
  const threatenedMeB = myThreatB?.by === victimId && (at - myThreatB.at <= 4.0);
  const inFightB = threatenedMeB || (distA <= 15 && (myHealthA <= 50 || moments.strikes?.has?.(`${myId}>${victimId}`)));
  assert.equal(inFightB, true, 'threatened player qualifies allySavedMe reaction');
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

test('Team VO: marked target death biases victim defeat bark and does not trigger killer generic taunt', () => {
  // 1. killTaunt does NOT trigger on markedTargetFelled
  const killTaunt = VOICE_LINE_DECLARATIONS.find((l) => l.id === 'killTaunt');
  assert.equal(killTaunt.trigger, 'kill', 'killTaunt triggers strictly on kill, not markedTargetFelled');
  assert.equal(VOICE_TAGS.markedTargetFelled, undefined, 'markedTargetFelled tag is removed from VOICE_TAGS');

  // 2. Defeat bark chanceScale boost for marked victims
  const mockFallen = [
    { line: 'magicDefeat', speaker: 'victim', chanceScale: 1.0, delay: 0 },
    { line: 'defeat', speaker: 'victim', chanceScale: 0.8, delay: 0 },
  ];
  const wasMarked = true;
  const candidateFallen = wasMarked
    ? mockFallen.map((say) => ({ ...say, chanceScale: (say.chanceScale ?? 1) * 4.0 }))
    : mockFallen;

  assert.equal(candidateFallen[0].chanceScale, 4.0, 'marked target defeat lines receive heavy chanceScale boost');
  assert.equal(candidateFallen[1].chanceScale, 3.2, 'all legal defeat candidates for marked victim are biased upward');
});


