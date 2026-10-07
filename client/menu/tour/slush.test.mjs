import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIGHTS, FIGHT_POOL, SLUSH, SLUSH_VARIANTS, makeSlush } from './tourFights.mjs';
import { lineupFor, roundRandom } from './tourSchedule.mjs';
import { FIGHT_SHOT, fightShot } from './tourCamera.mjs';
import { VOICE_LINES } from '../../game/sound/voiceRules.mjs';
import { VOICE_TAGS, linesFor, voiceLine } from '../../game/sound/voiceLines.mjs';
import { VOICE_LIBRARY, captionPlan, libraryStatus } from '../../ui/voiceLibrary.mjs';

// The Slush, on the Spellblade's round (tourFights.mjs makeSlush): a brief exchange, a Frostfire that freezes his rival
// solid, a pause, an ordinary Fireball into the statue, which melts down into a heap of slush; a vessel from his belt,
// a scoop, the drink, and "Poor taste." Then back to the path. In that order, every time, whatever varies.

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../assets/voice/manifest.json', import.meta.url), 'utf8'));
const every = () => {
  const all = [];
  for (const vessel of SLUSH_VARIANTS.vessel) for (const opening of SLUSH_VARIANTS.opening) for (const drink of SLUSH_VARIANTS.drink) for (const finish of SLUSH_VARIANTS.finish) {
    all.push(makeSlush({ vessel, opening, drink, finish }));
  }
  return all;
};
const firstAt = (fight, test) => fight.cues.find(test)?.at;

test('the story in its order: exchange, Frostfire, frozen, a pause, Fireball, melt, slush, vessel, scoop, drink and verdict, put away', () => {
  for (const fight of every()) {
    const order = fight.cues.map((cue) => (cue.spell ? `${cue.type}:${cue.spell}` : cue.moment ? `${cue.type}:${cue.moment}` : cue.type))
      .filter((step) => !['swing', 'clash'].includes(step));
    const expected = ['gather:frostfire', 'cast:frostfire', 'impact:frostfire', 'freeze', 'gather:fireball', 'cast:fireball', 'impact:fireball', 'melt', 'slush',
      'vessel', 'scoop', 'voice:slushEnd', ...(fight.variant.finish === 'dregs' ? ['dregs'] : []), 'stow'];
    assert.deepEqual(order, expected, fight.key);
    // a real exchange first: two blows, each met
    assert.equal(fight.cues.filter((cue) => cue.type === 'swing').length, 2, fight.key);
    assert.equal(fight.cues.filter((cue) => cue.type === 'clash').length, 2, fight.key);
    assert.ok(firstAt(fight, (cue) => cue.type === 'clash') < firstAt(fight, (cue) => cue.spell === 'frostfire'), `${fight.key}: the exchange before the Frostfire`);
    // the cues in time order, inside the fight
    const times = fight.cues.map((cue) => cue.at);
    assert.deepEqual(times, [...times].sort((a, b) => a - b), fight.key);
    assert.ok(times.every((at) => at >= 0 && at <= fight.duration), fight.key);
  }
});

test('no Fireball until he is frozen solid and has been regarded a moment; the Fireball is an ordinary one', () => {
  for (const fight of every()) {
    const fireball = firstAt(fight, (cue) => cue.spell === 'fireball');
    assert.ok(fireball >= SLUSH.frozenBy + 0.35 && fireball <= SLUSH.frozenBy + 0.85, `${fight.key}: a pause of ${(fireball - SLUSH.frozenBy).toFixed(2)} s`);
    assert.equal(fight.rival(fireball).frozen, 1, 'frozen solid by then');
    assert.equal(fight.rival(fireball).melt, 0, 'and not yet going soft');
    // frozen stiff: from the moment he is solid until the Fireball, he does not move at all
    const held = fight.rival(SLUSH.frozenBy);
    for (let t = SLUSH.frozenBy; t < SLUSH.fireballAt; t += 0.1) {
      const now = fight.rival(t);
      assert.deepEqual([now.u, now.clip, now.time, now.heading], [held.u, held.clip, held.time, held.heading], `${fight.key}: moved at ${t.toFixed(1)}`);
    }
    // the same Fireball as any: a short gather, the game's own spell, the impact of no ultimate's size
    const impact = fight.cues.find((cue) => cue.type === 'impact' && cue.spell === 'fireball');
    assert.ok(impact.radius <= 1.5);
    assert.ok(fight.cues.find((cue) => cue.type === 'gather' && cue.spell === 'fireball').release <= 0.3);
  }
});

