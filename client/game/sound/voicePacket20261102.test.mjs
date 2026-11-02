import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { VOICE_LINES, VOICE_PRIORITY, VoiceDirector, deathLines } from './voiceRules.mjs';
import { VoiceMoments } from './voiceMoments.mjs';
import { SCENES, VoiceScenes } from './voiceScenes.mjs';
import { VoiceWatch } from './voiceWatch.mjs';
import { linesFor, voiceLine } from './voiceLines.mjs';

const voiceDir = new URL('../../assets/voice/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', voiceDir), 'utf8'));

test('all 15 new recordings are declared, ingested, present in manifest and on disk as m4a and wav', () => {
  const lines = [
    { id: 'mySwordFeels', text: 'My sword feels pain. It wants to give it to you.', trigger: 'closeSwordThreat' },
    { id: 'getAwayFromThisSpot', text: "Get away from this spot! I'm cleaning it out.", trigger: 'contestedZone' },
    { id: 'theyAreRuiningTheColor', text: "They're ruining the color of those circles!", trigger: 'threatenedCircleApproach' },
    { id: 'nowWhere', text: 'Now, where was I?', trigger: 'quickCloseMultikill' },
    { id: 'theOnlyRetreat', text: 'The only retreat that I know of is the re-treating to the taste of defeat! ...Not that I know it yet.', trigger: 'withdrawingUnderPressure' },
    { id: 'haveYouNoShame', text: 'Have you no shame!?', trigger: 'shameOpening' },
    { id: 'notOnMe', text: 'Not on me!', trigger: 'shameAnswer' },
    { id: 'thenLetMeHaveIt', text: 'Then let ME have it!', trigger: 'shamePayoff' },
    { id: 'iNeedAMoment', text: 'I need a moment.', trigger: 'death' },
    { id: 'youMayNoLonger', text: 'You may no longer follow my footsteps. Only defeat.', trigger: 'pursuitThreat' },
    { id: 'neverYield', text: 'I never yield!', trigger: 'ramCharging' },
    { id: 'hahahaANewBattlefieldAwaits', text: 'Hahaha! A new battlefield awaits!', trigger: 'abyssFall' },
    { id: 'enoughFlying', text: 'Enough flying! I must dissect you and your contraption!', trigger: 'antiAirAttack' },
    { id: 'ifYouContinueResist', text: 'If you continue to resist, then it will be more difficult for me to defeat you. Think about it!', trigger: 'opponentsResistance' },
    { id: 'ohMyFavoriteWind', text: 'Oh, my favorite wind, I shall make space.', trigger: 'galeVictimDisplacement' },
  ];

  for (const item of lines) {
    const decl = voiceLine(item.id);
    assert.ok(decl, `${item.id} is declared in voiceLines.mjs`);
    assert.equal(decl.text, item.text);
    assert.ok(decl.triggers[item.trigger] > 0, `${item.id} has trigger ${item.trigger}`);
    assert.ok(manifest.lines[item.id]?.length > 0, `${item.id} is in manifest.json`);

    const fileBase = manifest.lines[item.id][0].file;
    const m4aPath = new URL(`${fileBase}.m4a`, voiceDir).pathname;
    const wavPath = new URL(`${fileBase}.wav`, voiceDir).pathname;
    assert.ok(existsSync(m4aPath), `${item.id} has .m4a file: ${m4aPath}`);
    assert.ok(existsSync(wavPath), `${item.id} has .wav file: ${wavPath}`);
  }
});

test('intentional comedic wordplay and pauses retain beats without clipping endings', () => {
  const retreat = voiceLine('theOnlyRetreat');
  assert.equal(retreat.beats?.length, 2);
  assert.equal(retreat.beats[0].words, 'The only retreat that I know of is the re-treating to the taste of defeat!');
  assert.equal(retreat.beats[1].words, '...Not that I know it yet.');
  assert.equal(retreat.beats[1].at, 4.80);

  const footsteps = voiceLine('youMayNoLonger');
  assert.equal(footsteps.beats?.length, 2);
  assert.equal(footsteps.beats[0].words, 'You may no longer follow my footsteps.');
  assert.equal(footsteps.beats[1].words, 'Only defeat.');
  assert.equal(footsteps.beats[1].at, 2.55);

  const resist = voiceLine('ifYouContinueResist');
  assert.equal(resist.beats?.length, 2);
  assert.equal(resist.beats[0].words, 'If you continue to resist, then it will be more difficult for me to defeat you.');
  assert.equal(resist.beats[1].words, 'Think about it!');
  assert.equal(resist.beats[1].at, 4.45);

  const abyss = voiceLine('hahahaANewBattlefieldAwaits');
  assert.equal(abyss.beats?.length, 2);
  assert.equal(abyss.beats[0].words, 'Hahaha!');
  assert.equal(abyss.beats[1].words, 'A new battlefield awaits!');
  assert.equal(abyss.beats[1].at, 1.65);
  assert.equal(abyss.outlasts, 'abyss');
});

