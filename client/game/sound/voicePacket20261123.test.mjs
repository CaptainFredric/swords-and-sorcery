import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { VOICE_LINES, VoiceDirector } from './voiceRules.mjs';
import { VoiceMoments, deathPose } from './voiceMoments.mjs';
import { SCENES, VoiceScenes } from './voiceScenes.mjs';
import { VoiceWatch } from './voiceWatch.mjs';
import { VoiceBank } from './VoiceBank.mjs';
import { linesFor, voiceLine } from './voiceLines.mjs';
import { subtitleFor, captionsFor, captionPlan } from '../../ui/voiceLibrary.mjs';

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

  // Subtitled comedic cries: kept as kind 'exertion' while providing visible captions and keeping ordinary exertions unsubtitled
  const stubbed = voiceLine('stubbedToe');
  assert.equal(stubbed.kind, 'exertion');
  assert.equal(stubbed.subtitle, true);
  assert.equal(subtitleFor('stubbedToe'), 'AHHAAAAAAAH!!');
  assert.ok(stubbed.credits.title.length > 0);

  const laughScream = voiceLine('laughToScream');
  assert.equal(laughScream.kind, 'exertion');
  assert.equal(laughScream.subtitle, true);
  assert.equal(subtitleFor('laughToScream'), 'AHAH, HAH, HAAAAGH!');
  assert.deepEqual(captionsFor('laughToScream'), ['AHAH,', 'AHAH, HAH,', 'AHAH, HAH, HAAAAGH!']);
  assert.deepEqual(captionPlan('laughToScream', { beats: [0, 0.75, 1.21] }), {
    text: 'AHAH,',
    after: 0,
    cues: [
      { at: 0.75, text: 'AHAH, HAH,' },
      { at: 1.21, text: 'AHAH, HAH, HAAAAGH!' },
    ],
  });
  assert.ok(laughScream.credits.title.length > 0);

  // Ordinary combat exertions stay unsubtitled
  for (const ordinary of ['effort', 'hurt', 'coldHurt', 'heavyHurt', 'jump']) {
    assert.equal(subtitleFor(ordinary), null, `${ordinary} stays unsubtitled`);
  }

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

// ------------------------------------------------------------------------------------------------
// 11. Contextual Refinement Coverage (Nov 24 Review)
// ------------------------------------------------------------------------------------------------

test('stubbedToe: accompanies comparatively minor sudden painful impacts with minorUnhurt boost', () => {
  const moments = new VoiceMoments({ rand: () => 0.01 });
  const groups = moments.damage(
    { attackerId: 'foe', victimId: 'me', source: 'sword', amount: 8, health: 90, at: 10 },
    { knight: (id) => ({ id, health: 98, alive: true }) },
  );
  const stub = groups.flat().find((s) => s.line === 'stubbedToe');
  assert.ok(stub, 'stubbedToe offered for minor sudden impact');
  assert.ok(stub.chanceScale >= 2.0, 'minorUnhurt boost scales stubbedToe odds up');
});

test('laughToScream: accommodates broader reversals and interrupts existing laughter recordings with scream portion', () => {
  const director = new VoiceDirector({ rand: () => 0.01 });
  // Knight starts laughing (even high-priority laughter like heavyHurt2 or normal laugh)
  assert.ok(director.consider('laugh', 'me', 10.0, { duration: 2.2 }));
  assert.equal(director.saying('me', 10.5), 'laugh');

  // Parried / Shocked reversal mid-laugh cuts straight to the scream portion
  const verdict = director.consider('laughToScream', 'me', 10.6, { duration: 2.53, chanceScale: 4.0 });
  assert.ok(verdict, 'laughToScream allowed over active laugh');
  assert.ok(verdict.stop.includes('me'), 'stops own ongoing laugh');
  assert.equal(verdict.screamOnly, true, 'signals scream-only slice when cutting active laugh');

  // VoiceBank starts audio at the scream beat offset (~1.21s) and subtitles only HAAAAGH!
  const played = [];
  const spoken = [];
  const engine = {
    now: 10.0,
    running: true,
    muted: false,
    levels: { master: 1, voice: 1 },
    onReady() {},
    playBuffer: (buf, opts) => { played.push(opts); return { stop() {}, place() {} }; },
    duck: () => {},
  };
  const bank = new VoiceBank(engine, { director: new VoiceDirector({ rand: () => 0.01 }) });
  bank.onSpoken = (s) => spoken.push(s);
  bank.takes.set('laugh', [{ duration: 2.0 }]);
  bank.takes.set('laughToScream', [{ duration: 2.53 }]);
  bank.takeBeats.set('laughToScream', [[0, 0.75, 1.21]]);

  assert.ok(bank.say('laugh', { speaker: 'me', force: true }));
  bank.engine.now = 10.5;
  const res = bank.say('laughToScream', { speaker: 'me', chanceScale: 4.0 });
  assert.ok(res?.screamOnly, 'VoiceBank reports screamOnly splice');
  assert.ok(Math.abs(played.at(-1).offset - 1.21) < 0.05, 'audio starts at scream onset');
  assert.equal(spoken.at(-1).textOverride, 'HAAAAGH!', 'subtitle shows only scream portion');
});

