import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { VOICE_LINES, VoiceDirector } from './voiceRules.mjs';
import { VoiceMoments } from './voiceMoments.mjs';
import { SCENES, VoiceScenes } from './voiceScenes.mjs';
import { linesFor, voiceLine } from './voiceLines.mjs';
import { subtitleFor } from '../../ui/voiceLibrary.mjs';

const voiceDir = new URL('../../assets/voice/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', voiceDir), 'utf8'));

// ------------------------------------------------------------------------------------------------
// 1. Audio Assets & Declarations
// ------------------------------------------------------------------------------------------------

test('all 26 new recordings (29 files) are declared, ingested, present in manifest and on disk as m4a and wav', () => {
  const lineConfigs = [
    { id: 'amIDreaming', files: ['am-i-dreaming-1'] },
    { id: 'constitutionReversal', files: ['constitution-reversal-1'] },
    { id: 'goodBurialSpot', files: ['good-burial-spot-1'] },
    { id: 'hillToDieOn', files: ['hill-to-die-on-1'] },
    { id: 'hitYouOverThere', files: ['hit-you-over-there-1'] },
    { id: 'noLongerMoving', files: ['no-longer-moving-1'] },
    { id: 'quiteATrip', files: ['quite-a-trip-1'] },
    { id: 'slashedAcrossVitalSpots', files: ['slashed-across-vital-spots-1'] },
    { id: 'stayAwayForNow', files: ['stay-away-for-now-1'] },
    { id: 'whyIsThisFire', files: ['why-is-this-fire-1'] },
    { id: 'markMyTerritory', files: ['mark-my-territory-1'] },
    { id: 'doNotStandInThat', files: ['do-not-stand-in-that-1'] },
    { id: 'thisIsADisaster', files: ['this-is-a-disaster-1'] },
    { id: 'crashSiteLookNice', files: ['crash-site-look-nice-1'] },
    { id: 'whirlLikeAWind', files: ['whirl-like-a-wind-1'] },
    { id: 'silentTreatment', files: ['silent-treatment-1'] },
    { id: 'roundAndRoundYouGo', files: ['round-and-round-you-go-1'] },
    { id: 'notDeadYet', files: ['not-dead-yet-1'] },
    { id: 'addToMyTally', files: ['add-to-my-tally-1'] },
    { id: 'stopPretendingToWin', files: ['stop-pretending-to-win-1'] },
    { id: 'groundAngel', files: ['ground-angel-1'] },
    { id: 'stubbedToe', files: ['stubbed-toe-1'] },
    { id: 'laughToScream', files: ['laugh-to-scream-1'] },
    { id: 'waitIStabbedYouV1', files: ['wait-i-stabbed-you-v1-1', 'wait-i-stabbed-you-v1-2'] },
    { id: 'waitIStabbedYouV2', files: ['wait-i-stabbed-you-v2-1', 'wait-i-stabbed-you-v2-2'] },
    { id: 'dieOverThereOrHere', files: ['die-over-there-or-here-1', 'die-over-there-or-here-2'] },
  ];

  assert.equal(lineConfigs.length, 26, 'exactly 26 new voice entries');
  let totalFiles = 0;

  for (const item of lineConfigs) {
    const decl = voiceLine(item.id);
    assert.ok(decl, `${item.id} is declared in voiceLines.mjs`);
    assert.ok(manifest.lines[item.id]?.length > 0, `${item.id} is registered in manifest.json`);

    const manifestFiles = manifest.lines[item.id].map(e => e.file);
    for (const expectedFile of item.files) {
      assert.ok(manifestFiles.includes(expectedFile), `${item.id} manifest includes ${expectedFile}`);
      const m4aPath = new URL(`${expectedFile}.m4a`, voiceDir).pathname;
      const wavPath = new URL(`${expectedFile}.wav`, voiceDir).pathname;
      assert.ok(existsSync(m4aPath), `${expectedFile}.m4a exists on disk`);
      assert.ok(existsSync(wavPath), `${expectedFile}.wav exists on disk`);
      totalFiles++;
    }

    // Credits metadata check
    assert.ok(decl.credits?.title, `${item.id} has a credits title`);
    assert.ok(decl.credits?.description, `${item.id} has a credits description`);
    assert.ok(decl.credits?.note, `${item.id} has a dry credits note`);
  }

  assert.equal(totalFiles, 29, 'exactly 29 files across the 26 entries');
});

// ------------------------------------------------------------------------------------------------
// 2. Subtitles and Beats
// ------------------------------------------------------------------------------------------------

