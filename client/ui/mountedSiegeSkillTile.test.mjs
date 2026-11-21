import test from 'node:test';
import assert from 'node:assert/strict';
import {mountedSiegeSkillTile} from './mountedSiegeSkillTile.mjs';

test('ram mounted U tile displays the actual HELLping hand state and full cooldown',()=>{
 const local={alive:true,operatingRamId:'ram'};
 const b={id:'ram',health:1000,skill:{id:'hellpingHand',phase:'active',readyAt:0},
  hellping:{phase:'open'}};
 let tile=mountedSiegeSkillTile(local,{soFistication:b},12);
 assert.equal(tile.name,'HELLPING HAND');
 assert.equal(tile.icon,'hellpingHand');
 assert.equal(tile.state,'PALM OPEN');
 assert.equal(tile.active,true);
 assert.equal(tile.total,24);
 b.hellping={phase:'vault'};
 tile=mountedSiegeSkillTile(local,{soFistication:b},12);
 assert.equal(tile.state,'HOPPING');
 b.hellping=null;b.skill.phase='idle';b.skill.readyAt=44;
 tile=mountedSiegeSkillTile(local,{soFistication:b},29);
 assert.equal(tile.remaining,15);
 assert.equal(tile.state,'COOLDOWN');
 assert.equal(tile.active,false);
});
test('ballista and Flight have distinct U icon/name with server-owned state',()=>{
 const ballista={id:'bow',health:800,skill:{id:'lookAroundAndFindOut',phase:'active',readyAt:30},
  sweep:{kind:'skill',phase:'spinning'}};
 const bow=mountedSiegeSkillTile({alive:true,operatingBallistaId:'bow'},{bibyeBallista:ballista},12);
 assert.equal(bow.name,'LOOK AROUND');assert.equal(bow.icon,'siegeSweep');
 assert.equal(bow.state,'ACTIVE');
 const f={id:'flight',health:900,skill:{id:'fireAwayImRightHere',phase:'active',readyAt:40}};
 const fly=mountedSiegeSkillTile({alive:true,operatingFightFlightId:'flight'},{fightFlight:f},12);
 assert.equal(fly.name,'FIRE AWAY');assert.equal(fly.icon,'fireAway');assert.equal(fly.state,'ACTIVE');
 assert.equal(mountedSiegeSkillTile({alive:true},{},12),null);
});
