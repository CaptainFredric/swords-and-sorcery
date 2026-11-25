import test from 'node:test';
import assert from 'node:assert/strict';
import { HIDDEN_SCALE, guardScaleHiddenProps } from './scaleHiddenProps.mjs';

// (three.js isn't installed for the node tests: a mesh here is what the guard touches, and its two update methods)
function mesh(name, skinned = true) {
  const scale = { x: 1, y: 1, z: 1, setScalar(v) { this.x = v; this.y = v; this.z = v; } };
  const calls = [];
  return {
    name, isSkinnedMesh: skinned, visible: true, userData: {}, scale, calls,
    updateMatrixWorld() { calls.push(['matrix', this.scale.x]); },
    updateWorldMatrix() { calls.push(['world', this.scale.x]); },
  };
}
const knight = (...meshes) => ({ traverse(visit) { meshes.forEach(visit); } });
const clip = (track) => ({ tracks: [{ name: track }] });

test('a prop its clips scale to nothing is held just above nothing, and not drawn', () => {
  const flag = mesh('WhiteFlagProp');
  const body = mesh('Body');
  const guarded = guardScaleHiddenProps(knight(flag, body), [clip('WhiteFlagProp.scale'), clip('hand_L.quaternion')]);
  assert.deepEqual(guarded.map((m) => m.name), ['WhiteFlagProp'], 'only the meshes a clip scales');
  // a clip hides it: before its world matrix is built (and inverted for the skin), it is made invertible
  flag.scale.setScalar(0);
  flag.updateMatrixWorld(true);
  flag.updateWorldMatrix(true, false);
  assert.deepEqual(flag.calls.slice(-2), [['matrix', HIDDEN_SCALE], ['world', HIDDEN_SCALE]]);
  assert.equal(flag.visible, false);
  // its own clip brings it back: drawn again
  flag.scale.setScalar(1);
  flag.updateMatrixWorld(true);
  assert.equal(flag.visible, true);
});

test('a mesh something else hid stays hidden', () => {
  const flag = mesh('WhiteFlagProp');
  guardScaleHiddenProps(knight(flag), [clip('WhiteFlagProp.scale')]);
  flag.visible = false;
  flag.updateMatrixWorld(true);
  assert.equal(flag.visible, false, 'full size but hidden by the first person view: left hidden');
});
