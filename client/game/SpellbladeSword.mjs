import * as THREE from 'three';
import { bladeData, taperedPrismData } from './facetedGeometryData.mjs';
import { facetedMesh } from './facetedGeometry.mjs';
import { SPELLBLADE_SWORD } from './spellbladeDesign.mjs';

function requireAxis(axis) {
  if (axis !== 'y' && axis !== 'z') throw new RangeError(`unsupported Spellblade sword axis: ${axis}`);
}

function requireScale(scale) {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Spellblade sword scale must be positive and finite');
}

function addGuardArm(parent, materials, side, castShadow) {
  const arm = facetedMesh(
    taperedPrismData({
      height: SPELLBLADE_SWORD.guardWidth * 0.5,
      topWidth: 0.105,
      bottomWidth: 0.15,
      topDepth: 0.12,
      bottomDepth: 0.16,
      topOffsetX: side * 0.025,
    }),
    materials.trim,
    { castShadow, receiveShadow: false },
  );
  arm.rotation.z = side * -Math.PI / 2;
  arm.position.x = side * SPELLBLADE_SWORD.guardWidth * 0.25;
  parent.add(arm);
}

export function createSpellbladeSword(materials, {
  axis = 'y',
  scale = 1,
  castShadow = true,
} = {}) {
  requireAxis(axis);
  requireScale(scale);
  if (!materials?.blade || !materials?.trim || !materials?.leather || !materials?.cloth) {
    throw new TypeError('Spellblade sword requires blade, trim, leather, and cloth materials');
  }

  const sword = new THREE.Group();
  sword.name = 'spellblade-sword';

  const blade = facetedMesh(
    bladeData({
      length: SPELLBLADE_SWORD.bladeLength,
      width: SPELLBLADE_SWORD.bladeWidth,
      thickness: SPELLBLADE_SWORD.bladeThickness,
      tipLength: 0.28,
      ridge: 0.3,
    }),
    materials.blade,
    { castShadow, receiveShadow: false, name: 'blade' },
  );
  blade.position.y = 0.08;
  sword.add(blade);

  const ridge = facetedMesh(
    taperedPrismData({
      height: SPELLBLADE_SWORD.bladeLength - 0.34,
      topWidth: 0.034,
      bottomWidth: 0.052,
      topDepth: 0.018,
      bottomDepth: 0.026,
    }),
    materials.bladeRidge ?? materials.blade,
    { castShadow, receiveShadow: false, name: 'ridge' },
  );
  ridge.position.set(0, 0.08 + (SPELLBLADE_SWORD.bladeLength - 0.34) / 2, -SPELLBLADE_SWORD.bladeThickness * 0.54);
  sword.add(ridge);

  const guard = new THREE.Group();
  guard.name = 'guard';
  guard.position.y = 0.035;
  addGuardArm(guard, materials, -1, castShadow);
  addGuardArm(guard, materials, 1, castShadow);
  sword.add(guard);

  const grip = facetedMesh(
    taperedPrismData({
      height: SPELLBLADE_SWORD.gripLength,
      topWidth: 0.115,
      bottomWidth: 0.09,
      topDepth: 0.115,
      bottomDepth: 0.09,
    }),
    materials.leather,
    { castShadow, receiveShadow: false, name: 'grip' },
  );
  grip.position.y = -SPELLBLADE_SWORD.gripLength / 2 - 0.055;
  sword.add(grip);

  const pommel = new THREE.Mesh(
    new THREE.OctahedronGeometry(SPELLBLADE_SWORD.pommelRadius, 0),
    materials.trim,
  );
  pommel.name = 'pommel';
  pommel.position.y = -SPELLBLADE_SWORD.gripLength - 0.14;
  pommel.scale.y = 1.2;
  pommel.castShadow = castShadow;
  pommel.receiveShadow = false;
  sword.add(pommel);

  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.072, 0), materials.cloth);
  gem.name = 'gem';
  gem.position.set(0, 0.03, -0.085);
  gem.scale.set(0.82, 1.0, 0.52);
  gem.castShadow = castShadow;
  gem.receiveShadow = false;
  sword.add(gem);

  if (axis === 'z') sword.rotation.x = -Math.PI / 2;
  sword.scale.setScalar(scale);
  return sword;
}
