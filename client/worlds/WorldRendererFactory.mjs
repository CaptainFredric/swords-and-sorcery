const WORLD_RENDERER_KEYS = Object.freeze({
  'castleward': 'castleward',
  'shattered-keep': 'shattered-keep',
});

export function rendererKeyForWorld(worldId) {
  const key = WORLD_RENDERER_KEYS[worldId];
  if (!key) throw new Error(`Unsupported world renderer: ${worldId}`);
  return key;
}

export function createWorldRenderer(worldId, scene, rendererTypes) {
  const key = rendererKeyForWorld(worldId);
  const Renderer = rendererTypes?.[key];
  if (typeof Renderer !== 'function') throw new Error(`Renderer type unavailable: ${key}`);
  return new Renderer(scene);
}
