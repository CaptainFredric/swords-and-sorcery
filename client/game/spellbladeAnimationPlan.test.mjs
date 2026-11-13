import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUARD_HOLD_SECONDS,
  GUARD_HOLD_START,
  resolveFirstPersonAnimationPlan,
  resolveSpellbladeAnimationPlan,
} from './spellbladeAnimationPlan.mjs';

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

test('late attack snapshots select the authoritative slash clip and local clip time', () => {
  const player = { attackStartedAt: 10 };

  let plan = resolveSpellbladeAnimationPlan({ state: 'attack', player, serverNow: 10.9, localTime: 99 });
  assert.equal(plan.clip, 'Slash_2');
  close(plan.time, 0.18);
  assert.equal(plan.loop, false);

  plan = resolveSpellbladeAnimationPlan({ state: 'attack', player, serverNow: 11.7, localTime: 99 });
  assert.equal(plan.clip, 'Slash_3');
  close(plan.time, 0.26);
});

test('a chain begun Sundering plays every strike as the heavy slam, each at its own contact', () => {
  const player = { attackStartedAt: 10, attackSlam: true };
  // the heavy strike's contact is 0.36 s into Slash_3, and each strike's contact (0.4, 1.1, 1.8) lands there
  for (const contact of [0.4, 1.1, 1.8]) {
    const plan = resolveSpellbladeAnimationPlan({ state: 'attack', player, serverNow: 10 + contact, localTime: 99 });
    assert.equal(plan.clip, 'Slash_3');
    close(plan.time, 0.36);
  }
  assert.equal(resolveSpellbladeAnimationPlan({ state: 'attack', player: { attackStartedAt: 10 }, serverNow: 10.4 }).clip, 'Slash_1');
});

test('cast timing comes from the authoritative cast window start', () => {
  const plan = resolveSpellbladeAnimationPlan({
    state: 'cast',
    player: { castPoseStartAt: 5 },
    serverNow: 5.22,
    localTime: 88,
  });
  assert.equal(plan.clip, 'Cast');
  close(plan.time, 0.22);
  assert.equal(plan.loop, false);
});

test('dash and stagger progress derive from authoritative server deadlines', () => {
  const dash = resolveSpellbladeAnimationPlan({
    state: 'dash',
    player: { dashUntil: 9.18 },
    serverNow: 9.08,
    localTime: 77,
  });
  assert.equal(dash.clip, 'Dash');
  close(dash.time, 0.08);
  assert.equal(dash.loop, false);

  const stagger = resolveSpellbladeAnimationPlan({
    state: 'stagger',
    player: { staggerUntil: 20.7 },
    serverNow: 20.2,
    localTime: 66,
  });
  assert.equal(stagger.clip, 'Stagger');
  close(stagger.time, 0.2);
  assert.equal(stagger.loop, false);
});

test('death derives clip progress from the authoritative respawn deadline', () => {
  const plan = resolveSpellbladeAnimationPlan({
    state: 'dead',
    player: { respawnAt: 33 },
    serverNow: 30.45,
    localTime: 55,
  });
  assert.equal(plan.clip, 'Death');
  close(plan.time, 0.45);
  assert.equal(plan.loop, false);
});

test('an indefinitely retained corpse advances Death from its actual death time, without looping or resetting', () => {
  const player = {alive:false,deathAt:30,respawnAt:null};
  for (const serverNow of [30.45,33,45]) {
    const plan = resolveSpellbladeAnimationPlan({state:'dead',player,serverNow});
    assert.equal(plan.clip,'Death'); close(plan.time,serverNow-30); assert.equal(plan.loop,false);
  }
  assert.equal(resolveSpellbladeAnimationPlan({state:'idle',player:{...player,alive:true},serverNow:46}).clip,'Idle');
});

