import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { checkLimits, DEFAULT_GAME_SERVER } from '../export-html5.mjs';
import { SHA, DIGEST } from './policy.mjs';

export const ZIP_NAME = 'swords-and-sorcery-html5.zip';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const json = async file => JSON.parse(await readFile(file, 'utf8'));
export const unzip = (zip, file) => execFileSync('unzip', ['-p', zip, file], { maxBuffer: 250 * 1024 ** 2 });

export async function validateArchive(directory, { revision, checksum } = {}) {
  const report = await json(path.join(directory, 'export-report.json'));
  const zip = path.join(directory, ZIP_NAME), bytes = await readFile(zip);
  if (!SHA.test(report.revision) || (revision && report.revision !== revision)) throw new Error('Archive source revision mismatch');
  if (!DIGEST.test(report.sha256) || digest(bytes) !== report.sha256 || (checksum && checksum !== report.sha256)) throw new Error('Archive checksum mismatch');
  if (report.server !== DEFAULT_GAME_SERVER || report.archiveBytes !== bytes.length) throw new Error('Unexpected archive configuration/size');
  execFileSync('unzip', ['-t', zip], { stdio: 'pipe' });
  const paths = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n');
  if (new Set(paths).size !== paths.length || paths.length !== report.entries.length || paths.length !== report.files) throw new Error('Archive manifest count/duplicate mismatch');
  const expected = new Map(report.entries.map(entry => [entry.path, entry]));
  checkLimits(report.entries);
  for (const name of paths) {
    if (name.startsWith('/') || name.includes('\\') || name.split('/').some(part => part === '..' || part.startsWith('.')) ||
      !/^(index\.html|release\.json|(?:client|shared)\/)/.test(name) || /\.(test|spec|browser)\.|\.env|\.blend|\.py$/.test(name)) throw new Error(`Unsafe archive entry: ${name}`);
  }
  const listing = execFileSync('unzip', ['-Z', '-l', zip], { encoding: 'utf8' });
  if (listing.split('\n').some(line => /^l[rwx-]{9}\s/.test(line))) throw new Error('Archive symlinks are forbidden');
  const extracted = await mkdtemp(path.join(os.tmpdir(), 'ss-archive-'));
  try {
    execFileSync('unzip', ['-qq', zip, '-d', extracted]);
    for (const name of paths) {
      const file = await readFile(path.join(extracted, name)), entry = expected.get(name);
      if (!entry || entry.size !== file.length || digest(file) !== entry.sha256) throw new Error(`Archive content mismatch: ${name}`);
    }
  } finally { await rm(extracted, { recursive: true, force: true }); }
  if (report.entries.reduce((sum, entry) => sum + entry.size, 0) !== report.extractedBytes) throw new Error('Extracted byte count mismatch');
  const release = JSON.parse(unzip(zip, 'release.json'));
  if (release.revision !== report.revision || release.server !== report.server || release.source !== 'https://github.com/CaptainFredric/swords-and-sorcery') throw new Error('Root release.json mismatch');
  const html = unzip(zip, 'index.html').toString();
  if (!html.includes(`content="${DEFAULT_GAME_SERVER}"`)) throw new Error('Root entry has wrong WebSocket server');
  for (const required of ['client/main.mjs', 'client/assets/characters/spellblade/spellblade.glb', 'client/assets/characters/spellblade/spellblade-fp.glb', 'client/assets/voice/manifest.json']) {
    if (!expected.has(required)) throw new Error(`Missing production dependency: ${required}`);
  }
  const mainBundle = unzip(zip, 'client/main.mjs').toString('utf8');
  if (!mainBundle.includes('LocalHost') && !expected.has('client/network/LocalHost.mjs')) {
    throw new Error('Missing production dependency: LocalHost simulation engine');
  }
  return { ...report, zip };
}
