import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession, THREAT_HALT_SEC, HEALTH_SETTLED_SEC } from './TutorialSession.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { applyDamage } from '../../shared/sim/combat.mjs';
import { GAME, HEALTH_REGEN, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';

// The Greener Pastures authored pass: each scene's behaviour, through the ordinary local simulator.
function fixture() {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => .25 }); session.start();
  const events = [];
  host.on('events', batch => events.push(...batch.events));
  const tick = (n = 1) => { for (let i = 0; i < n; i += 1) { now += 1 / 30; host.tick(); } };
  return { host, session, tick, events, now: () => now, rival: () => host.room.players.get(session.rivalId) };
}
const facing = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
// stand the Spellblade `gap` metres in front of Rival, facing him
function faceOff({ host, rival }, gap = 1.7) {
  const r = rival().position;
  host.player.position = { x: r.x, y: 0, z: r.z + gap };
  host.player.velocity = { x: 0, y: 0, z: 0 };
  const yaw = facing(host.player.position, r);
  host.player.yaw = yaw; rival().yaw = facing(r, host.player.position);
  host.input({ forward: 0, right: 0, yaw, pitch: 0, sprint: false });
  return yaw;
}

test('health regeneration settles only after a second back at full, and a new hit starts it over', () => {
  const t = fixture();
  const { host, session, tick, now } = t;
  session.stage('health-regen'); session.director.resumeAt('health-regen-prompt');
  applyDamage(host.room, session.rivalId, host.player.id, 30, 'sword', now()); tick();
  assert.equal(session.director.current.id, 'health-regen-prompt');
  // through the delay and the regeneration the prompt stays
  tick(Math.round(30 * (HEALTH_REGEN.delaySec + 1)));
  assert.equal(session.director.current.id, 'health-regen-prompt');
  // a fresh hit before it settles: the delay starts again, the prompt stays on
  applyDamage(host.room, session.rivalId, host.player.id, 10, 'sword', now()); tick();
  tick(Math.round(30 * (HEALTH_REGEN.delaySec - .5)));
  assert.equal(session.director.current.id, 'health-regen-prompt');
  let full = null;
  for (let i = 0; i < 30 * 6 && session.director.current.id === 'health-regen-prompt'; i += 1) {
    tick(); if (host.player.health >= 100 && full === null) full = now();
  }
  assert.ok(full !== null);
  assert.notEqual(session.director.current.id, 'health-regen-prompt');
  assert.ok(now() - full >= HEALTH_SETTLED_SEC - 1e-6, `settled ${(now() - full).toFixed(2)} s after full health`);
  host.close();
});

test('a premature strike is turned away by a real Parry: no damage, no progress, the attacker reels', () => {
  const t = fixture();
  const { host, session, tick, events, rival } = t;
  session.stage('duel-terms'); session.director.resumeAt('come-prove-it'); tick(3);
  assert.equal(session.rival.mode, 'ready');
  faceOff(t); tick();
  const health = rival().health, prowess = host.player.prowess ?? 0;
  host.attack(true); host.attack(false);
  tick(Math.round(30 * (SWORD_STRIKE_TIMES[0] + .3)));
  const parry = events.find(e => e.type === 'parry' && e.defenderId === session.rivalId && e.attackerId === host.player.id);
  assert.ok(parry, JSON.stringify(events.filter(e => ['block', 'parry', 'swordHit', 'damage'].includes(e.type))));
  assert.equal(events.some(e => e.type === 'damage' && e.victimId === session.rivalId), false);
  assert.equal(rival().health, health);
  assert.equal(host.player.prowess ?? 0, prowess);
  assert.ok(host.player.staggerUntil > parry.at, 'the ordinary parry reel');
  assert.equal(host.player.attackActive, false, 'the chain stopped as any parried chain does');
  assert.equal(session.director.current.id, 'come-prove-it', 'no progress from it');
  // his Guard was raised once for it, and lowered again after
  assert.equal(events.filter(e => e.type === 'guardStarted' && e.playerId === session.rivalId).length, 1);
  tick(30); assert.equal(rival().guarding, false);
  host.close();
});