test('three-part shame conversation sequence: Knight A -> Knight B -> Knight A with spatial distance check', () => {
  const spoken = [];
  const scenes = new VoiceScenes({
    say: (line, speaker, options) => {
      spoken.push({ line, speaker, options });
      return { seconds: 1.5, delay: 0 };
    },
  });

  const pos = (id) => (id === 'knightA' ? { x: 0, z: 0 } : { x: 5, z: 0 });
  const knights = [{ id: 'knightA', alive: true }, { id: 'knightB', alive: true }];

  // 1. Knight A declares "Have you no shame!?" at t = 10.0 (duration 1.5s)
  scenes.shameDeclared('knightA', 'knightB', 10.0, 1.5);
  assert.equal(scenes.shameSpeaking('knightA'), true);
  assert.equal(scenes.shameSpeaking('knightB'), true);

  // Before answer delay (10.0 + 1.5 + 0.35 = 11.85)
  scenes.step(11.5, knights, pos);
  assert.equal(spoken.length, 0);

  // At t = 11.85, Knight B responds "Not on me!"
  scenes.step(11.85, knights, pos);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].line, 'notOnMe');
  assert.equal(spoken[0].speaker, 'knightB');
  assert.equal(spoken[0].options.earned, true);

  // Before payoff delay (11.85 + 1.5 + 0.35 = 13.70)
  scenes.step(13.0, knights, pos);
  assert.equal(spoken.length, 1);

  // At t = 13.70, Knight A responds "Then let ME have it!"
  scenes.step(13.70, knights, pos);
  assert.equal(spoken.length, 2);
  assert.equal(spoken[1].line, 'thenLetMeHaveIt');
  assert.equal(spoken[1].speaker, 'knightA');
  assert.equal(spoken[1].options.earned, true);

  // Scene is completed
  assert.equal(scenes.shameSpeaking('knightA'), false);
});

test('shame conversation cancels if a knight dies or moves outside hearing range (> 18m)', () => {
  const spoken = [];
  const scenes = new VoiceScenes({
    say: (line, speaker, options) => {
      spoken.push({ line, speaker, options });
      return { seconds: 1.5, delay: 0 };
    },
  });

  // Cancel on death
  scenes.shameDeclared('knightA', 'knightB', 10.0, 1.5);
  scenes.step(11.0, [{ id: 'knightA', alive: true }, { id: 'knightB', alive: false }], () => ({ x: 0, z: 0 }));
  scenes.step(11.9, [{ id: 'knightA', alive: true }, { id: 'knightB', alive: false }], () => ({ x: 0, z: 0 }));
  assert.equal(spoken.length, 0, 'cancelled on knightB death');

  // Cancel on distance > 18m
  scenes.shameDeclared('knightA', 'knightB', 20.0, 1.5);
  const farPos = (id) => (id === 'knightA' ? { x: 0, z: 0 } : { x: 25, z: 0 }); // dist 25 > 18
  scenes.step(21.9, [{ id: 'knightA', alive: true }, { id: 'knightB', alive: true }], farPos);
  assert.equal(spoken.length, 0, 'cancelled when distance > 18m');
});

test('Gale victim displacement attribution: displaced victim speaks OhMyFavoriteWind, not the caster', () => {
  const moments = new VoiceMoments();
  // Caster 'wizard' casts Gale that displaces 'victim'
  const event = {
    playerId: 'wizard',
    at: 10.0,
    affected: [
      { id: 'wizard', pressure: 1.0, guarded: false },
      { id: 'victim', pressure: 1.0, guarded: false },
    ],
  };

  const groups = moments.galeCaught(event);
  const casterLines = groups.filter(g => g.some(s => s.speaker === 'wizard')).flat().map(s => s.line);
  const victimLines = groups.filter(g => g.some(s => s.speaker === 'victim')).flat().map(s => s.line);

  // Caster gets galeTaunt (for galeDisplacement tag)
  assert.ok(casterLines.includes('galeTaunt'));
  assert.ok(!casterLines.includes('ohMyFavoriteWind'));

  // Displaced victim gets ohMyFavoriteWind (for galeVictimDisplacement tag)
  assert.ok(victimLines.includes('ohMyFavoriteWind'));
  assert.ok(!victimLines.includes('galeTaunt'));

  // Lines for galeVictimDisplacement map to ohMyFavoriteWind
  const victimChoices = linesFor('victim', ['galeVictimDisplacement']).map(s => s.line);
  assert.ok(victimChoices.includes('ohMyFavoriteWind'));
});

test('I need a moment: high priority defeat line interrupts speech without area suppression', () => {
  const director = new VoiceDirector({ rand: () => 0.01 });

  // Speaker A at (0, 0) starts speaking a normal context line
  const allowedA = director.consider('openUp', 'speakerA', 10.0, { source: { x: 0, z: 0 }, duration: 4.0 });
  assert.ok(allowedA);

  // Victim at (0, 0) dies and says 'iNeedAMoment' (priority HIGH / STATE)
  const allowedMoment = director.consider('iNeedAMoment', 'victim', 10.5, { source: { x: 0, z: 0 }, duration: 2.0 });
  assert.ok(allowedMoment, 'iNeedAMoment permitted upon defeat');
  assert.ok(allowedMoment.stop.includes('speakerA'), 'interrupts lower-priority context line');

  // Crucially: nearby speaker B at (2, 2) is NOT suppressed into silence by a blanket radius (unlike notRightNow)
  // An exertion or new line can still be considered
  const nearbyB = director.consider('effort', 'speakerB', 11.0, { source: { x: 2, z: 2 } });
  assert.ok(nearbyB, 'does NOT create a blanket suppression radius silencing all nearby knights');
});

test('voice diversity: lifetime cumulative repeat penalty does not permanently silence dialogue', () => {
  const director = new VoiceDirector({ rand: () => 0.25 }); // 0.25 < 0.35 rarity

  // NowWhere has 0.35 rarity and 120s cooldown
  const first = director.consider('nowWhere', 'k', 10.0, { duration: 1.5 });
  assert.ok(first, 'first line permitted');

  // After cooldown (10 + 120 = 130s; at t = 140s), base rate is fully restored and not decayed by stat.said
  const second = director.consider('nowWhere', 'k', 140.0, { duration: 1.5 });
  assert.ok(second, 'base rate restored after cooldown and recency window without permanent match decay');
});
