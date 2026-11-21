import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../../shared/sim/Room.mjs';
import {tryUltimate,stepRoom,interruptHitActions} from '../../shared/sim/combat.mjs';
import {ONE_HIT_RULES} from '../../shared/src/oneHitOfWondersRules.mjs';
import {serializeSnapshot} from '../../shared/sim/wire.mjs';
import {fieldStrength,fieldSeconds,ONE_HIT_CHARGE_AURA} from '../../shared/src/oneHitStatus.mjs';

const DT=1/30;
const world={floors:[{id:'wide-ground',center:[0,-.1,0],size:[240,.2,240],y:0}],
 ramps:[],solids:[],spawnPoints:[{x:0,y:0,z:0,yaw:0}],abyssY:-30};
function setup(tiers={}){
 const room=new Room('DISASTER-STEEL-TEST',{mode:'FFA'});room.world=world;
 for(const id of ['caster','target','later'])room.addPlayer({id,token:id,name:id},0);
 for(const id of ['caster','target','later'])room.setReady(id,true,0);
 room.tick(3.1);
 const caster=room.players.get('caster'),target=room.players.get('target'),later=room.players.get('later');
 caster.position={x:0,y:0,z:0};caster.velocity={x:0,y:0,z:0};
 caster.grounded=true;caster.yaw=0;caster.input.yaw=0;
 caster.ultimate='one_hit_of_wonders';Object.assign(caster.oneHitInfusions,tiers);
 caster.prowess=100;caster.spawnProtectionUntil=0;
 target.position={x:0,y:0,z:16};target.spawnProtectionUntil=0;
 target.velocity={x:0,y:0,z:0};target.health=1000;
 later.position={x:8,y:0,z:9};later.spawnProtectionUntil=0;
 room.events.length=0;
 return {room,caster,target,later};
}
function tick(room,now,count=1){for(let i=0;i<count;i++)stepRoom(room,DT,now+i*DT,world);}
function fired(room){return room.events.filter(e=>e.type==='oneHitImpact'&&e.impactId);}
function rupture(room){return room.events.filter(e=>e.type==='rupture');}
function terminal(room,{height=.65,steel=2}={}){
 const {room:r,caster}=setup({steel,gale:2});
 r.oneHitWaves=[{id:'gale-test-'+height,ownerId:caster.id,
   position:{x:0,y:height,z:0},direction:{x:0,y:0,z:-1},
   tiers:{fire:0,frost:0,gale:2,lightning:0,steel},
   launchYaw:0,bornAt:9,distance:ONE_HIT_RULES.waveMaxReach-.15,
   hitIds:[],fromGround:false}];
 tick(r,9.05);
 return r;
}

test('Full Steel residual field keeps all infusions at full strength, exactly until its unchanged expiration',()=>{
 const {room}=setup({fire:2,frost:2,gale:2,lightning:2,steel:2});
 assert.equal(tryUltimate(room,'caster',9,{held:true}),true);
 // Release not needed to exercise the shared rules: create a representative
 // cast-owned field and Fire zone with their actual durations.
 const tiers={fire:2,frost:2,gale:2,lightning:2,steel:2};
 const field={bornAt:9,until:9+fieldSeconds(tiers),tiers};
 const zone={bornAt:9,until:9+fieldSeconds(tiers),steelLocked:true};
 assert.equal(fieldStrength(field,9),1);
 assert.equal(fieldStrength(field,13),1);
 assert.equal(fieldStrength(zone,13),1);
 assert.equal(fieldStrength(field,field.until),0);
 assert.equal(fieldStrength(zone,zone.until),0);
 const ordinary={bornAt:9,until:9+fieldSeconds({fire:2,frost:2,gale:2,lightning:2}),
    tiers:{fire:2,frost:2,gale:2,lightning:2}};
 assert.ok(fieldStrength(ordinary,13)<.5,'no Steel retains ordinary decay');
});

test('each Full Steel Gale ground terminal explosion actually creates all twelve authoritative radial fissures',()=>{
 const room=terminal({height:.65,steel:2});
 const hit=fired(room)[0];
 assert.ok(hit&&hit.groundBlast,'the live wave terminal blast contacts ground');
 const events=rupture(room);
 assert.equal(events.length,1,'one new rupture source for this wave endpoint');
 assert.equal(events[0].steel,2);
 assert.equal(events[0].radial,true);
 assert.equal(events[0].fissures.length,12,
   'all twelve physically planned arms survive authoritative ground checks');
 assert.equal(new Set(events[0].fissures.map(f=>Math.atan2(f.dir.x,f.dir.z).toFixed(3))).size,12);
 assert.equal(room.ruptures.length,1,'the rupture is not a fake VFX-only event');
 assert.equal(room.ruptures[0].fissures.length,12);
});

test('without Steel, a Gale ground terminal explosion still creates ordinary four-arm Sunder rupture',()=>{
 const room=terminal({height:.65,steel:0});
 const events=rupture(room);
 assert.equal(events.length,1);
 assert.equal(events[0].terminalGale,true);
 assert.equal(events[0].fissures.length,4);
});