test('subtitles and beats match delivery and preserve comedic surprises', () => {
  // Constitution reversal beat pause: revelation at 3.49s
  const constitution = voiceLine('constitutionReversal');
  assert.equal(constitution.beats?.length, 2);
  assert.equal(constitution.beats[0].words, 'You think I cannot survive without my constitution?');
  assert.equal(constitution.beats[1].words, "… You're correct.");
  assert.equal(constitution.beats[1].at, 3.49);

  // Am I dreaming beat pause: snoring at 1.85s
  const dreaming = voiceLine('amIDreaming');
  assert.equal(dreaming.beats?.length, 2);
  assert.equal(dreaming.beats[0].words, 'Am I dreaming?');
  assert.equal(dreaming.beats[1].words, '[Snoring]');
  assert.equal(dreaming.beats[1].at, 1.85);

  // Nonverbal cries: spoken subtitles are null/empty, but credits describe them
  const stubbed = voiceLine('stubbedToe');
  assert.equal(stubbed.kind, 'exertion');
  assert.equal(subtitleFor('stubbedToe'), null, 'no in-game spoken subtitle for stubbed toe cry');
  assert.ok(stubbed.credits.title.length > 0);

  const laughScream = voiceLine('laughToScream');
  assert.equal(laughScream.kind, 'exertion');
  assert.equal(subtitleFor('laughToScream'), null, 'no in-game spoken subtitle for laugh-to-scream cry');
  assert.ok(laughScream.credits.title.length > 0);

  // Multipart scenes: separate parts
  const wait1 = voiceLine('waitIStabbedYouV1');
  assert.equal(wait1.parts?.length, 2);
  assert.equal(wait1.parts[0], 'Wait a minute.');
  assert.equal(wait1.parts[1], 'Ha! I stabbed you!');
  assert.equal(subtitleFor('waitIStabbedYouV1', 0), 'Wait a minute.');
  assert.equal(subtitleFor('waitIStabbedYouV1', 1), 'Ha! I stabbed you!');

  const wait2 = voiceLine('waitIStabbedYouV2');
  assert.equal(wait2.parts?.length, 2);
  assert.equal(wait2.parts[0], 'Wait a minute.');
  assert.equal(wait2.parts[1], 'Ha! I stabbed you!');
  assert.equal(subtitleFor('waitIStabbedYouV2', 0), 'Wait a minute.');
  assert.equal(subtitleFor('waitIStabbedYouV2', 1), 'Ha! I stabbed you!');

  const dieHere = voiceLine('dieOverThereOrHere');
  assert.equal(dieHere.parts?.length, 2);
  assert.equal(dieHere.parts[0], 'Would you like to die over there or over here?');
  assert.equal(dieHere.parts[1], 'Here it is!');
  assert.equal(subtitleFor('dieOverThereOrHere', 0), 'Would you like to die over there or over here?');
  assert.equal(subtitleFor('dieOverThereOrHere', 1), 'Here it is!');
});

// ------------------------------------------------------------------------------------------------
// 3. Constitution Callback Mechanics
// ------------------------------------------------------------------------------------------------

test('constitution callback: boosted 3.5x if constitution boasted earlier this life', () => {
  // Without constitutionBoasted fact
  const unboasted = linesFor('k', { lastStand: 1 }, { facts: [] });
  const reversalUnboasted = unboasted.find(s => s.line === 'constitutionReversal');
  assert.ok(reversalUnboasted, 'available in lastStand');
  assert.equal(reversalUnboasted.chanceScale, 1.0, 'normal 1.0 chance scale when not boasted');

  // With constitutionBoasted fact
  const boasted = linesFor('k', { lastStand: 1 }, { facts: ['constitutionBoasted'] });
  const reversalBoasted = boasted.find(s => s.line === 'constitutionReversal');
  assert.ok(reversalBoasted, 'available in lastStand with boast');
  assert.equal(reversalBoasted.chanceScale, 3.5, 'boosted 3.5x when constitution was boasted');
});

// ------------------------------------------------------------------------------------------------
// 4. Multipart Scene: Wait A Minute. Ha! I Stabbed You!
// ------------------------------------------------------------------------------------------------

