import test from 'node:test';
import assert from 'node:assert/strict';
import { movePlayer, createMovementState, tryStartDash } from './movement.mjs';
import { HIGH_GROUNDS } from '../worlds/highGrounds.mjs';
import { surfaceHeightAt } from './collision.mjs';

const close=(a,b,tol=.12)=>Math.abs(a-b)<=tol;
test('ramp ascent maintains continuous player feet collision through dozens of server steps', () => {
  const x=-38,z=-97,initialY=surfaceHeightAt(x,z,1,HIGH_GROUNDS);
  assert.ok(initialY>0&&initialY<1);
  let state=createMovementState({x,y:initialY,z}),t=0;
  for(let i=0;i<70;i++) {
    t+=1/30;
    state=movePlayer(state,{forward:1,right:0,yaw:Math.PI,jump:false,sprint:false,crouch:false},1/30,t,HIGH_GROUNDS);
    const ground=surfaceHeightAt(state.position.x,state.position.z,state.position.y+.4,HIGH_GROUNDS);
    assert.ok(state.grounded,`step ${i} should remain on a real ramp`);
    assert.ok(ground!==null&&close(state.position.y,ground),`step ${i}: no stair/ramp sinking`);
  }
  assert.ok(state.position.y>5,'the player actually climbed');
});

test('high bridge supports fast movement but an intentional abyss beyond the deck still permits falling', () => {
  let state=createMovementState({x:0,y:12,z:0});
  let t=0;
  // Move along the high bridge well inside its actual support polygon.
  for(let i=0;i<28;i++) {
    t+=1/30;
    state=movePlayer(state,{forward:0,right:1,yaw:0,jump:false,sprint:false,crouch:false},1/30,t,HIGH_GROUNDS);
    assert.ok(state.grounded,'bridge remains solid during movement');
    assert.ok(close(state.position.y,12,.01));
  }
  // A genuine gap outside any decks must not be fixed by a global floor clamp.
  state.position={x:68,y:12,z:20};
  state.grounded=false;
  state.velocity.y=-3;
  for(let i=0;i<20;i++){
    t+=1/30;
    state=movePlayer(state,{forward:0,right:0,yaw:0,jump:false,sprint:false,crouch:false},1/30,t,HIGH_GROUNDS);
  }
  assert.ok(state.position.y<7&&!state.grounded,'abyss remains a legitimate hazard');
});

test('descending an actual High Grounds slope does not detach feet every step', () => {
  let state=createMovementState({x:-38,y:12,z:-65}),t=0;
  assert.equal(surfaceHeightAt(-38,-65,12.1,HIGH_GROUNDS),12);
  for(let i=0;i<90;i++){
    t+=1/30;
    state=movePlayer(state,{forward:1,right:0,yaw:0,jump:false,sprint:false,crouch:false},
      1/30,t,HIGH_GROUNDS);
    const ground=surfaceHeightAt(state.position.x,state.position.z,state.position.y+.65,HIGH_GROUNDS);
    assert.ok(state.grounded,'feet must follow traversable downhill ramp at step '+i);
    assert.ok(ground!==null&&Math.abs(state.position.y-ground)<.02,'no hover-then-snap descent at step '+i);
  }
  assert.ok(state.position.y<8,'character actually descended the high ramp');
});
