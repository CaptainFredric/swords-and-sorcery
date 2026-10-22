import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BASTION_BREACH,
  BASTION_BREACH_CLOSED,
  BASTION_BREACH_OPEN,
  BASTION_GATE_BLOCKER,
  BASTION_GATE_DOOR_BUMPERS,
  BASTION_GATE_OPEN_DURATION_SEC,
  bastionBreachForObjective,
} from '../../shared/worlds/bastionBreach.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');

async function read(relPath) {
  return readFile(path.join(ROOT, relPath), 'utf8');
}

test('Authored Honorable Entry Gatehouse: GLB asset exists, valid glTF binary, hierarchy, locators and 4 clips', () => {
  const glbPath = path.join(ROOT, 'client/assets/worlds/bastion-breach/honorable-entry-gatehouse.glb');
  assert.equal(existsSync(glbPath), true, 'honorable-entry-gatehouse.glb must exist at client/assets/worlds/bastion-breach/');

  const buffer = readFileSync(glbPath);
  assert.ok(buffer.length > 1000000, 'GLB asset size must be substantial (>1MB)');

  // Validate glTF 2.0 binary header
  const magic = buffer.toString('utf8', 0, 4);
  assert.equal(magic, 'glTF', 'Valid glTF magic header');
  const version = buffer.readUInt32LE(4);
  assert.equal(version, 2, 'glTF version must be 2');
  const totalLength = buffer.readUInt32LE(8);
  assert.equal(totalLength, buffer.length, 'Header totalLength must match file length');

  const jsonChunkLen = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.toString('utf8', 16, 20);
  assert.equal(jsonChunkType, 'JSON', 'Chunk 0 must be JSON');

  const jsonStr = buffer.toString('utf8', 20, 20 + jsonChunkLen);
  const gltf = JSON.parse(jsonStr);

  // Validate node hierarchy
  const nodeNames = new Set(gltf.nodes.map((n) => n.name));
  const expectedNodes = [
    'Gatehouse_Root',
    'Gatehouse_Structure',
    'Door_L',
    'Door_R',
    'Portcullis',
    'Winch_Drum',
    'Winch_Gear_L',
    'Winch_Gear_R',
    'Counterweight_L',
    'Counterweight_R',
    'attacker_approach_mark',
    'threshold_plaque_mark',
    'gate_barrier_center',
    'passage_interior_mark',
    'courtyard_exit_mark',
  ];
  for (const nodeName of expectedNodes) {
    assert.equal(nodeNames.has(nodeName), true, `GLB must contain node "${nodeName}"`);
  }

  // Validate 4 animation clips and durations
  const animMap = new Map();
  for (const anim of gltf.animations) {
    let maxTime = 0;
    for (const sampler of anim.samplers) {
      const acc = gltf.accessors[sampler.input];
      if (acc?.max?.[0]) maxTime = Math.max(maxTime, acc.max[0]);
    }
    animMap.set(anim.name, maxTime);
  }

  assert.equal(animMap.has('Gate_ClosedIdle'), true, 'Must author Gate_ClosedIdle');
  assert.equal(animMap.has('Gate_Open'), true, 'Must author Gate_Open');
  assert.equal(animMap.has('Gate_OpenIdle'), true, 'Must author Gate_OpenIdle');
  assert.equal(animMap.has('Gate_Close'), true, 'Must author Gate_Close');

  const openDuration = animMap.get('Gate_Open');
  assert.ok(Math.abs(openDuration - 3.6) < 0.05, `Gate_Open must be ~3.6s (got ${openDuration.toFixed(2)}s)`);

  // Verify 3.0x timeScale lockstep with 1.2s server transition
  const timeScale = openDuration / BASTION_GATE_OPEN_DURATION_SEC;
  assert.ok(Math.abs(timeScale - 3.0) < 0.05, `TimeScale must be 3.0x for 1.2s server transition (got ${timeScale.toFixed(2)}x)`);
});

