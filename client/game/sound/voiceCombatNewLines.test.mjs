import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  VOICE_LINE_LIST, linesFor, validateVoiceLines, voiceLine,
} from './voiceLines.mjs';
import { victorLines, victorTags } from './voiceRules.mjs';
import { MOMENTS, VoiceMoments } from './voiceMoments.mjs';
import { VoiceWatch } from './voiceWatch.mjs';
import { captionPlan, captionsFor } from '../../ui/voiceLibrary.mjs';
import {
  getWinStreak, setWinStreak, recordMatchResult, resetWinStreaks,
} from './matchStreak.mjs';

const voiceDir = new URL('../../assets/voice/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', voiceDir), 'utf8'));
const files = readdirSync(voiceDir);

test('new combat voice lines: exact declarations, Credits metadata, and manifest validity', () => {
  const { errors } = validateVoiceLines({ manifest, files });
  assert.deepEqual(errors, []);

  // 1. rememberThis
  const remember = voiceLine('rememberThis');
  assert.equal(remember.text, 'Remember this!... I forgot.');
  assert.deepEqual(Object.keys(remember.triggers), ['blowTaken']);
  assert.equal(remember.priority, 'normal');
  assert.equal(remember.rarity, 0.16);
  assert.equal(remember.cooldown, 120);
  assert.equal(remember.section, 'Battle & Abilities');
  assert.equal(remember.credits.title, 'Remember This');
  assert.equal(remember.credits.description, 'Occasionally after taking a hit and remaining standing.');
  assert.equal(remember.credits.note, 'He did not.');

  // 2. armorHoldingBack
  const armor = voiceLine('armorHoldingBack');
  assert.equal(armor.text, 'How did you do that? Was my armor holding back?');
  assert.deepEqual(Object.keys(armor.triggers), ['heavyHurt']);
  assert.equal(armor.priority, 'normal');
  assert.equal(armor.rarity, 0.22);
  assert.equal(armor.cooldown, 120);
  assert.equal(armor.section, 'Battle & Abilities');
  assert.equal(armor.credits.title, 'Holding Back');
  assert.equal(armor.credits.description, 'Sometimes after surviving a particularly heavy blow.');
  assert.equal(armor.credits.note, 'The armor has been accused.');

  // 3. chivalryItinerary
  const itinerary = voiceLine('chivalryItinerary');
  assert.equal(itinerary.text, 'Was this on my itinerary? ...No!?');
  assert.deepEqual(Object.keys(itinerary.triggers), ['chivalryDeath']);
  assert.equal(itinerary.priority, 'high');
  assert.equal(itinerary.rarity, 0.45);
  assert.equal(itinerary.cooldown, 180);
  assert.equal(itinerary.section, 'Defeat & Death');
  assert.equal(itinerary.credits.title, 'Itinerary');
  assert.equal(itinerary.credits.description, 'Sometimes when he is felled during Spells & Chivalry.');
  assert.equal(itinerary.credits.note, 'Defeat was not scheduled.');

  // 4. exercise
  const exercise = voiceLine('exercise');
  assert.equal(exercise.text, 'It is never too late for exercise! Except you.');
  assert.ok(exercise.triggers.corpseExercise > 0, 'exercise has corpseExercise trigger');
  assert.ok(exercise.triggers.fleeingKill > 0, 'exercise has fleeingKill trigger');
  assert.equal(exercise.priority, 'normal');
  assert.equal(exercise.rarity, 0.4);
  assert.equal(exercise.cooldown, 120);
  assert.equal(exercise.section, 'Kills & Triumphs');
  assert.equal(exercise.credits.title, 'Exercise');
  assert.equal(exercise.credits.description, 'Sometimes after catching a fleeing sprinter, or after repeated crouches beside someone already down.');
  assert.equal(exercise.credits.note, 'One participant is no longer improving.');

  // 5. anybodyThere
  const anybody = voiceLine('anybodyThere');
  assert.equal(anybody.text, 'Is anybody there? You keep falling over!');
  assert.deepEqual(Object.keys(anybody.triggers), ['sameFoeAgain']);
  assert.equal(anybody.priority, 'normal');
  assert.equal(anybody.rarity, 0.45);
  assert.equal(anybody.cooldown, 150);
  assert.equal(anybody.section, 'Kills & Triumphs');
  assert.equal(anybody.credits.title, 'Anybody There?');
  assert.equal(anybody.credits.description, 'Sometimes after repeatedly felling the same opponent.');
  assert.equal(anybody.credits.note, 'Their attendance is becoming difficult to verify.');

  // 6. surviveInSpirit
  const spirit = voiceLine('surviveInSpirit');
  assert.equal(spirit.text, 'I was willing to let you survive, but now that you have scratched me, you may survive in spirit only.');
  assert.deepEqual(Object.keys(spirit.triggers), ['winStreakFirstHurt']);
  assert.equal(spirit.priority, 'normal');
  assert.equal(spirit.rarity, 0.6);
  assert.equal(spirit.cooldown, 300);
  assert.equal(spirit.section, 'Challenges & Pursuit');
  assert.equal(spirit.credits.title, 'Survive in Spirit');
  assert.equal(spirit.credits.description, 'Sometimes on the first hit of a match entered on a winning streak.');
  assert.equal(spirit.credits.note, 'The terms of survival have narrowed.');

  // Verify all files on disk
  for (const id of ['rememberThis', 'armorHoldingBack', 'chivalryItinerary', 'exercise', 'anybodyThere', 'surviveInSpirit']) {
    const takes = manifest.lines[id];
    assert.ok(takes?.length > 0, `${id} must have manifest entries`);
    for (const take of takes) {
      assert.ok(files.includes(`${take.file}.wav`), `${take.file}.wav must exist`);
      assert.ok(files.includes(`${take.file}.m4a`), `${take.file}.m4a must exist`);
    }
  }
});

