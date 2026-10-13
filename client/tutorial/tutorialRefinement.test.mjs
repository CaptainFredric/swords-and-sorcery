import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';

function fixture() {
  let now = 10;
  const host = new LocalHost({now:()=>now,every:()=>1,cancel:()=>{},later:()=>{}});
  host.startTutorial('You');
  const session = new TutorialSession(host,{random:()=>.25}); session.start();
  const tick = (n=1)=>{for(let i=0;i<n;i++){now+=1/30;host.tick();}};
  return {host,session,tick,actor:()=>host.room.players.get(session.rivalId)};
}

test('opening permissions follow LOOK and WALK prompts and the local boundary rejects premature aim and travel',()=>{
  const {host,session,tick}=fixture();
  const origin={...host.player.position},yaw=host.player.yaw;
  assert.equal(session.allows('look',false),false); assert.equal(session.allows('move',false),false);
  host.input({seq:1,forward:1,right:0,yaw:1,pitch:.4,sprint:true}); tick(10);
  assert.deepEqual(host.player.position,origin);assert.equal(host.player.yaw,yaw);
  session.director.resumeAt('look-prompt');
  assert.equal(session.allows('look',false),true);assert.equal(session.allows('move',false),false);
  session.director.resumeAt('also-walk');assert.equal(session.allows('move',false),false);
  session.director.resumeAt('walk-prompt');
  host.input({seq:2,forward:1,right:0,yaw:0,pitch:0});tick(5);assert.deepEqual(host.player.position,origin);
  host.input({seq:3,forward:0,right:0,yaw:0,pitch:0});tick();
  host.input({seq:4,forward:1,right:0,yaw:0,pitch:0});tick(5);assert.ok(host.player.position.z<origin.z);
  assert.equal(session.allows('sprint',false),false);host.close();
});

test('escaping Rival physically gains distance while the authored escape preserves player travel',()=>{
  const {host,session,tick,actor}=fixture();session.director.resumeAt('pursuit-release');
  host.player.position={x:0,y:0,z:-12};actor().position={...GREENER_ROUTE.rivalMeeting};
  const origin={...host.player.position},rivalOrigin={...actor().position};
  host.input({seq:1,forward:1,right:0,yaw:1,pitch:0,sprint:true});tick(30);
  assert.notDeepEqual(host.player.position,origin);assert.equal(host.player.yaw,1);
  assert.ok(Math.hypot(actor().position.x-rivalOrigin.x,actor().position.z-rivalOrigin.z)>5);
  assert.equal(session.allows('move',false),true);
  assert.ok(session.director.facts.has('rival-escaping'));host.close();
});

test('a grounded walk around the stile cannot earn the ordinary Jump crossing fact',()=>{
  const {host,session,tick}=fixture();session.director.resumeAt('jump-prompt');
  host.player.position={...GREENER_ROUTE.jump.landing};host.player.grounded=true;tick();
  assert.equal(session.director.facts.has('jump-crossed'),false);
  assert.equal(session.director.facts.has('jump-used'),false);host.close();
});

test('constitutional survivability is offered once for real otherwise lethal pursuit punishment, never for setup damage',()=>{
  const {host,session}=fixture();
  const event={type:'damage',victimId:session.rivalId,attackerId:host.player.id,source:'fireball',amount:45,health:1};
  session.events([event]);assert.equal(session.director.branchesSeen.has('rival-constitution'),false);
  session.director.resumeAt('fireball-prompt');session.rival.enter('rival-escape',host.now());session.events([event]);session.events([event]);
  assert.equal(session.director.branchesSeen.has('rival-constitution'),true);
  assert.equal(session.director.branchQueue.filter(x=>x.id==='constitution-strange').length,1);host.close();
});

test('a sword contact as Rival walks off is no pursuit punishment; one in the pursuit offers the constitution aside',()=>{
  const {host,session,tick}=fixture();session.director.resumeAt('successful-expulsion');
  const lethal={type:'damage',victimId:session.rivalId,attackerId:host.player.id,source:'sword',amount:22,health:1};
  session.events([lethal]);
  assert.equal(session.director.branchesSeen.has('rival-constitution'),false);
  assert.equal(session.director.facts.has('rival-survived-lethal'),false);
  session.director.resumeAt('hardly-wellbeing');tick();
  session.events([lethal]);
  assert.ok(session.director.facts.has('rival-survived-lethal'));
  while(session.director.current.id!=='remains-ahead')session.director.completeDialogue(session.director.cue);
  tick();assert.equal(session.director.branchesSeen.has('rival-constitution'),true);
  assert.equal(session.allows('move',false),true);host.close();
});

test('an ordinary Rival abyss death restores the recent checkpoint rather than awarding the final victory',()=>{
  const {host,session,tick,actor}=fixture();session.stage('bridge-dash');session.director.resumeAt('bridge-arrival');
  const run=session.director.runId;actor().position={x:32,y:-10,z:(GREENER_ROUTE.bridge.gapBounds.minZ+GREENER_ROUTE.bridge.gapBounds.maxZ)/2};actor().grounded=false;
  tick(2);
  assert.equal(actor().alive,true);assert.equal(host.player.alive,true);
  assert.equal(session.director.current.id,'bridge-arrival');assert.ok(session.director.runId>run);
  assert.equal(session.director.facts.has('rival-defeated'),false);
  assert.deepEqual(host.player.position,{x:GREENER_ROUTE.checkpointPositions.bridge.x,y:0,z:GREENER_ROUTE.checkpointPositions.bridge.z});
  assert.equal([...host.room.players.values()].filter(p=>p.actorKind==='dummy').length,1);host.close();
});
