import test from 'node:test';
import assert from 'node:assert/strict';
import {chivalryActionOverlap} from './chivalryLinkState.mjs';

test('null mounted/terminal animation layers are empty, not an exception',()=>{
 for(const concurrent of [null,undefined,{}]){
  assert.equal(chivalryActionOverlap(concurrent),0);
 }
 // Server-authoritative terminal impact can leave Chivalry's visual
 // commitment fading while the client has no ordinary action layers.
 assert.doesNotThrow(()=>chivalryActionOverlap(null));
});

test('ordinary active Chivalry action flags retain their four-way overlap',()=>{
 assert.equal(chivalryActionOverlap({attack:true,guard:true,cast:true,dash:true}),4);
 assert.equal(chivalryActionOverlap({attack:true,guard:false,cast:true,dash:false}),2);
 assert.equal(chivalryActionOverlap({attack:false,guard:false,cast:false,dash:false}),0);
});
