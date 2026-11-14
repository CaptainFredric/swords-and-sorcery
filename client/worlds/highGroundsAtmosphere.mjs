import * as THREE from 'three';
import { puffTexture } from '../game/softTextures.mjs';
import { FacetBuilder, KIT_PALETTE as P, facetMesh, kitMaterials, seededRandom } from './kit/facetKit.mjs';
import { pennant } from './kit/kitProps.mjs';
import { createWind, flutterCloth, nearestHolder, poleWeight, setWindWeights } from './kit/wind.mjs';

// The High Grounds' air: what makes twelve metres of plank over seventy-odd of nothing feel like it. Presentation only:
// nothing here is solid, nothing changes where a knight can stand or fall.
//  - cloud banks drifting far below the decks, between them and the valley (the abyss has a depth you can read);
//  - the giant trees' blooms swaying, and petals shed off them drifting downwind across the battlefield;
//  - pennants on the cross-bridges' rails, rippling in the stronger wind up there (Azure's south, Crimson's north).

export const HIGH_GROUNDS_WIND = Object.freeze({ direction: Object.freeze([0.55, 0.83]), strength: 1.35 });

// cloud banks: [x, y, z, width, depth] (low and broad; a few under the map itself, seen through its gaps)
const CLOUD_BANKS = Object.freeze([
  [-95, -34, -150, 70, 34], [60, -38, -170, 80, 30], [130, -30, -60, 60, 40], [-140, -36, -40, 76, 36],
  [-20, -42, -60, 64, 28], [30, -40, 40, 58, 30], [-110, -32, 80, 70, 32], [110, -36, 120, 74, 34],
  [-40, -38, 165, 66, 30], [150, -44, 30, 60, 28], [0, -46, -110, 50, 22], [-60, -44, 20, 46, 22],
]);

/** Build the High Grounds' air into `group`; returns { update(timeSec), dispose() }. */
export function buildHighGroundsAtmosphere(group, world, { blooms = [] } = {}) {
  const parts = [];
  const wind = createWind(HIGH_GROUNDS_WIND);
  parts.push(cloudBanks(group));
  parts.push(swayingBlooms(blooms));
  parts.push(drift(group, world.trees));
  parts.push(bridgePennants(group, wind));
  return {
    wind,
    update(timeSec) {
      wind.update(timeSec);
      for (const part of parts) part?.update?.(timeSec);
    },
    dispose() { for (const part of parts) part?.dispose?.(); },
  };
}

