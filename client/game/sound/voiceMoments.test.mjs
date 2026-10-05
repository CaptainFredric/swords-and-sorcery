import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFEAT_ON_LOSS, GALE_KILL, MINOR_LETHAL, VOICE_LINES, VoiceDirector, deathLines, guardBreakLines, isMinorLethal } from './voiceRules.mjs';
import { MOMENTS, VoiceMoments } from './voiceMoments.mjs';

const lines = (group) => group.map((say) => say.line);
const knights = (table) => ({ knight: (id) => table[id] ?? null, positionOf: (id) => table[id]?.position ?? null });

test('the wildcard laugh: a chance in fifty, a long while between, and once in a life at most', () => {
  const rule = VOICE_LINES.laugh;
  assert.ok(rule.chance >= 0.01 && rule.chance <= 0.03);
  assert.deepEqual(rule.cooldown, [45, 75]);
  assert.equal(rule.kind, 'sentence', 'one sentence at a time, like any line...');
  assert.equal(rule.priority, 1, '...but it never cuts anything');
  const director = new VoiceDirector({ rand: () => 0 });
  assert.ok(director.allow('laugh', 'k', 10));
  assert.ok(!director.allow('laugh', 'k', 40), 'not within 45 s');
  assert.ok(!director.allow('laugh', 'k', 200), 'nor again in the same life, however long it lasts');
  director.newLife('k');
  assert.ok(director.allow('laugh', 'k', 210), 'a new life, a new chance');
  // the spread: somewhere between 45 and 75 s (the dice: yes to the chance, the middle of the spread)
  let roll = 0;
  const spread = new VoiceDirector({ rand: () => (roll++ % 2 ? 0.5 : 0) });
  spread.allow('laugh', 'k', 0);
  spread.newLife('k');
  assert.ok(!spread.allow('laugh', 'k', 59), 'half way through the spread (60 s): not yet');
  assert.ok(spread.allow('laugh', 'k', 61));
});

test('the wildcard comes from discrete moments only: never a burn\'s licks, never a fall', () => {
  const moments = new VoiceMoments();
  const blow = (source, health = 50) => moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source, amount: 5, health, at: 1 });
  assert.ok(blow('sword').some((group) => group.some((say) => say.line === 'laugh' && say.speaker === 'a')));
  assert.ok(blow('sword').some((group) => group.some((say) => say.line === 'laugh' && say.speaker === 'v')));
  assert.ok(!blow('burn').some((group) => group.some((say) => say.line === 'laugh')), 'a burn\'s lick');
  assert.ok(!blow('sword', 0).some((group) => group.some((say) => say.line === 'laugh' && say.speaker === 'v')), 'a killing blow has the fall\'s lines');
});

test('the squire\'s question: asked over a foe all but finished, answered by the next fall near him, whatever its odds', () => {
  const moments = new VoiceMoments({ rand: () => 0.9 });
  const world = knights({ a: { position: { x: 0, z: 0 } }, v: { position: { x: 3, z: 0 } }, far: { position: { x: 60, z: 0 } } });
  const asked = moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 25, health: MOMENTS.squire.health - 5, at: 10 }, world);
  const setup = asked.flat().find((say) => say.line === 'squireSetup');
  assert.ok(setup && setup.speaker === 'a' && setup.opens === 'squire', 'asked, by the one who struck');
  assert.ok(!moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 5, health: 80, at: 10 }, world).flat().some((say) => say.line === 'squireSetup'), 'not over a foe still hale');
  moments.squireAsked('a', 10, { x: 0, z: 0 });
  // a fall far off is no answer, and leaves the question open
  assert.equal(moments.death({ type: 'death', victimId: 'far', killerId: 'x', source: 'sword', at: 12 }, world).answer, false);
  const answered = moments.death({ type: 'death', victimId: 'v', killerId: 'a', source: 'sword', at: 14 }, world);
  assert.equal(answered.answer, true);
  assert.ok(answered.fallen.length && answered.fallen.every((say) => say.force && say.speaker === 'v'), 'every line of the fallen, forced');
  assert.ok(!lines(answered.fallen).includes('death') && !lines(answered.fallen).includes('laugh'), 'a line, not a grunt or the wildcard');
  assert.deepEqual(answered.victor, [], 'the answer is the joke: nobody talks over it');
  // answered once: the next fall is ordinary again
  assert.equal(moments.death({ type: 'death', victimId: 'v', killerId: 'a', source: 'sword', at: 15 }, world).answer, false);
  // and a question nobody answers in time simply lapses
  moments.squireAsked('a', 20, { x: 0, z: 0 });
  assert.equal(moments.death({ type: 'death', victimId: 'v', killerId: 'a', source: 'sword', at: 20 + MOMENTS.squire.windowSec + 0.1 }, world).answer, false);
  // forced: said whatever the dice and however recently
  const director = new VoiceDirector({ rand: () => 0.99 });
  assert.ok(!director.allow('knightFallen', 'v', 1), 'ordinarily, the dice say no');
  assert.ok(director.allow('knightFallen', 'v', 2, { force: true }));
  assert.ok(director.allow('knightFallen', 'v', 10, { force: true }), 'even inside its long cooldown');
});

