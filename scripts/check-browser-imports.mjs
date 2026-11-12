// Fail fast when Castleward's browser entrypoint imports a nonexistent local
// module or asks it for an export that does not exist. A syntax-only check
// cannot catch either error; GitHub Pages must not publish such a client.
// Bare specifiers (notably Three.js) are provided by the browser import map.
import { build } from 'esbuild';

try {
  await build({
    entryPoints: ['client/main.mjs'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    packages: 'external',
    write: false,
    logLevel: 'silent',
  });
  console.log('Browser module graph OK');
} catch (error) {
  console.error('Browser module graph FAILED: Castleward may never reach the main menu.');
  for (const item of error.errors ?? []) {
    const at = item.location ? `${item.location.file}:${item.location.line}:${item.location.column}` : '';
    console.error(at, item.text);
  }
  if (!error.errors?.length) console.error(error);
  process.exitCode = 1;
}
