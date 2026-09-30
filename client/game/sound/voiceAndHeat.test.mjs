import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatHeat, HEAT, matchClosing, nearestFoe } from './combatHeat.mjs';
import { DEFEAT_ON_LOSS, MAGIC_SOURCES, MOUTH_BUSY_SEC, REBUTTAL, SENTENCE_GAP, VOICE_HEARING, VOICE_LINES, VoiceDirector, deathLines, gauntletLines, voicePlacement, voiceRate } from './voiceRules.mjs';

test('SORCERY! is rare: it needs the dice, then waits out its cooldown', () => {
  let roll = 0.05;
  const director = new VoiceDirector({ rand: () => roll });
  assert.ok(director.allow('sorcery', 'me', 10), 'a lucky cast shouts');
  assert.ok(!director.allow('sorcery', 'me', 30), 'not again within 45 s, however lucky');
  assert.ok(director.allow('sorcery', 'me', 10 + VOICE_LINES.sorcery.cooldown + 0.1));
  roll = 0.1;
  assert.ok(!director.allow('sorcery', 'me', 200), 'most casts are silent');
  assert.ok(VOICE_LINES.sorcery.chance <= 0.1);
});

test('one line at a time per Spellblade, but a death cry cuts through, and speakers are independent', () => {
  const director = new VoiceDirector({ rand: () => 0 });
  assert.ok(director.allow('hurt', 'a', 5));
  assert.ok(!director.allow('effort', 'a', 5 + MOUTH_BUSY_SEC / 2), 'still grunting from the last blow');
  assert.ok(director.allow('effort', 'b', 5.1), 'someone else can speak');
  assert.ok(director.allow('death', 'a', 5.2), 'death interrupts');
  assert.ok(director.allow('effort', 'a', 7));
});

test('lighter moments can be made rarer with chanceScale', () => {
  const director = new VoiceDirector({ rand: () => 0.2 });
  assert.ok(!director.allow('effort', 'me', 1, { chanceScale: 0.3 }), '0.2 is above 0.4 x 0.3');
  assert.ok(director.allow('effort', 'me', 1));
});

test('a knight killed by magic may say he does not believe in it; any fallen knight may protest he is a knight', () => {
  const burned = deathLines({ victimId: 'v', killerId: 'k', source: 'burn' });
  assert.deepEqual(burned.fallen.map((say) => say.line), ['magicDefeat', 'knightFallen', 'defeat', 'laugh', 'death']);
  assert.ok(burned.fallen.every((say) => say.speaker === 'v'));
  const cut = deathLines({ victimId: 'v', killerId: 'k', source: 'sword' });
  assert.deepEqual(cut.fallen.map((say) => say.line), ['knightFallen', 'defeat', 'laugh', 'death'], 'a sword is no magic');
  for (const source of ['fireball', 'frostfire']) assert.ok(MAGIC_SOURCES.includes(source));
  // the victor's word waits for the fallen to have had theirs, and nobody taunts over their own fall
  assert.deepEqual(cut.victor.map((say) => [say.line, say.speaker]), [['killTaunt', 'k'], ['laugh', 'k']]);
  assert.ok(cut.victor[0].delay > 0);
  assert.deepEqual(deathLines({ victimId: 'v', killerId: null, source: 'abyss' }).victor, []);
  assert.deepEqual(deathLines({ victimId: 'v', killerId: 'v', source: 'abyss' }).victor, []);
});

test('the taunts and the protest are rare and wait out long cooldowns, so they stay a surprise', () => {
  for (const line of ['magicDefeat', 'killTaunt', 'breakTaunt', 'defeat']) {
    assert.ok(VOICE_LINES[line].chance < 0.5, `${line} is rare`);
    assert.ok(VOICE_LINES[line].cooldown >= 30, `${line} does not repeat soon`);
  }
  // a lost match makes the protest likelier, but not certain
  assert.ok(VOICE_LINES.defeat.chance * DEFEAT_ON_LOSS > VOICE_LINES.defeat.chance && VOICE_LINES.defeat.chance * DEFEAT_ON_LOSS < 1);
  const director = new VoiceDirector({ rand: () => 0.2 });
  assert.ok(director.allow('defeat', 'me', 10), 'felled, and the dice allow it');
  assert.ok(!director.allow('defeat', 'me', 40, { chanceScale: DEFEAT_ON_LOSS }), 'but not again soon, even at the end of the match');
});