test('the Guard lesson keeps the real rule: raised just before contact it parries, held from long before it blocks', () => {
  for (const [early, expected] of [[.1, 'parry'], [1.2, 'block']]) {
    const t = fixture();
    const { host, session, tick, events, rival, now } = t;
    session.stage('first-guard'); session.director.resumeAt('guard-attack-start');
    host.player.spawnProtectionUntil = 0;
    faceOff(t, 1.9); tick();
    for (let i = 0; i < 90 && !rival().attackActive; i += 1) tick();
    assert.ok(rival().attackActive);
    const contact = rival().attackStartedAt + SWORD_STRIKE_TIMES[0];
    while (now() < contact - early - 1e-6) tick();
    host.guard(true);
    const raisedAt = now();
    tick(Math.round(30 * (early + .4)));
    const answer = events.find(e => ['block', 'parry'].includes(e.type) && e.defenderId === host.player.id);
    assert.equal(answer?.type, expected, `Guard raised ${early} s before contact`);
    assert.equal(host.player.guardStartedAt, raisedAt, 'the raise is stamped once, not refreshed while held');
    assert.ok(GAME.parryWindowMs === 180);
    host.close();
  }
});

test('the false exit walks the Spellblade toward the gate; the threat stops him dead, eyes free, then lets him go', () => {
  const t = fixture();
  const { host, session, tick, now } = t;
  session.stage('escape-head-start'); session.director.resumeAt('leave-prompt'); tick();
  const exit = GREENER_ROUTE.exit;
  assert.equal(session.director.progress.segment.objective.text, 'LEAVE GREENER PASTURES');
  host.player.position = { x: exit.x + 30, y: 0, z: exit.z };
  const west = facing(host.player.position, exit);
  host.input({ forward: 1, right: 0, yaw: west, pitch: 0, sprint: false });
  for (let i = 0; i < 30 * 3 && session.director.current.id === 'leave-prompt'; i += 1) tick();
  assert.notEqual(session.director.current.id, 'leave-prompt', 'setting out for the gate starts the walk lines');
  while (session.director.current?.segment === 'false-exit') { session.director.completeDialogue(session.director.cue); tick(); }
  // within sixteen metres of the gate: the threat, and the halt at its first word
  assert.equal(session.director.current.id, 'escape-made-fun');
  assert.ok(session.director.facts.has('player-halted'));
  assert.equal(session.allows('move', false), false);
  assert.equal(session.allows('look', false), true);
  const held = { ...host.player.position };
  host.input({ forward: 1, right: 0, yaw: west + .6, pitch: 0, sprint: true }); tick(Math.round(30 * THREAT_HALT_SEC) - 3);
  assert.ok(Math.hypot(host.player.position.x - held.x, host.player.position.z - held.z) < .35, 'stopped dead');
  assert.ok(Math.abs(host.player.yaw - (west + .6)) < 1e-6, 'look stays free');
  // the taught controls do not vanish for the moment (the touch layout never flickers)
  assert.ok(session.taught.includes('move') && session.taught.includes('sprint'));
  tick(10);
  assert.equal(session.allows('move', false), true);
  host.input({ forward: 1, right: 0, yaw: west, pitch: 0, sprint: false }); tick(15);
  assert.ok(Math.hypot(host.player.position.x - held.x, host.player.position.z - held.z) > 1);
  void now;
  host.close();
});

test('Jump is the Spellblade\'s from the moment Rival really jumps the stile', () => {
  const t = fixture();
  const { host, session, tick, rival } = t;
  session.stage('jump-obstacle'); session.director.resumeAt('jump-arrival');
  const jump = GREENER_ROUTE.jump;
  const approach = GREENER_ROUTE.waypointById['jump-approach'];
  rival().position = { x: approach.x, y: 0, z: approach.z };
  session.rival.waypoint = GREENER_ROUTE.chaseWaypoints.findIndex(point => point.id === 'jump-approach');
  host.player.position = { x: approach.x, y: 0, z: approach.z + 60 };
  assert.equal(session.allows('jump', false), false);
  let airborne = false;
  for (let i = 0; i < 30 * 8 && !session.director.facts.has('rival-jumped'); i += 1) { tick(); airborne ||= !rival().grounded; }
  assert.ok(airborne, 'a real jump');
  assert.ok(session.director.facts.has('rival-jumped'));
  assert.equal(session.allows('jump', false), true);
  assert.ok(session.taught.includes('jump'));
  // and he stops on the far side to gloat while the Spellblade is still coming
  for (let i = 0; i < 30 * 4 && !session.director.facts.has('jump-reached'); i += 1) tick();
  assert.ok(session.director.facts.has('jump-reached'));
  assert.ok(Math.hypot(rival().position.x - jump.waitPoint.x, rival().position.z - jump.waitPoint.z) < 1.5);
  host.close();
});

