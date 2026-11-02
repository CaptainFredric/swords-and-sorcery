import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {createFightFlight} from '../../shared/sim/fightFlight.mjs';
import {damageFightFlight} from '../../shared/sim/fightFlightComponents.mjs';
import {createBiByeLlista,damageBiByeLlista,BI_BYE_LLISTA_CONFIG} from '../../shared/sim/biByeLlista.mjs';
import {createSoFistication,damageSoFistication,SO_FIST} from '../../shared/sim/soFistication.mjs';
import {SO_FIST_PISTON} from '../../shared/src/soFistPiston.mjs';
import {STEEL_DAMAGE_RANGES,steelStrength,STEEL} from '../../shared/src/steel.mjs';
import {tryCastSpell,tryCastOrGauntlet,castPreparedSpell} from '../../shared/sim/combat.mjs';
import {applyRoomCommand,serializeSnapshot} from '../../shared/sim/wire.mjs';
import {stepSiegeSteel,beginSiegeSteel,machineSteelParts,SIEGE_STEEL_REFERENCES} from '../../shared/sim/siegeSteel.mjs';

function setup(kind='flight'){
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';
 room.world={floors:[{id:'floor',center:[0,-.1,0],size:[200,.2,200],y:0}],
   ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}],abyssY:-30};
 const p=room.addPlayer({id:'steel-caster',token:'steel',name:'Caster'},0);
 p.position={x:0,y:0,z:0};p.spawnProtectionUntil=0;p.spell='steel';p.staggerUntil=-Infinity;
 const m=kind==='flight'?createFightFlight({id:'steel-flight'})
   :kind==='bibye'?createBiByeLlista({id:'steel-ballista'}):createSoFistication({id:'steel-ram'});
 const key=kind==='flight'?'fightFlight':kind==='bibye'?'biByeLlista':'soFistication';
 const field=kind==='flight'?'operatingFightFlightId':kind==='bibye'?'operatingBallistaId':'operatingRamId';
 room[key]=m;m.operatorId=p.id;p[field]=m.id;
 return {room,p,m,key,field,kind};
}
function cast({room,p},now=1){
 assert.equal(tryCastSpell(room,p.id,{x:0,y:0,z:-1},now),true);
 assert.ok(p.steel,'personal Steel is not replaced by mounted machine Steel');
}
function heal({room,m},now=1){
 stepSiegeSteel(room,m,now+5);
 stepSiegeSteel(room,m,now+10);
}
const sum=parts=>parts.reduce((n,p)=>n+p.health,0);

