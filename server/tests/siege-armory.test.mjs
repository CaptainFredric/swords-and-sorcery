import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Room} from '../../shared/sim/Room.mjs';
import {createBiByeLlista,mountBiByeLlista,dismountBiByeLlista} from '../../shared/sim/biByeLlista.mjs';
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
 assert.deepEqual(v[0].skills.map(s=>s.equipped),[false,true]);
 assert.equal(v[1].skills.length,1);assert.equal(v[2].skills.length,1);
});
test('Registry and stored personal Skill survive reload and reject invented values',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const a=new SettingsStore({registry,storage});
 assert.equal(a.set('loadout.bibyeSkill','coldHowTouching'),'coldHowTouching');
 assert.equal(new SettingsStore({registry,storage}).get('loadout.bibyeSkill'),'coldHowTouching');
 assert.equal(registry.validate('loadout.bibyeSkill','noCooldown'),'boltToTheOccasion');
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
 const chosen={biBye:'coldHowTouching',soFist:'invented',fightFlight:'fireAwayRightHere'};
 const local=new LocalHost({now:()=>0,every:()=>1,cancel:()=>{},later:()=>{},storage:null});
 local.loadout('fireball','sunder',[],chosen);
 local.startSolo('PRACTICE','Local tester','castleward');
 assert.equal(local.player.siegeLoadout.biBye,'coldHowTouching');
 assert.equal(local.player.siegeLoadout.soFist,'beatToThePunch');
 const room={state:'WAITING'},serverSession={},networkPlayer={};
 applySavedLoadout(serverSession,room,networkPlayer,{spell:'fireball',ultimate:'sunder',
   preparedSpells:[],siegeLoadout:chosen});
 assert.deepEqual(networkPlayer.siegeLoadout,local.player.siegeLoadout);
 local.close();
});