test('hitYouOverThere: elevated priority when Spellblade himself displaced foe beyond melee reach', () => {
  const moments = new VoiceMoments({ rand: () => 0.01 });
  const knights = new Map([
    ['caster', { id: 'caster', position: { x: 0, y: 0, z: 0 }, alive: true }],
    ['foe', { id: 'foe', position: { x: 6.5, y: 0, z: 0 }, alive: true }],
  ]);
  const groups = moments.galeCaught(
    { playerId: 'caster', affected: [{ id: 'foe', guarded: false, pressure: 0.9 }], at: 12 },
    { knight: (id) => knights.get(id), positionOf: (id) => knights.get(id)?.position },
  );
  const candidate = groups.flat().find((s) => s.line === 'hitYouOverThere');
  assert.ok(candidate, 'hitYouOverThere offered after displacing foe past melee reach');
  assert.equal(candidate.highPriority, true, 'receives elevated director priority');
  assert.ok(candidate.chanceScale >= 4.0, 'selfDisplaced boost raises chanceScale significantly');

  // Confirm VoiceDirector grants EARNED (2.5) > CONTEXT (2) priority when highPriority is set
  const director = new VoiceDirector({ rand: () => 0.05 });
  assert.ok(director.consider('openUp', 'caster', 12.0, { duration: 3.0 }));
  assert.ok(director.consider('hitYouOverThere', 'caster', 12.5, { ...candidate, duration: 2.5 }), 'outranks ordinary context chatter');
});

test('groundAngel: prioritizes actual flat-backed poses and rejects faceplants and white-flag defeats', () => {
  const moments = new VoiceMoments({ rand: () => 0.01 });
  const backArr = moments.disasterArrival('me', { flatBack: true }).flat();
  const angelBack = backArr.find((s) => s.line === 'groundAngel');
  assert.ok(angelBack && angelBack.chanceScale >= 2.0, 'flatBack Lightning gag strongly prioritizes groundAngel');

  const faceArr = moments.disasterArrival('me', { faceplant: true }).flat();
  assert.equal(faceArr.find((s) => s.line === 'groundAngel'), undefined, 'faceplant does not trigger groundAngel');

  const whiteFlagPose = deathPose({ position: { x: 0, y: 0, z: 0 }, yaw: 0 }, { x: 0, z: -2 }, { at: 5, whiteFlag: true });
  assert.equal(whiteFlagPose.back, false, 'standing white-flag defeat never counts as lying on back');
});

test('silentTreatment: strictly requires genuine interruption of another knight dialogue', () => {
  const director = new VoiceDirector({ rand: () => 0.05 });
  // Nobody speaking
  assert.equal(director.consider('silentTreatment', 'caster', 10.0, { disruptedSpeaker: 'foe', duration: 2 }), null);
  // Target only grunting (not dialogue)
  assert.ok(director.consider('effort', 'foe', 10.0, { duration: 1.5, force: true }));
  assert.equal(director.consider('silentTreatment', 'caster', 10.2, { disruptedSpeaker: 'foe', duration: 2 }), null);

  // galeCaught with silent victim must NOT offer silentTreatment fallback
  const moments = new VoiceMoments({ rand: () => 0.05 });
  const groups = moments.galeCaught(
    { playerId: 'caster', affected: [{ id: 'foe', guarded: false, pressure: 0.9 }], at: 15 },
    { speakingCheck: () => false },
  );
  assert.equal(groups.flat().find((s) => s.line === 'silentTreatment'), undefined, 'no silentTreatment fallback when target is silent');
});

