import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyInfusions,creditOneHitEncounter,oneHitCommit,oneHitForm,oneHitDamage,
  applyOneHitShaken,shakenSprintFactor,oneHitBacklashRemaining,oneHitTeleportDistance,normalizeInfusions,
  ONE_HIT_PRESETS} from './oneHitInfusions.mjs';
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
