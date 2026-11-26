import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {siegeArmoryView} from './siegeArmoryView.mjs';

test('Drag-oon is a reserved Workshop concept, not a selectable machine', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const nav = html.match(/<nav class="siege-machine-nav"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, 'Workshop machine navigation exists');
  assert.deepEqual([...nav.matchAll(/data-siege-tab="([^"]+)"/g)].map(match => match[1]), ['soFist', 'biBye', 'fightFlight']);
  assert.match(nav, /<div class="siege-tab-future" id="siege-future-drag-oon"[^>]*>[\s\S]*?DRAG-OON[\s\S]*?FUTURE CONCEPT[\s\S]*?<\/div>/);
  assert.equal(siegeArmoryView().length, 3);
  assert.ok(!siegeArmoryView().some(machine => /drag.?oon/i.test(machine.id)));
});
