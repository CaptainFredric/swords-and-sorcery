import * as THREE from 'three';
import { facetedMesh } from './facetedGeometry.mjs';
import { taperedPrismData, wedgeData } from './facetedGeometryData.mjs';
import {
  SPELLBLADE_PALETTE,
  SPELLBLADE_PROPORTIONS,
} from './spellbladeDesign.mjs';
import { createSpellbladeSword } from './SpellbladeSword.mjs';

const PLAYER_ACCENTS = [0x55d9ff, 0xff6c5f, 0xffd15c, 0xa987ff, 0x63e39a, 0xff8bc8, 0xffa14a, 0x7fa6ff];

function pivot(parent, position) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  return group;
}

function piece(parent, data, material, {
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  name = '',
  castShadow = true,
  receiveShadow = true,
} = {}) {
  const mesh = facetedMesh(data, material, { name, castShadow, receiveShadow });
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}

function makeMaterials(index) {
  const playerAccent = PLAYER_ACCENTS[index % PLAYER_ACCENTS.length];
  return {
    armor: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.armor, roughness: 0.62, metalness: 0.48 }),
    armorLight: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.armorLight, roughness: 0.5, metalness: 0.6 }),
    darkArmor: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.darkArmor, roughness: 0.74, metalness: 0.3 }),
    cloth: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.cloth, roughness: 0.88 }),
    leather: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.leather, roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.trim, roughness: 0.46, metalness: 0.65 }),
    blade: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.blade, roughness: 0.2, metalness: 0.92 }),
    bladeRidge: new THREE.MeshStandardMaterial({ color: SPELLBLADE_PALETTE.bladeRidge, roughness: 0.27, metalness: 0.88 }),
    magic: new THREE.MeshStandardMaterial({
      color: SPELLBLADE_PALETTE.magic,
      emissive: SPELLBLADE_PALETTE.magic,
      emissiveIntensity: 1.45,
      roughness: 0.24,
      metalness: 0.12,
    }),
    playerAccent: new THREE.MeshStandardMaterial({
      color: playerAccent,
      emissive: playerAccent,
      emissiveIntensity: 0.55,
      roughness: 0.38,
      metalness: 0.25,
    }),
  };
}

function buildPelvis(visual, materials) {
  const pelvis = pivot(visual, [0, 0.8, 0]);
  piece(pelvis, taperedPrismData({
    height: 0.3,
    topWidth: 0.6,
    bottomWidth: 0.52,
    topDepth: 0.42,
    bottomDepth: 0.37,
  }), materials.darkArmor);
  piece(pelvis, taperedPrismData({
    height: 0.085,
    topWidth: 0.7,
    bottomWidth: 0.66,
    topDepth: 0.45,
    bottomDepth: 0.43,
  }), materials.leather, { position: [0, 0.09, 0], name: 'belt' });

  const buckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), materials.playerAccent);
  buckle.name = 'player-accent';
  buckle.position.set(0, 0.09, -0.245);
  buckle.scale.set(1, 0.78, 0.42);
  buckle.castShadow = false;
  pelvis.add(buckle);
  return pelvis;
}

function buildTorso(visual, materials) {
  const torso = pivot(visual, [0, 1.18, 0]);
  piece(torso, taperedPrismData({
    height: 0.58,
    topWidth: SPELLBLADE_PROPORTIONS.chestTopWidth,
    bottomWidth: SPELLBLADE_PROPORTIONS.waistWidth,
    topDepth: 0.47,
    bottomDepth: 0.38,
    topOffsetZ: -0.015,
  }), materials.armor, { name: 'torso-core' });

  piece(torso, wedgeData({ width: 0.72, height: 0.2, depth: 0.49, slope: 0.3 }), materials.armorLight, {
    position: [0, 0.14, -0.015],
    name: 'upper-chest-plate',
  });
  piece(torso, taperedPrismData({
    height: 0.19,
    topWidth: 0.64,
    bottomWidth: 0.55,
    topDepth: 0.45,
    bottomDepth: 0.4,
  }), materials.armorLight, { position: [0, -0.12, -0.012], name: 'lower-chest-plate' });

  piece(torso, taperedPrismData({
    height: 0.12,
    topWidth: 0.54,
    bottomWidth: 0.48,
    topDepth: 0.5,
    bottomDepth: 0.47,
  }), materials.cloth, { position: [0, 0.34, 0], name: 'scarf-wrap' });
  return torso;
}

