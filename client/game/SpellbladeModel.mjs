import * as THREE from 'three';

const ACCENTS = [0x55d9ff, 0xff6c5f, 0xffd15c, 0xa987ff, 0x63e39a, 0xff8bc8, 0xffa14a, 0x7fa6ff];

function box(parent, size, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function pivot(parent, position) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  return group;
}

function limb(parent, x, materials, side) {
  const upper = pivot(parent, [x, 1.38, 0]);
  box(upper, [0.25, 0.43, 0.28], materials.armor, [0, -0.22, 0]);
  const pauldron = box(upper, [0.38, 0.22, 0.42], materials.armorLight, [side * 0.07, -0.02, 0], [0, 0, side * -0.18]);
  box(pauldron, [0.24, 0.06, 0.28], materials.trim, [side * 0.03, -0.12, -0.02]);

  const forearm = pivot(upper, [0, -0.42, 0]);
  box(forearm, [0.23, 0.36, 0.25], materials.darkArmor, [0, -0.18, 0]);
  box(forearm, [0.28, 0.14, 0.3], materials.armorLight, [0, -0.12, -0.01]);
  const hand = box(forearm, [0.22, 0.18, 0.22], materials.leather, [0, -0.4, -0.01]);
  return { upper, forearm, hand };
}

function leg(parent, x, materials) {
  const thigh = pivot(parent, [x, 0.78, 0]);
  box(thigh, [0.3, 0.42, 0.34], materials.darkArmor, [0, -0.21, 0]);
  box(thigh, [0.32, 0.15, 0.37], materials.armor, [0, -0.03, -0.01]);

  const shin = pivot(thigh, [0, -0.42, 0]);
  box(shin, [0.28, 0.36, 0.3], materials.armor, [0, -0.18, 0]);
  box(shin, [0.31, 0.13, 0.34], materials.armorLight, [0, -0.1, -0.01]);
  box(shin, [0.34, 0.18, 0.47], materials.darkArmor, [0, -0.39, -0.08]);
  return { thigh, shin };
}

function makeSword(materials) {
  const sword = new THREE.Group();
  box(sword, [0.12, 0.34, 0.12], materials.leather, [0, -0.16, 0]);
  box(sword, [0.58, 0.1, 0.15], materials.trim, [0, 0.03, 0]);
  box(sword, [0.16, 1.12, 0.085], materials.blade, [0, 0.64, 0]);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), materials.blade);
  tip.position.y = 1.35;
  tip.rotation.y = Math.PI / 4;
  tip.castShadow = true;
  sword.add(tip);
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), materials.trim);
  pommel.position.y = -0.38;
  pommel.castShadow = true;
  sword.add(pommel);
  return sword;
}

export function createSpellbladeRig(index = 0) {
  const accentColor = ACCENTS[index % ACCENTS.length];
  const materials = {
    armor: new THREE.MeshStandardMaterial({ color: 0x535d6d, roughness: 0.62, metalness: 0.48 }),
    armorLight: new THREE.MeshStandardMaterial({ color: 0x7b8797, roughness: 0.52, metalness: 0.58 }),
    darkArmor: new THREE.MeshStandardMaterial({ color: 0x252b35, roughness: 0.72, metalness: 0.32 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x762d35, roughness: 0.88 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x4a3529, roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x9b7b4a, roughness: 0.48, metalness: 0.62 }),
    blade: new THREE.MeshStandardMaterial({ color: 0xc9d2dc, roughness: 0.22, metalness: 0.92 }),
    accent: new THREE.MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 1.4, roughness: 0.28, metalness: 0.15 }),
  };

  const root = new THREE.Group();
  const visual = new THREE.Group();
  root.add(visual);

  const pelvis = pivot(visual, [0, 0.8, 0]);
  box(pelvis, [0.58, 0.28, 0.4], materials.darkArmor);
  box(pelvis, [0.7, 0.1, 0.43], materials.leather, [0, 0.08, 0]);
  box(pelvis, [0.13, 0.15, 0.06], materials.trim, [0, 0.08, -0.24]);

  const torso = pivot(visual, [0, 1.18, 0]);
  box(torso, [0.76, 0.58, 0.44], materials.armor);
  box(torso, [0.68, 0.2, 0.48], materials.armorLight, [0, 0.14, -0.015]);
  box(torso, [0.5, 0.12, 0.5], materials.cloth, [0, 0.34, 0]);

  const tabardFront = box(visual, [0.38, 0.67, 0.06], materials.cloth, [0, 0.74, -0.24], [0.04, 0, 0]);
  const tabardBack = box(visual, [0.34, 0.72, 0.06], materials.cloth, [0, 0.75, 0.24], [-0.05, 0, 0]);
  box(tabardFront, [0.1, 0.4, 0.018], materials.trim, [0, -0.02, -0.04]);

  const head = pivot(visual, [0, 1.72, 0]);
  box(head, [0.5, 0.46, 0.48], materials.darkArmor);
  box(head, [0.54, 0.16, 0.5], materials.armorLight, [0, 0.13, 0]);
  const visor = box(head, [0.33, 0.085, 0.035], materials.accent, [0, 0.015, -0.257]);
  box(head, [0.12, 0.28, 0.15], materials.cloth, [0, 0.34, 0.02]);

  const left = limb(visual, -0.54, materials, -1);
  const right = limb(visual, 0.54, materials, 1);
  const leftLeg = leg(visual, -0.22, materials);
  const rightLeg = leg(visual, 0.22, materials);

  const sword = makeSword(materials);
  sword.position.set(0, -0.44, 0.02);
  sword.rotation.set(0.06, 0, -2.42);
  right.forearm.add(sword);

  const magicAnchor = pivot(left.forearm, [0, -0.46, -0.04]);
  const magic = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), materials.accent);
  magic.castShadow = false;
  magicAnchor.add(magic);
  const magicHalo = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.018, 5, 12),
    materials.accent,
  );
  magicHalo.rotation.x = Math.PI / 2;
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
    accentMaterial: materials.accent,
    castPoseUntil: 0,
    lastFireballReadyAt: null,
    lastAlive: true,
    deathStartedAt: null,
  };

  return root;
}