test('the sheepfold wall: Rival over it while the Spellblade comes; the Spellblade over it after him', () => {
  const t = fixture();
  const { host, session, tick, rival } = t;
  session.stage('tattle-reveal'); session.director.resumeAt('dead-end-arrival'); session.rival.enter('rival-escape', host.now());
  const reuse = GREENER_ROUTE.jumpReuse;
  rival().position = { ...reuse.takeoff };
  session.rival.waypoint = GREENER_ROUTE.chaseWaypoints.findIndex(point => point.id === 'dead-end-takeoff');
  host.player.position = { x: 15, y: 0, z: -490 };
  for (let i = 0; i < 30 * 4 && !session.director.facts.has('dead-end-rival-over'); i += 1) tick();
  assert.ok(session.director.facts.has('dead-end-rival-over'));
  assert.equal(session.director.current.id, 'your-dead-end');
  host.player.position = { x: reuse.landing.x, y: 0, z: reuse.landing.z - 1 }; tick(3);
  assert.ok(session.director.facts.has('dead-end-crossed'));
  host.close();
});

test('the final duel: a first strike Parried, a held Guard at his post, protection until it is broken', () => {
  const t = fixture();
  const { host, session, tick, events, rival, now } = t;
  session.stage('rival-defeat'); session.director.resumeAt('final-opening'); tick(3);
  assert.equal(session.rival.mode, 'final-opening');
  assert.equal(host.room.tutorialRival.protected, true);
  faceOff(t); tick();
  host.attack(true); host.attack(false); tick(Math.round(30 * (SWORD_STRIKE_TIMES[0] + .3)));
  assert.ok(events.some(e => e.type === 'parry' && e.defenderId === session.rivalId));
  assert.ok(session.director.facts.has('final-first-parry'));
  assert.equal(session.director.current.id, 'stop-you');
  while (session.director.current.id !== 'final-guard') { session.director.completeDialogue(session.director.cue); tick(); }
  tick(3); assert.equal(rival().guarding, true);
  // he holds his post: he does not come out after a Spellblade standing off, nor back into the building
  host.player.position = { x: GREENER_ROUTE.finalDefense.x, y: 0, z: GREENER_ROUTE.finalDefense.z + 9 }; tick(60);
  const post = GREENER_ROUTE.finalDefense;
  assert.ok(Math.hypot(rival().position.x - post.x, rival().position.z - post.z) < 1.2);
  assert.ok(rival().position.z > post.z - 2);
  // ordinary sword pressure on the held Guard breaks it, and only then can he be beaten
  faceOff(t); tick();
  host.attack(true);
  for (let i = 0; i < 30 * 20 && !session.finalBroken; i += 1) {
    if (!host.player.attackActive && now() >= host.player.staggerUntil) { host.attack(false); host.attack(true); }
    faceOff(t); tick();
  }
  host.attack(false);
  assert.ok(events.some(e => e.type === 'guardBreak' && e.defenderId === session.rivalId));
  assert.equal(host.room.tutorialRival.protected, false);
  assert.ok(session.director.facts.has('rival-guard-broken'));
  host.close();
});

test('losing the final duel: his taunt over the fallen Spellblade, then a rematch from down the lane, not the chase', () => {
  const t = fixture();
  const { host, session, tick, rival, now } = t;
  session.stage('rival-defeat'); session.director.resumeAt('final-guard'); tick(3);
  const heard = [];
  for (const expected of ['fight-yourself', 'already-told', null]) {
    host.player.spawnProtectionUntil = 0;
    applyDamage(host.room, session.rivalId, host.player.id, 500, 'sword', now()); tick();
    assert.equal(host.player.alive, false);
    let line = null;
    for (let i = 0; i < 30 * 8 && !host.player.alive; i += 1) { line ??= session.director.optionalCue?.id ?? null; tick(); }
    heard.push(line);
    assert.equal(host.player.alive, true, 'the rematch');
    const back = GREENER_ROUTE.checkpointPositions.rematch;
    assert.ok(Math.hypot(host.player.position.x - back.x, host.player.position.z - back.z) < .5, 'down the lane');
    assert.equal(session.director.current.id, 'final-guard', 'where the duel stood: no chase, no terms');
    tick(5);
    assert.ok(Math.hypot(rival().position.x - GREENER_ROUTE.finalDefense.x, rival().position.z - GREENER_ROUTE.finalDefense.z) < 1);
    assert.equal(rival().guarding, true, 'a guarding Rival to walk back to');
    assert.equal(expected, line);
  }
  assert.deepEqual(heard, ['fight-yourself', 'already-told', null]);
  host.close();
});

