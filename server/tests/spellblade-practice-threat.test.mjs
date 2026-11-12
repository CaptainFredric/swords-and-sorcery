import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {spawnPracticeDummy,setPracticeDummyMode} from '../../shared/sim/practice.mjs';
import {BOT_SKILLS} from '../../shared/sim/botSkill.mjs';
import {activeHitboxThreat} from '../../shared/sim/activeHitboxThreat.mjs';
import {seekSpellbladeSiegeMachine} from '../../shared/sim/practiceSiegeOperators.mjs';

const world={floors:[{id:'floor',center:[0,-.1,0],size:[80,.2,80],y:0}],
  ramps:[],solids:[],abyssY:-9,
  spawnPoints:[{x:0,y:0,z:0,yaw:0},{x:5,y:0,z:0,yaw:0}]};
function practice(){
  const room=new Room('MASTER',{mode:'PRACTICE'});
  room.world=world;
  const human=room.addPlayer({id:'human',token:'h',name:'Player'},0);
  room.startMatch(0);human.connected=true;human.position={x:13,y:0,z:0};
  const dummy=spawnPracticeDummy(room,'SPELLBLADE',0);
  dummy.position={x:0,y:0,z:0};dummy.grounded=true;
  return {room,human,dummy};
}
test('Practice Spellblade has the top intelligence and normal attributes with no privileged combat stats',()=>{
  const {room,human,dummy}=practice();
  assert.equal(dummy.name,'The Spellblade');
  assert.equal(dummy.botSkill,'spellblade');
  assert.equal(dummy.botProfile,'spellblade');
  assert.equal(BOT_SKILLS.spellblade.activeRead,true);
  assert.equal(dummy.health,100);
  assert.equal(dummy.guardStamina,human.guardStamina);
  assert.equal(dummy.ultimate,'sunder');
  for(const stat of ['damage','health','speed','cooldown','armor','invulnerable'])
    assert.equal(BOT_SKILLS.spellblade[stat],undefined);
  assert.equal(setPracticeDummyMode(room,'FIGHTS_BACK',1),true);
  assert.equal(dummy.botSkill,'knight','switching Practice opponent restores ordinary intelligence');
});
test('Top-tier bot detects the physical Vortex blade and wave, not future button intentions',()=>{
  const {room,human,dummy}=practice();
  const now=5;
  human.position={x:2,y:0,z:0};
  assert.equal(activeHitboxThreat(room,dummy,human,now),null);
  human.ultimateState={id:'vortex',phase:'active',angle:0,angleAt:now,rate:12,until:now+3};
  const vortex=activeHitboxThreat(room,dummy,human,now);
  assert.equal(vortex?.kind,'vortex');
  assert.ok(vortex?.x<0,'it moves away from the observed spinning blade');
  human.ultimateState=null;
  // An unrelated wave first in the list must not blind the observer.
  room.oneHitWaves=[
    {ownerId:'irrelevant',position:{x:1,y:1,z:0},direction:{x:1,y:0,z:0},tiers:{}},
    {ownerId:'human',position:{x:-3,y:1,z:0},direction:{x:1,y:0,z:0},tiers:{fire:1,lightning:1}},
  ];
  dummy.position={x:0,y:0,z:.8};
  const wave=activeHitboxThreat(room,dummy,human,now);
  assert.equal(wave?.kind,'wave','incoming wave belongs to the human, not unrelated cast');
  assert.ok(Math.hypot(wave.x,wave.z)>.99);
});
test('Spellblade forecasts only advancing live Sunder cracks, not dead cracks or unseen futures',()=>{
  const {room,human,dummy}=practice();
  human.position={x:0,y:0,z:0};
  dummy.position={x:0,y:0,z:6.5};dummy.grounded=true;
  const fissure={dir:{x:0,z:1},length:7,core:4,level:0};
  const rupture={ownerId:human.id,bornAt:5,origin:{x:0,y:0,z:0},
    reached:0,fissures:[fissure],caught:[]};
  room.ruptures=[rupture];
  assert.equal(activeHitboxThreat(room,dummy,human,5),null,
    'a fissure is visible but has not yet advanced close enough');
  const threat=activeHitboxThreat(room,dummy,human,5.18);
  assert.equal(threat?.kind,'rupture','fissure is advancing toward our feet');
  assert.ok(Math.abs(threat.x)>.99,'sidestep perpendicular to line, not flee down it');
  assert.equal(activeHitboxThreat(room,dummy,human,6),null,
    'once the head has passed it is not a repeating damage hitbox');
  rupture.caught.push(dummy.id);
  assert.equal(activeHitboxThreat(room,dummy,human,5.18),null,
    'an already struck actor does not foresee another strike from the same rupture');
});
test('Practice Spellblade can claim only an EXISTING, abandoned, suitable siege machine',()=>{
  const {room,human,dummy}=practice();
  human.position={x:30,y:0,z:0};dummy.position={x:0,y:0,z:0};
  const existing={id:'kept-machine',x:5,y:0,z:0,heading:0,mode:'MOBILE',
    operatorId:null,health:100};
  room.biByeLlista=existing;
  assert.equal(seekSpellbladeSiegeMachine(room,dummy,3),true);
  assert.equal(room.biByeLlista,existing,'no machinery is created');
  assert.deepEqual(dummy.practiceSiegeOperator,
    {machine:'bi-bye-llista',difficulty:'formidable',opportunistic:true});
  assert.equal(dummy.health,100);
  assert.equal(dummy.botSkill,'spellblade');
  assert.equal(room.events.filter(e=>e.type==='spellbladeSiegeIntent').length,1);
  const alreadyUsed=practice();
  alreadyUsed.room.biByeLlista={...existing,operatorId:'someone-else'};
  alreadyUsed.human.position={x:30,y:0,z:0};
  assert.equal(seekSpellbladeSiegeMachine(alreadyUsed.room,alreadyUsed.dummy,3),false);
  assert.equal(alreadyUsed.dummy.practiceSiegeOperator,undefined);
});
