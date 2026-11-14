import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Room} from '../../shared/sim/Room.mjs';
import {createBiByeLlista,mountBiByeLlista,dismountBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
import {createSoFistication,soFistEntry,mountSoFistication,primeSoFistSkill} from '../../shared/sim/soFistication.mjs';
import {applySavedLoadout} from '../src/savedLoadout.mjs';
import {LocalHost} from '../../client/network/LocalHost.mjs';
import {normalizeSiegeLoadout} from '../../shared/src/siegeLoadout.mjs';
import {registry} from '../../client/settings/settingsRegistry.mjs';
import {SettingsStore} from '../../client/settings/SettingsStore.mjs';
import {siegeArmoryView} from '../../client/menu/siegeArmoryView.mjs';
const ground={floors:[{y:0,center:[0,-.1,0],size:[90,.2,90]}],solids:[],ramps:[],abyssY:-20};
test('Siege Armory has its own real tab and leaves the other three Armory tabs intact',()=>{
 const html=readFileSync(new URL('../../client/index.html',import.meta.url),'utf8');
 for(const id of ['kit','siege','heraldry','challenges'])assert.match(html,new RegExp('id="armory-'+id+'-tab"'));
 assert.match(html,/SIEGE IN PRODUCTION!/);
 assert.match(html,/fourth wall still stands/);
 const v=siegeArmoryView({biBye:'coldHowTouching'});
 assert.deepEqual(v.map(m=>m.name),['BI-BYE-LLISTA','SO-FIST-ICATION','FIGHT-AND-FLIGHT']);
 assert.deepEqual(v[0].skills.map(s=>s.equipped),[false,true,false]);
 assert.equal(v[0].skills[0].icon,'boltToTheOccasion');
 assert.equal(v[0].skills[1].icon,undefined,'alternative frost Skill retains its presentation');
 assert.equal(v[0].skills[2].id,'lookAroundAndFindOut');
 assert.equal(v[0].skills[2].icon,'siegeSweep');
 assert.match(v[0].skills[2].line,/24s cooldown begins when the action resolves/);
 assert.deepEqual(siegeArmoryView({biBye:'lookAroundAndFindOut'})[0].skills.map(s=>s.equipped),[false,false,true]);
 assert.deepEqual(v[1].skills.map(s=>s.id),['beatToThePunch','longArmToTheJaw','hellpingHand']);
 assert.equal(v[1].skills[0].equipped,true);
 assert.equal(v[2].skills.length,3);
});
test('HELLping Hand Armory selection has real copy, survives persistence and equips on the actual ram',()=>{
 const ram=siegeArmoryView({soFist:'hellpingHand'}).find(machine=>machine.id==='soFist');
 const skill=ram.skills.find(item=>item.id==='hellpingHand');
 assert.equal(skill?.name,'HELLping Hand');
 assert.equal(skill?.equipped,true);
 assert.equal(typeof skill?.line,'string');
 assert.match(skill.line,/seize a nearby enemy/);
 assert.equal(ram.skills.filter(item=>item.equipped).length,1);
 for(const machine of siegeArmoryView({}))
  for(const item of machine.skills) {
   assert.ok(typeof item.line==='string'&&item.line.length>20,
     'missing armory explanation: '+item.id);
   assert.ok(typeof item.name==='string'&&item.name.length,
     'missing armory label: '+item.id);
  }

 const memory=new Map(),storage={getItem:key=>memory.get(key)??null,
   setItem:(key,value)=>memory.set(key,value)};
 const settings=new SettingsStore({registry,storage});
 assert.equal(settings.set('loadout.soFistSkill','hellpingHand'),'hellpingHand');
 const reloaded=new SettingsStore({registry,storage});
 assert.equal(reloaded.get('loadout.soFistSkill'),'hellpingHand');
 assert.equal(normalizeSiegeLoadout({soFist:reloaded.get('loadout.soFistSkill')}).soFist,'hellpingHand');

 const room=new Room('HELLPING_ARMORY',{mode:'PRACTICE'});
 room.state='PLAYING';room.world=structuredClone(ground);
 const operator=room.addPlayer({id:'hel',token:'hel',name:'HELLping Tester',
   siegeLoadout:{soFist:reloaded.get('loadout.soFistSkill')}},0);
 const ramMachine=room.soFistication=createSoFistication({x:0,y:0,z:0,heading:0});
 operator.position=soFistEntry(ramMachine,room.world);
 assert.equal(mountSoFistication(room,ramMachine,operator,0),true);
 assert.equal(ramMachine.skill.id,'hellpingHand',
   'the chosen persisted personal Skill must become the live mounted skill');
 assert.equal(primeSoFistSkill(room,ramMachine,operator,0),null);
 assert.equal(ramMachine.hellping?.phase,'open',
   'the selected Skill must actually open the palm instead of priming Beat to the Punch');
});
test('Fight-and-Flight Armory preserves the full authored lore with paragraphs and emphasis',()=>{
 const view=siegeArmoryView({fightFlight:'doNotStopMyAscension'});
 const flight=view.find(m=>m.id==='fightFlight');
 const paragraphs=flight.line.split(/\n\s*\n/);
 assert.equal(paragraphs.length,9,'all nine paragraphs are retained, without the old short description');
 assert.equal(paragraphs[0],'*Why choose to Fight or Flee? When you could be Free?*');
 assert.equal(paragraphs[1],'...To do both at the same time. And get away with it.');
 assert.match(paragraphs[2],/Castleward's infamous engineers/);
 assert.match(paragraphs[3],/\*they\* cannot retreat from it/);
 assert.match(paragraphs[4],/Rotor-Blades.*non-existence\./);
 assert.equal(paragraphs[5],'Or yourself.');
 assert.equal(paragraphs[6],'It is not a dove. Nor does it mean mutual mortality.');
 assert.equal(paragraphs[7],'It is simply doom.');
 assert.equal(paragraphs[8],'And it is nigh-unreachable.');
 const client=readFileSync(new URL('../../client/main.mjs',import.meta.url),'utf8');
 assert.match(client,/siege-armory-description/,'long-form Armory prose is rendered as paragraphs');
 assert.match(client,/escapeHtml\(paragraph\)/,'authored prose is escaped before italics are rendered');
});
test('Registry and stored personal Skill survive reload and reject invented values',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const a=new SettingsStore({registry,storage});
 assert.equal(a.set('loadout.bibyeSkill','coldHowTouching'),'coldHowTouching');
 assert.equal(new SettingsStore({registry,storage}).get('loadout.bibyeSkill'),'coldHowTouching');
 assert.equal(registry.validate('loadout.bibyeSkill','noCooldown'),'boltToTheOccasion');
  assert.equal(a.set('loadout.fightFlightSkill','narrowToOne'),'narrowToOne');
  assert.equal(new SettingsStore({registry,storage}).get('loadout.fightFlightSkill'),'narrowToOne');
  assert.equal(registry.validate('loadout.fightFlightSkill','illegal'),'fireAwayRightHere');
 assert.deepEqual(normalizeSiegeLoadout({biBye:'stolenSkill',fightFlight:'coldHowTouching'}),
  {biBye:'boltToTheOccasion',soFist:'beatToThePunch',fightFlight:'fireAwayRightHere'});
});
test('Individual riders choose independent Skill IDs without restoring shared physical cooldown',()=>{
 const room=new Room('SIEGE',{mode:'PRACTICE'});room.world=structuredClone(ground);room.state='PLAYING';
 const a=room.addPlayer({id:'a',token:'a',name:'A',siegeLoadout:{biBye:'coldHowTouching'}},0);
 const b=room.addPlayer({id:'b',token:'b',name:'B',siegeLoadout:{biBye:'boltToTheOccasion'}},0);
 const machine=room.biByeLlista=createBiByeLlista({x:0,z:0,baseYaw:0});
 a.position={x:0,y:0,z:0};assert.ok(mountBiByeLlista(machine,a,1));
 assert.equal(machine.skill.id,'coldHowTouching');
 machine.skill.readyAt=30;machine.mainBoltLoaded=false;machine.reloadEndsAt=34;
 dismountBiByeLlista(machine,a);
 b.position={x:0,y:0,z:0};assert.ok(mountBiByeLlista(machine,b,3));
 assert.equal(machine.skill.id,'boltToTheOccasion');
 assert.equal(machine.skill.readyAt,30);
 assert.equal(machine.mainBoltLoaded,false);assert.equal(machine.reloadEndsAt,34);
});
test('Server accepts only validated personal equipment, deferring mounted loadout changes',()=>{
 const session={},p={operatingBallistaId:'ballista',siegeLoadout:{biBye:'boltToTheOccasion'}};
 applySavedLoadout(session,{state:'PLAYING'},p,{spell:'fireball',ultimate:'sunder',
  siegeLoadout:{biBye:'coldHowTouching',soFist:'illegal'}});
 assert.equal(p.siegeLoadout.biBye,'boltToTheOccasion');
 assert.equal(p.queuedSiegeLoadout.biBye,'coldHowTouching');
 assert.equal(session.siegeLoadout.soFist,'beatToThePunch');
});

test('LocalHost and server apply the same normalized personal Siege equipment',()=>{
 const chosen={biBye:'coldHowTouching',soFist:'invented',fightFlight:'doNotStopMyAscension'};
 const local=new LocalHost({now:()=>0,every:()=>1,cancel:()=>{},later:()=>{},storage:null});
 local.loadout('fireball','sunder',[],chosen);
 local.startSolo('PRACTICE','Local tester','castleward');
 assert.equal(local.player.siegeLoadout.biBye,'coldHowTouching');
 assert.equal(local.player.siegeLoadout.soFist,'beatToThePunch');
  assert.equal(local.player.siegeLoadout.fightFlight,'doNotStopMyAscension');
 const room={state:'WAITING'},serverSession={},networkPlayer={};
 applySavedLoadout(serverSession,room,networkPlayer,{spell:'fireball',ultimate:'sunder',
   preparedSpells:[],siegeLoadout:chosen});
 assert.deepEqual(networkPlayer.siegeLoadout,local.player.siegeLoadout);
 local.close();
});