test('doNotStandInThat: never warns allies away from friendly Area of Denial; warns for hostile hazards', () => {
  const watch = new VoiceWatch();
  const allies = [
    { id: 'me', team: 'red', alive: true, position: { x: 0, y: 0, z: 0 } },
    { id: 'ally', team: 'red', alive: true, position: { x: 4, y: 0, z: 0 } },
  ];
  // Friendly Area of Denial near ally
  const friendlyEvents = watch.step(10, allies, {
    flightBurnZones: [{ id: 'f1', sourceId: 'me', team: 'red', point: { x: 5, y: 0, z: 0 }, radius: 4, startedAt: 8, expiresAt: 18 }],
  });
  assert.equal(friendlyEvents.filter((e) => e.tags.includes('allyHazardApproach')).length, 0, 'friendly AoD never triggers warning');

  // Hostile Area of Denial near ally
  const hostileEvents = watch.step(10.5, allies, {
    flightBurnZones: [{ id: 'h1', sourceId: 'enemy', team: 'blue', point: { x: 5, y: 0, z: 0 }, radius: 4, startedAt: 8, expiresAt: 18 }],
  });
  assert.ok(hostileEvents.some((e) => e.speaker === 'me' && e.tags.includes('allyHazardApproach')), 'hostile AoD triggers warning');
});

test('notDeadYet: integrates cleanly with In Denial status including zero-damage attacks', () => {
  const moments = new VoiceMoments({ rand: () => 0.05 });
  const onEvent = moments.inDenial({ type: 'inDenial', playerId: 'me', attackerId: 'foe', at: 20 }).flat();
  const entry = onEvent.find((s) => s.line === 'notDeadYet');
  assert.ok(entry && entry.chanceScale >= 2.5, 'inDenial event triggers notDeadYet with boost');

  const zeroDmg = moments.damage({ attackerId: 'foe', victimId: 'me', source: 'sword', amount: 0, health: 0, inDenial: true, at: 21 }, { knight: () => ({ id: 'me', inDenial: true }) }).flat();
  assert.ok(zeroDmg.some((s) => s.line === 'notDeadYet'), '0-damage hit while In Denial still triggers notDeadYet');
});

test('noLongerMoving: requires genuine Full Flash Freeze immobilization, not chill alone', () => {
  const watch = new VoiceWatch();
  const chilledOnly = [
    { id: 'me', team: 'red', alive: true, position: { x: 0, y: 0, z: 0 }, oneHitFrozenUntil: -Infinity, chill: 0.45 },
    { id: 'foe', team: 'blue', alive: true, position: { x: 3, y: 0, z: 0 }, oneHitFrozenUntil: -Infinity, chill: 0.5 },
  ];
  const chillOut = watch.step(5, chilledOnly, {});
  assert.equal(chillOut.filter((e) => e.tags.includes('targetFrozen')).length, 0, 'chill alone does not trigger targetFrozen');

  const frozen = [
    { id: 'me', team: 'red', alive: true, position: { x: 0, y: 0, z: 0 }, oneHitFrozenUntil: -Infinity },
    { id: 'foe', team: 'blue', alive: true, position: { x: 3, y: 0, z: 0 }, oneHitFrozenUntil: 6.0 },
  ];
  const freezeOut = watch.step(5.1, frozen, {});
  assert.ok(freezeOut.some((e) => e.speaker === 'me' && e.tags.includes('targetFrozen')), 'genuine Flash Freeze triggers targetFrozen');
});

test('vortexCatch credits attacker and fireReaction handles Area of Denial burn ticks', () => {
  const moments = new VoiceMoments({ rand: () => 0.05 });
  const vortex = moments.damage({ attackerId: 'spinner', victimId: 'victim', source: 'vortex', amount: 18, health: 70, at: 8 }).flat();
  assert.ok(vortex.some((s) => s.speaker === 'spinner' && s.line === 'roundAndRoundYouGo'), 'caster says Round and round you go');

  const burn = moments.fireHazardDamage({ attackerId: 'foe', victimId: 'me', source: 'fight-flight-burning-ground', amount: 4, health: 60, at: 9 }).flat();
  assert.ok(burn.some((s) => s.speaker === 'me' && s.line === 'whyIsThisFire'), 'ongoing AoD fire tick triggers fireReaction');
});
