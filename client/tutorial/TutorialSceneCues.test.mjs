import test from 'node:test';
import assert from 'node:assert/strict';
import { tutorialSceneCue } from './TutorialSceneCues.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';

const actor = (x, z, grounded = true) => ({alive:true,grounded,position:{x,z}});
const context = (player, rival) => ({player,rival,route:GREENER_ROUTE});

test('entrance approach requires both the authored destination distance and the player proximity', () => {
  const {x,z} = GREENER_ROUTE.entrance;
  const gate = {kind:'near-entrance',distance:42,playerDistance:70};
  assert.equal(tutorialSceneCue(gate,context(actor(x,z+55),actor(x,z+40))),true);
  assert.equal(tutorialSceneCue(gate,context(actor(x,z+120),actor(x,z+40))),false);
  assert.equal(tutorialSceneCue(gate,context(actor(x,z+55),actor(x,z+43))),false);
});

test('a grounded traversal fact follows authored landmark geometry rather than elapsed narration', () => {
  const point = GREENER_ROUTE.waypointById['far-bank'];
  const gate = {kind:'past-landmark',actor:'player',landmark:'far-bank',grounded:true};
  assert.equal(tutorialSceneCue(gate,context(actor(point.x,point.z+1),actor(0,0))),false);
  assert.equal(tutorialSceneCue(gate,context(actor(point.x,point.z-1,false),actor(0,0))),false);
  assert.equal(tutorialSceneCue(gate,context(actor(point.x,point.z-1),actor(0,0))),true);
});

test('removing dialogue leaves the same reusable landmark observation and dead actors cannot satisfy it', () => {
  const point = GREENER_ROUTE.landmarks.pride;
  const gate = {kind:'near-landmark',landmark:'pride',distance:2};
  const ctx = context(actor(0,0),actor(point.x+1,point.z));
  assert.equal(tutorialSceneCue(gate,ctx),true);
  assert.equal(tutorialSceneCue(gate,{...ctx,rival:{...ctx.rival,alive:false}}),false);
  assert.equal(tutorialSceneCue({kind:'fact',cue:'rival-died'},ctx),false);
  assert.throws(()=>tutorialSceneCue({...gate,landmark:'missing'},ctx),/Unknown tutorial landmark/);
});