function buildTabards(visual, materials) {
  const tabardFront = piece(visual, taperedPrismData({
    height: 0.68,
    topWidth: 0.39,
    bottomWidth: 0.27,
    topDepth: 0.055,
    bottomDepth: 0.045,
  }), materials.cloth, {
    position: [0, 0.74, -0.245],
    rotation: [0.04, 0, 0],
    name: 'front-tabard',
  });
  piece(tabardFront, taperedPrismData({
    height: 0.44,
    topWidth: 0.075,
    bottomWidth: 0.055,
    topDepth: 0.014,
    bottomDepth: 0.012,
  }), materials.trim, { position: [0, -0.01, -0.04], name: 'front-tabard-trim' });

  const tabardBack = piece(visual, taperedPrismData({
    height: 0.76,
    topWidth: 0.36,
    bottomWidth: 0.29,
    topDepth: 0.05,
    bottomDepth: 0.04,
  }), materials.cloth, {
    position: [0, 0.73, 0.235],
    rotation: [-0.05, 0, 0],
    name: 'back-tabard',
  });
  return { tabardFront, tabardBack };
}

function buildHelmet(visual, materials) {
  const head = pivot(visual, [0, 1.72, 0]);
  piece(head, taperedPrismData({
    height: 0.46,
    topWidth: 0.43,
    bottomWidth: SPELLBLADE_PROPORTIONS.helmetWidth,
    topDepth: 0.41,
    bottomDepth: 0.47,
    topOffsetZ: 0.018,
  }), materials.darkArmor, { name: 'helmet-shell' });

  piece(head, wedgeData({ width: 0.52, height: 0.16, depth: 0.46, slope: 0.28 }), materials.armorLight, {
    position: [0, 0.13, -0.018],
    name: 'helmet-brow',
  });

  for (const side of [-1, 1]) {
    piece(head, taperedPrismData({
      height: 0.28,
      topWidth: 0.105,
      bottomWidth: 0.12,
      topDepth: 0.07,
      bottomDepth: 0.08,
      topOffsetX: side * 0.012,
    }), materials.armor, {
      position: [side * 0.19, -0.07, -0.235],
      rotation: [0, 0, side * -0.08],
      name: `${side < 0 ? 'left' : 'right'}-cheek-plate`,
    });
  }

  const visor = piece(head, wedgeData({
    width: SPELLBLADE_PROPORTIONS.visorWidth,
    height: 0.076,
    depth: 0.042,
    slope: 0.2,
  }), materials.magic, {
    position: [0, 0.02, -0.258],
    name: 'visor',
    castShadow: false,
    receiveShadow: false,
  });

  piece(head, wedgeData({ width: 0.105, height: 0.31, depth: 0.17, slope: 0.44 }), materials.cloth, {
    position: [0, 0.36, 0.025],
    rotation: [-0.08, 0, 0],
    name: 'crest',
  });

  return { head, visor };
}

function buildArm(visual, x, materials, side) {
  const upper = pivot(visual, [x, 1.38, 0]);
  piece(upper, taperedPrismData({
    height: 0.43,
    topWidth: 0.29,
    bottomWidth: 0.22,
    topDepth: 0.31,
    bottomDepth: 0.25,
  }), materials.armor, { position: [0, -0.22, 0], name: `${side < 0 ? 'left' : 'right'}-upper-arm` });

  const pauldron = piece(upper, wedgeData({ width: 0.45, height: 0.24, depth: 0.44, slope: 0.38 }), materials.armorLight, {
    position: [side * 0.075, -0.015, 0],
    rotation: [0, 0, side * -0.18],
    name: `${side < 0 ? 'left' : 'right'}-pauldron`,
  });
  piece(pauldron, taperedPrismData({
    height: 0.055,
    topWidth: 0.3,
    bottomWidth: 0.26,
    topDepth: 0.31,
    bottomDepth: 0.29,
  }), materials.trim, { position: [side * 0.025, -0.1, -0.01], name: 'pauldron-trim' });

  const forearm = pivot(upper, [0, -0.42, 0]);
  piece(forearm, taperedPrismData({
    height: 0.12,
    topWidth: 0.21,
    bottomWidth: 0.2,
    topDepth: 0.23,
    bottomDepth: 0.22,
  }), materials.darkArmor, { position: [0, -0.045, 0], name: `${side < 0 ? 'left' : 'right'}-elbow-gap` });
  piece(forearm, taperedPrismData({
    height: 0.34,
    topWidth: 0.22,
    bottomWidth: 0.29,
    topDepth: 0.24,
    bottomDepth: 0.31,
  }), materials.armor, { position: [0, -0.22, -0.005], name: `${side < 0 ? 'left' : 'right'}-bracer` });
  piece(forearm, wedgeData({ width: 0.31, height: 0.11, depth: 0.33, slope: 0.24 }), materials.armorLight, {
    position: [0, -0.17, -0.015],
    name: `${side < 0 ? 'left' : 'right'}-bracer-plate`,
  });
  const hand = piece(forearm, taperedPrismData({
    height: 0.19,
    topWidth: 0.25,
    bottomWidth: 0.21,
    topDepth: 0.24,
    bottomDepth: 0.21,
  }), materials.leather, { position: [0, -0.42, -0.015], name: `${side < 0 ? 'left' : 'right'}-gauntlet` });

  return { upper, forearm, hand, pauldron };
}

