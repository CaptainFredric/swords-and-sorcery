import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REACTIONS } from '../../game/spellbladeMotion.mjs';
import { FIGHT_POOL, GALE_LIFTOFF, galeLift, galeTurns, galeWind, makeGaleLiftoff } from './tourFights.mjs';
import { HERO, castIsSound, changeHands, createCast, handOver } from './tourCast.mjs';
import { RARE_FIGHTS, lineupFor } from './tourSchedule.mjs';

// The Gale Lift-Off Handover, and the round changing hands after it: the script's beats in order, the parries the
// game's own, the spin slow then fast, the lift-off and the flight out of the picture, the stare; the handover seamless;
// and all of it visual only: the player's own knight is never at a stop, never dressed, burned, frozen, drunk or broken,
// and is himself again the moment the front door is left.

const G = GALE_LIFTOFF;
const fight = makeGaleLiftoff();
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const director = source('./TourDirector.mjs');
const scene = source('../MenuScene.mjs');
const cues = (type) => fight.cues.filter((cue) => cue.type === type).map((cue) => cue.at);

test('the beats in order: two blows parried, the spin, the lift-off, the flight, the stare, the handover, the walk on', () => {
  const beats = [G.blows[0].parry, G.blows[1].parry, G.spin[0], G.liftoff, G.fly[0], G.lookUp[1], G.fly[1], G.handover, G.walk[0], fight.duration];
  beats.forEach((beat, i) => i && assert.ok(beat > beats[i - 1], `beat ${i} after beat ${i - 1}`));
  assert.ok(G.handover - G.fly[1] >= 2, 'he stares up after him for a couple of seconds once he is gone');
  assert.equal(FIGHT_POOL.galeLiftoff()[0].id, 'galeLiftoff');
});

