import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ZIP_NAME } from './archive.mjs';
import { TARGET, butlerEnvironment } from './policy.mjs';

// The pinned Butler source handles --dry-run before AuthenticateViaOauth.
// This invocation lists ZIP contents only; it creates no itch build or upload.
const directory = path.resolve(process.argv[2] || 'dist/html5');
const output = execFileSync(path.resolve('.butler/butler'), ['push', path.join(directory, ZIP_NAME), TARGET, '--dry-run', '--json'], { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 ** 2, env: butlerEnvironment('') });
const results = output.trim().split('\n').map(line => JSON.parse(line)).filter(line => line.type === 'result');
if (results.length !== 1 || results[0].value?.dryRun !== true || results[0].value?.buildId !== 0) throw new Error('Butler did not confirm an offline dry run');
await writeFile(path.join(directory, 'butler-dry-run.json'), output);
console.log('Official Butler dry run confirmed: no build created');
