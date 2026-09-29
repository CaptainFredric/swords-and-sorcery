// Sheathed in Steel, on a knight's armour: the plate hardens (sharper highlights, a cool edge of polished steel) as far
// as the armour is strong, and, as it is called, a glint runs from the magic gauntlet across the plate. Per knight:
// that knight's plate material is copied the first time it is needed (the rest keep sharing theirs), and one shader
// patch, keyed alike, serves every knight. The sword keeps its own material (the steel is the armour's).

import * as THREE from 'three';

const PATCH_KEY = 'spellblade-steel-sheen-1';
// how fast the glint runs over the plate (m/s) and how long until it has faded (s)
export const STEEL_RIPPLE = Object.freeze({ speed: 3.4, seconds: 0.95, width: 0.08 });

function patch(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSteelPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSteelPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSteelPos;\nuniform float uSteel;\nuniform float uRipple;\nuniform vec3 uRippleFrom;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.22, uSteel * 0.8);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // hardened: a cool edge of polished steel, as strong as the armour is
        float steelRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
        totalEmissiveRadiance += vec3(0.62, 0.7, 0.8) * (steelRim * 0.8 + 0.05) * uSteel;
        // the glint running out from the gauntlet as it is called
        if (uRipple >= 0.0) {
          float steelFront = uRipple * ${STEEL_RIPPLE.speed.toFixed(3)};
          float steelBand = exp(-pow((distance(vSteelPos, uRippleFrom) - steelFront) / ${STEEL_RIPPLE.width.toFixed(3)}, 2.0));
          totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * steelBand * (1.0 - smoothstep(0.5, ${STEEL_RIPPLE.seconds.toFixed(3)}, uRipple)) * 0.95;
        }`);
  };
  material.customProgramCacheKey = () => PATCH_KEY;
  return material;
}

/**
 * The steel on one knight's model ({ root } of a Spellblade asset). set(strength 0..1, rippleAge seconds since it was
 * called, or null) each frame. Nothing is copied or patched until the knight is first sheathed, unless `ready`: then
 * at once, so the plate's shader is built with the knight's own and not mid-fight, the first time it is called
 * (unsheathed, the patched plate looks exactly as before).
 */
export function createSteelSheen(instance, { gauntlet = 'handL', ready = false } = {}) {
  const uniforms = { uSteel: { value: 0 }, uRipple: { value: -1 }, uRippleFrom: { value: new THREE.Vector3() } };
  let clones = null;

  function ensure() {
    if (clones) return;
    clones = new Map();
    let origin = null;
    instance.root.updateMatrixWorld(true);
    instance.root.traverse((object) => {
      if (!object.isMesh || /Sword/i.test(object.name)) return;
      const list = [object.material].flat();
      if (!list.some((material) => material?.name === 'KitMetal')) return;
      const next = list.map((material) => {
        if (material?.name !== 'KitMetal') return material;
        if (!clones.has(material)) clones.set(material, patch(material.clone(), uniforms));
        return clones.get(material);
      });
      object.material = Array.isArray(object.material) ? next : next[0];
      // the gauntlet at rest, in the plate's own (rest) space: where the glint starts. The knight may be mid-motion
      // by now, so it comes from the skeleton's bind data, not the bone's current place
      if (!origin && object.isSkinnedMesh) {
        const bones = object.skeleton?.bones ?? [];
        const index = bones.findIndex((bone) => bone.name === gauntlet);
        if (index >= 0) {
          // (bind space to the geometry's own: the inverse of bindMatrix; bindMatrixInverse follows the knight about)
          const rest = new THREE.Matrix4().copy(object.skeleton.boneInverses[index]).invert();
          origin = new THREE.Vector3().applyMatrix4(rest).applyMatrix4(new THREE.Matrix4().copy(object.bindMatrix).invert());
        }
      }
    });
    if (origin) uniforms.uRippleFrom.value.copy(origin);
  }
  if (ready) ensure();

  return {
    set(strength = 0, rippleAge = null) {
      const rippling = Number.isFinite(rippleAge) && rippleAge >= 0 && rippleAge < STEEL_RIPPLE.seconds;
      if (!clones && !(strength > 0.001) && !rippling) return;
      ensure();
      uniforms.uSteel.value = Math.max(0, Math.min(1, strength));
      uniforms.uRipple.value = rippling ? rippleAge : -1;
    },
    dispose() {
      for (const material of clones?.values() ?? []) material.dispose();
      clones = null;
    },
  };
}