test('late: felled by very little, likelier when it cut something short; never an overkill, an ultimate or a fall', () => {
  assert.ok(isMinorLethal({ amount: 4, healthBefore: 3, source: 'burn' }), 'a burn\'s last lick');
  assert.ok(isMinorLethal({ amount: 9, healthBefore: 8, source: 'gauntlet' }));
  assert.ok(!isMinorLethal({ amount: 25, healthBefore: 8, source: 'sword' }), 'a real blow is an overkill, not a scrap');
  assert.ok(!isMinorLethal({ amount: 12, healthBefore: 10, source: 'rupture', ultimate: true }), 'an ultimate');
  assert.ok(!isMinorLethal({ amount: 34, healthBefore: 5, level: 'elevated', source: 'sword' }));
  assert.ok(!isMinorLethal({ amount: 100, source: 'abyss' }));
  const moments = new VoiceMoments();
  const world = knights({ v: { attackActive: true } });
  const { fallen } = moments.death({ type: 'death', victimId: 'v', killerId: 'k', source: 'burn', at: 1 }, { ...world, blow: { amount: 4, healthBefore: 3 } });
  assert.equal(fallen[0].line, 'lateLine', 'before anything else he might say');
  assert.equal(fallen[0].chanceScale, MINOR_LETHAL.interrupted, 'mid-swing');
  const chance = VOICE_LINES.lateLine.chance;
  assert.ok(chance >= 0.1 && chance <= 0.15);
  assert.ok(!lines(deathLines({ victimId: 'v', killerId: 'k', source: 'sword', overkill: true }).fallen).includes('lateLine'));
});

test('a new knighthood: a sword kill after a run of near-perfect blows aimed high, fuller when the last swing is higher', () => {
  const run = (hits) => {
    const moments = new VoiceMoments();
    for (const [i, [amount, pitch]] of hits.entries()) {
      const health = i === hits.length - 1 ? 0 : 50;
      moments.damage({ type: 'damage', attackerId: 'k', victimId: 'v', source: 'sword', amount, health, at: i }, knights({ k: { pitch } }));
    }
    return moments.death({ type: 'death', victimId: 'v', killerId: 'k', source: 'sword', at: hits.length }, knights({}));
  };
  const high = run([[29, 0.15], [30, 0.25], [28, 0.3]]).victor.find((say) => say.line === 'newKnighthood');
  assert.equal(high?.chanceScale, 2, 'the killing swing aimed high');
  assert.equal(run([[29, 0.15], [30, 0.12]]).victor.find((say) => say.line === 'newKnighthood')?.chanceScale, 1);
  assert.ok(!run([[29, -0.1], [30, -0.05]]).victor.some((say) => say.line === 'newKnighthood'), 'aimed low');
  assert.ok(!run([[22, 0.2], [24, 0.2], [30, 0.3]]).victor.some((say) => say.line === 'newKnighthood'), 'not mostly perfect');
  assert.ok(!run([[30, 0.3]]).victor.some((say) => say.line === 'newKnighthood'), 'one blow is no lesson');
});

