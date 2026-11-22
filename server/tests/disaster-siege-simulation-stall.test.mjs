// Reproduces the authoritative freeze: after a Gale Disaster wave, the first
// contact test against a siege chassis used {x,y,z} where the OBB math expects
// [x,y,z]. That TypeError aborted all subsequent simulation ticks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {stepRoom} from '../../shared/sim/combat.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';
import {createBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {createSoFistication} from '../../shared/sim/soFistication.mjs';

const world={
 floors:[{id:'ground',center:[0,-.1,0],size:[160,.2,160],y:0}],
 solids:[],ramps:[],spawnPoints:[{x:0,y:0,z:0,yaw:-Math.PI/2}],
 abyssY:-20,
};
const machines=[
 ['Ballistefan and the actual Bi-Bye-llista', 'biByeLlista',
  ()=>createBiByeLlista({id:'hostile-ballista',x:7,y:0,z:0,baseYaw:0})],
 ['Mr. Donte Shoot and Fight-and-Flight', 'fightFlight',
  ()=>createFightFlight({id:'hostile-flight',x:7,y:0,z:0,heading:0})],
 ['Sir Uppercuff and SO-FIST-ICATION', 'soFistication',
  ()=>createSoFistication({id:'hostile-ram',x:7,y:0,z:0,heading:0})],
];

for(const [name,field,build] of machines){
 test('All-Natural Disaster does not freeze the room after hitting '+name,()=>{
  const room=new Room('contact-'+field,{mode:'PRACTICE',worldId:'castleward'});
  room.world=structuredClone(world);
  const caster=room.addPlayer({id:'caster',token:'caster',name:'Caster'},0);
  room.state='PLAYING';
  caster.ultimate='one_hit_of_wonders';
  caster.position={x:0,y:0,z:0};
  caster.spawnProtectionUntil=0;
  const m=build();
  room[field]=m;
  // The travelling projectile is the continuation of the grounded slam.
  // Its origin and endpoint use authoritative world-coordinate objects.
  room.oneHitWaves=[{id:'gale-slam-'+field,ownerId:caster.id,
   position:{x:0,y:1.15,z:0},direction:{x:1,y:0,z:0},
   tiers:{fire:0,frost:0,gale:2,lightning:0,steel:0},
   distance:0,bornAt:9,hitIds:[],fromGround:true,launchYaw:-Math.PI/2}];
  for(let frame=0;frame<45;frame++){
   const now=9+frame/30;
   assert.doesNotThrow(()=>stepRoom(room,1/30,now,room.world),
    name+' must never throw during projectile collision or its explosion');
   const snap=serializeSnapshot(room,now);
   assert.ok(snap.players.some(p=>p.id===caster.id),
    'authoritative snapshots still contain the moving player');
   assert.ok(Number.isFinite(m.x)&&Number.isFinite(m.y)&&Number.isFinite(m.z));
  }
  assert.ok(room.events.some(e=>e.type==='oneHitImpact'&&e.cause==='machine'),
   name+' resolves the wave at real hardware, rather than merely skipping collision');
  assert.equal(room.oneHitWaves.length,0);
  assert.equal(room.tickNumber,45,
   'the authoritative simulation keeps advancing after the impact');
 });
}

test('Gale Disaster wave without any siege machine also stays live',()=>{
 const room=new Room('contact-empty',{mode:'PRACTICE',worldId:'castleward'});
 room.world=structuredClone(world);
 const caster=room.addPlayer({id:'caster',token:'caster',name:'Caster'},0);
 room.state='PLAYING';caster.spawnProtectionUntil=0;
 room.oneHitWaves=[{id:'empty-gale',ownerId:caster.id,
  position:{x:0,y:1.15,z:0},direction:{x:1,y:0,z:0},
  tiers:{fire:0,frost:0,gale:2,lightning:0,steel:0},
  distance:0,bornAt:9,hitIds:[],fromGround:true,launchYaw:-Math.PI/2}];
 for(let frame=0;frame<35;frame++)
  assert.doesNotThrow(()=>stepRoom(room,1/30,9+frame/30,room.world));
 assert.equal(room.tickNumber,35);
 assert.ok(room.events.some(e=>e.type==='oneHitImpact'&&e.cause==='range'));
});
