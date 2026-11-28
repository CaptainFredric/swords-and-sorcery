import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './Room.mjs';
import { GAME_MODES } from '../src/modes.mjs';
import { TEAMS } from '../src/teams.mjs';
import { DRAG_OON_ID, DRAG_OON_TUNING } from '../src/dragOonConfig.mjs';
import { stepRoom, applyDamage, tryCastSpell } from './combat.mjs';
import { serializeSnapshot, applyRoomCommand } from './wire.mjs';
import { createDragOon, damageDragOon, triggerAllAbortDestruction } from './dragOon.mjs';
import { assignDragOonCrewInstant, computeDragOonInfusions } from './dragOonCrew.mjs';
import { effectiveFuelCapacity, spendDragOonFuel, addDragOonHeat, addDragOonOverheatPenalty, ventDragOonHeat, stepDragOonThermal } from './dragOonThermal.mjs';
import { isPointSuppressedByDragOon, dragOonProjectileAttenuation } from './dragOonFields.mjs';
import { selectSiegeBladesMachine, createSiegeBladesState, beginSiegeBladesSelection, provisionSiegeBladesFleet } from './siegeBladesMode.mjs';

function makeFlatWorld(solids = []) {
  return {
    id: 'flat-test',
    abyssY: -12,
    solids,
    floors: [{ center: [0, 0, 0], size: [240, 1, 240], y: 0 }],
    spawnPoints: [
      { x: -18, y: 0, z: 0, yaw: -Math.PI / 2, team: TEAMS.ATTACKERS },
      { x: 18, y: 0, z: 0, yaw: Math.PI / 2, team: TEAMS.DEFENDERS },
    ],
  };
}

function makeRoom(mode = GAME_MODES.PRACTICE, world = makeFlatWorld(), opts = {}) {
  const room = new Room('dragoon-test', { mode, worldId: 'high-grounds', isPrivate: true, ...opts });
  room.world = world;
  room.state = 'PLAYING';
  return room;
}

function addActor(room, id, { x = 0, z = 0, yaw = 0, team = null, spell = 'fireball', siegeLoadout = null, preparedSpells = [] } = {}, now = 1) {
  const p = room.addPlayer({
    id,
    token: `tok-${id}`,
    name: id,
    spell,
    preparedSpells,
    siegeLoadout,
    team,
  }, now);
  p.position = { x, y: 0, z };
  p.yaw = yaw;
  p.input = { forward: 0, right: 0, jump: false, sprint: false, yaw, pitch: 0 };
  p.spawnProtectionUntil = -Infinity;
  return p;
}

function advance(room, seconds, dt = 1 / 60, startNow = 10) {
  const steps = Math.round(seconds / dt);
  let t = startNow;
  for (let i = 0; i < steps; i++) {
    t += dt;
    stepRoom(room, dt, t, room.world);
  }
  return t;
}

test('Practice build/dismantle and zero-radius 8-wheel pivot-in-place kinematics', () => {
  const room = makeRoom(GAME_MODES.PRACTICE);
  const p = addActor(room, 'p1', { x: 0, z: 8, yaw: 0 }, 1);
  p.spawnProtectionUntil = -Infinity;

  const built = applyRoomCommand(room, p, { type: 'practiceSiege', action: 'build', machine: DRAG_OON_ID }, 2);
  assert.deepEqual(built, {});
  assert.ok(room.dragOon);
  const m = room.dragOon;
  assert.equal(m.maxHealth, DRAG_OON_TUNING.maxHealth);
  assert.equal(m.wheelRolls.length, 8);

  // Move beside and board as operator (timed boarding)
  p.position = { x: m.x, y: m.y, z: m.z + 2 };
  const board = applyRoomCommand(room, p, { type: 'siegeOperate', machine: DRAG_OON_ID }, 2.1);
  assert.deepEqual(board, {});
  let t = advance(room, DRAG_OON_TUNING.crew.boardDurationSec + 0.1, 1 / 60, 2.1);
  assert.equal(p.operatingDragOonId, m.id);
  assert.equal(m.operatorId, p.id);

  // Zero forward velocity, right turn -> heading pivots smoothly without forward drift
  const x0 = m.x, z0 = m.z, h0 = m.heading;
  p.input = { forward: 0, right: 1, jump: false, sprint: false, yaw: h0, pitch: 0 };
  t = advance(room, 0.8, 1 / 60, t);
  assert.ok(Math.abs(m.heading - h0) > 0.35, '8-wheel chassis should pivot in place');
  assert.ok(Math.hypot(m.x - x0, m.z - z0) < 0.05, 'pivot in place should not translate chassis');
  // Independent left vs right wheel roll directions
  assert.notEqual(Math.sign(m.wheelRolls[0]), Math.sign(m.wheelRolls[1]));

  // Dismantle cleans up cleanly when grounded
  const dism = applyRoomCommand(room, p, { type: 'practiceSiege', action: 'dismantle', machine: DRAG_OON_ID }, t);
  assert.deepEqual(dism, {});
  assert.equal(room.dragOon, null);
  assert.equal(p.operatingDragOonId, null);
});

test('Hull armor: DoT immunity against ongoing burn vs direct spell/sword/cannon hits + perpetual Steel mitigation', () => {
  const room = makeRoom(GAME_MODES.FFA);
  const driver = addActor(room, 'driver', { x: 0, z: 0, team: TEAMS.ATTACKERS }, 1);
  const attacker = addActor(room, 'enemy', { x: 0, z: -8, yaw: Math.PI, team: TEAMS.DEFENDERS }, 1);
  const m = createDragOon({ id: 'drag-1', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS });
  room.addMachine(m);
  assignDragOonCrewInstant(room, m, driver, { role: 'operator', now: 1 });

  const hpBefore = m.health;
  // Ongoing DoT sources are immune on hull (never hurt hull OR leak to seated driver)
  assert.equal(damageDragOon(room, m, 30, attacker.id, 'burn', 2), false);
  assert.equal(damageDragOon(room, m, 30, attacker.id, 'one_hit_ground_fire', 2), false);
  assert.equal(damageDragOon(room, m, 30, attacker.id, 'dragoon-raze-dot', 2), false);
  assert.equal(m.health, hpBefore);
  assert.equal(driver.health, 100);

  // Direct spell & physical hits DO damage hull (mitigated by perpetual Steel)
  const hitOk = damageDragOon(room, m, 100, attacker.id, 'fireball', 2.1, { componentId: 'hull', point: { x: 0, y: 1.5, z: 0 } });
  assert.equal(hitOk, true);
  assert.ok(m.health < hpBefore && m.health > hpBefore - 100, 'perpetual Steel mitigates direct spell damage');
  assert.equal(driver.health, 100, 'hull hit must not leak HP directly into seated crew');
});

