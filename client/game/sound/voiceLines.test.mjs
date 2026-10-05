import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  VOICE_FACTS, VOICE_LINE_DECLARATIONS, VOICE_LINE_LIST, VOICE_TAGS, fileStem, linesFor, normalizeLine, validateVoiceLines, voiceLine,
} from './voiceLines.mjs';
import { VOICE_LINES } from './voiceRules.mjs';

// Every line is declared once (voiceLines.mjs), and everything follows from the declaration. Held to the game: the
// declarations are sound, every recording belongs to one, and every moment a line waits for is one the game raises.

const voiceDir = new URL('../../assets/voice/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', voiceDir), 'utf8'));
const files = readdirSync(voiceDir);

test('the declarations are sound: no duplicate, no unknown moment, every recording declared and really there', () => {
  const { errors } = validateVoiceLines({ manifest, files });
  assert.deepEqual(errors, []);
});

test('what is wrong with a declaration is said plainly', () => {
  const good = { id: 'testLine', text: 'A test.', trigger: 'death', rarity: 0.5, cooldown: 10, section: 'Defeat & Death', credits: { title: 'T', description: 'D', note: 'N' } };
  const problems = (entry, extra = {}) => validateVoiceLines({ declarations: [entry], ...extra }).errors.join(' | ');
  assert.equal(problems(good), '');
  assert.match(problems({ ...good, trigger: 'noSuchMoment' }), /unknown trigger 'noSuchMoment'/);
  assert.match(problems({ ...good, trigger: undefined }), /no trigger/);
  assert.match(problems({ ...good, text: '' }), /words are missing/);
  assert.match(problems({ ...good, rarity: 0 }), /rarity/);
  assert.match(problems({ ...good, priority: 'urgent' }), /priority/);
  assert.match(problems({ ...good, boost: { lucky: 2 } }), /unknown boost 'lucky'/);
  assert.match(problems({ ...good, credits: { title: 'T' } }), /Credits need/);
  assert.match(problems({ ...good, trigger: 'riposteOvershoot' }), /not raised by the game yet/);
  assert.equal(problems({ ...good, trigger: 'riposteOvershoot', coming: 'the Riposte' }), '');
  assert.match(validateVoiceLines({ declarations: [good, good] }).errors.join(' | '), /declared twice/);
  // a recording nobody declared, and a take the manifest lists that is not there
  assert.match(problems(good, { manifest: { lines: { strayLine: [{ file: 'stray-line-1' }] } }, files: [] }), /strayLine: recorded .* but not declared/);
  assert.match(problems(good, { manifest: { lines: { testLine: [{ file: 'test-line-1' }] } }, files: ['test-line-1.m4a'] }), /test-line-1\.wav is listed but missing/);
  // where it stands in the Credits is authored, and fits what it is (a sentence among his voice, a grunt among the sounds)
  assert.match(problems({ ...good, section: undefined }), /section must be one of/);
  assert.match(problems({ ...good, section: 'Injury' }), /section must be one of/);
  assert.equal(problems({ ...good, kind: 'exertion', section: 'Injury' }), '');
  // a line said in parts: the words of each part, and a recording for each (never fewer, never an alternate take)
  const inParts = { ...good, parts: ['A', 'test.'] };
  assert.match(problems({ ...good, parts: ['only one'] }), /parts must be the words of each part/);
  assert.match(problems(inParts, { manifest: { lines: { testLine: [{ file: 'test-line-1' }] } }, files: ['test-line-1.m4a', 'test-line-1.wav'] }), /2 parts are declared and 1 recorded/);
  assert.equal(problems(inParts, { manifest: { lines: { testLine: [{ file: 'test-line-1' }, { file: 'test-line-2' }] } }, files: ['test-line-1.m4a', 'test-line-1.wav', 'test-line-2.m4a', 'test-line-2.wav'] }), '');
  // and a line still silent is a warning, not an error
  assert.match(validateVoiceLines({ declarations: [good], manifest: { lines: {} } }).warnings.join(' | '), /testLine: not recorded yet/);
});

