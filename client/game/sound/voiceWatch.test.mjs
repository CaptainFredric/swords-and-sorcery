import test from 'node:test';
import assert from 'node:assert/strict';
import { WATCH, VoiceWatch } from './voiceWatch.mjs';
import { PROWESS } from '../../../shared/src/prowess.mjs';

// What the voice watches for over time (voiceWatch.mjs): moments that are a way of moving or a stretch of quiet.

const knight = (id, x, z, extra = {}) => ({ id, alive: true, position: { x, y: 0, z }, velocity: { x: 0, y: 0, z: 0 }, ...extra });
const tagsOf = (moments, speaker) => moments.filter((m) => m.speaker === speaker).flatMap((m) => m.tags);
// run the watch frame by frame (`frames`: [{ at, knights }]) and gather what it raised
function run(watch, frames) {
  const said = [];
  for (const { at, knights } of frames) said.push(...watch.step(at, knights));
  return said;
}

test('a charge: sprinting straight at a foe and closing fast, once an approach; walking, or past them, is none', () => {
  const watch = new VoiceWatch();
  const frames = [];
  for (let i = 0; i <= 20; i += 1) {
    const z = -i * 0.4;
    frames.push({ at: i * 0.05, knights: [knight('a', 0, z, { sprinting: true, velocity: { x: 0, y: 0, z: -8 } }), knight('b', 0, -16)] });
  }
  const said = run(watch, frames);
  assert.deepEqual(tagsOf(said, 'a').filter((t) => t === 'charge'), ['charge'], 'once, as he closes');
  // at a walk, or running past them at an angle: no charge
  const walk = new VoiceWatch();
  assert.ok(!tagsOf(run(walk, [{ at: 0, knights: [knight('a', 0, 0, { velocity: { x: 0, y: 0, z: -3 } }), knight('b', 0, -10)] }]), 'a').includes('charge'));
  const past = new VoiceWatch();
  assert.ok(!tagsOf(run(past, [{ at: 0, knights: [knight('a', 0, 0, { sprinting: true, velocity: { x: 8, y: 0, z: -3 } }), knight('b', 0, -10)] }]), 'a').includes('charge'));
});

test('a pursuit: closing on a foe who keeps drawing away, for a while', () => {
  const watch = new VoiceWatch();
  const frames = [];
  for (let i = 0; i <= 40; i += 1) {
    const at = i * 0.05;
    frames.push({ at, knights: [knight('a', 0, -at * 7, { velocity: { x: 0, y: 0, z: -7 } }), knight('b', 0, -9 - at * 6, { velocity: { x: 0, y: 0, z: -6 } })] });
  }
  const said = run(watch, frames);
  assert.equal(tagsOf(said, 'a').filter((t) => t === 'pursuit').length, 1);
  assert.ok(!tagsOf(said, 'b').includes('pursuit'), 'the one who runs is not chasing');
  // a moment of it is not a chase
  const brief = new VoiceWatch();
  const short = frames.filter((f) => f.at <= WATCH.pursuit.holdSec - 0.1);
  assert.ok(!tagsOf(run(brief, short), 'a').includes('pursuit'));
});

test('arriving: the first foe met in a life, once; a lull: nobody near and nothing done for a while, once a lull', () => {
  const watch = new VoiceWatch();
  let said = run(watch, [{ at: 0, knights: [knight('a', 0, 0), knight('b', 0, -40)] }, { at: 1, knights: [knight('a', 0, 0), knight('b', 0, -10)] }]);
  assert.deepEqual(tagsOf(said, 'a').filter((t) => t === 'arrive'), ['arrive']);
  said = run(watch, [{ at: 2, knights: [knight('a', 0, 0), knight('b', 0, -9)] }]);
  assert.ok(!tagsOf(said, 'a').includes('arrive'), 'once a life');
  // a new life, a new arrival
  run(watch, [{ at: 3, knights: [knight('a', 0, 0, { alive: false }), knight('b', 0, -9)] }]);
  said = run(watch, [{ at: 6, knights: [knight('a', 0, 0), knight('b', 0, -9)] }]);
  assert.ok(tagsOf(said, 'a').includes('arrive'));
  // the lull
  const quiet = new VoiceWatch();
  const far = (at) => ({ at, knights: [knight('a', 0, 0), knight('b', 0, -40)] });
  assert.ok(!tagsOf(run(quiet, [far(0), far(WATCH.lull.quietSec - 1)]), 'a').includes('lull'));
  assert.ok(tagsOf(run(quiet, [far(WATCH.lull.quietSec + 0.1)]), 'a').includes('lull'));
  assert.ok(!tagsOf(run(quiet, [far(WATCH.lull.quietSec + 5)]), 'a').includes('lull'), 'once a lull');
  // a blow, a swing or a foe coming near ends it
  const busy = new VoiceWatch();
  run(busy, [far(0)]);
  busy.damage({ attackerId: 'b', victimId: 'a', amount: 10, at: 10 });
  assert.ok(!tagsOf(run(busy, [far(WATCH.lull.quietSec + 1)]), 'a').includes('lull'));
});

