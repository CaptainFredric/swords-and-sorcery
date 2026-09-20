import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  try {
    return await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  } catch {
    return '';
  }
}

test('Spellblade reconstruction is driven by calibrated concept pixels instead of guessed world-space boxes', async () => {
  const trace = await read('tools/blender/characters/spellblade/concept_trace.py');
  const build = await read('tools/blender/characters/spellblade/build.py');

  assert.match(trace, /CONCEPT_REFERENCE_SIZE\s*=\s*\(1448,\s*1086\)/);
  assert.match(trace, /FRONT_VIEW_CROP_PX\s*=\s*\(10,\s*20,\s*540,\s*720\)/);
  assert.match(trace, /SIDE_VIEW_CROP_PX\s*=\s*\(560,\s*10,\s*835,\s*370\)/);
  assert.match(trace, /BACK_VIEW_CROP_PX\s*=\s*\(560,\s*365,\s*835,\s*715\)/);
  assert.match(trace, /FRONT_TRACE_PX(?:\s*:\s*[^=]+)?\s*=/);
  assert.match(trace, /SIDE_TRACE_PX(?:\s*:\s*[^=]+)?\s*=/);
  assert.match(trace, /BACK_TRACE_PX(?:\s*:\s*[^=]+)?\s*=/);
  assert.match(trace, /def _front_px_to_world\(/);
  assert.match(trace, /def _side_px_to_world\(/);

  for (const marker of [
    'TracedHelmetMask', 'TracedBreastplate', 'TracedTabardFront',
    'TracedPauldron.L', 'TracedPauldron.R',
    'TracedGreave.L', 'TracedGreave.R',
    'TracedBoot.L', 'TracedBoot.R',
  ]) assert.match(trace, new RegExp(marker.replaceAll('.', '\\.')));

  assert.match(trace, /def refine_traced_concept_geometry\(/);
  assert.match(build, /from tools\.blender\.characters\.spellblade\.concept_trace import refine_traced_concept_geometry/);
  assert.match(build, /model = refine_traced_concept_geometry\(armature, model\)/);
});