test('Fight-and-Flight reserves 11 bonus HP until ward expiry while earning 19 HP during hardening',()=>{
 const x=setup();x.m.health=175;
 cast(x);
 stepSiegeSteel(x.room,x.m,1);
 assert.equal(x.m.health,175,'there is no instant restoration on spell cast');
 stepSiegeSteel(x.room,x.m,3.5);
 assert.ok(Math.abs(x.m.health-(175+9.5))<1e-6,'minimum phase is time-proportional');
 stepSiegeSteel(x.room,x.m,6);
 assert.ok(Math.abs(x.m.health-194)<1e-6,'full phase gives 19 HP');
 stepSiegeSteel(x.room,x.m,8.5);
 assert.ok(Math.abs(x.m.health-194)<1e-6,'no conditional restoration before expiry');
 assert.equal(x.m.siegeSteel.bonusHealed,0);
 stepSiegeSteel(x.room,x.m,11);
 assert.ok(Math.abs(x.m.health-205)<1e-6);
 assert.ok(Math.abs(x.m.siegeSteel.healed-30)<1e-6);
 stepSiegeSteel(x.room,x.m,11);
 assert.ok(Math.abs(x.m.health-205)<1e-6,'duplicate tick never heals twice');
 assert.equal(x.m.siegeSteel.state,'expired');
});
test('ward prevents 7 sword damage and permits at most 23 actual repair',()=>{
 const x=setup();x.m.health=150;cast(x);
 const before=x.m.health;
 const hit=damageFightFlight(x.room,x.m,26,null,'sword',2,{componentId:'main'});
 assert.equal(hit.damage,19);assert.equal(hit.turned,7);
 assert.equal(x.m.siegeSteel.bonusPrevented,7);
 assert.ok(Math.abs(x.m.health-(before+19/5-19))<1e-7,'one second of guaranteed repair accrues before the hit');
 heal(x);
 assert.ok(Math.abs(x.m.siegeSteel.healed-23)<1e-6);
 assert.ok(Math.abs(x.m.health-(before-19+23))<1e-6);
 assert.equal(x.room.events.filter(e=>e.type==='siegeSteelBlocked').length,1);
});
test('a strong sword strike exhausts the full 11 HP bonus without touching guaranteed 19 HP',()=>{
 const x=setup();x.m.health=150;cast(x);
 const hit=damageFightFlight(x.room,x.m,30,null,'sword',2,{componentId:'main'});
 assert.equal(hit.damage,19);
 assert.equal(x.m.siegeSteel.bonusPrevented,11);
 heal(x);
 assert.ok(Math.abs(x.m.siegeSteel.baselineHealed-19)<1e-6);
 assert.equal(x.m.siegeSteel.bonusHealed,0);
});
test('damaged eligible components share one budget with critically damaged rotor prioritized',()=>{
 const x=setup();x.m.rotorHP=9;x.m.braceLHP=18;x.m.health=150;
 const before=sum(machineSteelParts(x.m,'flight'));cast(x);heal(x);
 const after=sum(machineSteelParts(x.m,'flight'));
 assert.ok(Math.abs(after-before-30)<1e-6);
 assert.ok(x.m.rotorHP>=39,'critical rotor receives restoration first');
 assert.equal(x.m.braceLHP,18,'no second full budget on brace');
});
test('zero-health rotor and braces stay broken; healthy components never overheal',()=>{
 const x=setup();x.m.health=249;x.m.rotorHP=0;x.m.braceLHP=0;x.m.braceRHP=80;
 cast(x);heal(x);
 assert.equal(x.m.health,250);
 assert.equal(x.m.rotorHP,0);assert.equal(x.m.braceLHP,0);assert.equal(x.m.braceRHP,80);
 assert.ok(x.m.siegeSteel.healed<=1.0000001);
 const y=setup();cast(y);heal(y);
 assert.equal(y.m.siegeSteel.healed,0);
});
test('Bi-Bye-llista uses actual heavy bolt 55–85 and includes wheels and stabilizers',()=>{
 const x=setup('bibye');x.m.health=350;
 assert.equal(SIEGE_STEEL_REFERENCES.bibye.minimum,STEEL_DAMAGE_RANGES['bibye-siege'].min);
 assert.equal(SIEGE_STEEL_REFERENCES.bibye.maximum,BI_BYE_LLISTA_CONFIG.shotII.directDamage);
 const all=machineSteelParts(x.m,'bibye');
 assert.equal(all.find(c=>c.id==='hull').maxHealth,650);
 assert.ok(all.some(c=>c.id.toLowerCase().includes('wheel')));
 assert.ok(all.some(c=>c.id.toLowerCase().includes('stabilizer')));
 cast(x);heal(x);
 assert.ok(Math.abs(x.m.health-435)<1e-6);
 assert.ok(Math.abs(x.m.siegeSteel.healed-85)<1e-6);
});
test('SO-FIST-ICATION repairs 90–120 from its armored piston, not a nine-point gauntlet',()=>{
 const x=setup('ram');x.m.health=950;
 assert.equal(SIEGE_STEEL_REFERENCES.ram.minimum,SO_FIST_PISTON.minimum);
 assert.equal(SIEGE_STEEL_REFERENCES.ram.maximum,SO_FIST_PISTON.maximum);
 assert.equal(SO_FIST.piston.maximum,120);
 assert.equal(machineSteelParts(x.m,'ram').find(p=>p.id==='hull').maxHealth,1400);
 assert.equal(machineSteelParts(x.m,'ram').find(p=>p.id==='Fist').maxHealth,500);
 assert.equal(machineSteelParts(x.m,'ram').find(p=>p.id==='Drive').maxHealth,250);
 assert.equal(machineSteelParts(x.m,'ram').filter(p=>/^Wheel/i.test(p.id)).length,4);
 cast(x);heal(x);
 assert.equal(x.m.siegeSteel.healed,120);
 assert.equal(x.m.health,1070);
});
test('ram Fist material mitigation is applied before temporary ward accounting',()=>{
 const x=setup('ram');x.m.components.Fist.health=400;cast(x);
 const before=x.m.components.Fist.health;
 assert.equal(damageSoFistication(x.room,x.m,30,null,'sword',2,{componentId:'Fist'}),true);
 assert.equal(x.m.components.Fist.health,before+90/5-19,'the guaranteed ram repair precedes Fist material mitigation');
 assert.equal(x.m.siegeSteel.bonusPrevented,0,'inherent armor did not spend magic');
});
test('innate Fight-and-Flight Steel cannot be double-counted or reset by cast',()=>{
 const x=setup();x.m.rotorHP=70;cast(x);
 const h=damageFightFlight(x.room,x.m,30,null,'sword',2,{componentId:'rotor'});
 assert.equal(h.damage,0,'pre-existing rotor armor continues to work');
 assert.equal(x.m.siegeSteel.bonusPrevented,0,'identical protection is not counted twice');
});
test('destroyed machine rejects casts, and death permanently terminates an active ward',()=>{
 const x=setup();x.m.health=50;cast(x);
 damageFightFlight(x.room,x.m,500,null,'sword',2,{componentId:'main'});
 assert.equal(x.m.health,0);
 assert.equal(x.m.siegeSteel.state,'expired');
 const before=x.m.health;stepSiegeSteel(x.room,x.m,15);
 assert.equal(x.m.health,before);
 assert.equal(beginSiegeSteel(x.room,x.m,'flight',x.p,25),false);
});
test('machine effect persists across dismount and pilot swap but cannot be duplicated',()=>{
 const x=setup();x.m.health=180;cast(x);
 x.m.operatorId=null;x.p[x.field]=null;
 const other=x.room.addPlayer({id:'later-pilot',token:'other',name:'Other'},0);
 other.spell='steel';other.spawnProtectionUntil=0;other.position={x:0,y:0,z:1};
 other[x.field]=x.m.id;x.m.operatorId=other.id;
 assert.equal(tryCastSpell(x.room,other.id,{x:0,y:0,z:-1},2),false);
 assert.equal(x.m.siegeSteel.operatorId,x.p.id);
 stepSiegeSteel(x.room,x.m,5);
 assert.ok(x.m.health>180,'ward keeps restoring after original operator leaves');
 assert.equal(x.room.events.filter(e=>e.type==='siegeSteelOn').length,1);
});
test('mounted casting authorization checks valid operator and rejects other ordinary spells',()=>{
 const x=setup();
 assert.deepEqual(applyRoomCommand(x.room,x.p,{type:'cast'},1),{});
 assert.ok(x.m.siegeSteel);
 const y=setup();y.p.spell='fireball';
 assert.deepEqual(applyRoomCommand(y.room,y.p,{type:'cast'},1),{});
 assert.equal(y.p.pendingSpell,null);assert.equal(y.m.siegeSteel,undefined);
 assert.equal(tryCastSpell(y.room,y.p.id,{x:0,y:0,z:-1},1),false);
 const z=setup();z.m.operatorId='someone-else';
 assert.deepEqual(applyRoomCommand(z.room,z.p,{type:'cast'},1),{});
 assert.equal(z.p.steel,null);
});
test('mounted Steel cooldown does not fall back to a gauntlet attack',()=>{
 const x=setup();x.room.mode='FREE_FOR_ALL';cast(x);
 const before=x.room.events.length;
 assert.equal(tryCastOrGauntlet(x.room,x.p.id,{x:0,y:0,z:-1},2),false);
 assert.equal(x.p.gauntlet,null);
 assert.equal(x.room.events.slice(before).filter(e=>e.type==='gauntletSwing').length,0);
});
test('prepared Steel is legal only as a selected Chivalry spell, never a forged prepared identity',()=>{
 const x=setup();x.p.spell='fireball';x.p.preparedSpells=['fireball','steel','gale'];
 x.p.ultimate='chivalry';x.p.ultimateState={id:'chivalry',phase:'active',until:50};
 assert.equal(castPreparedSpell(x.room,x.p.id,'steel',{x:0,y:0,z:-1},2),true);
 assert.ok(x.m.siegeSteel);assert.ok(x.p.steel);
 const y=setup();y.p.spell='fireball';y.p.preparedSpells=['fireball','gale','frostfire'];
 y.p.ultimate='chivalry';y.p.ultimateState={id:'chivalry',phase:'active',until:50};
 assert.equal(castPreparedSpell(y.room,y.p.id,'steel',{x:0,y:0,z:-1},2),false);
 assert.equal(y.m.siegeSteel,undefined);
});
test('Steel machine state, timed restoration and mitigated hits replicate to both recipients',()=>{
 const x=setup('bibye');x.m.health=400;cast(x);
 const visitor=x.room.addPlayer({id:'visitor',token:'visitor',name:'Visitor'},0);
 visitor.spawnProtectionUntil=0;
 const hit=damageBiByeLlista(x.room,x.m,85,visitor.id,'bibye-siege',2,{componentId:'hull'});
 assert.equal(hit,true);
 assert.equal(x.m.siegeSteel.blockedDamage,30);
 stepSiegeSteel(x.room,x.m,5);
 const a=serializeSnapshot(x.room,5,x.p.id),b=serializeSnapshot(x.room,5,visitor.id);
 assert.deepEqual(a.bibyeBallista.siegeSteel,b.bibyeBallista.siegeSteel);
 assert.equal(a.bibyeBallista.health,b.bibyeBallista.health);
 assert.ok(x.room.events.some(e=>e.type==='siegeSteelRepair'));
 assert.ok(x.room.events.some(e=>e.type==='siegeSteelBlocked'));
});
test('first-hit extension lengthens protection but not the ten-second repair budget',()=>{
 const x=setup();x.m.health=100;cast(x);
 damageFightFlight(x.room,x.m,25,null,'sword',5.9,{componentId:'main'});
 assert.ok(x.m.siegeSteel.steel.fullUntil>6);
 assert.ok(x.m.siegeSteel.protectionUntil>11);
 stepSiegeSteel(x.room,x.m,11);
 const healed=x.m.siegeSteel.healed;
 stepSiegeSteel(x.room,x.m,12);
 assert.equal(x.m.siegeSteel.healed,healed);
 assert.ok(steelStrength(x.m.siegeSteel.steel,11.2)>0);
 stepSiegeSteel(x.room,x.m,14);
 assert.equal(x.m.siegeSteel.state,'expired');
});

