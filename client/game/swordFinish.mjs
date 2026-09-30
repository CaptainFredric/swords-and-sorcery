import * as THREE from 'three';
import { finishedSwordColour } from './swordFinishModel.mjs';

export { SWORD_FINISH, finishedSwordColour } from './swordFinishModel.mjs';

// The Spellblade's longsword, finished as a sword. The armour kit gives its parts their colours in the model (a
// lavender blade, a salmon guard) and dresses them in the kit's scratched, pitted metal tile, lit like painted plate:
// on a blade that reads as speckled plaster. Here, once as each model loads (so every knight's sword, first person,
// third person and the Armory's, shares it): the blade is polished steel, its ridge a little darker, the guard gilt
// brass, the grip's binding dark blued steel; one clean metal that shows the sky along its edges instead of a tile.
// The model itself is left as it is.

// the sky a polished blade reflects: bright above, warm at the horizon, dark earth below (one small gradient)
let skyReflection = null;
function swordSky() {
  if (skyReflection) return skyReflection;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 0, 32);
  gradient.addColorStop(0, '#f3f7fb');
  gradient.addColorStop(0.35, '#c9d8e8');
  gradient.addColorStop(0.49, '#f7ecd6');
  gradient.addColorStop(0.53, '#7c7058');
  gradient.addColorStop(1, '#2a251d');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 32);
  skyReflection = new THREE.CanvasTexture(canvas);
  skyReflection.mapping = THREE.EquirectangularReflectionMapping;
  skyReflection.colorSpace = THREE.SRGBColorSpace;
  return skyReflection;
}

let swordMetal = null;
function swordMaterial() {
  swordMetal ??= new THREE.MeshStandardMaterial({
    name: 'SwordSteel',
    vertexColors: true,
    metalness: 0.8,
    roughness: 0.26,
    envMap: typeof document === 'undefined' ? null : swordSky(),
    envMapIntensity: 0.95,
  });
  return swordMetal;
}

/** Finish the sword in a loaded model's scene (its metal parts: recoloured, and the clean metal). Once per model. */
export function finishSword(scene) {
  scene.traverse((object) => {
    if (!object.isMesh || !/^HeroSword/.test(object.name) || object.userData.swordFinished) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (!materials.some((material) => material?.name === 'KitMetal')) return;
    const colours = object.geometry.getAttribute('color');
    if (colours) {
      for (let i = 0; i < colours.count; i += 1) {
        const to = finishedSwordColour([colours.getX(i), colours.getY(i), colours.getZ(i)]);
        colours.setXYZ(i, to[0], to[1], to[2]);
      }
      colours.needsUpdate = true;
    }
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => (material?.name === 'KitMetal' ? swordMaterial() : material))
      : swordMaterial();
    object.userData.swordFinished = true;
  });
}