test('Authored Honorable Entry Gatehouse: authoritative collision matches Argon v1.1 geometry bounds', () => {
  // Gate barrier (Stage 1 dynamic blocker)
  assert.equal(BASTION_GATE_BLOCKER.id, 'gatehouse-honorable-gate-closed');
  const [bxMin, bxMax] = [
    BASTION_GATE_BLOCKER.center[0] - BASTION_GATE_BLOCKER.size[0] / 2,
    BASTION_GATE_BLOCKER.center[0] + BASTION_GATE_BLOCKER.size[0] / 2,
  ];
  const [byMin, byMax] = [
    BASTION_GATE_BLOCKER.center[1] - BASTION_GATE_BLOCKER.size[1] / 2,
    BASTION_GATE_BLOCKER.center[1] + BASTION_GATE_BLOCKER.size[1] / 2,
  ];
  const [bzMin, bzMax] = [
    BASTION_GATE_BLOCKER.center[2] - BASTION_GATE_BLOCKER.size[2] / 2,
    BASTION_GATE_BLOCKER.center[2] + BASTION_GATE_BLOCKER.size[2] / 2,
  ];

  // Exact bounds check: X in [-1.696, 1.696], Y in [0, 3.940], Z in [8.550, 9.100]
  assert.ok(Math.abs(bxMin - -1.696) < 0.01, `Blocker xMin must be -1.696 (got ${bxMin})`);
  assert.ok(Math.abs(bxMax - 1.696) < 0.01, `Blocker xMax must be +1.696 (got ${bxMax})`);
  assert.ok(Math.abs(byMin - 0.000) < 0.01, `Blocker yMin must be 0.000 (got ${byMin})`);
  assert.ok(Math.abs(byMax - 3.940) < 0.01, `Blocker yMax must be 3.940 (got ${byMax})`);
  assert.ok(Math.abs(bzMin - 8.550) < 0.01, `Blocker zMin must be 8.550 (got ${bzMin})`);
  assert.ok(Math.abs(bzMax - 9.100) < 0.01, `Blocker zMax must be 9.100 (got ${bzMax})`);

  // Arch jambs & towers
  const towerWest = BASTION_BREACH.solids.find((s) => s.id === 'gatehouse-tower-west');
  const towerEast = BASTION_BREACH.solids.find((s) => s.id === 'gatehouse-tower-east');
  const overhead = BASTION_BREACH.solids.find((s) => s.id === 'gatehouse-arch-overhead');
  assert.ok(towerWest, 'Must have gatehouse-tower-west solid');
  assert.ok(towerEast, 'Must have gatehouse-tower-east solid');
  assert.ok(overhead, 'Must have gatehouse-arch-overhead solid');

  // Walkable gap width between inner stone jambs: exactly 3.392m ([-1.696, 1.696])
  const jambWestXMax = towerWest.center[0] + towerWest.size[0] / 2;
  const jambEastXMin = towerEast.center[0] - towerEast.size[0] / 2;
  assert.ok(Math.abs(jambWestXMax - -1.696) < 0.01, `West jamb edge must be -1.696 (got ${jambWestXMax})`);
  assert.ok(Math.abs(jambEastXMin - 1.696) < 0.01, `East jamb edge must be +1.696 (got ${jambEastXMin})`);
  const walkableGap = jambEastXMin - jambWestXMax;
  assert.ok(Math.abs(walkableGap - 3.392) < 0.02, `Walkable gap must be 3.392m (got ${walkableGap})`);

  // Raised portcullis spike clearance: Y = 3.940m (+2.14m above 1.80m player)
  const overheadYMin = overhead.center[1] - overhead.size[1] / 2;
  assert.ok(Math.abs(overheadYMin - 3.940) < 0.01, `Overhead clearance must be 3.940m (got ${overheadYMin})`);

  // Door bumpers in SOLIDS_OPEN leave 3.088m clear lane between inward-opened doors
  const bumperWest = BASTION_GATE_DOOR_BUMPERS.find((s) => s.id === 'gatehouse-door-bumper-west');
  const bumperEast = BASTION_GATE_DOOR_BUMPERS.find((s) => s.id === 'gatehouse-door-bumper-east');
  assert.ok(bumperWest && bumperEast, 'Door bumpers must be defined');
  const clearLaneWest = bumperWest.center[0] + bumperWest.size[0] / 2;
  const clearLaneEast = bumperEast.center[0] - bumperEast.size[0] / 2;
  assert.ok(Math.abs(clearLaneWest - -1.544) < 0.01, `Clear lane west must be -1.544 (got ${clearLaneWest})`);
  assert.ok(Math.abs(clearLaneEast - 1.544) < 0.01, `Clear lane east must be +1.544 (got ${clearLaneEast})`);
  const clearWidth = clearLaneEast - clearLaneWest;
  assert.ok(Math.abs(clearWidth - 3.088) < 0.02, `Clear width between open doors must be 3.088m (got ${clearWidth})`);

  // Connecting curtain walls connect seamlessly at x = -7.575 and x = +7.575
  const wallWestInner = BASTION_BREACH.solids.find((s) => s.id === 'wall-breach-west-inner');
  const wallEast = BASTION_BREACH.solids.find((s) => s.id === 'wall-breach-east');
  assert.ok(wallWestInner && wallEast);
  const wallWestMax = wallWestInner.center[0] + wallWestInner.size[0] / 2;
  const wallEastMin = wallEast.center[0] - wallEast.size[0] / 2;
  assert.ok(Math.abs(wallWestMax - -7.575) < 0.01, `West curtain wall must meet gatehouse at -7.575 (got ${wallWestMax})`);
  assert.ok(Math.abs(wallEastMin - 7.575) < 0.01, `East curtain wall must meet gatehouse at +7.575 (got ${wallEastMin})`);

  // Navigation nodes through chokepoint are along x = 0
  const breachNodes = BASTION_BREACH.navigation.nodes.filter((n) => n.id.startsWith('breach-'));
  assert.equal(breachNodes.length, 3);
  for (const node of breachNodes) {
    assert.equal(node.x, 0, `Breach node ${node.id} must be centered at x = 0`);
  }

  // Phase 0 defender spawns: must be strictly OUTSIDE Objective 1 capture radius (6.0m)
  // and clear of all gatehouse solids (towers, buttresses, doors, walls)
  const obj1 = BASTION_BREACH.objectives.find((o) => o.id === 'outer-gate') ?? { x: 0, y: 0, z: -2, radius: 6.0 };
  const phase0Defenders = BASTION_BREACH.spawnPoints.filter((s) => s.team === 'DEFENDERS' && s.phase === 0);
  assert.equal(phase0Defenders.length, 5, 'Must have 5 Phase 0 defender spawns');

  for (const sp of phase0Defenders) {
    const dist = Math.hypot(sp.x - obj1.x, sp.z - obj1.z);
    assert.ok(
      dist > obj1.radius,
      `Defender spawn at (${sp.x}, ${sp.z}) distance ${dist.toFixed(2)}m must be > capture radius ${obj1.radius}m`
    );

    // Collision check against ALL closed-world solids
    for (const sol of BASTION_BREACH_CLOSED.solids) {
      const [x0, x1] = [sol.center[0] - sol.size[0] / 2, sol.center[0] + sol.size[0] / 2];
      const [y0, y1] = [sol.center[1] - sol.size[1] / 2, sol.center[1] + sol.size[1] / 2];
      const [z0, z1] = [sol.center[2] - sol.size[2] / 2, sol.center[2] + sol.size[2] / 2];
      const inX = sp.x >= x0 && sp.x <= x1;
      const inY = sp.y >= y0 && sp.y < y1;
      const inZ = sp.z >= z0 && sp.z <= z1;
      assert.equal(inX && inY && inZ, false, `Defender spawn at (${sp.x}, ${sp.y}, ${sp.z}) must not intersect solid "${sol.id}"`);
    }
  }
});

