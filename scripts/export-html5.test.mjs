import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm, stat, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { exportHtml5, configuredHtml, checkLimits } from './export-html5.mjs';
import { gameServerUrl } from '../client/network/GameSocket.mjs';

test('export config uses the existing secure server meta and preserves subdirectory paths', () => {
  const html = configuredHtml('<meta charset="UTF-8" /><script src="client/main.mjs"></script>', 'wss://example.org/ws');
  const server = /name="ss-game-server" content="([^"]+)"/.exec(html)[1];
  assert.equal(gameServerUrl({ querySelector: () => ({ content: server }) }, { host: 'html.itch.zone', protocol: 'https:' }), 'wss://example.org/ws');
  assert.match(html, /src="client\/main.mjs"/);
  assert.equal(new URL('client/main.mjs', 'https://html.itch.zone/html/123/index.html').pathname, '/html/123/client/main.mjs');
  assert.equal((configuredHtml(html, 'wss://other.org/ws').match(/name="ss-game-server"/g) || []).length, 1);
  for (const bad of ['ws://example.org/ws', 'https://example.org/ws', 'wss://user:secret@example.org/ws', 'wss://example.org/ws?token=secret', 'wss://example.org/ws#secret']) {
    assert.throws(() => configuredHtml('<meta charset="UTF-8" />', bad));
  }
});

test('limits reject oversized content, paths and file counts', () => {
  assert.throws(() => checkLimits([{ path: 'client/two\nfiles.png', size: 1 }]), /line breaks/);
  assert.throws(() => checkLimits(Array.from({ length: 1001 }, (_, i) => ({ path: `${i}.js`, size: 1 }))), /1000/);
  assert.throws(() => checkLimits([{ path: `${'x'.repeat(241)}.js`, size: 1 }]), /240/);
  assert.throws(() => checkLimits([{ path: 'large.glb', size: 200 * 1024 ** 2 + 1 }]), /200/);
  assert.throws(() => checkLimits(Array.from({ length: 3 }, (_, i) => ({ path: `${i}.glb`, size: 180 * 1024 ** 2 }))), /500/);
});

test('archive is repeatable, rooted correctly, and omits tests, private files and symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ss-export-test-'));
  try {
    await mkdir(path.join(root, 'client/assets'), { recursive: true });
    await mkdir(path.join(root, 'shared/src'), { recursive: true });
    await writeFile(path.join(root, 'client/index.html'), '<meta charset="UTF-8" /><script src="client/main.mjs"></script>');
    await writeFile(path.join(root, 'client/main.mjs'), 'import "../shared/src/rules.mjs";');
    await writeFile(path.join(root, 'shared/src/rules.mjs'), 'export const rule = 1;');
    await writeFile(path.join(root, 'client/private.test.mjs'), 'import "node:test";');
    await writeFile(path.join(root, 'client/.env'), 'SECRET=private');
    await writeFile(path.join(root, 'client/README.md'), 'development');
    await writeFile(path.join(root, 'client/audit.browser.mjs'), 'development');
    await symlink(path.join(root, 'client/.env'), path.join(root, 'client/secret.json'));
    await writeFile(path.join(root, 'client/assets/avatar.png'), 'image');
    const first = await exportHtml5({ root, out: path.join(root, 'a'), revision: 'test' });
    const second = await exportHtml5({ root, out: path.join(root, 'b'), revision: 'test' });
    assert.equal(first.sha256, second.sha256);
    const entries = execFileSync('unzip', ['-Z1', first.zip], { encoding: 'utf8' }).trim().split('\n');
    assert(entries.includes('index.html'));
    assert(entries.includes('client/assets/avatar.png'));
    assert(entries.includes('shared/src/rules.mjs'));
    assert(!entries.includes('client/index.html'));
    assert(entries.every((p) => !/\.test\.|\.browser\.|\.env|README|secret|server\//.test(p)));
    execFileSync('unzip', ['-t', first.zip]);
    assert.equal(first.files, entries.length);
    assert((await stat(first.zip)).size > 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('production export includes all local module, HTML and CSS dependencies', async () => {
  const root = path.resolve(import.meta.dirname, '..');
  const out = await mkdtemp(path.join(os.tmpdir(), 'ss-export-real-'));
  try {
    const built = await exportHtml5({ root, out, revision: 'test' });
    const paths = new Set(execFileSync('unzip', ['-Z1', built.zip], { encoding: 'utf8' }).trim().split('\n'));
    const inspect = async (dir) => {
      for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
        const p = `${dir}/${entry.name}`;
        if (entry.isDirectory()) await inspect(p);
        else if (paths.has(p) && /\.(mjs|js)$/.test(p)) {
          const source = await readFile(path.join(root, p), 'utf8');
          for (const match of source.matchAll(/(?:^\s*import\s*['"]|^\s*(?:import|export)[^;'"\n]*?\bfrom\s*['"]|\bimport\(\s*['"])([^'"]+)['"]/gm)) {
            const specifier = match[1];
            assert(!specifier.startsWith('node:'), `${p}: Node import shipped`);
            if (specifier.startsWith('.')) assert(paths.has(path.posix.normalize(`${path.posix.dirname(p)}/${specifier}`)), `${p}: missing ${specifier}`);
            else assert(specifier === 'three' || specifier.startsWith('three/addons/'), `${p}: unexpected bare import ${specifier}`);
          }
        } else if (paths.has(p) && p.endsWith('.css')) {
          for (const match of (await readFile(path.join(root, p), 'utf8')).matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)) {
            if (!/^(data:|https:|#)/.test(match[1])) assert(paths.has(path.posix.normalize(`${path.posix.dirname(p)}/${match[1]}`)), `${p}: missing ${match[1]}`);
          }
        }
      }
    };
    await inspect('client'); await inspect('shared');
    const html = execFileSync('unzip', ['-p', built.zip, 'index.html'], { encoding: 'utf8' });
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (!/^(https:|#)/.test(match[1])) assert(paths.has(match[1].replace(/^\.\//, '')), `index: missing ${match[1]}`);
    }
    assert(paths.has('client/assets/characters/spellblade/spellblade.glb'));
    assert(paths.has('client/assets/voice/manifest.json'));
    assert(paths.has('client/network/LocalHost.mjs'));
  } finally { await rm(out, { recursive: true, force: true }); }
});
