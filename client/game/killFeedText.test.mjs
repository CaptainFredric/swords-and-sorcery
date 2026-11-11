import test from 'node:test';
import assert from 'node:assert/strict';
import {killFeedDeath,terminalAscensionFeed,vortexStreakFeed} from './killFeedText.mjs';

const death=(source,killContext=null,at=12.25)=>({
 type:'death',source,killerId:'A',victimId:'B',at,...(killContext?{killContext}:{})
});
test('Chivalry mastery uses actual finishing context instead of renaming every sword kill',()=>{
 assert.deepEqual(killFeedDeath(death('sword','chivalry'),'Aden','Sir Perry'),{
   text:'Aden mastered Sir Perry',kind:'sword'});
 assert.deepEqual(killFeedDeath(death('fireball','chivalry'),'Aden','Sir Perry'),{
   text:'Aden mastered Sir Perry',kind:'sword'});
 assert.notEqual(killFeedDeath(death('sword'),'Aden','Sir Perry').text,'Aden mastered Sir Perry');
 assert.notEqual(killFeedDeath(death('bibye-siege','chivalry'),'Aden','Sir Perry').text,
   'Aden mastered Sir Perry','actual siege-bolt finisher retains its own cause');
});
test('machine ammunition, swords, gauntlets and physical rotor have distinct kill verbs',()=>{
 const cases={
  'fight-flight-repeater':['tranquilized','pin-cushioned'],
  'fight-flight-rotor':['rotor-blades','for a spin'],
  'bibye-siege':['stuck around','bad name','got through','bolted away'],
  'bibye-conditioning':['chilled out','calm down','first bolt'],
  'so-fist':['handshake','broke','ahold'],
  'knock-on-steel':['ran through','battering ram'],
  'bibye-sharp-turn':['decoration','sharp turn','admired'],
  'ram':['knocked down','misremembered'],
 };
 for(const [source,verbs] of Object.entries(cases)){
   let seen=new Set();
   for(let i=0;i<120;i++){
     const copy=killFeedDeath(death(source,null,i/30),'Aden','Enemy');
     assert.equal(copy.kind==='sword'||copy.kind==='frost',true);
     assert.ok(copy.text.includes('Aden')&&copy.text.includes('Enemy'),source);
     assert.ok(verbs.some(verb=>copy.text.includes(verb)),source+': '+copy.text);
     seen.add(copy.text);
   }
   assert.ok(seen.size>=2,source+' has more than one actual variation');
 }
 const dash=killFeedDeath(death('fight-flight-rotor','rotorDash'),'Aden','Enemy');
 assert.ok(dash.text.includes('rotor-blades')||dash.text.includes('for a spin'));
});
test('Coreflagration only claims a second explosion if the lethal contact was the second burst',()=>{
 for(let i=0;i<45;i++){
  const initial=killFeedDeath(death('coreflagration','coreflagration-first',i/30),'Aden','Enemy');
  assert.doesNotMatch(initial.text,/twice|exploded twice/i);
  assert.ok(initial.text.includes('Enemy'));
 }
 const finale=new Set(Array.from({length:90},(_,i)=>
   killFeedDeath(death('coreflagration','coreflagration-final',i/30),'Aden','Enemy').text));
 assert.ok([...finale].some(line=>line.includes('twice')));
});
test('Sunder Rupture, Vortex and Renown Trial finishers have meaningful contexts',()=>{
 const rip=killFeedDeath(death('rupture'),'Aden','Enemy');
 assert.ok(/withstand|stand on|ruptured|staggering/.test(rip.text));
 const sunder=killFeedDeath(death('sword','sunder'),'Aden','Enemy');
 assert.ok(/withstand|stand on|ruptured|staggering/.test(sunder.text));
 const vortex=killFeedDeath(death('vortexFire'),'Aden','Enemy');
 assert.equal(vortex.streak,'vortex');
 assert.equal(vortex.text,'Aden is hotter than Enemy');
 assert.equal(vortexStreakFeed('Aden',['Enemy','Rival','Enemy']).text,
  'Aden is hotter than Enemy, Rival');
 const renown=Array.from({length:70},(_,i)=>killFeedDeath(
   death('sword',null,i/30),'Aden','Enemy',{mode:'RENOWN_TRIALS'}).text);
 assert.ok(renown.some(s=>s.includes('ren-OWNED')));
});
test('Valkyrie suicide appears only in its separate single or group Ascension feed',()=>{
 const d=death('fight-flight-terminal');d.killerId=null;d.victimId='A';
 assert.equal(killFeedDeath(d,'Aden','Aden'),null,'self-death never prints a generic abyss line');
 assert.equal(killFeedDeath(death('fight-flight-terminal'),'Aden','Enemy'),null,
   'the individual enemy death is not printed again');
 assert.deepEqual(terminalAscensionFeed('Aden',[]),{text:'Aden Ascended',kind:'fire'});
 assert.equal(terminalAscensionFeed('Aden',['Enemy','Rival','Enemy']).text,
   'Aden Ascended with Enemy, Rival');
});
test('Uncredited falls do not invent a machine killer or an opponent',()=>{
 const d={type:'death',source:'abyss',victimId:'B',killerId:null,at:12};
 const feed=killFeedDeath(d,null,'Enemy');
 assert.equal(feed.kind,'abyss');
 assert.ok(feed.text.includes('Enemy'));
 assert.ok(!feed.text.includes('undefined'));
});
