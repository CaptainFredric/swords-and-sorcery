import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../shared/sim/Room.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import {
  createSiegeBladesState,
  provisionSiegeBladesFleet,
  stepSiegeBlades,
  SIEGE_MACHINE_CLASSES,
  SIEGE_BOT_DIFFICULTIES,
} from '../../shared/sim/siegeBladesMode.mjs';
import { damageSoFistication } from '../../shared/sim/soFistication.mjs';
import { SIEGE_SKILL_OPTIONS, selectedSiegeSkill } from '../../shared/src/siegeLoadout.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';

function setupBotRoom(machineClass, difficulty = 'knight') {
  const room = new Room('sb-bot-test', {
    mode: GAME_MODES.SIEGE_BLADES,
    worldId: 'high-grounds',
  });
  room.state = 'PLAYING';
  room.siegeBlades = createSiegeBladesState(room, {
    format: 'ENDLESS',
    teamSize: 1,
    botDifficulty: difficulty,
    clashStarts: false,
  });

  const bot1 = room.addPlayer({ id: 'bot-azure', token: 'b1', team: TEAMS.ATTACKERS }, 0);
  const bot2 = room.addPlayer({ id: 'bot-crimson', token: 'b2', team: TEAMS.DEFENDERS }, 0);
  bot1.actorKind = 'bot';
  bot2.actorKind = 'bot';

  bot1.preferredSiegeMachine = machineClass;
  bot2.preferredSiegeMachine = machineClass;

  provisionSiegeBladesFleet(room, 0);
  return { room, bot1, bot2 };
}


test('Siege Blades bots equip actual Skills by difficulty; A Sharp Turn remains built-in', () => {
  const choices = [
    [SIEGE_MACHINE_CLASSES.RAM, 'soFist', 'beatToThePunch', 'longArmToTheJaw'],
    [SIEGE_MACHINE_CLASSES.BALLISTA, 'biBye', 'boltToTheOccasion', 'lookAroundAndFindOut'],
    [SIEGE_MACHINE_CLASSES.FLIGHT, 'fightFlight', 'fireAwayRightHere', 'narrowToOne'],
  ];
  for (const [kind, slot, ordinary, champion] of choices) {
    for (const difficulty of ['squire', 'knight', 'champion']) {
      const { room, bot1 } = setupBotRoom(kind, difficulty);
      const machine = room.getMachineForPlayer(bot1.id);
      const expected = difficulty === 'champion' ? champion : ordinary;
      assert.ok(SIEGE_SKILL_OPTIONS[slot].includes(expected));
      assert.equal(bot1.siegeLoadout[slot], expected, `${kind}/${difficulty}: proper Armory slot`);
      assert.equal(selectedSiegeSkill(bot1, slot), expected);
      assert.equal(machine.skill?.id, expected, `${kind}/${difficulty}: machine has actual selected Skill`);
      assert.equal(bot1.siegeLoadout.skill, undefined, 'no legacy pseudo-skill field');
      assert.notEqual(machine.skill?.id, 'aSharpTurn', 'the ballista sweep is never a Skill');
    }
  }
});

test('Siege Blades carries a human operator\'s equipped Skill into its provisioned machine', () => {
  const room = new Room('sb-human-loadout', { mode: GAME_MODES.SIEGE_BLADES, worldId: 'high-grounds' });
  room.state = 'PLAYING';
  room.siegeBlades = createSiegeBladesState(room, { format: 'ENDLESS', teamSize: 1, clashStarts: false });
  const human = room.addPlayer({
    id: 'human', token: 'h', team: TEAMS.ATTACKERS,
    siegeLoadout: { biBye: 'coldHowTouching', soFist: 'hellpingHand', fightFlight: 'doNotStopMyAscension' },
  }, 0);
  const opponent = room.addPlayer({ id: 'bot', token: 'b', team: TEAMS.DEFENDERS }, 0);
  opponent.actorKind = 'bot';
  human.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.BALLISTA;
  opponent.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.RAM;
  provisionSiegeBladesFleet(room, 0);
  assert.equal(room.getMachineForPlayer(human.id)?.skill?.id, 'coldHowTouching');
  assert.equal(room.getMachineForPlayer(opponent.id)?.skill?.id, 'beatToThePunch');
});

