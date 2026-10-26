import { readdir, readFile, writeFile, mkdir, mkdtemp, copyFile, stat, utimes, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

export const DEFAULT_GAME_SERVER = 'wss://swords-and-sorcery.onrender.com/ws';
const ASSET_FILE = /\.(html|css|json|webmanifest|svg|png|jpe?g|webp|glb|ogg|mp3|m4a|wav|woff2?|ttf)$/i;

export function configuredHtml(html, server) {
  const url = new URL(server);
  if (url.protocol !== 'wss:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/ws')) {
    throw new Error('GAME_SERVER must be a credential free wss URL ending in /ws, without query or fragment');
  }
  const meta = `<meta name="ss-game-server" content="${url.href}" />`;
  const existing = /<meta\b[^>]*name=["']ss-game-server["'][^>]*>/g;
  if ((html.match(existing) || []).length > 1) throw new Error('Duplicate server meta');
  if (existing.test(html)) return html.replace(existing, meta);
  if (!/<meta charset="UTF-8"\s*\/>/.test(html)) throw new Error('Missing UTF-8 charset insertion point');
  return html.replace(/<meta charset="UTF-8"\s*\/>/, (charset) => `${charset}\n  ${meta}`);
}

export function archiveWarnings(count) {
  return count >= 900 ? [`HTML5 file budget: ${count} of 1000 files used; review growth before adding assets.`] : [];
}

export function checkLimits(entries) {
  if (entries.length > 1000) throw new Error('itch.io limit: 1000 files');
  for (const entry of entries) {
    if (/[\r\n]/.test(entry.path)) throw new Error('Archive paths must not contain line breaks');
    if (entry.path.length > 240) throw new Error(`itch.io limit: 240 characters in ${entry.path}`);
    if (entry.size > 200 * 1024 ** 2) throw new Error(`itch.io limit: 200 MB per file: ${entry.path}`);
  }
  if (entries.reduce((total, file) => total + file.size, 0) > 500 * 1024 ** 2) throw new Error('itch.io limit: 500 MB extracted');
}

// The same browser source is exported; tests and unknown/development formats never enter the archive.
export async function exportHtml5({ root = path.resolve(import.meta.dirname, '..'), out = path.join(root, 'dist/html5'), server = DEFAULT_GAME_SERVER, revision } = {}) {
  const html = configuredHtml(await readFile(path.join(root, 'client/index.html'), 'utf8'), server);
  revision ??= execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  await mkdir(out, { recursive: true });
  const staging = await mkdtemp(path.join(out, '.stage-'));
  const files = [];
  const record = async (relative) => files.push({ path: relative, size: (await stat(path.join(staging, relative))).size, sha256: createHash('sha256').update(await readFile(path.join(staging, relative))).digest('hex') });
  try {
    const mainEntry = path.join(root, 'client/main.mjs');
    const hasMain = await stat(mainEntry).then(() => true).catch(() => false);
    if (hasMain) {
      const outMain = path.join(staging, 'client/main.mjs');
      await mkdir(path.dirname(outMain), { recursive: true });
      await esbuild.build({
        entryPoints: [mainEntry],
        outfile: outMain,
        bundle: true,
        format: 'esm',
        target: 'es2022',
        external: ['three', 'three/*'],
        platform: 'browser',
        logLevel: 'warning',
      });
      await record('client/main.mjs');
    }

    const copy = async (directory) => {
      for (const entry of (await readdir(path.join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith('.') || /^(fixtures|__tests__|node_modules)$/.test(entry.name)) continue;
        const relative = `${directory}/${entry.name}`;
        if (entry.isDirectory()) await copy(relative);
        else if (entry.isFile() && ASSET_FILE.test(entry.name) && !/\.(test|spec|browser)\./.test(entry.name)
          && (!entry.name.endsWith('.json') || entry.name === 'manifest.json') && relative !== 'client/index.html') {
          await mkdir(path.dirname(path.join(staging, relative)), { recursive: true });
          await copyFile(path.join(root, relative), path.join(staging, relative));
          await record(relative);
        }
      }
    };
    await copy('client');
    await writeFile(path.join(staging, 'index.html'), html);
    await record('index.html');
    await writeFile(path.join(staging, 'release.json'), `${JSON.stringify({ revision, server, source: 'https://github.com/CaptainFredric/swords-and-sorcery' }, null, 2)}\n`);
    await record('release.json');
    files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    checkLimits(files);
    // Stable file order and timestamps make identical inputs produce byte identical ZIPs.
    const epoch = new Date('1980-01-01T00:00:00Z');
    for (const file of files) await utimes(path.join(staging, file.path), epoch, epoch);
    const temporaryZip = path.join(staging, 'export.zip');
    execFileSync('zip', ['-X', '-q', temporaryZip, '-@'], { cwd: staging, input: `${files.map((f) => f.path).join('\n')}\n`, env: { ...process.env, TZ: 'UTC' } });
    const zip = path.resolve(out, 'swords-and-sorcery-html5.zip');
    await copyFile(temporaryZip, zip);

    const compatibilitySources = [];
    const scanSources = async (dir) => {
      const dirPath = path.join(root, dir);
      let entries = [];
      try { entries = await readdir(dirPath, { withFileTypes: true }); } catch { return; }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name.startsWith('.') || /\.(test|spec|browser)\./.test(entry.name)) continue;
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) await scanSources(relative);
        else if (entry.isFile() && relative.endsWith('.mjs')) {
          const content = await readFile(path.join(root, relative));
          compatibilitySources.push({
            path: relative,
            size: content.length,
            sha256: createHash('sha256').update(content).digest('hex'),
          });
        }
      }
    };
    await scanSources('shared');
    const gameSocketRel = 'client/network/GameSocket.mjs';
    try {
      const gsContent = await readFile(path.join(root, gameSocketRel));
      compatibilitySources.push({
        path: gameSocketRel,
        size: gsContent.length,
        sha256: createHash('sha256').update(gsContent).digest('hex'),
      });
    } catch {}
    compatibilitySources.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

    const report = {
      revision, server, zip, files: files.length,
      extractedBytes: files.reduce((total, f) => total + f.size, 0),
      archiveBytes: (await stat(zip)).size,
      sha256: createHash('sha256').update(await readFile(zip)).digest('hex'),
      warnings: archiveWarnings(files.length),
      compatibilitySources,
      entries: files,
    };
    await writeFile(path.join(out, 'export-report.json'), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally { await rm(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const report = await exportHtml5({ server: process.env.GAME_SERVER || DEFAULT_GAME_SERVER });
  for (const warning of report.warnings) console.warn(warning);
  console.log(`${report.zip}\n${report.files} files, ${(report.archiveBytes / 1024 ** 2).toFixed(2)} MB zipped, ${(report.extractedBytes / 1024 ** 2).toFixed(2)} MB extracted\nRevision ${report.revision}\nSHA256 ${report.sha256}`);
}