test('a Fireball in the final duel gets his one answer about feelings', () => {
  const { host, session, tick, now } = fixture();
  session.stage('rival-defeat'); session.director.resumeAt('final-guard'); tick(3);
  const hit = { type: 'damage', victimId: session.rivalId, attackerId: host.player.id, source: 'fireball', amount: 20, health: 80, at: now() };
  session.events([hit]); tick();
  assert.equal(session.director.optionalCue?.id, 'feelings-health');
  session.director.completeOptionalDialogue(session.director.optionalCue); tick();
  session.events([hit]); tick();
  assert.equal(session.director.optionalCue, null, 'once');
  host.close();
});

test('the health instruction stands from the hit itself, under the lines that follow, until health has settled', () => {
  const t = fixture();
  const { host, session, tick, now } = t;
  const shown = [];
  const original = session.onChange;
  session.onChange = progress => { shown.push({ beat: progress.current?.id, standing: progress.standing?.line ?? null }); original(progress); };
  session.stage('first-guard'); session.director.resumeAt('postscript-hit');
  applyDamage(host.room, session.rivalId, host.player.id, 25, 'sword', now());
  session.events([{ type: 'damage', victimId: host.player.id, attackerId: session.rivalId, source: 'sword', amount: 25, health: 75 }]);
  session.director.fact('player-damaged'); tick();
  // the Rival's two lines and "I need a moment." are said with it standing
  for (const id of ['extra', 'hint', 'need-a-moment']) {
    assert.equal(session.director.current.id, id);
    assert.equal(session.standing()?.line, 'HEALTH REGENERATES', id);
    session.director.completeDialogue(session.director.cue); tick();
  }
  assert.equal(session.director.current.id, 'health-regen-prompt');
  for (let i = 0; i < 30 * 12 && session.director.current.id === 'health-regen-prompt'; i += 1) tick();
  assert.equal(session.director.current.id, 'no-hints');
  assert.equal(session.standing(), null, 'gone once settled');
  assert.ok(shown.some(row => row.beat === 'extra' && row.standing === 'HEALTH REGENERATES'));
  host.close();
});

test('the duel counts from the fight proper: a quick start lands hits, but he goes down only after the banter begins', () => {
  const { host, session } = fixture();
  session.stage('real-duel'); session.director.resumeAt('plans-change'); session.rival.enter('rival-attack', host.now());
  const hit = { type: 'damage', victimId: session.rivalId, attackerId: host.player.id, source: 'sword', amount: 30, health: 1 };
  for (let i = 0; i < 5; i += 1) session.events([hit]);
  assert.equal(session.director.facts.has('duel-damage-threshold'), false, 'no knockdown during the opening exchange');
  assert.equal(session.rival.mode, 'duel');
  session.director.resumeAt('duel-midway');
  for (let i = 0; i < 2; i += 1) session.events([hit]);
  assert.ok(session.director.facts.has('duel-damage-midway'));
  for (let i = 0; i < 2; i += 1) session.events([hit]);
  assert.ok(session.director.facts.has('duel-damage-threshold'));
  assert.equal(session.rival.mode, 'recover');
  host.close();
});

test('a final defeat\'s taunt is heard first: an aside still waiting is dropped, and burns only speak in the counterfire', () => {
  const { host, session, tick, now } = fixture();
  session.stage('rival-defeat'); session.director.resumeAt('final-guard'); tick(3);
  // a burn ending in the final duel offers nothing (its aside belongs to the counterfire)
  host.player.burningUntil = now() + .2; tick(2); tick(10);
  assert.equal(session.director.branchesSeen.has('burned'), false);
  // an aside already waiting is dropped for the taunt
  session.director.branchQueue.push({ id: 'queued-aside', speaker: 'narrator', line: 'Waiting.', branch: 'permission-to-stop' });
  host.player.spawnProtectionUntil = 0;
  applyDamage(host.room, session.rivalId, host.player.id, 500, 'sword', now()); tick();
  assert.equal(session.director.optionalCue?.id, 'fight-yourself');
  assert.equal(session.director.branchQueue.some(beat => beat.id === 'queued-aside'), false);
  host.close();
});