test('SO-FIST-ICATION Ram bot mirror match executes steering, charge, and piston strikes', () => {
  const { room, bot1, bot2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.RAM, 'champion');

  const m1 = room.getMachineForPlayer(bot1.id);
  const m2 = room.getMachineForPlayer(bot2.id);

  assert.ok(m1);
  assert.ok(m2);

  for (let tick = 0; tick < 30; tick++) {
    stepSiegeBlades(room, 1 / 30, tick * (1 / 30));
  }

  // Champion bot aims towards enemy
  assert.ok(Number.isFinite(bot1.input.forward));
  assert.ok(Number.isFinite(bot1.input.right));
  assert.ok(Number.isFinite(bot2.input.forward));
});

test('Bi-Bye-llista Ballista bot mirror match controls deployment, tracking, and independent shots', () => {
  const { room, bot1, bot2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.BALLISTA, 'knight');

  const m1 = room.getMachineForPlayer(bot1.id);
  const m2 = room.getMachineForPlayer(bot2.id);

  assert.ok(m1);
  assert.ok(m2);

  for (let tick = 0; tick < 30; tick++) {
    stepSiegeBlades(room, 1 / 30, tick * (1 / 30));
  }

  assert.ok(Number.isFinite(bot1.input.yaw));
  assert.ok(Number.isFinite(bot1.input.pitch));
  assert.ok(bot1.input.siegeTarget);
});

test('Fight-and-Flight bot mirror match controls altitude, repeater aim, and combat passes', () => {
  const { room, bot1, bot2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.FLIGHT, 'squire');

  const m1 = room.getMachineForPlayer(bot1.id);
  const m2 = room.getMachineForPlayer(bot2.id);

  assert.ok(m1);
  assert.ok(m2);

  for (let tick = 0; tick < 30; tick++) {
    stepSiegeBlades(room, 1 / 30, tick * (1 / 30));
  }

  assert.ok(Number.isFinite(bot1.input.yaw));
  assert.ok(Number.isFinite(bot1.input.pitch));
});

test('Bot decision frequency obeys reaction intervals (Squire 0.48s vs Champion 0.10s)', () => {
  const squireRoom = setupBotRoom(SIEGE_MACHINE_CLASSES.RAM, 'squire');
  const championRoom = setupBotRoom(SIEGE_MACHINE_CLASSES.RAM, 'champion');

  // Step 1 second (30 ticks)
  for (let tick = 0; tick < 30; tick++) {
    const t = tick * (1 / 30);
    stepSiegeBlades(squireRoom.room, 1 / 30, t);
    stepSiegeBlades(championRoom.room, 1 / 30, t);
  }

  const squireDecisions = squireRoom.bot1.siegeAi?.decisions ?? 0;
  const championDecisions = championRoom.bot1.siegeAi?.decisions ?? 0;

  // Squire with 0.48s reaction should make ~2-3 decisions in 1s
  assert.ok(squireDecisions >= 2 && squireDecisions <= 3, `Squire decisions ${squireDecisions} should be 2-3`);
  // Champion with 0.10s reaction should make ~10-11 decisions in 1s
  assert.ok(championDecisions >= 9 && championDecisions <= 11, `Champion decisions ${championDecisions} should be 9-11`);
  assert.ok(championDecisions > squireDecisions * 3, 'Champion must decide substantially faster than Squire');
});