test('always knew: near his end, and his threat felled or thrown by somebody else a moment later', () => {
  const world = knights({ s: { health: 18 }, a: {}, t: {} });
  const moments = new VoiceMoments();
  moments.damage({ type: 'damage', attackerId: 'a', victimId: 's', source: 'sword', amount: 25, health: 18, at: 10 }, world);
  const rescued = moments.death({ type: 'death', victimId: 'a', killerId: 't', source: 'sword', at: 11 }, world).rescued;
  assert.deepEqual(rescued.map((group) => [lines(group), group[0].speaker]), [[['alwaysKnew'], 's']]);
  // not when he saved himself, not once the moment has passed, not when he was never in danger
  const again = () => { const m = new VoiceMoments(); m.damage({ type: 'damage', attackerId: 'a', victimId: 's', source: 'sword', amount: 25, health: 18, at: 10 }, world); return m; };
  assert.deepEqual(again().death({ type: 'death', victimId: 'a', killerId: 's', source: 'sword', at: 11 }, world).rescued, []);
  assert.deepEqual(again().death({ type: 'death', victimId: 'a', killerId: 't', source: 'sword', at: 10 + MOMENTS.threatSec + 0.5 }, world).rescued, []);
  const hale = knights({ s: { health: 80 } });
  const m = new VoiceMoments();
  m.damage({ type: 'damage', attackerId: 'a', victimId: 's', source: 'sword', amount: 20, health: 80, at: 10 }, hale);
  assert.deepEqual(m.death({ type: 'death', victimId: 'a', killerId: 't', source: 'sword', at: 11 }, hale).rescued, []);
  // a gust from somebody else that throws the threat clear rescues too
  const g = again();
  const thrown = g.galeCaught({ type: 'galeBlast', playerId: 't', affected: [{ id: 'a', pressure: 0.8, guarded: false }], at: 11 }, world);
  assert.ok(thrown.some((group) => group.some((say) => say.line === 'alwaysKnew' && say.speaker === 's')));
  // and a messy kill of his own that arrived late (a burn's lick, a fall) may do, now and then
  assert.ok(deathLines({ victimId: 'v', killerId: 'k', source: 'burn', moment: { messy: true } }).victor.some((say) => say.line === 'alwaysKnew'));
});

test('the victor\'s lines: each moment its own, before the ordinary taunt', () => {
  const victor = (moment, source = 'sword') => lines(deathLines({ victimId: 'v', killerId: 'k', source, moment }).victor);
  assert.equal(victor({ sunder: true })[0], 'victory', 'MIGHT MAKES... KNIGHT! after force');
  assert.equal(victor({ gale: true }, 'abyss')[0], 'galeTaunt');
  assert.equal(deathLines({ victimId: 'v', killerId: 'k', source: 'abyss', moment: { gale: true } }).victor[0].chanceScale, GALE_KILL);
  assert.equal(victor({ practice: true })[0], 'neverReach');
  assert.equal(victor({ clean: true })[0], 'hackSlash');
  assert.equal(victor({ clean: true }, 'fireball').includes('hackSlash'), false, 'a clean sword kill only');
  assert.equal(victor({ subpar: true })[0], 'subparStandard');
  assert.deepEqual(victor({}).slice(-3), ['killTaunt', 'workHard', 'laugh']);
  // the fall that lost the match: the protest likelier
  assert.equal(deathLines({ victimId: 'v', killerId: 'k', source: 'sword', decisive: true }).fallen.find((say) => say.line === 'defeat').chanceScale, DEFEAT_ON_LOSS);
  // who they were: a player flying another standard, a Practice Yard opponent that fights
  const moments = new VoiceMoments();
  const world = knights({ k: { actorKind: 'human' }, v: { actorKind: 'human', cloth: 'azure' }, d: { actorKind: 'dummy', practiceMode: 'MELEE' }, p: { actorKind: 'dummy', practiceMode: 'PASSIVE' } });
  assert.ok(lines(moments.death({ type: 'death', victimId: 'v', killerId: 'k', source: 'sword', at: 1 }, world).victor).includes('subparStandard'));
  assert.ok(lines(moments.death({ type: 'death', victimId: 'd', killerId: 'k', source: 'sword', at: 2 }, { ...world, practice: true }).victor).includes('neverReach'));
  assert.ok(!lines(moments.death({ type: 'death', victimId: 'p', killerId: 'k', source: 'sword', at: 3 }, { ...world, practice: true }).victor).includes('neverReach'), 'a dummy that stands there');
});