test('guard loops its breathing hold section on the local clock', () => {
  const at = (localTime) => resolveSpellbladeAnimationPlan({ state: 'guard', player: {}, serverNow: 1, localTime });
  const guard = at(4.25);
  assert.equal(guard.clip, 'Guard');
  assert.equal(guard.loop, false);
  close(guard.time, GUARD_HOLD_START + (4.25 % GUARD_HOLD_SECONDS));
  for (const clock of [0, 0.3, 1.1, 1.59, 1.6, 7.77, -2.5]) {
    const time = at(clock).time;
    assert.ok(time >= GUARD_HOLD_START && time < GUARD_HOLD_START + GUARD_HOLD_SECONDS, `guard time ${time} leaves the hold`);
  }
  assert.notEqual(at(0.2).time, at(0.9).time, 'the guard hold must move over time');
  close(at(0).time, at(GUARD_HOLD_SECONDS).time);

  const fp = resolveFirstPersonAnimationPlan({ state: 'guard' }, {}, 2.0);
  assert.equal(fp.clip, 'Guard');
  close(fp.time, GUARD_HOLD_START + (2.0 % GUARD_HOLD_SECONDS));
});

test('air selects a fixed pose while locomotion loops locally', () => {

  const air = resolveSpellbladeAnimationPlan({ state: 'air', player: {}, serverNow: 1, localTime: 4.25 });
  assert.deepEqual(air, { clip: 'Air', time: 0.5, loop: false, weight: 1, normalized: true });
  const takeOff = resolveSpellbladeAnimationPlan({ state: 'air', player: { velocity: { y: 7.2 } }, serverNow: 1, localTime: 4.25 });
  const falling = resolveSpellbladeAnimationPlan({ state: 'air', player: { velocity: { y: -7.2 } }, serverNow: 1, localTime: 4.25 });
  assert.equal(takeOff.time, 0, 'take-off starts the air clip');
  assert.equal(falling.time, 1, 'a full-speed fall reaches its end');

  const run = resolveSpellbladeAnimationPlan({ state: 'run', player: {}, serverNow: 1, localTime: 4.25 });
  assert.equal(run.clip, 'Run');
  assert.equal(run.loop, true);
  close(run.time, 4.25);

  const idle = resolveSpellbladeAnimationPlan({ state: 'idle', player: {}, serverNow: 1, localTime: 7.5 });
  assert.equal(idle.clip, 'Idle');
  assert.equal(idle.loop, true);
  close(idle.time, 1 / 30 + (7.5 % (59 / 30)));
});


test('first person held combos restart each slash timeline across repeated cycles', () => {
  const view = { attackStartedAt: 10 };
  for (const [elapsed, clip, time] of [[0.4, 'Slash_1', 0.4], [0.9, 'Slash_2', 0.18], [1.7, 'Slash_3', 0.26], [2.48, 'Slash_1', 0.4], [3.78, 'Slash_3', 0.26]]) {
    const plan = resolveFirstPersonAnimationPlan({ state: 'attack', strike: Number(clip.slice(-1)) - 1 }, view, 10 + elapsed);
    assert.equal(plan.clip, clip);
    close(plan.time, time);
    assert.equal(plan.loop, false);
  }
});

test('first person guard, cast and dash retain their own animation clocks', () => {
  const view = { castStartedAt: 20, dashUntil: 30.18 };
  close(resolveFirstPersonAnimationPlan({ state: 'guard' }, view, 99).time, GUARD_HOLD_START + (99 % GUARD_HOLD_SECONDS));
  close(resolveFirstPersonAnimationPlan({ state: 'cast' }, view, 20.2).time, 0.2);
  close(resolveFirstPersonAnimationPlan({ state: 'dash' }, view, 30.1).time, 0.1);
});

test('sprint is its own looping clip that falls back to Run on an asset without it', () => {
  const plan = resolveSpellbladeAnimationPlan({ state: 'sprint', player: {}, serverNow: 1, localTime: 2.5 });
  assert.equal(plan.clip, 'Sprint');
  assert.equal(plan.fallback, 'Run');
  assert.equal(plan.loop, true);
  close(plan.time, 2.5);
});