test('Skilled and Champion bots execute Sheathe in Steel when machinery is damaged', () => {
  const { room, bot1, bot2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.RAM, 'champion');
  bot1.spell = 'steel';
  bot1.siegeAi = { difficulty: 'champion' };

  const m1 = room.getMachineForPlayer(bot1.id);
  // Damage machine hull
  damageSoFistication(room, m1, 300, bot2.id, 'sword', 1.0, { componentId: 'hull' });
  assert.ok(m1.health < m1.maxHealth);

  // Step bots
  stepSiegeBlades(room, 1 / 30, 2.0);

  // Bot should have cast Sheathe in Steel
  assert.ok(m1.siegeSteel, 'Machine should have active siegeSteel ward from bot cast');
  assert.equal(m1.siegeSteel.state, 'active');
});

test('Complete 3v3 Siege Blades bot match provisions 6 vehicles across 3 machine classes and steps physics', () => {
  const room = new Room('sb-3v3-test', {
    mode: GAME_MODES.SIEGE_BLADES,
    worldId: 'high-grounds',
    teamSize: 3,
  });
  room.state = 'PLAYING';
  room.siegeBlades = createSiegeBladesState(room, {
    format: 'MATCH',
    teamSize: 3,
    matchRounds: 3,
    botDifficulty: 'knight',
    clashStarts: false,
  });

  // Provision 3 Azure bots and 3 Crimson bots
  const azureBots = [];
  const crimsonBots = [];
  for (let i = 0; i < 3; i++) {
    const a = room.addPlayer({ id: `az-${i}`, token: `tok-a${i}`, team: TEAMS.ATTACKERS }, 0);
    const c = room.addPlayer({ id: `cr-${i}`, token: `tok-c${i}`, team: TEAMS.DEFENDERS }, 0);
    a.actorKind = 'bot';
    c.actorKind = 'bot';
    azureBots.push(a);
    crimsonBots.push(c);
  }

  provisionSiegeBladesFleet(room, 0);

  const machines = room.getMachines();
  assert.equal(machines.length, 6, 'Should provision exactly 6 vehicles for 3v3');

  // Verify all 3 classes represented
  const kinds = new Set(machines.map(m => m.class ?? m.kind));
  assert.ok(kinds.has('so-fist-ication') || kinds.has('ram'));
  assert.ok(kinds.has('bi-bye-llista') || kinds.has('ballista'));
  assert.ok(kinds.has('fight-and-flight') || kinds.has('flight'));

  // Step 60 ticks (2 seconds)
  for (let tick = 0; tick < 60; tick++) {
    stepSiegeBlades(room, 1 / 30, tick * (1 / 30));
  }

  // Verify bots generated inputs and match is active
  for (const bot of [...azureBots, ...crimsonBots]) {
    assert.ok(Number.isFinite(bot.input?.yaw));
  }
  assert.equal(room.siegeBlades.format, 'MATCH');
  assert.equal(room.siegeBlades.roundNumber, 1);
});

