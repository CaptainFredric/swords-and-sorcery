import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LocalHost } from '../network/LocalHost.mjs';
import { TutorialSession } from './TutorialSession.mjs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialVoice } from './tutorialVoice.mjs';
import { TUTORIAL_BRANCHES } from './tutorialScript.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { SPRINT } from '../../shared/src/movement.mjs';

const takes = JSON.parse(readFileSync(new URL('../assets/tutorial-voice/manifest.json', import.meta.url))).takes;
function fixture() {
  let now = 10;
  const host = new LocalHost({ now: () => now, every: () => 1, cancel: () => {}, later: () => {} });
  host.startTutorial('You');
  const session = new TutorialSession(host, { random: () => .25 }); session.start();
  const tick = () => { now += 1/30; host.tick(); };
  return { host, session, tick, now: () => now, rival: () => host.room.players.get(session.rivalId) };
}

test('the unchanged voice loader falls back to MP3 when AAC decoding fails and caches the result', async () => {
  const key='tutorial.greeting',take=takes[key],requests=[];
  const voice=new TutorialVoice({engine:{ctx:{decodeAudioData:async data=>{
    if(data.codec==='m4a')throw new Error('AAC unavailable');
    return {duration:take.seconds};
  }}},fetch:async url=>{
    if(url.endsWith('manifest.json'))return {ok:true,json:async()=>({takes:{[key]:take}})};
    requests.push(url);return {ok:true,arrayBuffer:async()=>({codec:url.endsWith('.m4a')?'m4a':'mp3'})};
  }});
  await voice.load();const buffer=await voice.buffer(key);
  assert.equal(buffer.duration,take.seconds);
  assert.equal(await voice.buffer(key),buffer);
  assert.equal(requests.length,2);
  assert.ok(requests[0].endsWith('.m4a'));assert.ok(requests[1].endsWith('.mp3'));
});

test('one uninterrupted Sprint request earns sustained Sprint and exhaustion during the real recorded explanation', () => {
  const { host, session, tick, now } = fixture();
  session.stage('stamina'); session.director.resumeAt('sprint-prompt');
  const d = session.director, started = now(), observed = [], firstEarned = {};
  let audio = null;
  for (let i = 0; i < 30*40 && d.current?.id !== 'recover-prompt'; i++) {
    const cue = d.cue;
    if (cue && !audio) { d.beginAudio(cue); audio = { cue, end: now()+takes[cue.recordingKey].seconds }; observed.push(cue.id); }
    host.input({ forward: 1, right: 0, yaw: 0, pitch: 0, sprint: true });
    tick();
    for (const fact of ['sprint-started', 'stamina-decreased', 'sprint-sustained', 'player-winded']) {
      if (d.facts.has(fact)) firstEarned[fact] ??= now()-started;
    }
    if (audio && now() >= audio.end) { d.completeDialogue(audio.cue); audio = null; }
  }
  assert.ok(firstEarned['sprint-sustained'] >= 2.5 && firstEarned['sprint-sustained'] < 3);
  assert.ok(firstEarned['player-winded'] >= 9.9 && firstEarned['player-winded'] < 10.5);
  assert.ok(observed.includes('can-do-all-day'));
  assert.ok(observed.includes('cannot-sprint'));
  assert.ok(observed.includes('good-question'));
  assert.equal(SPRINT.staminaPerSec, 10);
  assert.equal(SPRINT.restartStamina, 25);
  host.close();
});

test('the same genuine first Fireball hit completes the lesson before its queued constitution aside', () => {
  const { host, session, tick, now, rival } = fixture();
  session.stage('fireball'); session.director.resumeAt('fireball-prompt'); session.rival.enter('rival-escape',now());
  session.rival.waypoint=GREENER_ROUTE.chaseWaypoints.findIndex(p=>p.id==='cart-gap');
  host.player.position = { x: 30, y: 0, z: -42 }; rival().position = { x: 30, y: 0, z: -46 }; rival().health = 10; rival().lastDamageAt = now();
  host.cast({ x: 0, y: 0, z: -1 });
  for (let i = 0; i < 45 && !session.firstFireballHit; i++) {
    const p=host.player.position,r=rival().position;
    host.input({forward:0,right:0,yaw:Math.atan2(-(r.x-p.x),-(r.z-p.z)),pitch:0}); tick();
  }
  assert.equal(session.firstFireballHit, true);
  assert.equal(rival().health, 1);
  const d=session.director;
  assert.equal(d.cue?.id, 'rival-cold');
  assert.equal(d.optionalCue, null);
  assert.ok(d.branchesSeen.has('rival-constitution'));
  for (const id of ['rival-cold','warm-feelings','concerning']) {
    assert.equal(d.cue.id,id); d.completeDialogue(d.cue);
  }
  assert.equal(d.optionalCue?.id, 'constitution-strange');
  assert.equal(d.offerBranch('rival-constitution'),false);
  host.close();
});

