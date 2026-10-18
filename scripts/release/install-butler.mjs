import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { digest } from './archive.mjs';

// Official stable distribution, fixed version and independently pinned archive digest.
const version = '15.32.0';
const checksum = '2335971394ef6596f95ded0833e85ee28755e13761716ef4c91d6b11f69162f5';
if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('The CI installer supports Linux x64 only. See the operations guide for local Butler installation.');
const directory = path.resolve(process.argv[2] || '.butler');
await mkdir(directory, { recursive: true });
const response = await fetch(`https://broth.itch.zone/butler/linux-amd64/${version}/archive/default`, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error('Official Butler download failed');
const archive = Buffer.from(await response.arrayBuffer());
if (digest(archive) !== checksum) throw new Error('Butler archive checksum mismatch; refusing to execute');
const zip = path.join(directory, 'butler.zip');
await writeFile(zip, archive);
await writeFile(path.join(directory, 'butler'), execFileSync('unzip', ['-p', zip, 'butler'], { maxBuffer: 100 * 1024 ** 2 }));
await chmod(path.join(directory, 'butler'), 0o755);
const actual = execFileSync(path.join(directory, 'butler'), ['version'], { encoding: 'utf8' });
if (!actual.includes(version)) throw new Error('Butler version mismatch');
console.log(actual.trim());
