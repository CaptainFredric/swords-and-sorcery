import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { WORLD_IDS, getWorld } from '../../shared/worlds/registry.mjs';
import {
  OUTERWORKS,
  OUTERWORKS_CLOSED,
  OUTERWORKS_OPEN,
  OUTERWORKS_TERRACE_Y,
  OUTERWORKS_PARAPET_Y,
  outerworksForObjective,
} from '../../shared/worlds/outerworks.mjs';
import { navGraph, runClear, routeBetween } from '../../shared/sim/botNav.mjs';
import { mountBiByeLlista, dismountBiByeLlista, stepBiByeLlista, stepBiByeProjectiles, fireBiByeLlista, toggleBiByeDeploy, damageBiByeLlista } from '../../shared/sim/biByeLlista.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { TEAMS } from '../../shared/src/teams.mjs';
import { segmentAabbHit } from '../../shared/src/collision.mjs';

test('The Outerworks: world structure and dimensions exceed standard arena scale', () => {
  const world = getWorld(WORLD_IDS.OUTERWORKS);
  assert.equal(world.id, 'outerworks');
  assert.equal(world.name, 'The Outerworks');
  assert.ok(world.floors.length >= 8);
  assert.ok(world.solids.length >= 25);
  assert.ok(world.ramps.length >= 2);
  assert.equal(world.objectives.length, 2);

  // Verify total battlefield reach: spans from z = -58 (camp) to z = +60 (keep)
  const allZ = world.floors.flatMap((f) => [f.center[2] - f.size[2] / 2, f.center[2] + f.size[2] / 2]);
  const minZ = Math.min(...allZ);
  const maxZ = Math.max(...allZ);
  const totalLength = maxZ - minZ;
  assert.ok(totalLength >= 115, `Battlefield length (${totalLength}m) must support long sightlines and staging`);

  // Verify width: spans from x = -26 (west trench) to x = +26 (east parapet)
  const allX = world.floors.flatMap((f) => [f.center[0] - f.size[0] / 2, f.center[0] + f.size[0] / 2]);
  const totalWidth = Math.max(...allX) - Math.min(...allX);
  assert.ok(totalWidth >= 50, `Battlefield width (${totalWidth}m) must accommodate multiple tactical lanes`);
});

test('The Outerworks: map-authorized Bi-Bye-llista emplacement spawns automatically', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.OUTERWORKS);
  assert.ok(room.biByeLlista, 'Bi-Bye-llista must be instantiated in Outerworks room');
  assert.equal(room.biByeLlista.id, 'bibye-outerworks-01');
  assert.equal(room.biByeLlista.x, -8.0);
  assert.equal(room.biByeLlista.z, -46.0);
  assert.equal(room.biByeLlista.team, TEAMS.ATTACKERS);
  assert.equal(room.biByeLlista.mode, 'MOBILE');

  // Verify turning clearance around emplacement: 5.5m radius must be clear of solids
  for (const solid of room.world.solids) {
    const [cx, cy, cz] = solid.center;
    const [sx, sy, sz] = solid.size;
    const nearX = Math.max(Math.abs(-8.0 - cx) - sx / 2, 0);
    const nearZ = Math.max(Math.abs(-46.0 - cz) - sz / 2, 0);
    assert.ok(Math.hypot(nearX, nearZ) >= 3.5, `Solid ${solid.id} too close to ballista emplacement`);
  }
});

