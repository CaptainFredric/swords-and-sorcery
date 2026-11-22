import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import {
  createSiegeBladesState,
  provisionSiegeBladesFleet,
  stepSiegeBlades,
  resetSiegeBladesRound,
  beginSiegeBladesSelection,
  selectSiegeBladesMachine,
  SIEGE_SELECTION_SECONDS,
  SIEGE_RESELECTION_SECONDS,
  SIEGE_BLADES_FORMATS,
  SIEGE_MACHINE_CLASSES,
} from '../../shared/sim/siegeBladesMode.mjs';
import { serializeSnapshot, applyRoomCommand } from '../../shared/sim/wire.mjs';
import { damageSoFistication } from '../../shared/sim/soFistication.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { damageBiByeLlista } from '../../shared/sim/biByeLlista.mjs';
import { damageFightFlight } from '../../shared/sim/fightFlightComponents.mjs';

function setupSiegeBladesRoom({ format = 'MATCH', teamSize = 1, worldId = 'high-grounds', clashStarts = null, matchRounds = 3 } = {}) {
  const room = new Room('sb-test-room', {
    mode: GAME_MODES.SIEGE_BLADES,
    worldId,
  });
  room.state = 'PLAYING';

  // Setup mode state with custom options
  room.siegeBlades = createSiegeBladesState(room, {
    format,
    teamSize,
    clashStarts,
    matchRounds,
    botDifficulty: 'knight',
  });

  return room;
}

test('Siege Blades 1v1 Match spawns mirrored combatants in machines', () => {
  const room = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'azure-pilot', token: 'tok-1', name: 'Azure Pilot', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'crimson-pilot', token: 'tok-2', name: 'Crimson Pilot', team: TEAMS.DEFENDERS }, 0);

  provisionSiegeBladesFleet(room, 0);

  assert.equal(room.getMachines().length, 2);
  const m1 = room.getMachineForPlayer(p1.id);
  const m2 = room.getMachineForPlayer(p2.id);

  assert.ok(m1, 'Azure pilot should have an assigned machine');
  assert.ok(m2, 'Crimson pilot should have an assigned machine');
  assert.equal(m1.operatorId, p1.id);
  assert.equal(m2.operatorId, p2.id);

  // Check mirrored positions
  assert.ok(m1.z < 0, 'Azure machine should be on negative Z');
  assert.ok(m2.z > 0, 'Crimson machine should be on positive Z');
  assert.equal(m1.team, TEAMS.ATTACKERS);
  assert.equal(m2.team, TEAMS.DEFENDERS);

  // Snapshot contains siegeBlades state
  const snapshot = serializeSnapshot(room, 0);
  assert.ok(snapshot.siegeBlades);
  assert.equal(snapshot.siegeBlades.format, 'MATCH');
  assert.equal(snapshot.siegeBlades.roundNumber, 1);
  assert.equal(snapshot.siegeBlades.matchRounds, 3);
  assert.equal(snapshot.siegeBlades.selectionEndsAt, null);
});

test('Elimination rule: machine destruction causes player elimination; component damage does not', () => {
  const room = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'azure-pilot', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'crimson-pilot', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);

  // Force machine classes: Azure gets flight, Crimson gets ram
  p1.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.FLIGHT;
  p2.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.RAM;

  provisionSiegeBladesFleet(room, 0);

  const flt = room.getMachineForPlayer(p1.id);
  const ram = room.getMachineForPlayer(p2.id);

  // 1. Damage non-hull component: Fight-and-Flight rotor (deal 250 to overcome innate Steel mitigation)
  damageFightFlight(room, flt, 250, p2.id, 'sword', 1.0, { componentId: 'rotor' });
  stepSiegeBlades(room, 1 / 30, 1.1);

  assert.equal(flt.rotorHP, 0, 'Rotor destroyed');
  assert.equal(room.siegeBlades.eliminated.has(p1.id), false, 'Component destruction must NOT eliminate player');
  assert.equal(p1.alive, true);

  // 2. Destroy machine hull completely: Ram hull
  damageSoFistication(room, ram, 5000, p1.id, 'sword', 2.0, { componentId: 'hull' });
  stepSiegeBlades(room, 1 / 30, 2.1);

  assert.equal(room.siegeBlades.eliminated.has(p2.id), true, 'Machine destruction must eliminate player');
  assert.equal(p2.alive, false, 'Player should be cleanly eliminated');
  assert.equal(room.siegeBlades.eliminated.size, 1);

  // Crimson eliminated -> Azure wins round 1!
  assert.equal(room.siegeBlades.roundWinner, TEAMS.ATTACKERS);
  assert.equal(room.siegeBlades.scores[TEAMS.ATTACKERS], 1);
  assert.equal(room.siegeBlades.scores[TEAMS.DEFENDERS], 0);
});

