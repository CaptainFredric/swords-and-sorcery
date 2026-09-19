import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_MODES, getModePolicy } from './modes.mjs';
import { WORLD_IDS, getWorld } from '../worlds/registry.mjs';

test('FFA preserves current start and win rules', () => {
  const mode = getModePolicy(GAME_MODES.FFA);
  assert.equal(mode.minHumansToStart, 2);
  assert.equal(mode.scoreToWin, 10);
  assert.equal(mode.matchSeconds, 360);
  assert.equal(mode.autoStart, false);
});

test('unknown modes and worlds fail explicitly', () => {
  assert.throws(() => getModePolicy('NOPE'), /Unknown game mode/);
  assert.throws(() => getWorld('NOPE'), /Unknown world/);
  assert.equal(WORLD_IDS.SHATTERED_KEEP, 'shattered-keep');
});