test('standing ground: drawing back from a foe for a while, then turning to swing at them', () => {
  const watch = new VoiceWatch();
  for (let i = 0; i <= 30; i += 1) {
    const at = i * 0.05;
    watch.step(at, [knight('a', 0, at * 3, { velocity: { x: 0, y: 0, z: 3 } }), knight('b', 0, -2 + at * 3, { velocity: { x: 0, y: 0, z: 3 } })]);
  }
  const knights = [knight('a', 0, 4.5), knight('b', 0, 2.5)];
  assert.ok(tagsOf(watch.swing({ playerId: 'a', strikeIndex: 0, at: 1.7 }, knights), 'a').includes('standsGround'));
  assert.ok(!tagsOf(watch.swing({ playerId: 'a', strikeIndex: 1, at: 2.4 }, knights), 'a').includes('standsGround'), 'once');
  // a swing with no ground given first is no stand
  const fresh = new VoiceWatch();
  fresh.step(0, knights);
  assert.ok(!tagsOf(fresh.swing({ playerId: 'a', strikeIndex: 0, at: 0.1 }, knights), 'a').includes('standsGround'));
});

test('swings as they go live: a chain carrying on past its third strike', () => {
  const watch = new VoiceWatch();
  const swing = (strikeIndex, at) => tagsOf(watch.swing({ playerId: 'a', strikeIndex, at }), 'a');
  assert.ok(!swing(0, 20).includes('firstSwing'), 'the first swing after a while is told as it begins, not here');
  swing(1, 20.7);
  assert.ok(!swing(2, 21.4).includes('longChain'), 'three strikes are a chain, not a long one');
  assert.ok(swing(0, 22.0).includes('longChain'), 'held on into the next: it carries on');
  assert.ok(!swing(1, 22.7).includes('longChain'), 'once a chain');
  // let go between: not one chain
  const broken = new VoiceWatch();
  for (const [strike, at] of [[0, 0], [1, 0.7], [2, 1.4], [0, 4]]) assert.ok(!tagsOf(broken.swing({ playerId: 'a', strikeIndex: strike, at }), 'a').includes('longChain'));
});

test('a broken balance found again before the one who broke it struck: said by him; struck in time, or felled, nothing', () => {
  const knights = [knight('a', 0, 0), knight('b', 0, -2)];
  const escaped = new VoiceWatch();
  escaped.staggerBreak({ playerId: 'b', by: 'a', until: 11, at: 10 });
  assert.ok(!tagsOf(escaped.step(10.5, knights), 'a').includes('staggerEscaped'), 'not while it lasts');
  assert.ok(tagsOf(escaped.step(11.05, knights), 'a').includes('staggerEscaped'));
  const punished = new VoiceWatch();
  punished.staggerBreak({ playerId: 'b', by: 'a', until: 11, at: 10 });
  punished.damage({ attackerId: 'a', victimId: 'b', amount: 26, at: 10.5 });
  assert.ok(!tagsOf(punished.step(11.05, knights), 'a').includes('staggerEscaped'));
  const fallen = new VoiceWatch();
  fallen.staggerBreak({ playerId: 'b', by: 'a', until: 11, at: 10 });
  assert.ok(!tagsOf(fallen.step(11.05, [knights[0], { ...knights[1], alive: false }]), 'a').includes('staggerEscaped'));
});

test('a blow taken that filled his Prowess; a foe\'s sword narrowly missing him as he moves', () => {
  const watch = new VoiceWatch();
  watch.step(10, [knight('a', 0, 0, { prowess: PROWESS.full - 5 }), knight('b', 0, -2)]);
  watch.damage({ attackerId: 'b', victimId: 'a', amount: 20, at: 10.1 });
  assert.ok(tagsOf(watch.step(10.2, [knight('a', 0, 0, { prowess: PROWESS.full }), knight('b', 0, -2)]), 'a').includes('hurtToReady'));
  // filled by blows he dealt, long after any he took: not this
  const dealt = new VoiceWatch();
  dealt.step(10, [knight('a', 0, 0, { prowess: PROWESS.full - 5 })]);
  assert.ok(!tagsOf(dealt.step(12, [knight('a', 0, 0, { prowess: PROWESS.full })]), 'a').includes('hurtToReady'));
  // the near miss: the nearest within reach, and on the move (or dashing)
  const moving = [knight('b', 0, -2), knight('a', 0, 0, { velocity: { x: 4, y: 0, z: 0 } })];
  assert.deepEqual(new VoiceWatch().miss({ playerId: 'b', at: 5 }, moving), [{ speaker: 'a', tags: ['nearMiss'] }]);
  const still = [knight('b', 0, -2), knight('a', 0, 0)];
  assert.deepEqual(new VoiceWatch().miss({ playerId: 'b', at: 5 }, still), [], 'standing still, it simply missed');
  const dashing = [knight('b', 0, -2), knight('a', 0, 0, { dashUntil: 5.1 })];
  assert.equal(new VoiceWatch().miss({ playerId: 'b', at: 5 }, dashing).length, 1);
  const far = [knight('b', 0, -9), knight('a', 0, 0, { velocity: { x: 4, y: 0, z: 0 } })];
  assert.deepEqual(new VoiceWatch().miss({ playerId: 'b', at: 5 }, far), [], 'nowhere near him');
});