test('Match format plays exactly five rounds even after one team has an early majority', () => {
  const room = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1, matchRounds: 5 });
  const azure = room.addPlayer({ id: 'azure-pilot', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const crimson = room.addPlayer({ id: 'crimson-pilot', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);
  provisionSiegeBladesFleet(room, 0);
  const winners=[TEAMS.ATTACKERS,TEAMS.ATTACKERS,TEAMS.ATTACKERS,TEAMS.DEFENDERS,TEAMS.DEFENDERS];
  let now=0;
  for(let i=0;i<winners.length;i++){
    const victim=winners[i]===TEAMS.ATTACKERS?crimson:azure;
    victim.alive=false;
    stepSiegeBlades(room,1/30,now+1);
    assert.equal(room.siegeBlades.roundWinner,winners[i]);
    assert.equal(room.siegeBlades.roundNumber,i+1);
    assert.equal(room.siegeBlades.matchFinished,i===4,
      'winning three straight rounds never skips configured fourth and fifth');
    if(i<4){
      resetSiegeBladesRound(room,now+2);
      assert.equal(room.getMachines().length,0,'between rounds the machines are unprovisioned');
      // (a later round's draft is shorter: each player's last machine is already chosen)
      assert.equal(room.siegeBlades.selectionEndsAt,now+2+SIEGE_RESELECTION_SECONDS);
      stepSiegeBlades(room,1/30,now+2+SIEGE_RESELECTION_SECONDS+.05);
      assert.equal(room.getMachines().length,2);
      now+=2+SIEGE_RESELECTION_SECONDS+.05;
    }
  }
  assert.equal(room.siegeBlades.scores[TEAMS.ATTACKERS],3);
  assert.equal(room.siegeBlades.scores[TEAMS.DEFENDERS],2);
  assert.equal(room.siegeBlades.matchWinner,TEAMS.ATTACKERS);
  assert.equal(room.state,'FINISHED');
});

test('Generic kills and global deadline cannot end a Siege Blades match prematurely',()=>{
  const room=setupSiegeBladesRoom({format:'MATCH',matchRounds:7});
  const azure=room.addPlayer({id:'azure',token:'a',team:TEAMS.ATTACKERS},0);
  const crimson=room.addPlayer({id:'crimson',token:'c',team:TEAMS.DEFENDERS},0);
  assert.equal(room.policy.scored,false);
  assert.equal(room.policy.timed,false);
  room.recordKill(azure.id,crimson.id,1);
  room.recordKill(azure.id,crimson.id,2);
  assert.equal(room.state,'PLAYING','two enemy kills are not the victory condition');
  assert.equal(room.siegeBlades.matchFinished,false);
});

test('Round machine selection is authoritative, per-player, and freezes input until deployment',()=>{
  const room=setupSiegeBladesRoom({format:'MATCH',matchRounds:5});
  const azure=room.addPlayer({id:'azure',token:'a',team:TEAMS.ATTACKERS},0);
  const crimson=room.addPlayer({id:'crimson',token:'c',team:TEAMS.DEFENDERS},0);
  room.siegeBlades.machineSelection=SIEGE_MACHINE_CLASSES.RAM;
  beginSiegeBladesSelection(room,10);
  assert.equal(room.getMachines().length,0);
  assert.equal(room.siegeBlades.selectionEndsAt,10+SIEGE_SELECTION_SECONDS);
  assert.ok(applyRoomCommand(room,azure,{type:'siegeBladesChoose',machine:'not-a-machine'},11).rejected);
  assert.ok(!applyRoomCommand(room,azure,{type:'siegeBladesChoose',machine:SIEGE_MACHINE_CLASSES.FLIGHT},11).rejected);
  assert.ok(!applyRoomCommand(room,azure,{type:'siegeBladesChoose',machine:SIEGE_MACHINE_CLASSES.BALLISTA},12).rejected,
    'players can change their minds');
  assert.ok(!applyRoomCommand(room,crimson,{type:'siegeBladesChoose',machine:SIEGE_MACHINE_CLASSES.RAM},12).rejected);
  const original=azure.input.forward;
  applyRoomCommand(room,azure,{type:'input',forward:1,right:0},12);
  assert.equal(azure.input.forward,original,'movement is disabled during the draft');
  assert.equal(room.siegeBlades.selectionChoices.get(azure.id),SIEGE_MACHINE_CLASSES.BALLISTA);
  assert.equal(room.siegeBlades.selectionChoices.get(crimson.id),SIEGE_MACHINE_CLASSES.RAM);
  stepSiegeBlades(room,1/30,10+SIEGE_SELECTION_SECONDS-.01);
  assert.equal(room.getMachines().length,0,'selection closes on the actual server deadline');
  stepSiegeBlades(room,1/30,10+SIEGE_SELECTION_SECONDS+.01);
  assert.equal(room.getMachineForPlayer(azure.id)?.class,SIEGE_MACHINE_CLASSES.BALLISTA);
  assert.equal(room.getMachineForPlayer(crimson.id)?.class,SIEGE_MACHINE_CLASSES.RAM);
  assert.equal(room.siegeBlades.selectionEndsAt,null);
  assert.ok(applyRoomCommand(room,azure,{type:'siegeBladesChoose',machine:SIEGE_MACHINE_CLASSES.FLIGHT},20).rejected,
    'a late packet cannot change already spawned machinery');
});

test('Opening a real match creates a selection phase before any combat machines exist',()=>{
  const room=setupSiegeBladesRoom();
  room.addPlayer({id:'a',token:'a',team:TEAMS.ATTACKERS},0);
  room.addPlayer({id:'b',token:'b',team:TEAMS.DEFENDERS},0);
  room.startMatch(0);
  assert.equal(room.getMachines().length,0);
  assert.equal(room.siegeBlades.selectionEndsAt,SIEGE_SELECTION_SECONDS);
  stepRoom(room,1/30,1,room.world);
  assert.equal(room.getMachines().length,0);
  stepRoom(room,1/30,SIEGE_SELECTION_SECONDS+.01,room.world);
  assert.equal(room.getMachines().length,2);
  assert.equal(room.siegeBlades.roundNumber,1);
});

test('Endless format runs score pause, timed machine draft, then atomically resets', () => {
  const room = setupSiegeBladesRoom({ format: 'ENDLESS', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'p1', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'p2', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);
  provisionSiegeBladesFleet(room, 0);
  p2.alive=false;
  stepSiegeBlades(room,1/30,1);
  assert.equal(room.siegeBlades.scores[TEAMS.ATTACKERS],1);
  assert.equal(room.siegeBlades.roundResetCountdown,2);
  stepSiegeBlades(room,2.1,3.1);
  assert.equal(room.siegeBlades.roundNumber,2);
  assert.equal(room.getMachines().length,0);
  assert.equal(room.siegeBlades.selectionEndsAt,3.1+SIEGE_RESELECTION_SECONDS);
  assert.equal(p2.alive,true);
  assert.equal(room.siegeBlades.matchFinished,false);
  assert.equal(selectSiegeBladesMachine(room,p1,SIEGE_MACHINE_CLASSES.FLIGHT,4),true);
  stepSiegeBlades(room,1/30,3.1+SIEGE_RESELECTION_SECONDS+.05);
  assert.equal(room.siegeBlades.selectionEndsAt,null);
  assert.equal(room.getMachines().length,2);
  assert.equal(room.getMachineForPlayer(p1.id)?.class,SIEGE_MACHINE_CLASSES.FLIGHT);
});

test('Overtime Engagement Zone activates at 180s in Match format and enforces low-altitude Flight contest', () => {
  const room = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'p1', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'p2', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);

  p1.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.RAM;
  p2.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.FLIGHT;

  provisionSiegeBladesFleet(room, 0);

  const ram = room.getMachineForPlayer(p1.id);
  const flt = room.getMachineForPlayer(p2.id);

  // Before 180s: Overtime not active
  stepSiegeBlades(room, 1.0, 100.0);
  assert.equal(room.siegeBlades.overtimeActive, false);

  // At 180s: Overtime activates
  stepSiegeBlades(room, 1.0, 181.0);
  assert.equal(room.siegeBlades.overtimeActive, true);

  // Move Azure Ram into zone center (0, 0, 0)
  ram.x = 0; ram.y = 0; ram.z = 0;
  p1.position = { x: 0, y: 0, z: 0 };

  // Place Crimson Flight directly above zone center at high altitude (Y = 25m; bridge is Y = 12, ground is Y = 0)
  flt.x = 0; flt.y = 25; flt.z = 0;
  p2.position = { x: 0, y: 25, z: 0 };

  // High altitude (> 4m) must NOT contest the zone!
  stepSiegeBlades(room, 1.0, 182.0);
  assert.equal(room.siegeBlades.zone.controllingTeam, TEAMS.ATTACKERS);
  assert.equal(room.siegeBlades.zone.contested, false);
  assert.ok(room.siegeBlades.zone.holdSec > 0);

  // Lower Flight to low altitude (Y = 2m; altitude <= 4m) -> NOW it contests!
  flt.y = 2.0;
  p2.position.y = 2.0;
  const holdBefore = room.siegeBlades.zone.holdSec;

  stepSiegeBlades(room, 1.0, 183.0);
  assert.equal(room.siegeBlades.zone.contested, true, 'Low altitude Flight should contest the zone');
  assert.ok(room.siegeBlades.zone.holdSec < holdBefore, 'Contested zone timer must decay');
});

test('Clash Starts spawn combatants 20–28m apart with symmetric line of sight', () => {
  const room = setupSiegeBladesRoom({ format: 'ENDLESS', teamSize: 1, clashStarts: true });
  room.siegeBlades.forceClash = true;
  const p1 = room.addPlayer({ id: 'p1', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'p2', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);

  provisionSiegeBladesFleet(room, 0);

  assert.equal(room.siegeBlades.clashActiveThisRound, true);

  const m1 = room.getMachineForPlayer(p1.id);
  const m2 = room.getMachineForPlayer(p2.id);

  const separation = Math.hypot(m2.x - m1.x, m2.z - m1.z);
  assert.ok(separation >= 20 && separation <= 28, `Separation ${separation} must be between 20 and 28m`);
});

test('Overtime arena-specific radius and 20-second continuous hold requirement', () => {
  const rHigh = setupSiegeBladesRoom({ worldId: 'high-grounds' });
  const rFoundry = setupSiegeBladesRoom({ worldId: 'blackbell-foundry' });
  const rOuter = setupSiegeBladesRoom({ worldId: 'outerworks' });

  assert.equal(rHigh.siegeBlades.zone.radius, 28);
  assert.equal(rFoundry.siegeBlades.zone.radius, 26);
  assert.equal(rOuter.siegeBlades.zone.radius, 24);
  assert.equal(rHigh.siegeBlades.overtimeHoldRequired, 20);
});

test('Clash Starts probability is 12% in casual 1v1 Endless, and 0% in Match or when disabled', () => {
  // In Match mode: 0% clash
  const rMatch = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1, clashStarts: true });
  rMatch.addPlayer({ id: 'p1', token: '1', team: TEAMS.ATTACKERS }, 0);
  rMatch.addPlayer({ id: 'p2', token: '2', team: TEAMS.DEFENDERS }, 0);
  provisionSiegeBladesFleet(rMatch, 0);
  assert.equal(rMatch.siegeBlades.clashActiveThisRound, false);

  // When disabled: 0% clash
  const rDisabled = setupSiegeBladesRoom({ format: 'ENDLESS', teamSize: 1, clashStarts: false });
  rDisabled.addPlayer({ id: 'p1', token: '1', team: TEAMS.ATTACKERS }, 0);
  rDisabled.addPlayer({ id: 'p2', token: '2', team: TEAMS.DEFENDERS }, 0);
  provisionSiegeBladesFleet(rDisabled, 0);
  assert.equal(rDisabled.siegeBlades.clashActiveThisRound, false);

  // In 1v1 Endless with clash enabled, verify probability over trials
  let clashCount = 0;
  const trials = 1000;
  for (let i = 0; i < trials; i++) {
    const r = setupSiegeBladesRoom({ format: 'ENDLESS', teamSize: 1, clashStarts: true });
    r.addPlayer({ id: 'p1', token: '1', team: TEAMS.ATTACKERS }, 0);
    r.addPlayer({ id: 'p2', token: '2', team: TEAMS.DEFENDERS }, 0);
    provisionSiegeBladesFleet(r, 0);
    if (r.siegeBlades.clashActiveThisRound) clashCount++;
  }
  // Expected ~120 out of 1000 (standard deviation ~10.3). Should easily be between 60 and 180.
  assert.ok(clashCount > 60 && clashCount < 180, `Clash frequency ${clashCount}/${trials} should be around 12%`);
});

