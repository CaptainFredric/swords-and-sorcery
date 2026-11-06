import test from 'node:test';
import assert from 'node:assert/strict';
import { createRepeatActivation } from './repeatActivation.mjs';

test('the second click launches immediately, even for an already selected default and a rapid double-tap',()=>{
  let current='bot',launches=0;
  const a=createRepeatActivation({selected:()=>current,select:id=>current=id,activate:()=>{launches++;return true;}});
  a.choose('bot');assert.equal(launches,0);
  a.choose('bot');assert.equal(launches,1,'the immediate second click launches, no delay gate');
  a.choose('bot');a.run();assert.equal(launches,1,'only one request is dispatched');
});
test('changing selection re-arms the chosen mode, without launching the previous one',()=>{
  let current='bot',ran=[];
  const a=createRepeatActivation({selected:()=>current,select:id=>current=id,activate:id=>{ran.push(id);return true;}});
  a.choose('bot');a.choose('practice');assert.deepEqual(ran,[]);
  a.choose('practice');assert.deepEqual(ran,['practice']);
});
test('failed validation and errors allow retry, disabled actions do not dispatch',()=>{
  let current='practice',enabled=false,ok=false,ran=0;
  const a=createRepeatActivation({selected:()=>current,select:id=>current=id,canActivate:()=>enabled,activate:()=>{ran++;return ok;}});
  a.choose('practice');a.choose('practice');assert.equal(ran,0);
  enabled=true;a.run();assert.equal(ran,1);assert.equal(a.pending,false);
  ok=true;a.run();assert.equal(ran,2);assert.equal(a.pending,true);
  a.release();a.run();assert.equal(ran,3);
});

test('selection remains armed through settings inspection, retry after validation and explicit reset',()=>{
  let current='practice', attempts=0, success=false;
  const a=createRepeatActivation({selected:()=>current,select:id=>current=id,activate:()=>{attempts++;return success;}});
  a.choose('practice'); // Select first, then inspect and adjust settings
  a.choose('practice');assert.equal(attempts,1,'second press dispatches even when validation rejects');
  success=true;a.choose('practice');assert.equal(attempts,2,'same selection can be retried');
  a.reset();a.choose('practice');assert.equal(attempts,2,'re-entering menu needs a fresh first click');
  a.choose('practice');assert.equal(attempts,3);
});
