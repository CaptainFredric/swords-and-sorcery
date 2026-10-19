import test from 'node:test';
import assert from 'node:assert/strict';
import * as candidate from './candidate.mjs';

const revision = 'a'.repeat(40);
const tag = `itch-${revision}-123`;
const retained = { id: 416630218, draft: true, tag_name: tag, target_commitish: revision,
  html_url: 'https://github.com/CaptainFredric/swords-and-sorcery/releases/tag/untagged-example', assets: [] };

test('recovery finds an unpublished draft even though the published tag endpoint cannot return it', () => {
  const release = candidate.findRecoveryRelease(tag, revision, endpoint => {
    assert.equal(endpoint, 'repos/CaptainFredric/swords-and-sorcery/releases?per_page=100&page=1');
    return [{ id: 1, draft: false, tag_name: 'other' }, retained];
  });
  assert.equal(release.id, 416630218);
  assert.equal(release.html_url, 'https://github.com/CaptainFredric/swords-and-sorcery/releases/tag/untagged-example');
});

test('recovery checks later pages and rejects ambiguous drafts across page boundaries', () => {
  const fullPage = Array.from({ length: 100 }, (_, i) => ({ id: i, tag_name: `other-${i}` }));
  assert.equal(candidate.findRecoveryRelease(tag, revision, endpoint => endpoint.endsWith('page=1') ? fullPage : [retained]).id, 416630218);
  assert.throws(() => candidate.findRecoveryRelease(tag, revision, endpoint =>
    endpoint.endsWith('page=1') ? [retained, ...fullPage.slice(1)] : [{ ...retained, id: 2 }]), /ambiguous/i);
});

test('recovery refuses missing, published, and mismatched source archives', () => {
  for (const releases of [[], [{ ...retained, draft: false }], [{ ...retained, target_commitish: 'main' }]]) {
    assert.throws(() => candidate.findRecoveryRelease(tag, revision, () => releases), /^Error: Recovery archive/);
  }
});