test('he melts down into slush that stays to be scooped: no death, no corpse, a heap where he stood', () => {
  for (const fight of every()) {
    assert.equal(fight.rival(SLUSH.melt[0] - 0.01).melt, 0);
    assert.ok(fight.rival(SLUSH.melt[0] + 0.5).melt > 0.3 && fight.rival(SLUSH.melt[0] + 0.5).melt < 0.7, 'gives way over a moment');
    assert.equal(fight.rival(SLUSH.melt[1]).melt, 1);
    // the heap is begun as he comes down, and he is gone (his place kept for the camera) only once he is all slush
    const heap = firstAt(fight, (cue) => cue.type === 'slush');
    assert.ok(heap > SLUSH.melt[0] && heap < SLUSH.melt[1]);
    assert.ok(SLUSH.goneAt >= SLUSH.melt[1]);
    const gone = fight.rival(SLUSH.goneAt + 0.01);
    assert.deepEqual([gone.gone, gone.u], [true, SLUSH.meet], 'the heap is where he stood');
    for (let t = -1; t < fight.duration; t += 0.05) assert.notEqual(fight.rival(t).clip, 'Death', `${fight.key}: never a death at ${t.toFixed(2)}`);
    // and the heap is scooped from where he can reach it (just ahead of him, no long bend), after it has formed
    const scoop = firstAt(fight, (cue) => cue.type === 'scoop');
    assert.ok(scoop > SLUSH.melt[1]);
    assert.ok(Math.abs(fight.hero(scoop).u - SLUSH.scoopFrom) < 1e-6);
    assert.ok(SLUSH.meet - SLUSH.scoopFrom > 0.6 && SLUSH.meet - SLUSH.scoopFrom < 1.0);
    assert.ok(fight.hero(scoop).crouch > 0.6, 'down to it');
    assert.ok(fight.hero(scoop).spell.target.wrist[1] < 0.35, 'the vessel down in the heap');
  }
});

test('the vessel: out of his belt as he hurries over, filled at the scoop, at his visor as he drinks, then put away', () => {
  for (const fight of every()) {
    const out = firstAt(fight, (cue) => cue.type === 'vessel');
    const scoop = firstAt(fight, (cue) => cue.type === 'scoop');
    const stow = firstAt(fight, (cue) => cue.type === 'stow');
    assert.equal(fight.hero(out - 0.05).vessel.shown, false);
    assert.equal(fight.hero(out + 0.05).vessel.shown, true);
    assert.equal(fight.hero(out + 0.05).vessel.kind, fight.variant.vessel);
    // produced at his hip (his spell hand there), not out of the air in front of him
    const hip = fight.hero(out).spell.target.wrist;
    assert.ok(hip[1] < 1.1 && hip[0] < -0.2, 'at his side');
    // he hurries over: the quickest he moves all fight
    const speed = (a, b) => Math.abs(fight.hero(b).u - fight.hero(a).u) / (b - a);
    assert.ok(speed(6.1, 6.4) > speed(1.95, 2.35), 'faster than any step of the fight');
    assert.ok(fight.hero(scoop - 0.1).vessel.fill < 0.05, 'empty before');
    assert.ok(fight.hero(scoop + 0.15).vessel.fill > 0.9, 'full after');
    assert.ok(fight.hero(scoop - 0.05).vessel.tilt < -0.8, 'dipped in, rim first');
    // the drink: at his visor, tipped back to him, his head back, as the take's slurp runs
    const sip = SLUSH.drinkAt + 0.8;
    assert.ok(fight.hero(sip).spell.target.wrist[1] > 1.4, 'up at his visor');
    assert.ok(fight.hero(sip).vessel.tilt > 1, 'tipped back to him');
    assert.ok(fight.hero(sip).rotations.some((turn) => turn.bone === 'head' && turn.axis[0] === 1 && turn.angle > 0.1), 'his head back');
    const deep = fight.variant.drink === 'quaff';
    const left = fight.hero(SLUSH.drinkAt + SLUSH.take.slurp[1] + 0.4).vessel.fill;
    assert.ok(deep ? left < 0.2 : left > 0.3 && left < 0.6, `${fight.key}: ${left.toFixed(2)} left`);
    // put away: gone at his belt, before he walks back
    assert.equal(fight.hero(stow + 0.1).vessel.shown, false);
    assert.ok(stow > SLUSH.drinkAt + SLUSH.take.words[1], 'after the verdict');
    if (fight.variant.finish === 'dregs') {
      const dregs = firstAt(fight, (cue) => cue.type === 'dregs');
      assert.ok(fight.hero(dregs).vessel.tilt < -1.5, 'tipped out');
      assert.ok(fight.hero(dregs + 0.2).vessel.fill < 0.05, 'and empty');
    }
  }
});

