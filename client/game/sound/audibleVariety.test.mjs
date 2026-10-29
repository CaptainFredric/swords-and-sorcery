import test from 'node:test';import assert from 'node:assert/strict';
import {AudibleHistory} from './audibleHistory.mjs';import {VoiceDirector} from './voiceRules.mjs';import {VoiceBank} from './VoiceBank.mjs';
test('only audible presentation history in the nearby place suppresses another knight repeating a sentence',()=>{const h=new AudibleHistory();h.note('defeat','a',1,{x:0,z:0});assert.equal(h.scale('defeat','b',5,{x:5,z:0}),.08);assert.equal(h.scale('defeat','b',5,{x:30,z:0}),1);assert.equal(h.scale('defeat','b',35,{x:5,z:0}),1);assert.equal(h.scale('defeat','a',5,{x:5,z:0}),1);assert.equal(h.scale('defeat','b',0,{x:5,z:0}),1);});
test('recorded chorus starts overlapping buffers and normal dialogue remains serialized afterward',()=>{const played=[];const engine={running:true,now:1,onReady:()=>{},playBuffer:(buffer,options)=>{const h={stop(){h.stopped=true}};played.push({buffer,options,h});return h;}};const director=new VoiceDirector({rand:()=>.99});const bank=new VoiceBank(engine,{director,timbre:null});bank.takes.set('defeat',[{duration:2}]);bank.takes.set('galeTaunt',[{duration:2}]);const speakers=[{playerId:'a',position:{x:0,z:0},delay:0,gain:.8},{playerId:'b',position:{x:4,z:0},delay:.15,gain:.8}];const event={id:'real-group',line:'defeat',speakers};assert.equal(bank.sayChorus(event,speakers),true);assert.equal(played.length,2);assert.ok(played[1].options.delay<played[0].buffer.duration);assert.ok(played.every(p=>!p.h.stopped));assert.ok(played.reduce((n,p)=>n+p.options.gain,0)<=.8);assert.equal(bank.say('galeTaunt',{speaker:'c',force:true}),false);assert.equal(bank.sayChorus(event,speakers),false);director.choruses.clear();assert.equal(director.consider('defeat','c',1.2,{force:true}),null);});
test('chorus exception cannot override an unrelated important state line',()=>{const d=new VoiceDirector({rand:()=>0});assert.ok(d.consider('sunderCall','c',1,{duration:3}));assert.equal(d.beginChorus('g',['a','b'],1.1),false);});

test('cancelling a delayed recording before it starts leaves no audible history',()=>{
  const engine={running:true,now:1,onReady:()=>{},playBuffer:()=>({stop(){}})};
  const bank=new VoiceBank(engine,{director:new VoiceDirector({rand:()=>0}),timbre:null});
  bank.takes.set('defeat',[{duration:2}]);
  assert.ok(bank.say('defeat',{speaker:'a',gain:.8,source:{x:0,z:0},delay:1,force:true}));
  engine.now=1.5;bank.cut('a');engine.now=3;
  assert.equal(bank.audibleHistory.scale('defeat','b',engine.now,{x:0,z:0}),1);
});

test('eligible alternatives change order only within the same priority slots',()=>{
  const engine={running:true,now:5,onReady:()=>{}};
  const bank=new VoiceBank(engine,{timbre:null});
  bank.audibleHistory.note('defeat','a',1,{x:0,z:0});
  const repeated={line:'defeat',speaker:'b'},alternative={line:'magicDefeat',speaker:'b'};
  // Use an actual alternative declared at the same priority as defeat.
  const candidates=[repeated,{line:'sunderCall',speaker:'c',cry:true},alternative];
  const varied=bank.varied(candidates,()=>({x:0,z:0}));
  assert.equal(varied[1],candidates[1]);
  assert.equal(varied[0],alternative);
  assert.equal(varied[2],repeated);
});


test('silent voice output never suppresses a later audible speaker',()=>{
  const engine={running:true,now:1,levels:{master:1,voice:0},onReady:()=>{},playBuffer:()=>({stop(){}})};
  const bank=new VoiceBank(engine,{director:new VoiceDirector({rand:()=>0}),timbre:null});
  bank.takes.set('defeat',[{duration:2}]);bank.say('defeat',{speaker:'a',force:true,source:{x:0,z:0}});
  engine.now=3;assert.equal(bank.audibleHistory.scale('defeat','b',3,{x:0,z:0}),1);
});
