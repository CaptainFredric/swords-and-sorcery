import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const roots = ['shared', 'server', 'client'];
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.mjs')) files.push(fullPath);
  }
}

for (const root of roots) await collect(root);
files.sort();

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`\nSyntax check failed: ${file}\n`);
    process.stderr.write(result.stderr || result.stdout || 'Unknown syntax error\n');
  }
}

if (failed) process.exit(1);
console.log(`Syntax OK (${files.length} modules)`);
