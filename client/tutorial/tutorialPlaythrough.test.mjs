import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { GREENER_ROUTE, greenerOpeningProgress } from '../../shared/worlds/greenerPastures.mjs';
import { SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

function playthrough({ missFirst = false, omitSegments = [] } = {}) {
  let now = 10, seq = 0, lastBeat = '', lastAttack = -10, lastCast = -10, missed = false, missUntil = -Infinity;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  let seed = 123456;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const session = new TutorialSession(host, { random, omitSegments }); session.start();
  let guardHeld = false, attackHeld = false;
  const guard = down => { if (guardHeld !== down) { host.guard(down); guardHeld = down; } };
  const attack = down => { if (attackHeld !== down) { host.attack(down); attackHeld = down; } };
  const log = [], events = [], allFacts = new Set();
  host.on('events', batch => events.push(...batch.events));
  // the opening's way to Rival runs through its gateways (how far along it each one is)
  const path = GREENER_ROUTE.openingPath;
  const along = path.map((point, k) => path.slice(1, k + 1).reduce((sum, next, j) => sum + Math.hypot(next.x - path[j].x, next.z - path[j].z), 0));
  for (let i = 0; i < 30 * 700 && session.director.state === 'running'; i++) {
    now += 1 / 30;
    const beat = session.director.current, p = host.player, r = host.room.players.get(session.rivalId);
    const freshBeat = beat.id !== lastBeat;
    if (freshBeat) { log.push([+(now - 10).toFixed(1), beat.id, +p.health.toFixed(1), +p.position.z.toFixed(1), +r.position.z.toFixed(1), +Math.hypot(r.position.x-p.position.x,r.position.z-p.position.z).toFixed(1)]); lastBeat = beat.id; }
    let forward = 0, right = 0, sprint = false, jump = false, yaw = p.yaw, pitch = 0;
    let target = r.position, dx = target.x - p.position.x, dz = target.z - p.position.z, dist = Math.hypot(dx, dz);
    if (beat.kind === 'dialogue' && beat.presentation !== 'reactive') { session.director.completeDialogue(session.director.cue); }
    if (beat.id === 'look-prompt') yaw += .03;
    else if (['approach', 'stamina'].includes(beat.segment)) {
      const gate = path.find((point, k) => k > 0 && k < path.length - 1 && along[k] > greenerOpeningProgress(p.position) + 2.5);
      if (gate) { dx = gate.x - p.position.x; dz = gate.z - p.position.z; }
      yaw = Math.atan2(-dx, -dz); forward = dist > 2.5 ? 1 : 0;
      sprint = beat.segment === 'stamina' && !['recover-prompt', 'reach-rival'].includes(beat.id);
      if (beat.id === 'recover-prompt' || !session.allows('move',false) || freshBeat && beat.id==='walk-prompt') forward = 0;
    } else if (['first-attack', 'first-guard', 'health-regen', 'real-duel'].includes(beat.segment)) {
      yaw = Math.atan2(-dx, -dz); forward = dist > 1.8 ? .6 : 0;
      if (session.rival.mode !== 'duel') guard(['guard-attack-start', 'guard-prompt'].includes(beat.id));
      if (beat.id === 'attack-prompt' && now - lastAttack > 1.5) { attack(true); attack(false); lastAttack = now; }
    } else if (['duel-knockdown', 'escape-head-start'].includes(beat.segment) || beat.segment === 'tattle-threat' && beat.id !== 'pursuit-release') {
      // he is downed, gets up and walks off; then the threat: watch, and stand
      guard(false); attack(false); yaw = Math.atan2(-dx, -dz);
    } else if (beat.segment === 'false-exit') {
      guard(false); attack(false);
      const exit = GREENER_ROUTE.exit; dx = exit.x - p.position.x; dz = exit.z - p.position.z;
      yaw = Math.atan2(-dx, -dz); forward = Math.hypot(dx, dz) > 3 ? 1 : 0;
    } else if (session.allows('attack', false) && beat.segment !== 'title-ending') {
      if (!['final-opening', 'final-guard', 'final-fight'].includes(session.rival.mode)) { guard(false); attack(false); }
      const bridge = GREENER_ROUTE.bridge;
      const stile=GREENER_ROUTE.jump;
      if(p.position.z > stile.landing.z && r.position.z <= stile.takeoff.z){
        target=p.position.z>stile.takeoff.z+1?stile.takeoff:stile.waitPoint;dx=target.x-p.position.x;dz=target.z-p.position.z;dist=Math.hypot(dx,dz);
        if(p.position.z<=stile.takeoff.z+1&&session.allows('jump',false))jump=p.grounded;
      }
      // the sheepfold's low wall, with Rival gloating just beyond it: jumped, as the stile taught
      const wall=GREENER_ROUTE.jumpReuse;
      if(p.position.z > wall.landing.z && r.position.z <= wall.takeoff.z && p.position.z < wall.approach.z+40){
        target=p.position.z>wall.takeoff.z+1?wall.takeoff:wall.exit;dx=target.x-p.position.x;dz=target.z-p.position.z;dist=Math.hypot(dx,dz);
        if(p.position.z<=wall.takeoff.z+1)jump=p.grounded;
      }
      if (p.position.z > bridge.ravineBounds.minZ && r.position.z < bridge.ravineBounds.maxZ) {
        target = p.position.z > bridge.gapBounds.minZ ? bridge.dashStart : GREENER_ROUTE.waypointById['far-bank']; dx = target.x - p.position.x; dz = target.z - p.position.z; dist = Math.hypot(dx, dz);
      }
      yaw = Math.atan2(-dx, -dz); forward = dist > (target === bridge.dashStart || target === stile.takeoff || target === wall.takeoff ? .1 : 1.8) ? 1 : 0; sprint = dist > 10;
      if (['counterfire', 'complaint'].includes(session.rival.mode)) right = Math.cos(now * 2.8) * .8;
      if (p.position.z <= bridge.dashStart.z + 1 && p.position.z > bridge.gapBounds.minZ) {
        yaw = 0; sprint = true;
        if (session.allows('dash',false)) {
          forward=1; jump=p.grounded;
          if(!p.grounded && p.velocity.y<=0)host.dash({x:0,z:-1});
        } else forward=0;
      }
      if (['fireball', 'counterfire'].includes(beat.segment) && now - lastCast > 4.1) {
        const a = { x: r.position.x - p.position.x, y: -.04, z: r.position.z - p.position.z };
        const length = Math.hypot(a.x, a.z); a.x /= length; a.z /= length;
        if (missFirst && !missed) { Object.assign(a, { x: 1, y: -.3, z: 0 }); missed = true; missUntil = now + .4; }
        host.cast(a); lastCast = now;
      }
    }
    if (['duel', 'final-opening', 'final-guard', 'final-fight'].includes(session.rival.mode)) {
      dx = r.position.x - p.position.x; dz = r.position.z - p.position.z; dist = Math.hypot(dx, dz);
      yaw = Math.atan2(-dx, -dz); forward = dist > 1.8 ? .65 : 0; sprint = false;
      const mine = p.attackActive ? p.attackStartedAt + (SWORD_STRIKE_TIMES[p.attackNextStrike] ?? Infinity) : Infinity;
      const theirs = r.attackActive ? r.attackStartedAt + (SWORD_STRIKE_TIMES[r.attackNextStrike] ?? Infinity) : Infinity;
      const guarding = now >= p.staggerUntil && r.attackActive && now - r.attackStartedAt > .27 && theirs < mine && dist < 3.2;
      guard(guarding);
      // (a Parry stops the chain: let go and press again, as anyone would)
      if (attackHeld && !p.attackActive && now >= p.staggerUntil) attack(false);
      else attack(!guarding);
    }
    if (beat.id === 'player-departure') {
      const at = GREENER_ROUTE.departure;
      yaw = Math.atan2(-(at.x - p.position.x), -(at.z - p.position.z)); forward = 1;
    }
    if (p.pendingSpell && now >= missUntil) {
      const travelYaw = yaw, scale = forward, side = right;
      yaw = Math.atan2(-(r.position.x-p.position.x),-(r.position.z-p.position.z)); pitch = -.04;
      const delta = yaw - travelYaw;
      forward = Math.cos(delta)*scale - Math.sin(delta)*side;
      right = Math.sin(delta)*scale + Math.cos(delta)*side;
    }
    // (the miss goes the other way from him: at the ground, out of the burst's reach of him however close he stands)
    if (now < missUntil) { yaw = Math.atan2(r.position.x - p.position.x, r.position.z - p.position.z); pitch = -.5; }
    host.input({ seq: ++seq, forward, right, yaw, pitch, sprint, jump, crouch: false, guard: guardHeld, attack: attackHeld }); host.tick();
    for (const fact of [...session.director.facts, ...session.movement.facts]) allFacts.add(fact);
  }
  const result = { state: session.director.state, log, mode: session.rival.mode,
    facts: allFacts, branches: new Set(session.director.branchesSeen),
    events, player: host.player, rival: host.room.players.get(session.rivalId) };
  host.close(); return result;
}

test('the complete continuous route uses ordinary movement and combat through an actual corpse near TATTLE ON YOU', () => {
  const { state, log, facts, player, rival, mode } = playthrough();
  assert.equal(state, 'complete', JSON.stringify({ mode, tail: log.slice(-10), rival: rival.position, player: player.position }));
  assert.equal(player.alive, true); assert.equal(rival.alive, false);
  assert.ok(Math.hypot(rival.position.x - GREENER_ROUTE.entrance.x, rival.position.z - GREENER_ROUTE.entrance.z) < 18);
  for (const gate of ['player-winded', 'stamina-recovered', 'sword-contact', 'successful-guard', 'player-damaged',
    'health-regenerated', 'health-settled', 'duel-damage-threshold', 'rival-downed', 'rival-recovered', 'rival-departing',
    'exit-walk-started', 'exit-near', 'player-halted', 'rival-jumped', 'jump-crossed', 'fireball-hit', 'dead-end-crossed',
    'dash-used', 'bridge-crossed', 'subsequent-fireball-hit', 'complaint-approached', 'rival-turned', 'final-first-parry',
    'rival-guard-broken', 'rival-defeated', 'departure-complete']) assert.ok(facts.has(gate), gate);
  const at = id => log.find(x => x[1] === id)?.[0];
  assert.ok(at('winded-prompt') < at('cannot-sprint'));
  assert.ok(at('can-do-all-day') < at('cannot-sprint'));
  assert.ok(at('plans-change') < at('overstayed-welcome'));
  // the blow that brings him down is answered while he is down; the departure is narrated as he walks off
  // (a stage passed within one step leaves no row: the spoken lines carry the order)
  assert.ok(at('plans-change') < at('wrong-address') && at('wrong-address') < at('successful-expulsion'));
  assert.ok(at('successful-expulsion') < at('time-to-exit') && at('time-to-exit') < at('barely-did-anything') && at('barely-did-anything') < at('escape-made-fun'));
  assert.ok(at('escape-made-fun') < at('hardly-wellbeing'));
  assert.ok(at('come-prove-it') < at('stop-you') && at('stop-you') < at('convince-unblock') && at('convince-unblock') < at('did-not-stop'));
  assert.ok(at('why-spellblade') < at('get-over-this'));
  assert.ok(at('minor-tactical-regret') < at('final-hello') && at('final-hello') < at('why-spellblade') && at('come-prove-it') < at('defeat-rival'));
});

test('a genuine first Fireball miss remains recoverable and fires its optional branch once', () => {
  const { state, branches, facts, log, mode } = playthrough({ missFirst: true });
  assert.equal(state, 'complete', JSON.stringify({ mode, tail: log.slice(-10) }));
  assert.ok(branches.has('first-fireball-miss')); assert.ok(facts.has('fireball-hit'));
});

test('removing the optional pursuit exchange still reaches ordinary Rival defeat and completion', () => {
  const { state, facts, log, mode } = playthrough({ omitSegments: ['pursuit-banter'] });
  assert.equal(state, 'complete', JSON.stringify({ mode, tail: log.slice(-10) }));
  assert.equal(log.some(row => row[1] === 'final-hello'), false);
  assert.ok(facts.has('rival-defeated'));
});

test('removing optional chase exchanges and the Jump lesson leaves a traversable route and ordinary ending',()=>{
  const {state,log,mode}=playthrough({omitSegments:['jump-obstacle','tattle-reveal','pursuit-banter']});
  assert.equal(state,'complete',JSON.stringify({mode,tail:log.slice(-8)}));
  assert.equal(log.some(row=>['minor-obstacle-gloat','matter-settled','final-hello'].includes(row[1])),false);
});
