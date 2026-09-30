import * as THREE from 'three';
import { finishedSwordColour } from './swordFinishModel.mjs';

export { SWORD_FINISH, finishedSwordColour } from './swordFinishModel.mjs';

// The Spellblade's longsword, finished as a sword. The armour kit gives its parts their colours in the model (a
// lavender blade, a salmon guard) and dresses them in the kit's scratched, pitted metal tile, lit like painted plate:
// on a blade that reads as speckled plaster. Here, once as each model loads (so every knight's sword, first person,
// third person and the Armory's, shares it): the blade is worn, dark working steel, its ridge darker still, the guard
// aged brass, the grip's binding blued steel; one metal with a fine grain of use in it, catching only a little of the
// sky (a sword that belongs with the rest of the armour, not a polished mirror). The model itself is left as it is.

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

// the grain of a worked, used blade: fine and faint, a little drawn out one way (no pits, no speckle)
let swordGrain = null;
function grainTexture() {
  if (swordGrain) return swordGrain;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const image = g.createImageData(size, size);
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rows = Array.from({ length: size }, () => random());
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // long faint streaks along x, and a fine grain over them
      const v = 0.9 + 0.045 * rows[y] + 0.04 * (random() - 0.5);
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.round(255 * Math.min(1, v));
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  swordGrain = new THREE.CanvasTexture(canvas);
  swordGrain.wrapS = swordGrain.wrapT = THREE.RepeatWrapping;
  swordGrain.colorSpace = THREE.SRGBColorSpace;
  return swordGrain;
}

let swordMetal = null;
function swordMaterial() {
  const inPage = typeof document !== 'undefined';
  swordMetal ??= new THREE.MeshStandardMaterial({
    name: 'SwordSteel',
    vertexColors: true,
    map: inPage ? grainTexture() : null,
    metalness: 0.68,
    roughness: 0.5,
    envMap: inPage ? swordSky() : null,
    envMapIntensity: 0.42,
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