test('the brace into Sunder is the slam\'s own wind-up: it eases up through the startup and the first slam carries on from its last frame', async () => {
  const { resolveSpellbladeState } = await import('./spellbladePose.mjs');
  const { ULTIMATES } = await import('../../shared/src/ultimates.mjs');
  const sunder = ULTIMATES.sunder;
  const pressedAt = 10;
  const commitAt = pressedAt + sunder.startupSec;
  const base = { alive: true, velocity: { x: 0, y: 0, z: 0 } };
  const bracing = { ...base, ultimateState: { id: 'sunder', phase: 'startup', commitAt } };
  // the brace has the body from the moment the key is taken: over an attack in progress, a guard, a cast
  assert.equal(resolveSpellbladeState(bracing, pressedAt), 'brace');
  assert.equal(resolveSpellbladeState({ ...bracing, attackActive: true, attackStartedAt: 9.5 }, pressedAt + 0.1), 'brace', 'an attack under way does not keep the body');
  assert.equal(resolveSpellbladeState({ ...bracing, guarding: true }, pressedAt + 0.1), 'brace');
  assert.equal(resolveSpellbladeState({ ...bracing, staggerUntil: 11 }, pressedAt + 0.1), 'stagger', 'struck out of it, he is staggered');
  assert.notEqual(resolveSpellbladeState({ ...base, ultimateState: { id: 'sunder', phase: 'active', until: 18 } }, commitAt + 0.1), 'brace');
  // the sword goes up without a jump: the clip's time rises smoothly from 0, never backwards, and starts and ends gently
  let last = -1;
  const times = [];
  for (let i = 0; i <= 30; i += 1) {
    const plan = resolveSpellbladeAnimationPlan({ state: 'brace', player: bracing, serverNow: pressedAt + sunder.startupSec * i / 30 });
    assert.equal(plan.clip, 'Slash_3');
    assert.ok(plan.time >= last, 'never backwards');
    last = plan.time;
    times.push(plan.time);
  }
  close(times[0], 0);
  assert.ok(times[1] - times[0] < times[15] - times[14], 'it starts gently');
  assert.ok(times[30] - times[29] < times[15] - times[14], 'and settles at the top');
  // the host begins the first slam's chain `firstSlamLead` before the commit: at the commit, the attack's own plan is at
  // the very frame the brace ended on
  const slamming = { ...base, attackActive: true, attackSlam: true, attackStartedAt: commitAt - sunder.firstSlamLead };
  const first = resolveSpellbladeAnimationPlan({ state: 'attack', player: slamming, serverNow: commitAt });
  assert.equal(first.clip, 'Slash_3');
  close(first.time, times[30], 1e-9);
  // and that slam meets the ground `0.4 - firstSlamLead` after the commit, not a whole swing later
  const contact = resolveSpellbladeAnimationPlan({ state: 'attack', player: slamming, serverNow: slamming.attackStartedAt + 0.4 });
  close(contact.time, 0.36);
});

test('breathing clocks sample only the authored loop interval', () => {
  close(GUARD_HOLD_START, 8 / 30);
  const idle = (clock) => resolveSpellbladeAnimationPlan({ state: 'idle', localTime: clock });
  close(idle(0).time, 1 / 30);
  close(idle(59 / 30).time, 1 / 30);
  const fp = resolveFirstPersonAnimationPlan({ state: 'idle' }, {}, 0);
  close(fp.time, 1 / 30);
});

test('Chivalry guarded cuts use authored defensive variants at the ordinary contact clocks', () => {
  const player = { alive: true, guarding: true, attackActive: true, attackStartedAt: 10,
    ultimateState: { id: 'chivalry', phase: 'active', until: 19 } };
  for (const [time, clip, local] of [[10.4,'GuardCut_1',.4],[11.1,'GuardCut_2',.38],[11.8,'GuardCut_3',.36]]) {
    const plan = resolveSpellbladeAnimationPlan({ state:'attack', player, serverNow: time, localTime: time });
    assert.equal(plan.layers.sword.clip,clip);
    close(plan.layers.sword.time,local);
    assert.equal(plan.layers.posture.clip,clip);
    assert.equal(plan.layers.sorcery.clip,clip,'free gauntlet stays in the authored defensive cut');
    assert.equal(plan.layers.sword.actionKey,10);
    const casting = resolveSpellbladeAnimationPlan({ state:'attack', player:{...player,castPoseStartAt:time-.1,castPoseUntil:time+.2},serverNow:time });
    assert.equal(casting.layers.sorcery.clip,'Cast');
    assert.equal(casting.layers.sword.clip,clip);
  }
  const open=resolveSpellbladeAnimationPlan({state:'attack',player:{...player,guarding:false},serverNow:10.4});
  assert.equal(open.layers.sword.clip,'Slash_1');
});

