import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(`../../${path}`, import.meta.url));

test('both editable Blender sources are versioned alongside the asset contract', async () => {
  for (const name of ['third-person', 'first-person']) {
    const bytes = await read(`tools/blender/characters/spellblade/source/spellblade-${name}.blend`);
    assert.equal(bytes.subarray(0, 7).toString(), 'BLENDER');
    assert.ok(bytes.length > 10000);
  }
});

test('production export loads the saved source and never invokes historical reconstruction', async () => {
  const build = (await read('tools/blender/characters/spellblade/build.py')).toString();
  const fp = (await read('tools/blender/characters/spellblade/first_person.py')).toString();
  assert.match(build, /load_authored_source\(args.source, "SpellbladeExport"\)/);
  assert.match(fp, /load_authored_source\(source, "SpellbladeFirstPersonExport"\)/);
  assert.doesNotMatch(build + fp, /rebuild_reference_match|enforce_blueprint_export_bounds|build_concept_model|build_actions\(/);
});

test('asset CI executes the actual Blender source roundtrip test', async () => {
  const workflow = (await read('.github/workflows/spellblade-assets.yml')).toString();
  assert.match(workflow, /--python scripts\/test-spellblade-source.py/);
});
