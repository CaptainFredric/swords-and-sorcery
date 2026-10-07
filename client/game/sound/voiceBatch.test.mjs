import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { VOICE_LINE_LIST, VOICE_TAGS, beatSources, beatsOf, linesFor, partText, validateVoiceLines, voiceLine } from './voiceLines.mjs';
import { VOICE_LINES, VoiceDirector, deathLines, deathMoment } from './voiceRules.mjs';
import { MOMENTS, POSE, VoiceMoments, deathPose } from './voiceMoments.mjs';
import { SCENES, VoiceScenes } from './voiceScenes.mjs';
import { WATCH, VoiceWatch, lowestGround } from './voiceWatch.mjs';
import { VOICE_LIBRARY, captionsFor, libraryStatus, statusLabel, subtitleFor } from '../../ui/voiceLibrary.mjs';
import { searchShelves, searchTerms } from '../../ui/creditsSearch.mjs';
import { librarySections } from '../../ui/voiceLibrary.mjs';
import { HUD } from '../../ui/HUD.mjs';
import { processorArgs } from '../../../tools/audio/voice-ingest.mjs';

// The recordings of 2026-10-06: each new line said at its own moment (and only then), the scenes said a part at a
// time as the game earns them, the lines with a pause in them subtitled a beat at a time, and the Credits' copy as
// written. What was there before is held to as it was.

const manifest = JSON.parse(readFileSync(new URL('../../assets/voice/manifest.json', import.meta.url), 'utf8'));
const runtime = readFileSync(new URL('../GameRuntime.mjs', import.meta.url), 'utf8');
const said = (tags, options) => linesFor('k', tags, options).map((say) => say.line);
const lines = (group) => group.map((say) => say.line);

// the new lines, by the moment each waits for
const NEW = Object.freeze({
  heavyNow: 'sunderHeavy', spellBlade: 'chivalryShown', stopMoving: 'frostChill', scorchMark: 'fireballThrown', dismissed: 'galeDismissal',
  distanceAdvice: 'vortexSpin', bodyWilling: 'committedDeath', almostThere: 'matchPoint', thinkAbout: 'avengedLow', abyssCalls: 'abyssFall',
  braveFoolish: 'recklessSurvived', findTombstone: 'tombstoneSprint', oneMoreDefeat: 'losingRun', outOfTime: 'lateClock', stopYou: 'guardClaim',
  trapdoor: 'fleeDownward', theDeceased: 'rivalFelled', laidBack: 'fellBack', theSky: 'fellSkyward', wrongRest: 'restingBadly', notTired: 'death',
  spellDoom: 'standoff', doomCut: 'doomInterrupted', threeStrikes: 'strikeCount',
});

// a voice that says whatever it is allowed to (`allow`), and remembers what it said
function voice(allow = () => true, seconds = 1) {
  const spoken = [];
  const say = (line, speaker, options = {}) => {
    if (!allow(line, speaker, options)) return false;
    spoken.push({ line, speaker, ...options });
    return { seconds, delay: options.delay ?? 0 };
  };
  return { spoken, say, heard: () => spoken.map((e) => (Number.isInteger(e.part) ? `${e.speaker}:${e.line}#${e.part}` : `${e.speaker}:${e.line}`)) };
}
const body = (id, x, z, extra = {}) => ({ id, alive: true, health: 100, position: { x, y: 0, z }, velocity: { x: 0, y: 0, z: 0 }, ...extra });
const tagsOf = (moments, speaker) => moments.filter((m) => m.speaker === speaker).flatMap((m) => (Array.isArray(m.tags) ? m.tags : Object.keys(m.tags)));
const world = { floors: [{ center: [0, 0, 0], size: [40, 0.2, 40], y: 0 }], ramps: [{ minX: 10, maxX: 14, minZ: -2, maxZ: 2, axis: 'x', startY: 0, endY: 2 }] };

test('1. every new line is declared, recorded and live at a moment the game raises (the other side waits for teams)', () => {
  assert.deepEqual(validateVoiceLines({ manifest, files: readdirSync(new URL('../../assets/voice/', import.meta.url)) }).errors, []);
  const sources = ['./voiceMoments.mjs', './voiceRules.mjs', './voiceScenes.mjs', './voiceWatch.mjs', '../GameRuntime.mjs']
    .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
  for (const [id, tag] of Object.entries(NEW)) {
    assert.ok(voiceLine(id), `${id} declared`);
    assert.ok(manifest.lines[id]?.length, `${id} recorded`);
    assert.ok(VOICE_LINES[id], `${id} can be said`);
    assert.ok(voiceLine(id).triggers[tag] > 0, `${id} waits for ${tag}`);
    assert.ok(!VOICE_TAGS[tag].future, `${tag} is live`);
    assert.ok(new RegExp(`['\`]${tag}['\`]|\\b${tag}: `).test(sources), `${tag} is raised somewhere`);
  }
});

test('2. "I had hoped to see you on the other side." is recorded and waits for team matches: declared, never said', () => {
  const line = voiceLine('otherSide');
  assert.equal(line.coming, 'team matches');
  assert.ok(VOICE_TAGS.allyDefected.future, 'no team switch exists to raise it');
  assert.equal(VOICE_LINES.otherSide, undefined, 'it has no rule: it cannot be said yet');
  assert.ok(manifest.lines.otherSide?.length === 1, 'its take is there');
  const entry = VOICE_LIBRARY.find((e) => e.line === 'otherSide');
  assert.equal(libraryStatus(entry, true), 'coming');
  assert.equal(statusLabel(entry, true), 'WITH TEAM MATCHES');
  assert.equal(entry.section, 'Team');
  assert.deepEqual(said(['allyDefected']), [], 'not even if it were raised');
});

