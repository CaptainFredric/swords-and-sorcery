import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// What a fight's effects cost the renderer. In three.js the number of lights in a scene is part of every lit
// material's shader: a light added, taken away or hidden mid-fight rebuilds them all (a hitch of a tenth of a second
// on a desktop; worse on a phone). So the fight's brief lights come from a fixed pool (lightPool.mjs), and nothing
// that can be hidden carries a light. Read from the sources (three.js is the browser's here).

const source = (name) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('the effects make point lights only for their fixed pool: never one per flash, projectile or gathering palm', () => {
  const effects = source('./Effects.mjs');
  const made = [...effects.matchAll(/new THREE\.PointLight\(/g)].length;
  assert.equal(made, 1, 'the pool\'s, made once');
  assert.match(effects, /new LightPool\(LIGHT_POOL_SIZE/);
  assert.doesNotMatch(effects, /scene\.remove\([^)]*light/i, 'no light is ever taken out of the scene');
});

test('the palm\'s light is never hidden with the arms: a marker on the hand, the light itself on the camera', () => {
  const weapon = source('./WeaponView.mjs');
  assert.doesNotMatch(weapon, /this\.magicLight = new THREE\.PointLight/);
  assert.match(weapon, /this\.palmLight = everywhere\(new THREE\.PointLight/);
  assert.match(weapon, /camera\.add\(this\.palmLight\)/);
  assert.match(source('./GameRuntime.mjs'), /this\.weapon\.syncPalmLight\(\);\n\s*this\.#renderView\(\);/);
});

test('a thrown spell\'s orb and the blast of its breaking keep their shaders built between one and the next', () => {
  const effects = source('./Effects.mjs');
  assert.match(effects, /this\.warmOrbs \?\?= \['fireball', 'frostfire'\]\.map/);
  assert.match(effects, /this\.warmBlast \?\?= new THREE\.Mesh\(this\.blastFrontGeometry, createBlastFrontMaterial/);
});
