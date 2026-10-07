import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREDITS, VOICE_LIBRARY, libraryInOrder, libraryStatus, statusLabel, subtitleFor } from './voiceLibrary.mjs';
import { VOICE_LINES } from '../game/sound/voiceRules.mjs';

// The credits' voice library is drawn from the lines' own declarations (voiceLines.mjs), and what it says of each
// line's recording comes from the takes that are really there: it cannot fall out of step with the game.

const manifest = JSON.parse(readFileSync(new URL('../assets/voice/manifest.json', import.meta.url), 'utf8'));
const recorded = new Set(Object.keys(manifest.lines ?? {}));
const listed = new Map(VOICE_LIBRARY.map((entry) => [entry.line, entry]));

test('every line the game can say, and every recording, has its place in the library', () => {
  for (const line of Object.keys(VOICE_LINES)) assert.ok(listed.has(line), `${line} is listed`);
  for (const line of recorded) assert.ok(listed.has(line), `${line} (recorded) is listed`);
  assert.equal(listed.size, VOICE_LIBRARY.length, 'each line once');
  for (const entry of VOICE_LIBRARY) assert.ok(entry.title && entry.words && entry.when && entry.note, `${entry.line}: said, when, and why`);
});

test('what the library says of each recording follows from what is recorded', () => {
  const sorcery = listed.get('sorcery');
  assert.equal(libraryStatus(sorcery, true), 'live');
  assert.equal(statusLabel(sorcery, true), '', 'its play button says it is in the game');
  assert.equal(libraryStatus(sorcery, false), 'unrecorded');
  assert.equal(statusLabel(sorcery, false), 'NO RECORDING');
  // a line recorded ahead of what it belongs to waits for it, and has no rule: it cannot be said yet
  const waiting = listed.get('misaddressed');
  assert.equal(libraryStatus(waiting, true), 'coming');
  // (the Blazing Vortex's lines are in the game now)
  assert.equal(libraryStatus(listed.get('vortexDefeat'), true), 'live');
  assert.equal(statusLabel(listed.get('misaddressed'), true), 'WITH THE RIPOSTE');
  assert.equal(statusLabel(listed.get('misaddressed'), false), 'RIPOSTE · NO RECORDING');
  assert.equal(VOICE_LINES.misaddressed, undefined);
  assert.ok(VOICE_LINES.vortexDefeat && VOICE_LINES.vortexUse);
  for (const entry of VOICE_LIBRARY) {
    const status = libraryStatus(entry, recorded.has(entry.line));
    if (status === 'live') assert.ok(VOICE_LINES[entry.line], `${entry.line} is live but never said`);
    if (entry.coming) assert.ok(!VOICE_LINES[entry.line], `${entry.line} is said before what it waits for exists`);
  }
});

test('the Credits show what is in the game first, then what waits, then the places kept', () => {
  const shelves = libraryInOrder((line) => recorded.has(line)).map((entry) => libraryStatus(entry, recorded.has(entry.line)));
  const order = { live: 0, coming: 1, unrecorded: 2 };
  for (let i = 1; i < shelves.length; i += 1) assert.ok(order[shelves[i]] >= order[shelves[i - 1]], `${shelves[i - 1]} then ${shelves[i]}`);
  assert.equal(shelves.length, VOICE_LIBRARY.length);
});

test('the credits name their maker', () => {
  assert.ok(CREDITS.lines.every((line) => line.name === 'CaptainFredric'));
});

test('a subtitle is a line\'s words, and nothing for a line without words', () => {
  assert.equal(subtitleFor('defeat'), 'What!? But I am a knight!');
  assert.equal(subtitleFor('jump'), null, 'a grunt has no words to write');
  assert.equal(subtitleFor('effort'), null);
  assert.equal(subtitleFor('fistEffort'), null, 'nor a shout of effort');
  assert.equal(subtitleFor('no-such-line'), null);
  for (const entry of VOICE_LIBRARY) {
    if (entry.kind === 'sentence' && !entry.words.startsWith('(')) assert.equal(subtitleFor(entry.line), entry.words, entry.line);
  }
});