test('"Poor taste." belongs to this and nothing else: live, raised only as he drinks, and never written out before it is said', () => {
  const line = voiceLine('poorTaste');
  assert.equal(line.coming, null, 'no longer waiting');
  assert.ok(VOICE_LINES.poorTaste, 'it can be said');
  assert.ok(!VOICE_TAGS.slushEnd.future);
  assert.deepEqual(linesFor('tour-spellblade', ['slushEnd']).map((say) => say.line), ['poorTaste']);
  assert.equal(line.rarity, 1, 'the vignette is rare; its verdict is not');
  assert.equal(libraryStatus(VOICE_LIBRARY.find((entry) => entry.line === 'poorTaste'), true), 'live');
  const entry = VOICE_LIBRARY.find((e) => e.line === 'poorTaste');
  assert.deepEqual([entry.title, entry.words, entry.when, entry.note], ['Poor Taste', 'Poor taste.', 'At the end of the frozen-enemy slush sequence.', 'The review was unsolicited.']);
  // raised by the Slush alone, at the drink (the take is the drinking), once the slush is in the vessel
  const raisers = ['../../game/GameRuntime.mjs', '../../game/sound/voiceMoments.mjs', '../../game/sound/voiceWatch.mjs', '../../game/sound/voiceScenes.mjs', '../../main.mjs', './TourDirector.mjs']
    .filter((path) => /slushEnd/.test(source(path)));
  assert.deepEqual(raisers, [], 'nothing in the arena raises it, nor the director by itself');
  for (const fight of [...FIGHTS, ...every()]) {
    const voiced = fight.cues.filter((cue) => cue.moment === 'slushEnd' || cue.line === 'poorTaste');
    if (fight.id !== 'slush') { assert.equal(voiced.length, 0, fight.id); continue; }
    assert.equal(voiced.length, 1);
    assert.equal(voiced[0].at, SLUSH.drinkAt);
    assert.equal(voiced[0].chance, 1);
    assert.ok(voiced[0].at > firstAt(fight, (cue) => cue.type === 'scoop'), 'after the scoop');
    assert.ok(fight.hero(voiced[0].at).vessel.fill > 0.9, 'with the slush in the vessel');
  }
  // its words come 4.4 s into the take (after the slurp, the smacks and the "Ahhh"), and are written out only then
  const take = manifest.lines.poorTaste[0];
  assert.equal(take.beats.length, 2);
  const plan = captionPlan('poorTaste', { beats: take.beats });
  assert.equal(plan.text, 'Poor taste.');
  assert.ok(Math.abs(plan.after - SLUSH.take.words[0]) < 0.12, `shown at ${plan.after} s`);
  assert.deepEqual(plan.cues, []);
  assert.equal(captionPlan('poorTaste', { beats: null }), null, 'never shown at once, during the drink, for want of its timing');
  // the menu writes it out (Settings, Audio, Subtitles), and stops when he is cut short
  const scene = source('../MenuScene.mjs');
  assert.match(scene, /this\.tour\.onCaption = \(\{ line, delay, seconds, beats \}\) => \{\s+const plan = captionPlan\(line, \{ beats \}\);/);
  assert.match(scene, /this\.tour\.onCaptionCut = \(\) => this\.caption\.cut\(\);/);
  assert.match(source('../../main.mjs'), /menuScene\?\.setSubtitles\(view\.subtitles\);/);
});

test('everything the Slush leaves is undone: between rounds, on leaving the front door, and when the menu goes', () => {
  const director = source('./TourDirector.mjs');
  const reset = director.slice(director.indexOf('#resetRivals() {'), director.indexOf('/** Show or hide'));
  for (const undo of ['this.vessel?.dispose();', 'rival.crust?.dispose();', 'rival.pile?.dispose();', 'rival.holder.scale.set(1, 1, 1);', 'this.effects.afflict(`tour-frost-${index}`, null);', 'rival.dress.restore();']) {
    assert.ok(reset.includes(undo), `a new round undoes: ${undo}`);
  }
  const hide = director.slice(director.indexOf('setVisible(visible) {'), director.indexOf('/** A reaction on the front door'));
  assert.match(hide, /if \(rival\.pile\) rival\.pile\.group\.visible = visible;/);
  assert.match(hide, /if \(this\.vessel\) this\.vessel\.group\.visible = visible;/);
  assert.match(hide, /this\.voice\?\.cut\?\.\('tour-spellblade'\);\s+this\.onCaptionCut\?\.\(\);/, 'what he was saying stops, and its caption');
  // starting over, and going: from a clean state
  assert.match(director, /restart\(\) \{[\s\S]*?this\.#stageRound\(0\);\s+this\.#resetRivals\(\);/);
  assert.match(director, /dispose\(\) \{\s+this\.#resetRivals\(\);/);
  // (and the first round, the one a fresh visit begins with, has no Slush in it)
  assert.ok(!lineupFor(0).includes('slush'));
});

test('the ice is the rival\'s own: his cloned materials, his own crystals, the heap\'s and the vessel\'s own, all disposed', () => {
  const props = source('./tourProps.mjs');
  // frost works on the rival's dress (materials cloned for him alone: dressRival), never on a shared one
  const dress = props.slice(props.indexOf('export function dressRival'), props.indexOf('// a skinned mesh\'s triangles'));
  assert.match(dress, /const copy = material\.clone\(\);/);
  const frost = dress.slice(dress.indexOf('frost(amount'), dress.indexOf('restore() {'));
  assert.match(frost, /for \(const \[material, original\] of base\)/, 'it touches only his clones');
  assert.doesNotMatch(frost, /instance\.root\.traverse|object\.material/, 'never anyone else\'s materials');
  assert.match(dress, /restore\(\) \{[\s\S]*?material\.roughness = original\.roughness;[\s\S]*?material\.metalness = original\.metalness;/, 'and puts back what it changed');
  for (const maker of ['export function iceCrust', 'export function slushPile', 'export function vesselProp']) {
    const body = props.slice(props.indexOf(maker));
    const end = body.indexOf('\nexport ', 10);
    const own = end > 0 ? body.slice(0, end) : body;
    assert.match(own, /dispose\(\) \{/, `${maker}: can be taken away`);
    assert.match(own, /\.dispose\(\);/, `${maker}: disposes what it made`);
  }
  // the gameplay spells are untouched by any of it: the round only shows them
  for (const path of ['./tourFights.mjs', './TourDirector.mjs', './tourProps.mjs']) assert.doesNotMatch(source(path), /shared\/sim\//, path);
});

test('what varies: the vessel, the opening, how deep he drinks, the dregs; every version back on the path at the end', () => {
  // (each round's own dice, as the director rolls them)
  const keys = new Set(Array.from({ length: 64 }, (_, round) => FIGHT_POOL.slush(roundRandom(round))[0].key));
  assert.ok(keys.size >= 10, `${keys.size} versions come up`);
  for (const fight of every()) {
    const start = fight.hero(0);
    const end = fight.hero(fight.duration);
    assert.ok(Math.abs(start.u) < 1e-6 && Math.abs(end.u) < 1e-6 && Math.abs(end.v) < 1e-6, `${fight.key}: on the path`);
    assert.ok(Math.abs(Math.cos(end.heading)) < 1e-6 && Math.sin(end.heading) > 0.99, `${fight.key}: facing along it`);
    assert.ok(fight.duration > 13.5 && fight.duration < 15.5, `${fight.key}: ${fight.duration.toFixed(2)} s`);
    // the rival waits at his place until the Spellblade comes, then comes on at him
    assert.equal(fight.rival(-30).clip, 'Idle');
    assert.equal(fight.rival(-30).u, fight.reach);
    assert.ok(fight.rival(1.2).u < fight.reach - 1);
  }
  const opening = (name) => makeSlush({ opening: name }).cues.find((cue) => cue.type === 'swing').by;
  assert.equal(opening('charge'), 'rival', 'he comes at the Spellblade');
  assert.equal(opening('press'), 'hero', 'the Spellblade goes at him');
});

test('the camera comes closer for the scoop and the drink, and only then; elsewhere it is as it was', () => {
  const fight = makeSlush();
  assert.equal(fight.hero(3).near, 0, 'the fight and the spells framed as any fight');
  assert.equal(fight.hero(SLUSH.drinkAt + 2).near, 1, 'in for the drink');
  assert.equal(fight.hero(fight.duration).near, 0, 'back out as he goes');
  for (const other of FIGHTS) for (let t = 0; t < other.duration; t += 0.5) assert.equal(other.hero(t).near ?? 0, 0, other.id);
  // a shot without `near` is the shot it always was; with it, closer and aimed a little higher
  assert.deepEqual(fightShot([0, 0], [2, 0], [0, 1], { near: 0 }), fightShot([0, 0], [2, 0], [0, 1]));
  const far = fightShot([0, 0], [1, 0], [0, 1]);
  const close = fightShot([0, 0], [1, 0], [0, 1], { near: 1 });
  const back = (shot) => Math.hypot(shot.target[0] - shot.position[0], shot.target[2] - shot.position[2]);
  assert.ok(back(close) < back(far) - 1 && back(close) >= FIGHT_SHOT.nearBack - 1e-6);
  assert.ok(close.target[1] > far.target[1]);
});

test('its sounds: ice closing (cracks quickening to a ting), fire on ice (a hiss), the slump, the scoop, the vessel, the dregs', async () => {
  const sound = await import('../../game/sound/soundRecipes.mjs');
  let seed = 5;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const at = (layer) => layer.at ?? 0;
  const length = (recipe) => Math.max(...recipe.layers.map((layer) => at(layer) + (layer.attack ?? 0) + (layer.decay ?? Math.max(...(layer.partials ?? [{ decay: 0 }]).map((p) => p.decay)))));
  const freeze = sound.freezeRecipe(rand, { seconds: 0.45 });
  const cracks = freeze.layers.filter((layer) => layer.type === 'noise' && layer.filter === 'highpass').map(at);
  assert.ok(cracks.length >= 8);
  const gaps = cracks.slice(1).map((t, i) => t - cracks[i]);
  assert.ok(gaps.slice(-3).reduce((a, b) => a + b) < gaps.slice(0, 3).reduce((a, b) => a + b), 'the cracks come faster as the ice closes');
  assert.ok(freeze.layers.some((layer) => layer.type === 'ring' && Math.abs(at(layer) - 0.45) < 1e-9), 'and it sets with a ting');
  const hiss = sound.meltHissRecipe(rand, { seconds: 1 });
  assert.ok(hiss.layers.some((layer) => layer.type === 'noise' && layer.filter === 'highpass' && layer.decay >= 0.9), 'the steam hisses on while he melts');
  const slump = sound.slushCollapseRecipe(rand);
  assert.ok(slump.layers.some((layer) => layer.type === 'noise' && layer.filter === 'lowpass' && layer.freq < 500), 'a soft wet slump');
  // a pewter tankard rings where a little wooden pail knocks
  assert.ok(sound.scoopRecipe(rand, { kind: 'cup' }).layers.some((layer) => layer.type === 'ring'));
  assert.ok(!sound.scoopRecipe(rand, { kind: 'pail' }).layers.some((layer) => layer.type === 'ring'));
  assert.ok(sound.vesselRecipe(rand, { kind: 'cup' }).layers.some((layer) => layer.type === 'ring' && layer.partials[0].freq > 1500));
  assert.ok(sound.vesselRecipe(rand, { kind: 'pail' }).layers.some((layer) => layer.type === 'tone' && layer.freq < 300));
  // all short and small: the voice is what is listened to (none rings on more than a second and a bit)
  for (const recipe of [freeze, hiss, slump, sound.scoopRecipe(rand), sound.vesselRecipe(rand), sound.splashRecipe(rand)]) assert.ok(length(recipe) < 1.3, `${length(recipe).toFixed(2)} s`);
});
