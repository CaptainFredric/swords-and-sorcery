import test from 'node:test';
import assert from 'node:assert/strict';

const VALID = {
  version: 1,
  facing: '-Z',
  up: '+Y',
  unitMeters: 1,
  clips: ['Idle', 'Run', 'Air', 'Guard', 'Slash_1', 'Slash_2', 'Slash_3', 'Cast', 'Dash', 'Stagger', 'Death'],
  sockets: ['socket_sword', 'socket_sorcery'],
  mutableMaterials: ['VisorGlow', 'SorceryAccent'],
  thirdPerson: { maxTriangles: 35000, targetBytes: 2000000 },
  firstPerson: { maxTriangles: 16000, targetBytes: 1000000 },
};

async function loader() {
  try {
    const module = await import('./spellbladeAssetContract.mjs');
    return module.loadSpellbladeContract;
  } catch (error) {
    assert.fail(`Spellblade asset contract module unavailable: ${error.message}`);
  }
}

test('normalizes and freezes the Spellblade asset contract', async () => {
  const loadSpellbladeContract = await loader();
  const value = loadSpellbladeContract(VALID);
  assert.equal(value.facing, '-Z');
  assert.equal(value.up, '+Y');
  assert.equal(value.unitMeters, 1);
  assert.deepEqual(value.sockets, ['socket_sword', 'socket_sorcery']);
  assert.ok(Object.isFrozen(value));
  assert.ok(Object.isFrozen(value.clips));
  assert.ok(Object.isFrozen(value.thirdPerson));
});

test('rejects a contract that drops a timing-critical clip', async () => {
  const loadSpellbladeContract = await loader();
  assert.throws(
    () => loadSpellbladeContract({ ...VALID, clips: VALID.clips.filter((name) => name !== 'Slash_3') }),
    /Slash_3/,
  );
});

test('rejects wrong runtime axis conventions', async () => {
  const loadSpellbladeContract = await loader();
  assert.throws(() => loadSpellbladeContract({ ...VALID, facing: '+Z' }), /-Z/);
  assert.throws(() => loadSpellbladeContract({ ...VALID, up: '+Z' }), /\+Y/);
});