test("another knight's voice carries only near him: normal falloff, no map-wide barks, a little room far off", () => {
  const me = { x: 0, z: 0 };
  const at = (d) => voicePlacement(me, 0, { x: 0, z: -d });
  // full level close by, then falling off as 1/d
  assert.equal(at(1).gain, 1);
  assert.ok(Math.abs(at(5).gain - VOICE_HEARING.near / 5) < 1e-9);
  assert.ok(at(8).gain < at(5).gain && at(5).gain < at(3).gain);
  // fading out toward the edge of earshot, and nothing at all beyond it
  assert.ok(at(VOICE_HEARING.far - 0.3).gain < 0.01);
  assert.equal(at(VOICE_HEARING.far), null);
  assert.equal(at(60), null, 'a bark across the map is not heard');
  assert.ok(VOICE_HEARING.far <= 20, 'a modest range');
  // more of the room, the further off (and never much of it)
  assert.ok(at(12).reverb > at(2).reverb && at(12).reverb <= 0.15);
  // from where he stands: on my right when he is to my right (facing -z, my right is +x)
  assert.ok(voicePlacement(me, 0, { x: 4, z: 0 }).pan > 0.5);
  assert.ok(voicePlacement(me, 0, { x: -4, z: 0 }).pan < -0.5);
  // no echo off the walls on any line: clear words
  for (const [line, rule] of Object.entries(VOICE_LINES)) assert.equal(rule.echo, undefined, line);
});

test('every Spellblade keeps their own pitch, within a narrow band', () => {
  const rates = ['alpha', 'beta', 'gamma', 'x'].map(voiceRate);
  for (const rate of rates) assert.ok(rate >= 0.94 && rate <= 1.06);
  assert.equal(voiceRate('alpha'), voiceRate('alpha'));
  assert.ok(new Set(rates).size > 1);
});

test('the music heats up with steel nearby, and runs hot while you trade blows or the match is closing', () => {
  const heat = new CombatHeat();
  assert.equal(heat.level({ now: 100 }), 0);
  assert.equal(heat.level({ now: 100, nearestFoe: HEAT.nearDistance - 1 }), 1);
  heat.stir(100);
  assert.equal(heat.level({ now: 105 }), 1);
  assert.equal(heat.level({ now: 100 + HEAT.stirHold + 0.1 }), 0);
  heat.fight(120);
  assert.equal(heat.level({ now: 124 }), 2);
  assert.equal(heat.level({ now: 124, cap: 1 }), 1, 'the practice yard never goes past 1');
  assert.equal(heat.level({ now: 120 + HEAT.fightHold + 0.1 }), 0);
  assert.equal(heat.level({ now: 300, closing: true }), 2);
});

test('a match is closing when someone is one blow from winning or the clock runs low', () => {
  const players = [{ id: 'a', kills: 3 }, { id: 'b', kills: 1 }];
  const base = { roomState: 'PLAYING', mode: 'DUEL', scoreToWin: 5, matchStartedAt: 0, matchSeconds: 240, players };
  assert.equal(matchClosing(base, 60), false);
  assert.equal(matchClosing({ ...base, players: [{ id: 'a', kills: 4 }] }, 60), true);
  assert.equal(matchClosing(base, 240 - HEAT.closingSeconds + 1), true);
  assert.equal(matchClosing({ ...base, suddenDeath: true }, 10), true);
  assert.equal(matchClosing({ ...base, mode: 'PRACTICE', players: [{ id: 'a', kills: 9 }] }, 10), false);
  assert.equal(matchClosing({ ...base, roomState: 'WAITING' }, 239), false);
});

