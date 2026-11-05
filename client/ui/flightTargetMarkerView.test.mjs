import test from 'node:test';
import assert from 'node:assert/strict';
import {flightTargetMarkerView} from './flightTargetMarkerView.mjs';
import {readFileSync} from 'node:fs';

const local={id:'pilot',alive:true,operatingFightFlightId:'machine'};
const camera={position:{x:0,y:3,z:6},yaw:0,pitch:0,fov:78,aspect:16/9};
const foe={id:'enemy',name:'A Certain Rival',alive:true,position:{x:0,y:0,z:-20}};
const snapshot=state=>({fightFlight:{id:'machine',skill:{
  id:'narrowToOne',phase:'active',targetId:'enemy',targetVisible:true,trackingState:state,
}},players:[foe]});
test('Target marker follows the locked enemy instead of the crosshair in third person',()=>{
 const centered=flightTargetMarkerView(local,snapshot('locked'),camera);
 assert.equal(centered.name,foe.name);
 assert.equal(centered.targetId,'enemy');
 assert.ok(Math.abs(centered.x-.5)<.01);
 assert.equal(centered.state,'locked');
 const orbit=flightTargetMarkerView(local,snapshot('locked'),{...camera,yaw:1.1});
 assert.equal(orbit.targetId,'enemy');
 assert.equal(orbit.clamped,true,'the lock has a safe screen-edge pointer when orbiting the camera');
});
test('Marker hides after break, death, occlusion or dismount and exposes real blocked states',()=>{
 const blocked=flightTargetMarkerView(local,snapshot('outOfTraverse'),camera);
 assert.equal(blocked.state,'outOfTraverse');
 assert.equal(flightTargetMarkerView(local,{...snapshot('locked'),fightFlight:{
   ...snapshot('locked').fightFlight,skill:{...snapshot('locked').fightFlight.skill,targetVisible:false}}},camera),null);
 assert.equal(flightTargetMarkerView({...local,operatingFightFlightId:null},snapshot('locked'),camera),null);
 assert.equal(flightTargetMarkerView(local,{...snapshot('locked'),players:[{...foe,alive:false}]},camera),null);
 assert.equal(flightTargetMarkerView(local,{...snapshot('locked'),fightFlight:{
  ...snapshot('locked').fightFlight,skill:{...snapshot('locked').fightFlight.skill,phase:'idle'}}},camera),null);
});
test('HUD and runtime connect the lock marker to actual enemy world projection',()=>{
 const hud=readFileSync(new URL('./HUD.mjs',import.meta.url),'utf8');
 const rt=readFileSync(new URL('../game/GameRuntime.mjs',import.meta.url),'utf8');
 assert.match(hud,/setFlightTargetMarker\(marker\)/);
 assert.match(hud,/className='flight-target-marker'/);
 assert.match(rt,/flightTargetMarkerView\(/);
 assert.match(rt,/setFlightTargetMarker\?\.\(/);
});

test('Unfired Narrow candidate has an independent dashed FIRE TO LOCK marker, not a false hard lock',()=>{
 const marked={...snapshot('preview')};
 marked.fightFlight={...marked.fightFlight,skill:{
   ...marked.fightFlight.skill,lockedOnce:false,trackingState:'preview'}};
 const view=flightTargetMarkerView(local,marked,camera);
 assert.equal(view.targetId,'enemy');
 assert.equal(view.state,'preview');
 assert.equal(view.previewDetail,'preview');
 const off=flightTargetMarkerView(local,marked,{...camera,yaw:1.1});
 assert.equal(off.targetId,'enemy','soft selection survives looking away until another foe is deliberately chosen');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const hud=readFileSync(new URL('./HUD.mjs',import.meta.url),'utf8');
 assert.match(css,/data-state="preview"/);
 assert.match(hud,/FIRE TO LOCK/);
 marked.fightFlight.skill.lockedOnce=true;marked.fightFlight.skill.trackingState='locked';
 assert.equal(flightTargetMarkerView(local,marked,camera).state,'locked');
});