test('every moment a line waits for is one the game raises (or is marked as still to come)', () => {
  // the modules that raise moments: a tag nobody raises would leave its lines silent for ever
  const sources = ['./voiceMoments.mjs', './voiceRules.mjs', './voiceScenes.mjs', './voiceWatch.mjs', '../GameRuntime.mjs', '../../main.mjs']
    .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  for (const [tag, about] of Object.entries(VOICE_TAGS)) {
    assert.ok(about.about, `${tag}: says what it is`);
    if (about.future) continue;
    const raised = new RegExp(`['\`]${tag}['\`]|\\b${tag}: `).test(sources) || (tag.endsWith('Invoked') && /cryMoment\(/.test(sources));
    assert.ok(raised, `${tag} is never raised by the game`);
  }
  // and every tag has at least one line (or it is noise), every fact at least one line it boosts
  for (const tag of Object.keys(VOICE_TAGS)) assert.ok(VOICE_LINE_LIST.some((line) => line.triggers[tag] > 0), `${tag}: no line waits for it`);
  for (const fact of VOICE_FACTS) assert.ok(VOICE_LINE_LIST.some((line) => line.boost[fact]), `${fact}: no line is boosted by it`);
});

test('the director\'s rules follow from the declarations: rank, rarity, cooldown; a line still to come has none', () => {
  for (const line of VOICE_LINE_LIST) {
    const rule = VOICE_LINES[line.id];
    if (line.coming) { assert.equal(rule, undefined, `${line.id} waits`); continue; }
    assert.equal(rule.chance, line.rarity);
    assert.deepEqual(rule.cooldown, line.cooldown);
    assert.equal(rule.priority, { low: 1, normal: 2, high: 3 }[line.priority]);
    assert.equal(Boolean(rule.interrupts), line.priority === 'high', `${line.id}: a line of state cuts a lesser one`);
    assert.equal(rule.kind, line.kind);
  }
  assert.equal(voiceLine('laugh').perLife, 1);
  assert.equal(fileStem('lateLine'), 'late-line');
  assert.equal(normalizeLine({ id: 'x', trigger: ['death', 'kill'] }).triggers.kill, 1);
  assert.equal(VOICE_LINE_DECLARATIONS.length, VOICE_LINE_LIST.length);
});

test('a moment gives its lines in order: the most particular moment first, the wildcard and the grunt last', () => {
  const said = (tags, options) => linesFor('k', tags, options).map((say) => say.line);
  assert.deepEqual(said({ death: 1, minorLethal: 1, magicDeath: 1 }), ['lateLine', 'magicDefeat', 'knightFallen', 'defeat', 'underworld', 'laugh', 'death']);
  assert.deepEqual(said(['kill', 'cleanSwordKill', 'subparKill']), ['hackSlash', 'subparStandard', 'killTaunt', 'workHard', 'laugh']);
  assert.deepEqual(said(['guardBreak']), ['lowerGuard', 'breakTaunt', 'offGuard']);
  assert.deepEqual(said(['dash']), ['dash', 'laugh']);
  // (his review of a dodge is for an attack narrowly avoided, not any dash)
  assert.deepEqual(said(['nearMiss']), ['deftlyDodge']);
  assert.deepEqual(said(['noSuchMoment']), []);
  // a line waiting on what it belongs to is never offered, even if its moment were raised
  assert.deepEqual(said(['riposteOvershoot']), []);
  // the Blazing Vortex's own: its noise as it takes hold, and its excuse for whoever falls spinning (ahead of an
  // ordinary defeat)
  assert.deepEqual(said(['vortexSpin']), ['vortexUse']);
  assert.deepEqual(said({ death: 1, vortexDeath: 1 }).slice(0, 2), ['vortexDefeat', 'knightFallen']);
  // how fitting a moment is scales its lines' odds: the moment's own word, the line's share of it, and its boosts
  const fallen = linesFor('v', { death: 1 }, { facts: ['overkill', 'decisive'] });
  assert.equal(fallen.find((say) => say.line === 'knightFallen').chanceScale, 3.5);
  assert.equal(fallen.find((say) => say.line === 'defeat').chanceScale, 2.5);
  assert.equal(linesFor('g', { galeDisplacement: 1.8 })[0].chanceScale, 1.8);
  assert.equal(linesFor('g', ['galeKill', 'kill'])[0].chanceScale, 3);
  // each begins when its moment says (a taunt waits for the blow to land)
  assert.equal(linesFor('k', ['guardBreak'])[0].delay, VOICE_TAGS.guardBreak.delay);
  assert.equal(linesFor('k', ['squireOpening'])[0].opens, 'squire');
});

test('a cry\'s moment gives exactly one line, by share, and it is always said; a forced moment gives only lines of state', () => {
  const cries = { sunderCall: 0, victory: 0 };
  let seed = 3;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 1000; i += 1) {
    const [cry, ...rest] = linesFor('k', ['sunderInvoked'], { rand });
    assert.equal(rest.length, 0);
    assert.equal(cry.cry, true);
    cries[cry.line] += 1;
  }
  assert.ok(cries.victory > 250 && cries.victory < 450 && cries.sunderCall > cries.victory, JSON.stringify(cries));
  const forced = linesFor('v', { death: 1, magicDeath: 1 }, { force: true });
  assert.deepEqual(forced.map((say) => say.line).sort(), ['defeat', 'knightFallen', 'magicDefeat', 'underworld']);
  assert.equal(forced[0].line, 'magicDefeat', 'the most particular moment still first');
  assert.ok(forced.every((say) => say.force));
});

test('the rarer grunts, the likelier charge, the battle\'s opening line, and the lines given weight', () => {
  // the heavy injuries and the death grunt: much rarer than they were (the sentences of a fall keep theirs)
  for (const id of ['heavyHurt', 'heavyHurt2']) {
    assert.ok(voiceLine(id).rarity <= 0.15 && voiceLine(id).cooldown >= 20, id);
  }
  assert.ok(voiceLine('death').rarity <= 0.4, 'the death grunt now and then, not every fall');
  assert.equal(voiceLine('defeat').rarity, 0.25, 'the fall\'s sentences are as they were');
  // Charged with Defeat: the charge's likelier line, tried first
  const charge = linesFor('k', ['charge']).map((say) => say.line);
  assert.equal(charge[0], 'chargeDefeat');
  assert.ok(voiceLine('chargeDefeat').rarity >= 0.3);
  // May the Best Man Win: one of the lines for any battle beginning
  assert.deepEqual(Object.keys(voiceLine('bestManWin').triggers), ['battleBegins']);
  const runtime = readFileSync(new URL('../GameRuntime.mjs', import.meta.url), 'utf8');
  assert.match(runtime, /!this\.#inPractice\(\) && knights\.length >= 2\) for \(const knight of knights\) this\.#sayMoment\(knight\.id, \['battleBegins'\]\)/);
  // the lines that must carry weight go further down, their formants following part of the way, with more chest
  for (const id of ['sunderLeave', 'remainStaggered', 'chargeDefeat', 'masterCall', 'victory', 'sorcery', 'killTaunt', 'breakTaunt', 'noSpare', 'thankYou']) {
    const voice = voiceLine(id).voice;
    assert.ok(voice.semitones <= -3.5 && voice.formants < 1 && voice.chest > 0, id);
  }
  // and the ones he already carries well are left as they were
  for (const id of ['constitution', 'preferNoPain']) assert.equal(voiceLine(id).voice.semitones, undefined, id);
});
