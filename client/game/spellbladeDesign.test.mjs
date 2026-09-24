import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPELLBLADE_PALETTE,
  SPELLBLADE_PROPORTIONS,
  SPELLBLADE_SWORD,
  REQUIRED_SPELLBLADE_RIG_KEYS,
} from './spellbladeDesign.mjs';

test('Spellblade proportions encode the concept silhouette', () => {
  assert.ok(SPELLBLADE_PROPORTIONS.shoulderSpan > SPELLBLADE_PROPORTIONS.chestTopWidth);
  assert.ok(SPELLBLADE_PROPORTIONS.chestTopWidth > SPELLBLADE_PROPORTIONS.waistWidth);
  assert.ok(SPELLBLADE_PROPORTIONS.bootWidth > SPELLBLADE_PROPORTIONS.shinWidth);
  assert.ok(SPELLBLADE_PROPORTIONS.visorWidth > SPELLBLADE_PROPORTIONS.helmetWidth * 0.55);
  assert.ok(SPELLBLADE_SWORD.bladeLength > SPELLBLADE_PROPORTIONS.bodyHeight * 0.55);
});

test('base palette keeps cyan, crimson, steel and brass roles distinct', () => {
  assert.notEqual(SPELLBLADE_PALETTE.magic, SPELLBLADE_PALETTE.cloth);
  assert.notEqual(SPELLBLADE_PALETTE.trim, SPELLBLADE_PALETTE.armor);
  assert.notEqual(SPELLBLADE_PALETTE.darkArmor, SPELLBLADE_PALETTE.armorLight);
});

test('rig contract keeps every pivot used by the current animation/menu code', () => {
  for (const key of ['visual', 'pelvis', 'torso', 'head', 'visor', 'sword', 'magicAnchor', 'tabardFront', 'tabardBack']) {
    assert.ok(REQUIRED_SPELLBLADE_RIG_KEYS.includes(key));
  }
  assert.equal(new Set(REQUIRED_SPELLBLADE_RIG_KEYS).size, REQUIRED_SPELLBLADE_RIG_KEYS.length);
});
