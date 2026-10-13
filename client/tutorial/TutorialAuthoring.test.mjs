import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { TUTORIAL_SEGMENTS, tutorialRouteBeats } from './tutorialScript.mjs';
import { applyDamage } from '../../shared/sim/combat.mjs';

function fixture(route, omitSegments = []) {
  let now = 10;
  const host = new LocalHost({now:()=>now,every:()=>1,cancel:()=>{},later:()=>{}});
  host.startTutorial('You');
  const session = new TutorialSession(host,{route,omitSegments}); session.start();
  return {host,session,tick:()=>{now+=1/30;host.tick();},now:()=>now};
}

test('edited dialogue, an inserted scene and a disabled joke keep scene policies and route metadata live',()=>{
  const original = TUTORIAL_SEGMENTS.find(s=>s.id==='escape-head-start');
  const edited = {...original,beats:original.beats.filter(b=>b.id!=='never-welcome').map(b=>b.id==='overstayed-welcome'?{...b,line:'An editable creator draft.'}:b)};
  const insert = {id:'new-exchange',chapter:'pursuit',permissions:edited.permissions,scene:{},beats:[
    {id:'new-authored-key',kind:'dialogue',line:'Another draft.',advanceOn:'continue',presentation:'reactive',segment:'new-exchange',chapter:'pursuit'}]};
  const route = [edited,insert,...TUTORIAL_SEGMENTS.filter(s=>!['escape-head-start','pursuit-banter'].includes(s.id))];
  const {host,session,tick}=fixture(route);
  assert.equal(session.director.progress.segment.id,'escape-head-start');
  // (he walks off first: the escape proper waits for the false exit and the threat)
  assert.equal(session.rival.mode,'depart');
  assert.equal(session.director.beats.some(b=>b.id==='never-welcome'),false);
  assert.equal(session.director.beats.some(b=>b.id==='final-hello'),false);
  session.director.resumeAt('overstayed-welcome');assert.equal(session.director.current.line,'An editable creator draft.');
  session.director.resumeAt('new-authored-key');tick();
  assert.equal(session.director.progress.segment.id,'new-exchange');assert.ok(['depart','hold-afar'].includes(session.rival.mode));
  host.close();
});

test('ordinary final combat removes Rival protection independently of optional pursuit dialogue',()=>{
  const {host,session,now}=fixture(TUTORIAL_SEGMENTS);
  session.director.resumeAt('final-guard');
  // (his held Guard is the final duel's own lesson: he cannot be beaten until it is broken)
  assert.equal(session.requiresFinalGuard,true);assert.equal(host.room.tutorialRival.protected,true);
  session.director.resumeAt('defeat-rival');
  assert.equal(host.room.tutorialRival.protected,false);
  const rival=host.room.players.get(session.rivalId);
  applyDamage(host.room,host.player.id,rival.id,100,'sword',now());assert.equal(rival.alive,false);
  host.close();
});

test('disabled Guard teaching drops only its explicitly dependent recovery scene',()=>{
  const beats=tutorialRouteBeats(TUTORIAL_SEGMENTS,{omitSegments:['first-guard']});
  assert.equal(beats.some(b=>b.segment==='health-regen'),false);
  assert.ok(beats.some(b=>b.segment==='real-duel'));assert.ok(beats.some(b=>b.segment==='bridge-dash'));
});

test('unavailable held session inputs require release before a newly learned action can start',()=>{
  const {host,session,tick}=fixture(TUTORIAL_SEGMENTS);
  session.director.resumeAt('walk-prompt');
  host.input({seq:1,forward:1,right:0,yaw:0,pitch:0,sprint:true});tick();assert.equal(host.player.sprinting,false);
  session.director.resumeAt('sprint-prompt');
  host.input({seq:2,forward:1,right:0,yaw:0,pitch:0,sprint:true});tick();assert.equal(host.player.sprinting,false);
  host.input({seq:3,forward:1,right:0,yaw:0,pitch:0,sprint:false});tick();
  host.input({seq:4,forward:1,right:0,yaw:0,pitch:0,sprint:true});tick();assert.equal(host.player.sprinting,true);
  host.close();
});