test('comedic beat timing and caption plan for punchlines', () => {
  // rememberThis: punchline delayed until 2.58s
  const remember = voiceLine('rememberThis');
  assert.equal(remember.beats.length, 2);
  assert.equal(remember.beats[0].words, 'Remember this!...');
  assert.equal(remember.beats[1].at, 2.58);
  assert.equal(remember.beats[1].words, 'I forgot.');

  const rememberCaptions = captionsFor('rememberThis');
  assert.deepEqual(rememberCaptions, ['Remember this!...', 'I forgot.']);
  const rememberPlan = captionPlan('rememberThis', { beats: [0, 2.58] });
  assert.equal(rememberPlan.text, 'Remember this!...');
  assert.equal(rememberPlan.after, 0);
  assert.deepEqual(rememberPlan.cues, [{ at: 2.58, text: 'I forgot.' }]);

  // chivalryItinerary: punchline delayed until 2.48s
  const itinerary = voiceLine('chivalryItinerary');
  assert.equal(itinerary.beats.length, 2);
  assert.equal(itinerary.beats[0].words, 'Was this on my itinerary?');
  assert.equal(itinerary.beats[1].at, 2.48);
  assert.equal(itinerary.beats[1].words, '...No!?');

  const itineraryCaptions = captionsFor('chivalryItinerary');
  assert.deepEqual(itineraryCaptions, ['Was this on my itinerary?', '...No!?']);
  const itineraryPlan = captionPlan('chivalryItinerary', { beats: [0, 2.48] });
  assert.equal(itineraryPlan.text, 'Was this on my itinerary?');
  assert.equal(itineraryPlan.after, 0);
  assert.deepEqual(itineraryPlan.cues, [{ at: 2.48, text: '...No!?' }]);

  // exercise: pause before "Except you." at 2.80s
  const exercise = voiceLine('exercise');
  assert.equal(exercise.beats.length, 2);
  assert.equal(exercise.beats[0].words, 'It is never too late for exercise!');
  assert.equal(exercise.beats[1].at, 2.80);
  assert.equal(exercise.beats[1].words, 'Except you.');

  const exerciseCaptions = captionsFor('exercise');
  assert.deepEqual(exerciseCaptions, ['It is never too late for exercise!', 'Except you.']);
  const exercisePlan = captionPlan('exercise', { beats: [0, 2.80] });
  assert.equal(exercisePlan.text, 'It is never too late for exercise!');
  assert.equal(exercisePlan.after, 0);
  assert.deepEqual(exercisePlan.cues, [{ at: 2.80, text: 'Except you.' }]);
});

test('rememberThis: arises from a survived ordinary hit, NOT from same-foe kills', () => {
  const moments = new VoiceMoments({ rand: () => 0.01 });

  // 1. Surviving an ordinary hit
  const damageResult = moments.damage({
    type: 'damage',
    attackerId: 'attacker',
    victimId: 'victim',
    source: 'sword',
    amount: 15,
    health: 85,
    at: 5.0,
  });
  const victimLines = damageResult.flatMap((group) => group.map((say) => say.line));
  assert.ok(victimLines.includes('rememberThis'), 'rememberThis is eligible when surviving an ordinary blow (blowTaken)');

  // 2. NOT in victor lines for sameFoeAgain kills
  const deathResult = moments.death({
    type: 'death',
    victimId: 'victim',
    killerId: 'attacker',
    source: 'sword',
    at: 10.0,
  });
  const victorCandidateLines = deathResult.victor.map((say) => say.line);
  assert.equal(victorCandidateLines.includes('rememberThis'), false, 'rememberThis does not trigger on kill');

  // Consecutive kill of same victim
  const secondDeath = moments.death({
    type: 'death',
    victimId: 'victim',
    killerId: 'attacker',
    source: 'sword',
    at: 20.0,
  });
  const secondVictorLines = secondDeath.victor.map((say) => say.line);
  assert.equal(secondVictorLines.includes('rememberThis'), false, 'rememberThis does not trigger on sameFoeAgain');
});

