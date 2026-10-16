import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  VOICE_LINE_LIST, linesFor, validateVoiceLines, voiceLine,
} from './voiceLines.mjs';
import { victorLines, victorTags } from './voiceRules.mjs';
import { VoiceMoments } from './voiceMoments.mjs';
import { VoiceWatch } from './voiceWatch.mjs';
import { captionPlan, captionsFor } from '../../ui/voiceLibrary.mjs';
import {
  getWinStreak, setWinStreak, recordMatchResult, resetWinStreaks,
} from './matchStreak.mjs';

const voiceDir = new URL('../../assets/voice/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', voiceDir), 'utf8'));
const files = readdirSync(voiceDir);

test('new combat voice lines: declarations, manifest, and audio files are fully valid', () => {
  const { errors } = validateVoiceLines({ manifest, files });
  assert.deepEqual(errors, []);

  const newLines = ['rememberThis', 'armorHoldingBack', 'chivalryItinerary', 'exercise', 'anybodyThere', 'surviveInSpirit'];
  for (const id of newLines) {
    const line = voiceLine(id);
    assert.ok(line, `${id} must be declared`);
    const takes = manifest.lines[id];
    assert.ok(takes?.length > 0, `${id} must have manifest entries`);
    for (const take of takes) {
      assert.ok(files.includes(`${take.file}.wav`), `${take.file}.wav must exist`);
      assert.ok(files.includes(`${take.file}.m4a`), `${take.file}.m4a must exist`);
    }
    assert.ok(line.credits?.title, `${id} must have Credits title`);
    assert.ok(line.credits?.description, `${id} must have Credits description`);
    assert.ok(line.credits?.note, `${id} must have Credits note`);
  }
});

test('new combat lines: comedic beat timing and caption plan', () => {
  // rememberThis: punchline delayed until 2.58s
  const remember = voiceLine('rememberThis');
  assert.equal(remember.beats.length, 2);
  assert.equal(remember.beats[0].words, 'Remember this.');
  assert.equal(remember.beats[1].at, 2.58);
  assert.equal(remember.beats[1].words, "...because I won't.");

  const rememberCaptions = captionsFor('rememberThis');
  assert.deepEqual(rememberCaptions, ['Remember this.', "...because I won't."]);
  const rememberPlan = captionPlan('rememberThis', { beats: [0, 2.58] });
  assert.equal(rememberPlan.text, 'Remember this.');
  assert.equal(rememberPlan.after, 0);
  assert.deepEqual(rememberPlan.cues, [{ at: 2.58, text: "...because I won't." }]);

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
});

test('fleeing kill detection: sprinting away vs lateral vs approaching', () => {
  const watch = new VoiceWatch();
  const killerPos = { x: 0, z: 0 };
  const now = 10.0;

  // Victim at (0, 10), moving along +z (directly away from killer at origin) at 6 m/s, sprinting
  const fleeingVictim = {
    id: 'fleeingKnight',
    alive: true,
    position: { x: 0, y: 0, z: 10 },
    velocity: { x: 0, y: 0, z: 6 },
    sprinting: true,
  };
  watch.step(now, [fleeingVictim]);
  assert.equal(watch.fleeing('fleeingKnight', killerPos, now + 0.1), true);

  // Victim at (0, 10), moving laterally along +x at 6 m/s (passing, not fleeing)
  const lateralVictim = {
    id: 'lateralKnight',
    alive: true,
    position: { x: 0, y: 0, z: 10 },
    velocity: { x: 6, y: 0, z: 0 },
    sprinting: true,
  };
  watch.step(now, [lateralVictim]);
  assert.equal(watch.fleeing('lateralKnight', killerPos, now + 0.1), false);

  // Victim at (0, 10), moving toward killer along -z at 6 m/s (approaching/rushing)
  const approachingVictim = {
    id: 'approachingKnight',
    alive: true,
    position: { x: 0, y: 0, z: 10 },
    velocity: { x: 0, y: 0, z: -6 },
    sprinting: true,
  };
  watch.step(now, [approachingVictim]);
  assert.equal(watch.fleeing('approachingKnight', killerPos, now + 0.1), false);

  // Victim moving away but NOT sprinting
  const walkingVictim = {
    id: 'walkingKnight',
    alive: true,
    position: { x: 0, y: 0, z: 10 },
    velocity: { x: 0, y: 0, z: 6 },
    sprinting: false,
  };
  watch.step(now, [walkingVictim]);
  assert.equal(watch.fleeing('walkingKnight', killerPos, now + 0.1), false);

  // Victim too far (> 20m)
  const farVictim = {
    id: 'farKnight',
    alive: true,
    position: { x: 0, y: 0, z: 25 },
    velocity: { x: 0, y: 0, z: 6 },
    sprinting: true,
  };
  watch.step(now, [farVictim]);
  assert.equal(watch.fleeing('farKnight', killerPos, now + 0.1), false);

  // In victor tags and lines:
  const tags = victorTags({ source: 'sword', moment: { fleeing: true } });
  assert.equal(tags.fleeingKill, 1);
  const candidateLines = linesFor('killer', tags).map((l) => l.line);
  assert.ok(candidateLines.includes('armorHoldingBack'));
  assert.ok(candidateLines.includes('chivalryItinerary'));
});

