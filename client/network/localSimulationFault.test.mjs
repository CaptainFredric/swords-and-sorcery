import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalHost} from './LocalHost.mjs';

test('a local simulation exception becomes a visible, rate-limited fault instead of silent actor freeze',()=>{
 let at=10;
 const host=new LocalHost({now:()=>at,every:()=>0,cancel:()=>{},later:fn=>fn(),storage:null});
 host.room={code:'BUGGY',mode:'PRACTICE',state:'PLAYING',
   // Inject an invalid simulator fixture: bots cannot be stepped.
   players:null,world:{floors:[],ramps:[],solids:[]}};
 const notices=[],previous=console.error;
 console.error=()=>{};
 try{
  host.on('error',message=>notices.push(message.message));
  assert.doesNotThrow(()=>host.tick(10),'tick callback must handle its own error');
  assert.ok(host.lastSimulationFault?.detail);
  assert.equal(host.lastSimulationFault?.roomCode,'BUGGY');
  assert.match(notices[0],/Local simulation stopped updating/);
  at=11;
  assert.doesNotThrow(()=>host.tick(11));
  assert.equal(notices.length,1,'a recurring failure cannot spam at the 30Hz tick rate');
  at=16;
  host.tick(16);
  assert.equal(notices.length,2,'still faulty after five seconds yields a further report');
  host.room=null;
  host.tick(17);
  assert.equal(host.lastSimulationFault,null,'recovered ticks clear the diagnosis');
 }finally{console.error=previous;host.close();}
});