test('Thermal system: overpressure shrinks fuel capacity, recovery grants NO free fuel, Full Fire slows overpressure decay', () => {
  const m = createDragOon({ fuel: 100, heat: 0 });
  addDragOonOverheatPenalty(m, 30);
  const effCap = effectiveFuelCapacity(m);
  assert.equal(effCap, 70);
  assert.equal(m.fuel, 70);

  // Spend 20 fuel while penalized
  m.lastFuelSpendAt = 4.9;
  spendDragOonFuel(m, 20);
  assert.equal(m.fuel, 50);

  // Recover penalty within regen delay window: fuel must NOT exceed 50 (zero free fuel!)
  m.overheatPenalty = 0;
  stepDragOonThermal(m, 0.2, 5.0, { frostTier: 0, fireTier: 0, spendingFuel: false });
  assert.equal(effectiveFuelCapacity(m), 100);
  assert.ok(m.fuel <= 50 + 0.01, 'capacity recovery must not invent free fuel');

  // Full Fire retains overpressure heat above 100 longer than without Fire
  const mNormal = createDragOon({ heat: 130, fuel: 80 });
  const mFullFire = createDragOon({ heat: 130, fuel: 80, retainedOverpressureHeat: true });
  stepDragOonThermal(mNormal, 1.0, 5, { frostTier: 0, fireTier: 0, spendingFuel: false });
  stepDragOonThermal(mFullFire, 1.0, 5, { frostTier: 0, fireTier: 2, spendingFuel: false });
  assert.ok(mFullFire.heat > mNormal.heat, 'Full Fire slows heat dissipation above 100');
});

test('Desolation Spray prep delay removed by Lightning 2 + aerosol gag cosmetic safety', () => {
  const room = makeRoom(GAME_MODES.FFA);
  room.siegeRandom = () => 0.001; // force rare <1% aerosol gag deterministically
  const driver = addActor(room, 'd', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'fireball' }, 1);
  const enemy = addActor(room, 'e', { x: 0, z: -7, team: TEAMS.DEFENDERS }, 1);
  const m = createDragOon({ id: 'd-spray', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS });
  room.addMachine(m);
  assignDragOonCrewInstant(room, m, driver, { role: 'operator', now: 1 });

  // Without Lightning 2: normal prep delay, rare aerosol event flagged
  applyRoomCommand(room, driver, { type: 'attack', down: true }, 2.0);
  const evNormal = room.events.find(e => e.type === 'dragOonSprayStarted');
  assert.ok(evNormal);
  assert.equal(evNormal.aerosolGag, true);
  assert.ok(evNormal.delay > 0.1);
  assert.equal(m.sprayActiveAt, 2.0 + evNormal.delay);
  applyRoomCommand(room, driver, { type: 'attack', down: false }, 2.05);

  // Two distinct Lightning passengers activate Tier 2 -> prep delay becomes 0!
  const l1 = addActor(room, 'l1', { team: TEAMS.ATTACKERS, spell: 'line_of_conduct' }, 1);
  const l2 = addActor(room, 'l2', { team: TEAMS.ATTACKERS, spell: 'line_of_conduct' }, 1);
  assignDragOonCrewInstant(room, m, l1, { role: 'passenger', station: 0, now: 2.1 });
  assignDragOonCrewInstant(room, m, l2, { role: 'passenger', station: 1, now: 2.1 });
  assert.equal(m.infusions.tiers.lightning, 2);

  room.events.length = 0;
  applyRoomCommand(room, driver, { type: 'attack', down: true }, 2.2);
  const evInstant = room.events.find(e => e.type === 'dragOonSprayStarted');
  assert.equal(evInstant.delay, 0);
  assert.equal(m.sprayActiveAt, 2.2);

  // Spray actually damages enemy ahead once stepped
  advance(room, 0.5, 1 / 60, 2.2);
  assert.ok(enemy.health < 100, 'Desolation Spray damages enemy in front cone');
});

test('Fires the Limit: underside launch is explicitly self-exempt, arcs, and lands with Slam', () => {
  const room = makeRoom(GAME_MODES.FFA);
  const driver = addActor(room, 'd', { x: 0, z: 0, team: TEAMS.ATTACKERS }, 1);
  const enemyNear = addActor(room, 'e1', { x: 2.0, z: 0, team: TEAMS.DEFENDERS }, 1);
  const m = createDragOon({ id: 'd-leap', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS });
  room.addMachine(m);
  assignDragOonCrewInstant(room, m, driver, { role: 'operator', now: 1 });

  const hpStart = m.health;
  const res = applyRoomCommand(room, driver, { type: 'dragOonLeap' }, 2.0);
  assert.deepEqual(res, {});
  assert.ok(m.leap && m.leap.phase === 'prep');

  // Step through prep -> launch -> peak airborne -> landing
  let t = advance(room, DRAG_OON_TUNING.leap.prepSec + 0.1, 1 / 60, 2.0);
  assert.equal(m.grounded, false);
  assert.ok(m.y > 0.2, 'Drag-oon should lift off the ground');
  assert.equal(m.health, hpStart, 'Self-launch blast must not damage owning Drag-oon');
  assert.equal(driver.health, 100, 'Self-launch blast must not harm own crew');
  assert.ok(enemyNear.health < 100, 'Underside ignition damages nearby enemies');

  t = advance(room, 2.0, 1 / 60, t);
  assert.equal(m.grounded, true, 'Drag-oon should land cleanly on terrain');
  assert.ok(room.events.some(e => e.type === 'dragOonLeapPhase' && e.phase === 'landing'), 'Landing impact event emitted');
});