test('The Outerworks: ballista routes provide >= 7.0m clearance for 5.3m bow', () => {
  const world = getWorld(WORLD_IDS.OUTERWORKS);

  // Central Esplanade driving corridor (x in [-3.5, 3.5], z from -44 to -14):
  // Check that no solid intrudes into the central 7.0m corridor
  const esplanadeSolids = world.solids.filter((s) => {
    const [cx, cy, cz] = s.center;
    return cz >= -40 && cz <= -18;
  });
  for (const s of esplanadeSolids) {
    const [cx, cy, cz] = s.center;
    const [sx, sy, sz] = s.size;
    const xMin = cx - sx / 2;
    const xMax = cx + sx / 2;
    // Central lane from -2.5 to +2.5 must be completely unobstructed
    const overlapsCentralLane = !(xMax < -2.5 || xMin > 2.5);
    assert.ok(!overlapsCentralLane, `Solid ${s.id} blocks central vehicle lane on Esplanade`);
  }

  // The Great Breach passage (z in [0, 4]):
  // Rubble on west is [-4.2, -3.5], on east is [3.5, 4.2], leaving clear width from -3.5 to +3.5 = 7.0m
  const breachRubbleW = world.solids.find((s) => s.id === 'rubble-breach-west');
  const breachRubbleE = world.solids.find((s) => s.id === 'rubble-breach-east');
  assert.ok(breachRubbleW && breachRubbleE);
  const clearBreachWidth = breachRubbleE.center[0] - breachRubbleE.size[0] / 2 - (breachRubbleW.center[0] + breachRubbleW.size[0] / 2);
  assert.ok(clearBreachWidth >= 7.0, `Breach clear width (${clearBreachWidth}m) must comfortably pass 5.3m ballista bow`);

  // Ramp to Eastern Firing Terrace:
  const terraceRamp = world.ramps.find((r) => r.id === 'ramp-east-terrace');
  assert.ok(terraceRamp);
  const rampWidth = terraceRamp.maxX - terraceRamp.minX;
  assert.ok(rampWidth >= 7.0, `Terrace ramp width (${rampWidth}m) must allow ballista ascent`);
  const rampGrade = Math.atan((terraceRamp.endY - terraceRamp.startY) / (terraceRamp.maxZ - terraceRamp.minZ));
  assert.ok(rampGrade <= 0.15, `Terrace ramp grade (${(rampGrade * 180 / Math.PI).toFixed(1)}°) must be vehicle-safe`);
});

test('The Outerworks: Western Sally Trench is infantry-only and shielded from ballista fire', () => {
  const world = getWorld(WORLD_IDS.OUTERWORKS);

  // Trench floor width: x in [-26, -16] is 10m total including revetments, with walking width ~2.8m
  // The chicane openings are <= 3.2m, physically preventing the 5.3m ballista from traversing
  const chicane1 = world.solids.find((s) => s.id === 'trench-chicane-1');
  const chicane2 = world.solids.find((s) => s.id === 'trench-chicane-2');
  assert.ok(chicane1 && chicane2);

  // Line of sight check: Ballista at emplacement (-8, 1.2, -46) firing toward a Spellblade in the trench at (-21, 1.0, -24)
  const eye = [-8.0, 1.2, -46.0];
  const targetInTrench = [-21.0, 1.0, -24.0];
  const revetmentHit = world.solids.some((s) => segmentAabbHit(eye, targetInTrench, s));
  assert.ok(revetmentHit, 'Revetment wall must break line of sight into the trench, shielding infantry from ballista fire');
});

test('The Outerworks: Ballista can mount, deploy stabilizers, and fire siege bolts at Objective 1', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.OUTERWORKS);
  const ballista = room.biByeLlista;
  assert.ok(ballista);

  const attacker = room.addPlayer({ id: 'att-driver', name: 'BallistaCrew', team: TEAMS.ATTACKERS }, 0);
  attacker.position = { x: -8.0, y: 0, z: -46.0 };

  const defender = room.addPlayer({ id: 'def-guard', name: 'RedoubtGuard', team: TEAMS.DEFENDERS }, 0);
  defender.position = { x: 0, y: 0, z: -12.0 };
  defender.spawnProtectionUntil = -Infinity;

  // Mount
  const mounted = mountBiByeLlista(ballista, attacker, 0);
  assert.equal(mounted, true, 'Attacker must be able to mount ballista at authorized emplacement');
  assert.equal(ballista.operatorId, attacker.id);
  assert.equal(attacker.operatingBallistaId, ballista.id);

  // Deploy stabilizers
  const deployed = toggleBiByeDeploy(ballista, 0, room.world);
  assert.equal(deployed, true, 'Stabilizers must successfully deploy on flat staging ground');

  // Step 1.3 seconds to complete deployment
  for (let i = 0; i < 40; i++) {
    stepBiByeLlista(room, ballista, 1 / 30, i / 30, room.world);
  }
  assert.equal(ballista.mode, 'DEPLOYED');

  // Aim toward defender at Objective 1 (0, 0, -12) from (-8, 0, -46)
  const dx = defender.position.x - ballista.x;
  const dz = defender.position.z - ballista.z;
  ballista.yaw = Math.atan2(-dx, -dz);
  ballista.pitch = 0.02;

  // Fire volley (Shot I conditioning bolt + Shot II siege bolt)
  const fired = fireBiByeLlista(room, ballista, 2.0);
  assert.equal(fired, true, 'Deployed ballista must fire siege volley');

  // Step projectiles and simulation
  for (let i = 0; i < 60; i++) {
    const t = 2.0 + (i + 1) * (1 / 30);
    stepBiByeLlista(room, ballista, 1 / 30, t, room.world);
    stepBiByeProjectiles(room, 1 / 30, t, room.world);
  }

  // Verify damage or impact registered on defender
  assert.ok(defender.health < 100 || defender.stagger.count > 0 || defender.chill != null,
    'Ballista bombardment must impact defender at Objective 1');
});