test('BastionBreachRenderer source: loads authored GLB, binds clips, and synchronizes with gateOpenProgress', async () => {
  const source = await read('client/worlds/BastionBreachRenderer.mjs');

  assert.match(source, /GATEHOUSE_MODEL_URL\s*=\s*['"]\/client\/assets\/worlds\/bastion-breach\/honorable-entry-gatehouse\.glb['"]/);
  assert.match(source, /loadHonorableGatehouseAsset/);
  assert.match(source, /GLTFLoader/);
  assert.match(source, /SkeletonUtils/);
  assert.match(source, /#setupAuthoredGatehouse/);
  assert.match(source, /setGatehouseAsset/);
  assert.match(source, /#buildFallbackProceduralGate/);
  assert.match(source, /sol\.id\.startsWith\(['"]gatehouse-['"]\)/, 'Must skip all gatehouse-* solids to prevent duplicate geometry');
  assert.match(source, /gatehouseMixer/);
  assert.match(source, /Gate_Open/);
  assert.match(source, /Gate_Close/);
  assert.match(source, /timeScale|openAction\.time/);
  assert.match(source, /#buildConstructionGapScaffolding/);
  assert.match(source, /uncacheRoot/);
  assert.match(source, /resetGatehouseAssetCache/);
  assert.match(source, /gatehouseOwnedMaterials/);

  // Asset lifecycle: fallback disposal must NOT dispose shared materials (this.materials)
  assert.doesNotMatch(
    source,
    /fallbackGatehouseGroup\.traverse\([^)]*\)\s*=>\s*\{[^}]*disposeMaterial\s*\(\s*obj\.material\s*\)/,
    'Fallback traversal must not dispose shared renderer materials'
  );

  // Match reset: returning from Stage 2 back to Stage 1 snaps gate closed immediately
  assert.match(source, /previousTarget\s*===\s*1\.0\s*&&\s*newTarget\s*===\s*0\.0/);
});