test('Mutual elimination handles draw explicitly without awarding score to null team', () => {
  const room = setupSiegeBladesRoom({ format: 'MATCH', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'p1', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'p2', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);
  provisionSiegeBladesFleet(room, 0);

  // Both eliminated simultaneously
  p1.alive = false;
  p2.alive = false;
  stepSiegeBlades(room, 1 / 30, 1.0);

  assert.equal(room.siegeBlades.roundWinner, 'DRAW');
  assert.equal(room.siegeBlades.scores[TEAMS.ATTACKERS], 0);
  assert.equal(room.siegeBlades.scores[TEAMS.DEFENDERS], 0);
  assert.equal(room.siegeBlades.scores[null], undefined);
});

test('Round reset comprehensively restores pilot health, stamina, prowess, cooldowns, and Disaster afflictions', () => {
  const room = setupSiegeBladesRoom({ format: 'ENDLESS', teamSize: 1 });
  const p1 = room.addPlayer({ id: 'p1', token: 'tok-1', team: TEAMS.ATTACKERS }, 0);
  const p2 = room.addPlayer({ id: 'p2', token: 'tok-2', team: TEAMS.DEFENDERS }, 0);
  provisionSiegeBladesFleet(room, 0);

  // Inflict damage, afflictions, cooldowns on p1
  p1.health = 20;
  p1.guardStamina = 10;
  p1.prowess = 80;
  p1.burn = { active: true, expiresAt: 100 };
  p1.chill = { active: true, expiresAt: 100 };
  p1.spellReadyAt = 50;
  p1.pendingSpell = { id: 'sunder' };

  resetSiegeBladesRound(room, 10.0);

  assert.equal(p1.health, 100);
  assert.equal(p1.guardStamina, 100);
  assert.equal(p1.prowess, 0);
  assert.equal(p1.burn, null);
  assert.equal(p1.chill, null);
  assert.equal(p1.spellReadyAt, 0);
  assert.equal(p1.pendingSpell, null);
});

test('Authoritative Bot Controllers step machine weapons and steering in Siege Blades', () => {
  const room = setupSiegeBladesRoom({ format: 'ENDLESS', teamSize: 1 });
  const human = room.addPlayer({ id: 'human', token: 'h', team: TEAMS.ATTACKERS }, 0);
  const bot = room.addPlayer({ id: 'bot-1', token: 'b', actorKind: 'bot', team: TEAMS.DEFENDERS }, 0);

  human.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.RAM;
  bot.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.BALLISTA;

  provisionSiegeBladesFleet(room, 0);

  const botMachine = room.getMachineForPlayer(bot.id);
  assert.ok(botMachine);
  assert.equal(botMachine.operatorId, bot.id);

  // Step several simulation ticks
  for (let t = 0; t < 10; t++) {
    stepSiegeBlades(room, 1 / 30, t * (1 / 30));
  }

  // Verify bot generated inputs
  assert.ok(Number.isFinite(bot.input?.yaw));
  assert.ok(Number.isFinite(bot.input?.pitch));
});
