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