test('asked at a fall: did the fallen rush the victor; was it a fair fight', () => {
  const watch = new VoiceWatch();
  // b sprints at a, closing fast, then falls to a
  watch.step(9.5, [knight('a', 0, 0), knight('b', 0, -6, { sprinting: true, velocity: { x: 0, y: 0, z: 8 } })]);
  assert.equal(watch.rushed('b', 'a', 10), true);
  assert.equal(watch.rushed('b', 'a', 9.5 + WATCH.rushed.withinSec + 0.5), false, 'long ago is not rushing');
  assert.equal(watch.rushed('a', 'b', 10), false);
  // a fair fight: blows both ways, lately, and a sword ends it
  const fair = new VoiceWatch();
  for (const [from, to, at] of [['a', 'b', 1], ['b', 'a', 2], ['a', 'b', 3], ['b', 'a', 4]]) fair.damage({ attackerId: from, victimId: to, amount: 20, at, source: 'sword' });
  assert.equal(fair.fair('a', 'b', 5, 'sword'), true);
  assert.equal(fair.fair('a', 'b', 5, 'fireball'), false, 'a spell is no exchange of blows');
  const oneSided = new VoiceWatch();
  for (const at of [1, 2, 3]) oneSided.damage({ attackerId: 'b', victimId: 'a', amount: 20, at, source: 'sword' });
  assert.equal(oneSided.fair('a', 'b', 4, 'sword'), false);
});

test('a swing as it begins: the first after a while, and the heavy third strike swung at a foe it would fell', () => {
  const watch = new VoiceWatch();
  const begin = (strikeIndex, at, knights = []) => tagsOf(watch.begin({ playerId: 'a', strikeIndex, at }, knights), 'a');
  assert.ok(begin(0, 20).includes('firstSwing'), 'as the chain begins: before the blade goes live');
  watch.swing({ playerId: 'a', strikeIndex: 0, at: 20.31 });
  assert.deepEqual(begin(1, 20.72), [], 'the chain\'s later strikes are not its first swing');
  watch.swing({ playerId: 'a', strikeIndex: 1, at: 21.01 });
  assert.deepEqual(begin(0, 23), [], 'swinging lately: no first swing');
  assert.ok(begin(0, 21.01 + WATCH.firstSwing.afterSec + 0.1).includes('firstSwing'));
  // the heavy third strike, at a foe in reach ahead (a facing -z) that a blow would fell
  const at = (foe) => [knight('a', 0, 0, { yaw: 0 }), knight('b', foe.x ?? 0, foe.z ?? -2, { health: 25, ...foe })];
  assert.ok(begin(2, 40, at({})).includes('finalStrike'));
  assert.deepEqual(begin(1, 40, at({})), [], 'only the heavy third strike');
  assert.deepEqual(begin(2, 40, at({ health: 60 })), [], 'a blow would not fell them');
  assert.deepEqual(begin(2, 40, at({ guarding: true })), [], 'they are guarding');
  assert.deepEqual(begin(2, 40, at({ z: 2 })), [], 'behind him');
  assert.deepEqual(begin(2, 40, at({ z: -WATCH.finalStrike.reach - 1 })), [], 'out of reach');
});

test('another knight\'s swings are seen beginning in his chain (mine are told by my own arms)', () => {
  const watch = new VoiceWatch();
  const swings = (moments) => tagsOf(moments, 'a').filter((tag) => tag === 'firstSwing' || tag === 'finalStrike');
  const swinging = (committed, extra = {}) => [knight('a', 0, 0, { yaw: 0, attackActive: true, attackStartedAt: 50, attackCommitted: committed, ...extra }), knight('b', 0, -2, { health: 20 })];
  assert.ok(swings(watch.step(50.05, swinging(1))).includes('firstSwing'), 'his chain begun');
  assert.deepEqual(swings(watch.step(50.1, swinging(1))), [], 'once');
  assert.deepEqual(swings(watch.step(50.8, swinging(2))), []);
  assert.ok(swings(watch.step(51.5, swinging(3))).includes('finalStrike'), 'the third, at a foe it would fell');
  // my own knight is left to my arms
  const mine = new VoiceWatch();
  assert.deepEqual(swings(mine.step(50.05, swinging(1), { self: 'a' })), []);
  // seen too late to lead the swing: nothing
  const late = new VoiceWatch();
  assert.deepEqual(swings(late.step(50 + WATCH.begunFreshSec + 0.2, swinging(1))), []);
});
