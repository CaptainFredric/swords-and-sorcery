import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createSorceryVolume } from './SorceryVolume.mjs';
import { SpellbladeAnimator } from './SpellbladeAnimator.mjs';

const DEFAULT_MANIFEST_URL = '/client/assets/characters/spellblade/manifest.json';
const SHA40 = /^[0-9a-f]{40}$/;
const MUTABLE_MATERIAL_NAMES = new Set(['VisorGlow', 'SorceryAccent']);
const ASSET_STATUS_KEY = '__SPELLBLADE_ASSET_STATUS__';
const ASSET_STATUS_SLOTS = new Set(['menu', 'remote', 'firstPerson']);

const loader = new GLTFLoader();
const gltfPromises = new Map();
const manifestPromises = new Map();

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
    manifestPromises.set(url, fetch(url, { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error(`Spellblade manifest HTTP ${response.status}`);
      return requireManifest(await response.json());
    }));
  }
  return manifestPromises.get(url);
}

function loadGltf(url) {
  if (!gltfPromises.has(url)) gltfPromises.set(url, loader.loadAsync(url));
  return gltfPromises.get(url);
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

  const gltf = await loadGltf(entry.url);
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
  const animator = new SpellbladeAnimator(root, gltf.animations, (plan) => {
    sorcery.update(plan.time, plan.clip === 'Cast');
  }, { cloth: kind !== 'firstPerson' });

  let disposed = false;
  return {
    root,
    animator,
    sockets,
    materials: mutableMaterials.byName,
    sourceRevision: manifest.sourceRevision,
    dispose() {
      if (disposed) return;
      disposed = true;
      animator.dispose();
      sorcery.dispose();
      for (const material of mutableMaterials.owned) material.dispose();
    },
  };
}

export async function preloadSpellbladeAssets(manifestUrl = DEFAULT_MANIFEST_URL) {
  const manifest = await loadManifest(manifestUrl);
  if (manifest.enabled === false) return null;
  await Promise.all([loadGltf(manifest.thirdPerson.url), loadGltf(manifest.firstPerson.url)]);
  return manifest.sourceRevision;
}

export function clearSpellbladeAssetCaches() {
  manifestPromises.clear();
  gltfPromises.clear();
}
