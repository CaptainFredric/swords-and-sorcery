import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// My own arms are drawn in a pass of their own (viewLayers.mjs). Held to the source: every light the arena makes is
// made through everywhere(), or the arms would go unlit by it; and nothing pulls the arms toward the eye any more.

const here = new URL('.', import.meta.url);
const sources = [
  ...readdirSync(here).filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).map((name) => new URL(name, here)),
  ...readdirSync(new URL('../worlds/', here)).filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).map((name) => new URL(`../worlds/${name}`, here)),
];

test('every light the arena makes lights my own arms too', () => {
  let lights = 0;
  for (const url of sources) {
    const text = readFileSync(url, 'utf8');
    for (const match of text.matchAll(/new THREE\.(PointLight|DirectionalLight|HemisphereLight|AmbientLight|SpotLight)\(/g)) {
      lights += 1;
      const before = text.slice(Math.max(0, match.index - 11), match.index);
      // (the palm's own light rides on the arms: onViewLayer puts it on every layer each frame)
      const onTheArms = url.pathname.endsWith('/WeaponView.mjs');
      assert.ok(before === 'everywhere(' || onTheArms, `${url.pathname.split('/').pop()}: a ${match[1]} not made through everywhere()`);
    }
  }
  assert.ok(lights >= 8, `found the arena's lights (${lights})`);
});

test('the arms are drawn over the world in their own pass, and nothing draws them back toward the eye', () => {
  const runtime = readFileSync(new URL('./GameRuntime.mjs', here), 'utf8');
  assert.match(runtime, /renderer\.clearDepth\(\)/, 'the world\'s depth is cleared before the arms are drawn');
  assert.match(runtime, /camera\.layers\.set\(VIEW_LAYER\)/);
  const weapon = readFileSync(new URL('./WeaponView.mjs', here), 'utf8');
  assert.match(weapon, /onViewLayer\(this\.group\)/);
  assert.doesNotMatch(weapon, /bladeRetract|nextRetraction/, 'no retraction left');
});
