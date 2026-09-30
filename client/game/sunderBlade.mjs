// The sword while Sunder All That Rusts is active: restrained structural energy, not a glow of magic. The steel holds
// a dull ember heat, as metal does under a load it should not bear, breathing slowly and catching a little on each
// beat. Only that knight's sword: its meshes wear a copy of the steel with the heat in it (the finished steel is one
// material shared by every sword) while it lasts, and the shared steel again after.

const HEAT = Object.freeze({ color: 0x7e300c, base: 0.3, breath: 0.26, rate: 3.1 });

export function createSunderBlade(root) {
  const meshes = [];
  root?.traverse?.((object) => { if (object.isMesh && /^HeroSword/i.test(object.name)) meshes.push(object); });
  const originals = new Map();   // mesh -> its material(s)
  const heated = new Map();      // an original material -> its heated copy
  let on = false;
  const heat = (material) => {
    if (!material?.isMeshStandardMaterial) return material;
    if (!heated.has(material)) {
      const copy = material.clone();
      copy.emissive.setHex(HEAT.color);
      copy.emissiveIntensity = HEAT.base;
      heated.set(material, copy);
    }
    return heated.get(material);
  };
  return {
    /** Heat the blade (or let it cool) and breathe the heat at `timeSec`. */
    set(active, timeSec = 0) {
      if (active && !on) {
        for (const mesh of meshes) {
          originals.set(mesh, mesh.material);
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(heat) : heat(mesh.material);
        }
      } else if (!active && on) {
        for (const [mesh, material] of originals) mesh.material = material;
        originals.clear();
      }
      on = Boolean(active);
      if (!on) return;
      const beat = 0.5 + 0.5 * Math.sin(timeSec * HEAT.rate);
      for (const copy of heated.values()) copy.emissiveIntensity = HEAT.base + HEAT.breath * beat * beat;
    },
    dispose() {
      this.set(false);
      for (const copy of heated.values()) copy.dispose();
      heated.clear();
    },
  };
}
