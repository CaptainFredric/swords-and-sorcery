import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightSound,flightRecipe,flightLoopSamples} from './FlightSound.mjs';

const machine=()=>({id:'flight-sound-1',operatorId:'pilot',mode:'AIRBORNE',grounded:false,rotorHP:80,rotorEnergy:85,offensiveRun:true,
 velocity:{x:12,y:0,z:-2},position:{x:0,y:3,z:0},lastShotAt:-Infinity});

test('flight Dash has sharp wind onset, lower follow-through and light release, with no vocal sample',()=>{
 const onset=flightRecipe('offensiveRun',()=>.5),release=flightRecipe('offensiveRelease',()=>.5);
 assert.ok(onset.layers.length>=3);
 assert.ok(onset.layers.some(l=>l.type==='noise'&&l.filter==='highpass'&&l.freq>1000));
 assert.ok(onset.layers.some(l=>l.type==='noise'&&l.decay>.4));
 assert.ok(release.layers.some(l=>l.type==='noise'&&l.filter==='highpass'));
 assert.ok([...onset.layers,...release.layers].every(l=>['tone','noise'].includes(l.type)));
 const samples=flightLoopSamples('offensive',1000,.4,()=>.63);
 assert.equal(samples.length,400);
 assert.ok(samples.some(v=>Math.abs(v)>.01));
 assert.ok(samples.every(Number.isFinite));
});

test('confirmed offensive run onset and end play just once each per server event',()=>{
 const played=[];
 const engine={
  running:true,muted:false,
  buffer:samples=>({samples}),
  playBuffer:()=>({place(){},stop(){}}),
  play:(recipe,options)=>{played.push({tag:recipe.tag,options});return {stop(){}};},
 };
 const sound=new FlightSound(engine),m=machine();
 sound.update(m,{active:true,listener:m.position,yaw:0,now:2});
 const start={type:'fightFlightOffensiveRun',machineId:m.id,operatorId:'pilot',at:2,action:'started'};
 const end={...start,at:2.5,action:'ended'};
 sound.event(start,m,2.02);sound.event(start,m,2.02);
 sound.event(end,m,2.5);sound.event(end,m,2.5);
 assert.deepEqual(played.map(p=>p.tag),['offensiveRun','offensiveRelease']);
 assert.ok(played.every(p=>p.options.gain>0));
 sound.dispose();
});

test('wrong machine and stale server events never play stray wind sound',()=>{
 const played=[];
 const engine={running:true,muted:false,buffer:()=>({}),playBuffer:()=>({place(){},stop(){}}),
 play:(recipe)=>{played.push(recipe.tag);return {stop(){}};}};
 const sound=new FlightSound(engine),m=machine();
 sound.update(m,{active:true,listener:m.position,yaw:0,now:10});
 sound.event({type:'fightFlightOffensiveRun',machineId:'foreign',at:10,action:'started'},m,10);
 sound.event({type:'fightFlightOffensiveRun',machineId:m.id,at:8,action:'started'},m,10);
 assert.deepEqual(played,[]);
 sound.dispose();
});
