// Browser integration check against the real exported skeleton and skinned boots.
// From a local game preview: await (await import('/client/game/spellbladeContact.browser.mjs')).checkSoleContacts()
import * as THREE from 'three';
import { createSpellbladeAsset } from './SpellbladeAssets.mjs';
import { crouchPose, guardTurns } from './spellbladeMotion.mjs';

export async function checkSoleContacts() {
  const instance = await createSpellbladeAsset();
  const report = [];
  try {
    for (const [clip, crouched] of [['Idle', false], ['Idle', true], ['Run', false], ['Run', true], ['Sprint', false], ['Sprint', true], ['Guard', false]]) {
      let min = Infinity;
      let max = -Infinity;
      // Complete the transition before sampling this clip. Zero dt alone would keep the outgoing
      // action's weight and measure the previous pose instead of the requested animation.
      for (let settle = 0; settle < 4; settle += 1) instance.animator.apply({ clip, loop: true, time: 0 }, .1);
      for (let i = 0; i < 80; i += 1) {
        const moving = clip === 'Run' || clip === 'Sprint';
        const crouch = crouchPose(crouched ? 1 : 0, moving);
        instance.animator.gaitPhase = i / 80;
        instance.animator.apply({
          clip, loop: true, time: i / 80 * instance.animator.actions.get(clip).getClip().duration,
          motion: { crouch: crouch.flex, extra: [...crouch.turns, ...guardTurns(clip === 'Guard' ? 1 : 0)] },
        }, 0);
        instance.root.updateMatrixWorld(true);
        let low = Infinity;
        instance.root.traverse((object) => {
          if (!object.isSkinnedMesh || !/^Boot/.test(object.name)) return;
          object.skeleton.update();
          const vertex = new THREE.Vector3();
          for (let j = 0; j < object.geometry.attributes.position.count; j += 1) {
            object.getVertexPosition(j, vertex).applyMatrix4(object.matrixWorld);
            low = Math.min(low, vertex.y);
          }
        });
        min = Math.min(min, low);
        max = Math.max(max, low);
      }
      if (!(min >= -.004 && max <= .012)) throw new Error(`${clip}, crouched=${crouched}: sole range ${min}..${max}`);
      report.push({ clip, crouched, min, max });
    }
    return report;
  } finally {
    instance.dispose();
  }
}
