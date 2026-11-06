import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_EMBLEM, EMBLEMS, LEGACY_EMBLEM, canonicalEmblemId, ownedEmblems, emblemChoice, isEmblem } from './heraldry.mjs';

test('Grimoirelee is the one institutional default and trident is a non-selectable legacy alias', () => {
  assert.equal(DEFAULT_EMBLEM, 'grimoirelee');
  assert.equal(LEGACY_EMBLEM, 'trident');
  assert.equal(EMBLEMS.grimoirelee.name, 'Grimoirelee');
  assert.ok(!Object.hasOwn(EMBLEMS, 'trident'));
  assert.equal(canonicalEmblemId('trident'), 'grimoirelee');
  assert.equal(emblemChoice('trident'), EMBLEMS.grimoirelee);
  assert.equal(emblemChoice('unknown'), EMBLEMS.grimoirelee);
  assert.equal(isEmblem('trident'), true); // safe with old saved profiles/clients
  assert.equal(isEmblem('unknown'), false);
});

test('earned heralds retain identity and ownership; Grimoirelee remains free', () => {
  const earned = ownedEmblems({ completed: { seize_thy_slayer: 1, st_perry_the_plain: 2 } });
  assert.deepEqual(earned, ['grimoirelee', 'seize_thy_slayer', 'st_perry_the_plain']);
  assert.deepEqual(ownedEmblems({ completed: {} }), ['grimoirelee']);
  assert.ok(EMBLEMS.seize_thy_slayer.banners.CapeBanner.includes('seize-thy-slayer'));
  assert.ok(EMBLEMS.st_perry_the_plain.banners.KitBanner.includes('st-perry-the-plain'));
});

test('master, app icon and world standard use the identical approved vector contours', () => {
  const base = new URL('../../client/assets/heraldry/', import.meta.url);
  const read = name => readFileSync(new URL(name, base), 'utf8');
  const [master, icon, standard] = ['grimoirelee.svg', 'grimoirelee-app-icon.svg', 'grimoirelee-standard.svg'].map(read);
  const contours = svg => svg.match(/<g fill="url\(#gold\)" fill-rule="evenodd"><path d="([^"]+)"\/><\/g>/)?.[1];
  assert.ok(contours(master));
  assert.equal(contours(icon), contours(master));
  assert.equal(contours(standard), contours(master));
  assert.equal((contours(master).match(/M\d+,\d+/g) ?? []).length, 16);
  assert.match(master, /viewBox="120 70 700 1120"/);
  assert.equal(EMBLEMS.grimoirelee.art, '/client/assets/heraldry/grimoirelee.svg');
});
