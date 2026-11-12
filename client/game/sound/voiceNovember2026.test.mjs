import test from 'node:test';
import assert from 'node:assert/strict';
import { VOICE_LINE_LIST, VOICE_TAGS, validateVoiceLines } from './voiceLines.mjs';
import { VOICE_LIBRARY, subtitleFor } from '../../ui/voiceLibrary.mjs';

const find = (id) => VOICE_LINE_LIST.find((entry) => entry.id === id);
const shelf = (id) => VOICE_LIBRARY.find((entry) => entry.line === id);

test('the new physical exertion stays distinct from spoken dialogue', () => {
  const id = 'coughGrowlExertion';
  const section = 'Injury';
  assert.equal(find(id)?.kind, 'exertion');
  assert.equal(find(id)?.section, section);
  assert.equal(shelf(id)?.section, section);
  assert.equal(subtitleFor(id), null);
  assert.ok(find(id).triggers.heavyHurt > 0);
});

test('Good Luck Forgetting Me is one authored sentence with two alternate performances', () => {
  const line = find('goodLuckForgettingMe');
  assert.ok(line);
  assert.equal(line.kind, 'sentence');
  assert.equal(line.text, 'Ha ha! Good luck forgetting me!');
  assert.equal(line.section, 'Remarks & Oddities');
  assert.equal(subtitleFor(line.id), line.text);
  assert.ok(line.triggers.death > 0);
  assert.ok(line.triggers.rivalFelled > 0);
  assert.ok(shelf(line.id)?.note, 'the Credits derive an authored dry note');
  assert.equal(VOICE_LINE_LIST.filter((entry) => entry.id === line.id).length, 1, 'alternate takes are not new dialogue declarations');
});

test('new lines use actual raised moments and pass declaration validation', () => {
  for (const id of ['coughGrowlExertion', 'goodLuckForgettingMe']) {
    const entry = find(id);
    for (const tag of Object.keys(entry.triggers)) assert.ok(VOICE_TAGS[tag] && !VOICE_TAGS[tag].future);
  }
  const { errors } = validateVoiceLines();
  assert.deepEqual(errors, []);
});