test('armorHoldingBack: arises from a heavy survived hit, NOT from fleeing kills', () => {
  const moments = new VoiceMoments({ rand: () => 0.01 });

  // 1. Heavy hit taken and survived (amount >= 24)
  const heavyDamage = moments.damage({
    type: 'damage',
    attackerId: 'attacker',
    victimId: 'victim',
    source: 'sword',
    amount: 28,
    health: 72,
    at: 5.0,
  });
  const heavyLines = heavyDamage.flatMap((group) => group.map((say) => say.line));
  assert.ok(heavyLines.includes('armorHoldingBack'), 'armorHoldingBack arises from a heavy survived hit (heavyHurt)');

  // moments.hurt() also yields heavyHurt
  const hurtTags = moments.hurt({ victimId: 'victim', amount: 28, at: 5.0 });
  assert.ok(hurtTags.includes('heavyHurt'));
  const linesFromHurt = linesFor('victim', hurtTags).map((l) => l.line);
  assert.ok(linesFromHurt.includes('armorHoldingBack'));

  // 2. Light hit (amount < 24) does not yield armorHoldingBack
  const lightHurtTags = moments.hurt({ victimId: 'victim', amount: 12, at: 6.0 });
  assert.ok(!lightHurtTags.includes('heavyHurt'));
  const linesFromLightHurt = linesFor('victim', lightHurtTags).map((l) => l.line);
  assert.equal(linesFromLightHurt.includes('armorHoldingBack'), false, 'armorHoldingBack is not triggered on light hits');

  // 3. NOT from fleeing kills
  const fleeingTags = victorTags({ source: 'sword', moment: { fleeing: true } });
  const fleeingLines = linesFor('killer', fleeingTags).map((l) => l.line);
  assert.equal(fleeingLines.includes('armorHoldingBack'), false, 'armorHoldingBack does not trigger on fleeingKill');
});

test('chivalryItinerary: occurs only on death during Spells & Chivalry', () => {
  const moments = new VoiceMoments({ rand: () => 0.01 });

  // 1. Death during Chivalry
  const chivalryFall = moments.death({
    type: 'death',
    victimId: 'victim',
    killerId: 'attacker',
    source: 'sword',
    at: 10.0,
  }, { extra: { chivalry: true } });
  const fallenChivalry = chivalryFall.fallen.map((say) => say.line);
  assert.ok(fallenChivalry.includes('chivalryItinerary'), 'chivalryItinerary triggers on death during Chivalry');

  // 2. Ordinary death outside Chivalry
  const normalFall = moments.death({
    type: 'death',
    victimId: 'victim',
    killerId: 'attacker',
    source: 'sword',
    at: 20.0,
  }, { extra: { chivalry: false } });
  const fallenNormal = normalFall.fallen.map((say) => say.line);
  assert.equal(fallenNormal.includes('chivalryItinerary'), false, 'chivalryItinerary does not trigger outside Chivalry');

  // 3. NOT on fleeing kills
  const fleeingTags = victorTags({ source: 'sword', moment: { fleeing: true } });
  const fleeingLines = linesFor('killer', fleeingTags).map((l) => l.line);
  assert.equal(fleeingLines.includes('chivalryItinerary'), false, 'chivalryItinerary is not a kill line');
});