function buildLeg(visual, x, materials, side) {
  const sideName = side < 0 ? 'left' : 'right';
  const thigh = pivot(visual, [x, 0.78, 0]);
  piece(thigh, taperedPrismData({
    height: 0.4,
    topWidth: 0.32,
    bottomWidth: 0.24,
    topDepth: 0.35,
    bottomDepth: 0.29,
  }), materials.armor, { position: [0, -0.21, 0], name: `${sideName}-thigh` });
  piece(thigh, wedgeData({ width: 0.32, height: 0.13, depth: 0.36, slope: 0.3 }), materials.armorLight, {
    position: [0, -0.035, -0.005],
    name: `${sideName}-thigh-plate`,
  });

  const shin = pivot(thigh, [0, -0.42, 0]);
  piece(shin, taperedPrismData({
    height: 0.11,
    topWidth: 0.235,
    bottomWidth: 0.22,
    topDepth: 0.27,
    bottomDepth: 0.25,
  }), materials.darkArmor, { position: [0, -0.035, 0], name: `${sideName}-knee-gap` });
  piece(shin, taperedPrismData({
    height: 0.35,
    topWidth: SPELLBLADE_PROPORTIONS.shinWidth,
    bottomWidth: 0.25,
    topDepth: 0.3,
    bottomDepth: 0.27,
  }), materials.armor, { position: [0, -0.2, 0], name: `${sideName}-shin` });
  piece(shin, wedgeData({ width: 0.295, height: 0.13, depth: 0.32, slope: 0.28 }), materials.armorLight, {
    position: [0, -0.13, -0.012],
    name: `${sideName}-greave-plate`,
  });
  piece(shin, taperedPrismData({
    height: 0.22,
    topWidth: 0.29,
    bottomWidth: SPELLBLADE_PROPORTIONS.bootWidth,
    topDepth: 0.34,
    bottomDepth: 0.48,
    topOffsetZ: 0.045,
  }), materials.darkArmor, { position: [0, -0.41, -0.06], name: `${sideName}-boot` });

  return { thigh, shin };
}

export function createSpellbladeRig(index = 0) {
  const materials = makeMaterials(index);
  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);

  const pelvis = buildPelvis(visual, materials);
  const torso = buildTorso(visual, materials);
  const { tabardFront, tabardBack } = buildTabards(visual, materials);
  const { head, visor } = buildHelmet(visual, materials);
  const left = buildArm(visual, -0.54, materials, -1);
  const right = buildArm(visual, 0.54, materials, 1);
  const leftLeg = buildLeg(visual, -0.22, materials, -1);
  const rightLeg = buildLeg(visual, 0.22, materials, 1);

  const sword = createSpellbladeSword(materials, { axis: 'y' });
  sword.position.set(0, -0.44, 0.02);
  sword.rotation.set(0.06, 0, -2.42);
  right.forearm.add(sword);

  const magicAnchor = pivot(left.forearm, [0, -0.46, -0.04]);
  const magic = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), materials.magic);
  magic.name = 'magic-core';
  magic.castShadow = false;
  magicAnchor.add(magic);
  const magicHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.018, 5, 12),
    materials.magic,
  );
  magicHalo.name = 'magic-halo';
  magicHalo.rotation.x = Math.PI / 2;
  magicHalo.castShadow = false;
  magicAnchor.add(magicHalo);

  root.userData = {
    visual,
    pelvis,
    torso,
    head,
    visor,
    tabardFront,
    tabardBack,
    leftUpperArm: left.upper,
    leftForearm: left.forearm,
    rightUpperArm: right.upper,
    rightForearm: right.forearm,
    leftThigh: leftLeg.thigh,
    leftShin: leftLeg.shin,
    rightThigh: rightLeg.thigh,
    rightShin: rightLeg.shin,
    sword,
    magicAnchor,
    magic,
    magicHalo,
    accentMaterial: materials.magic,
    castPoseStartAt: -Infinity,
    castPoseUntil: 0,
    lastFireballReadyAt: null,
    lastAlive: true,
    deathStartedAt: null,
  };

  return root;
}
