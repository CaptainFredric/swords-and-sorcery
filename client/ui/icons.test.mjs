import test from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, iconSvg } from './icons.mjs';
import { SPELLS } from '../../shared/src/spells.mjs';
import { registry } from '../settings/settingsRegistry.mjs';

test('one icon set: every spell, the gauntlet and every touch action has its drawing', () => {
  for (const id of [...Object.keys(SPELLS), 'gauntlet', 'dash', 'attack', 'guard', 'jump', 'sprint', 'crouch']) {
    assert.ok(ICONS[id]?.startsWith('<path'), `${id} has an icon`);
  }
  assert.notEqual(ICONS.steel, ICONS.guard, 'Steel is not the Guard\'s shield');
  assert.match(iconSvg('gale'), /^<svg viewBox="0 0 24 24"/);
  assert.equal(iconSvg('nothing'), iconSvg('fireball'), 'an unknown name falls back');
});

test('the gauntlet\'s own key and touch button are there for whoever wants them, and off by default', () => {
  assert.deepEqual(registry.actions.get('gauntlet').keys, [], 'unbound');
  assert.equal(registry.settings.get('controls.touchGauntlet').default, false, 'no button unless asked for');
});

test('every ultimate has its drawing, each its own', async () => {
  const { ULTIMATES } = await import('../../shared/src/ultimates.mjs');
  for (const id of Object.keys(ULTIMATES)) assert.ok(ICONS[id]?.startsWith('<path'), `${id} has an icon`);
  assert.notEqual(ICONS.vortex, ICONS.sunder);
  assert.equal(iconSvg('no-such-ultimate', 'sunder'), iconSvg('sunder'));
  assert.deepEqual(registry.settings.get('loadout.ultimate').options.map((option) => option.value), Object.keys(ULTIMATES));
  assert.equal(registry.settings.get('loadout.ultimate').default, 'sunder');
});