test('exercise: available from both corpse crouching and a true fleeing kill', () => {
  // 1. Corpse crouching
  const watch = new VoiceWatch();
  watch.death('corpse', 10.0, { x: 0, y: 0, z: 0 });

  // 3 crouches within 4.0s at reach <= 2.5m
  watch.step(10.5, [{ id: 'hero', alive: true, position: { x: 1, y: 0, z: 1 }, crouched: true }]);
  watch.step(11.0, [{ id: 'hero', alive: true, position: { x: 1, y: 0, z: 1 }, crouched: false }]);
  watch.step(11.5, [{ id: 'hero', alive: true, position: { x: 1, y: 0, z: 1 }, crouched: true }]);
  watch.step(12.0, [{ id: 'hero', alive: true, position: { x: 1, y: 0, z: 1 }, crouched: false }]);
  const heard = watch.step(12.5, [{ id: 'hero', alive: true, position: { x: 1, y: 0, z: 1 }, crouched: true }]);

  const exerciseTag = heard.find((m) => m.tags.includes('corpseExercise'));
  assert.ok(exerciseTag, 'repeated crouching over corpse yields corpseExercise');
  const crouchLines = linesFor('hero', ['corpseExercise']).map((l) => l.line);
  assert.ok(crouchLines.includes('exercise'), 'exercise is available from corpse crouching');

  // 2. True fleeing kill
  const fleeingTags = victorTags({ source: 'sword', moment: { fleeing: true } });
  assert.equal(fleeingTags.fleeingKill, 1);
  const killLines = linesFor('hero', fleeingTags).map((l) => l.line);
  assert.ok(killLines.includes('exercise'), 'exercise is available from fleeingKill');

  // 3. Fleeing discriminator: away vs lateral vs approaching
  const killerPos = { x: 0, z: 0 };
  const now = 20.0;
  // Sprinting directly away: +z away from (0,0)
  watch.step(now, [{ id: 'runnerAway', alive: true, position: { x: 0, y: 0, z: 10 }, velocity: { x: 0, y: 0, z: 6 }, sprinting: true }]);
  assert.equal(watch.fleeing('runnerAway', killerPos, now + 0.1), true, 'sprinting directly away is fleeing');

  // Sprinting laterally: +x across from (0,0)
  watch.step(now, [{ id: 'runnerLateral', alive: true, position: { x: 0, y: 0, z: 10 }, velocity: { x: 6, y: 0, z: 0 }, sprinting: true }]);
  assert.equal(watch.fleeing('runnerLateral', killerPos, now + 0.1), false, 'lateral sprint is not fleeing');

  // Sprinting toward killer: -z toward (0,0)
  watch.step(now, [{ id: 'runnerToward', alive: true, position: { x: 0, y: 0, z: 10 }, velocity: { x: 0, y: 0, z: -6 }, sprinting: true }]);
  assert.equal(watch.fleeing('runnerToward', killerPos, now + 0.1), false, 'sprinting toward killer is not fleeing');

  // Walking away (not sprinting)
  watch.step(now, [{ id: 'walkerAway', alive: true, position: { x: 0, y: 0, z: 10 }, velocity: { x: 0, y: 0, z: 6 }, sprinting: false }]);
  assert.equal(watch.fleeing('walkerAway', killerPos, now + 0.1), false, 'walking is not fleeing');
});

