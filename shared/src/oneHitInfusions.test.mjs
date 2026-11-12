import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyInfusions,creditOneHitEncounter,oneHitCommit,oneHitForm,oneHitDamage,
  applyOneHitShaken,shakenSprintFactor,oneHitBacklashRemaining,oneHitTeleportDistance,normalizeInfusions,
  ONE_HIT_PRESETS,oneHitSteelFloorActive,oneHitChargeIntent,oneHitGlide,oneHitChargingLightning} from './oneHitInfusions.mjs';
import { GAME } from './combat.mjs';
import { RUPTURE } from './rupture.mjs';

test('one qualifying spell use advances once, independent of victims and lingering ticks', () => {
 const p={oneHitInfusions:emptyInfusions()};
 assert.equal(creditOneHitEncounter(p,'fire','fireball:1'),true);
 assert.equal(creditOneHitEncounter(p,'fire','fireball:1'),false);
 assert.equal(p.oneHitInfusions.fire,1);
 assert.equal(creditOneHitEncounter(p,'fire','fireball:2'),true);
 assert.equal(p.oneHitInfusions.fire,2);
 assert.equal(creditOneHitEncounter(p,'fire','fireball:3'),false);
 assert.equal(p.oneHitInfusions.frost,0);
});
test('zero, partial and full tiers have exactly one direct damage contribution per element',()=>{
 assert.equal(oneHitDamage({}),46);
 assert.equal(oneHitDamage({}),GAME.swordElevated+RUPTURE.damage,'simple Disaster matches one Sunder strike and its rupture');
 assert.equal(oneHitDamage({fire:1}),59);
 assert.equal(oneHitDamage({fire:2}),59);
 assert.equal(oneHitDamage({fire:2,frost:2,gale:2,lightning:2}),83,'Gale adds 1, the least a gust deals, not its 8-point heart');
 assert.equal(oneHitDamage({fire:2,frost:2,gale:2,lightning:2,steel:2}),85);
 assert.equal(oneHitDamage({steel:1}),48);
});
test('airborne requires full Gale and cannot switch forms just from a Frost or Fire infusion',()=>{
 assert.equal(oneHitForm(false,emptyInfusions()),null);
 assert.equal(oneHitForm(false,{gale:1}),null);
 assert.equal(oneHitForm(false,{gale:2}),'aerial');
 assert.equal(oneHitForm(true,emptyInfusions()),'ground');
});
test('commit consumes match infusions but preserves infinite Practice preset',()=>{
 const p={oneHitInfusions:{fire:2,frost:1,gale:0,lightning:0}};
 assert.deepEqual(oneHitCommit(p),{fire:2,frost:1,gale:0,lightning:0,steel:0});
 assert.deepEqual(p.oneHitInfusions,emptyInfusions());
 p.practiceOneHit={enabled:true,stages:ONE_HIT_PRESETS['gale-lightning']};
 assert.deepEqual(oneHitCommit(p),{fire:0,frost:0,gale:2,lightning:2,steel:0});
 assert.deepEqual(oneHitCommit(p),{fire:0,frost:0,gale:2,lightning:2,steel:0});
});
test('Shaken reduces sprint benefit instead of slowing normal walking',()=>{
 const target={};applyOneHitShaken(target,10,1);
 assert.equal(shakenSprintFactor(target.shaken,10),0);
 assert.ok(shakenSprintFactor(target.shaken,11)>0);
 assert.equal(shakenSprintFactor(target.shaken,13),1);
});
test('reactive electrical pool decays without causing passive damage',()=>{
 const st={at:0,initial:12};
 assert.equal(oneHitBacklashRemaining(st,0),12);
 assert.equal(oneHitBacklashRemaining(st,2),6);
 assert.equal(oneHitBacklashRemaining(st,5),0);
});
test('teleport reach grows forever, with diminishing increments',()=>{
 const first=oneHitTeleportDistance(1),second=oneHitTeleportDistance(2),third=oneHitTeleportDistance(3);
 assert.ok(first>0&&second>first&&third>second);
 assert.ok(second-first > third-second);
 assert.ok(oneHitTeleportDistance(100)>oneHitTeleportDistance(10));
});
test('untrusted practice values clamp to tier 0..2',()=>{
 assert.deepEqual(normalizeInfusions({fire:91,frost:-9,gale:1.9,lightning:'x'}),{fire:2,frost:0,gale:1,lightning:0,steel:0});
});

