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

async function moduleLoader() {
  try {
    return await import('./spellbladeAssetContract.mjs');
  } catch (error) {
    assert.fail(`Spellblade asset contract module unavailable: ${error.message}`);
  }
}

async function loader() {
  const module = await moduleLoader();
  return module.loadSpellbladeContract;
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

test('runtime manifest cache-busts both production GLBs with the reviewed source revision', async () => {
  const module = await moduleLoader();
  assert.equal(typeof module.runtimeSpellbladeManifest, 'function');

  const contract = module.loadSpellbladeContract(VALID);
  const revision = 'a'.repeat(40);
  const runtime = module.runtimeSpellbladeManifest(contract, { sourceRevision: revision });

  assert.equal(runtime.sourceRevision, revision);
  assert.match(runtime.thirdPerson.url, /spellblade\.glb\?v=a{40}$/);
  assert.match(runtime.firstPerson.url, /spellblade-fp\.glb\?v=a{40}$/);
  assert.deepEqual(runtime.mutableMaterials, ['VisorGlow', 'SorceryAccent']);
  assert.ok(Object.isFrozen(runtime));
});

test('runtime manifest rejects missing or non-SHA source revisions', async () => {
  const module = await moduleLoader();
  assert.equal(typeof module.runtimeSpellbladeManifest, 'function');
  const contract = module.loadSpellbladeContract(VALID);

  for (const sourceRevision of ['', 'abc123', 'g'.repeat(40), 'a'.repeat(39), 'a'.repeat(41)]) {
    assert.throws(() => module.runtimeSpellbladeManifest(contract, { sourceRevision }), /40|revision|sha/i);
  }
});