test('only foes who can fight back count as near: not dummies, not the fallen', () => {
  const me = { id: 'me', position: { x: 0, z: 0 } };
  const players = [
    me,
    { id: 'dummy', actorKind: 'dummy', position: { x: 1, z: 0 } },
    { id: 'dead', alive: false, position: { x: 2, z: 0 } },
    { id: 'bot', actorKind: 'bot', position: { x: 6, z: 8 } },
  ];
  assert.equal(nearestFoe(me, players), 10);
  assert.equal(nearestFoe(null, players), Infinity);
});

test('exertions come often, each on its own short cooldown; sentences are rare and never two close together', () => {
  for (const [line, rule] of Object.entries(VOICE_LINES)) assert.ok(['exertion', 'sentence'].includes(rule.kind), `${line} is one or the other`);
  for (const line of ['effort', 'hurt', 'dash', 'fistEffort']) assert.ok(VOICE_LINES[line].cooldown <= 3, `${line} can come often`);
  const director = new VoiceDirector({ rand: () => 0 });
  assert.ok(director.allow('killTaunt', 'k', 10));
  // another sentence from the same knight must wait out the gap (even one never said before)
  assert.ok(!director.allow('breakTaunt', 'k', 10 + SENTENCE_GAP / 2), 'not two sentences close together');
  assert.ok(director.allow('breakTaunt', 'k', 10 + SENTENCE_GAP + 0.1));
  // exertions are not held up by sentences (only by the mouth being busy a moment)
  assert.ok(director.allow('fistEffort', 'k', 10 + SENTENCE_GAP + 1));
  assert.ok(director.allow('effort', 'k', 10 + SENTENCE_GAP + 3));
  // a line of state (the ultimate's cry, a death) always speaks
  assert.ok(director.allow('sunderCall', 'k', 10 + SENTENCE_GAP + 3.5));
  assert.equal(director.sentenceAgo('k', 30), 30 - (10 + SENTENCE_GAP + 3.5));
  assert.equal(director.sentenceAgo('nobody', 30), Infinity);
});

test('the gauntlet\'s lines: the one that belongs to the moment first, and all of them rare', () => {
  // a gauntlet's kill has its own line, tried before the ordinary taunt
  const fisted = deathLines({ victimId: 'v', killerId: 'k', source: 'gauntlet' });
  assert.deepEqual(fisted.victor.map((say) => say.line), ['fistKill', 'killTaunt', 'laugh']);
  assert.deepEqual(deathLines({ victimId: 'v', killerId: 'k', source: 'sword' }).victor.map((say) => say.line), ['killTaunt', 'laugh']);
  // the rebuttal only answers a foe who has just spoken and is left low enough for a gauntlet to finish
  assert.deepEqual(gauntletLines({ attackerId: 'k', foeSpokeAgo: 2, foeHealth: REBUTTAL.health }).map((say) => say.line), ['rebuttal', 'fistThrow']);
  assert.deepEqual(gauntletLines({ attackerId: 'k', foeSpokeAgo: REBUTTAL.within + 1, foeHealth: 5 }).map((say) => say.line), ['fistThrow']);
  assert.deepEqual(gauntletLines({ attackerId: 'k', foeSpokeAgo: 1, foeHealth: 60 }).map((say) => say.line), ['fistThrow']);
  for (const line of ['fistThrow', 'fistKill', 'rebuttal']) {
    assert.equal(VOICE_LINES[line].kind, 'sentence');
    assert.ok(VOICE_LINES[line].cooldown >= 60, `${line} does not repeat soon`);
  }
  assert.ok(VOICE_LINES.fistThrow.chance <= 0.15, 'the gauntlet thrown is rare');
  assert.equal(VOICE_LINES.fistEffort.kind, 'exertion');
});