test('waitIStabbed: earned only on damaging sword contact with target, blocked/miss/spell does not earn payoff', () => {
  const said = [];
  const scenes = new VoiceScenes({
    say: (line, speaker, options) => {
      said.push({ line, speaker, ...options });
      return { seconds: 1.0, delay: options.delay ?? 0 };
    },
  });

  // Setup triggered
  scenes.waitStabbedStarted('attacker', 'target', 'waitIStabbedYouV1', 10.0, 1.3);
  assert.equal(said.length, 0);

  // Event: Unrelated spell damage should NOT trigger payoff
  scenes.damage({ type: 'damage', victimId: 'target', attackerId: 'attacker', source: 'fireball', amount: 30, at: 11.0 });
  assert.equal(said.length, 0, 'spell damage does not earn stabbed payoff');

  // Event: Blocked sword hit should NOT trigger payoff
  scenes.damage({ type: 'damage', victimId: 'target', attackerId: 'attacker', source: 'sword', amount: 20, blocked: true, at: 11.2 });
  assert.equal(said.length, 0, 'blocked sword hit does not earn stabbed payoff');

  // Event: Parried sword hit should NOT trigger payoff
  scenes.damage({ type: 'damage', victimId: 'target', attackerId: 'attacker', source: 'sword', amount: 20, parried: true, at: 11.3 });
  assert.equal(said.length, 0, 'parried sword hit does not earn stabbed payoff');

  // Event: Damaging sword contact against DIFFERENT victim should NOT trigger payoff
  scenes.damage({ type: 'damage', victimId: 'otherFoe', attackerId: 'attacker', source: 'sword', amount: 25, at: 11.4 });
  assert.equal(said.length, 0, 'hitting other foe does not earn stabbed payoff');

  // Event: Actual damaging sword contact against target earns payoff
  scenes.damage({ type: 'damage', victimId: 'target', attackerId: 'attacker', source: 'sword', amount: 25, at: 11.5 });
  assert.equal(said.length, 1, 'earned payoff on damaging sword hit');
  assert.equal(said[0].line, 'waitIStabbedYouV1');
  assert.equal(said[0].speaker, 'attacker');
  assert.equal(said[0].part, 1);
  assert.equal(said[0].earned, true);
});

test('waitIStabbed: preserves paired take variant (v2 setup yields v2 payoff)', () => {
  const said = [];
  const scenes = new VoiceScenes({
    say: (line, speaker, options) => {
      said.push({ line, speaker, ...options });
      return { seconds: 1.0, delay: options.delay ?? 0 };
    },
  });

  scenes.waitStabbedStarted('knight2', 'victim2', 'waitIStabbedYouV2', 20.0, 1.4);
  scenes.damage({ type: 'damage', victimId: 'victim2', attackerId: 'knight2', source: 'riposte', amount: 30, at: 21.2 });
  assert.equal(said.length, 1);
  assert.equal(said[0].line, 'waitIStabbedYouV2', 'variant 2 setup triggers variant 2 payoff');
  assert.equal(said[0].part, 1);
});

test('waitIStabbed: cancels on death of target or speaker', () => {
  const said = [];
  const scenes = new VoiceScenes({
    say: (line, speaker, options) => {
      said.push({ line, speaker, ...options });
      return { seconds: 1.0, delay: options.delay ?? 0 };
    },
  });

  scenes.waitStabbedStarted('attacker', 'target', 'waitIStabbedYouV1', 10.0, 1.3);
  // Target dies from something else before sword hit
  scenes.death({ type: 'death', victimId: 'target', killerId: 'someoneElse', at: 11.0 });

  // Later sword hit (e.g. after respawn or invalid event) should not trigger
  scenes.damage({ type: 'damage', victimId: 'target', attackerId: 'attacker', source: 'sword', amount: 25, at: 12.0 });
  assert.equal(said.length, 0, 'scene cancelled on target death');
});

// ------------------------------------------------------------------------------------------------
// 5. Multipart Scene: Would You Like To Die Over There Or Over Here?
// ------------------------------------------------------------------------------------------------

test('dieOverThere: payoff earned on defeating target, not unrelated kill or timeout', () => {
  const said = [];
  const scenes = new VoiceScenes({
    say: (line, speaker, options) => {
      said.push({ line, speaker, ...options });
      return { seconds: 1.0, delay: options.delay ?? 0 };
    },
  });

  scenes.dieOverThereStarted('hunter', 'prey', 50.0, 2.8);

  // Unrelated kill by hunter on different victim
  scenes.death({ type: 'death', victimId: 'innocentBystander', killerId: 'hunter', at: 52.0 });
  assert.equal(said.length, 0, 'unrelated kill does not earn payoff');

  // Killing the intended prey earns payoff
  scenes.death({ type: 'death', victimId: 'prey', killerId: 'hunter', at: 53.0 });
  assert.equal(said.length, 1, 'prey kill earns payoff');
  assert.equal(said[0].line, 'dieOverThereOrHere');
  assert.equal(said[0].speaker, 'hunter');
  assert.equal(said[0].part, 1);
  assert.equal(said[0].earned, true);
});

