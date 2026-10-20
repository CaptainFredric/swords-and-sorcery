import * as THREE from 'three';

// Something for the supplied Spellblade's plate to reflect. The game lights its knights with a hemisphere and a sun and
// no environment map: with nothing to reflect, metal renders dark, so that model's build turns its metalness down to a
// sixth (as the kit's colours are calibrated), and its steel and brass then read as matte paint, like clay. Here its
// plate is given a soft sky over ground to reflect, faintly (the renderer prefilters it on first use), and its metal a
// little up: the steel takes a little of the sky on its upper faces and the ground below, and reads as steel. Only a
// model carrying the supplied model's materials is changed (the kit, calibrated for no environment, is left as it is);
// its glow and its own kit parts (the sword, the palm rune) are left alone.

export const PLATE_ENVIRONMENT = Object.freeze({
  body: 'GameBody',
  // (linear) the sky, the horizon and the ground the plate sees
  sky: Object.freeze([0.62, 0.62, 0.6]),
  horizon: Object.freeze([0.78, 0.74, 0.66]),
  ground: Object.freeze([0.16, 0.13, 0.11]),
  // (a soft reflection, not a shine: at more the plate read light and glinting against the world, and drew the eye in
  // first person; the concept's steel is dark and quiet, its edges catching the light)
  intensity: 0.3,
  // the build's metalness, a little up from its sixth of the source's; its roughness a little higher (scaled)
  metal: 1.25,
  roughness: 1.1,
});
const LEAVE = new Set(['KitMetal', 'KitMatte', 'SwordSteel', 'SorceryAccent', 'VisorGlow', 'Helmet visor shadow']);
// the supplied model's metal parts (their metalness is the build's, scaled down): the rest only see the sky
const METAL = /^(GameBody|Native supplied forearm|Hand steel|Hand worn edge|Helmet )/;

let shared = null;
function skyOverGround() {
  if (shared) return shared;
  const width = 64;
  const height = 32;
  const data = new Float32Array(width * height * 4);
  const { sky, horizon, ground } = PLATE_ENVIRONMENT;
  for (let y = 0; y < height; y += 1) {
    // (the top row is straight up)
    const up = 1 - (2 * (y + 0.5)) / height;
    const colour = up >= 0
      ? horizon.map((h, k) => h + (sky[k] - h) * Math.min(1, up / 0.6))
      : horizon.map((h, k) => h + (ground[k] - h) * Math.min(1, -up / 0.25));
    for (let x = 0; x < width; x += 1) data.set([...colour, 1], (y * width + x) * 4);
  }
  shared = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  shared.mapping = THREE.EquirectangularReflectionMapping;
  shared.colorSpace = THREE.LinearSRGBColorSpace;
  shared.flipY = true;
  shared.needsUpdate = true;
  return shared;
}

/** Whether a model is the supplied Spellblade (its body's material, or its arms' in first person), which takes the
 * environment. */
export function wantsPlateEnvironment(root) {
  let found = false;
  root.traverse((object) => {
    if (found || !object.isMesh) return;
    for (const material of [].concat(object.material)) if (material?.name && METAL.test(material.name)) found = true;
  });
  return found;
}

/** Give the supplied model's plate its environment (once per material; materials are shared between knights). */
export function lightPlate(root) {
  if (!wantsPlateEnvironment(root)) return false;
  const env = skyOverGround();
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material)) {
      if (!material?.isMeshStandardMaterial || !material.name || LEAVE.has(material.name) || material.userData.plateEnvironment) continue;
      material.envMap = env;
      material.envMapIntensity = PLATE_ENVIRONMENT.intensity;
      if (METAL.test(material.name)) {
        // (the build's metalness: in a texture, scaled by the factor; or the factor itself, scaled)
        material.metalness = material.metalnessMap ? PLATE_ENVIRONMENT.metal : Math.min(0.6, material.metalness * PLATE_ENVIRONMENT.metal);
        material.roughness = Math.min(1, material.roughness * PLATE_ENVIRONMENT.roughness);
      }
      material.userData.plateEnvironment = true;
      material.needsUpdate = true;
    }
  });
  return true;
}
