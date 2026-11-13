import { createClothDye } from './clothDye.mjs';
import { createEmblemBanner } from './emblemBanner.mjs';
import { lightPlate } from './plateEnvironment.mjs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createSorceryVolume } from './SorceryVolume.mjs';
import { sorceryLevel } from './spellbladeMotion.mjs';
import { SpellbladeAnimator } from './SpellbladeAnimator.mjs';
import { appUrl } from '../appUrl.mjs';
import { finishSword } from './swordFinish.mjs';

const DEFAULT_MANIFEST_URL = '/client/assets/characters/spellblade/manifest.json';
const SHA40 = /^[0-9a-f]{40}$/;
const MUTABLE_MATERIAL_NAMES = new Set(['VisorGlow', 'SorceryAccent']);
const ASSET_STATUS_KEY = '__SPELLBLADE_ASSET_STATUS__';
const ASSET_STATUS_SLOTS = new Set(['menu', 'remote', 'firstPerson']);

const loader = new GLTFLoader();
const gltfPromises = new Map();
const manifestPromises = new Map();
// download progress per GLB url, for the loading screen
const progress = new Map();
const progressListeners = new Set();

function reportProgress(url, loaded, total) {
  progress.set(url, { loaded, total: Math.max(total, loaded) });
  const all = [...progress.values()];
  const sum = all.reduce((acc, item) => ({ loaded: acc.loaded + item.loaded, total: acc.total + item.total }), { loaded: 0, total: 0 });
  for (const listener of progressListeners) listener(sum.total > 0 ? Math.min(1, sum.loaded / sum.total) : 0);
}

/** Listen for the combined download progress of the character models (0..1). Returns an unsubscribe. */
export function watchSpellbladeLoading(listener) {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

function requireManifest(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Spellblade manifest must be an object');
  if (raw.enabled === false) {
    return Object.freeze({
      version: raw.version ?? 1,
      enabled: false,
      sourceRevision: null,
    });
  }

  const sourceRevision = String(raw.sourceRevision || '').toLowerCase();
  if (!SHA40.test(sourceRevision)) throw new Error('Spellblade manifest sourceRevision must be a 40-hex SHA');

  for (const key of ['thirdPerson', 'firstPerson']) {
    const entry = raw[key];
    if (!entry || typeof entry.url !== 'string') throw new Error(`Spellblade manifest missing ${key}.url`);
    if (!entry.url.includes(`v=${sourceRevision}`)) throw new Error(`Spellblade ${key} URL must include sourceRevision cache key`);
  }

  return Object.freeze({
    ...raw,
    enabled: true,
    sourceRevision,
    mutableMaterials: Object.freeze([...(raw.mutableMaterials ?? MUTABLE_MATERIAL_NAMES)]),
    firstPersonMutableMaterials: Object.freeze([...(raw.firstPersonMutableMaterials ?? ['SorceryAccent'])]),
  });
}

export function reportSpellbladeAssetStatus(slot, instance = null) {
  if (!ASSET_STATUS_SLOTS.has(slot)) return null;

  const sourceRevision = String(instance?.sourceRevision || '').toLowerCase();
  const record = Object.freeze({
    kind: instance && SHA40.test(sourceRevision) ? 'glb' : 'fallback',
    sourceRevision: instance && SHA40.test(sourceRevision) ? sourceRevision : null,
  });
  const previous = globalThis[ASSET_STATUS_KEY];
  const status = previous && typeof previous === 'object' ? previous : {};
  globalThis[ASSET_STATUS_KEY] = Object.freeze({ ...status, [slot]: record });
  return record;
}

async function loadManifest(url = DEFAULT_MANIFEST_URL) {
  if (!manifestPromises.has(url)) {
    manifestPromises.set(url, fetch(appUrl(url), { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error(`Spellblade manifest HTTP ${response.status}`);
      return requireManifest(await response.json());
    }));
  }
  return manifestPromises.get(url);
}

function loadGltf(url) {
  if (!gltfPromises.has(url)) {
    reportProgress(url, 0, 0);
    // the manifest names models from the app's root: resolve them against the page (it may be served from a sub-path)
    gltfPromises.set(url, loader.loadAsync(appUrl(url), (event) => {
      if (event.lengthComputable) reportProgress(url, event.loaded, event.total);
    }).then((gltf) => {
      const done = progress.get(url);
      reportProgress(url, done?.total || 1, done?.total || 1);
      // the sword as a sword (polished steel, a gilt guard), once, before any knight is made from it
      finishSword(gltf.scene);
      return gltf;
    }));
  }
  return gltfPromises.get(url);
}

// The motion sidecars: clips laid over a canonical model's own, by bone name (animation-only GLBs of the same
// skeleton: tools/assets/build-spellblade-motion.mjs for the body, build-spellblade-fp-motion.mjs for the
// first-person arms). A clip of the same name replaces the model's; the model itself is not touched. Without one
// (not found, or it fails to load) the model plays its own clips.
const MOTION_FILES = Object.freeze({ thirdPerson: 'spellblade-motion', firstPerson: 'spellblade-fp-motion' });
const motionPromises = new Map();
function loadMotion(kind = 'thirdPerson') {
  const file = MOTION_FILES[kind] ?? MOTION_FILES.thirdPerson;
  if (!motionPromises.has(file)) motionPromises.set(file, fetch(appUrl(`/client/assets/characters/spellblade/${file}.json`), { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`motion sidecar HTTP ${response.status}`))))
    .then((meta) => loader.loadAsync(appUrl(`/client/assets/characters/spellblade/${file}.glb?v=${String(meta.sha256).slice(0, 40)}`))
      .then((gltf) => Object.freeze({ sha256: meta.sha256, clips: Object.freeze(gltf.animations) })))
    .catch((error) => { console.warn(`Spellblade motion sidecar unavailable (${file}):`, error?.message ?? error); return null; }));
  return motionPromises.get(file);
}

