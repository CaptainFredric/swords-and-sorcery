import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {tryUltimate,stepRoom} from '../../shared/sim/combat.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';
import {galeFieldBluster,blusterSeverity,fieldStrength,fieldContact,
  groundFootprintRadius,groundFootprintWarp} from '../../shared/src/oneHitStatus.mjs';

const DT=1/30;
const world={floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],
  ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0}],abyssY:-10};
function fixture(){
 const room=new Room('GALE-AURA',{mode:'FFA'});room.world=world;
 room.addPlayer({id:'caster',token:'c',name:'Caster'},0);
 room.addPlayer({id:'victim',token:'v',name:'Victim'},0);
 room.setReady('caster',true,0);room.setReady('victim',true,0);room.tick(3.1);
 const caster=room.players.get('caster'),victim=room.players.get('victim');
 caster.ultimate='one_hit_of_wonders';
 caster.oneHitInfusions.gale=1;caster.prowess=100;caster.grounded=true;
 caster.position={x:0,y:0,z:0};caster.yaw=0;caster.input.yaw=0;
 victim.position={x:0,y:0,z:13};victim.spawnProtectionUntil=0;caster.spawnProtectionUntil=0;
 room.events.length=0;
 return {room,caster,victim};
}
function step(room,at,count=1){for(let i=0;i<count;i++)stepRoom(room,DT,at+i*DT,world);}
test('Half Gale field continuously inflicts Blustered without requiring the direct slam, then decays on exit',()=>{
 const {room,victim}=fixture();
 assert.equal(tryUltimate(room,'caster',9),true);
 step(room,9,33);
 const field=room.oneHitFields[0];
 assert.ok(field&&field.tiers.gale===1);
 assert.ok(!victim.blustered,'outside the real field has no phantom debuff');
 victim.position={x:0,y:0,z:-2};
 victim.velocity={x:0,y:0,z:0};victim.impulse={x:0,z:0};
 const at=10.15;
 step(room,at,2);
 assert.ok(victim.blustered,'Gale aura makes a NEW contact Blustered');
 const strength=blusterSeverity(victim.blustered,at+DT);
 assert.ok(strength>.2&&strength<1,'contact and field lifetime determine initial bluster strength');
 assert.ok(room.events.some(e=>e.type==='oneHitFieldBlustered'&&e.playerId==='victim'));
 assert.equal(room.events.some(e=>e.type==='damage'&&e.source==='one_hit_of_wonders'&&e.victimId==='victim'),false,
   'entering the aura does not fake a second decisive hit');
 victim.yaw=0;victim.input.yaw=Math.PI;victim.position={x:0,y:0,z:-2};
 step(room,at+2*DT);
 assert.ok(Math.abs(victim.yaw)<.25,'Blustered slows actual sword/Guard turning');
 victim.position={x:0,y:0,z:11};
 victim.input.yaw=0;victim.velocity={x:0,y:0,z:0};victim.impulse={x:0,z:0};
 const before=blusterSeverity(victim.blustered,at+3*DT);
 step(room,at+.7);
 const after=blusterSeverity(victim.blustered,at+.7);
 assert.ok(after<before,'Blustered runs down after exiting the aura');
 const snap=serializeSnapshot(room,at+.7,'caster');
 assert.equal(snap.players.find(p=>p.id==='victim').blustered.sourceId,'caster');
});

test('two overlapping Gale fields do not weaken the stronger direct Blustered or endlessly refresh it',()=>{
 const older={at:10,severity:.95,sourceId:'a'};
 const weak={id:'weak',ownerId:'b',position:{x:0,y:0,z:0},radius:3.4,
  yaw:0,bornAt:8,until:12,tiers:{gale:1}};
 assert.equal(galeFieldBluster(older,weak,.4,10.1),older,
  'weaker aura never overwrites direct Gale');
 const fresh=galeFieldBluster(null,weak,1,10);
 assert.ok(fresh?.fieldId==='weak');
 assert.ok(blusterSeverity(fresh,11)<blusterSeverity(fresh,10));
 assert.equal(galeFieldBluster(fresh,weak,0,10.1),fresh,
  'leaving the footprint cannot refresh the effect');
});

test('visible Fire patch and its real Full Fire hit area share exactly one elongated 4.6m geometry',()=>{
 const r=4.6,yaw=0;
 const front=groundFootprintRadius(r,yaw,0,-1);
 assert.ok(Math.abs(front-6.072)<.001);
 assert.ok(Math.abs(groundFootprintRadius(r,yaw,0,1)-r)<1e-9);
 const warp=groundFootprintWarp(0,-r,r,yaw);
 assert.ok(Math.abs(warp.z+front)<.001);
 const frontEdge={x:0,y:0,z:-front};
 assert.ok(Math.abs(fieldContact({position:{x:0,y:0,z:0},radius:r,yaw},frontEdge)-.5)<.001);
 assert.ok(groundFootprintWarp(r,0,r,yaw).x===r);
});
