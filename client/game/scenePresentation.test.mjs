import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_PRESENTATION } from './scenePresentation.mjs';

function channel(hex, shift) {
  return ((hex >> shift) & 0xff) / 255;
}

function valueLuminance(hex) {
  return channel(hex, 16) * 0.2126 + channel(hex, 8) * 0.7152 + channel(hex, 0) * 0.0722;
}

test('neutral medieval stone separates clearly from night background and fog', () => {
  const background = valueLuminance(SCENE_PRESENTATION.background);
  const fog = valueLuminance(SCENE_PRESENTATION.fogColor);
  const stone = valueLuminance(SCENE_PRESENTATION.materials.stone);
  const stoneTop = valueLuminance(SCENE_PRESENTATION.materials.stoneTop);

  assert.ok(stone - background >= 0.16, `stone/background separation is only ${(stone - background).toFixed(3)}`);
  assert.ok(stoneTop - fog >= 0.18, `stone-top/fog separation is only ${(stoneTop - fog).toFixed(3)}`);
  assert.ok(SCENE_PRESENTATION.fogDensity <= 0.012, 'fog should shape distance without swallowing the compact arena');
});

test('base illumination supports combat readability without making sorcery the ambient light source', () => {
  assert.ok(SCENE_PRESENTATION.hemisphere.intensity >= 2.2);
  assert.ok(SCENE_PRESENTATION.moon.intensity >= 3.0);
  assert.ok(SCENE_PRESENTATION.torches.intensity >= 6.5);
  assert.ok(SCENE_PRESENTATION.torches.distance >= 6);

  const ground = valueLuminance(SCENE_PRESENTATION.hemisphere.groundColor);
  const background = valueLuminance(SCENE_PRESENTATION.background);
  assert.ok(ground > background, 'warm ground fill should lift masonry shadows above the void');
});

test('base masonry stays neutral/warm instead of inheriting cyan-violet magic coloration', () => {
  for (const key of ['stone', 'stoneTop', 'darkStone', 'rubble', 'westStone', 'eastStone']) {
    const hex = SCENE_PRESENTATION.materials[key];
    const r = channel(hex, 16);
    const g = channel(hex, 8);
    const b = channel(hex, 0);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    assert.ok(spread <= 0.09, `${key} is too chromatic for base masonry: spread=${spread.toFixed(3)}`);
  }
});
