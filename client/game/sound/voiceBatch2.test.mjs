import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { VOICE_LINE_LIST, VOICE_TAGS, linesFor, validateVoiceLines, voiceLine } from './voiceLines.mjs';
import { VOICE_LINES, deathMoment } from './voiceRules.mjs';
import { EXCUSES, MOMENTS, VoiceMoments } from './voiceMoments.mjs';
import { SCENES, VoiceScenes } from './voiceScenes.mjs';
import { WATCH, VoiceWatch } from './voiceWatch.mjs';
import { VOICE_LIBRARY, captionPlan, subtitleFor } from '../../ui/voiceLibrary.mjs';

// The recordings of 2026-10-07: each new line at its own moment (and only then), the two new scenes said a part at a
// time and only as earned, the bad stretch's explanations one at a time, the pauses subtitled a beat at a time, and
// the words as he recorded them.

const manifest = JSON.parse(readFileSync(new URL('../../assets/voice/manifest.json', import.meta.url), 'utf8'));
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const runtime = source('../GameRuntime.mjs');
const main = source('../../main.mjs');
const said = (tags, options) => linesFor('k', tags, options).map((say) => say.line);
const lines = (group) => group.map((say) => say.line);

const NEW = Object.freeze({
  theoreticalVictory: 'crowdedBattleBegins', deservedAnyway: 'othersDueling', accreditedVictory: 'thirdPartyKill', thePrecursor: 'matchDragging',
  steelOof: 'steelRamHit', excuseYou: 'steelRamHit', continueToPass: 'passingKill', goingEasy: 'beatenAgain', realMatch: 'losingRunToOne',
  comeback: 'comebackRun', briefNap: 'napFall', mustBePractice: 'foeFlailing', feelBad: 'lastStand', possessed: 'possessedStretch',
  someError: 'matchLost', justYou: 'fairDuelKill',
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
const blow = (attackerId, victimId, at, source = 'sword', extra = {}) => ({ type: 'damage', attackerId, victimId, amount: 20, health: 60, source, at, ...extra });
const fall = (victimId, killerId, at, extra = {}) => ({ type: 'death', victimId, killerId, source: 'sword', at, respawnAt: at + 3, ...extra });
// (facing a point: the yaw that looks from `from` at `to`; three.js forward is (-sin, -cos))
const yawAt = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

test('12. every new line is declared, recorded and live at a moment the game raises; the Credits list each as written', () => {
  assert.deepEqual(validateVoiceLines({ manifest, files: readdirSync(new URL('../../assets/voice/', import.meta.url)) }).errors, []);
  const sources = ['./voiceMoments.mjs', './voiceRules.mjs', './voiceScenes.mjs', './voiceWatch.mjs', '../GameRuntime.mjs', '../../main.mjs'].map(source).join('\n');
  for (const [id, tag] of Object.entries(NEW)) {
    assert.ok(voiceLine(id), `${id} declared`);
    assert.ok(manifest.lines[id]?.length, `${id} recorded`);
    assert.ok(VOICE_LINES[id], `${id} can be said`);
    assert.ok(voiceLine(id).triggers[tag] > 0, `${id} waits for ${tag}`);
    assert.ok(!VOICE_TAGS[tag].future, `${tag} is live`);
    assert.ok(new RegExp(`['\`]${tag}['\`]|\\b${tag}: `).test(sources), `${tag} is raised somewhere`);
    const entry = VOICE_LIBRARY.find((each) => each.line === id);
    assert.ok(entry.title && entry.when && entry.note && entry.words, `${id} in the Credits`);
  }
  // the two scenes: one take for each part, in order
  assert.equal(manifest.lines.comeback.length, 2);
  assert.equal(manifest.lines.briefNap.length, 2);
  // the Credits' copy as the handoff gave it
  const credits = (id) => voiceLine(id).credits;
  assert.deepEqual([credits('theoreticalVictory').title, credits('theoreticalVictory').description, credits('theoreticalVictory').note],
    ['Theoretical Victory', 'Very rarely as a crowded match begins.', 'The proof remains theoretical.']);
  for (const [id, title, note] of [
    ['deservedAnyway', 'Deserved Anyway', 'Participation has been deemed optional.'], ['accreditedVictory', 'Accredited Victory', 'The record reflects his contribution.'],
    ['thePrecursor', 'The Precursor', 'The ceremony remains unscheduled.'], ['excuseYou', 'Excuse You', 'Responsibility for the collision was assigned immediately.'],
    ['continueToPass', 'Continue to Pass', 'Permission arrived after enforcement.'], ['goingEasy', 'Going Easy', 'The earlier events have been reclassified.'],
    ['realMatch', 'The Real Match', 'Earlier results have been excluded from the record.'], ['comeback', 'The Comeback', 'Its beginning required several revisions.'],
    ['briefNap', 'Brief Nap', 'The estimate proved accurate.'], ['mustBePractice', 'Must Be Practice', 'The venue has been diagnosed from the opposition.'],
    ['feelBad', 'Feel Bad', 'The consequence was still being formulated.'], ['possessed', 'Possessed', 'Former remains under dispute.'],
    ['someError', 'Some Sort of Error', 'The result has been rejected administratively.'], ['justYou', 'Just You', 'The distinction was important to him.'],
  ]) assert.deepEqual([credits(id).title, credits(id).note], [title, note], id);
});

test('the words as he recorded them: the tense of going easy and "near-former" kept; where a draft differed, the take', () => {
  assert.equal(voiceLine('goingEasy').text, 'You were quite lucky. I have decided that I was going easy on you.');
  assert.match(voiceLine('possessed').text, /regain my near-former glory!$/);
  assert.doesNotMatch(voiceLine('possessed').text, /my former glory/);
  // (the takes, not the drafts: "regardless", not "anyway"; "There must be", "This was not intended for me"; "It explains")
  assert.match(voiceLine('deservedAnyway').text, /I shall deserve the victory regardless!$/);
  assert.equal(voiceLine('someError').text, 'There must be some sort of error. This was not intended for me.');
  assert.equal(voiceLine('mustBePractice').text, 'This must be practice. It explains your behavior.');
  assert.equal(voiceLine('justYou').text, 'This needn’t be the end for us... Just you.');
  assert.equal(voiceLine('realMatch').text, 'Ha! I knew you were a practice dummy all along! Now the real match may begin.');
  assert.equal(voiceLine('accreditedVictory').text, 'And thus, I am accredited with the victory. Thank you. You may go now.');
  assert.deepEqual(voiceLine('comeback').parts, ['My comeback begins now...', 'Now...']);
  assert.deepEqual(voiceLine('briefNap').parts, ['I shall return after a brief nap...', 'It was brief.']);
});

test('1. the crowded start: only with three others or more on the field, never a duel, never the yard', () => {
  assert.ok(!said(['battleBegins']).includes('theoreticalVictory'), 'not at an ordinary start');
  assert.equal(said(['battleBegins', 'crowdedBattleBegins'])[0], 'theoreticalVictory', 'tried first when the field is crowded');
  assert.match(runtime, /const crowded = knights\.length >= 4;/);
  assert.match(runtime, /if \(!this\.#inPractice\(\) && knights\.length >= 2\) for \(const knight of knights\) this\.#sayMoment\(knight\.id, \['battleBegins', crowded && 'crowdedBattleBegins'\]\)/);
  // (knights: everyone but the yard's dummies)
  assert.match(runtime, /const knights = \(this\.latestSnapshot\?\.players \?\? \[\]\)\.filter\(\(p\) => p\.actorKind !== 'dummy'\);\n\s+\/\/ \(a crowded field/);
});

test('2. deserved anyway: two others at it some way off and in his sight; never his own fight, never too far, never the yard', () => {
  const run = ({ me = body('me', 0, 0), a = body('a', 0, -14), b = body('b', 1.5, -14), extra = [], practice = false } = {}) => {
    const watch = new VoiceWatch();
    me.yaw = yawAt(me.position, { x: (a.position.x + b.position.x) / 2, z: (a.position.z + b.position.z) / 2 });
    watch.damage(blow('a', 'b', 9));
    watch.damage(blow('b', 'a', 9.6));
    for (const event of extra) watch.damage(event);
    const out = watch.step(10, [me, a, b], { practice });
    return { watch, heard: tagsOf(out, 'me').includes('othersDueling'), out };
  };
  const seen = run();
  assert.ok(seen.heard, 'two others trading blows, 14 m off, in front of him');
  assert.ok(!tagsOf(seen.out, 'a').includes('othersDueling') && !tagsOf(seen.out, 'b').includes('othersDueling'), 'not the two of them');
  // once a match
  seen.watch.damage(blow('a', 'b', 10.5));
  seen.watch.damage(blow('b', 'a', 10.8));
  assert.ok(!tagsOf(seen.watch.step(11, [body('me', 0, 0), body('a', 0, -14), body('b', 1.5, -14)]), 'me').includes('othersDueling'));
  // his own fight: he has struck one of them lately
  assert.ok(!run({ extra: [blow('me', 'a', 7)] }).heard, 'he is in it');
  // only one way: no exchange
  const oneWay = new VoiceWatch();
  oneWay.damage(blow('a', 'b', 9));
  const me = body('me', 0, 0, { yaw: 0 });
  assert.ok(!tagsOf(oneWay.step(10, [me, body('a', 0, -14), body('b', 1.5, -14)]), 'me').includes('othersDueling'), 'blows both ways');
  // too far to be watching it, or right on top of it, or behind him
  assert.ok(!run({ a: body('a', 0, -40), b: body('b', 1, -40) }).heard, 'too far');
  assert.ok(!run({ a: body('a', 0, -3), b: body('b', 1, -3) }).heard, 'too near: that is his fight too');
  const behind = new VoiceWatch();
  behind.damage(blow('a', 'b', 9));
  behind.damage(blow('b', 'a', 9.5));
  assert.ok(!tagsOf(behind.step(10, [body('me', 0, 0, { yaw: Math.PI }), body('a', 0, -14), body('b', 1, -14)]), 'me').includes('othersDueling'), 'not in his sight');
  // the yard: never
  assert.ok(!run({ practice: true }).heard);
  assert.ok(WATCH.othersDueling.far <= 28, 'never farther than his words would carry');
});

test('3. accredited victory: a projectile final blow on a foe who was trading blows with someone else; never his own fight', () => {
  const watch = (events, victimAt = { x: 0, z: -12 }) => {
    const w = new VoiceWatch();
    w.step(4.9, [body('victim', victimAt.x, victimAt.z), body('other', victimAt.x + 1, victimAt.z), body('me', 0, 0)]);
    for (const event of events) w.damage(event);
    return w;
  };
  const exchange = [blow('other', 'victim', 3.5), blow('victim', 'other', 4.2)];
  const me = { x: 0, z: 0 };
  assert.ok(watch([...exchange, blow('me', 'victim', 5, 'fireball')]).thirdParty('victim', 'me', 5, me), 'shot from outside their fight');
  assert.ok(!watch([blow('me', 'victim', 5, 'fireball')]).thirdParty('victim', 'me', 5, me), 'nobody else was fighting them');
  assert.ok(!watch([blow('other', 'victim', 3.5), blow('me', 'victim', 5, 'fireball')]).thirdParty('victim', 'me', 5, me), 'an exchange: both ways');
  assert.ok(!watch([blow('other', 'victim', 0.5), blow('victim', 'other', 1), blow('me', 'victim', 5, 'fireball')]).thirdParty('victim', 'me', 5, me), 'lately');
  assert.ok(!watch([...exchange, blow('victim', 'me', 4.5), blow('me', 'victim', 5, 'fireball')]).thirdParty('victim', 'me', 5, me), 'they were fighting him too');
  assert.ok(!watch([...exchange, blow('me', 'victim', 3, 'sword'), blow('me', 'victim', 5, 'fireball')]).thirdParty('victim', 'me', 5, me), 'his own sword was in it');
  assert.ok(!watch([...exchange, blow('me', 'victim', 5, 'fireball')], { x: 0, z: -3 }).thirdParty('victim', 'me', 5, me), 'from close by, it is his fight');
  // the kill: a projectile's only
  const kill = (source) => {
    const moments = new VoiceMoments();
    return lines(moments.death({ ...fall('victim', 'me', 5), source }, { knight: () => null, extra: { thirdParty: true } }).victor);
  };
  assert.equal(kill('fireball')[0], 'accreditedVictory');
  assert.ok(kill('frostfire').includes('accreditedVictory') && kill('gauntlet').includes('accreditedVictory'));
  assert.ok(!kill('sword').includes('accreditedVictory'));
  assert.match(runtime, /thirdParty: Boolean\(killerId\) && PROJECTILES\.includes\(event\.source\) && this\.watch\.thirdParty\(victimId, killerId, at, this\.#bodyPosition\(killerId\)\)/);
});

test('4-5. the Steel ram: "Excuse you." only on real contact; the paired Oof from both, no words, never with "Excuse you." or a grunt', () => {
  // one moment, one line: the rare pair first, the remark otherwise (the first said is the only one)
  assert.deepEqual(said(['steelRamHit']), ['steelOof', 'excuseYou']);
  assert.ok(!said(['steelCharge']).includes('excuseYou'), 'never as the dash begins');
  assert.deepEqual(Object.keys(voiceLine('excuseYou').triggers), ['steelRamHit']);
  // the Oof: a sound, not a sentence: no subtitle
  assert.equal(voiceLine('steelOof').kind, 'exertion');
  assert.equal(subtitleFor('steelOof'), null);
  assert.equal(captionPlan('steelOof'), null);
  assert.ok(voiceLine('steelOof').rarity <= 0.1, 'very rarely');
  // raised from the host's ram itself (its contact), both still standing; the pair said by both, the one rammed a
  // breath behind, only when he can say it with him; and then no grunt of his for it
  const ram = runtime.slice(runtime.indexOf('#ramVoices(event) {'), runtime.indexOf('#rammed({ mine, onMe'));
  assert.match(runtime, /#steelRam\(event\) \{[\s\S]{0,200}this\.#ramVoices\(event\);/);
  assert.match(ram, /const standing = blow \? blow\.health > 0 : target\?\.alive !== false;/);
  assert.match(ram, /this\.moments\.lines\(event\.playerId, \['steelRamHit'\]\)/);
  assert.match(ram, /if \(say\.line === 'steelOof' && !both\) continue;/);
  assert.match(ram, /paired = Boolean\(this\.#say\('steelOof', event\.targetId, \{ force: true, delay: \(say\.delay \?\? 0\) \+ RAM_OOF_LAG \}\)\)/);
  assert.match(ram, /break;/);
  assert.match(ram, /if \(!paired && blow\.amount >= 8 && blow\.health > 0\) this\.#sayMoment\(blow\.victimId, hurt\);/);
  // (the ram's blow keeps its grunt for the ram to decide)
  assert.match(runtime, /if \(event\.source === 'ram'\) \(this\.ramBlows \?\?= new Map\(\)\)\.set\(event\.victimId, event\);\n\s+else if \(event\.amount >= 8/);
  assert.ok(!/['`]steelRamHit['`]/.test(source('./voiceWatch.mjs')), 'not a collision system: only the ram raises it');
});

test('6. continue to pass: a projectile kill on a foe sprinting across or past him; not at him, not away, not walking', () => {
  const seenRunning = (velocity, { sprinting = true, at = { x: 0, z: -10 } } = {}) => {
    const watch = new VoiceWatch();
    watch.step(9.8, [body('me', 0, 0), body('runner', at.x, at.z, { velocity: { x: velocity.x, y: 0, z: velocity.z }, sprinting })]);
    return watch.passing('runner', { x: 0, z: 0 }, 10);
  };
  assert.ok(seenRunning({ x: 7, z: 0 }), 'straight across');
  assert.ok(seenRunning({ x: 6, z: 2.5 }), 'across and a little toward');
  assert.ok(!seenRunning({ x: 0, z: 7 }), 'straight at him');
  assert.ok(!seenRunning({ x: 0, z: -7 }), 'straight away');
  assert.ok(!seenRunning({ x: 7, z: 0 }, { sprinting: false }), 'not sprinting');
  assert.ok(!seenRunning({ x: 2, z: 0 }), 'too slow');
  assert.ok(!seenRunning({ x: 7, z: 0 }, { at: { x: 0, z: -30 } }), 'too far to be passing him');
  const kill = (source) => lines(new VoiceMoments().death({ ...fall('runner', 'me', 10), source }, { knight: () => null, extra: { passing: true } }).victor);
  assert.equal(kill('fireball')[0], 'continueToPass');
  assert.ok(!kill('sword').includes('continueToPass'));
});

test('7. the comeback: declared after a real run, corrected only after each spoken part, twice at most, earned out by a kill', () => {
  const { say, heard } = voice();
  const scenes = new VoiceScenes({ say });
  const respawn = (at) => scenes.respawn({ type: 'respawn', playerId: 'me', at });
  // the opening: said through its moment (comebackRun opens the scene)
  assert.equal(VOICE_TAGS.comebackRun.opens, 'comeback');
  assert.match(runtime, /if \(say\.opens === 'comeback'\) this\.scenes\.comebackBegan\(say\.speaker, at\);/);
  scenes.comebackBegan('me', 10);
  assert.equal(respawn(11), false, 'nothing to correct yet');
  // felled without a kill: "Now..." as he gets up
  assert.deepEqual(scenes.death(fall('me', 'foe', 20)), { planFailed: false, victor: false, comeback: true });
  assert.equal(respawn(23), true);
  assert.deepEqual(heard(), ['me:comeback#1']);
  // and again
  scenes.death(fall('me', 'foe', 40));
  assert.equal(respawn(43), true);
  assert.deepEqual(heard(), ['me:comeback#1', 'me:comeback#1'], 'the same "Now..." take, twice');
  // a third fall: not restated; it simply ends (quietly)
  assert.equal(scenes.death(fall('me', 'foe', 60)).comeback, true, 'still its fall: no nap over it');
  assert.equal(respawn(63), false);
  assert.equal(heard().length, 2);
  // a kill while it stands: what he always knew (earned), in place of the victor's own taunt; and it is over
  const kill = voice();
  const won = new VoiceScenes({ say: kill.say });
  won.comebackBegan('me', 10);
  won.death(fall('me', 'foe', 20));
  won.respawn({ type: 'respawn', playerId: 'me', at: 23 });
  assert.deepEqual(won.death(fall('foe', 'me', 30)), { planFailed: false, victor: true });
  assert.deepEqual(kill.heard(), ['me:comeback#1', 'me:alwaysKnew']);
  assert.ok(kill.spoken[1].earned && kill.spoken[1].delay === SCENES.comeback.knewAfter);
  won.death(fall('foe2', 'me', 40));
  assert.equal(kill.heard().length, 2, 'once');
  // a part not said: the scene is over, nothing follows it
  const mute = voice((line, speaker, options) => options.part !== 1);
  const quiet = new VoiceScenes({ say: mute.say });
  quiet.comebackBegan('me', 10);
  quiet.death(fall('me', 'foe', 20));
  quiet.respawn({ type: 'respawn', playerId: 'me', at: 23 });
  quiet.death(fall('foe', 'me', 30));
  assert.deepEqual(mute.heard(), [], 'no "I always knew" after a "Now..." that was never said');
  // nothing comes of it for a while: over; a new match: over
  const stale = voice();
  const old = new VoiceScenes({ say: stale.say });
  old.comebackBegan('me', 10);
  old.step(10 + SCENES.comeback.expireSec + 1, [{ id: 'me', alive: true }, { id: 'foe', alive: true }]);
  old.death(fall('foe', 'me', 300));
  assert.deepEqual(stale.heard(), []);
  const reset = new VoiceScenes({ say: stale.say });
  reset.comebackBegan('me', 10);
  reset.reset();
  reset.death(fall('foe', 'me', 20));
  assert.deepEqual(stale.heard(), []);
  // alwaysKnew keeps its own moments as well
  assert.ok(voiceLine('alwaysKnew').triggers.rescued > 0 && voiceLine('alwaysKnew').triggers.messyKill > 0);
});

test('8. the brief nap: announced as he falls in a match that goes on; "It was brief." only on that return', () => {
  const tags = (fall) => Object.keys(deathMoment({ victimId: 'me', killerId: 'foe', source: 'sword', ...fall }).fallen);
  assert.ok(tags({ nap: true }).includes('napFall'));
  assert.ok(!tags({}).includes('napFall'));
  // the moment: his return to come, never the fall that ends the match, never the yard, never under a comeback
  const nap = (event, options = {}) => new VoiceMoments().death({ type: 'death', victimId: 'me', killerId: 'foe', source: 'sword', at: 10, ...event }, { knight: () => null, extra: { nap: true }, ...options }).fallen.some((say) => say.line === 'briefNap');
  assert.ok(nap({ respawnAt: 13 }));
  assert.ok(!nap({ respawnAt: 13, decisive: true }), 'the match is over: no return');
  assert.ok(!nap({}), 'no return to come');
  assert.ok(!nap({ respawnAt: 13 }, { practice: true }));
  assert.match(runtime, /nap: !scene\.comeback,/);
  assert.equal(VOICE_TAGS.napFall.opens, 'nap');
  assert.match(runtime, /if \(spoken\?\.opens === 'nap'\) this\.scenes\.napTaken\(victimId, at, event\.respawnAt\);/);
  // the payoff: only after the setup was said, and only on that return
  const { say, heard } = voice();
  const scenes = new VoiceScenes({ say });
  assert.equal(scenes.respawn({ type: 'respawn', playerId: 'me', at: 13 }), false, 'never without the setup');
  scenes.napTaken('me', 10, 13);
  assert.equal(scenes.respawn({ type: 'respawn', playerId: 'other', at: 13 }), false, 'his own return');
  assert.equal(scenes.respawn({ type: 'respawn', playerId: 'me', at: 13 }), true);
  assert.deepEqual(heard(), ['me:briefNap#1']);
  assert.equal(scenes.respawn({ type: 'respawn', playerId: 'me', at: 30 }), false, 'once');
  // no return in time (the match ended under him): nothing
  const late = voice();
  const gone = new VoiceScenes({ say: late.say });
  gone.napTaken('me', 10, 13);
  gone.step(13 + SCENES.briefNap.waitSec + 1, [{ id: 'me', alive: false }]);
  assert.equal(gone.respawn({ type: 'respawn', playerId: 'me', at: 40 }), false);
  // and the respawn's other words keep quiet when a scene has spoken
  assert.match(runtime, /if \(event\.type === 'respawn' && !this\.scenes\.respawn\(event\)\) \{/);
});

test('the bad stretch: one explanation at a time, each at its own moment; never two in one collapse', () => {
  const run = (killers, { saidAgo = () => Infinity } = {}) => {
    const moments = new VoiceMoments();
    killers.forEach((killer, i) => moments.death(fall('me', killer, i * 10), { knight: () => null }));
    return lines(moments.respawn({ type: 'respawn', playerId: 'me', at: killers.length * 10 }, { saidAgo }).flat());
  };
  // the same foe twice running: going easy; two different foes: nothing yet
  assert.deepEqual(run(['foe', 'foe']), ['goingEasy']);
  assert.deepEqual(run(['foe', 'other']), []);
  // three running: the real match only when one foe felled him every time, else the comeback or the vow
  assert.deepEqual(run(['foe', 'foe', 'foe']), ['realMatch', 'comeback', 'oneMoreDefeat']);
  assert.deepEqual(run(['foe', 'other', 'foe']), ['comeback', 'oneMoreDefeat']);
  // an explanation made lately (any of them): nothing more
  for (const line of EXCUSES) {
    const lately = (speaker, id) => (id === line ? 60 : Infinity);
    assert.deepEqual(run(['foe', 'foe', 'foe'], { saidAgo: lately }), [], `${line} said a minute ago`);
  }
  assert.ok(MOMENTS.excuses.apartSec >= 240);
  // possessed: struck while clearly losing, two falls into a run; not with an explanation made lately; never the first
  const possessed = (falls, saidAgo = () => Infinity) => {
    const moments = new VoiceMoments();
    for (let i = 0; i < falls; i += 1) moments.death(fall('me', 'foe', i * 10), { knight: () => null });
    return moments.damage({ type: 'damage', attackerId: 'foe', victimId: 'me', amount: 20, health: 30, source: 'sword', at: falls * 10 + 5 },
      { knight: (id) => (id === 'foe' ? { health: 90, alive: true } : null), saidAgo }).flat().filter((say) => say.speaker === 'me').map((say) => say.line);
  };
  assert.equal(possessed(2)[0], 'possessed');
  assert.ok(!possessed(1).includes('possessed'), 'one fall is a fall');
  assert.ok(!possessed(2, (speaker, id) => (id === 'goingEasy' ? 30 : Infinity)).includes('possessed'));
  // the long cooldowns: each of them rare and far apart
  for (const id of EXCUSES.filter((each) => each !== 'oneMoreDefeat')) assert.ok(voiceLine(id).cooldown >= 600 && voiceLine(id).rarity <= 0.3, id);
  // the yard: never
  const yard = new VoiceMoments();
  for (const at of [0, 10]) yard.death(fall('me', 'foe', at), { knight: () => null });
  assert.deepEqual(yard.respawn({ type: 'respawn', playerId: 'me', at: 20 }, { practice: true }), []);
});

test('9. must be practice: the same foe swinging and missing him again and again in a real match; never the yard', () => {
  const moments = new VoiceMoments();
  const miss = (at, options = {}) => moments.flailing('foe', 'me', at, { knight: () => ({ actorKind: 'human' }), ...options }).flatMap(lines);
  assert.deepEqual(miss(1), []);
  assert.deepEqual(miss(2), []);
  assert.deepEqual(miss(3), ['mustBePractice']);
  // a blow of theirs landing is no flailing: the count begins again
  miss(10); miss(11);
  moments.damage(blow('foe', 'me', 11.5), { knight: () => null });
  assert.deepEqual(miss(12), []);
  // too spread out
  const slow = new VoiceMoments();
  for (const at of [0, 4, 8]) assert.deepEqual(slow.flailing('foe', 'me', at, { knight: () => null }).flatMap(lines), []);
  // never in the yard, never a dummy's flailing
  const yard = new VoiceMoments();
  for (const at of [1, 2, 3]) assert.deepEqual(yard.flailing('foe', 'me', at, { practice: true }), []);
  const dummy = new VoiceMoments();
  for (const at of [1, 2, 3]) assert.deepEqual(dummy.flailing('foe', 'me', at, { knight: () => ({ actorKind: 'dummy' }) }), []);
  assert.match(runtime, /this\.moments\.flailing\(event\.playerId, near, event\.at, \{ practice: this\.#inPractice\(\), \.\.\.this\.#voiceWorld\(\) \}\)/);
});

test('10. some sort of error: the defeat screen\'s, never an ordinary fall; never stacked on a sentence he has just said', () => {
  assert.deepEqual(Object.keys(voiceLine('someError').triggers), ['matchLost']);
  assert.ok(!said(['death', 'matchDecided']).includes('someError'), 'not a death line');
  assert.equal(said(['matchLost'])[0], 'someError', 'tried first on the defeat screen');
  // the defeat screen is the only place a lost match is spoken of (main.mjs soundTheEnd: the one who lost it)
  const raisers = [runtime, ...['./voiceMoments.mjs', './voiceRules.mjs', './voiceScenes.mjs', './voiceWatch.mjs'].map(source)];
  for (const text of raisers) assert.doesNotMatch(text, /['`]matchLost['`]/);
  assert.match(main, /if \(won\) return;\n\s+for \(const say of linesFor\(socket\.playerId, \['matchLost'\]\)\) \{\n\s+const said = voice\.say\(/);
  // (written out on the defeat screen itself, beat by beat: the arena's HUD, with its subtitle, is put away with the match)
  assert.match(main, /const endCaption = new MenuCaption\(endScreen, \{ place: 'end-caption' \}\);/);
  assert.match(main, /const plan = captionPlan\(say\.line, \{ beats: said\.beats \}\);\n\s+if \(plan\) endCaption\.show\(\{ text: plan\.text, delay: said\.delay \+ plan\.after/);
  assert.match(main, /endCaption\.setEnabled\(view\.subtitles\);/);
  assert.match(main, /hud\.hide\(\);\n\s+setPracticeVisible\(false\);\n\s+updateEnd\(snapshot\);/, 'the HUD is put away before the screen speaks');
  // a passing line: held to the gap between sentences (so never on top of what he said as he fell), and one only
  assert.equal(voiceLine('someError').priority, 'normal');
  assert.ok(!VOICE_LINES.someError.interrupts);
  assert.ok(voiceLine('someError').rarity <= 0.3, 'the other words for a loss stay alive');
});

test('just you, feel bad, the precursor: each at its own moment', () => {
  // just you: a fair fight won, the match going on
  const victor = (moment) => Object.keys(deathMoment({ victimId: 'foe', killerId: 'me', source: 'sword', moment }).victor);
  assert.ok(victor({ fair: true }).includes('fairDuelKill'));
  assert.ok(!victor({ fair: true, decisive: true }).includes('fairDuelKill'), 'not the blow that wins the match');
  assert.ok(!victor({}).includes('fairDuelKill'));
  assert.equal(said(['kill', 'fairWin', 'fairDuelKill'])[0], 'justYou');
  // feel bad: badly hurt, a foe still a danger (the last stand's moment)
  assert.ok(said(['lastStand']).includes('feelBad'));
  // the precursor: well into a timed match, tied or behind, once a match; never in the late clock's last stretch
  const watch = new VoiceWatch();
  const knights = [{ id: 'me', alive: true, kills: 2 }, { id: 'foe', alive: true, kills: 4 }];
  assert.deepEqual(watch.clock(300, knights, { total: 360 }), [], 'too early');
  assert.deepEqual(tagsOf(watch.clock(150, knights, { total: 360 }), 'me'), ['matchDragging']);
  assert.deepEqual(tagsOf(watch.clock(140, knights, { total: 360 }), 'me'), [], 'once a match');
  const leader = new VoiceWatch();
  assert.deepEqual(tagsOf(leader.clock(150, knights, { total: 360 }), 'foe'), [], 'the sole leader is not kept waiting');
  const tied = new VoiceWatch();
  assert.deepEqual(tagsOf(tied.clock(150, [{ id: 'me', kills: 3 }, { id: 'foe', kills: 3 }], { total: 360 }), 'me'), ['matchDragging'], 'tied');
  const late = new VoiceWatch();
  assert.deepEqual(late.clock(30, knights, { total: 360 }).filter((m) => tagsOf([m], m.speaker).includes('matchDragging')), [], 'the last stretch is the late clock\'s');
  assert.ok(WATCH.matchDragging.least >= WATCH.lateClock.within + 15);
  assert.match(runtime, /this\.watch\.clock\(match\.matchStartedAt \+ match\.matchSeconds - this\.socket\.serverNow\(\), match\.players, \{ total: match\.matchSeconds \}\)/);
});

test('11. a line with a pause in it is subtitled a beat at a time, never ahead of him', () => {
  const paused = ['deservedAnyway', 'accreditedVictory', 'goingEasy', 'realMatch', 'mustBePractice', 'feelBad', 'possessed', 'someError', 'justYou'];
  for (const id of paused) {
    const line = voiceLine(id);
    assert.equal(line.beats.length, 2, id);
    const take = manifest.lines[id][0];
    assert.equal(take.beats.length, 2, `${id}: its take knows where its beats fall`);
    const plan = captionPlan(id, { beats: take.beats });
    // (the first shows only what comes before the pause; the payoff only once it is said)
    assert.equal(plan.text, line.beats[0].words, id);
    assert.ok(!plan.text.includes(line.beats[1].words), `${id}: the payoff is not shown early`);
    assert.equal(plan.cues.length, 1);
    assert.equal(plan.cues[0].text, line.beats[1].words);
    assert.ok(Math.abs(plan.cues[0].at - (take.beats[1] - take.beats[0])) < 1e-9 && plan.cues[0].at > 1, `${id}: the payoff's cue well into the take`);
    assert.ok(take.beats[1] > take.beats[0] + 1, `${id}: the payoff comes after the pause`);
  }
  // the payoffs where they fall in the recordings (the pause ending: where the next words begin)
  assert.equal(voiceLine('justYou').beats[1].at, 3.81);
  assert.equal(voiceLine('feelBad').beats[1].at, 4.13);
  assert.equal(voiceLine('accreditedVictory').beats[1].at, 3.74);
  // the Credits show each whole
  for (const id of paused) assert.equal(VOICE_LIBRARY.find((entry) => entry.line === id).words, voiceLine(id).text);
});
