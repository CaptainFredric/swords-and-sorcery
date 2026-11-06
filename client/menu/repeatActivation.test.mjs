import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepeatActivation } from './repeatActivation.mjs';

test('first click merely selects even a default option, second deliberate click launches',()=>{
  let current='bot',launches=0;
  const a=createRepeatActivation({selected:()=>current,select:id=>current=id,activate:()=>{launches++;return true;}});
  a.choose('bot',1000);assert.equal(launches,0);
  a.choose('bot',1150);assert.equal(launches,0,'double-tap is ignored');
  a.choose('bot',1400);assert.equal(launches,1);
  a.choose('bot',1900);a.run();assert.equal(launches,1,'only one request is dispatched');
});
test('changing selection re-arms the chosen mode, without launching the previous one',()=>{
  let current='bot',ran=[];
  const a=createRepeatActivation({selected:()=>current,select:id=>current=id,activate:id=>{ran.push(id);return true;}});
  a.choose('bot',1000);a.choose('practice',1400);assert.deepEqual(ran,[]);
  a.choose('practice',1800);assert.deepEqual(ran,['practice']);
});
test('failed validation and errors allow retry, disabled actions do not dispatch',()=>{
  let current='practice',enabled=false,ok=false,ran=0;
  const a=createRepeatActivation({selected:()=>current,select:id=>current=id,canActivate:()=>enabled,activate:()=>{ran++;return ok;}});
  a.choose('practice',1000);a.choose('practice',1500);assert.equal(ran,0);
  enabled=true;a.run();assert.equal(ran,1);assert.equal(a.pending,false);
  ok=true;a.run();assert.equal(ran,2);assert.equal(a.pending,true);
  a.release();a.run();assert.equal(ran,3);
});
