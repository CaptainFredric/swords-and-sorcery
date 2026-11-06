import * as THREE from 'three';
import { appUrl } from '../appUrl.mjs';
import { DEFAULT_EMBLEM, emblemChoice } from '../../shared/src/heraldry.mjs';
import { grimoireleeClothTexture } from './grimoireleeCloth.mjs';

// Institutional Grimoirelee is on the *front* tabard always. The back carries
// Grimoirelee by default or the player's unlocked/equipped personal herald.
// Paint into the existing UV atlas so skinned cape folds and dye remain intact.
// The model's legacy Trident node names are deliberately not modified.
const textures = new Map();
const loader = new THREE.TextureLoader();

function bannerTexture(url, like) {
  if (!textures.has(url)) {
    textures.set(url, new Promise((resolve, reject) => {
      loader.load(appUrl(url), (texture) => {
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
  const fronts = [], banners = [];
  let disposed = false;
  root.traverse((object) => {
    if (!object.isMesh || !['TabardFront', 'TabardBack'].includes(object.name)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      // Rodin's front cloth uses GameBody; its cape uses CapeBanner.
      // The kit uses KitBanner on both. Cloth dye already isolated both materials
      // per Spellblade, so replacing a front map cannot repaint armor.
      const supported = object.name === 'TabardFront'
        ? ['GameBody', 'KitBanner']
        : ['CapeBanner', 'KitBanner'];
      if (!supported.includes(material?.name) || !material.map) continue;
      const record = { mesh: object, material, base: material.map, cloth: material.name };
      if (object.name === 'TabardFront') fronts.push(record);
      else banners.push(record);
    }
  });

  // No player-earned emblem may alter the institutional sign on the front.
  for (const front of fronts) {
    grimoireleeClothTexture(front.mesh, front.base).then((texture) => {
      if (!disposed) front.material.map = texture;
    }).catch(() => {});
  }

  let wanted = null;
  const defaultBack = (banner, id) => {
    grimoireleeClothTexture(banner.mesh, banner.base).then((texture) => {
      if (!disposed && wanted === id) banner.material.map = texture;
    }).catch(() => {});
  };
  return {
    set(id) {
      if (disposed) return;
      const emblem = emblemChoice(id);
      if (emblem.id === wanted) return;
      wanted = emblem.id;
      for (const banner of banners) {
        if (emblem.id === DEFAULT_EMBLEM) {
          defaultBack(banner, emblem.id);
          continue;
        }
        const url = emblem.banners[banner.cloth];
        if (!url) { banner.material.map = banner.base; continue; }
        bannerTexture(url, banner.base).then((texture) => {
          if (!disposed && wanted === emblem.id) banner.material.map = texture;
        }).catch(() => {});
      }
    },
    dispose() {
      disposed = true;
      for (const banner of [...fronts, ...banners]) banner.material.map = banner.base;
    },
  };
}
