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
    scene.background = new THREE.Color(SCENE_PRESENTATION.background);
    scene.fog = new THREE.FogExp2(SCENE_PRESENTATION.fogColor, SCENE_PRESENTATION.fogDensity);
    super(scene);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((object) => {
      object.geometry?.dispose?.();
      disposeMaterial(object.material);
    });
  }
}