test('the parries are the game\'s: his sword hand deflected as a parry deflects it, and the parry\'s burst and ring', () => {
  assert.deepEqual(cues('parry'), G.blows.map((blow) => blow.parry));
  assert.deepEqual(cues('swing'), G.blows.map((blow) => blow.swing));
  for (const blow of G.blows) {
    const swept = fight.hero(blow.parry + REACTIONS.parry.rise).rotations.find((turn) => turn.bone === 'hand.R');
    assert.ok(swept && Math.abs(swept.angle) > REACTIONS.parry.sweep * 0.8, 'the sword hand sweeps out');
    assert.equal(fight.rival(blow.parry - 0.2).clip, blow.clip, 'into a real blow');
  }
  assert.match(director, /case 'parry': \{[\s\S]*?this\.effects\.blockBurst\(point, .*\{ parry: true \}\);\s+this\.#play\(parryRecipe\(\), point/);
});

test('the spin: from standing, slowly, then faster, and faster still in the air; the wind with it', () => {
  assert.equal(galeTurns(G.spin[0]), 0);
  const rate = (t) => (galeTurns(t + 0.05) - galeTurns(t - 0.05)) / 0.1;
  assert.ok(rate(G.spin[0] + 0.5) < 0.2, 'slowly at first');
  assert.ok(rate(G.liftoff - 0.1) > 3, 'fast by the time he leaves the ground');
  assert.ok(rate(G.fly[0]) > rate(G.liftoff), 'faster still up there');
  for (let t = G.spin[0]; t < G.fly[1]; t += 0.1) assert.ok(rate(t + 0.1) >= rate(t) - 1e-9, `never slowing (${t.toFixed(1)})`);
  assert.equal(galeWind(G.gather - 0.01), 0);
  assert.equal(galeWind(G.liftoff), 1);
  assert.equal(galeWind(G.handover), 0, 'gone with him');
  // the Gale's own air and the Whirlwind's arms: the funnel is made of the Gale's wind (galeVolume.mjs)
  assert.match(source('./tourProps.mjs'), /export function galeFunnel[\s\S]*windConeGeometry\(spread\)[\s\S]*createWindRibbonMaterial\(\)/);
  assert.match(director, /this\.funnel \?\?= galeFunnel\(this\.scene\);/);
  assert.match(director, /this\.effects\.galeGather\(/);
});

test('the rival gives ground into the wind, his cape thrown about by it, and is shoved as he lifts off', () => {
  assert.equal(fight.rival(G.retreat[0]).u, G.reach);
  assert.ok(fight.rival(G.retreat[1]).u > G.reach + 1, 'backs away');
  assert.equal(fight.rival(G.retreat[0] + 0.5).rate, -0.3, 'stepping backwards (his gait run backwards)');
  assert.ok(fight.rival(G.liftoff + 0.6).u > fight.rival(G.liftoff).u, 'shoved by the blast');
  // the cape: gusted from the knight in the wind's middle, as the game gusts a cape in a Gale (cloth.gust)
  assert.match(director, /rival\.instance\.animator\.cloth\?\.gust\(this\.#windAt\(rival\.holder, feet, GALE_GUST \* wind \* gusting\)\)/);
});

test('he lifts off, hangs a moment, and goes straight up and out of the picture; then nothing of him is drawn', () => {
  assert.equal(galeLift(G.liftoff), 0);
  assert.ok(Math.abs(galeLift(G.fly[0]) - G.hoverAt) < 0.1, 'hanging there');
  assert.ok(galeLift(G.fly[1]) > 25, 'gone up out of the picture');
  assert.ok(fight.hero(G.fly[1] + 0.3).away && !fight.hero(G.fly[1] - 0.3).away);
  assert.match(director, /if \(this\.cast\.traveller === HERO\) this\.#showHero\(this\.visible && !away\);\s+else root\.visible = this\.visible && !away;/);
  // (hidden without a stall: his lights stood in for, so no shader is rebuilt the moment he goes)
  assert.match(director, /stand\.intensity = 0;/);
  // and the one left standing stares up after him
  assert.ok(fight.rival(G.lookUp[1] + 0.1).looking === 1);
  assert.ok(fight.rival(G.handover - 0.01).looking === 1, 'still staring at the handover');
});

test('the handover is seamless: the one taking over the round stands, poses and plays exactly as the rival did', () => {
  const before = fight.rival(G.handover - 1e-6);
  const after = fight.hero(G.handover);
  assert.equal(after.clip, before.clip);
  assert.ok(Math.abs(after.time - before.time) < 1e-3, 'the same clip time');
  assert.ok(Math.abs(after.off - before.u) < 1e-9 && after.path === 0, 'the same spot');
  assert.ok(fight.rival(G.handover).gone, 'and the rival\'s half is done');
  assert.deepEqual(cues('handover'), [G.handover]);
  // walking on, back to the path and down it
  const end = fight.hero(fight.duration);
  assert.ok(end.off < 1e-6 && Math.abs(end.path - fight.exit) < 1e-6);
});

test('the round changing hands never puts the player\'s knight at a stop, and every rival is somewhere exactly once', () => {
  let cast = createCast(4, 3);
  assert.equal(cast.traveller, HERO);
  assert.ok(castIsSound(cast));
  const random = (() => { let s = 7; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();
  for (let step = 0; step < 400; step += 1) {
    cast = random() < 0.5 ? handOver(cast, Math.floor(random() * 3)) : changeHands(cast, random);
    assert.ok(castIsSound(cast), `step ${step}: ${JSON.stringify(cast)}`);
    assert.ok(!cast.posted.includes(HERO) && !cast.spare.includes(HERO), 'never at a stop, never spare');
  }
  // the lift-off hands it to the rival at that stop; a change of map hands it back
  const first = handOver(createCast(4, 3), 1);
  assert.equal(first.traveller, 1);
  assert.equal(changeHands(first).traveller, HERO);
});

test('visual only: nothing the round does reaches the player\'s knight beyond posing, showing and hiding him', () => {
  // the destructive things are done only to a rival record (this.rivals[...]), never to this.hero
  for (const call of ['dressRival(', 'shatterKnight(', 'cutSword(', 'iceCrust(', 'whiteFlag(', '.dress.', 'mendSword(']) {
    for (const line of director.split('\n').filter((text) => text.includes(call))) assert.doesNotMatch(line, /this\.hero\b/, line.trim());
  }
  // no loadout, cloth, emblem, settings or storage touched by the round or its maps (in code: comments aside)
  const code = (text) => text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line)).join('\n');
  for (const text of [director, source('./tourCast.mjs'), source('./tourMaps.mjs'), source('./tourWorlds.mjs')]) {
    assert.doesNotMatch(code(text), /setCloth|setEmblem|localStorage|__ssSettings|settings\.|loadout|armory/i);
  }
  // the hero is only hidden while a rival has the round, and shown again when the cast is reset (leaving, a restart)
  assert.match(director, /this\.#showHero\(cast\.traveller === HERO\);/);
  const hide = director.slice(director.indexOf('setVisible(visible) {'), director.indexOf('/** A reaction on the front door'));
  assert.match(hide, /if \(!visible\) \{\s+this\.#applyCast\(createCast\(RIVAL_DRESS\.length, 3\)\);/, 'leaving: his again');
  // and the menu, leaving the front door: back on his stage, in Castleward, shown, his pose reset
  const stop = scene.slice(scene.indexOf('#stopTouring() {'), scene.indexOf('#measureBanner() {'));
  for (const step of ['this.stage.add(this.characterRoot);', 'this.tour.setVisible(false);', "this.tourWorlds.show('castleward');", 'this.characterRoot.visible = true;', 'this.assetInstance?.animator?.reset?.();']) {
    assert.ok(stop.includes(step), step);
  }
});

test('the handover comes round: a couple of rounds into a visit, then every sixth, never displacing what it should not', () => {
  assert.deepEqual(RARE_FIGHTS.galeLiftoff, { every: 6, from: 2, slot: 1, yields: true });
  const rounds = Array.from({ length: 30 }, (_, round) => round).filter((round) => lineupFor(round).includes('galeLiftoff'));
  assert.deepEqual(rounds, [2, 8, 14, 20, 26]);
  for (const round of rounds) assert.ok(!lineupFor(round).includes('slush') && !lineupFor(round).includes('skyBait'));
  // a payoff owed at its stop: it steps aside, both happen
  for (const slot of [0, 1, 2]) {
    const lineup = lineupFor(2, undefined, { skyBaited: slot });
    assert.equal(lineup[slot], 'skyBaitPayoff');
    assert.ok(lineup.includes('galeLiftoff'), `owed at stop ${slot + 1}: both`);
  }
  // his lines are his: said only while the round is his
  assert.match(director, /if \(this\.voice && traveller\.kind === HERO && Math\.random\(\) < cue\.chance\)/);
});