test('a hit during another real take gets the next clean boundary without dropping the interrupted lesson', () => {
  const d=new TutorialDirector(); d.start(); d.resumeAt('why-spellblade'); d.tick(10);
  const current=d.cue; d.beginAudio(current);
  d.fact('fireball-hit'); d.offerBranch('rival-constitution'); d.tick(13);
  assert.equal(d.cue?.id,'why-spellblade');
  d.completeDialogue(current); d.tick(13.36);
  assert.equal(d.cue?.id,'rival-cold');
  for (const id of ['rival-cold','warm-feelings','concerning']) { assert.equal(d.cue.id,id);d.completeDialogue(d.cue); }
  assert.equal(d.current.id,'spell-blade');
  for(let i=0;d.optionalCue&&i<30;i++) { d.completeOptionalDialogue(d.optionalCue); d.tick(14+i); }
  for (let i=0;i<20&&d.current.segment==='fireball';i++) {
    assert.ok(!['rival-cold','warm-feelings','concerning'].includes(d.current.id),'reaction must never replay');
    if (d.cue) d.completeDialogue(d.cue); else d.tick(20+i);
  }
  assert.equal(d.current.segment,'tattle-reveal');
});

test('a playing aside is allowed to finish its current recording before an urgent reaction, then resumes', () => {
  const d=new TutorialDirector();d.start();d.resumeAt('fireball-prompt');d.offerBranch('rival-constitution');d.tick(10);
  const aside=d.optionalCue; d.beginAudio(aside);d.fact('fireball-hit');d.tick(12);
  assert.equal(d.optionalCue.id,aside.id);
  d.completeOptionalDialogue(aside);d.tick(12.36);
  assert.equal(d.cue?.id,'rival-cold');
  for(let i=0;i<3;i++)d.completeDialogue(d.cue);
  assert.equal(d.optionalCue.id,'not-strange');
  assert.equal(TUTORIAL_BRANCHES['rival-constitution'].find(b=>b.id==='not-strange').pauseAfterSec,.15);
});

test('ordinary Rival defeat cancels a final-duel aside still playing and ignores its old take', () => {
  const d=new TutorialDirector();d.start();d.resumeAt('defeat-rival');
  d.offerBranch('final-feelings'); const old=d.optionalCue;d.beginAudio(old);
  assert.equal(old.id,'feelings-health');
  d.fact('rival-defeated');
  assert.equal(d.current.id,'who-are-you');
  assert.equal(d.optionalCue,null);
  assert.equal(d.branchQueue.length,0);
  assert.equal(d.completeOptionalDialogue(old),false);
});

test('urgent feedback cannot split either authored rapid reply pair', () => {
  for(const [branch,first,reply,pause] of [['rival-constitution','not-strange','not-fallen',.15],['permission-to-stop','permission-no','then-no',.08]]) {
    const d=new TutorialDirector();d.start();d.resumeAt('fireball-prompt');d.offerBranch(branch);d.tick(10);
    while(d.optionalCue.id!==first)d.completeOptionalDialogue(d.optionalCue);
    const cue=d.optionalCue;d.beginAudio(cue);d.fact('fireball-hit');d.completeOptionalDialogue(cue);
    d.tick(10+pause+.01);
    assert.equal(d.optionalCue.id,reply);
    assert.equal(d.cue,null);
    d.completeOptionalDialogue(d.optionalCue);
    assert.equal(d.cue.id,'rival-cold');
  }
});

test('pursuit remains available from escape onset through long VO and never grants opening controls', () => {
  const { host,session,tick,now,rival }=fixture();
  assert.equal(session.allows('move',false),false);
  session.stage('real-duel'); session.director.resumeAt('pursuit-release');
  host.player.position={x:0,y:0,z:-12};rival().position={x:0,y:0,z:-15};
  const started=now();tick();tick();const cue=session.director.cue;session.director.beginAudio(cue);
  let released=null;
  for(let i=0;i<30*8;i++) {
    host.input({forward:1,right:0,yaw:0,pitch:0,sprint:true});tick();
    if(session.allows('move',false)&&released===null)released={after:now()-started,gap:Math.hypot(rival().position.x-host.player.position.x,rival().position.z-host.player.position.z)};
  }
  assert.ok(released&&released.after<.2,JSON.stringify(released));
  assert.equal(session.director.progress.segment.scene.releaseControls,undefined);
  assert.equal(session.director.cue.id,cue.id,'movement must not cut off the recording');
  assert.ok(host.player.position.z < -12);
  assert.equal(session.allows('spell',false),false);
  host.close();
});