test('Steam the Team: hot vs cold scaling, partial cooling, and terrain-occluded extinguishing', () => {
  const room = makeRoom(GAME_MODES.FFA, makeFlatWorld([
    { id: 'wall', minX: -2, maxX: 2, minY: 0, maxY: 6, minZ: -6, maxZ: -4, center: [0, 3, -5], size: [4, 6, 2] },
  ]));
  const dHot = addActor(room, 'dHot', { x: 0, z: 0, team: TEAMS.ATTACKERS }, 1);
  const eOpen = addActor(room, 'eOpen', { x: 5, z: 0, team: TEAMS.DEFENDERS }, 1);
  const eBehindWall = addActor(room, 'eWall', { x: 0, z: -8, team: TEAMS.DEFENDERS }, 1);
  eOpen.burn = { attackerId: 'x', perLick: 2, licksLeft: 3, interval: 0.5, nextAt: 10, until: 10 };
  eBehindWall.burn = { attackerId: 'x', perLick: 2, licksLeft: 3, interval: 0.5, nextAt: 10, until: 10 };

  const m = createDragOon({ id: 'd-steam', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS, heat: 95, overheatPenalty: 20 });
  room.addMachine(m);
  assignDragOonCrewInstant(room, m, dHot, { role: 'operator', now: 1 });

  room.oneHitBurnZones = [
    { id: 'bz-open', ownerId: eOpen.id, position: { x: 4, y: 0, z: 0 }, radius: 3, bornAt: 1, until: 15 },
    { id: 'bz-wall', ownerId: eBehindWall.id, position: { x: 0, y: 0, z: -8 }, radius: 3, bornAt: 1, until: 15 },
  ];

  const steamRes = applyRoomCommand(room, dHot, { type: 'dragOonSteam' }, 2.0);
  assert.deepEqual(steamRes, {});
  assert.ok(m.heat < 95, 'Steam vents heat cleanly');
  assert.ok(m.overheatPenalty < 20, 'Steam partially relieves overheat penalty');
  assert.ok(m.steamReadyAt > 2.0);

  advance(room, 1.0, 1 / 60, 2.0);
  assert.ok(eOpen.health < 100, 'Expanding hot steam hits unoccluded target');
  assert.equal(eBehindWall.health, 100, 'Solid wall blocks steam damage & extinguishing behind it');
  assert.equal(eOpen.burn, null, 'Exposed flame status extinguished by steam');
  assert.ok(eBehindWall.burn, 'Wall-shielded burn remains active');
  assert.ok(!room.oneHitBurnZones.some(z => z.id === 'bz-open'), 'Exposed fire zone extinguished');
  assert.ok(room.oneHitBurnZones.some(z => z.id === 'bz-wall'), 'Occluded fire zone spared');
});

test('Burning Brotherhood anti-duplicate eligibility + Frostfire interference + Steel/Gale barriers + Passenger aperture spells', () => {
  const room = makeRoom(GAME_MODES.FFA);
  const driver = addActor(room, 'drv', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'frostfire', preparedSpells: ['frostfire', 'fireball'] }, 1);
  const pax1 = addActor(room, 'p1', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'steel' }, 1);
  const pax2 = addActor(room, 'p2', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'gale' }, 1);
  const pax3 = addActor(room, 'p3', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'frostfire', preparedSpells: ['frostfire', 'fireball'] }, 1);
  const enemy = addActor(room, 'foe', { x: 0, z: -5, yaw: Math.PI, team: TEAMS.DEFENDERS, spell: 'fireball' }, 1);

  const m = createDragOon({ id: 'd-coop', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS });
  room.addMachine(m);
  assignDragOonCrewInstant(room, m, driver, { role: 'operator', now: 1 });
  assignDragOonCrewInstant(room, m, pax1, { role: 'passenger', station: 0, now: 1 });
  assignDragOonCrewInstant(room, m, pax2, { role: 'passenger', station: 1, now: 1 });
  assignDragOonCrewInstant(room, m, pax3, { role: 'passenger', station: 2, now: 1 });

  // Single actor cannot mint duplicate tiers via preparedSpells list (pilot does not contribute either)
  const inf = computeDragOonInfusions(room, m);
  assert.equal(inf.tiers.frost, 1);
  assert.equal(inf.tiers.fire, 0);
  assert.equal(inf.tiers.steel, 1);
  assert.equal(inf.tiers.gale, 1);

  // Passenger can cast from aperture when unsealed
  const castOk = applyRoomCommand(room, pax1, { type: 'cast', direction: { x: 0, y: 0, z: -1 } }, 2.0);
  assert.deepEqual(castOk, {});
  assert.ok(pax1.pendingSpell || pax1.steel);

  // Swap pax1 to fireball (non-ward) & test open vs sealed aperture casting
  pax1.spell = 'fireball';
  pax1.spellReadyAt = 0;
  pax1.pendingSpell = null;
  assert.equal(tryCastSpell(room, pax1.id, { x: 0, y: 0, z: -1 }, 2.2), true);
  advance(room, 0.45, 1 / 60, 2.2);
  assert.ok(room.projectiles.size >= 1, 'Passenger fireball spawned through aperture');

  // Projectile passing through Steel spray segment gets attenuated
  room.dragOonFlames.push({
    id: 'seg-bar', machineId: m.id, ownerId: driver.id, team: TEAMS.ATTACKERS,
    position: { x: 0, y: 1.5, z: -6 }, direction: { x: 0, y: 0, z: -1 }, radius: 1.5,
    steelTier: 2, barricade: true, tiers: { steel: 2, gale: 2 }, bornAt: 2.0, expiresAt: 6.0,
  });
  const atten = dragOonProjectileAttenuation(room, { x: 0, y: 1.5, z: -5 }, { x: 0, y: 1.5, z: -7 }, { ownerId: enemy.id }, 2.5);
  assert.ok(atten.speedScale < 1 && atten.damageScale < 1, 'Steel barricade attenuates enemy projectile');

  // Frostfire spray interferes with enemy recovery cooldowns (while movement continues unaffected)
  enemy.spellReadyAt = 8.0;
  enemy.guardStamina = 20;
  enemy.lastGuardDrainAt = -10;
  const sprayRes = applyRoomCommand(room, driver, { type: 'attack', down: true }, 2.6);
  assert.deepEqual(sprayRes, {});
  advance(room, 1.0, 1 / 60, 2.6);
  if (enemy.dragOonFrostInterference) {
    assert.ok(enemy.spellReadyAt > 8.0, 'Frostfire recovery interference extends active cooldown clocks');
  }
});