test('Sprint plus Guard sword and spell keeps authored gait with a restrained Sprint torso underlay', () => {
  const p = { alive:true, sprinting:true, sprintBlend:1, guarding:true, attackActive:true, attackStartedAt:10,
    castPoseStartAt:10.1, castPoseUntil:10.7, velocity:{x:0,y:0,z:-11},
    ultimateState:{id:'chivalry',phase:'active',until:19} };
  const plan = resolveSpellbladeAnimationPlan({ state:'attack', player:p, serverNow:10.4, localTime:2 });
  assert.equal(plan.layers.locomotion.clip, 'Sprint');
  assert.equal(plan.layers.sword.clip, 'GuardCut_1');
  assert.equal(plan.layers.sorcery.clip, 'Cast');
  assert.equal(plan.layers.posture.overlay?.clip, 'Sprint');
  assert.ok(plan.layers.posture.overlay.weight > 0 && plan.layers.posture.overlay.weight <= .2);
  const dash = resolveSpellbladeAnimationPlan({ state:'attack', player:{...p,dashUntil:10.5}, serverNow:10.4,localTime:2 });
  assert.equal(dash.layers.locomotion.clip,'Dash');
  assert.equal(dash.layers.sword.clip,'GuardCut_1');
  assert.equal(dash.layers.sorcery.clip,'Cast');
  assert.equal(dash.layers.posture.overlay,undefined);
  const resumed = resolveSpellbladeAnimationPlan({ state:'guard', player:{...p,attackActive:false,castPoseUntil:0},serverNow:10.8,localTime:2.4 });
  assert.equal(resumed.layers.locomotion.clip,'Sprint');
  assert.equal(resumed.layers.sword.clip,'Guard');
  assert.equal(resumed.layers.posture.overlay.clip,'Sprint');
});