test('same foe again detection: consecutive kills and 3+ match kills', () => {
  const moments = new VoiceMoments({ rand: () => 0.01 });

  // Kill 1: Player A kills Player B
  const d1 = moments.death({ victimId: 'b', killerId: 'a', source: 'sword', at: 10 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  assert.equal(d1.victor.some((l) => l.line === 'rememberThis' || l.line === 'anybodyThere'), false, 'First kill is not same foe again');

  // Kill 2: Player A kills Player B again consecutively
  const d2 = moments.death({ victimId: 'b', killerId: 'a', source: 'sword', at: 20 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  assert.ok(d2.victor.some((l) => l.line === 'rememberThis' || l.line === 'anybodyThere'), 'Consecutive kill of same foe triggers sameFoeAgain');

  // Kill 3: Player C kills Player D in between
  moments.death({ victimId: 'd', killerId: 'c', source: 'sword', at: 30 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });

  // Kill 4: Player A kills Player B for the 3rd time in match (interrupted sequence)
  const d4 = moments.death({ victimId: 'b', killerId: 'a', source: 'sword', at: 40 }, {
    knight: (id) => ({ id, actorKind: 'human' }),
  });
  assert.ok(d4.victor.some((l) => l.line === 'rememberThis' || l.line === 'anybodyThere'), '3rd kill of same foe in match triggers sameFoeAgain');
});

test('corpse exercise detection: repeatedly crouching beside defeated opponent', () => {
  const watch = new VoiceWatch();
  const victimPos = { x: 5, y: 0, z: 5 };
  const atDeath = 10.0;

  // Victim dies at (5, 5)
  watch.death('fallenFoe', atDeath, victimPos);

  // Killer starts crouching beside the body at distance ~1.41m (reach <= 2.5m)
  const killerPos = { x: 6, y: 0, z: 6 };

  // Crouch 1 at t=10.5
  let heard = watch.step(10.5, [
    { id: 'killer', alive: true, position: killerPos, velocity: { x: 0, y: 0, z: 0 }, crouched: true },
  ]);
  assert.equal(heard.some((m) => m.tags.includes('corpseExercise')), false);

  // Stand up at t=10.8
  watch.step(10.8, [
    { id: 'killer', alive: true, position: killerPos, velocity: { x: 0, y: 0, z: 0 }, crouched: false },
  ]);

  // Crouch 2 at t=11.2
  heard = watch.step(11.2, [
    { id: 'killer', alive: true, position: killerPos, velocity: { x: 0, y: 0, z: 0 }, crouched: true },
  ]);
  assert.equal(heard.some((m) => m.tags.includes('corpseExercise')), false);

  // Stand up at t=11.5
  watch.step(11.5, [
    { id: 'killer', alive: true, position: killerPos, velocity: { x: 0, y: 0, z: 0 }, crouched: false },
  ]);

  // Crouch 3 at t=12.0 (3rd repetition within 4.0s)
  heard = watch.step(12.0, [
    { id: 'killer', alive: true, position: killerPos, velocity: { x: 0, y: 0, z: 0 }, crouched: true },
  ]);
  const exerciseMoment = heard.find((m) => m.tags.includes('corpseExercise'));
  assert.ok(exerciseMoment, '3 crouches beside corpse emits corpseExercise tag');
  assert.equal(exerciseMoment.speaker, 'killer');

  // Verify exercise line is found for corpseExercise
  const lines = linesFor('killer', ['corpseExercise']).map((l) => l.line);
  assert.ok(lines.includes('exercise'), 'exercise line is selected by corpseExercise');

  // Non-trigger case: crouching too far from body (> 2.5m)
  const watchFar = new VoiceWatch();
  watchFar.death('fallenFoe2', 10.0, { x: 0, y: 0, z: 0 });
  for (let t = 11.0; t <= 12.0; t += 0.4) {
    const out = watchFar.step(t, [
      { id: 'killerFar', alive: true, position: { x: 10, y: 0, z: 10 }, velocity: { x: 0, y: 0, z: 0 }, crouched: t % 0.8 < 0.4 },
    ]);
    assert.equal(out.some((m) => m.tags.includes('corpseExercise')), false);
  }
});

test('win streak first hurt detection: surviveInSpirit', () => {
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

  // 2. Second hit on the same player does not trigger surviveInSpirit
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

test('matchStreak session tracking: updates and resets correctly across matches', () => {
  resetWinStreaks();
  assert.equal(getWinStreak('knightA'), 0);

  // Match 1: knightA wins
  recordMatchResult({
    winnerId: 'knightA',
    players: [{ id: 'knightA' }, { id: 'knightB' }],
    isScored: true,
  });
  assert.equal(getWinStreak('knightA'), 1);
  assert.equal(getWinStreak('knightB'), 0);

  // Match 2: knightA wins again
  recordMatchResult({
    winnerId: 'knightA',
    players: [{ id: 'knightA' }, { id: 'knightB' }],
    isScored: true,
  });
  assert.equal(getWinStreak('knightA'), 2);
  assert.equal(getWinStreak('knightB'), 0);

  // Practice match: should not change scored streaks
  recordMatchResult({
    winnerId: 'knightB',
    players: [{ id: 'knightA' }, { id: 'knightB' }],
    isScored: false,
  });
  assert.equal(getWinStreak('knightA'), 2);
  assert.equal(getWinStreak('knightB'), 0);

  // Match 3: knightB wins scored match -> knightA streak resets to 0, knightB becomes 1
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