test('All 4 Skills: Raze inverse radius-duration, Flight Like Hell reversible HP & precision suppression, Camp Fire seal, Brimming pressure', () => {
  const room = makeRoom(GAME_MODES.PRACTICE);
  const driver = addActor(room, 'd', { x: 0, z: 0, team: TEAMS.ATTACKERS, siegeLoadout: { dragOon: 'razeThePasture' } }, 1);
  const pax = addActor(room, 'pax', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'fireball' }, 1);
  const enemy = addActor(room, 'e', { x: 0, z: -3.5, team: TEAMS.DEFENDERS }, 1);
  const m = createDragOon({ id: 'd-skills', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS });
  room.addMachine(m);
  assignDragOonCrewInstant(room, m, driver, { role: 'operator', now: 1 });
  assignDragOonCrewInstant(room, m, pax, { role: 'passenger', station: 0, now: 1 });

  // 1. Raze the Pasture: quick release (small radius -> long duration) vs long hold (large radius -> shorter duration)
  applyRoomCommand(room, driver, { type: 'siegeSkill', down: true }, 2.0);
  let t = advance(room, 0.1, 1 / 60, 2.0);
  applyRoomCommand(room, driver, { type: 'siegeSkill', down: false }, t);
  t = advance(room, DRAG_OON_TUNING.raze.ignitionDelaySec + 0.1, 1 / 60, t);
  assert.equal(room.dragOonRazeFields.length, 1);
  const smallField = room.dragOonRazeFields[0];
  const smallDuration = smallField.expiresAt - smallField.bornAt;
  assert.ok(smallDuration > 10, 'Small Raze concentrates into long-burning fire field');

  // 2. Flight Like Hell: blocked when grounded, engages airborne, deals reversible maxHealth loss & scoped suppression
  assert.ok(applyRoomCommand(room, driver, { type: 'practiceDragOon', action: 'setOverheatPenalty', penalty: 35 }, t));
  assert.equal(m.overheatPenalty, 35);
  assert.ok(applyRoomCommand(room, driver, { type: 'practiceDragOon', action: 'setSkill', skill: 'flightLikeHell' }, t));
  const blockedGround = applyRoomCommand(room, driver, { type: 'siegeSkill', down: true }, t);
  assert.ok(blockedGround.rejected, 'Flight Like Hell must reject grounded activation');

  // Large hostile One-Hit field centered at (0, 0, -3) radius 10m; enemy at (0,0,-3.5) and outer enemy at (0,0,-10)
  const outerEnemy = addActor(room, 'eOut', { x: 0, z: -10.5, team: TEAMS.DEFENDERS }, 1);
  room.oneHitFields.push({
    id: 'big-oh', ownerId: enemy.id, position: { x: 0, y: 0, z: -3 }, radius: 11, yaw: null,
    bornAt: 1, until: 40, tiers: { fire: 2, gale: 0, frost: 0, lightning: 0, steel: 0 }, conducted: {}, shakenContact: {},
  });

  applyRoomCommand(room, driver, { type: 'practiceDragOon', action: 'setFlightStage', stage: 'airborne' }, t);
  const engaged = applyRoomCommand(room, driver, { type: 'siegeSkill', down: true }, t);
  assert.deepEqual(engaged, {});
  t = advance(room, 1.0, 1 / 60, t);
  assert.ok(enemy.maxHealth < 100 && enemy.dragOonMaxHealthLoss > 0, 'Flight Like Hell applies reversible maxHealth reduction');
  assert.ok(isPointSuppressedByDragOon(room, enemy.position, t), 'Scorched zone suppresses overlapping area');
  assert.equal(isPointSuppressedByDragOon(room, outerEnemy.position, t), false, 'Small scorch zone must NOT erase distant outer edges of huge field');

  // Respawn restores victim maxHealth cleanly
  enemy.alive = false;
  enemy.respawnAt = t + 0.1;
  t = advance(room, 0.25, 1 / 60, t);
  assert.equal(enemy.maxHealth, 100);
  assert.equal(enemy.dragOonMaxHealthLoss, 0);

  // Land safely restores cannons
  applyRoomCommand(room, driver, { type: 'practiceDragOon', action: 'setFlightStage', stage: 'grounded' }, t);
  advance(room, 0.1, 1 / 60, t);
  assert.ok(Math.abs(m.cannonPitch) < 0.5, 'Landing recovers cannons safely');

  // 3. Camp Fire seals hatches (blocks ordinary passenger aperture spells, slows disembark, vents heat, allows repair Steel)
  applyRoomCommand(room, driver, { type: 'practiceDragOon', action: 'setSkill', skill: 'campFire' }, t);
  applyRoomCommand(room, driver, { type: 'practiceDragOon', action: 'setHeat', heat: 85 }, t);
  const campOn = applyRoomCommand(room, driver, { type: 'siegeSkill', down: true }, t);
  assert.deepEqual(campOn, {});
  assert.equal(m.campFire.sealed, true);
  assert.equal(tryCastSpell(room, pax.id, { x: 0, y: 0, z: -1 }, t + 0.1), false, 'Camp Fire seal blocks external aperture spells');
  pax.spell = 'steel';
  assert.equal(tryCastSpell(room, pax.id, { x: 0, y: 0, z: -1 }, t + 0.1), true, 'Sealed crew can still cast Sheathe in Steel repair');

  // 4. Brimming with Potential activates and boosts risk/output
  applyRoomCommand(room, driver, { type: 'siegeSkill', down: true }, t + 0.2); // toggle camp off
  applyRoomCommand(room, driver, { type: 'practiceDragOon', action: 'setSkill', skill: 'brimmingWithPotential' }, t + 0.2);
  applyRoomCommand(room, driver, { type: 'practiceDragOon', action: 'setHeat', heat: 125 }, t + 0.2);
  const brimOn = applyRoomCommand(room, driver, { type: 'siegeSkill', down: true }, t + 0.3);
  assert.deepEqual(brimOn, {});
  t = advance(room, 0.2, 1 / 60, t + 0.3);
  assert.equal(m.brimming.active, true);
  assert.ok(m.brimmingBonusMult > 1);
});