/** A model's clips with the sidecar's laid over them (same name: the sidecar's). */
export function withMotionClips(own, motion) {
  if (!motion?.length) return own;
  const replaced = new Set(motion.map((clip) => clip.name));
  return [...own.filter((clip) => !replaced.has(clip.name)), ...motion];
}

const FIRST_PERSON_ANISOTROPY = 8;
const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'];
function sharpenTextures(root, anisotropy) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of [].concat(object.material)) {
      for (const slot of TEXTURE_SLOTS) {
        const texture = material?.[slot];
        if (texture && texture.anisotropy < anisotropy) { texture.anisotropy = anisotropy; texture.needsUpdate = true; }
      }
    }
  });
}

function cloneMutableMaterials(root, names) {
  const wanted = new Set(names);
  const owned = new Set();
  const byName = new Map();

  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    let changed = false;
    const nextMaterials = sourceMaterials.map((material) => {
      if (!material || !wanted.has(material.name)) return material;
      changed = true;
      const isolated = material.clone();
      isolated.name = material.name;
      owned.add(isolated);
      const list = byName.get(material.name) ?? [];
      list.push(isolated);
      byName.set(material.name, list);
      return isolated;
    });
    if (changed) object.material = Array.isArray(object.material) ? nextMaterials : nextMaterials[0];
  });

  return {
    owned,
    byName: Object.freeze(Object.fromEntries(
      [...byName.entries()].map(([name, materials]) => [name, Object.freeze(materials)]),
    )),
  };
}

export async function createSpellbladeAsset({ kind = 'thirdPerson', manifestUrl = DEFAULT_MANIFEST_URL } = {}) {
  const manifest = await loadManifest(manifestUrl);
  if (manifest.enabled === false) return null;

  const entry = kind === 'firstPerson' ? manifest.firstPerson : manifest.thirdPerson;
  if (!entry) throw new Error(`Spellblade manifest has no ${kind} asset`);

  const [gltf, motion] = await Promise.all([loadGltf(entry.url), loadMotion(kind === 'firstPerson' ? 'firstPerson' : 'thirdPerson')]);
  const clips = withMotionClips(gltf.animations, motion?.clips);
  const root = SkeletonUtils.clone(gltf.scene);
  root.name = kind === 'firstPerson' ? 'SpellbladeFirstPersonAsset' : 'SpellbladeThirdPersonAsset';
  root.userData.sourceRevision = manifest.sourceRevision;
  root.userData.assetKind = kind;

  const mutableNames = kind === 'firstPerson'
    ? manifest.firstPersonMutableMaterials
    : manifest.mutableMaterials;
  const mutableMaterials = cloneMutableMaterials(root, mutableNames);
  const sockets = Object.freeze({
    sword: root.getObjectByName('socket_sword') ?? null,
    sorcery: root.getObjectByName('socket_sorcery') ?? null,
  });

  const sorcery = createSorceryVolume(sockets.sorcery);
  const castDuration = clips.find((clip) => clip.name === 'Cast')?.duration ?? 1;
  const animator = new SpellbladeAnimator(root, clips, (plan) => {
    // the palm glow stays a small ember except while a cast gathers and releases
    sorcery.update(performance.now() / 1000, (plan.mounted || plan.ramMounted) ? 0 : sorceryLevel(plan.layers?.sorcery?.clip ?? plan.clip, plan.layers?.sorcery?.time ?? plan.time, castDuration));
  }, { cloth: kind !== 'firstPerson' });

  // (the supplied model's plate, in the world and in the view's arms: something to reflect, so its steel reads as steel)
  lightPlate(root);
  // (the arms in view are seen a hand's breadth from the eye and edge-on along the forearm: their textures filtered
  // for that angle, or the forearm's plate smears and steps into blocks down its length)
  if (kind === 'firstPerson') sharpenTextures(root, FIRST_PERSON_ANISOTROPY);
  const clothDye = createClothDye(root);
  const emblemBanner = createEmblemBanner(root);
  let disposed = false;
  return {
    root,
    setCloth: (id) => clothDye.set(id),
    setEmblem: (id) => emblemBanner.set(id),
    animator,
    sockets,
    sorceryLevel: () => sorcery.level(),
    materials: mutableMaterials.byName,
    sourceRevision: manifest.sourceRevision,
    motionSha256: motion?.sha256 ?? null,
    dispose() {
      if (disposed) return;
      disposed = true;
      emblemBanner.dispose();
      clothDye.dispose();
      animator.dispose();
      sorcery.dispose();
      for (const material of mutableMaterials.owned) material.dispose();
    },
  };
}

export async function preloadSpellbladeAssets(manifestUrl = DEFAULT_MANIFEST_URL) {
  const manifest = await loadManifest(manifestUrl);
  if (manifest.enabled === false) return null;
  await Promise.all([loadGltf(manifest.thirdPerson.url), loadGltf(manifest.firstPerson.url), loadMotion('thirdPerson'), loadMotion('firstPerson')]);
  return manifest.sourceRevision;
}

export function clearSpellbladeAssetCaches() {
  manifestPromises.clear();
  gltfPromises.clear();
  motionPromises.clear();
}