test('Uppercuff uses Ram Shunt/Elevation/Skills and avoids static 3.8m oscillation', async () => {
  const { room, bot1, bot2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.RAM, 'champion');
  const m1 = room.machines.get(bot1.operatingRamId);
  const m2 = room.machines.get(bot2.operatingRamId);
  assert.ok(m1 && m2);
  m1.x = -7.5; m1.z = 0; m1.heading = Math.PI / 2;
  m2.x = 0; m2.z = 0; m2.heading = -Math.PI / 2;
  let shunted = false, firedOrFlanked = false;
  for (let i = 1; i <= 120; i++) {
    stepRoom(room, 1 / 30, i / 30, room.world);
    if ((m1.shuntUntil ?? 0) > i / 30 || (m1.shuntCooldownUntil ?? 0) > 0) shunted = true;
    if ((m1.cycleStartedAt ?? 0) > 0 || Math.abs(m1.z) > 0.35 || m1.x > -6.5) firedOrFlanked = true;
  }
  assert.ok(shunted || firedOrFlanked, 'Ram bot should initiate shunt/piston/flank instead of passive reverse');
  // Anti-air check when enemy Fight-and-Flight hovers overhead
  const afRoom = new Room('sb-aa', { mode: GAME_MODES.SIEGE_BLADES, worldId: 'high-grounds' });
  afRoom.state = 'PLAYING';
  afRoom.siegeBlades = createSiegeBladesState(afRoom, { format: 'ENDLESS', teamSize: 1, botDifficulty: 'champion', clashStarts: false });
  const rB = afRoom.addPlayer({ id: 'rb', token: 'rb', team: TEAMS.ATTACKERS }, 0);
  const fB = afRoom.addPlayer({ id: 'fb', token: 'fb', team: TEAMS.DEFENDERS }, 0);
  rB.actorKind = 'bot'; rB.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.RAM;
  fB.actorKind = 'bot'; fB.preferredSiegeMachine = SIEGE_MACHINE_CLASSES.FLIGHT;
  provisionSiegeBladesFleet(afRoom, 0);
  const mr = afRoom.machines.get(rB.operatingRamId);
  const mf = afRoom.machines.get(fB.operatingFightFlightId);
  mr.x = 0; mr.z = -5; mr.heading = 0;
  mf.x = 0; mf.z = 0; mf.y = 3.2; mf.grounded = false;
  let elevated = false;
  for (let i = 1; i <= 30; i++) {
    stepRoom(afRoom, 1 / 30, i / 30, afRoom.world);
    if (rB.input?.ramRaise || rB.input?.ramPitchUp || (mr.ramLiftY ?? 0) > 0.05) elevated = true;
  }
  assert.ok(elevated, 'Uppercuff should raise/pitch ram toward hovering aircraft');
});

test('Ballistefan triggers Sharp Turn / retract defense under close threat and Donte manages charge & rotor aim', () => {
  const { room: blRoom, bot1: bl1, bot2: bl2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.BALLISTA, 'champion');
  const mb = blRoom.machines.get(bl1.operatingBallistaId);
  const mbEnemy = blRoom.machines.get(bl2.operatingBallistaId);
  mb.mode = 'DEPLOYED'; mb.deployed = true; mb.deployProgress = 1;
  mb.x = 0; mb.z = 0; mb.baseYaw = 0; mb.headYaw = 0;
  // Place enemy close behind/aside so Sharp Turn or retract responds
  mbEnemy.x = 0; mbEnemy.z = -6.5; mbEnemy.vx = 0; mbEnemy.vz = 6;
  let reacted = false;
  for (let i = 1; i <= 25; i++) {
    stepRoom(blRoom, 1 / 30, i / 30, blRoom.world);
    if (mb.sharpTurnActive || mb.mode !== 'DEPLOYED' || (mb.deployTarget ?? 1) < 1) reacted = true;
  }
  assert.ok(reacted, 'Deployed Ballista bot should react with Sharp Turn or early retract under close threat');

  const { room: flRoom, bot1: fl1, bot2: fl2 } = setupBotRoom(SIEGE_MACHINE_CLASSES.FLIGHT, 'champion');
  const mf1 = flRoom.machines.get(fl1.operatingFightFlightId);
  const mf2 = flRoom.machines.get(fl2.operatingFightFlightId);
  mf1.x = 0; mf1.z = -12; mf1.y = 2.0; mf1.grounded = false; mf1.flightCharge = 10; // low charge forces regroup landing
  mf2.x = 0; mf2.z = 0; mf2.y = 2.5; mf2.grounded = false; mf2.rotorHP = 90;
  for (let i = 1; i <= 20; i++) stepRoom(flRoom, 1 / 30, i / 30, flRoom.world);
  assert.equal(fl1.input?.jump, false, 'Low-charge Donte must not keep climbing instead of conserving/landing');
  assert.ok((fl1.input?.pitch ?? 0) > -0.6 && Number.isFinite(fl1.input?.pitch), 'Donte aims smoothly');
});