function cloudBanks(group) {
  const texture = puffTexture();
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const banks = CLOUD_BANKS.map(([x, y, z, w, d], i) => {
    // two overlapping puffs a bank, the upper a little smaller and fainter, so it has some body
    const layers = [0, 1].map((k) => {
      const material = new THREE.MeshBasicMaterial({ map: texture, color: 0xf3f5f2, transparent: true, opacity: k ? 0.22 : 0.34, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geometry, material);
      m.name = 'high-grounds-cloud-bank';
      m.scale.set(w * (k ? 0.7 : 1), 1, d * (k ? 0.75 : 1));
      m.renderOrder = -1;
      group.add(m);
      return m;
    });
    return { layers, x, y, z, phase: i * 2.1 };
  });
  return {
    update(timeSec) {
      for (const b of banks) {
        // drifting slowly downwind and back over a long cycle, breathing in size
        const dx = Math.sin(timeSec * 0.011 + b.phase) * 14;
        const dz = Math.sin(timeSec * 0.008 + b.phase * 1.3) * 10;
        b.layers.forEach((m, k) => {
          m.position.set(b.x + dx + k * 6, b.y + k * 2.2, b.z + dz - k * 4);
          m.rotation.y = b.phase + timeSec * 0.002 * (k ? -1 : 1);
        });
      }
    },
    dispose() { geometry.dispose(); for (const b of banks) for (const m of b.layers) { m.removeFromParent(); m.material.dispose(); } },
  };
}

// each bloom of a giant tree's crown leans with the gusts, the crown's top furthest; meshes moved, never rebuilt
function swayingBlooms(blooms) {
  for (const b of blooms) b.userData.rest ??= b.position.clone();
  const dir = new THREE.Vector2(...HIGH_GROUNDS_WIND.direction).normalize();
  return {
    update(timeSec) {
      for (const b of blooms) {
        const rest = b.userData.rest;
        const phase = rest.x * 0.05 + rest.z * 0.04;
        const gust = 0.55 + 0.45 * (Math.sin(timeSec * 0.7 - phase) * 0.6 + Math.sin(timeSec * 0.29 - phase * 0.7 + 1.3) * 0.4);
        const lean = gust * 0.32 * HIGH_GROUNDS_WIND.strength;
        const flutter = Math.sin(timeSec * 2.6 + rest.y * 0.7 + phase * 3) * 0.05;
        b.position.set(rest.x + dir.x * lean + flutter, rest.y - lean * 0.05, rest.z + dir.y * lean - flutter);
        b.rotation.z = flutter * 0.4;
      }
    },
  };
}

// petals shed off the blooming trees, drifting downwind and tumbling as they fall (instanced: one draw per colour)
const PETAL_TONES = Object.freeze({ rose: 0xe3a4bb, ivory: 0xf6ead0, gold: 0xf7c98d });
const PETALS_PER_TREE = 22;
function drift(group, trees) {
  const rand = seededRandom(909);
  const geometry = new THREE.PlaneGeometry(0.24, 0.16);
  const dir = new THREE.Vector3(HIGH_GROUNDS_WIND.direction[0], 0, HIGH_GROUNDS_WIND.direction[1]).normalize();
  const byTone = new Map();
  for (const tree of trees) {
    const tone = tree.bloom in PETAL_TONES ? tree.bloom : 'rose';
    if (!byTone.has(tone)) byTone.set(tone, []);
    for (let i = 0; i < PETALS_PER_TREE; i += 1) {
      byTone.get(tone).push({ tree, offset: rand(), spin: 1 + rand() * 2, a: rand() * Math.PI * 2, r: rand() });
    }
  }
  const sets = [...byTone].map(([tone, petals]) => {
    // (unlit: a lit petal seen edge-on or from behind went dark and read as a fly)
    const material = new THREE.MeshBasicMaterial({ color: PETAL_TONES[tone], side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geometry, material, petals.length);
    mesh.name = `high-grounds-petals-${tone}`;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh, petals };
  });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  return {
    update(timeSec) {
      for (const { mesh, petals } of sets) {
        petals.forEach((petal, i) => {
          // a petal's whole fall takes ~26 s: from the crown, out downwind up to ~45 m, down ~32 m, then it goes
          const t = (timeSec / 26 + petal.offset) % 1;
          const crown = petal.tree.height - 6;
          const out = petal.tree.radius * 1.4 * petal.r;
          const sway = Math.sin(timeSec * 1.3 + petal.a * 3) * 1.2 * t;
          p.set(petal.tree.x + Math.cos(petal.a) * out + dir.x * t * 45 - dir.z * sway,
            crown - t * 32 + Math.sin(timeSec * 2 + petal.a) * 0.3,
            petal.tree.z + Math.sin(petal.a) * out + dir.z * t * 45 + dir.x * sway);
          e.set(timeSec * petal.spin + petal.a, timeSec * petal.spin * 0.7, petal.a);
          q.setFromEuler(e);
          // in at the crown, gone before it ends
          s.setScalar(Math.min(1, t * 12) * Math.min(1, (1 - t) * 6));
          mesh.setMatrixAt(i, m.compose(p, q, s));
        });
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { geometry.dispose(); for (const { mesh } of sets) { mesh.removeFromParent(); mesh.material.dispose(); mesh.dispose(); } },
  };
}

// pennants on the cross-bridges' rails: the colours of the side whose half the bridge crosses (neutral at the centre)
function bridgePennants(group, wind) {
  const rand = seededRandom(1213);
  const flags = new FacetBuilder(), wood = new FacetBuilder(), metal = new FacetBuilder();
  const batch = { cloth: flags, wood, metal };
  const poles = [];
  const tone = { [-57]: 0x3f6f9f, 0: 0xe6dcc0, 57: 0x9e3b35 };
  for (const z of [-57, 0, 57]) for (const side of [-1, 1]) for (const x of [-33, 0, 33]) {
    // stood on the rail's own brass finial (HighGroundsRenderer draws them every 11 m at y 13.37)
    const at = { x, y: 13.55, z: z + side * 3.62 };
    pennant(batch, rand, { ...at, height: 1.05, facing: side > 0 ? Math.PI / 2 : -Math.PI / 2, color: tone[z] ?? P.crimson });
    poles.push({ x: at.x, z: at.z });
  }
  const kit = kitMaterials();
  const flagMaterial = flutterCloth(kit.cloth, wind, { amplitude: 0.14 });
  const meshes = [];
  const flagMesh = facetMesh(flags, flagMaterial, { castShadow: false, name: 'high-grounds-bridge-pennants' });
  const near = nearestHolder(poles, 3);
  setWindWeights(flagMesh.geometry, (x, y, z) => poleWeight(near(x, z), x, y, z));
  meshes.push(flagMesh, facetMesh(wood, kit.wood, { castShadow: false, name: 'high-grounds-pennant-poles' }), facetMesh(metal, kit.metal, { castShadow: false, name: 'high-grounds-pennant-caps' }));
  for (const mesh of meshes) group.add(mesh);
  return {
    dispose() {
      for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      for (const material of Object.values(kit)) material.dispose();
    },
  };
}