// ------------------------------------------------------------------------------------------------
// 6. Gale Silent Treatment: Cross-Speaker Interruption
// ------------------------------------------------------------------------------------------------

test('silentTreatment: interrupts ongoing speech of affected opponent', () => {
  const director = new VoiceDirector({ rand: () => 0.05 });

  // Opponent starts speaking an ordinary sentence
  const opponentSpeech = director.consider('openUp', 'opponent', 10.0, { duration: 3.5 });
  assert.ok(opponentSpeech, 'opponent started speaking');
  assert.equal(director.saying('opponent', 10.5), 'openUp');

  // Caster displaces opponent with Gale raising silentTreatment with disruptedSpeaker
  const galeLine = director.consider('silentTreatment', 'caster', 11.0, {
    disruptedSpeaker: 'opponent',
    duration: 3.0,
  });
  assert.ok(galeLine, 'silentTreatment permitted');
  assert.ok(galeLine.stop.includes('opponent'), 'disruptedSpeaker opponent is included in stop list');

  // Opponent is interrupted
  assert.equal(director.saying('opponent', 11.1), null, 'opponent speech interrupted');
  assert.equal(director.saying('caster', 11.1), 'silentTreatment', 'caster speaking silentTreatment');
});

// ------------------------------------------------------------------------------------------------
// 7. Whirl Like A Wind Activation
// ------------------------------------------------------------------------------------------------

test('whirlLikeAWind: declared for whirlActivated with once-per-cast semantics', () => {
  const line = voiceLine('whirlLikeAWind');
  assert.ok(line.triggers.whirlActivated > 0, 'has whirlActivated trigger');
  assert.equal(line.text, 'Whirl like a wind!');
  // Should NOT trigger on normal sword strikes or continuous spin
  assert.equal(line.triggers.sword, undefined);
  assert.equal(line.triggers.vortexSpin, undefined);
});

// ------------------------------------------------------------------------------------------------
// 8. Flight to Valkyrie Crash Site Timing
// ------------------------------------------------------------------------------------------------

test('crashSiteLookNice: primary trigger fightFlightTerminalCommitted with ~70% selection weight', () => {
  const line = voiceLine('crashSiteLookNice');
  assert.equal(line.rarity, 0.70, '70% probability on terminal flight commit');
  assert.ok(line.triggers.fightFlightTerminalCommitted > 0);
  assert.ok(line.triggers.lightningSlamArrival > 0);
});

// ------------------------------------------------------------------------------------------------
// 9. Fire Reaction Throttling and Interruption
// ------------------------------------------------------------------------------------------------

test('whyIsThisFire: triggered by fireReaction with cooldown throttling and cuts speaker exertion', () => {
  const line = voiceLine('whyIsThisFire');
  assert.ok(line.triggers.fireReaction > 0, 'has fireReaction trigger');
  const cooldown = Array.isArray(line.cooldown) ? line.cooldown[0] : line.cooldown;
  assert.ok(cooldown >= 60, 'has cooldown to prevent repetitive firing');

  const director = new VoiceDirector({ rand: () => 0.05 });
  // Speaker is making an effort exertion
  const effort = director.consider('effort', 'k', 10.0, { duration: 1.5 });
  assert.ok(effort);

  // Fire reaction interrupts own exertion
  const fire = director.consider('whyIsThisFire', 'k', 10.2, { duration: 2.0 });
  assert.ok(fire, 'whyIsThisFire interrupts own exertion');
  assert.equal(director.saying('k', 10.3), 'whyIsThisFire');
});

// ------------------------------------------------------------------------------------------------
// 10. Nonverbal Exertion Interruptions
// ------------------------------------------------------------------------------------------------

test('stubbedToe and laughToScream: registered as kind exertion with exceptional interruption moments', () => {
  const stubbed = voiceLine('stubbedToe');
  assert.equal(stubbed.kind, 'exertion');
  assert.ok(stubbed.triggers.stubToePain > 0);

  const laugh = voiceLine('laughToScream');
  assert.equal(laugh.kind, 'exertion');
  assert.ok(laugh.triggers.violentReversal > 0);
});