test('force settles the argument: a Sundering guard break, balance broken by a Sundering knight, a slam that splits the ground under two', () => {
  assert.deepEqual(lines(guardBreakLines({ attackerId: 'k', catastrophic: true })), ['victory', 'lowerGuard', 'breakTaunt', 'offGuard']);
  assert.deepEqual(lines(guardBreakLines({ attackerId: 'k' })), ['lowerGuard', 'breakTaunt', 'offGuard'], 'the helping hand first, the staffing advice rarer');
  assert.ok(VOICE_LINES.breakTaunt.chance < VOICE_LINES.lowerGuard.chance);
  const moments = new VoiceMoments();
  const sundering = knights({ k: { ultimateState: { phase: 'active', until: 20 } } });
  assert.deepEqual(lines(moments.staggerBreak({ type: 'staggerBreak', playerId: 'v', by: 'k', at: 5 }, sundering)[0]), ['victory', 'staggerDisplay']);
  assert.deepEqual(lines(moments.staggerBreak({ type: 'staggerBreak', playerId: 'v', by: 'k', at: 25 }, sundering)[0]), ['staggerDisplay']);
  const rupture = (victimId, at) => moments.damage({ type: 'damage', attackerId: 'k', victimId, source: 'rupture', amount: 12, health: 50, at, ultimate: true }, sundering);
  assert.ok(!rupture('a', 5).some((group) => lines(group).includes('victory')));
  assert.ok(rupture('b', 5.3).some((group) => lines(group).includes('victory')), 'two caught at once');
});

test('Sunder\'s cry: most times its own, now and then MIGHT MAKES... KNIGHT!, and always said, cutting a lesser line', async () => {
  const { ultimateCry } = await import('./voiceRules.mjs');
  let seed = 1;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const counts = { sunderCall: 0, victory: 0 };
  for (let i = 0; i < 2000; i += 1) counts[ultimateCry('sunder', rand)] += 1;
  assert.ok(counts.victory > 500 && counts.victory < 900, `MIGHT MAKES... KNIGHT! ${counts.victory} of 2000`);
  assert.ok(counts.sunderCall > counts.victory, 'its own cry the likelier');
  assert.equal(ultimateCry('vortex', () => 0), null, 'an ultimate without a cry of its own has none (never Sunder\'s)');
  assert.equal(ultimateCry('nothing-such', () => 0), null);
  // as a cry the line is forced (inside its own cooldown, whatever the dice) and ranks as state: it cuts another's taunt
  const director = new VoiceDirector({ rand: () => 0.99 });
  assert.ok(new VoiceDirector({ rand: () => 0 }).allow('killTaunt', 'k', 1));
  const busy = new VoiceDirector({ rand: () => 0 });
  busy.consider('killTaunt', 'other', 10, { duration: 3 });
  assert.equal(busy.consider('victory', 'me', 10.5), null, 'an ordinary MIGHT MAKES... KNIGHT! waits for another knight\'s taunt');
  assert.deepEqual(busy.consider('victory', 'me', 10.6, { cry: true })?.stop, ['other'], 'as a cry it cuts it');
  assert.ok(director.allow('victory', 'me', 1, { cry: true }));
  assert.ok(director.allow('victory', 'me', 20, { cry: true }), 'inside its own two-minute cooldown');
});

test('why a line is never heard can be read off: whether its moment comes, whether it is tried, whether it is said', () => {
  const moments = new VoiceMoments({ rand: () => 0.99 });
  const director = new VoiceDirector({ rand: () => 0.99 });
  // three falls: the moments come; the recorded line is tried each time and (the dice being what they are) never said
  for (let i = 0; i < 3; i += 1) {
    const { fallen } = moments.death({ type: 'death', victimId: 'v', killerId: 'k', source: 'sword', at: i });
    for (const say of fallen) if (say.line === 'knightFallen') director.consider(say.line, say.speaker, i * 400);
  }
  const report = moments.report({ recorded: (line) => line === 'knightFallen', stats: director.stats });
  const row = (line) => report.find((entry) => entry.line === line);
  assert.deepEqual(row('knightFallen'), { line: 'knightFallen', recorded: true, moments: 3, tried: 3, said: 0 });
  assert.deepEqual(row('defeat'), { line: 'defeat', recorded: false, moments: 3, tried: 0, said: 0 }, 'its moment comes, but it has no take');
  assert.equal(row('steelBoast').moments, 0, 'a moment that never came');
  assert.equal(row('misaddressed').waitsFor, 'the Riposte');
  assert.equal(row('vortexDefeat').waitsFor, undefined, 'the Vortex is in the game: its lines wait for nothing');
});