test('All-Natural Disaster plays its authored clips, each with the blade in the ground at the authoritative commit',async()=>{
  const { resolveSpellbladeState } = await import('./spellbladePose.mjs');
  const { DISASTER_CLIPS } = await import('./spellbladeAnimationPlan.mjs');
  const { loadGlb, localPose, worldMatrices, apply } = await import('../../scripts/lib/glbPose.mjs');
  const model=loadGlb(new URL('../assets/characters/spellblade/spellblade.glb',import.meta.url).pathname);
  const hand=model.byName.get('hand.R'),TIP=[0.131,1.3383,-0.1661];
  const tipY=(clip,time)=>apply(worldMatrices(model,localPose(model,[{clip,time,weight:1}]))[hand],TIP)[1];
  const plan=(player,now)=>resolveSpellbladeAnimationPlan({state:resolveSpellbladeState(player,now),player,serverNow:now});
  const base={alive:true,grounded:true,velocity:{x:0,y:0,z:0},staggerUntil:0};
  // the shipped model really has every clip the plan names, as long as the plan says it is
  for(const entry of Object.values(DISASTER_CLIPS)){
    assert.ok(model.clips.has(entry.clip),`${entry.clip} is in spellblade.glb`);
    assert.ok(Math.abs(model.clips.get(entry.clip).duration-entry.duration)<.07,`${entry.clip} runs ${entry.duration}s`);
  }
  // each slam's contact time is when the authored blade reaches the floor (its tip crossing y = 0 on the way down
  // into the slam), to within a frame
  for(const key of ['ground','fast','arrival']){
    const {clip,contact,duration}=DISASTER_CLIPS[key];
    let lowest=0;
    for(let t=0;t<=duration;t+=1/120)if(tipY(clip,t)<tipY(clip,lowest))lowest=t;
    let crossing=null;
    for(let t=lowest;t>=0;t-=1/240)if(tipY(clip,t)>0){crossing=t;break;}
    assert.ok(crossing!==null&&Math.abs(crossing-contact)<=1/30,`${key}: the blade reaches the ground at ${crossing?.toFixed(3)}s, the plan says ${contact}s`);
    // (the arrival clip is joined at its landing: it has no time before it)
    if(key!=='arrival')assert.ok(tipY(clip,contact-.08)>.5,`${key}: still well up 0.08s before`);
  }
  // ordinary wind-up (0.92 s): the dual-spin slam from its first frame, its contact frame exactly at the commit
  const charging={...base,ultimateState:{id:'one_hit_of_wonders',phase:'startup',startedAt:10,commitAt:10.92,preparedTiers:{lightning:0}}};
  const started=plan(charging,10),near=plan(charging,10.9);
  assert.equal(started.clip,'AllNatural_Ground_DualSpin_Slam');
  assert.ok(started.time<1e-9,'from its first frame');
  assert.ok(plan(charging,10.07).time<1e-9&&plan(charging,10.2).time>.1,'the turns begin once the clip can end on the commit');
  assert.ok(Math.abs(near.time-(DISASTER_CLIPS.ground.contact-.02))<1e-9,'two hundredths before the commit, two hundredths before the blade lands');
  assert.equal(started.fallback,'Slash_3','a model without the clip keeps the old heavy strike');
  const committed={...base,ultimateState:{id:'one_hit_of_wonders',phase:'active',commitAt:10.92,until:12.57,oneHit:{form:'ground',tiers:{}}}};
  const contact=plan(committed,10.92),follow=plan(committed,11.2);
  assert.equal(contact.clip,'AllNatural_Ground_DualSpin_Slam','no change of clip at the commit');
  assert.ok(Math.abs(contact.time-DISASTER_CLIPS.ground.contact)<1e-9,'the contact frame at the commit');
  assert.ok(Math.abs(follow.time-(DISASTER_CLIPS.ground.contact+.28))<1e-9,'and its authored recovery in real time');
  assert.ok(plan(committed,12.5).time<DISASTER_CLIPS.ground.duration,'never past its end');
  // Half Lightning (0.36 s): the fast clip, same rule
  const fast={...base,ultimateState:{id:'one_hit_of_wonders',phase:'startup',startedAt:10,commitAt:10.36,preparedTiers:{lightning:1}}};
  assert.equal(plan(fast,10).clip,'AllNatural_FastLightning_DualSpin_Slam');
  const fastHit={...base,ultimateState:{id:'one_hit_of_wonders',phase:'active',commitAt:10.36,until:12,oneHit:{form:'ground',tiers:{lightning:1}}}};
  assert.ok(Math.abs(plan(fastHit,10.36).time-DISASTER_CLIPS.fast.contact)<1e-9);
  assert.ok(Math.abs(plan(fast,10.35).time-(DISASTER_CLIPS.fast.contact-.01))<1e-9,'continuous into it');
  // a held ground release waits a frame short of the ground and never passes it
  const held={...charging,ultimateState:{...charging.ultimateState,groundRelease:{readyAt:10.92,until:11.24}}};
  assert.ok(Math.abs(plan(held,11.1).time-(DISASTER_CLIPS.ground.contact-1/30))<1e-9);
  // Full Lightning: the charge loops for as long as it is held, on the ground and in the air; the release is the
  // arrival slam with its blade already landing
  const aim={...base,ultimateState:{id:'one_hit_of_wonders',phase:'startup',startedAt:10,commitAt:3_600_010,preparedTiers:{lightning:2},teleportHoldAt:10}};
  const aiming=plan(aim,30.3);
  assert.equal(aiming.clip,'AllNatural_Lightning_Charge_Ground');
  assert.ok(aiming.loop&&aiming.time<DISASTER_CLIPS.chargeGround.duration);
  const airAim={...aim,grounded:false,ultimateState:{...aim.ultimateState,preparedTiers:{lightning:2,gale:2}}};
  assert.equal(plan(airAim,30.3).clip,'AllNatural_Lightning_Charge_Air');
  assert.equal(plan({...aim,grounded:false},30.3).clip,'AllNatural_Lightning_Charge_Ground','without Full Gale there is no aerial form: knocked into the air, it is still the ground aim');
  const arrived={...base,ultimateState:{id:'one_hit_of_wonders',phase:'active',commitAt:31,until:32.65,teleportHoldAt:10,oneHit:{form:'ground',tiers:{lightning:2}}}};
  const arrival=plan(arrived,31);
  assert.equal(arrival.clip,'AllNatural_Lightning_Arrival_Slam');
  assert.ok(Math.abs(arrival.time-DISASTER_CLIPS.arrival.contact)<1e-9,'no second wind-up: the blade lands as the knight arrives');
  // Full Gale in the air: one uninterrupted winding clip beginning on key
  // press, continuing past the commit without a hover or clip reset.
  const air={...base,grounded:false,ultimateState:{id:'one_hit_of_wonders',phase:'startup',startedAt:10,commitAt:10.92,preparedTiers:{gale:2}}};
  const firstAir=plan(air,10),earlyAir=plan(air,10.4),lateAir=plan(air,10.9);
  assert.equal(firstAir.clip,'AllNatural_Aerial_Vortex_Wave');
  assert.equal(firstAir.loop,false);
  assert.ok(firstAir.time<1e-9);
  assert.equal(earlyAir.clip,firstAir.clip);
  assert.ok(earlyAir.time>0&&lateAir.time>earlyAir.time);
  const vortex={...base,grounded:false,ultimateState:{
    id:'one_hit_of_wonders',phase:'active',startedAt:10,commitAt:10.92,
    until:12.57,oneHit:{form:'aerial',tiers:{gale:2},waveAt:11.77},
  }};
  const atCommit=plan(vortex,10.92),afterCommit=plan(vortex,11.2);
  // Wire snapshots do not transmit ultimateState.startedAt: the planner
  // must reconstruct it from the authoritative commit and wind-up rule.
  const wireAir={...air,ultimateState:{...air.ultimateState,startedAt:undefined}};
  const wireVortex={...vortex,ultimateState:{...vortex.ultimateState,startedAt:undefined}};
  close(plan(wireAir,10.4).time,earlyAir.time);
  close(plan(wireVortex,10.92).time,atCommit.time);
  assert.equal(atCommit.clip,firstAir.clip);
  assert.ok(Math.abs(atCommit.time - lateAir.time)<.03,'no pose reset at commit');
  assert.ok(afterCommit.time>atCommit.time,'winding continues after commit');
  assert.ok(plan(vortex,11.76).time<DISASTER_CLIPS.aerial.contact,'never fires ahead of the host');
  const launched={...vortex,ultimateState:{...vortex.ultimateState,oneHit:{
    ...vortex.ultimateState.oneHit,waveLaunched:true,waveLaunchedAt:11.77,
  }}};
  close(plan(launched,11.77).time,DISASTER_CLIPS.aerial.contact);
  assert.ok(plan(launched,11.95).time>DISASTER_CLIPS.aerial.contact,'release continues into follow-through');
  assert.notEqual(plan(air,10.4).clip,DISASTER_CLIPS.chargeAir.clip,'no static airborne charge before vortex');
});

