import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRun, publicationPlan, butlerStatus, invokeButler } from './policy.mjs';
import { archiveWarnings } from '../export-html5.mjs';

const sha = 'a'.repeat(40), hash = 'b'.repeat(64);
const run = { id: 123, head_sha: sha, head_branch: 'main', event: 'push', conclusion: 'success', path: '.github/workflows/itch-candidate.yml', repository: { full_name: 'CaptainFredric/swords-and-sorcery' } };
const candidate = { revision: sha, sha256: hash, runId: '123' };
const options = { ref: 'refs/heads/main', event: 'workflow_dispatch', approved: true, channelReady: true, operation: 'release', key: 'test-only', candidate, current: { userVersion: `sha-${'c'.repeat(40)}` }, isAncestor: () => true };

test('candidate provenance rejects PR, failed, foreign, wrong revision and wrong workflow runs', () => {
  validateRun(run, { runId: '123', revision: sha });
  for (const bad of [{ event: 'pull_request' }, { conclusion: 'failure' }, { head_branch: 'experiment' }, { head_sha: 'c'.repeat(40) }, { path: '.github/workflows/ci.yml' }, { repository: { full_name: 'other/repo' } }, { id: 124 }]) {
    assert.throws(() => validateRun({ ...run, ...bad }, { runId: '123', revision: sha }));
  }
});
test('publication fails closed before any Butler call for missing approval, secret, main or migration setup', () => {
  for (const bad of [{ approved: false }, { key: '' }, { ref: 'refs/heads/experiment' }, { event: 'push' }, { channelReady: false }, { candidate: { ...candidate, revision: '../main' } }]) assert.throws(() => publicationPlan({ ...options, ...bad }));
});
test('duplicate and stale versions are rejected; rollback needs a reason and an older ancestor', () => {
  assert.throws(() => publicationPlan({ ...options, current: { userVersion: `sha-${sha}` } }), /already/);
  assert.throws(() => publicationPlan({ ...options, isAncestor: () => false }), /older|diverged/);
  assert.throws(() => publicationPlan({ ...options, current: { userVersion: 'unknown' } }), /unrecognized/);
  assert.throws(() => publicationPlan({ ...options, operation: 'rollback', reason: '' }), /reason/);
  const rollback = publicationPlan({ ...options, operation: 'rollback', reason: 'Restore last verified controls', isAncestor: (a) => a === sha });
  assert.equal(rollback.hidden, false);
});
test('migration creates only a hidden absent channel and never overwrites the manual upload', () => {
  const plan = publicationPlan({ ...options, operation: 'migrate', current: null, channelReady: false });
  assert.equal(plan.hidden, true);
  assert.equal(plan.target, 'captainfredric/swords-and-sorcery:html5');
  assert.throws(() => publicationPlan({ ...options, operation: 'migrate' }), /exists/);
  assert.throws(() => publicationPlan({ ...options, current: null }), /migration/);
});
test('simulated Butler command uses fixed target, immutable version, exact ZIP and no key argument', () => {
  const plan = publicationPlan(options), calls = [];
  invokeButler('butler', plan, '/verified/build.zip', { runner: (file, args, opts) => { calls.push({ file, args, opts }); return ''; }, key: 'test-only' });
  assert.deepEqual(calls[0].args, ['push', '/verified/build.zip', 'captainfredric/swords-and-sorcery:html5', '--userversion', `sha-${sha}`, '--json']);
  assert.equal(calls[0].opts.env.BUTLER_API_KEY, 'test-only');
  assert(!calls[0].args.includes('test-only'));
});
test('Butler JSON status requires one well formed result and refuses pending/failed state', () => {
  const json = JSON.stringify({ type: 'result', value: { channels: [{ name: 'html5', head: { state: 'completed', userVersion: `sha-${sha}` } }] } });
  assert.equal(butlerStatus(json).userVersion, `sha-${sha}`);
  assert.equal(butlerStatus(JSON.stringify({ type: 'result', value: { channels: [] } })), null);
  for (const text of ['', 'not json', JSON.stringify({ type: 'result', value: { channels: [{ name: 'html5', pending: { state: 'processing' } }] } })]) assert.throws(() => butlerStatus(text));
});
test('archive budget warns before hard failure without deleting any assets', () => {
  assert.equal(archiveWarnings(899).length, 0);
  assert.match(archiveWarnings(950)[0], /950.*1000/);
});

test('publishing entry point rejects wrong ref, missing approval and missing secret without starting a push', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const overrides of [{ GITHUB_REF: 'refs/heads/experiment' }, { RELEASE_APPROVED: 'false' }, { BUTLER_API_KEY: '' }]) {
    const child = spawnSync(process.execPath, ['scripts/release/publish.mjs'], { cwd: new URL('../../', import.meta.url), encoding: 'utf8', env: { ...process.env, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_APPROVED: 'true', BUTLER_API_KEY: '', ...overrides } });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /manual approval|BUTLER_API_KEY/);
    assert.doesNotMatch(child.stderr, /Butler push failed|gh api/);
  }
});

test('candidate workflow has no publication credentials and publication depends on preflight and protected environment', async () => {
  const { readFile } = await import('node:fs/promises');
  const candidate = await readFile(new URL('../../.github/workflows/itch-candidate.yml', import.meta.url), 'utf8');
  const publish = await readFile(new URL('../../.github/workflows/itch-publish.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(candidate, /BUTLER_API_KEY|publish\.mjs/);
  assert.match(candidate, /dry-run\.mjs/);
  assert(candidate.indexOf('Verify repository') < candidate.indexOf('Export the exact'));
  assert(candidate.indexOf('Seal verified candidate') < candidate.indexOf('Preserve verified ZIP'));
  assert.match(publish, /needs: preflight/);
  assert.match(publish, /environment: itch-release/);
  assert.match(publish, /cancel-in-progress: false/);
  assert.doesNotMatch(publish, /^  (push|pull_request|workflow_run):/m);
});
