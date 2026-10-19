import * as THREE from 'three';
import { appUrl } from '../appUrl.mjs';
import { DEFAULT_EMBLEM, emblemChoice } from '../../shared/src/heraldry.mjs';

// The emblem on a knight's back banner (shared/src/heraldry.mjs). The kit's banner cloth is one atlas, the front
// tabard on its left half and the back banner on its right; an earned emblem's atlas is the same cloth with the emblem
// on the back banner's half only, so it is laid on the back banner (TabardBack) alone and the front tabard keeps the
// trident. A model whose back banner is not the kit's banner cloth carries no emblem (nothing is changed on it).
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
      if (material?.name === 'KitBanner' && material.map) banners.push({ material, base: material.map });
    }
  });
  let wanted = DEFAULT_EMBLEM;
  return {
    set(id) {
      const emblem = emblemChoice(id);
      if (emblem.id === wanted) return;
      wanted = emblem.id;
      if (!banners.length) return;
      if (!emblem.banner) {
        for (const banner of banners) banner.material.map = banner.base;
        return;
      }
      bannerTexture(emblem.banner, banners[0].base).then((texture) => {
        if (wanted !== emblem.id) return;
        for (const banner of banners) banner.material.map = texture;
      }).catch(() => {});
    },
    dispose() {
      // (the shared emblem textures stay loaded for the next knight; the banner returns to its own cloth)
      for (const banner of banners) banner.material.map = banner.base;
    },
  };
}