test('3. heavy now: once a Sunder, at its first slam after the cry, never in the cry\'s place, never with the sentence', () => {
  // the cry is still the cry's
  for (let i = 0; i < 50; i += 1) assert.ok(['sunderCall', 'victory'].includes(said(['sunderInvoked'], { rand: () => i / 50 })[0]));
  // the sentence's roll fails at the first slam into the ground; the cry still in his mouth for the next slam
  const { spoken, say } = voice((line) => line !== 'sunderLeave');
  let free = false;
  const scenes = new VoiceScenes({ say, free: () => free });
  scenes.sunderBegan('me');
  scenes.slamSwung('me', 1.0);
  scenes.groundSlam('me', 1.1);
  scenes.slamSwung('me', 1.7);
  assert.deepEqual(spoken.map((s) => s.line), [], 'the cry is not talked over');
  free = true;
  scenes.slamSwung('me', 2.4);
  assert.deepEqual(spoken.map((s) => [s.line, s.opening]), [['heavyNow', true]], 'the first slam his mouth is free for');
  scenes.slamSwung('me', 3.1);
  scenes.slamSwung('me', 3.8);
  assert.equal(spoken.length, 1, 'once a Sunder (one roll)');
  // a Sunder whose sentence began: its speech is the sentence
  const sentence = voice();
  const begun = new VoiceScenes({ say: sentence.say });
  begun.sunderBegan('me');
  begun.groundSlam('me', 1);
  for (let i = 1; i < 14; i += 1) begun.slamSwung('me', 1 + i * 0.7);
  assert.ok(sentence.spoken.every((s) => s.line === 'sunderLeave'), sentence.heard().join(' '));
  // the next Sunder weighs it afresh
  scenes.sunderEnded('me');
  scenes.sunderBegan('me');
  scenes.groundSlam('me', 20);
  scenes.slamSwung('me', 20.7);
  assert.equal(spoken.filter((s) => s.line === 'heavyNow').length, 2);
  assert.ok(!VOICE_TAGS.sunderHeavy.cry);
});

test('4. the Spellblade: only once that same Chivalry has shown a spell and a sword, weighed once', () => {
  const { spoken, say } = voice();
  const scenes = new VoiceScenes({ say });
  scenes.chivalryUsed('me', 'spell');
  scenes.chivalryUsed('me', 'sword');
  assert.equal(spoken.length, 0, 'no Chivalry: nothing shown');
  scenes.chivalryBegan('me');
  scenes.chivalryUsed('me', 'spell');
  scenes.chivalryUsed('me', 'spell');
  assert.equal(spoken.length, 0, 'sorcery alone');
  scenes.chivalryUsed('me', 'sword');
  assert.deepEqual(spoken.map((s) => s.line), ['spellBlade']);
  scenes.chivalryUsed('me', 'sword');
  scenes.chivalryUsed('me', 'spell');
  assert.equal(spoken.length, 1, 'once an activation');
  // a spell from one Chivalry does not count toward the next
  scenes.chivalryEnded('me');
  scenes.chivalryBegan('me');
  scenes.chivalryUsed('me', 'sword');
  assert.equal(spoken.length, 1);
  // shown while his mouth was busy (the cry): weighed at the next use it is free for, never lost, never twice
  let free = false;
  const busy = voice();
  const later = new VoiceScenes({ say: busy.say, free: () => free });
  later.chivalryBegan('me');
  later.chivalryUsed('me', 'spell');
  later.chivalryUsed('me', 'sword');
  assert.equal(busy.spoken.length, 0);
  free = true;
  later.chivalryUsed('me', 'sword');
  later.chivalryUsed('me', 'spell');
  assert.deepEqual(busy.spoken.map((s) => [s.line, s.opening]), [['spellBlade', true]]);
  // the runtime tells the scenes what each Chivalry shows
  assert.match(runtime, /this\.scenes\.chivalryUsed\(event\.playerId, 'spell'\)/);
  assert.match(runtime, /this\.scenes\.chivalryUsed\(event\.playerId, 'sword'\)/);
  assert.match(runtime, /this\.scenes\.chivalryBegan\(event\.playerId\)/);
});

test('5. stop moving: a Frostfire\'s chill taking hold on a foe (the host\'s word), never the cast itself', () => {
  assert.ok(!said(['spellCast', 'projectileGather']).includes('stopMoving'), 'not as it is cast');
  assert.deepEqual(said(['frostChill']), ['stopMoving']);
  // raised from the host's `chilled`, by its thrower, only for a chill worth remarking on
  assert.match(runtime, /event\.type === 'chilled' && event\.by && event\.by !== event\.playerId && event\.slow >= MOMENTS\.chill\.slow\) this\.#sayMoment\(event\.by, \['frostChill'\]\)/);
  // scorch mark: a Fireball thrown (left the hand), before it lands
  assert.deepEqual(said(['fireballThrown']), ['scorchMark']);
  assert.match(runtime, /event\.type === 'projectileSpawned' && event\.projectile\?\.spell === 'fireball'/);
});

test('6. dismissed: a foe a gust really moved, still about a moment later; not behind a guard, not falling to their end', () => {
  const gust = (affected) => ({ type: 'galeBlast', playerId: 'me', affected, at: 10 });
  const at = (watch, t, knights) => tagsOf(watch.step(t, knights, { world }), 'me');
  const knights = (foe) => [body('me', 0, 0), body('foe', 6, 0, foe)];
  // moved, and still standing a moment later
  const moved = new VoiceWatch();
  moved.gale(gust([{ id: 'foe', pressure: 0.8, guarded: false }]));
  assert.ok(!at(moved, 10.5, knights()).includes('galeDismissal'), 'a moment first');
  assert.ok(at(moved, 10 + WATCH.dismissal.afterSec, knights()).includes('galeDismissal'));
  assert.ok(!at(moved, 12, knights()).includes('galeDismissal'), 'once a gust');
  // barely touched, or behind a guard: nothing
  for (const caught of [{ id: 'foe', pressure: 0.3, guarded: false }, { id: 'foe', pressure: 0.9, guarded: true }]) {
    const watch = new VoiceWatch();
    watch.gale(gust([caught]));
    assert.ok(!at(watch, 11, knights()).includes('galeDismissal'));
  }
  // thrown to their death: felled, or already falling past saving, is not "for now"
  const felled = new VoiceWatch();
  felled.gale(gust([{ id: 'foe', pressure: 0.9, guarded: false }]));
  felled.death('foe');
  assert.ok(!at(felled, 11, knights({ alive: false })).includes('galeDismissal'));
  const falling = new VoiceWatch();
  falling.gale(gust([{ id: 'foe', pressure: 0.9, guarded: false }]));
  assert.ok(!at(falling, 11, [body('me', 0, 0), body('foe', 30, 0, { position: { x: 30, y: -2, z: 0 }, velocity: { x: 0, y: -8, z: 0 } })]).includes('galeDismissal'));
  assert.deepEqual(said(['galeDismissal']), ['dismissed']);
});