test('All Abort!: incomplete disembarkers take trauma, one atomic destruction, survivor ejection + Experimental Siege Blades opt-in isolation', () => {
  // Part A: All Abort! destruction & incomplete disembark
  const room = makeRoom(GAME_MODES.FFA);
  const driver = addActor(room, 'd', { x: 0, z: 0, team: TEAMS.ATTACKERS }, 1);
  const paxEvac = addActor(room, 'paxEvac', { x: 0, z: 0, team: TEAMS.ATTACKERS }, 1);
  const m = createDragOon({ id: 'd-abort', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS, health: 20 });
  room.addMachine(m);
  assignDragOonCrewInstant(room, m, driver, { role: 'operator', now: 1 });
  assignDragOonCrewInstant(room, m, paxEvac, { role: 'passenger', station: 0, now: 1 });

  // Begin disembarkation right before explosion -> incomplete transition CANNOT grant immunity!
  const evacRes = applyRoomCommand(room, paxEvac, { type: 'siegeOperate' }, 2.0);
  assert.ok(!evacRes.rejected);
  assert.ok(paxEvac.dragOonTransition);

  room.events.length = 0;
  triggerAllAbortDestruction(room, m, 2.2, { source: 'overheat' });
  // Calling twice is idempotent (exactly one explosion)
  triggerAllAbortDestruction(room, m, 2.21, { source: 'overheat' });
  const abortEvents = room.events.filter(e => e.type === 'dragOonDestroyed');
  assert.equal(abortEvents.length, 1, 'All Abort! triggers at most one atomic event');
  assert.ok(paxEvac.health < 100 || !paxEvac.alive, 'Incomplete disembarker still suffers All Abort! internal trauma');
  assert.equal(driver.operatingDragOonId, null);
  assert.equal(paxEvac.aboardDragOonId, null);

  // Part B: Standard public Siege Blades rejects drag-oon; Experimental Siege Blades allows it cleanly
  const stdRoom = makeRoom(GAME_MODES.SIEGE_BLADES, makeFlatWorld(), { isPrivate: false });
  stdRoom.siegeBlades = createSiegeBladesState(stdRoom, { experimentalDragOon: true }); // public room ignores experimentalDragOon
  assert.equal(stdRoom.siegeBlades.experimentalDragOon, false);
  const hpStd = addActor(stdRoom, 'h1', { team: TEAMS.ATTACKERS }, 1);
  beginSiegeBladesSelection(stdRoom, 2.0);
  assert.equal(selectSiegeBladesMachine(stdRoom, hpStd, DRAG_OON_ID, 2.5), false);

  const expRoom = makeRoom(GAME_MODES.SIEGE_BLADES, makeFlatWorld(), { isPrivate: true });
  expRoom.siegeBlades = createSiegeBladesState(expRoom, { experimentalDragOon: true, teamSize: 1 });
  assert.equal(expRoom.siegeBlades.experimentalDragOon, true);
  const hpExp = addActor(expRoom, 'h2', { team: TEAMS.ATTACKERS }, 1);
  beginSiegeBladesSelection(expRoom, 2.0);
  assert.equal(selectSiegeBladesMachine(expRoom, hpExp, DRAG_OON_ID, 2.5), true);
  provisionSiegeBladesFleet(expRoom, 8.1);
  assert.equal(hpExp.operatingDragOonId !== null, true);

  // Snapshot serialization cleanly includes dragOon state
  const snap = serializeSnapshot(expRoom, 8.2, hpExp.id);
  assert.equal(snap.siegeBlades.experimentalDragOon, true);
  assert.ok(snap.machines.some(x => x.kind === 'dragoon'));
});

test('9. Simultaneous DRAG-OON fleet instances remain isolated and Siege Blades bot AI operates DRAG-OON safely', () => {
  // Part A: Multiple DRAG-OON instances in room.machines isolate fuel, heat, overheatPenalty, infusions, and cooldowns
  const room = makeRoom(GAME_MODES.PRACTICE, makeFlatWorld());
  const opA = addActor(room, 'opA', { x: -25, z: 0, team: TEAMS.ATTACKERS }, 1);
  const opB = addActor(room, 'opB', { x: 25, z: 0, team: TEAMS.DEFENDERS }, 1);
  const mA = createDragOon({ id: 'drag-a', x: -25, z: 0, team: TEAMS.ATTACKERS, skill: 'brimmingWithPotential' });
  const mB = createDragOon({ id: 'drag-b', x: 25, z: 0, team: TEAMS.DEFENDERS, skill: 'campFire' });
  room.addMachine(mA);
  room.addMachine(mB);
  assignDragOonCrewInstant(room, mA, opA, { role: 'operator', now: 1 });
  assignDragOonCrewInstant(room, mB, opB, { role: 'operator', now: 1 });
  mA.practiceOverrides = { infusions: { fire: 2 } };
  mB.practiceOverrides = { infusions: { frost: 1 } };
  computeDragOonInfusions(room, mA);
  computeDragOonInfusions(room, mB);

  // Trigger Spray, Leap, and Steam on mA only
  applyRoomCommand(room, opA, { type: 'attack', down: true }, 2);
  applyRoomCommand(room, opA, { type: 'dragOonLeap' }, 2.1);
  advance(room, 1.0, 1 / 60, 2.2);

  assert.ok(mA.fuel < 95, 'mA spends fuel during active spray & leap');
  assert.ok(mA.heat > 5, 'mA builds furnace heat');
  assert.ok(mA.leapReadyAt > 3.2, 'mA starts leap cooldown');
  assert.equal(Math.round(mB.fuel), 100, 'mB fuel remains untouched at full');
  assert.equal(mB.heat, 0, 'mB heat remains 0');
  assert.ok(mB.leapReadyAt <= 1, 'mB leap cooldown remains ready');
  assert.equal(mB.infusions.tiers.frost, 1);
  assert.equal(mB.infusions.tiers.fire ?? 0, 0);

  // Part B: Experimental Siege Blades bot selection + AI controller stepDragOonBot
  const botRoom = makeRoom(GAME_MODES.SIEGE_BLADES, makeFlatWorld(), { isPrivate: true, teamSize: 1 });
  botRoom.siegeBlades = createSiegeBladesState(botRoom, { experimentalDragOon: true, teamSize: 1 });
  const botA = botRoom.addServerActor({ id: 'bot-a', name: 'BotAlpha', actorKind: 'bot', team: TEAMS.ATTACKERS, spell: 'fireball' }, 1);
  const foeB = botRoom.addServerActor({ id: 'bot-b', name: 'BotBravo', actorKind: 'bot', team: TEAMS.DEFENDERS, spell: 'frostfire' }, 1);
  botA.position = { x: -12, y: 0, z: 0 };
  foeB.position = { x: 0, y: 0, z: 0 };
  botA.spawnProtectionUntil = foeB.spawnProtectionUntil = -Infinity;

  beginSiegeBladesSelection(botRoom, 1.0);
  botA.preferredSiegeMachine = DRAG_OON_ID;
  foeB.preferredSiegeMachine = 'so-fist-ication';

  const dt = 1 / 60;
  let t = 1.0;
  for (let i = 0; i < 600; i++) {
    stepRoom(botRoom, dt, t);
    t += dt;
  }
  const botMachine = botRoom.machines.get(botA.operatingDragOonId);
  assert.ok(botMachine && botMachine.kind === 'dragoon', 'Bot operates assigned experimental DRAG-OON');
  assert.ok(
    Math.hypot(botMachine.x - (-12), botMachine.z) > 0.1 || botMachine.sprayHeld || botMachine.heat > 0,
    'Experimental DRAG-OON bot actively drives or engages in combat without errors',
  );
});