test('a line said in parts is subtitled part by part: two parts each their own words, a sentence a word at a time as far as it has got', () => {
  assert.equal(subtitleFor('finalDuel', 0), 'All of my life, I have sought a challenger, worthy of one glorious final duel...');
  assert.equal(subtitleFor('finalDuel', 1), '...the quest continues.');
  assert.equal(subtitleFor('regenTrick', 0), 'Wait, wait!!...');
  assert.equal(subtitleFor('regenTrick', 1), '...ahahahaha! I TRICKED you!');
  assert.equal(subtitleFor('sunderLeave', 0), 'How.');
  assert.equal(subtitleFor('sunderLeave', 3), 'How. Many. More. Times.');
  assert.equal(subtitleFor('sunderLeave', 11), 'How. Many. More. Times. Need. I. Do. This. For. You. To. LEAVE!?');
  // heard whole (the Credits), it is the whole line
  assert.equal(subtitleFor('sunderLeave'), 'How. Many. More. Times. Need. I. Do. This. For. You. To. LEAVE!?');
  // the new lines' words are the intended ones, not a transcription's
  for (const [line, words] of Object.entries({
    herald: "HERAAAAAALD! I HAD THOUGHT I'D ASKED FOR A CHALLENGE.",
    openUp: 'When will you open up? Hold still.',
    newKnighthood: 'You have achieved a new form of knight hood.',
    deftlyDodge: 'Deftly dodge.',
    thankYou: 'Thank. You.',
    neverThought: 'I had never thought this day would come...',
    standFight: "No. I've had enough. I will stand. And I will fight.",
    chivalryTest: 'In accordance with chivalry, I now allow you to surrender. I was merely testing you.',
    getThingOff: 'Get this thing off of me!',
    acceptSaint: 'I accept sainthood with my usual humility.',
  })) assert.equal(subtitleFor(line), words, line);
  // a parts line has one entry in the library, and its recordings are its parts
  for (const line of ['finalDuel', 'regenTrick', 'sunderLeave']) {
    assert.equal(VOICE_LIBRARY.filter((entry) => entry.line === line).length, 1);
    assert.equal(manifest.lines[line].length, listed.get(line).parts, `${line}: a recording for each part`);
  }
});

test('the library stands in its authored sections: his voice, then the sounds of the fight; every line in exactly one', async () => {
  const { LIBRARY_GROUPS, librarySections } = await import('./voiceLibrary.mjs');
  const { VOICE_SECTIONS } = await import('../game/sound/voiceLines.mjs');
  assert.deepEqual(LIBRARY_GROUPS.map((g) => g.title), ['The Spellblade’s Voice', 'Combat Sounds'], 'no music section: none was meant');
  assert.deepEqual(VOICE_SECTIONS.voice, ['Battle & Abilities', 'Challenges & Pursuit', 'Kills & Triumphs', 'Defeat & Death', 'Remarks & Oddities', 'Team']);
  assert.deepEqual(VOICE_SECTIONS.sounds, ['Exertions', 'Injury']);
  const shelves = librarySections(() => true);
  const seen = shelves.flatMap((shelf) => shelf.entries.map((entry) => entry.line));
  assert.equal(seen.length, VOICE_LIBRARY.length);
  assert.equal(new Set(seen).size, VOICE_LIBRARY.length);
  for (const shelf of shelves) {
    for (const entry of shelf.entries) {
      assert.equal(entry.section, shelf.section);
      // the sounds of the fight are performances, never quoted words
      assert.equal(shelf.group === 'sounds', entry.kind === 'exertion', `${entry.line} in ${shelf.section}`);
    }
  }
  // the sections in their order, each once
  assert.deepEqual(shelves.map((shelf) => shelf.section), [...VOICE_SECTIONS.voice, ...VOICE_SECTIONS.sounds].filter((section) => shelves.some((s) => s.section === section)));
  // a few of the new lines where they were put
  const where = (line) => VOICE_LIBRARY.find((entry) => entry.line === line).section;
  assert.equal(where('thePlan'), 'Battle & Abilities');
  assert.equal(where('bestManWin'), 'Challenges & Pursuit');
  assert.equal(where('noSpare'), 'Kills & Triumphs');
  assert.equal(where('notFall'), 'Defeat & Death');
  assert.equal(where('abolishBattle'), 'Remarks & Oddities');
  assert.equal(where('fightAsMe'), 'Team');
  assert.equal(where('heavyHurt2'), 'Injury');
  assert.equal(where('firstStrike'), 'Exertions');
  // the makers
  assert.deepEqual(CREDITS.lines.map((line) => `${line.role} ${line.name}`), ['Created and designed by CaptainFredric', 'The Spellblade — performed by CaptainFredric']);
});

test('the new lines\' words and notes are as written (a few, checked to the letter)', () => {
  const entry = (line) => VOICE_LIBRARY.find((e) => e.line === line);
  assert.equal(entry('abolishBattle').words, 'Could we abolish the battle, for one day? And spend time with those whom we cherish most?... Haha! I jest!');
  assert.equal(entry('abolishBattle').note, 'Phew. We were nearly threatened with dimensionality.');
  assert.equal(entry('renownDisowned').words, 'Your renown has been disowned. AhHAHAHA!!!!!');
  assert.equal(entry('herald').note, 'A higher authority has been requested.');
  assert.equal(entry('neverThought').note, 'It has nevertheless arrived.');
  assert.equal(entry('openUp').note, 'Cooperation would simplify matters.');
  assert.equal(entry('standFight').note, 'Negotiations have concluded.');
  // (the frozen-enemy slush is in the game now: the menu round's Slush)
  assert.equal(entry('poorTaste').coming, null);
  assert.equal(entry('fightAsMe').coming, 'team matches');
  assert.equal(entry('heavyHurt').title, 'Heavy Injury I');
  assert.equal(entry('heavyHurt2').title, 'Heavy Injury II');
});
