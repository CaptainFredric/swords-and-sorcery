import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('manifest rebuild preserves first addition dates and dates new recordings without audio processing', () => {
  // Execute the real manifest writer independently of the optional DSP dependencies.
  const result = spawnSync('python3', ['-c', `
import ast, json, os, re, tempfile
from datetime import datetime, timezone
source = ast.parse(open('tools/audio/knight_voice.py').read())
functions = [node for node in source.body if isinstance(node, ast.FunctionDef) and node.name in ('line_of_stem', 'write_manifest')]
scope = {'os': os, 're': re, 'json': json}
exec(compile(ast.Module(body=functions, type_ignores=[]), '<manifest>', 'exec'), scope)
with tempfile.TemporaryDirectory() as directory:
    scope['OUT_DIR'] = directory
    for stem in ('old-line', 'new-line'):
        open(os.path.join(directory, stem + '-1.m4a'), 'wb').close()
    with open(os.path.join(directory, 'manifest.json'), 'w') as output:
        json.dump({'addedOn': {'oldLine': '2026-09-29'}, 'effects': {'wall': 'wall-hit'}}, output)
    result = scope['write_manifest']()
    assert result['addedOn']['oldLine'] == '2026-09-29'
    assert result['addedOn']['newLine'] == datetime.now(timezone.utc).date().isoformat()
    assert result['effects'] == {'wall': 'wall-hit'}
    assert scope['write_manifest']()['addedOn'] == result['addedOn']
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