test('Full Steel last-HP floor is exact, time-limited, shared by combat and HUD',()=>{
  const p={alive:true,ultimateState:{id:'one_hit_of_wonders',phase:'startup',
    preparedTiers:{steel:2},commitAt:10}};
  assert.equal(oneHitSteelFloorActive(p,9),true);
  assert.equal(oneHitSteelFloorActive(p,10.01),false);
  p.ultimateState.teleportHoldAt=9;
  assert.equal(oneHitSteelFloorActive(p,9.5),false,'indefinite held Lightning aim is vulnerable');
  delete p.ultimateState.teleportHoldAt;
  p.ultimateState.phase='active';
  p.ultimateState.until=12;
  p.ultimateState.oneHit={tiers:{steel:2,gale:2},awaitingWave:true,waveResolved:false};
  assert.equal(oneHitSteelFloorActive(p,11.99),true,'wave still flying');
  p.ultimateState.oneHit.waveResolved=true;
  assert.equal(oneHitSteelFloorActive(p,11.99),false,'protection ends at wave resolution');
  assert.equal(oneHitSteelFloorActive(p,12.01),false,'the Ultimate is over');
  p.ultimateState.oneHit={tiers:{steel:1}};
  assert.equal(oneHitSteelFloorActive(p,11),false,'half Steel does not protect the final HP');
  p.ultimateState.oneHit={tiers:{steel:2}};
  p.ultimateState.id='sunder';
  assert.equal(oneHitSteelFloorActive(p,11),false,'only All-Natural Disaster');
  p.ultimateState.id='one_hit_of_wonders';
  p.alive=false;
  assert.equal(oneHitSteelFloorActive(p,11),false);
});

test('A four-second Half Lightning hold cannot extend the Full Steel 1-HP floor indefinitely',()=>{
  const p={alive:true,ultimateState:{id:'one_hit_of_wonders',phase:'startup',
    preparedTiers:{steel:2,lightning:1},startedAt:9,commitAt:13,
    partialLightningHoldAt:9,partialLightningReadyAt:9.36}};
  assert.equal(oneHitSteelFloorActive(p,9.5),true,'finite early bracing is protected');
  assert.equal(oneHitSteelFloorActive(p,10),false,'holding longer does not grant a four-second immunity');
  p.ultimateState.partialLightningReleased=true;
  p.ultimateState.commitAt=10.2;
  assert.equal(oneHitSteelFloorActive(p,10.1),false);
  p.ultimateState.phase='active';p.ultimateState.until=11.9;
  p.ultimateState.oneHit={tiers:{steel:2,lightning:1},form:'ground'};
  assert.equal(oneHitSteelFloorActive(p,10.3),true,'the actual committed attack restores its intended protection');
});

test('held Lightning charges suppress Sprint and Jump without locking 360-degree aim',()=>{
  const player={grounded:false,ultimateState:{id:'one_hit_of_wonders',phase:'startup',
    preparedTiers:{lightning:2,gale:2},teleportHoldAt:9,commitAt:3600009}};
  assert.equal(oneHitChargingLightning(player,10),true);
  const intent=oneHitChargeIntent({forward:1,right:1,sprint:true,jump:true,dash:true,yaw:4.5,pitch:-1.2});
  assert.equal(intent.sprint,false);
  assert.equal(intent.jump,false);
  assert.equal(intent.dash,false);
  assert.equal(intent.yaw,4.5);
  assert.equal(intent.pitch,-1.2);
  assert.ok(intent.forward>0&&intent.forward<1);
  const glide=oneHitGlide(player,7.5);
  assert.ok(glide.fallGravity>0&&glide.maxFall>0,
    'charging above terrain must descend rather than hover without time limit');
  player.ultimateState={...player.ultimateState,teleportHoldAt:undefined,
    partialLightningHoldAt:9,preparedTiers:{gale:2,lightning:1}};
  const half=oneHitGlide(player,7.5);
  assert.ok(half.fallGravity>0&&half.maxFall>0,
    'Half Lightning with Full Gale must not hover for its full hold');
});
