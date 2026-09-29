import { clothChoice } from '../../shared/src/cosmetics.mjs';

// Isolated per knight. Recolour red cloth pixels only; the banner's gold embroidery and shading stay intact.
export function createClothDye(root) {
  const amount = { value: 0 };
  const tint = { value: [...clothChoice('crimson').tint] };
  const owned = [];
  root.traverse((object) => {
    if (!object.isMesh || !/^Tabard(Front|Back)$/.test(object.name)) return;
    const clone = (source) => {
      const material = source.clone();
      material.onBeforeCompile = (shader) => {
        shader.uniforms.ssDyeAmount = amount;
        shader.uniforms.ssClothTint = tint;
        shader.fragmentShader = `uniform float ssDyeAmount; uniform vec3 ssClothTint;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
          float clothMask = smoothstep(1.4, 1.9, diffuseColor.r / max(diffuseColor.g, 0.001))
            * smoothstep(1.1, 1.4, diffuseColor.r / max(diffuseColor.b, 0.001));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.r * ssClothTint, clothMask * ssDyeAmount);
        `);
      };
      material.customProgramCacheKey = () => 'spellblade-cloth-v2';
      owned.push(material);
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
  return {
    set(id) {
      const item = clothChoice(id);
      amount.value = item.id === 'crimson' ? 0 : 1;
      tint.value = [...item.tint];
    },
    dispose() { owned.forEach((m) => m.dispose()); },
  };
}
