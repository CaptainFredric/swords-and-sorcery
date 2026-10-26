import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportHtml5 } from '../export-html5.mjs';
import { validateArchive, validateCompatibilitySources } from './archive.mjs';
import { sealCandidate, validateCandidate } from './candidate.mjs';
import { validateEnvironment } from './environment.mjs';
import { createGameServer } from '../../server/src/server.mjs';
import { checkServer } from './server-check.mjs';

const revision = 'd'.repeat(40);
test('real ZIP validates hashes, seals browser proof, rejects failed proof and corrupted contents', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ss-candidate-test-'));
  try {
    const report = await exportHtml5({ out: directory, revision });
    assert.equal((await validateArchive(directory, { revision, checksum: report.sha256 })).files, report.files);
    const browser = { passed: true, revision, sha256: report.sha256, checks: Object.fromEntries(['menu','assets','practice','movement','sword','guard','fireball','leave','tutorial','mobileLookAndMove'].map(key => [key, true])) };
    await writeFile(path.join(directory, 'browser-check.json'), JSON.stringify({ ...browser, passed: false }));
    await assert.rejects(sealCandidate(directory), /browser verification/);
    await writeFile(path.join(directory, 'browser-check.json'), JSON.stringify(browser));
    await sealCandidate(directory, { GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' });
    await validateCandidate(directory, { revision, checksum: report.sha256, runId: '123', runAttempt: '1' });
    await assert.rejects(validateCandidate(directory, { revision, checksum: report.sha256, runId: '124' }), /provenance/);
    await assert.rejects(validateArchive(directory, { revision: 'a'.repeat(40) }), /revision/);
    await writeFile(path.join(directory, 'browser-check.json'), JSON.stringify({ ...browser, checks: {} }));
    await assert.rejects(validateCandidate(directory), /evidence/);
    await writeFile(path.join(directory,'export-report.json'),JSON.stringify({...report,entries:report.entries.map((entry,i)=>i===0?{...entry,sha256:'e'.repeat(64)}:entry)}));
    await assert.rejects(validateArchive(directory), /content mismatch/);
    await writeFile(path.join(directory,'export-report.json'),JSON.stringify({...report,compatibilitySources:[]}));
    await assert.rejects(validateArchive(directory), /missing or empty compatibilitySources/);
    await writeFile(path.join(directory,'export-report.json'),JSON.stringify({...report,compatibilitySources:[{path:'shared/sim/Room.mjs',size:10,sha256:'bad'}]}));
    await assert.rejects(validateArchive(directory), /Malformed compatibility source entry/);
    await writeFile(path.join(directory,'export-report.json'),JSON.stringify(report));
    const bytes = await readFile(report.zip); bytes[20] ^= 1; await writeFile(report.zip, bytes);
    await assert.rejects(validateArchive(directory), /checksum/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('protected environment requires reviewer and exact main only branch restriction', () => {
  const environment = { protection_rules: [{ type: 'required_reviewers', reviewers: [{}] }], deployment_branch_policy: { custom_branch_policies: true } };
  const policies = { branch_policies: [{ name: 'main', type: 'branch' }] };
  validateEnvironment(environment, policies);
  assert.throws(() => validateEnvironment({ ...environment, protection_rules: [] }, policies), /reviewer/);
  for (const bad of [{ branch_policies: [{ name: '*', type: 'branch' }] }, { branch_policies: [{ name: 'main', type: 'tag' }] }, { branch_policies: [...policies.branch_policies, { name: 'other', type: 'branch' }] }]) assert.throws(() => validateEnvironment(environment, bad), /main/);
});

test('compatibility exercises authoritative commands and reconnect; source mismatch blocks before play', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ss-server-release-test-'));
  const game = createGameServer({ host: '127.0.0.1', port: 0 });
  try {
    await exportHtml5({ out: directory, revision });
    await game.start(); const base = `http://127.0.0.1:${game.address().port}`;
    const report = await checkServer(directory, { base, attempts: 1 });
    assert(report.passed && report.sourcesMatched > 50 && report.session.reconnect && report.session.cast);
    const original = globalThis.fetch;
    globalThis.fetch = (url, options) => String(url).endsWith('/shared/sim/wire.mjs') ? Promise.resolve(new Response('incompatible serializer')) : original(url, options);
    try { await assert.rejects(checkServer(directory, { base, attempts: 1 }), /compatibility mismatch/); }
    finally { globalThis.fetch = original; }
  } finally { await game.stop(); await rm(directory, { recursive: true, force: true }); }
});

test('validateCompatibilitySources enforces nonempty inventory, path safety, and required sources', () => {
  const validEntry = (path) => ({ path, size: 1024, sha256: 'a'.repeat(64) });
  const validList = [
    validEntry('shared/sim/Room.mjs'),
    validEntry('shared/sim/BotController.mjs'),
    validEntry('shared/sim/StPerry.mjs'),
    validEntry('client/network/GameSocket.mjs'),
  ];
  assert.equal(validateCompatibilitySources(validList).size, 4);
  assert.throws(() => validateCompatibilitySources(null), /missing or empty/);
  assert.throws(() => validateCompatibilitySources([]), /missing or empty/);
  assert.throws(() => validateCompatibilitySources([validEntry('shared/sim/Room.mjs')]), /Missing authoritative/);
  assert.throws(() => validateCompatibilitySources([...validList, { path: 'shared/sim/Other.mjs', size: -1, sha256: 'a'.repeat(64) }]), /Malformed/);
  assert.throws(() => validateCompatibilitySources([...validList, { path: 'shared/sim/Other.mjs', size: 10, sha256: 'short' }]), /Malformed/);
  assert.throws(() => validateCompatibilitySources([...validList, { path: '../evil.mjs', size: 10, sha256: 'a'.repeat(64) }]), /Invalid/);
  assert.throws(() => validateCompatibilitySources([...validList, { path: 'client/main.mjs', size: 10, sha256: 'a'.repeat(64) }]), /Invalid/);
  assert.throws(() => validateCompatibilitySources([...validList, validEntry('shared/sim/Room.mjs')]), /Duplicate/);
});