test('10. V4.1 geometry, 4-station limits, outward aperture aiming, staggered evac, Flight immunity & Rite of Ascension', () => {
  // Part A: V4.1 max 4 passenger stations, outward aperture cone clamp, wall block, staggered evac
  const room = makeRoom(GAME_MODES.PRACTICE, makeFlatWorld([
    { center: [-2.75, 1.7, 0.2], size: [0.6, 3.0, 2.0] }, // Wall flush against L1 shutter port!
  ]));
  const op = addActor(room, 'op', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'steel' }, 1);
  op.ultimate = 'chivalry'; op.prowess = 100;
  const p1 = addActor(room, 'p1', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'gale' }, 1);
  const p2 = addActor(room, 'p2', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'gale' }, 1);
  const p3 = addActor(room, 'p3', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'fireball' }, 1);
  const p4 = addActor(room, 'p4', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'frostfire' }, 1);
  const p5 = addActor(room, 'p5', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'fireball' }, 1);
  const m = createDragOon({ id: 'd-v41', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS, passengerCapacity: 6 });
  assert.equal(m.passengerCapacity, 4, 'V4.1 physically enforces 4 passenger stations max');
  room.addMachine(m);

  assert.equal(assignDragOonCrewInstant(room, m, op, { role: 'operator', now: 1 }), true);
  assert.equal(assignDragOonCrewInstant(room, m, p1, { role: 'passenger', station: 0, now: 1 }), true);
  assert.equal(assignDragOonCrewInstant(room, m, p2, { role: 'passenger', station: 1, now: 1 }), true);
  assert.equal(assignDragOonCrewInstant(room, m, p3, { role: 'passenger', station: 2, now: 1 }), true);
  assert.equal(assignDragOonCrewInstant(room, m, p4, { role: 'passenger', station: 3, now: 1 }), true);
  assert.equal(assignDragOonCrewInstant(room, m, p5, { role: 'passenger', now: 1 }), false, '5th passenger rejected cleanly');

  // L1 aperture blocked by external solid wall immediately outside port; R1 casts outward with aim cone clamping
  assert.equal(tryCastSpell(room, p1.id, { x: -1, y: 0, z: 0 }, 2.0), false, 'Blocked L1 port rejects external cast');
  assert.equal(tryCastSpell(room, p2.id, { x: -1, y: 0, z: 0 }, 2.0), true, 'R1 port clears and clamps inward aim to outward cone');
  assert.ok(p2.pendingSpell.direction.x > 0.7, 'R1 clamped aim strictly points outward (+X) through R1 aperture');

  // Simultaneous disembarkation spreads crew cleanly across staggered rally points (never stacking)
  p1.pendingSpell = null; p2.pendingSpell = null;
  applyRoomCommand(room, p1, { type: 'siegeOperate' }, 2.2);
  applyRoomCommand(room, p2, { type: 'siegeOperate' }, 2.2);
  let t = advance(room, DRAG_OON_TUNING.crew.disembarkDurationSec + 0.15, 1 / 60, 2.2);
  assert.equal(p1.aboardDragOonId, null);
  assert.equal(p2.aboardDragOonId, null);
  assert.ok(Math.hypot(p1.position.x - p2.position.x, p1.position.z - p2.position.z) >= 1.2, 'Simultaneous evacuees land staggered without stacking');

  // Part B: Flight Like Hell maxHealth damage honors spawnProtection immunity (zero reduction!)
  const enemy = addActor(room, 'eImm', { x: 0, z: -2.0, team: TEAMS.DEFENDERS }, t);
  enemy.spawnProtectionUntil = t + 10;
  applyRoomCommand(room, op, { type: 'practiceDragOon', action: 'setSkill', skill: 'flightLikeHell' }, t);
  applyRoomCommand(room, op, { type: 'practiceDragOon', action: 'setFlightStage', stage: 'airborne' }, t);
  applyRoomCommand(room, op, { type: 'siegeSkill', down: true }, t);
  t = advance(room, 0.75, 1 / 60, t);
  assert.equal(enemy.health, 100, 'Spawn-protected target takes zero HP damage');
  assert.equal(enemy.maxHealth ?? 100, 100, 'Spawn-protected target suffers zero Flight Like Hell maxHealth reduction');
  assert.equal(enemy.dragOonMaxHealthLoss ?? 0, 0);

  // Part C: Rite of Ascension opt-in consent, empty seats allowed, prowess spend, non-teleported ascent & single detonation
  const rRoom = makeRoom(GAME_MODES.FFA);
  const rOp = addActor(rRoom, 'rOp', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'fireball' }, 1);
  rOp.ultimate = 'chivalry'; rOp.prowess = 100;
  const rP1 = addActor(rRoom, 'rP1', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'gale' }, 1);
  rP1.ultimate = 'chivalry'; rP1.prowess = 100;
  const rP2 = addActor(rRoom, 'rP2', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'gale' }, 1);
  rP2.ultimate = 'chivalry'; rP2.prowess = 50; // Not ready yet!
  const foe = addActor(rRoom, 'foe', { x: 0, z: -6, team: TEAMS.DEFENDERS }, 1);
  const rm = createDragOon({ id: 'd-rite', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS, skill: { id: 'flightLikeHell', phase: 'idle', readyAt: 0 } });
  rRoom.addMachine(rm);
  assignDragOonCrewInstant(rRoom, rm, rOp, { role: 'operator', now: 1 });
  assignDragOonCrewInstant(rRoom, rm, rP1, { role: 'passenger', station: 0, now: 1 });
  assignDragOonCrewInstant(rRoom, rm, rP2, { role: 'passenger', station: 1, now: 1 });

  // Cannot commit with < 100 prowess, cannot silently activate
  assert.ok(applyRoomCommand(rRoom, rP2, { type: 'dragOonRiteCommit', committed: true }, 2).rejected);
  assert.deepEqual(applyRoomCommand(rRoom, rOp, { type: 'dragOonRiteCommit', committed: true }, 2), {});
  assert.deepEqual(applyRoomCommand(rRoom, rP1, { type: 'dragOonRiteCommit', committed: true }, 2), {});
  assert.ok(applyRoomCommand(rRoom, rOp, { type: 'dragOonRiteActivate' }, 2.1).rejected, 'Blocked until all occupied crew ready & opted in');
  assert.equal(rOp.prowess, 100, 'Rejected activation spends zero Prowess');

  // Grant rP2 Chivalry readiness & opt in -> empty seats L2/R2 NOT required -> Ascend!
  rP2.prowess = 100;
  assert.deepEqual(applyRoomCommand(rRoom, rP2, { type: 'dragOonRiteCommit', committed: true }, 2.2), {});
  // Withdraw & re-commit preserves Prowess cleanly
  assert.deepEqual(applyRoomCommand(rRoom, rP2, { type: 'dragOonRiteCommit', committed: false }, 2.3), {});
  assert.equal(rm.riteStatus.eligible, false);
  assert.deepEqual(applyRoomCommand(rRoom, rP2, { type: 'dragOonRiteCommit', committed: true }, 2.4), {});
  assert.equal(rm.riteStatus.eligible, true);

  assert.deepEqual(applyRoomCommand(rRoom, rOp, { type: 'dragOonRiteActivate' }, 2.5), {});
  assert.equal(rm.rite.active, true);
  assert.equal(rOp.prowess, 0);
  assert.equal(rP1.prowess, 0);
  assert.equal(rP2.prowess, 0);
  assert.ok(applyRoomCommand(rRoom, rP1, { type: 'siegeOperate' }, 2.6).rejected, 'Evacuation locked during Rite');

  // Steer upward/forward through sky and deliberately detonate midair -> single atomic All Abort! event
  rOp.input = { forward: 1, right: 0, yaw: 0, pitch: 0.25 };
  let rt = advance(rRoom, 0.55, 1 / 60, 2.5);
  assert.ok(rm.y > 2.5 && rm.z < -1.0, 'Rite ascends through world trajectory continuously');
  rRoom.events.length = 0;
  assert.deepEqual(applyRoomCommand(rRoom, rOp, { type: 'dragOonRiteDetonate' }, rt), {});
  const riteBlasts = rRoom.events.filter(e => e.type === 'dragOonDestroyed');
  assert.equal(riteBlasts.length, 1, 'Rite resolves through a single atomic All Abort! blast');
  assert.equal(riteBlasts[0].isRiteOfAscension, true);
  assert.ok(foe.health < 100 || !foe.alive, 'Catastrophic Rite explosion strikes nearby enemy');
  assert.equal(rOp.alive, false, 'Rite operator dies on terminal detonation');
  assert.equal(rP1.alive, false, 'Rite passenger 1 dies on terminal detonation');
  assert.equal(rP2.alive, false, 'Rite passenger 2 dies on terminal detonation');
});

