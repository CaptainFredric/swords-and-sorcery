import test from 'node:test';import assert from 'node:assert/strict';
import {highGroundsHudView,highGroundsFoundryView,HIGH_GROUNDS_MACHINE_KEYS} from './highGroundsHudView.mjs';
const site=(name,x,owner=null,extra={})=>({id:name,name,position:{x,y:0,z:0},radius:8,owner,progress:0,contested:false,...extra});
const snap=()=>({mode:'HIGH_GROUNDS',roomState:'PLAYING',matchStartedAt:10,matchSeconds:720,
highGrounds:{sites:[site('Home',-40,'ATTACKERS'),site('Crown',0),site('Bridge',28,'DEFENDERS')],
scores:{ATTACKERS:76,DEFENDERS:53},scoreToWin:900,
foundries:[{team:'ATTACKERS',x:-40,y:0,z:0,readyAt:0,machineId:null}]},players:[]});
test('the High Grounds uses a concise Breakthrough-compatible score, objective and time',()=>{
 const s=snap(),v=highGroundsHudView({team:'ATTACKERS',position:{x:3,y:0,z:0}},s,70);
 assert.equal(v.visible,true);assert.equal(v.objectiveName,'CROWN');
 assert.match(v.phaseLabel,/AZURE 76 : 53 CRIMSON/);
 assert.equal(v.clock,'11:00');assert.equal(v.footer,'1 HELD · 1 ENEMY · 1 NEUTRAL');
});
test('contested nearby site takes priority and progress uses actual cap progress',()=>{
 const s=snap();s.highGrounds.sites[1].contested=true;s.highGrounds.sites[1].progress=.34;
 const v=highGroundsHudView({team:'ATTACKERS',position:{x:1,y:0,z:0}},s,11);
 assert.equal(v.stateKey,'contested');assert.equal(v.progressPct,34);
 assert.equal(v.stateLabel,'CONTESTED');
});
test('High Grounds absent outside its mode, preserving regular Breakthrough',()=>{
 const s=snap();s.mode='BREAKTHROUGH';assert.equal(highGroundsHudView(null,s,10).visible,false);
 assert.equal(highGroundsFoundryView(s,null,10).visible,false);
});
test('foundry only actionable for nearby living unmounted team member after cooldown',()=>{
 const s=snap(),p={alive:true,team:'ATTACKERS',position:{x:-39,y:0,z:0}};
 let v=highGroundsFoundryView(s,p,30);assert.equal(v.ready,true);
 assert.equal(Object.values(v.disabled).every(v=>v===false),true);
 v=highGroundsFoundryView(s,{...p,operatingFightFlightId:'flight'},30);assert.equal(v.visible,false);
 v=highGroundsFoundryView(s,{...p,position:{x:0,y:0,z:0}},30);assert.equal(v.visible,false);
 s.highGrounds.foundries[0].readyAt=75;v=highGroundsFoundryView(s,p,30);
 assert.equal(v.remaining,45);assert.equal(v.disabled['fight-and-flight'],true);
});
test('all starting camp spawns can choose a machine without an invisible 5m console hunt',()=>{
 const s=snap(), foundry=s.highGrounds.foundries[0];
 for (const x of [-7,0,7]) for (const z of [-105,-99]) {
   // Match the real camp-relative offset from the home forge.
   const player={alive:true,team:'ATTACKERS',position:{x:foundry.x-16+x,y:0,z:z+101}};
   const view=highGroundsFoundryView(s,player,40);
   assert.equal(view.visible,true,'spawn '+x+','+z);
   assert.equal(view.ready,true);
 }
 const edge={alive:true,team:'ATTACKERS',position:{x:foundry.x+26,y:0,z:foundry.z}};
 assert.equal(highGroundsFoundryView(s,edge,40).visible,false,'beyond home camp stays gated');
});
test('foundry gives clear feedback for deployed machines and globally occupied classes',()=>{
 const s=snap(),p={alive:true,team:'ATTACKERS',position:{x:-40,y:0,z:0}};
 s.bibyeBallista={id:'ballista',health:400,mode:'MOBILE',retired:false};
 let view=highGroundsFoundryView(s,p,40);
 assert.equal(view.disabled['bi-bye-llista'],true);
 assert.equal(view.disabled['fight-and-flight'],false);
 s.highGrounds.foundries[0].machineId='ballista';
 s.highGrounds.foundries[0].machine='bi-bye-llista';
 view=highGroundsFoundryView(s,p,40);
 assert.equal(view.owned,true);
 assert.match(view.status,/DEPLOYED/);
 assert.match(view.hint,/ROAD PAD/);
});
test('foundry shortcuts are noncombat numeric keys away from prepared slots 1–3',()=>{
 assert.deepEqual(Object.keys(HIGH_GROUNDS_MACHINE_KEYS),['Digit7','Digit8','Digit9']);
 assert.equal(HIGH_GROUNDS_MACHINE_KEYS.Digit9,'fight-and-flight');
});
