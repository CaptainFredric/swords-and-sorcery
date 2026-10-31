import test from 'node:test';import assert from 'node:assert/strict';
import {createFightFlight,mountFightFlight} from '../../shared/sim/fightFlight.mjs';
import {advanceFlightAmmo,requestFightFlightFire,stepFightFlightWeapons,stepFightFlightProjectiles,FLIGHT_REPEATER} from '../../shared/sim/fightFlightWeapons.mjs';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';

function setup(){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.world={solids:[],ramps:[],floors:[{id:'floor',center:[0,-.1,0],size:[100,.2,100],y:0}],spawnPoints:[{x:0,y:0,z:0}],abyssY:-30};
 room.state='PLAYING';room.events=[];room.fightFlightProjectiles=new Map();
 const p=room.addPlayer({id:'pilot',token:'pilot',name:'Pilot'},0);
 const m=createFightFlight({x:0,y:0,z:0,id:'flight-1'});
 room.fightFlight=m;p.position={x:0,y:0,z:1};p.yaw=0;p.input={yaw:0,pitch:0};
 assert.equal(mountFightFlight(room,m,p),true);
 return {room,p,m};
}
test('2/s fractional production repays true debt before storing an available bolt',()=>{
 const m=createFightFlight();m.ammo=0;m.ammoDebt=3;
 for(let i=0;i<15;i++)advanceFlightAmmo(m,1/30);
 assert.equal(m.ammoDebt,2);assert.equal(m.ammo,0);
 for(let i=0;i<30;i++)advanceFlightAmmo(m,1/30);
 assert.equal(m.ammoDebt,0);assert.equal(m.ammo,0);
 for(let i=0;i<15;i++)advanceFlightAmmo(m,1/30);
 assert.equal(m.ammo,1);assert.ok(Math.abs(m.ammoProduction)<1e-8);
 m.ammo=14;advanceFlightAmmo(m,3);assert.equal(m.ammo,14);assert.equal(m.ammoProduction,0);
});
test('Held repeater fires at most seven actual physical bolts per second, never double-spends ammo',()=>{
 const {room,p,m}=setup();
 assert.equal(requestFightFlightFire(room,m,p,true,1),true);
 assert.equal(m.ammo,13);assert.equal(room.fightFlightProjectiles.size,1);
 assert.equal(requestFightFlightFire(room,m,p,true,1),true);
 assert.equal(m.ammo,13,'second same-clock press cannot release another bolt');
 for(let i=1;i<=30;i++)stepFightFlightWeapons(room,m,1/30,1+i/30);
 assert.equal(room.fightFlightProjectiles.size,8,'initial release plus seven subsequent releases through one second');
 assert.equal(m.ammo,8,'eight fired less two passively regenerated');
 assert.ok(m.ammo>=0&&m.ammo<=14);
 requestFightFlightFire(room,m,p,false,2.1);
 for(let i=1;i<=90;i++)stepFightFlightWeapons(room,m,1/30,2.1+i/30);
 assert.equal(room.fightFlightProjectiles.size,8,'releasing trigger stops actual projectile creation');
});
test('ordinary bolts traverse real space, deal close-range raw damage and stop at masonry',()=>{
 const {room,p,m}=setup();
 const enemy=room.addPlayer({id:'enemy',token:'enemy',name:'Enemy'},0);
 enemy.position={x:-.65,y:0,z:-4};enemy.spawnProtectionUntil=0;enemy.guarding=false;
 assert.equal(requestFightFlightFire(room,m,p,true,1),true);
 requestFightFlightFire(room,m,p,false,1.01);
 for(let i=1;i<12;i++)stepFightFlightProjectiles(room,1/30,1+i/30);
 assert.ok(enemy.health<100,'swept bolt must strike the actual enemy cylinder');
 assert.equal(room.fightFlightProjectiles.size,0);
 const oldHealth=enemy.health;
 room.world.solids=[{id:'stone',center:[-.65,1.3,-2],size:[2,2.6,.35]}];
 requestFightFlightFire(room,m,p,true,1.5);
 requestFightFlightFire(room,m,p,false,1.51);
 for(let i=1;i<12;i++)stepFightFlightProjectiles(room,1/30,1.5+i/30);
 assert.equal(enemy.health,oldHealth,'masonry blocks a line-of-fire bolt');
 assert.ok(room.events.some(x=>x.type==='fightFlightBoltImpact'&&x.hitKind==='wall'));
});
test('real forward and vertical Guard region protects torso, not exposed legs',()=>{
 const {room,p,m}=setup();
 const foe=room.addPlayer({id:'defender',token:'defender',name:'Defender'},0);
 foe.position={x:-.65,y:0,z:-4};foe.spawnProtectionUntil=0;foe.guarding=true;foe.guardStamina=100;foe.yaw=Math.PI;
 requestFightFlightFire(room,m,p,true,1);requestFightFlightFire(room,m,p,false,1.01);
 for(let i=1;i<12;i++)stepFightFlightProjectiles(room,1/30,1+i/30);
 assert.equal(foe.health,100);assert.ok(foe.guardStamina<100,'defended contact must cost stamina');
 p.input.pitch=-.19;
 requestFightFlightFire(room,m,p,true,1.6);requestFightFlightFire(room,m,p,false,1.61);
 for(let i=1;i<12;i++)stepFightFlightProjectiles(room,1/30,1.6+i/30);
 assert.ok(foe.health<100,'exposed leg cannot be protected by a global Guard bubble');
});
test('unmounted foreign operator cannot fire or counterfeit ammo; projectiles replicate',()=>{
 const {room,p,m}=setup();
 const other=room.addPlayer({id:'impostor',token:'imp',name:'Impostor'},0);
 assert.ok(applyRoomCommand(room,other,{type:'fightFlightFire',down:true,ammo:999},1).rejected);
 assert.equal(m.ammo,14);
 assert.deepEqual(applyRoomCommand(room,p,{type:'fightFlightFire',down:true,ammo:999},1),{});
 assert.equal(m.ammo,13);
 const snap=serializeSnapshot(room,1);
 assert.equal(snap.fightFlight.ammo,13);
 assert.equal(snap.fightFlightProjectiles.length,1);
 assert.ok(snap.fightFlightProjectiles[0].velocity.z<0);
});