test('the Tin Man line is for a foe felled with their plate still hardened, never any kill; Steel\'s own line is for calling it', async () => {
  const { linesFor } = await import('./voiceLines.mjs');
  const moments = new VoiceMoments();
  const world = knights({ k: {}, v: {} });
  const steeled = moments.death({ type: 'death', victimId: 'v', killerId: 'k', source: 'sword', steeled: true, at: 1 }, world).victor;
  assert.equal(steeled[0].line, 'tinManHeart');
  assert.ok(!lines(moments.death({ type: 'death', victimId: 'v', killerId: 'k', source: 'sword', at: 2 }, world).victor).includes('tinManHeart'));
  assert.deepEqual(lines(linesFor('k', ['steelCalled'])), ['steelPolished']);
  assert.ok(!lines(linesFor('k', ['steelTurn'])).includes('steelPolished'), 'the boast at a spell turned aside stays its own');
  assert.deepEqual(lines(linesFor('k', ['guardBreak'])), ['lowerGuard', 'breakTaunt', 'offGuard']);
  assert.ok(lines(linesFor('k', ['kill'])).includes('workHard'));
  assert.deepEqual(lines(linesFor('k', ['riposteOvershoot'])), [], 'the Riposte line is recorded, and still cannot be said');
});

test('the Blazing Vortex: no cry as it is lit, its noise once as it takes hold, and its excuse for whoever falls spinning or dizzy', async () => {
  const { cryMoment, deathMoment } = await import('./voiceRules.mjs');
  const { linesFor } = await import('./voiceLines.mjs');
  assert.equal(cryMoment('vortex'), null, 'lit without a word (never Sunder\'s cry)');
  assert.equal(cryMoment('sunder'), 'sunderInvoked');
  assert.deepEqual(linesFor('k', ['vortexSpin']).map((say) => say.line), ['vortexUse']);
  assert.ok(VOICE_LINES.vortexUse.chance < 1 && VOICE_LINES.vortexUse.cooldown >= 30, 'now and then, not every time');
  // felled spinning (or still dizzy): the host marks the fall, and his excuse comes before an ordinary defeat
  assert.equal(deathMoment({ victimId: 'v', killerId: 'k', source: 'sword', dizzy: true }).fallen.vortexDeath, 1);
  assert.equal(deathMoment({ victimId: 'v', killerId: 'k', source: 'sword' }).fallen.vortexDeath, undefined);
  const moments = new VoiceMoments();
  const dizzy = moments.death({ type: 'death', victimId: 'v', killerId: 'k', source: 'sword', dizzy: true, at: 1 }, knights({}));
  assert.equal(dizzy.fallen[0].line, 'vortexDefeat');
  const plain = moments.death({ type: 'death', victimId: 'v', killerId: 'k', source: 'sword', at: 2 }, knights({}));
  assert.ok(!lines(plain.fallen).includes('vortexDefeat'));
  // a death by its embers is a death by sorcery
  assert.equal(deathMoment({ victimId: 'v', killerId: 'k', source: 'ember' }).fallen.magicDeath, 1);
  assert.ok(VOICE_LINES.vortexDefeat.cooldown >= 60, 'kept rare');
});

