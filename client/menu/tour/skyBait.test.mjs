import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIGHTS, FIGHT_POOL, SKY_BAIT, makeSkyBait, makeSkyBaitPayoff } from './tourFights.mjs';
import { FIGHT_DISTANCES, lineupFor } from './tourSchedule.mjs';
import { blockedMoments, castlewardBlockers, fightShot, placeFight } from './tourCamera.mjs';
import { buildTourPath } from './tourPath.mjs';

// Sky-Bait (tourFights.mjs): a rival who learns the wrong lesson. The setup: his Guard turns two blows, a Fireball
// goes up into the sky, he lowers his Guard to watch it, and the Spellblade simply walks on. The payoff, the next round
// at that same rival: he looks up before anything is done to him, a quick Fireball goes straight at him, his Guard
// comes up, and he is laid flat through it. The rival remembers between the two (TourDirector memory).

const setup = makeSkyBait();
const payoff = makeSkyBaitPayoff();
const P = SKY_BAIT.payoff;
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const director = source('./TourDirector.mjs');
const types = (fight) => fight.cues.map((cue) => cue.type);

test('1-3. the setup: he waits behind his Guard, and both blows are Guard contacts; nobody is felled', () => {
  assert.equal(setup.rival(-30).clip, 'Guard', 'Guarding as the Spellblade arrives');
  assert.equal(setup.rival(0.1).clip, 'Guard');
  const clashes = setup.cues.filter((cue) => cue.type === 'clash').map((cue) => cue.at);
  assert.deepEqual(clashes, [...SKY_BAIT.tinks], 'two TINKs');
  for (const at of clashes) {
    assert.equal(setup.rival(at).clip, 'Guard', 'his Guard up as it rings');
    assert.equal(setup.rival(at).looking, 0);
  }
  // a swing for each, the Spellblade's
  assert.deepEqual(setup.cues.filter((cue) => cue.type === 'swing').map((cue) => cue.by), ['hero', 'hero']);
  // and it cannot end as a kill: no blow lands, nothing burns or breaks, nobody falls
  for (const kind of ['hit', 'impact', 'burn', 'shatter', 'cut', 'flag', 'freeze', 'melt']) assert.ok(!types(setup).includes(kind), kind);
  for (let t = -1; t < setup.duration + 4; t += 0.1) {
    assert.notEqual(setup.rival(t).clip, 'Death');
    assert.notEqual(setup.rival(t).gone, true);
  }
});