test('Full Lightning + Full Gale arrival uses the final aerial winding frames during the actual aim window',async()=>{
  const { ONE_HIT_RULES }=await import('../../shared/src/oneHitOfWondersRules.mjs');
  const { DISASTER_CLIPS }=await import('./spellbladeAnimationPlan.mjs');
  const base={alive:true,grounded:false,velocity:{x:0,y:0,z:0},staggerUntil:0};
  const commitAt=31,aimSec=ONE_HIT_RULES.postTeleportAimSec;
  const player={...base,ultimateState:{
    id:'one_hit_of_wonders',phase:'active',startedAt:12,
    commitAt,teleportHoldAt:12,until:33,preparedTiers:{lightning:2,gale:2},
    oneHit:{form:'aerial',tiers:{lightning:2,gale:2},
      waveAt:commitAt+aimSec,waveLaunched:false},
  }};
  const plan=now=>resolveSpellbladeAnimationPlan({state:'one-hit',player,serverNow:now});
  const start=plan(commitAt),mid=plan(commitAt+aimSec/2),near=plan(commitAt+aimSec-1/1000);
  assert.equal(start.clip,DISASTER_CLIPS.aerial.clip);
  assert.equal(start.loop,false,'arrival is a winding action, not a hovering loop');
  close(start.time,Math.max(0,DISASTER_CLIPS.aerial.contact-aimSec));
  assert.ok(mid.time>start.time&&mid.time<near.time,'sword keeps winding while the player aims');
  assert.ok(near.time<DISASTER_CLIPS.aerial.contact,'blade cannot throw before actual wave release');
  const launched={...player,ultimateState:{...player.ultimateState,oneHit:{
    ...player.ultimateState.oneHit,waveLaunched:true,waveLaunchedAt:commitAt+aimSec,
  }}};
  close(resolveSpellbladeAnimationPlan({state:'one-hit',player:launched,
    serverNow:commitAt+aimSec}).time,DISASTER_CLIPS.aerial.contact);
  assert.ok(resolveSpellbladeAnimationPlan({state:'one-hit',player:launched,
    serverNow:commitAt+aimSec+.1}).time>DISASTER_CLIPS.aerial.contact);
  const onGround={...player,grounded:true,ultimateState:{...player.ultimateState,
    oneHit:{...player.ultimateState.oneHit,form:'ground'}}};
  assert.equal(resolveSpellbladeAnimationPlan({state:'one-hit',player:onGround,
    serverNow:commitAt}).clip,DISASTER_CLIPS.arrival.clip,
    'the existing instant ground-arrival slam remains unchanged');
});