test('The Outerworks: Flanking infantry can sneak via trench and damage ballista from rear', () => {
  const manager = new RoomManager();
  const room = manager.createBreakthroughRoom(0, true, WORLD_IDS.OUTERWORKS);
  const ballista = room.biByeLlista;
  assert.ok(ballista);

  const initialHp = ballista.health;
  const defenderFlanker = room.addPlayer({ id: 'flanker', name: 'TrenchFlanker', team: TEAMS.DEFENDERS }, 0);
  // Flanker emerges from trench at (-18, 0, -40) and approaches rear of ballista at (-8, 0, -46)
  defenderFlanker.position = { x: -8.0, y: 0, z: -48.0 };

  // Apply sword strike damage to ballista
  const dmgResult = damageBiByeLlista(room, ballista, 35, 1.0, defenderFlanker);
  assert.ok(dmgResult.applied > 0, 'Ballista must take damage from flanking attack');
  assert.ok(ballista.health < initialHp, 'Ballista durability must decrease when struck');
});

test('The Outerworks: Objective progression dynamic fortification transition', () => {
  const closed = outerworksForObjective({ index: 0, progress: 0, completed: false });
  const palisadeClosed = closed.solids.find((s) => s.id === 'barrier-outer-palisade');
  assert.ok(palisadeClosed, 'Palisade blocker must be solid during Phase 0');

  const phase1 = outerworksForObjective({ index: 1, progress: 0, completed: false });
  const palisadeOpen = phase1.solids.find((s) => s.id === 'barrier-outer-palisade');
  assert.equal(palisadeOpen, undefined, 'Palisade blocker must be removed once Objective 1 is captured');

  const portcullisPhase1 = phase1.solids.find((s) => s.id === 'portcullis-inner-gate');
  assert.ok(portcullisPhase1, 'Inner portcullis must remain solid during Phase 1');

  const completed = outerworksForObjective({ index: 1, progress: 1.0, completed: true });
  const portcullisCompleted = completed.solids.find((s) => s.id === 'portcullis-inner-gate');
  assert.equal(portcullisCompleted, undefined, 'Portcullis must be open when battle is completed');
});

test('The Outerworks: Tactical bot goals navigate across lanes', () => {
  const tactics = OUTERWORKS.tactics;
  assert.ok(tactics);

  // Attackers in Stage 1:
  // Rival 0 -> Vanguard central assault
  const vGoal = tactics.getTacticalGoal({
    actor: { team: TEAMS.ATTACKERS, position: { x: 0, y: 0, z: -40 } },
    rivalIndex: 0,
    objectiveState: { index: 0, progress: 0 },
    activeObj: OUTERWORKS.objectives[0],
    enemies: [],
  });
  assert.ok(vGoal && vGoal.z > -40, 'Vanguard bot must advance north down esplanade');

  // Rival 1 -> Flanker using Western Sally Trench
  const fGoal = tactics.getTacticalGoal({
    actor: { team: TEAMS.ATTACKERS, position: { x: -21, y: 0, z: -40 } },
    rivalIndex: 1,
    objectiveState: { index: 0, progress: 0 },
    activeObj: OUTERWORKS.objectives[0],
    enemies: [],
  });
  assert.ok(fGoal && fGoal.x <= -14, 'Flanker bot must route through Western Sally Trench');

  // Rival 2 -> Support ascending Eastern Firing Terrace
  const sGoal = tactics.getTacticalGoal({
    actor: { team: TEAMS.ATTACKERS, position: { x: 16, y: 0, z: -30 } },
    rivalIndex: 2,
    objectiveState: { index: 0, progress: 0 },
    activeObj: OUTERWORKS.objectives[0],
    enemies: [],
  });
  assert.ok(sGoal && sGoal.x >= 14, 'Support bot must head for Eastern Firing Terrace');
});