test('7. distance advice stands beside the Vortex\'s own noise, never in its place', () => {
  assert.deepEqual(said(['vortexSpin']), ['distanceAdvice', 'vortexUse']);
  assert.ok(VOICE_LINES.vortexUse && VOICE_LINES.distanceAdvice);
  // one or the other, about as often (the first tried by its own odds, the second if it kept quiet)
  const advice = VOICE_LINES.distanceAdvice.chance;
  const noise = (1 - advice) * VOICE_LINES.vortexUse.chance;
  assert.ok(Math.abs(advice - noise) < 0.1, `${advice} vs ${noise.toFixed(2)}`);
});

test('8. almost there: one kill from winning, in a fresh encounter, once a match; never the yard', () => {
  const moments = new VoiceMoments();
  const table = { me: { health: 100 }, a: { health: 100 }, b: { health: 100 } };
  const ctx = (point) => ({ knight: (id) => table[id] ?? null, matchPoint: () => point });
  const blow = (victimId, at) => ({ type: 'damage', attackerId: 'me', victimId, source: 'sword', amount: 20, health: 80, at });
  const raised = (groups) => groups.flatMap(lines).includes('almostThere');
  assert.ok(!raised(moments.damage(blow('a', 1), ctx(false))), 'not one short of it');
  moments.reset();
  assert.ok(raised(moments.damage(blow('a', 1), ctx(true))), 'one kill from it, meeting a foe');
  assert.ok(!raised(moments.damage(blow('a', 2), ctx(true))), 'the same encounter carrying on');
  assert.ok(!raised(moments.damage(blow('b', 3), ctx(true))), 'nor a second foe: once a match');
  moments.reset();
  assert.ok(raised(moments.damage(blow('b', 4), ctx(true))), 'a new match');
  // the runtime's word on match point: a scored match's goal, never the Practice Yard
  assert.match(runtime, /matchPoint: \(id\) => \{\s+const goal = this\.latestSnapshot\?\.scoreToWin;\s+return Number\.isFinite\(goal\) && !this\.#inPractice\(\)/);
  assert.ok(VOICE_LINES.almostThere.cooldown >= 300);
  // two performances, two takes of the one line
  assert.equal(manifest.lines.almostThere.length, 2);
  assert.equal(voiceLine('almostThere').parts, undefined);
});

test('9. think about it: over the foe who just left him nearly dead, or to the one whose blow loses him the match', () => {
  // avenged
  const moments = new VoiceMoments();
  const table = { me: { health: 9 }, foe: { health: 40 } };
  const ctx = { knight: (id) => table[id] ?? null };
  moments.damage({ type: 'damage', attackerId: 'foe', victimId: 'me', source: 'sword', amount: 30, health: 9, at: 10 }, ctx);
  const { victor } = moments.death({ type: 'death', victimId: 'foe', killerId: 'me', source: 'sword', at: 14 }, ctx);
  assert.equal(lines(victor)[0], 'thinkAbout');
  // too long after, or another foe: an ordinary kill
  const late = new VoiceMoments();
  late.damage({ type: 'damage', attackerId: 'foe', victimId: 'me', source: 'sword', amount: 30, health: 9, at: 10 }, ctx);
  assert.ok(!lines(late.death({ type: 'death', victimId: 'foe', killerId: 'me', source: 'sword', at: 10 + MOMENTS.avenged.withinSec + 1 }, ctx).victor).includes('thinkAbout'));
  const hale = new VoiceMoments();
  hale.damage({ type: 'damage', attackerId: 'foe', victimId: 'me', source: 'sword', amount: 30, health: 40, at: 10 }, ctx);
  assert.ok(!lines(hale.death({ type: 'death', victimId: 'foe', killerId: 'me', source: 'sword', at: 12 }, ctx).victor).includes('thinkAbout'), 'never nearly dead');
  // the match lost to that blow: the fallen's first line
  assert.equal(lines(deathLines({ victimId: 'me', killerId: 'foe', source: 'sword', decisive: true }).fallen)[0], 'thinkAbout');
  assert.ok(!lines(deathLines({ victimId: 'me', killerId: 'foe', source: 'sword' }).fallen).includes('thinkAbout'), 'an ordinary fall');
  assert.equal(deathMoment({ victimId: 'me', killerId: null, source: 'abyss', decisive: true }).fallen.matchDecided, undefined, 'no blow, nobody to blame');
});

test('10. the Abyss calls: raised as he falls past saving, said through that fall; anything else that fells him cuts it', () => {
  const watch = new VoiceWatch();
  const lowest = lowestGround(world);
  assert.equal(lowest, 0);
  const over = (y, vy) => body('me', 30, 0, { position: { x: 30, y, z: 0 }, velocity: { x: 0, y: vy, z: 0 } });
  assert.ok(!tagsOf(watch.step(1, [over(-0.4, -6), body('foe', 0, 0)], { world }), 'me').includes('abyssFall'), 'still within reach of a ledge');
  assert.ok(!tagsOf(watch.step(1.1, [over(-1, 1), body('foe', 0, 0)], { world }), 'me').includes('abyssFall'), 'rising (a jump)');
  assert.ok(tagsOf(watch.step(1.2, [over(-1.2, -7), body('foe', 0, 0)], { world }), 'me').includes('abyssFall'));
  assert.ok(!tagsOf(watch.step(1.3, [over(-3, -9), body('foe', 0, 0)], { world }), 'me').includes('abyssFall'), 'once a fall');
  assert.deepEqual(said(['abyssFall']), ['abyssCalls']);
  // the fall's own end does not cut it; the runtime keeps it, and cuts anything else
  assert.equal(voiceLine('abyssCalls').outlasts, 'abyss');
  assert.match(runtime, /const outlasts = saying && voiceLine\(saying\)\?\.outlasts === event\.source;\s+if \(!outlasts\) this\.voice\?\.cut\?\.\(event\.victimId, 0\.12\);/);
  // and nobody's death line talks over it: a line of state, his own mouth busy with it
  const director = new VoiceDirector({ rand: () => 0 });
  assert.ok(director.consider('abyssCalls', 'me', 0, { duration: 3.2 }));
  assert.equal(director.consider('defeat', 'me', 0.8, { duration: 2 }), null);
  assert.equal(director.saying('me', 1), 'abyssCalls');
});

test('11. his tombstone: low, burning, sprinting with the burn still at him; two takes of one line; once a life', () => {
  const run = (me) => {
    const watch = new VoiceWatch();
    watch.damage({ type: 'damage', attackerId: 'foe', victimId: 'me', source: 'burn', amount: 4, health: me.health ?? 22, at: 9.5 });
    return tagsOf(watch.step(10, [body('me', 0, 0, { sprinting: true, health: 22, burningUntil: 12, ...me }), body('foe', 0, -9)]), 'me');
  };
  assert.ok(run({}).includes('tombstoneSprint'));
  assert.ok(!run({ health: 60 }).includes('tombstoneSprint'), 'not low');
  assert.ok(!run({ burningUntil: 0 }).includes('tombstoneSprint'), 'no burn on him');
  assert.ok(!run({ sprinting: false }).includes('tombstoneSprint'), 'not running');
  const watch = new VoiceWatch();
  watch.damage({ type: 'damage', attackerId: 'foe', victimId: 'me', source: 'burn', amount: 4, health: 22, at: 9.5 });
  const me = body('me', 0, 0, { sprinting: true, health: 22, burningUntil: 12 });
  watch.step(10, [me, body('foe', 0, -9)]);
  watch.damage({ type: 'damage', attackerId: 'foe', victimId: 'me', source: 'burn', amount: 4, health: 18, at: 10.4 });
  assert.ok(!tagsOf(watch.step(10.5, [me, body('foe', 0, -9)]), 'me').includes('tombstoneSprint'), 'once a life');
  assert.equal(manifest.lines.findTombstone.length, 2, 'MustFindTombstone.mp3 and 2026_10_06_21_04_49.mp3');
  assert.equal(voiceLine('findTombstone').perLife, 1);
});

test('12. one more defeat: a real run of falls with no kill between, said as he rises; and nothing said after the next', () => {
  const moments = new VoiceMoments();
  const fall = (at, killerId = 'foe') => moments.death({ type: 'death', victimId: 'me', killerId, source: 'sword', at }, { knight: () => null });
  const rise = (at, practice = false) => moments.respawn({ type: 'respawn', playerId: 'me', at }, { practice }).flatMap(lines);
  fall(1); assert.deepEqual(rise(5), [], 'one fall is a fall');
  fall(10); assert.deepEqual(rise(15), []);
  fall(20); assert.deepEqual(rise(25), ['oneMoreDefeat'], 'the third in a row');
  fall(30); assert.deepEqual(rise(35), [], 'the next fall: nothing (no change of heart is announced)');
  // a kill of his own ends the run
  const answered = new VoiceMoments();
  const f = (at) => answered.death({ type: 'death', victimId: 'me', killerId: 'foe', source: 'sword', at }, { knight: () => null });
  f(1); f(10);
  answered.death({ type: 'death', victimId: 'foe', killerId: 'me', source: 'sword', at: 12 }, { knight: () => null });
  f(20);
  assert.deepEqual(answered.respawn({ type: 'respawn', playerId: 'me', at: 25 }).flatMap(lines), []);
  // never in the yard
  const yard = new VoiceMoments();
  for (const at of [1, 10, 20]) yard.death({ type: 'death', victimId: 'me', killerId: 'dummy', source: 'sword', at }, { knight: () => null });
  assert.deepEqual(yard.respawn({ type: 'respawn', playerId: 'me', at: 25 }, { practice: true }), []);
  // nothing is declared to answer it
  assert.ok(!VOICE_LINE_LIST.some((line) => line.id !== 'oneMoreDefeat' && line.triggers.losingRun));
});

test('13. out of time: the last seconds of a timed match he is not winning, once a match; never the yard', () => {
  const watch = new VoiceWatch();
  const field = [{ id: 'me', kills: 3 }, { id: 'lead', kills: 5 }, { id: 'dummy', kills: 0, actorKind: 'dummy' }];
  assert.deepEqual(watch.clock(40, field), [], 'not yet');
  assert.deepEqual(watch.clock(20, field).map((m) => m.speaker), ['me'], 'behind (and the leader has nothing to finish; a dummy says nothing)');
  assert.deepEqual(watch.clock(15, field), [], 'once a match');
  const tied = new VoiceWatch();
  assert.deepEqual(tied.clock(20, [{ id: 'a', kills: 4 }, { id: 'b', kills: 4 }]).map((m) => m.speaker), ['a', 'b'], 'tied: both');
  assert.deepEqual(new VoiceWatch().clock(2, field), [], 'too late to begin it');
  // the runtime asks only of a timed match in play, never the yard's or sudden death
  assert.match(runtime, /match\.roomState === 'PLAYING' && Number\.isFinite\(match\.matchSeconds\) && Number\.isFinite\(match\.matchStartedAt\) && !match\.suddenDeath && !this\.#inPractice\(\)/);
});

test('14. that should stop you: a guard raised against a real threat; disproved only if that guard breaks soon after', () => {
  const step = (scenes, t, me, foe) => scenes.step(t, [body('me', 0, 0, me), body('foe', 0, -2, foe)]);
  const open = () => {
    const spoken = voice();
    const scenes = new VoiceScenes({ say: spoken.say });
    step(scenes, 0, { guarding: false }, {});
    step(scenes, 1, { guarding: true }, { attackActive: true });
    return { scenes, ...spoken };
  };
  // the claim, then its correction when that guard breaks
  const broken = open();
  assert.deepEqual(broken.heard(), ['me:stopYou#0']);
  step(broken.scenes, 1.5, { guarding: true }, { attackActive: true });
  broken.scenes.guardBroken({ type: 'guardBreak', defenderId: 'me', attackerId: 'foe', at: 2.2 });
  assert.deepEqual(broken.heard(), ['me:stopYou#0', 'me:stopYou#1']);
  assert.equal(broken.spoken[1].earned, true, 'earned: no second roll');
  // no threat, or a guard tapped up again at once: nothing
  const idle = voice();
  const quiet = new VoiceScenes({ say: idle.say });
  step(quiet, 0, { guarding: false }, {});
  step(quiet, 1, { guarding: true }, {});
  assert.equal(idle.spoken.length, 0, 'nobody swinging at him');
  const tap = voice();
  const tapping = new VoiceScenes({ say: tap.say });
  step(tapping, 0, { guarding: true }, {});
  step(tapping, 0.1, { guarding: false }, { attackActive: true });
  step(tapping, 0.2, { guarding: true }, { attackActive: true });
  assert.equal(tap.spoken.length, 0, 'tapped');
  // let down, or too late, or the threat gone: the claim forgotten, nothing more
  const released = open();
  step(released.scenes, 1.4, { guarding: false }, { attackActive: true });
  step(released.scenes, 1.4 + SCENES.guardClaim.graceSec + 0.05, { guarding: false }, {});
  released.scenes.guardBroken({ type: 'guardBreak', defenderId: 'me', at: 2 });
  assert.deepEqual(released.heard(), ['me:stopYou#0']);
  const expired = open();
  expired.scenes.guardBroken({ type: 'guardBreak', defenderId: 'me', at: 1 + SCENES.guardClaim.standsSec + 0.2 });
  assert.deepEqual(expired.heard(), ['me:stopYou#0']);
  const gone = open();
  step(gone.scenes, 1.5, { guarding: true }, { alive: false });
  gone.scenes.guardBroken({ type: 'guardBreak', defenderId: 'me', at: 1.8 });
  assert.deepEqual(gone.heard(), ['me:stopYou#0']);
  // (the guard seen down a moment before the break is heard of is still that guard broken)
  const order = open();
  step(order.scenes, 1.6, { guarding: false }, { attackActive: true });
  order.scenes.guardBroken({ type: 'guardBreak', defenderId: 'me', at: 1.6 });
  assert.deepEqual(order.heard(), ['me:stopYou#0', 'me:stopYou#1']);
  assert.match(runtime, /if \(event\.type === 'guardBreak'\) this\.scenes\.guardBroken\(event\)/);
});

test('15. the trapdoor: fleeing a foe close behind at a sprint and searching the ground, not a glance', () => {
  const flee = (frames) => {
    const watch = new VoiceWatch();
    const out = [];
    for (const [t, extra] of frames) out.push(...watch.step(t, [body('me', 0, t * 7, { sprinting: true, velocity: { x: 0, y: 0, z: 7 }, pitch: -0.9, ...extra }), body('foe', 0, t * 7 - 5, { velocity: { x: 0, y: 0, z: 6 } })]));
    return tagsOf(out, 'me');
  };
  const frames = (n, extra = {}) => Array.from({ length: n }, (_, i) => [i * 0.1, extra]);
  assert.ok(flee(frames(9)).includes('fleeDownward'), 'a moment of searching');
  assert.ok(!flee(frames(3)).includes('fleeDownward'), 'a glance');
  assert.ok(!flee(frames(9, { pitch: 0 })).includes('fleeDownward'), 'eyes ahead');
  assert.ok(!flee(frames(9, { sprinting: false })).includes('fleeDownward'), 'not running for it');
  // low, likelier
  const watch = new VoiceWatch();
  let out = [];
  for (let i = 0; i < 9; i += 1) out = out.concat(watch.step(i * 0.1, [body('me', 0, i * 0.7, { sprinting: true, velocity: { x: 0, y: 0, z: 7 }, pitch: -0.9, health: 20 }), body('foe', 0, i * 0.7 - 5)]));
  assert.equal(out.find((m) => m.speaker === 'me' && m.tags.fleeDownward).tags.fleeDownward, WATCH.flee.lowScale);
  assert.deepEqual(said(['fleeDownward']), ['trapdoor']);
});

test('16. the deceased: felling a foe each has felled again and again; never an ordinary kill', () => {
  const moments = new VoiceMoments();
  const kill = (killerId, victimId, at) => lines(moments.death({ type: 'death', victimId, killerId, source: 'sword', at }, { knight: () => null }).victor);
  assert.ok(!kill('me', 'rival', 1).includes('theDeceased'));
  assert.ok(!kill('rival', 'me', 2).includes('theDeceased'));
  assert.ok(!kill('rival', 'me', 3).includes('theDeceased'), 'they have felled him twice; he them once');
  assert.ok(kill('me', 'rival', 4).includes('theDeceased'), 'two each: a rivalry');
  assert.ok(!kill('me', 'stranger', 5).includes('theDeceased'));
  moments.reset();
  assert.ok(!kill('me', 'rival', 6).includes('theDeceased'), 'a new match, no history');
});

test('17. three strikes: counted on that same foe\'s sword wounds, each when the last count is said; four only if they stand for four', () => {
  const hit = (victimId, at, health = 60, source = 'sword') => ({ type: 'damage', attackerId: 'me', victimId, source, amount: 20, health, at });
  const declared = () => {
    const spoken = voice(() => true, 1.5);
    const scenes = new VoiceScenes({ say: spoken.say });
    scenes.strikesDeclared('me', 'foe', 10, 3.5);
    return { scenes, ...spoken };
  };
  const counted = declared();
  counted.scenes.damage(hit('foe', 12));
  assert.deepEqual(counted.heard(), [], 'the declaration is still being said');
  counted.scenes.damage(hit('foe', 14));
  counted.scenes.damage(hit('foe', 14.5));
  counted.scenes.damage(hit('other', 16));
  counted.scenes.damage(hit('foe', 16, 60, 'gauntlet'));
  counted.scenes.damage(hit('foe', 16.1));
  counted.scenes.damage(hit('foe', 18));
  assert.deepEqual(counted.heard(), ['me:threeStrikes#1', 'me:threeStrikes#2', 'me:threeStrikes#3'], 'one blow at a time, his sword on that foe only');
  assert.ok(counted.spoken.every((s) => s.earned));
  counted.scenes.damage(hit('foe', 20));
  assert.deepEqual(counted.heard().at(-1), 'me:threeStrikes#4', 'they stood for a fourth');
  counted.scenes.damage(hit('foe', 22));
  assert.equal(counted.spoken.length, 4, 'and that is the end of it');
  // felled on the way: no more counting
  const felled = declared();
  felled.scenes.damage(hit('foe', 14));
  felled.scenes.damage(hit('foe', 16, 0));
  felled.scenes.damage(hit('foe', 18));
  assert.deepEqual(felled.heard(), ['me:threeStrikes#1']);
  // he falls, or it goes quiet: over
  const fell = declared();
  fell.scenes.death({ type: 'death', victimId: 'me', killerId: 'foe', source: 'sword', at: 12 });
  fell.scenes.damage(hit('foe', 14));
  assert.equal(fell.spoken.length, 0);
  const stale = declared();
  stale.scenes.damage(hit('foe', 14));
  stale.scenes.step(14 + SCENES.threeStrikes.after + 1.5 + SCENES.threeStrikes.staleSec + 0.1, [body('me', 0, 0), body('foe', 0, -2)]);
  stale.scenes.damage(hit('foe', 25));
  assert.deepEqual(stale.heard(), ['me:threeStrikes#1']);
  // opened at his first sword blow of a fresh encounter (both whole): the runtime counts from there
  const moments = new VoiceMoments();
  const table = { me: { health: 100 }, foe: { health: 100 } };
  const groups = moments.damage({ type: 'damage', attackerId: 'me', victimId: 'foe', source: 'sword', amount: 20, health: 80, at: 1 }, { knight: (id) => table[id] });
  assert.ok(groups.some((group) => group.some((say) => say.line === 'threeStrikes' && say.opens === 'threeStrikes')));
  assert.equal(moments.duelFoe('me'), 'foe');
  assert.match(runtime, /say\.opens === 'threeStrikes'\) this\.scenes\.strikesDeclared\(/);
  assert.equal(voiceLine('threeStrikes').parts.length, 5);
  assert.equal(manifest.lines.threeStrikes.length, 5);
});

test('18. spell your doom: felled at any point, the rest never said or shown, and the interruption has the last word', () => {
  const fall = deathMoment({ victimId: 'me', killerId: 'foe', source: 'sword', doomCut: true });
  assert.equal(linesFor('me', fall.fallen)[0].line, 'doomCut');
  assert.equal(VOICE_LINES.doomCut.chance, 1);
  assert.equal(VOICE_LINES.doomCut.priority, 3, 'a line of state: it is the fall');
  assert.match(runtime, /this\.#deathVoice\(event, \{ doomCut: saying === 'spellDoom' \}\)/);
  // the runtime cuts the scene's take before the fall's line
  assert.match(runtime, /if \(!outlasts\) this\.voice\?\.cut\?\.\(event\.victimId, 0\.12\);\s+this\.#deathVoice/);
  // its words come a letter at a time: never the whole spelling at once
  const beats = captionsFor('spellDoom');
  assert.equal(beats[0], 'I shall spell your doom.');
  assert.equal(beats[1], 'D...');
  assert.equal(beats[2], 'D-O...');
  assert.equal(beats.at(-1), 'You get the idea.');
  assert.equal(beats.length, 2 + 13 + 1, 'the D and the thirteen O\'s as performed');
  // the standoff that gives him the time: a foe ahead at a distance, calm for a while
  const watch = new VoiceWatch();
  const me = body('me', 0, 0, { yaw: 0 });
  const foe = body('foe', 0, -12);
  watch.step(0, [me, foe]);
  assert.ok(!tagsOf(watch.step(3, [me, foe]), 'me').includes('standoff'));
  assert.ok(tagsOf(watch.step(WATCH.standoff.calmSec + 0.1, [me, foe]), 'me').includes('standoff'));
  const looking = new VoiceWatch();
  looking.step(0, [body('me', 0, 0, { yaw: Math.PI }), foe]);
  assert.ok(!tagsOf(looking.step(6, [body('me', 0, 0, { yaw: Math.PI }), foe]), 'me').includes('standoff'), 'facing away');
  const struck = new VoiceWatch();
  struck.step(0, [me, foe]);
  struck.damage({ type: 'damage', attackerId: 'foe', victimId: 'me', source: 'fireball', amount: 10, health: 90, at: 3 });
  assert.ok(!tagsOf(struck.step(6, [me, foe]), 'me').includes('standoff'), 'struck a moment ago');
});

// a HUD, its caption's words as they are set
function captionHud() {
  const made = [];
  const node = () => {
    const classes = new Set();
    return {
      dataset: {}, style: { setProperty() {} }, textContent: '', innerHTML: '',
      classList: { add: (n) => classes.add(n), remove: (n) => classes.delete(n), toggle: (n, on) => (on ? classes.add(n) : classes.delete(n)), contains: (n) => classes.has(n) },
      querySelector: () => node(), querySelectorAll: () => [], append() {}, replaceChildren() {}, setAttribute() {},
    };
  };
  const elements = new Map();
  globalThis.document = {
    createElement: () => { const n = node(); made.push(n); return n; },
    querySelector: (selector) => { if (!elements.has(selector)) elements.set(selector, node()); return elements.get(selector); },
  };
  return { view: new HUD(), words: () => made.at(-1)?.textContent };
}

test('19. a line with a pause in it is subtitled a beat at a time, never ahead of him; the Credits show it whole', () => {
  const timers = [];
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; };
  globalThis.clearTimeout = (id) => { if (timers[id]) timers[id].live = false; };
  const until = (ms) => { for (const t of timers) if (t.live && t.ms <= ms) { t.live = false; t.fn(); } };
  try {
    const { view, words } = captionHud();
    const [first, second] = captionsFor('abyssCalls');
    view.subtitle({ text: first, speaker: 'me', seconds: 3.2, cues: [{ at: 2.53, text: second }] });
    until(0);
    assert.equal(words(), 'The Abyss calls me...');
    until(2000);
    assert.equal(words(), 'The Abyss calls me...', 'nothing ahead of him');
    until(2530);
    assert.equal(words(), 'hello?');
    // cut off (felled on the way): the beat not yet reached is never shown
    view.subtitle({ text: 'I shall spell your doom.', speaker: 'me', seconds: 13, cues: [{ at: 2.08, text: 'D...' }] });
    until(0);
    view.subtitleCut('me');
    until(5000);
    assert.equal(words(), 'I shall spell your doom.');
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
  // every line subtitled in beats: its words in order, its later beats timed in its recording and placed in its take,
  // and no beat shows a word the beat before has not reached
  for (const line of VOICE_LINE_LIST) {
    const parts = line.parts ? line.parts.map((_, i) => i) : [null];
    for (const part of parts) {
      const beats = beatsOf(line.id, part);
      if (!beats) continue;
      const take = manifest.lines[line.id][part ?? 0];
      assert.equal(take.beats.length, beats.length, `${line.id}: its take knows where its beats fall`);
      for (let i = 1; i < take.beats.length; i += 1) assert.ok(take.beats[i] > take.beats[i - 1] && take.beats[i] < take.seconds, `${line.id} beat ${i}`);
    }
  }
  assert.ok(!captionsFor('spellBlade')[0].includes('blade’!'), 'the payoff is not in the setup');
  assert.deepEqual(captionsFor('bodyWilling'), ['My mind is willing...', 'and my body...', 'was willing.']);
  assert.ok(!captionsFor('bodyWilling').slice(0, 2).join(' ').includes('was'), '"was willing" only when it is heard');
  assert.deepEqual(captionsFor('braveFoolish'), ['The difference between bravery or foolishness?...', 'When I do it.']);
  assert.deepEqual(captionsFor('threeStrikes', 3), ['Three!..', 'where’s the flee?']);
  // the runtime shows them so, from the take's own beats
  assert.match(runtime, /const captions = captionsFor\(line, part\);\s+const timed = captions && beats\?\.length === captions\.length;/);
  // the Credits: the whole line, as one work
  const entry = (id) => VOICE_LIBRARY.find((e) => e.line === id);
  assert.equal(entry('spellBlade').words, 'Why do you think I am called the Spellblade?... Because I can spell ‘blade’!');
  assert.equal(entry('bodyWilling').words, 'My mind is willing... and my body... was willing.');
  assert.equal(entry('braveFoolish').words, 'The difference between bravery or foolishness?... When I do it.', '"or", as performed');
  assert.equal(entry('threeStrikes').parts, 5);
  // the recording tool is told where the beats begin
  assert.deepEqual(beatSources(voiceLine('abyssCalls')), [[2.9]]);
  const args = processorArgs('threeStrikes', ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(JSON.parse(args[args.indexOf('--beats') + 1]), [[2.21], null, null, [1.62], [1.14]]);
  assert.ok(!processorArgs('heavyNow', ['a']).includes('--beats'), 'a line said whole has none');
});

test('20. what was there stays as it was: short lines whole, the old scenes, Head On in Steel, ranks and rarities', () => {
  // short lines: whole
  for (const id of ['heavyNow', 'stopMoving', 'dismissed', 'notTired', 'defeat', 'killTaunt', 'headOn']) assert.equal(captionsFor(id), null, id);
  assert.equal(subtitleFor('heavyNow'), 'This sword is heavy now!!');
  // the Sunder sentence still as far as it has got; the two-part scenes each part its own
  assert.equal(subtitleFor('sunderLeave', 3), 'How. Many. More. Times.');
  assert.equal(subtitleFor('finalDuel', 1), '...the quest continues.');
  assert.equal(subtitleFor('stopYou', 1), 'That did not stop you!');
  assert.equal(subtitleFor('threeStrikes', 2), 'Two! You will be through!');
  assert.equal(partText('threeStrikes', 0), 'Strikes I count Three! And you will be forced to Flee!');
  // Head On: the Steel charge's own line, as the dash begins, whether or not the ram lands
  assert.deepEqual(voiceLine('headOn').triggers, { steelCharge: 5, charge: 1, engage: 0.5 });
  assert.equal(said(['steelCharge', 'dash'])[0], 'headOn');
  assert.ok(!VOICE_LINE_LIST.some((line) => line.id !== 'headOn' && line.triggers.steelCharge), 'nothing else claims the Steel charge');
  // the new lines of a fall are lines of state, like the others; the rest wait their turn
  for (const id of ['bodyWilling', 'abyssCalls', 'laidBack', 'theSky', 'wrongRest', 'notTired', 'doomCut']) assert.equal(voiceLine(id).priority, 'high', id);
  for (const id of ['heavyNow', 'spellBlade', 'stopMoving', 'scorchMark', 'dismissed', 'distanceAdvice', 'almostThere', 'thinkAbout', 'braveFoolish',
    'findTombstone', 'oneMoreDefeat', 'outOfTime', 'stopYou', 'trapdoor', 'theDeceased', 'spellDoom', 'threeStrikes']) assert.equal(voiceLine(id).priority, 'normal', id);
  // rare means rare: no new line is said more often than now and then, none without a cooldown (but the interruption)
  for (const id of Object.keys(NEW)) {
    if (id === 'doomCut') continue;
    assert.ok(voiceLine(id).rarity <= 0.4, `${id} rarity`);
    assert.ok((Array.isArray(voiceLine(id).cooldown) ? voiceLine(id).cooldown[0] : voiceLine(id).cooldown) >= 60, `${id} cooldown`);
  }
  // a fall's pose lines: only on the ground; the sky's only with his eyes up
  const victim = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0.1 };
  assert.deepEqual(deathPose(victim, { x: 0, z: -3 }, { world }), { back: true, skyward: true, inconvenient: false }, 'struck from in front');
  assert.equal(deathPose(victim, { x: 0, z: 3 }, { world }).back, false, 'from behind');
  assert.equal(deathPose({ ...victim, pitch: -0.4 }, { x: 0, z: -3 }, { world }).skyward, false);
  assert.equal(deathPose({ ...victim, position: { x: 0, y: 1.5, z: 0 } }, { x: 0, z: -3 }, { world }), null, 'in the air');
  assert.equal(deathPose(victim, { x: 0, z: -3 }, { world, source: 'abyss' }), null);
  assert.equal(deathPose({ ...victim, position: { x: 12, y: 1, z: 0 } }, null, { world }).inconvenient, true, 'on a ramp');
  assert.equal(deathPose({ ...victim, burningUntil: 5 }, null, { world, at: 4 }).inconvenient, true, 'alight');
  assert.ok(POSE.fromFront > 0);
  const posed = (pose) => lines(deathLines({ victimId: 'me', killerId: 'foe', source: 'sword', pose }).fallen);
  assert.deepEqual(posed({ back: true, skyward: true, inconvenient: false }).slice(0, 2), ['theSky', 'laidBack']);
  assert.equal(posed({ back: false, skyward: false, inconvenient: true })[0], 'wrongRest');
  assert.ok(!posed(null).some((line) => ['theSky', 'laidBack', 'wrongRest'].includes(line)));
  // committed to it as he fell: mid-swing, dashing, charging
  const committed = (victim, extra = {}) => lines(new VoiceMoments().death({ type: 'death', victimId: 'me', killerId: 'foe', source: 'sword', at: 5 }, { knight: (id) => (id === 'me' ? victim : null), extra }).fallen);
  assert.equal(committed({ attackActive: true })[0], 'bodyWilling');
  assert.equal(committed({ dashUntil: 6 })[0], 'bodyWilling');
  assert.equal(committed({}, { charging: true })[0], 'bodyWilling');
  assert.ok(!committed({ guarding: true }).includes('bodyWilling'), 'guarding is no commitment to attack');
  // reckless and alive: a charge while low, survived
  const watch = new VoiceWatch();
  const frames = [];
  for (let i = 0; i <= 12; i += 1) frames.push(watch.step(i * 0.05, [body('me', 0, -i * 0.4, { sprinting: true, health: 25, velocity: { x: 0, y: 0, z: -8 } }), body('foe', 0, -14)]));
  assert.ok(!frames.flat().some((m) => m.speaker === 'me' && m.tags.includes?.('recklessSurvived')), 'not yet survived');
  assert.ok(tagsOf(watch.step(5, [body('me', 0, -5, { health: 25 }), body('foe', 0, -14)]), 'me').includes('recklessSurvived'));
  const hale = new VoiceWatch();
  for (let i = 0; i <= 12; i += 1) hale.step(i * 0.05, [body('me', 0, -i * 0.4, { sprinting: true, velocity: { x: 0, y: 0, z: -8 } }), body('foe', 0, -14)]);
  assert.ok(!tagsOf(hale.step(5, [body('me', 0, -5), body('foe', 0, -14)]), 'me').includes('recklessSurvived'), 'a whole knight charging one foe is not reckless');
});

test('21. the lines still without a recording stay silent: nothing is made up for them', () => {
  for (const id of ['dash', 'fistEffort', 'neverReach']) {
    assert.ok(voiceLine(id), `${id} declared`);
    assert.equal(manifest.lines[id], undefined, `${id} has no take`);
    const entry = VOICE_LIBRARY.find((e) => e.line === id);
    assert.equal(statusLabel(entry, false), 'NO RECORDING');
  }
});

test('22. the Credits\' copy as written, and found by its words; what was replaced is gone', () => {
  const entry = (id) => VOICE_LIBRARY.find((e) => e.line === id);
  assert.deepEqual([entry('dash').title, entry('dash').when, entry('dash').note], ['Dash', 'A short exhale sometimes forced out by a Dash.', 'The distance was brief. The effort was not.']);
  assert.deepEqual([entry('fistEffort').title, entry('fistEffort').when, entry('fistEffort').note], ['Gauntlet Effort', 'A short exertion behind the thrown gauntlet.', 'The throw is not effortless.']);
  assert.deepEqual([entry('neverReach').title, entry('neverReach').when, entry('neverReach').note], ['Never Reach Me', 'Rarely, after a Practice Yard victory.', 'Instruction has concluded.']);
  assert.equal(entry('vortexUse').note, 'Speech has become impractical.');
  assert.equal(entry('abolishBattle').note, 'The proposal was withdrawn immediately.');
  assert.equal(entry('herald').note, 'A higher authority has been requested.');
  assert.equal(entry('lowerGuard').note, 'The instruction was eventually obeyed.');
  assert.equal(entry('magicDefeat').note, 'His objection does not extend to personal use.');
  // a few of the new ones, to the letter
  assert.deepEqual([entry('thinkAbout').title, entry('thinkAbout').when, entry('thinkAbout').note],
    ['Think About It', 'Rarely after avenging a near-fatal attack—or receiving the final blow that loses the match.', 'Responsibility has been assigned outward.']);
  assert.deepEqual([entry('stopYou').title, entry('stopYou').note], ['That Should Stop You', 'The conclusion was revised promptly.']);
  assert.equal(entry('theDeceased').note, 'The rivalry has been granted an unusually long maintenance period.');
  assert.equal(entry('spellDoom').when, 'Very rarely, when he has enough uninterrupted time to begin spelling a threat.');
  // search: what is there is found, what was replaced is not
  const recorded = (line) => Boolean(manifest.lines[line]?.length);
  const shelves = librarySections(recorded);
  const status = (e) => statusLabel(e, recorded(e.line));
  const found = (query) => searchShelves(shelves, searchTerms(query), status).flatMap((shelf) => shelf.entries.map((e) => e.line));
  assert.deepEqual(found('proposal withdrawn'), ['abolishBattle']);
  assert.ok(found('gauntlet effort').includes('fistEffort'));
  assert.deepEqual(found('customer service'), []);
  assert.deepEqual(found('dimensionality'), []);
  assert.ok(found("don't surrender").includes('almostThere'), 'a straight quote finds the curly one');
  assert.ok(found('no recording').includes('dash'));
  assert.ok(found('trapdoor').includes('trapdoor'));
});