test('the two chain forms: the rising chain plays its cuts in its own order, each contact frame on the server contact',()=>{
  const authored={Slash_1:.4,Slash_2:.38,Slash_3:.36};
  const forms=[['Slash_1','Slash_2','Slash_3'],['Slash_2','Slash_1','Slash_3']];
  forms.forEach((clips,variant)=>{
    const player={attackActive:true,attackStartedAt:10,attackCommitted:3,attackVariant:variant};
    [0.4,1.1,1.8].forEach((contact,strike)=>{
      const shown=resolveSpellbladeAnimationPlan({state:'attack',player,serverNow:10+contact});
      assert.equal(shown.clip,clips[strike],`form ${variant} strike ${strike+1}`);
      assert.ok(Math.abs(shown.time-authored[shown.clip])<1e-9,`form ${variant} strike ${strike+1} at its authored contact frame`);
    });
  });
  // the forms differ where they are seen to: the opening cut
  const opening=(variant)=>resolveSpellbladeAnimationPlan({state:'attack',player:{attackActive:true,attackStartedAt:10,attackCommitted:1,attackVariant:variant},serverNow:10.3});
  assert.notEqual(opening(0).clip,opening(1).clip);
});

test('the held Full Lightning aim loops its authored charge, in the air and on the ground',()=>{
  const hold={id:'one_hit_of_wonders',phase:'startup',commitAt:3_600_010,
    teleportHoldAt:10,preparedTiers:{lightning:2,gale:2}};
  const plan=(grounded,serverNow)=>resolveSpellbladeAnimationPlan({
    state:'one-hit',player:{ultimateState:hold,grounded},serverNow,
  });
  assert.equal(plan(false,10.3).clip,'AllNatural_Lightning_Charge_Air');
  assert.equal(plan(false,10.3).loop,true);
  assert.equal(plan(false,60.2).clip,'AllNatural_Lightning_Charge_Air');
  assert.equal(plan(true,10.3).clip,'AllNatural_Lightning_Charge_Ground');
  assert.equal(plan(true,10.3).fallback,'Slash_3','and a model without it keeps the raised heavy strike');
});
