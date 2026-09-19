import * as THREE from 'three';
import { WorldRenderer } from '../game/WorldRenderer.mjs';
import { SCENE_PRESENTATION } from '../game/scenePresentation.mjs';

function disposeMaterial(material) {
  if (Array.isArray(material)) {
    for (const item of material) item?.dispose?.();
  } else {
    material?.dispose?.();
  }
}

export class ShatteredKeepRenderer extends WorldRenderer {
  constructor(scene) {
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    scene.background = new THREE.Color(SCENE_PRESENTATION.background);
    scene.fog = new THREE.FogExp2(SCENE_PRESENTATION.fogColor, SCENE_PRESENTATION.fogDensity);
    super(scene);
    this.previousBackground = previousBackground;
    this.previousFog = previousFog;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      object.geometry?.dispose?.();
      disposeMaterial(object.material);
    });
    this.scene.background = this.previousBackground;
    this.scene.fog = this.previousFog;
  }
}
