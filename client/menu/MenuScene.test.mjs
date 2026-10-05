import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source() {
  return readFile(new URL('./MenuScene.mjs', import.meta.url), 'utf8');
}

test('menu showcase opens on the Spellblade visor side instead of its back', async () => {
  const text = await source();
  const frontYawAssignments = text.match(/this\.targetYaw\s*=\s*Math\.PI\s*-\s*0\.22/g) || [];
  assert.ok(frontYawAssignments.length >= 2, 'initial and reset menu views should both face the visor toward the camera');
});

test('menu showcase presents the hero sword on an upward diagonal instead of dropping it below frame', async () => {
  const text = await source();
  const match = text.match(/rig\.sword\.rotation\.z\s*=\s*(-?[\d.]+)/);
  assert.ok(match, 'menu showcase should explicitly pose the shared hero sword');
  const angle = Number(match[1]);
  assert.ok(angle > -1.15 && angle < -0.35, `menu sword angle ${angle} should lift the blade into the stage`);
});

test('the Armory\'s ultimates are performed with the menu\'s one set of effects, and any other choice puts one away', async () => {
  const text = await source();
  // one Effects for the menu (its lights are part of every lit shader): the round is given it, not a second
  assert.equal((text.match(/new Effects\(/g) || []).length, 1);
  assert.match(text, /new TourDirector\(\{[^\n]*effects: this\.#effects\(\)/);
  // ...and the menu moves them on every frame, the round's fights included (the round leaves them to it)
  assert.match(text, /\n    this\.effects\?\.update\(dt\);/);
  const tour = await readFile(new URL('./tour/TourDirector.mjs', import.meta.url), 'utf8');
  assert.match(tour, /if \(this\.ownsEffects\) this\.effects\.update\(dt\)/);
  // showing anything else in the palm (another card, another screen) ends the performance
  const showSpell = text.slice(text.indexOf('  showSpell(spell) {'));
  assert.match(showSpell.slice(0, 400), /this\.showcase\.stop\(\)/);
  // and a performance brings its own sounds in place of the card's cue (main.mjs)
  const main = await readFile(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /play: \(id\) => \(menuScene\?\.performs\(id\) \? null : playArmorySound\(sound, id\)\)/);
});