test('anybodyThere: belongs to repeated consecutive kills of same opponent, reset on other kill or death', () => {
  const moments = new VoiceMoments({ rand: () => 0.01 });

  // Kill 1: Player A kills Player B
  const d1 = moments.death({ victimId: 'b', killerId: 'a', source: 'sword', at: 10 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  assert.equal(d1.victor.some((l) => l.line === 'anybodyThere'), false, 'First kill is not same foe again');

  // Kill 2: Player A kills Player B again consecutively
  const d2 = moments.death({ victimId: 'b', killerId: 'a', source: 'sword', at: 20 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  assert.ok(d2.victor.some((l) => l.line === 'anybodyThere'), 'Second consecutive kill of same opponent triggers anybodyThere');

  // Killing somebody else resets the consecutive run
  moments.death({ victimId: 'c', killerId: 'a', source: 'sword', at: 30 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  const dAfterOther = moments.death({ victimId: 'b', killerId: 'a', source: 'sword', at: 40 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  assert.equal(dAfterOther.victor.some((l) => l.line === 'anybodyThere'), false, 'Run was reset after killing someone else');

  // Killer being felled resets the run
  moments.death({ victimId: 'b', killerId: 'a', source: 'sword', at: 50 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  // Killer A is felled by Player C
  moments.death({ victimId: 'a', killerId: 'c', source: 'sword', at: 55 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  // Killer A respawns and kills Player B
  const dAfterDeath = moments.death({ victimId: 'b', killerId: 'a', source: 'sword', at: 65 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  assert.equal(dAfterDeath.victor.some((l) => l.line === 'anybodyThere'), false, 'Run was reset after killer was felled');
});

test('surviveInSpirit: requires 2+ prior scored wins, first survived hit, once per match', () => {
  resetWinStreaks();
  const moments = new VoiceMoments({ rand: () => 0.01 });

  // 1. Entering on a win streak of 2 in a scored match, taking first non-lethal blow
  const damage1 = moments.damage(
    { attackerId: 'foe', victimId: 'streaker', amount: 15, health: 85, source: 'sword', at: 5.0 },
    { practice: false, winStreak: (id) => (id === 'streaker' ? 2 : 0) }
  );
  assert.ok(
    damage1.some((group) => group.some((say) => say.line === 'surviveInSpirit')),
    'Win streak >= 2 first hit triggers surviveInSpirit'
  );

  // 2. Second hit on the same player does not trigger surviveInSpirit (once per match)
  const damage2 = moments.damage(
    { attackerId: 'foe', victimId: 'streaker', amount: 15, health: 70, source: 'sword', at: 8.0 },
    { practice: false, winStreak: (id) => (id === 'streaker' ? 2 : 0) }
  );
  assert.equal(
    damage2.some((group) => group.some((say) => say.line === 'surviveInSpirit')),
    false,
    'Subsequent hit does not trigger surviveInSpirit'
  );

  // 3. Lethal first hit does not trigger surviveInSpirit
  moments.reset();
  const lethal = moments.damage(
    { attackerId: 'foe', victimId: 'streaker', amount: 100, health: 0, source: 'sword', at: 5.0 },
    { practice: false, winStreak: (id) => (id === 'streaker' ? 2 : 0) }
  );
  assert.equal(
    lethal.some((group) => group.some((say) => say.line === 'surviveInSpirit')),
    false,
    'Lethal first hit does not trigger surviveInSpirit'
  );

  // 4. In Practice Yard (practice: true), surviveInSpirit never triggers
  moments.reset();
  const inPractice = moments.damage(
    { attackerId: 'foe', victimId: 'streaker', amount: 15, health: 85, source: 'sword', at: 5.0 },
    { practice: true, winStreak: (id) => (id === 'streaker' ? 2 : 0) }
  );
  assert.equal(
    inPractice.some((group) => group.some((say) => say.line === 'surviveInSpirit')),
    false,
    'Practice yard does not trigger surviveInSpirit'
  );

  // 5. Win streak < 2 does not trigger surviveInSpirit
  moments.reset();
  const lowStreak = moments.damage(
    { attackerId: 'foe', victimId: 'streaker', amount: 15, health: 85, source: 'sword', at: 5.0 },
    { practice: false, winStreak: (id) => (id === 'streaker' ? 1 : 0) }
  );
  assert.equal(
    lowStreak.some((group) => group.some((say) => say.line === 'surviveInSpirit')),
    false,
    'Streak < 2 does not trigger surviveInSpirit'
  );
});

test('matchStreak session tracking: Practice and Tutorial do not advance streaks', () => {
  resetWinStreaks();
  assert.equal(getWinStreak('knightA'), 0);

  // 1. Scored match 1: knightA wins
  recordMatchResult({
    winnerId: 'knightA',
    players: [{ id: 'knightA' }, { id: 'knightB' }],
    isScored: true,
  });
  assert.equal(getWinStreak('knightA'), 1);
  assert.equal(getWinStreak('knightB'), 0);

  // 2. Scored match 2: knightA wins
  recordMatchResult({
    winnerId: 'knightA',
    players: [{ id: 'knightA' }, { id: 'knightB' }],
    isScored: true,
  });
  assert.equal(getWinStreak('knightA'), 2);
  assert.equal(getWinStreak('knightB'), 0);

  // 3. Practice match (isScored: false): does not advance or reset streaks
  recordMatchResult({
    winnerId: 'knightB',
    players: [{ id: 'knightA' }, { id: 'knightB' }],
    isScored: false,
  });
  assert.equal(getWinStreak('knightA'), 2, 'knightA streak unchanged after practice');
  assert.equal(getWinStreak('knightB'), 0, 'knightB streak unchanged after practice');

  // 4. Tutorial match (isScored: false): does not advance streaks
  recordMatchResult({
    winnerId: 'knightA',
    players: [{ id: 'knightA' }],
    isScored: false,
  });
  assert.equal(getWinStreak('knightA'), 2, 'knightA streak unchanged after tutorial');

  // 5. Scored match 3: knightB wins -> knightA resets to 0, knightB becomes 1
  recordMatchResult({
    winnerId: 'knightB',
    players: [{ id: 'knightA' }, { id: 'knightB' }],
    isScored: true,
  });
  assert.equal(getWinStreak('knightA'), 0);
  assert.equal(getWinStreak('knightB'), 1);

  // Manual reset
  resetWinStreaks();
  assert.equal(getWinStreak('knightB'), 0);
});
