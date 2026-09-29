// Isolated per knight. Recolour red cloth pixels only; the banner's gold embroidery and shading stay intact.
export function createClothDye(root) {
  const uniform = { value: 0 };
  const owned = [];
  root.traverse((object) => {
    if (!object.isMesh || !/^Tabard(Front|Back)$/.test(object.name)) return;
    const clone = (source) => {
      const material = source.clone();
      material.onBeforeCompile = (shader) => {
        shader.uniforms.ssAzure = uniform;
        shader.fragmentShader = `uniform float ssAzure;\n${shader.fragmentShader}`.replace('#include <color_fragment>', `#include <color_fragment>
          float clothMask = smoothstep(1.4, 1.9, diffuseColor.r / max(diffuseColor.g, 0.001))
            * smoothstep(1.1, 1.4, diffuseColor.r / max(diffuseColor.b, 0.001));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.r * vec3(0.20, 0.48, 0.95), clothMask * ssAzure);
        `);
      };
      material.customProgramCacheKey = () => 'spellblade-cloth-v1';
      owned.push(material);
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
  return { set(id) { uniform.value = id === 'azure' ? 1 : 0; }, dispose() { owned.forEach((m) => m.dispose()); } };
}