test('4-6. the Fireball goes up, not at him, and is gone; he looks up only once it has; the Spellblade just leaves', () => {
  const cast = setup.cues.find((cue) => cue.type === 'cast');
  assert.deepEqual([cast.spell, cast.up, cast.at], ['fireball', true, SKY_BAIT.release]);
  assert.ok(!setup.cues.some((cue) => cue.type === 'impact'), 'it lands on nobody');
  // (sent up into the sky, out over him and on up; it is dropped once it has risen out of the scene)
  assert.match(director, /else if \(cue\.up\) \{[\s\S]*?to = from\.clone\(\)\.addScaledVector\(this\.frames\[index\]\.u, 1\.6\)\.add\(new THREE\.Vector3\(0, 12, 0\)\);/);
  assert.match(director, /vanish: Boolean\(cue\.up\)/);
  assert.match(director, /this\.projectiles = this\.projectiles\.filter\(\(projectile\) => !\(projectile\.vanish && this\.time - projectile\.start >= projectile\.flight\)\);/);
  // his eyes go up only after it has gone up, and his Guard comes down with them
  assert.equal(setup.rival(SKY_BAIT.release).looking, 0);
  assert.ok(SKY_BAIT.lookUp[0] > SKY_BAIT.release);
  assert.equal(setup.rival(SKY_BAIT.lookUp[1]).looking, 1);
  assert.equal(setup.rival(SKY_BAIT.lookUp[0] + 0.05).clip, 'Idle', 'the Guard lowered');
  const up = setup.rival(SKY_BAIT.lookUp[1]).rotations.find((turn) => turn.bone === 'head');
  assert.ok(up.axis[0] === 1 && up.angle > 0.6, 'well up, not a glance');
  // and he is still looking up as the Spellblade walks away, as he goes out of shot, and the rest of the round
  for (const t of [SKY_BAIT.leave[1], SKY_BAIT.walk[0] + 0.5, setup.duration, setup.duration + 10, setup.duration + 60]) {
    assert.equal(setup.rival(t).looking, 1, `still looking at ${t}`);
  }
  // the Spellblade does nothing with the opening: no swing, no spell after the bait; he turns and walks on
  assert.ok(setup.cues.filter((cue) => cue.at > SKY_BAIT.release).every((cue) => cue.type === 'remember'), 'nothing more done to him');
  for (let t = SKY_BAIT.release + 0.1; t <= setup.duration; t += 0.05) assert.ok(!/^Slash/.test(setup.hero(t).clip), `no blow at ${t.toFixed(2)}`);
  assert.ok(Math.sin(setup.hero(SKY_BAIT.leave[1]).heading) > 0.99, 'turned to the path');
  assert.ok(Math.abs(setup.hero(setup.duration).path - setup.exit) < 1e-9, 'and away down it');
  assert.ok(setup.duration > 4.5 && setup.duration < 5.6, `${setup.duration} s: not dragged out`);
});

test('7-9, 14. the rival remembers: one memory, set by the setup, kept through a round\'s reset, cleared by the payoff', () => {
  assert.deepEqual(setup.cues.filter((cue) => cue.type === 'remember').map((cue) => cue.at), [SKY_BAIT.remember]);
  assert.ok(SKY_BAIT.remember > SKY_BAIT.lookUp[0], 'once he has watched it go up');
  assert.match(director, /case 'remember':\s+this\.memory\.skyBait = index;/, 'one stop, one rival');
  assert.match(director, /case 'forget':\s+if \(this\.memory\.skyBait === index\) this\.memory\.skyBait = null;/);
  assert.deepEqual(payoff.cues.filter((cue) => cue.type === 'forget').map((cue) => cue.at), [P.impact], 'forgotten as he is paid off');
  // a round's reset puts him back as he was, and leaves what he remembers alone; a restart too; dispose forgets
  const reset = director.slice(director.indexOf('#resetRivals() {'), director.indexOf('/** Show or hide'));
  assert.doesNotMatch(reset, /memory/);
  const restart = director.slice(director.indexOf('restart() {'), director.indexOf('#resetRivals() {'));
  assert.doesNotMatch(restart, /memory/);
  assert.match(director, /dispose\(\) \{[^}]*?this\.memory\.skyBait = null;/);
  assert.match(director, /lineupFor\(round, undefined, \{ skyBaited: this\.memory\?\.skyBait \?\? null \}\)/);
  // no payoff without it, ever
  for (let round = 0; round < 60; round += 1) assert.ok(!lineupFor(round).includes('skyBaitPayoff'), `round ${round}`);
});

test('the pairing: the setup now and then; its payoff the next round at that same rival, and no new setup until then', () => {
  const setups = [];
  for (let round = 0; round < 30; round += 1) {
    const lineup = lineupFor(round);
    if (lineup.includes('skyBait')) setups.push([round, lineup.indexOf('skyBait')]);
    assert.ok(!(lineup.includes('skyBait') && lineup.includes('slush')), `round ${round}: one rarer fight at a time`);
  }
  assert.deepEqual(setups.map(([round]) => round), [1, 4, 7, 10, 13, 16, 19, 22, 25, 28]);
  assert.deepEqual(new Set(setups.map(([, slot]) => slot)), new Set([0, 1, 2]), 'at each stop in turn');
  for (const [round, slot] of setups) {
    // seen in this round: the next round pays it off, at that stop (whatever it would have had), and stages no setup
    const next = lineupFor(round + 1, undefined, { skyBaited: slot });
    assert.equal(next[slot], 'skyBaitPayoff');
    assert.equal(next.filter((name) => name === 'skyBaitPayoff').length, 1);
    assert.ok(!next.includes('skyBait'));
  }
  // remembered while a setup would come round: the payoff, not a second setup somewhere else
  const pending = lineupFor(4, undefined, { skyBaited: 0 });
  assert.equal(pending[0], 'skyBaitPayoff');
  assert.ok(!pending.includes('skyBait'));
  // left before he was paid off and back again (restart keeps it): the Slush still opens the visit, and he waits for
  // the round after, at his own stop
  const back = lineupFor(0, undefined, { skyBaited: 0 });
  assert.equal(back[0], 'slush');
  assert.ok(!back.includes('skyBaitPayoff') && !back.includes('skyBait'));
  assert.equal(lineupFor(1, undefined, { skyBaited: 0 })[0], 'skyBaitPayoff');
});

test('10-13. the payoff: found still looking up; eyes down only as it is thrown; his Guard comes up before the Fireball lands; it goes through, and he is flat', () => {
  const cast = payoff.cues.find((cue) => cue.type === 'cast');
  // still looking up from the last round, all the while the Spellblade comes back round, and as he is noticed
  for (const t of [-60, -5, 0, P.notice[0], P.notice[1], P.gather, cast.at - 0.01]) assert.equal(payoff.rival(t).looking, 1, `still up at ${t}`);
  assert.ok(P.notice[1] <= P.gather + 0.05, 'noticed doing it before the Spellblade begins anything');
  const up = payoff.rival(-5).rotations.find((turn) => turn.bone === 'head' && turn.axis[0] === 1);
  assert.ok(up.angle > 0.6, 'the same gaze as the round before, well up');
  // his eyes come down off the sky only once the Fireball is thrown
  assert.ok(P.looksDown[0] >= cast.at);
  assert.equal(payoff.rival(P.looksDown[1]).looking, 0);
  assert.ok(!cast.up && !cast.over, 'straight at him');
  assert.ok(cast.flight < 0.5 && cast.at - P.gather < 0.3, 'quick');
  assert.ok(cast.at + cast.flight <= P.impact + 1e-9);
  // his Guard: back up, fully, before it lands; his eyes down off the sky to raise it
  assert.equal(payoff.rival(P.impact - 0.05).clip, 'Guard');
  assert.equal(payoff.rival(P.impact - 0.05).guarding, 1);
  assert.equal(payoff.rival(P.impact - 0.05).looking, 0);
  assert.ok(P.guardUp[0] > cast.at, 'raised only once the Fireball is coming');
  // the Fireball lands as a Fireball: no block, no parry, no clash of any kind
  assert.deepEqual(types(payoff).filter((type) => ['clash', 'parry', 'block', 'hit'].includes(type)), []);
  assert.ok(types(payoff).includes('impact'));
  const impact = director.slice(director.indexOf("case 'impact': {"), director.indexOf("case 'freeze':"));
  assert.doesNotMatch(impact, /blockBurst|blockRecipe|parryRecipe/, 'nothing about the impact says Guard');
  // and he goes down flat, and stays down
  assert.equal(payoff.rival(P.impact + 0.01).clip, 'Death');
  for (const t of [P.impact + 1, payoff.duration, payoff.duration + 10]) {
    assert.equal(payoff.rival(t).clip, 'Death');
    assert.equal(payoff.rival(t).flat, true);
  }
  assert.ok(types(payoff).includes('fall'), 'his plate hitting the ground');
  // the Spellblade walks on without a look back; faster than the setup
  assert.ok(Math.abs(payoff.hero(payoff.duration).path - payoff.exit) < 1e-9);
  assert.ok(Math.sin(payoff.hero(P.walk[0] + 0.3).heading) > 0.99);
  assert.ok(payoff.duration < setup.duration && payoff.duration < 3.5);
});

test('15. leaving or disposing: nothing of it is left (the projectiles cleared, the rival put back); dispose forgets', () => {
  const reset = director.slice(director.indexOf('#resetRivals() {'), director.indexOf('/** Show or hide'));
  assert.match(reset, /this\.projectiles = \[\];\s+this\.effects\.syncProjectiles\(\[\]\);/);
  assert.match(reset, /rival\.instance\.root\.visible = true;/);
  assert.match(director, /dispose\(\) \{[^}]*?this\.#resetRivals\(\);/);
});

test('16-18. what was there stays: the classic Fireball, the Slush\'s rounds; both halves staged and filmed in clear view at every stop', () => {
  const [fireball] = FIGHTS;
  assert.equal(fireball.id, 'fireball');
  assert.equal(fireball.duration, 6.6);
  assert.deepEqual(types(fireball), ['swing', 'clash', 'swing', 'clash', 'swing', 'clash', 'gather', 'cast', 'impact', 'burn', 'voice']);
  assert.equal(lineupFor(0)[0], 'slush');
  for (let round = 0; round < 30; round += 3) assert.ok(lineupFor(round).includes('slush'), `round ${round}`);
  const path = buildTourPath();
  const blockers = castlewardBlockers();
  for (const name of ['skyBait', 'skyBaitPayoff']) {
    FIGHT_DISTANCES.forEach((distance, slot) => {
      const placed = placeFight(path, FIGHT_POOL[name]()[0], distance, blockers);
      assert.ok(placed, `${name} at stop ${slot + 1}`);
      assert.equal(blockedMoments(placed.fight, placed.frame, placed.swing, blockers), 0);
    });
  }
  // the camera looks up for the Fireball's going, a little, and only then
  assert.equal(setup.hero(1).up, 0);
  assert.equal(setup.hero(SKY_BAIT.release + 0.2).up, 1);
  assert.equal(setup.hero(SKY_BAIT.walk[0]).up, 0);
  const level = fightShot([0, 0], [2, 0], [0, 1]);
  const raised = fightShot([0, 0], [2, 0], [0, 1], { up: 1 });
  assert.deepEqual(raised.position, level.position, 'from where it was');
  assert.ok(raised.target[1] - level.target[1] > 0.5 && raised.target[1] - level.target[1] < 1.3, 'aimed a little higher');
});
