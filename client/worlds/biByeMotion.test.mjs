import test from 'node:test';
import assert from 'node:assert/strict';
import { BiByeMotion } from './biByeMotion.mjs';
const b=(x,heading=0)=>({id:'b',position:{x,y:0,z:0},x,y:0,z:0,heading,yaw:heading,pitch:0,steer:0,speed:3,state:'LOADED',mode:'MOBILE',wheelRolls:Array(6).fill(x/.55)});
test('snapshot interpolation gives continuous travel, wheel rotation and shortest angle turns',()=>{
 const m=new BiByeMotion();m.push(b(0,3.13),[],10);m.push(b(.1,-3.13),[],10.033333333);
 const s=m.sample(10.05,true);assert.ok(s.ballista.position.x>0&&s.ballista.position.x<.1);assert.ok(Math.abs(s.ballista.heading)>3);
 assert.ok(s.ballista.wheelRolls[0]>0&&s.ballista.wheelRolls[0]<.1/.55);
});
test('snapshot starvation holds collisions, never extrapolates through walls',()=>{
 const m=new BiByeMotion();m.push(b(0),[],1);m.push(b(.1),[],1.0333);assert.equal(m.sample(10,true).ballista.position.x,.1);
});
test('teleport, reset and absence clear old interpolation rather than sliding across the map',()=>{
 const m=new BiByeMotion();m.push(b(0),[],1);m.push(b(10),[],2);assert.equal(m.sample(2,true).ballista.position.x,10);
 m.push(null,[],3);assert.equal(m.sample(3,true).ballista,null);
});
test('new firing clocks and component failure apply at their matching presentation time',()=>{
 const m=new BiByeMotion();m.push(b(0),[],1);m.push({...b(.1),state:'FIRING',firedAt:1.02},[],1.03333);
 assert.equal(m.sample(1.04,true).ballista.state,'LOADED');assert.equal(m.sample(1.08,true).ballista.state,'FIRING');
});
test('projectiles share the presentation clock and never appear before birth',()=>{
 const m=new BiByeMotion(),p={id:'bolt',bornAt:1.02,position:{x:0,y:1,z:0},velocity:{x:48,y:0,z:0}};
 m.push(b(0),[],1);m.push(b(.1),[p],1.03333);
 assert.equal(m.sample(1.04,true).projectiles.length,0);assert.equal(m.sample(1.08,true).projectiles.length,1);
});
test('repairing only a component clears the old failure pose immediately',()=>{
 const m=new BiByeMotion();
 m.push({...b(0),health:650,components:{Wheel_FL:{health:0}}},[],1);
 m.push({...b(0),health:650,components:{Wheel_FL:{health:120}}},[],1.03333);
 assert.equal(m.sample(1.04,true).ballista.components.Wheel_FL.health,120);
});

test('terrain attitude and all wheel contact offsets share the carriage interpolation clock',()=>{
 const m=new BiByeMotion();m.push({...b(0),chassisPitch:0,chassisRoll:0,wheelOffsets:Array(6).fill(0),stabilizerTilts:Array(4).fill(0)},[],1);
 m.push({...b(.1),chassisPitch:.2,chassisRoll:.1,wheelOffsets:Array(6).fill(.08),stabilizerTilts:Array(4).fill(.02)},[],1.033333333);
 const pose=m.sample(1.05,true).ballista;
 assert.ok(pose.chassisPitch>0&&pose.chassisPitch<.2);assert.ok(pose.chassisRoll>0&&pose.chassisRoll<.1);
 assert.ok(pose.wheelOffsets.every(x=>x>0&&x<.08));assert.ok(pose.stabilizerTilts.every(x=>x>0&&x<.02));
});

test('retired lifecycle snapshots cannot resurrect a removed machine or overwrite its replacement',()=>{
 const m=new BiByeMotion();m.push(b(0),[],1,1);m.push(null,[],2,2);m.push(b(1),[],1.9,1);assert.equal(m.sample(2,true).ballista,null);
 m.push({...b(5),id:'new'},[],3,3);m.push(b(1),[],4,1);assert.equal(m.sample(4,true).ballista.id,'new');
});

test('remote carriage presentation advances steadily when ordered snapshots arrive with jitter',()=>{
 const motion=new BiByeMotion(),packets=[];let delivery=0;
 for(let i=0;i<90;i++){delivery=Math.max(i/30+[.045,.060,.095,.055][i%4],delivery+.001);packets.push({delivery,time:1+i/30,pose:b(i/30*4.8)});}
 let latest=null,previous=null,maxStep=0;
 for(let t=0;t<2.8;t+=1/60){while(packets[0]?.delivery<=t){latest=packets.shift();motion.push(latest.pose,[],latest.time);}
  if(!latest)continue;const now=latest.time+t-latest.delivery,s=motion.sample(now,false,false,1/60).ballista;
  if(previous!=null){const step=s.position.x-previous;assert.ok(step>=-1e-8,'arrivals never pull the carriage backward');maxStep=Math.max(maxStep,step);}previous=s.position.x;
 }
 assert.ok(maxStep<4.8/60*1.12,`largest step ${maxStep}`);
});

test('a delayed packet cannot cash out accumulated clock debt as a carriage jump',()=>{
 const m=new BiByeMotion();m.push(b(0),[],1);m.push(b(.16),[],1+1/30);
 for(let i=0;i<18;i++)m.sample(1.05+i/60,false,false,1/60);
 const held=m.sample(1.35,false,false,1/60).ballista.position.x;assert.equal(held,.16);
 m.push(b(.96),[],1.2);const next=m.sample(1.39,false,false,1/60).ballista.position.x;
 assert.ok(next-held<.1);assert.ok(next<=.96);
});
