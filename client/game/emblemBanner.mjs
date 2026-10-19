import * as THREE from 'three';
import { appUrl } from '../appUrl.mjs';
import { DEFAULT_EMBLEM, emblemChoice } from '../../shared/src/heraldry.mjs';

// The emblem on a knight's back banner (shared/src/heraldry.mjs), laid on the back banner (TabardBack) alone: the front
// tabard keeps the trident. Each kind of banner cloth has its own texture for an emblem, by its material's name: the
// kit's banner atlas (KitBanner: the front tabard on its left half, the back banner on its right, the emblem on the
// right half only) or a cape with a texture of its own (CapeBanner). A back banner of any other cloth carries no emblem
// (nothing is changed on it).
// Isolated per knight: the back banner's own material is changed (clothDye has already made it this knight's own).

const textures = new Map();
const loader = new THREE.TextureLoader();

function bannerTexture(url, like) {
  if (!textures.has(url)) {
    textures.set(url, new Promise((resolve, reject) => {
      loader.load(appUrl(url), (texture) => {
        // (as the model's own cloth texture is: glTF's orientation and colour space)
        texture.flipY = like.flipY;
        texture.colorSpace = like.colorSpace;
        texture.wrapS = like.wrapS;
        texture.wrapT = like.wrapT;
        texture.anisotropy = like.anisotropy;
        texture.channel = like.channel ?? 0;
        resolve(texture);
      }, undefined, reject);
    }));
  }
  return textures.get(url);
}

export function createEmblemBanner(root) {
  const banners = [];
  root.traverse((object) => {
    if (!object.isMesh || object.name !== 'TabardBack') return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (['KitBanner', 'CapeBanner'].includes(material?.name) && material.map) banners.push({ material, base: material.map, cloth: material.name });
    }
  });
  let wanted = DEFAULT_EMBLEM;
  return {
    set(id) {
      const emblem = emblemChoice(id);
      if (emblem.id === wanted) return;
      wanted = emblem.id;
      for (const banner of banners) {
        const url = emblem.banners[banner.cloth];
        if (!url) { banner.material.map = banner.base; continue; }
        bannerTexture(url, banner.base).then((texture) => {
          if (wanted === emblem.id) banner.material.map = texture;
        }).catch(() => {});
      }
    },
    dispose() {
      // (the shared emblem textures stay loaded for the next knight; the banner returns to its own cloth)
      for (const banner of banners) banner.material.map = banner.base;
    },
  };
}
