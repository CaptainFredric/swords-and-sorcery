import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {createStructureState,structureDefinitions,damageStructure,
 structureWorld,stepStructureRestoration} from '../../shared/sim/structures.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';

function scene(){
 const room=new Room('BLUE_REBUILD',{mode:'PRACTICE'});
 room.state='PLAYING';
 room.world={
  id:'blue-rebuild-test',
  floors:[{id:'ground',y:0,center:[0,-.1,0],size:[100,.2,100]}],
  ramps:[],solids:[
   {id:'cover-barrel-stack',center:[0,.8,0],size:[2,1.6,1],material:'timber'},
   {id:'cover-stone-crate',center:[7,1,0],size:[2,2,1],material:'stone'},
   {id:'gate-permanent',center:[12,2,0],size:[1,4,3],material:'timber'},
  ],structures:[
   {id:'the-gate',name:'Permanent Objective Gate',profile:'reinforcedTimber',
    solidIds:['gate-permanent']},
  ],
  spawnPoints:[{x:-15,y:0,z:0}],abyssY:-30,
 };
 room.structures=createStructureState(room.world);
 const attacker=room.addPlayer({id:'builder',token:'builder',name:'Builder'},0);
 attacker.position={x:-15,y:0,z:0};attacker.spawnProtectionUntil=0;
 return {room,attacker};
}

test('siege breaks authored-size timber cover; server disables its collider, then magic rebuilds at 18s',()=>{
 const {room,attacker}=scene();
 assert.equal(structureDefinitions(room.world).filter(d=>d.transient).length,1);
 assert.equal(room.structures.entities['reforming-cover-barrel-stack'].health,240);
 assert.equal(damageStructure(room,'reforming-cover-barrel-stack',240,attacker.id,'ram-charge',1,{raw:true}),true);
 assert.equal(room.structures.entities['reforming-cover-barrel-stack'].destroyedAt,1);
 assert.equal(room.world.solids.some(s=>s.id==='cover-barrel-stack'),false,
  'broken cover must be absent from authoritative movement and projectile geometry');
 assert.equal(room.world.solids.some(s=>s.id==='cover-stone-crate'),true);
 assert.equal(stepStructureRestoration(room,18.99),0);
 assert.equal(stepStructureRestoration(room,19),1);
 assert.equal(room.structures.entities['reforming-cover-barrel-stack'].health,240);
 assert.equal(room.structures.entities['reforming-cover-barrel-stack'].rebuiltAt,19);
 assert.equal(room.world.solids.some(s=>s.id==='cover-barrel-stack'),true);
 assert.equal(room.events.filter(e=>e.type==='structureRebuilt'&&e.blueMagic).length,1);
 assert.equal(serializeSnapshot(room,19).structures.entities['reforming-cover-barrel-stack'].rebuiltAt,19);
});

test('the blue rebuilding enchantment refuses to spawn solid cover inside a living player or machine',()=>{
 const {room,attacker}=scene();
 damageStructure(room,'reforming-cover-barrel-stack',240,attacker.id,'so-fist',.2,{raw:true});
 attacker.position={x:0,y:0,z:0};
 assert.equal(stepStructureRestoration(room,18.21),0);
 attacker.position={x:-10,y:0,z:0};
 room.soFistication={id:'ram',x:0,y:0,z:0,health:1400,retired:false};
 assert.equal(stepStructureRestoration(room,18.5),0);
 room.soFistication=null;
 assert.equal(stepStructureRestoration(room,18.6),1);
 assert.ok(room.world.solids.some(s=>s.id==='cover-barrel-stack'));
});

test('objective gates and stone foundations remain permanent regardless of waiting or siege damage',()=>{
 const {room,attacker}=scene();
 assert.equal(room.structures.entities['reforming-cover-stone-crate'],undefined);
 damageStructure(room,'the-gate',900,attacker.id,'so-fist',1,{raw:true});
 assert.equal(room.world.solids.some(s=>s.id==='gate-permanent'),false);
 assert.equal(stepStructureRestoration(room,1000),0,
   'an objective breach must never be reversed by the scenery enchantment');
 assert.equal(room.structures.entities['the-gate'].health,0);
});

test('world variants and repeated destruction maintain stable authoritative collision',()=>{
 const {room,attacker}=scene();
 const initial=room.world;
 assert.ok(damageStructure(room,'reforming-cover-barrel-stack',240,attacker.id,'so-fist',1,{raw:true}));
 const destroyed=room.world;
 assert.equal(structureWorld(initial,room.structures),destroyed);
 assert.equal(stepStructureRestoration(room,19),1);
 assert.equal(room.world,initial);
 assert.ok(damageStructure(room,'reforming-cover-barrel-stack',240,attacker.id,'so-fist',20,{raw:true}));
 assert.equal(room.world, destroyed,'the same cover set reuses cached world geometry');
 assert.equal(room.structures.entities['reforming-cover-barrel-stack'].destroyedAt,20);
});
