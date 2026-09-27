// What each part of the game takes from the settings. Pure: the store in, plain options out (main.mjs hands them to
// the sound engine, the arena, the menu scene and the screen turn whenever anything changes).

// the most pixels per CSS pixel each render quality draws (phones with dense screens gain the most from lowering it)
export const RENDER_QUALITY = Object.freeze({ low: 1, medium: 1.35, high: 1.6 });

export function soundLevels(store) {
  return {
    muted: store.get('audio.muted'),
    master: store.get('audio.master') / 100,
    effects: store.get('audio.effects') / 100,
    voice: store.get('audio.voice') / 100,
    ambience: store.get('audio.ambience') / 100,
    music: store.get('audio.music') / 100,
    musicMuted: store.get('audio.musicMuted'),
  };
}

export function viewOptions(store) {
  return {
    fov: store.get('display.fov'),
    pixelRatioCap: RENDER_QUALITY[store.get('display.quality')] ?? RENDER_QUALITY.high,
    cameraMotion: store.get('display.cameraShake') / 100,
    damageNumbers: store.get('display.damageNumbers'),
    damageFlash: store.get('display.damageFlash'),
  };
}

export function inputOptions(store) {
  return {
    mouse: store.get('controls.mouseSensitivity'),
    touch: store.get('controls.touchSensitivity'),
    invertY: store.get('controls.invertY'),
    touchScale: store.get('controls.touchScale') / 100,
    bindings: store.allBindings(),
  };
}

export function turnOptions(store) {
  return { mode: store.get('display.orientation'), side: store.get('display.turnSide') };
}