test('11. Team-room All Abort! internal hazard & Rite of Ascension damaging rocket exhaust + mandatory crew deaths', () => {
  // Part A: Team-based room ordinary All Abort! damages remaining occupants (never skips via areAllies, never awards pilot teamkill)
  const abortRoom = makeRoom(GAME_MODES.SIEGE_BLADES, makeFlatWorld(), { isPrivate: true });
  abortRoom.policy = { teamMode: true, respawnSec: 5 };
  const tOp = addActor(abortRoom, 'tOp', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'fireball' }, 1);
  const tPax = addActor(abortRoom, 'tPax', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'steel' }, 1);
  const tMat = createDragOon({ id: 'd-team-abort', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS, heat: 50, health: 25 });
  abortRoom.addMachine(tMat);
  assignDragOonCrewInstant(abortRoom, tMat, tOp, { role: 'operator', now: 1 });
  assignDragOonCrewInstant(abortRoom, tMat, tPax, { role: 'passenger', station: 0, now: 1 });
  triggerAllAbortDestruction(abortRoom, tMat, 2.0, { attackerId: tOp.id, source: 'overheat' });
  assert.ok(tOp.health < 100, 'Ordinary team All Abort! damages remaining operator');
  assert.ok(tPax.health < 100, 'Ordinary team All Abort! damages remaining allied passenger');
  assert.equal(tOp.alive, true, 'Moderate heat leaves ordinary All Abort! survivors alive to eject');
  assert.equal(tOp.kills ?? 0, 0, 'Pilot receives zero teamkill credit');

  // Part B: Team-based Siege Blades room Rite of Ascension with spawnProtection, Steel ward, Full Steel 1-HP floor, and Valkyrie AoD immunity tests
  const room = makeRoom(GAME_MODES.SIEGE_BLADES, makeFlatWorld(), { isPrivate: true, teamSize: 3 });
  room.policy = { teamMode: true, respawnSec: 5 };
  const op = addActor(room, 'op', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'fireball' }, 1);
  op.ultimate = 'chivalry'; op.prowess = 100;
  const pax1 = addActor(room, 'pax1', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'gale' }, 1);
  pax1.ultimate = 'chivalry'; pax1.prowess = 100;
  const pax2 = addActor(room, 'pax2', { x: 0, z: 0, team: TEAMS.ATTACKERS, spell: 'gale' }, 1);
  pax2.ultimate = 'chivalry'; pax2.prowess = 100;

  // Apply every ordinary survival defense on crew to prove terminal Rite cannot be cheesed!
  pax1.spawnProtectionUntil = 99;
  pax2.steel = { calledAt: 1, fullUntil: 99, fadeUntil: 105, damagedAt: -Infinity };
  op.ultimateState = { id: 'one_hit_of_wonders', phase: 'active', until: 99, preparedTiers: { steel: 2 } };
  room.flightBurnZones.push({ id: 'valk-denial', team: TEAMS.ATTACKERS, ownerId: op.id, x: 0, y: 0, z: 0, radius: 30, bornAt: 0, expiresAt: 99 });

  const underEnemy = addActor(room, 'underEnemy', { x: 0, z: -2.2, team: TEAMS.DEFENDERS }, 1);
  underEnemy.guarding = true; underEnemy.guardStamina = 40;
  const defHelper = addActor(room, 'defHelper', { x: 40, z: -30, team: TEAMS.DEFENDERS }, 1);
  const farEnemy = addActor(room, 'farEnemy', { x: 0, z: -28, team: TEAMS.DEFENDERS }, 1);

  // Give DEFENDERS active siege machines so Siege Blades elimination rules keep combatants live while standing beneath m
  const defMachine = createDragOon({ id: 'd-def-anchor', x: 40, y: 0, z: -30, heading: 0, team: TEAMS.DEFENDERS });
  const underAnchor = createDragOon({ id: 'd-under-anchor', x: 25, y: 0, z: -22, heading: 0, team: TEAMS.DEFENDERS });
  const farAnchor = createDragOon({ id: 'd-far-anchor', x: 35, y: 0, z: -28, heading: 0, team: TEAMS.DEFENDERS });
  room.addMachine(defMachine);
  room.addMachine(underAnchor);
  room.addMachine(farAnchor);
  assignDragOonCrewInstant(room, defMachine, defHelper, { role: 'operator', now: 1 });
  room.siegeBlades?.spawnAssignments?.set(defHelper.id, { machineId: defMachine.id, kind: 'dragoon' });
  room.siegeBlades?.spawnAssignments?.set(underEnemy.id, { machineId: underAnchor.id, kind: 'dragoon' });
  room.siegeBlades?.spawnAssignments?.set(farEnemy.id, { machineId: farAnchor.id, kind: 'dragoon' });

  const m = createDragOon({
    id: 'd-team-rite', x: 0, y: 0, z: 0, heading: 0, team: TEAMS.ATTACKERS,
    skill: { id: 'flightLikeHell', phase: 'idle', readyAt: 0 },
  });
  room.addMachine(m);
  assignDragOonCrewInstant(room, m, op, { role: 'operator', now: 1 });
  assignDragOonCrewInstant(room, m, pax1, { role: 'passenger', station: 0, now: 1 });
  assignDragOonCrewInstant(room, m, pax2, { role: 'passenger', station: 1, now: 1 });

  assert.deepEqual(applyRoomCommand(room, op, { type: 'dragOonRiteCommit', committed: true }, 2), {});
  assert.deepEqual(applyRoomCommand(room, pax1, { type: 'dragOonRiteCommit', committed: true }, 2), {});
  assert.deepEqual(applyRoomCommand(room, pax2, { type: 'dragOonRiteCommit', committed: true }, 2), {});
  assert.deepEqual(applyRoomCommand(room, op, { type: 'dragOonRiteActivate' }, 2.1), {});

  // Ascend with steering input and verify sustained downward exhaust damages enemy beneath + speeds past ordinary cruise!
  op.input = { forward: 1, right: 0.45, yaw: -0.35, pitch: 0.20 };
  let t = advance(room, 0.85, 1 / 60, 2.1);
  assert.ok(underEnemy.health < 100 && underEnemy.alive, 'Damaging Rite rocket exhaust burns enemies beneath departing machine');
  assert.ok(underEnemy.dragOonMaxHealthLoss > 0, 'Rite exhaust inflicts reversible maxHealth loss');
  assert.ok(room.events.some(e => e.type === 'damage' && e.victimId === 'underEnemy' && e.source === 'dragoon-rite-exhaust'));
  assert.ok(isPointSuppressedByDragOon(room, { x: 0, y: 0, z: -1.5 }, t), 'Rite exhaust scorches suppression zone beneath');
  const speedMag = Math.hypot(m.velocity.x, m.velocity.y, m.velocity.z);
  assert.ok(speedMag > 16.5, `Rite rocket velocity (${speedMag.toFixed(1)} m/s) accelerates significantly beyond ordinary mobility`);

  // Steer and trigger manual detonation in team room -> EVERY committed member must perish cleanly with ZERO pilot teamkills!
  room.events.length = 0;
  assert.deepEqual(applyRoomCommand(room, op, { type: 'dragOonRiteDetonate' }, t), {});
  const detEvents = room.events.filter(e => e.type === 'dragOonDestroyed');
  assert.equal(detEvents.length, 1);
  assert.equal(detEvents[0].survivorsEjected, 0);
  assert.equal(op.alive, false, 'Operator perishes on Rite detonation in team room');
  assert.equal(pax1.alive, false, 'Spawn-protected passenger still perishes on committed Rite detonation');
  assert.equal(pax2.alive, false, 'Steeled/Valkyrie-sheltered passenger still perishes on committed Rite detonation');
  assert.equal(op.kills ?? 0, 0, 'Pilot is NOT awarded ally kill credits for Rite crew deaths');
  assert.equal(op.deaths, 1);
  assert.equal(pax1.deaths, 1);
  assert.equal(pax2.deaths, 1);
  assert.equal(farEnemy.alive, true, 'Out-of-range enemy outside explosion stays alive');
});