test('first-hit extension delays bonus payout and continues consuming its reserve',()=>{
 const x=setup();cast(x);
 // A first hit just before hardening ends gives Steel a longer protective tail.
 damageFightFlight(x.room,x.m,25,null,'sword',5.9,{componentId:'main'});
 stepSiegeSteel(x.room,x.m,11);
 assert.equal(x.m.siegeSteel.state,'active');
 const previous=x.m.siegeSteel.healed;
 const hit=damageFightFlight(x.room,x.m,30,null,'sword',11.3,{componentId:'main'});
 assert.ok(hit.turned>0,'extended ward still mitigates after the nominal ten seconds');
 const damaged=x.m.health;
 stepSiegeSteel(x.room,x.m,11.5);
 assert.equal(x.m.health,damaged,'new damage outside repair window does not unlock banked healing');
 assert.equal(x.m.siegeSteel.healed,previous);
 stepSiegeSteel(x.room,x.m,13);
 assert.equal(x.m.siegeSteel.state,'expired');
 assert.ok(x.m.siegeSteel.bonusHealed<=11-x.m.siegeSteel.bonusPrevented+1e-7);
});

test('late decay contact spends the previously unclaimed conditional bonus',()=>{
 const x=setup();x.m.health=120;cast(x);stepSiegeSteel(x.room,x.m,6);
 assert.equal(x.m.siegeSteel.baselineHealed,19);
 const hit=damageFightFlight(x.room,x.m,30,null,'sword',8,{componentId:'main'});
 assert.ok(hit.turned>0);
 const spent=x.m.siegeSteel.bonusPrevented;
 assert.equal(x.m.siegeSteel.bonusHealed,0);
 stepSiegeSteel(x.room,x.m,10.9);
 assert.equal(x.m.siegeSteel.bonusHealed,0);
 stepSiegeSteel(x.room,x.m,11);
 assert.ok(Math.abs(x.m.siegeSteel.bonusHealed-(11-spent))<1e-7);
 assert.ok(Math.abs(x.m.siegeSteel.healed-(30-spent))<1e-7);
});
test('exhausted repair reserve does not disable Steel mitigation for later hits',()=>{
 const x=setup();x.m.health=95;cast(x);
 const first=damageFightFlight(x.room,x.m,30,null,'sword',2,{componentId:'main'});
 const second=damageFightFlight(x.room,x.m,30,null,'sword',4,{componentId:'main'});
 assert.equal(first.turned,11);
 assert.equal(second.turned,11);
 assert.equal(x.m.siegeSteel.bonusPrevented,11);
 assert.equal(x.m.siegeSteel.blockedDamage,22);
 stepSiegeSteel(x.room,x.m,11);
 assert.equal(x.m.siegeSteel.bonusHealed,0);
 assert.equal(x.m.siegeSteel.baselineHealed,19);
});
test('expiry exactly on an attack tick heals BEFORE the new damage',()=>{
 const x=setup();x.m.health=180;cast(x);
 stepSiegeSteel(x.room,x.m,6);assert.equal(x.m.health,199);
 const hit=damageFightFlight(x.room,x.m,30,null,'sword',11,{componentId:'main'});
 assert.equal(x.m.siegeSteel.bonusHealed,11);
 assert.equal(x.m.siegeSteel.state,'expired');
 assert.equal(hit.damage,30);
 assert.equal(x.m.health,180);
 const events=x.room.events.filter(e=>['siegeSteelRepairFinished','siegeSteelEnded','fightFlightComponentHit'].includes(e.type)).map(e=>e.type);
 assert.deepEqual(events.slice(-3),['siegeSteelRepairFinished','siegeSteelEnded','fightFlightComponentHit']);
});
test('post-expiry damage never retroactively unlocks the forfeited bonus',()=>{
 const x=setup();cast(x);stepSiegeSteel(x.room,x.m,6);
 damageFightFlight(x.room,x.m,30,null,'sword',11.01,{componentId:'main'});
 assert.equal(x.m.siegeSteel.bonusHealed,0);
 assert.equal(x.m.health,220);
 stepSiegeSteel(x.room,x.m,20);assert.equal(x.m.health,220);
});
test('reserved bonus restores a damaged rotor at expiry and does not multiply per component',()=>{
 const x=setup();x.m.health=210;x.m.rotorHP=15;x.m.braceLHP=42;
 cast(x);stepSiegeSteel(x.room,x.m,6);
 assert.equal(x.m.rotorHP,34);
 const before=sum(machineSteelParts(x.m,'flight'));
 stepSiegeSteel(x.room,x.m,10.9);assert.equal(sum(machineSteelParts(x.m,'flight')),before);
 stepSiegeSteel(x.room,x.m,11);
 assert.ok(Math.abs(sum(machineSteelParts(x.m,'flight'))-before-11)<1e-7);
 assert.equal(x.m.rotorHP,45);
});