test('free-air Gale terminal explosion never creates a hanging or ground-projected rupture',()=>{
 const room=terminal({height:9,steel:2});
 assert.ok(fired(room)[0]&&!fired(room)[0].groundBlast);
 assert.equal(rupture(room).length,0,'no pretend soil in free air');
 assert.equal(room.ruptures.length,0);
});

test('an indefinitely held Full Lightning charge pays each target only once at the small aura radius',()=>{
 const {room,caster,target,later}=setup({fire:1,frost:1,gale:1,lightning:2,steel:1});
 target.position={x:1.2,y:0,z:0};
 later.position={x:8,y:0,z:8};
 assert.equal(tryUltimate(room,'caster',9,{held:true}),true);
 tick(room,9.033);
 assert.equal(caster.ultimateState?.phase,'startup');
 assert.ok(Math.hypot(target.position.x-caster.position.x,target.position.z-caster.position.z)<=
   ONE_HIT_CHARGE_AURA.radius+ONE_HIT_CHARGE_AURA.bodyRadius);
 let hits=room.events.filter(e=>e.type==='oneHitChargeAura'&&e.targetId===target.id);
 assert.equal(hits.length,1);
 assert.deepEqual(hits[0].elements,['fire','frost','gale','lightning']);
 assert.ok(target.health<1000,'one small real Fire contact');
 assert.ok(target.oneHitFrostSlow?.depth>0,'Frost slows');
 assert.ok(target.blustered?.severity>0,'Gale limits rotation');
 assert.ok(target.electricalBacklash?.initial>0,'Lightning provides Conduct');
 const hp=target.health;
 // A genuinely indefinite hold remains live, but cannot repeatedly pay
 // this same actor another burn, slow or Conduct for standing nearby.
 for(let i=0;i<130;i++)tick(room,9.10+i*DT);
 assert.equal(caster.ultimateState?.phase,'startup');
 assert.equal(room.events.filter(e=>e.type==='oneHitChargeAura'&&e.targetId===target.id).length,1);
 assert.equal(target.health,hp,'no recurring Fire HP farm in held Lightning');
 later.position={x:-1.2,y:0,z:0};
 later.velocity={x:0,y:0,z:0};later.spawnProtectionUntil=0;
 tick(room,13.6);
 assert.equal(room.events.filter(e=>e.type==='oneHitChargeAura'&&e.targetId===later.id).length,1,
   'a new approaching opponent can still enter the live charge aura');
});

test('Steel blocks real action cancellation during finite bracing, not as perpetual uninterruptibility',()=>{
 const {room,caster}=setup({steel:1,lightning:2});
 assert.equal(tryUltimate(room,'caster',9,{held:true}),true);
 interruptHitActions(room,caster,'target',9.18,'sunder');
 assert.equal(caster.ultimateState?.phase,'startup','ordinary Steel brace resists direct forced cancellation');
 tick(room,9.22);
 tick(room,10.3);
 assert.equal(caster.ultimateState?.phase,'startup','Full Lightning still permits holding');
 interruptHitActions(room,caster,'target',10.32,'sunder');
 assert.equal(caster.ultimateState,null,
   'after the finite genuine wind-up the caster is not permanently immune to interruption');
});

test('actual Full Steel ground slam transmits nondecaying Fire, Frost and Gale fields',()=>{
 const {room,target}=setup({fire:2,frost:2,gale:1,steel:2});
 assert.equal(tryUltimate(room,'caster',9),true);
 for(let i=0;i<42;i++)tick(room,9+i*DT);
 const slam=room.events.find(e=>e.type==='oneHitImpact'&&e.form==='ground');
 assert.ok(slam,'real server commit creates the field, not a mocked status');
 const field=room.oneHitFields.find(f=>f.id===slam.fieldId);
 assert.ok(field&&field.tiers.steel===2&&field.tiers.frost===2&&field.tiers.gale===1);
 const zone=room.oneHitBurnZones[0];
 assert.ok(zone&&zone.steelLocked,'Full Fire burn inherits the Steel field fortification');
 const late=field.bornAt+(field.until-field.bornAt)*.8;
 assert.equal(fieldStrength(field,late),1,'the real field does not weaken before expiry');
 assert.equal(fieldStrength(zone,late),1,'the real Fire damage does not weaken before expiry');
 const snapshot=serializeSnapshot(room,10.4,'caster');
 assert.equal(snapshot.oneHitFields[0].tiers.steel,2);
 assert.equal(snapshot.oneHitBurnZones[0].steelLocked,true,
   'remote client knows Full Fire should be drawn at undiminished intensity');
 target.position={x:0,y:0,z:-2};
 target.velocity={x:0,y:0,z:0};target.impulse={x:0,z:0};
 const before=target.health;
 const eventCount=room.events.length;
 tick(room,late);
 const licks=room.events.slice(eventCount).filter(e=>
   e.type==='damage'&&e.source==='one_hit_ground_fire'&&e.victimId===target.id);
 assert.ok(licks.length>0,'late Full Fire deals genuine periodic damage');
 assert.equal(licks[0].amount,3,'Full Steel preserves the FULL three-point lick');
 assert.ok(target.health<before);
});