test('the new blows: committing to a fresh foe, his own spell landing, badly hurt (likelier on hardened plate) and the hurt he makes', () => {
  const world = { knight: () => ({ alive: true, health: 100 }), positionOf: () => null };
  const moments = new VoiceMoments();
  const tags = (groups, speaker) => groups.flat().filter((say) => say.speaker === speaker).map((say) => say.line);
  // the first blow of any encounter (whatever the health) is him committing to it: "I confront my foes head on!"
  const first = moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: 40, at: 1 }, world);
  assert.ok(tags(first, 'a').includes('headOn'));
  assert.ok(!tags(moments.damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: 20, at: 2 }, world), 'a').includes('headOn'));
  // his own Fireball or Frostfire landing
  const spell = new VoiceMoments().damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'fireball', amount: 18, health: 60, at: 1 }, world);
  assert.ok(tags(spell, 'a').includes('believeMagic'));
  // badly hurt and standing: his reserves, first if Sheathe in Steel took the blow
  const plated = new VoiceMoments().damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 19, health: 25, steel: 0.8, at: 1 }, world);
  assert.ok(tags(plated, 'v').includes('constitution'));
  const bare = new VoiceMoments().damage({ type: 'damage', attackerId: 'a', victimId: 'v', source: 'sword', amount: 26, health: 28, at: 1 }, world);
  assert.ok(tags(bare, 'v').includes('constitution'), 'without Steel too, at a smaller share');
  // the hurt he makes: severe, small after a long while, or ordinary
  const hurt = new VoiceMoments();
  assert.deepEqual(hurt.hurt({ victimId: 'v', amount: 30, at: 10 }), ['heavyHurt', 'hurt']);
  assert.deepEqual(hurt.hurt({ victimId: 'v', amount: 10, at: 12 }), ['hurt'], 'small, but not after a long while');
  assert.deepEqual(hurt.hurt({ victimId: 'v', amount: 10, at: 12 + MOMENTS.hurtSounds.coldSec }), ['coldHurt', 'hurt']);
});

test('the new falls: three kills without falling, the rushed, the leader, a fair fight either way, Chivalry ended', () => {
  const world = { knight: () => ({ alive: true, health: 100 }), positionOf: () => null };
  const moments = new VoiceMoments();
  const fall = (victimId, extra = {}, source = 'sword') => moments.death({ type: 'death', victimId, killerId: 'a', source, at: 5 }, { ...world, extra });
  const victor = (result) => result.victor.map((say) => say.line);
  const fallen = (result) => result.fallen.map((say) => say.line);
  fall('v1');
  fall('v2');
  assert.ok(victor(fall('v3')).includes('noSpare'), 'the third without falling');
  assert.ok(!victor(fall('v4')).includes('noSpare'), 'the third, not the fourth');
  // (his fall ends the streak)
  moments.death({ type: 'death', victimId: 'a', killerId: 'v1', source: 'sword', at: 6 }, world);
  fall('v5'); fall('v6');
  assert.ok(victor(fall('v7')).includes('noSpare'));
  assert.ok(victor(fall('x', { rushed: true })).includes('toldToWait'));
  assert.ok(victor(fall('y', { leader: true })).includes('renownDisowned'));
  // (the heavy third strike's breath is raised as it is swung, never after the fall: voiceWatch begin())
  assert.ok(!victor(fall('z', { finalStrike: true })).includes('firstStrike'), 'nothing breathed over the body');
  // a fair fight: fit for either of them, felled or felling, and behind the more particular lines of each
  assert.ok(fallen(fall('w', { fair: true })).includes('fairSquare'));
  assert.ok(victor(fall('w3', { fair: true })).includes('fairSquare'), 'the one who won it fair and square, too');
  assert.ok(!fallen(fall('w2', {})).includes('fairSquare') && !victor(fall('w4', {})).includes('fairSquare'));
  const fairWin = victor(fall('w5', { fair: true, rushed: true }));
  assert.ok(fairWin.indexOf('toldToWait') < fairWin.indexOf('fairSquare'), 'the rushed kill is the more particular');
  assert.equal(fallen(fall('m', { chivalry: true }))[0], 'masterBreak', 'the master takes a break, before anything else he might say');
});

test('a massive Sunder is two knights caught by its split ground, never one knight caught by two ruptures', () => {
  const world = { knight: () => ({ alive: true, health: 80 }), positionOf: () => null };
  const offered = (groups) => groups.flat().map((say) => say.line);
  const rupture = (moments, victimId, at) => moments.damage({ type: 'damage', attackerId: 'a', victimId, source: 'rupture', amount: 12, health: 80, at, ultimate: true }, world);
  const one = new VoiceMoments();
  rupture(one, 'b', 1);
  assert.ok(!offered(rupture(one, 'b', 1.7)).includes('victory'), 'the same knight again');
  const two = new VoiceMoments();
  rupture(two, 'b', 1);
  assert.ok(offered(rupture(two, 'c', 1.3)).includes('victory'), 'two knights: force has settled it');
});
