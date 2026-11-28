import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createGameServer } from '../src/server.mjs';
import { ProfileStore } from '../src/ProfileStore.mjs';
import { createDragOon } from '../../shared/sim/dragOon.mjs';
import { DRAG_OON_TUNING } from '../../shared/src/dragOonConfig.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';

async function connectSocket(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const queue = [];
  ws.addEventListener('message', e => queue.push(JSON.parse(e.data)));
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const send = msg => ws.send(JSON.stringify(msg));
  const next = async (type, predicate = () => true, timeoutMs = 6000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      const idx = queue.findIndex(m => m.type === type && predicate(m));
      if (idx >= 0) return queue.splice(idx, 1)[0];
      await new Promise(r => setTimeout(r, 10));
    }
    throw new Error(`Timed out waiting for ${type}; errors=${JSON.stringify(queue.filter(m => m.type === 'error' || m.type === 'rejected'))}`);
  };
  return { ws, send, next, queue };
}

test('Multiplayer WebSocket crew executes Burning Brotherhood, Camp+Steam, Brimming, and team Rite of Ascension', { timeout: 20000 }, async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), 'dragoon-net-'));
  const game = createGameServer({ port: 0, host: '127.0.0.1', profileStore: new ProfileStore(folder) });
  await game.start();
  const { port } = game.address();
  const sockets = [];
  t.after(async () => {
    for (const s of sockets) s.ws.close();
    await game.stop();
    await rm(folder, { recursive: true, force: true });
  });

  const cOp = await connectSocket(port);
  const cP1 = await connectSocket(port);
  const cP2 = await connectSocket(port);
  const cFoe = await connectSocket(port);
  sockets.push(cOp, cP1, cP2, cFoe);

  // Host creates a Private FFA/team test room with 4 sockets
  cOp.send({ type: 'createRoom', name: 'RiteOp', mode: 'FFA', settings: { worldId: 'castleward', matchSeconds: 300 } });
  const jOp = await cOp.next('joined');
  const code = jOp.roomCode;
  for (const [sock, name] of [[cP1, 'PaxOne'], [cP2, 'PaxTwo'], [cFoe, 'FoeOne']]) {
    sock.send({ type: 'joinRoom', code, name });
    await sock.next('joined');
  }
  const room = game.roomManager.findByCode(code);
  const pOp = room.players.get(jOp.playerId);
  const allPids = [...room.players.keys()];
  const p1Id = allPids.find(id => room.players.get(id).name === 'PaxOne');
  const p2Id = allPids.find(id => room.players.get(id).name === 'PaxTwo');
  const foeId = allPids.find(id => room.players.get(id).name === 'FoeOne');
  const pP1 = room.players.get(p1Id);
  const pP2 = room.players.get(p2Id);
  const pFoe = room.players.get(foeId);

  // Start match over wire & assign teams + equipment cleanly
  room.policy.teamMode = true;
  pOp.team = TEAMS.ATTACKERS; pP1.team = TEAMS.ATTACKERS; pP2.team = TEAMS.ATTACKERS;
  pFoe.team = TEAMS.DEFENDERS;
  const countdownP = cOp.next('lobby', m => m.roomState === 'COUNTDOWN');
  for (const s of sockets) s.send({ type: 'ready', ready: true });
  await countdownP;
  room.countdownEndsAt = game.now() - 0.01;
  await cOp.next('snapshot', s => s.roomState === 'PLAYING');

  // Stage 1: Verify Desolation Spray + Camp Fire + Steam the Team across WebSocket crew
  const dCamp = createDragOon({ id: 'drag-net-camp', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS, skill: { id: 'campFire', phase: 'idle', readyAt: 0 } });
  room.addMachine(dCamp);
  pOp.position = { x: 0, y: 0, z: 3.5 };
  pP1.position = { x: -1.8, y: 0, z: 1.5 };
  pP2.position = { x: 1.8, y: 0, z: 1.5 };
  pFoe.position = { x: 0, y: 0, z: -2.4 };
  pOp.spawnProtectionUntil = pP1.spawnProtectionUntil = pP2.spawnProtectionUntil = pFoe.spawnProtectionUntil = -99;
  pOp.spell = 'fireball'; pOp.ultimate = 'chivalry'; pOp.prowess = 100;
  pP1.spell = 'gale'; pP1.ultimate = 'chivalry'; pP1.prowess = 100;
  pP2.spell = 'gale'; pP2.ultimate = 'chivalry'; pP2.prowess = 100;

  cOp.send({ type: 'siegeOperate', machine: 'drag-oon' });
  await cOp.next('snapshot', s => s.machines?.some(m => m.id === dCamp.id && m.operatorId === pOp.id));
  cP1.send({ type: 'siegeOperate', machine: 'drag-oon' });
  cP2.send({ type: 'siegeOperate', machine: 'drag-oon' });
  await cOp.next('snapshot', s => {
    const m = s.machines?.find(x => x.id === dCamp.id);
    return m && m.passengers?.filter(Boolean).length === 2;
  });

  // Trigger ordinary Desolation Spray, Camp Fire, and Steam the Team over sockets
  cOp.send({ type: 'attack', down: true });
  await cOp.next('snapshot', s => s.machines?.find(x => x.id === dCamp.id)?.sprayHeld === true);
  await new Promise(r => setTimeout(r, 250));
  cOp.send({ type: 'attack', down: false });
  cOp.send({ type: 'siegeSkill' });
  cOp.send({ type: 'dragOonSteam' });
  const campSteamSnap = await cOp.next('snapshot', s => {
    const m = s.machines?.find(x => x.id === dCamp.id);
    return m?.campFire?.active === true && m?.steamReadyAt > 0 && s.dragOonSteamRings?.length > 0;
  });
  assert.ok(campSteamSnap, 'Camp Fire and Steam the Team replicate cleanly over WebSocket');
  assert.ok(pFoe.health < 100 || !pFoe.alive, 'Desolation Spray and Steam damage nearby foe over network');

  // Stage 2: Reset combatants & clear lingering Stage 1 effects before Rite of Ascension
  room.dismountPlayerFromMachines(pOp, game.now(), false);
  room.dismountPlayerFromMachines(pP1, game.now(), false);
  room.dismountPlayerFromMachines(pP2, game.now(), false);
  dCamp.retired = true; dCamp.health = 0;
  if (room.dragOonSteamRings) room.dragOonSteamRings.length = 0;
  if (room.dragOonFlames) room.dragOonFlames.length = 0;
  if (room.dragOonSuppressionZones) room.dragOonSuppressionZones.length = 0;
  pFoe.health = 100; pFoe.alive = true; pFoe.dragOonMaxHealthLoss = 0;
  pFoe.respawnAt = null; pFoe.burn = null; pFoe.burns = []; pFoe.deaths = 0;
  pOp.kills = 0; pP1.kills = 0; pP2.kills = 0;
  pFoe.position = { x: 0, y: 0, z: -2.2 };
  const killsBeforeRite = 0;

  const d = createDragOon({ id: 'drag-net-1', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS, skill: { id: 'flightLikeHell', phase: 'idle', readyAt: 0 } });
  room.addMachine(d);
  pOp.position = { x: 0, y: 0, z: 3.5 };
  pP1.position = { x: -1.8, y: 0, z: 1.5 };
  pP2.position = { x: 1.8, y: 0, z: 1.5 };

  // All 3 crew sockets board DRAG-OON via real network siegeOperate commands!
  cOp.send({ type: 'siegeOperate', machine: 'drag-oon' });
  await cOp.next('snapshot', s => s.machines?.some(m => m.id === d.id && m.operatorId === pOp.id));
  cP1.send({ type: 'siegeOperate', machine: 'drag-oon' });
  cP2.send({ type: 'siegeOperate', machine: 'drag-oon' });
  const snapFullCrew = await cOp.next('snapshot', s => {
    const m = s.machines?.find(x => x.id === d.id);
    return m && m.passengers?.filter(Boolean).length === 2 && (m.infusions?.tiers?.gale ?? 0) >= 2;
  });
  assert.ok(snapFullCrew, 'All crew seated with Full Gale synced over WebSocket');

  // Collective opt-in over independent sockets (pax2 toggles commit -> withdraw -> commit)
  cOp.send({ type: 'dragOonRiteCommit', committed: true });
  cP1.send({ type: 'dragOonRiteCommit', committed: true });
  cP2.send({ type: 'dragOonRiteCommit', committed: true });
  await cOp.next('snapshot', s => s.machines?.find(x => x.id === d.id)?.riteStatus?.eligible === true);

  cP2.send({ type: 'dragOonRiteCommit', committed: false });
  await cOp.next('snapshot', s => s.machines?.find(x => x.id === d.id)?.riteStatus?.eligible === false);
  cP2.send({ type: 'dragOonRiteCommit', committed: true });
  await cOp.next('snapshot', s => s.machines?.find(x => x.id === d.id)?.riteStatus?.eligible === true);

  // Ignite Rite of Ascension over operator socket
  cOp.send({ type: 'dragOonRiteActivate' });
  const riteAir = await cFoe.next('snapshot', s => {
    const m = s.machines?.find(x => x.id === d.id);
    return m?.rite?.active === true && m.y > 1.8;
  });
  assert.ok(riteAir, 'Rocket ascension replicates over WebSocket');

  // Wait brief stabilization window then detonate over socket
  await new Promise(r => setTimeout(r, (DRAG_OON_TUNING.riteOfAscension.minDetonateDelaySec + 0.2) * 1000));
  cOp.send({ type: 'dragOonRiteDetonate' });
  const deadSnap = await cOp.next('snapshot', s => {
    const me = s.players?.find(p => p.id === pOp.id);
    const paxA = s.players?.find(p => p.id === p1Id);
    const paxB = s.players?.find(p => p.id === p2Id);
    return me?.alive === false && paxA?.alive === false && paxB?.alive === false;
  });
  assert.ok(deadSnap, 'Every committed crew member dies across networked sockets on Rite detonation');
  assert.ok(pFoe.health < 100 || !pFoe.alive, 'Foe beneath/near explosion is struck cleanly');
  const expectedEnemyKills = killsBeforeRite + (pFoe.deaths ?? (pFoe.alive ? 0 : 1));
  assert.equal(pOp.kills ?? 0, expectedEnemyKills, 'Operator earns credit only for enemy killed, zero teamkill or self-kill credits');
});
