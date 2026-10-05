import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineForFile, nameKey, parseSource, planIngest, processorArgs } from './voice-ingest.mjs';
import { VOICE_LINE_LIST, normalizeLine, voiceLine } from '../../client/game/sound/voiceLines.mjs';

// The voice's front door (npm run voice): a recording is matched to its declared line by its name, and processed
// with that line's own settings.

test('a recording is matched to its line by its name: the id, the file stem, a take number, an alias, a declared file', () => {
  assert.equal(nameKey('Late-Line (2).MP3'), 'lateline');
  assert.equal(lineForFile('lateLine.mp3'), 'lateLine');
  assert.equal(lineForFile('late-line-2.m4a'), 'lateLine');
  assert.equal(lineForFile('Late Line 3.wav'), 'lateLine');
  assert.equal(lineForFile('magic_defeat.m4a'), 'magicDefeat');
  assert.equal(lineForFile('squire.mp3'), 'squireSetup', 'by an alias');
  assert.equal(lineForFile('GoingToBeLate.mp3'), null, 'a name no line answers to');
  const named = [normalizeLine({ id: 'lateDeath', file: 'GoingToBeLate.mp3', text: 'x', trigger: 'death' })];
  assert.equal(lineForFile('GoingToBeLate.mp3', named), 'lateDeath', 'by the file its declaration names');
  assert.equal(lineForFile('goingtobelate (1).mp3', named), 'lateDeath');
});

test('what comes in is planned by line; a recording no line answers to is left alone and said', () => {
  const plan = planIngest(['/inbox/sorcery-1.m4a', '/inbox/sorcery-2.m4a', '/inbox/hack.mp3', '/inbox/WhoKnows.mp3']);
  assert.deepEqual([...plan.byLine.keys()], ['sorcery', 'hackSlash']);
  assert.equal(plan.byLine.get('sorcery').length, 2);
  assert.deepEqual(plan.unknown.map((source) => source.name), ['WhoKnows.mp3']);
  // --line names the line for everything given, whatever the files are called
  const forced = planIngest(['/x/take.wav:0.5-2.1', '/x/other.wav'], { line: 'neverThought' });
  assert.equal(forced.byLine.get('neverThought').length, 2);
  assert.deepEqual(parseSource('/x/take.wav:0.5-2.1'), { path: '/x/take.wav', window: '0.5-2.1', name: 'take.wav' });
  // and a line nobody declared is not made up
  assert.equal(planIngest(['/x/a.mp3'], { line: 'noSuchLine' }).unknown.length, 1);
});

test('each line is processed with its own settings', () => {
  const gale = voiceLine('galeTaunt').voice;
  assert.deepEqual(processorArgs('galeTaunt', ['a.mp3']), ['--line', 'galeTaunt', '--drive', String(gale.drive), '--rms-db', String(gale.rmsDb), '--expand-below-db', String(gale.expandBelowDb), 'a.mp3']);
  // a line given weight: its pitch, how much of its formants stay, and its chest go to the processor too
  const weighty = voiceLine('chargeDefeat').voice;
  assert.deepEqual(processorArgs('chargeDefeat', ['b.mp3']).slice(-7), ['--semitones', String(weighty.semitones), '--formants', String(weighty.formants), '--chest', String(weighty.chest), 'b.mp3']);
  // a line with repairs to its take: they go along as they were declared (the recording's own seconds)
  const repaired = processorArgs('downUpSideways', ['c.mp3']);
  assert.deepEqual(JSON.parse(repaired[repaired.indexOf('--edits') + 1]), voiceLine('downUpSideways').voice.edits);
  assert.ok(!processorArgs('chargeDefeat', ['b.mp3']).includes('--edits'), 'none for a line without');
  assert.ok(!processorArgs('sorcery', ['a.mp3']).includes('--expand-below-db'));
  // a line that says nothing of its processing gets the standard preset
  const plain = [normalizeLine({ id: 'plainLine', text: 'x', trigger: 'death' })];
  assert.deepEqual(processorArgs('plainLine', ['a.mp3'], plain), ['--line', 'plainLine', '--drive', '2', '--rms-db', '-17', 'a.mp3']);
});

test('every recorded take has its recording noted, for making it again', () => {
  const sources = JSON.parse(readFileSync(new URL('./voice-sources.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../../client/assets/voice/manifest.json', import.meta.url), 'utf8'));
  for (const [id, takes] of Object.entries(manifest.lines)) {
    assert.ok(VOICE_LINE_LIST.some((line) => line.id === id), `${id} is declared`);
    assert.equal(sources[id]?.length, takes.length, `${id}: ${takes.length} take(s), ${sources[id]?.length ?? 0} recording(s) noted`);
  }
  for (const id of Object.keys(sources)) assert.ok(manifest.lines[id], `${id}: a recording noted for a line with no take`);
});
