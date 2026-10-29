import test from 'node:test';
import assert from 'node:assert/strict';
import { ZipArchive, crc32 } from './zipWriter.mjs';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('crc32 generates standard values', () => {
  const enc = new TextEncoder();
  assert.equal(crc32(enc.encode('123456789')), 0xCBF43926);
  assert.equal(crc32(enc.encode('')), 0);
});

test('ZipArchive creates valid zip readable by system unzip tool', () => {
  const zip = new ZipArchive();
  zip.add('hello.txt', 'Hello, Castleward!');
  zip.add('manifest.json', JSON.stringify({ world: 'castleward', tick: 1234 }));
  zip.add('nested/test.bin', new Uint8Array([1, 2, 3, 4, 5]));

  const bytes = zip.build();
  assert.ok(bytes.length > 100);

  // Write to temporary file and test with system unzip
  const tempPath = path.join(tmpdir(), `test-zip-${Date.now()}.zip`);
  writeFileSync(tempPath, bytes);

  try {
    const list = execFileSync('unzip', ['-l', tempPath], { encoding: 'utf8' });
    assert.ok(list.includes('hello.txt'));
    assert.ok(list.includes('manifest.json'));
    assert.ok(list.includes('nested/test.bin'));

    const content = execFileSync('unzip', ['-p', tempPath, 'hello.txt'], { encoding: 'utf8' });
    assert.equal(content, 'Hello, Castleward!');

    const json = JSON.parse(execFileSync('unzip', ['-p', tempPath, 'manifest.json'], { encoding: 'utf8' }));
    assert.equal(json.world, 'castleward');
    assert.equal(json.tick, 1234);
  } finally {
    try { unlinkSync(tempPath); } catch {}
  }
});
