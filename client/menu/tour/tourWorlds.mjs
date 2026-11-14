import * as THREE from 'three';

// The worlds behind the front door: Castleward (the menu's own, always there: every other screen is framed on its
// green) and whichever world the round has moved on to (tourMaps.mjs). Another world's renderer is fetched while the
// round before it still runs (prepare: its module only, nothing built), built in the dark of the fade between maps
// (show: building one takes a moment; nobody sees the frame it takes), and shown in that world's own light, sky and
// fog. One other world is kept at a time: moving on to a third lets the second go. Leaving the front door shows
// Castleward again at once, in its own light.

// each world's renderer, fetched only when the round is going there
const RENDERERS = Object.freeze({
  'court-of-merit': () => import('../../worlds/CourtOfMeritRenderer.mjs').then((module) => module.CourtOfMeritRenderer),
  outerworks: () => import('../../worlds/OuterworksRenderer.mjs').then((module) => module.OuterworksRenderer),
});

export class TourWorlds {
  /**
   * scene/camera: the menu's; castleward: its CastlewardRenderer (kept, never disposed here); hemisphere/sun: the menu's
   * two lights, set to each world's.
   */
  constructor({ scene, camera, castleward, hemisphere, sun, renderer = null }) {
    this.scene = scene;
    this.camera = camera;
    // (to compile a world's shaders in the dark it is built in, not on the first frame it is seen)
    this.renderer = renderer;
    this.hemisphere = hemisphere;
    this.sun = sun;
    this.types = new Map();
    this.loading = new Map();
    this.worlds = new Map([['castleward', castleward]]);
    this.activeId = 'castleward';
    this.disposed = false;
  }

  get active() {
    return this.worlds.get(this.activeId);
  }

  /** The light the world on show is drawn in (its sun's offset is what the menu's sun keeps from whoever it follows). */
  get lighting() {
    return this.active?.lighting ?? null;
  }

  /** Fetch a world's renderer ahead of the dark: resolves true once it can be shown, false if it cannot. */
  prepare(id) {
    if (this.worlds.has(id) || this.types.has(id)) return Promise.resolve(true);
    const load = RENDERERS[id];
    if (!load) return Promise.resolve(false);
    if (!this.loading.has(id)) {
      this.loading.set(id, load().then((Renderer) => {
        this.types.set(id, Renderer);
        return true;
      }, () => false).finally(() => this.loading.delete(id)));
    }
    return this.loading.get(id);
  }

  /** Show a world (built now, if it has not been): true if it is on show. */
  show(id) {
    if (this.disposed) return false;
    if (!this.worlds.has(id)) {
      const Renderer = this.types.get(id);
      if (!Renderer) return false;
      // (one other world kept at a time)
      for (const [other, renderer] of this.worlds) {
        if (other === 'castleward') continue;
        renderer.dispose?.();
        this.worlds.delete(other);
      }
      try {
        this.worlds.set(id, new Renderer(this.scene));
      } catch (error) {
        console.warn(`The round could not move on to ${id}:`, error);
        return false;
      }
    }
    for (const [other, renderer] of this.worlds) if (renderer.group) renderer.group.visible = other === id;
    this.activeId = id;
    this.#light(this.worlds.get(id).lighting);
    this.#compile(this.scene, { wait: true });
    return true;
  }

  /** Whether a world just shown is still having its shaders compiled (the round keeps the dark until it is not). */
  get busy() {
    return this.holding > 0;
  }

  /** Ready something not yet on show to be drawn without a stall (its shaders compiled now, as if it were seen). */
  warm(object) {
    if (!object) return;
    const shown = object.visible;
    object.visible = true;
    this.#compile(object);
    object.visible = shown;
  }

  // (with `wait`: the dark is kept for a few drawn frames more, for the first of them to finish the shaders the browser
  // only links when they are first drawn; compileAsync would wait for them instead, but three.js stumbles over some of
  // a world's materials there and never resolves)
  #compile(object, { wait = false } = {}) {
    try {
      this.renderer?.compile?.(object, this.camera, this.scene);
    } catch {
      // (a renderer that cannot compile ahead simply compiles on first sight)
    }
    if (wait) this.holding = 3;
  }

  // a world's light, sky and fog, as the game draws it in (GameRuntime applyLighting)
  #light(lighting) {
    if (!lighting) return;
    this.scene.background = new THREE.Color(lighting.background);
    this.scene.fog = new THREE.FogExp2(lighting.fog.color, lighting.fog.density);
    this.hemisphere.color.set(lighting.hemisphere.skyColor);
    this.hemisphere.groundColor.set(lighting.hemisphere.groundColor);
    this.hemisphere.intensity = lighting.hemisphere.intensity;
    this.sun.color.set(lighting.sun.color);
    this.sun.intensity = lighting.sun.intensity;
    this.camera.far = lighting.cameraFar ?? 180;
    this.camera.updateProjectionMatrix();
  }

  update(timeSec, camera, dt) {
    this.active?.update?.(timeSec, camera, dt);
    // (one more frame drawn in the dark)
    if (this.holding > 0) this.holding -= 1;
  }

  dispose() {
    this.disposed = true;
    for (const [id, renderer] of this.worlds) if (id !== 'castleward') renderer.dispose?.();
    this.worlds.clear();
  }
}
