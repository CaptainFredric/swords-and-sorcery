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
