import test from 'node:test';
import assert from 'node:assert/strict';
import {killFeedDeath,terminalAscensionFeed,vortexStreakFeed,graveTimeFeed} from './killFeedText.mjs';

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
  'so-fist-flick':['showed','fainted','finger'],
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
test('Finger Flick lines are reserved for real Flick finishers, never ordinary piston kills',()=>{
 const flick=new Set(Array.from({length:120},(_,i)=>
   killFeedDeath(death('so-fist-flick',null,i/30),'Rowan','Perry').text));
 assert.deepEqual(flick,new Set([
   'Rowan showed Perry the door',
   "Perry fainted at Rowan's accusation",
   'Rowan gave Perry the finger',
 ]));
 assert.ok(!flick.has(killFeedDeath(death('so-fist'),'Rowan','Perry').text));
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
 assert.ok(/hotter than|spun through|standing close/.test(vortex.text));
 const projectile=killFeedDeath(death('vortexFire'),'Aden','Enemy');
 assert.equal(projectile.streak,'vortex');
 assert.ok(/blazing balls from the blade battered|hotter than/.test(projectile.text));
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

test('extreme overkill alone can yield the mock saint or paragon epitaph',()=>{
 const samples=Array.from({length:180},(_,i)=>killFeedDeath(
   {...death('sword',null,i/30),extremeOverkill:true},'Rowan','Perry').text);
 assert.ok(samples.includes('Saint Perry the Deceased'));
 assert.ok(samples.includes('Perry became the paragon of death'));
 const ordinary=Array.from({length:300},(_,i)=>killFeedDeath(death('sword',null,i/30),'Rowan','Perry').text);
 assert.ok(!ordinary.includes('Saint Perry the Deceased'));
 assert.ok(!ordinary.includes('Perry became the paragon of death'));
});
test('should-have-guarded and repeat-killer taunts cannot appear without proven flags',()=>{
 const cases=[
  [{guardWouldSave:true},'Perry should\'ve guarded'],
  [{sameKillerDeaths:3},'Perry doesn\'t want to play anymore'],
  [{sameKillerDeaths:2},'Perry is contemplating whether to continue'],
 ];
 for(const [facts,line] of cases){
   const seen=new Set(Array.from({length:240},(_,i)=>killFeedDeath(
     {...death('sword',null,i/30),...facts},'Rowan','Perry').text));
   assert.ok(seen.has(line),line+' can be chosen when appropriate');
   const denied=new Set(Array.from({length:240},(_,i)=>killFeedDeath(
     death('sword',null,i/30),'Rowan','Perry').text));
   assert.ok(!denied.has(line),line+' is never fabricated');
 }
 const two=new Set(Array.from({length:240},(_,i)=>killFeedDeath(
   {...death('sword',null,i/30),sameKillerDeaths:2},'Rowan','Perry').text));
 assert.ok(!two.has('Perry doesn\'t want to play anymore'),'one recurrence is not an endless losing streak');
});
test('electrical reversal and near-full natural disaster report their actual causes',()=>{
 const backlash=death('electrical_backlash','shocking-conduct-interrupted');
 assert.equal(killFeedDeath(backlash,'Rowan','Perry').text,'Perry got struck instead...');
 const complete=death('one_hit_of_wonders','nearly-full-disaster');
 assert.equal(killFeedDeath(complete,'Rowan','Perry').text,
   'Rowan was so cool that Perry experienced aftershocks');
 const plain=killFeedDeath(death('one_hit_of_wonders'),'Rowan','Perry').text;
 assert.notEqual(plain,'Rowan was so cool that Perry experienced aftershocks');
});
test('fork, stunned, shocking conduct, armor and power are lightning-only variations',()=>{
 const lines=new Set(Array.from({length:450},(_,i)=>killFeedDeath(
   death('line_of_conduct',null,i/30),'Rowan','Perry').text));
 for(const fragment of ['was stunned','fork stuck in the wrong place','shocking conduct',
   'armor would insulate them','enough of Rowan\'s power'])
   assert.ok([...lines].some(line=>line.includes(fragment)),fragment);
 const fire=new Set(Array.from({length:150},(_,i)=>killFeedDeath(
   death('fireball',null,i/30),'Rowan','Perry').text));
 assert.ok(![...fire].some(line=>/fork stuck|shocking conduct|insulate them/.test(line)));
});
test('the pelt requires a real repeater barrage and the friend requires an actual HELLping crush',()=>{
 const shots=new Set(Array.from({length:180},(_,i)=>killFeedDeath(
   {...death('fight-flight-repeater',null,i/30),pelted:true},'Rowan','Perry').text));
 assert.ok(shots.has('Perry was pelted and is now a pelt'));
 const single=new Set(Array.from({length:180},(_,i)=>killFeedDeath(
   death('fight-flight-repeater',null,i/30),'Rowan','Perry').text));
 assert.ok(!single.has('Perry was pelted and is now a pelt'));
 assert.equal(killFeedDeath(death('hellping-crush'),'Rowan','Perry').text,
   "Rowan wouldn't become Perry's friend");
 assert.notEqual(killFeedDeath(death('so-fist'),'Rowan','Perry').text,
   "Rowan wouldn't become Perry's friend");
});
test('rare personal remarks appear without flooding the combat-specific variations',()=>{
 const sword=new Set(Array.from({length:4000},(_,i)=>killFeedDeath(
   death('sword',null,i/30),'Rowan','Perry',{mode:'BREAKTHROUGH'}).text));
 assert.ok(sword.has("Perry couldn't make it to the restroom in time"));
 assert.ok(sword.has('Perry will take this personally'));
 assert.ok(sword.has('Perry! You made it onto here!'));
 const noRespawn=new Set(Array.from({length:3000},(_,i)=>killFeedDeath(
   death('sword',null,i/30),'Rowan','Perry',{mode:'EDGE_OF_VICTORY'}).text));
 assert.ok(noRespawn.has('Perry will NOT be bouncing back'));
 assert.ok(!noRespawn.has('Perry will take this personally'));
});
test('shared grave only contains real named companions and preserves original wording',()=>{
 assert.equal(graveTimeFeed('Perry',[]),null);
 assert.equal(graveTimeFeed('Perry',['Rowan','Rowan','Perry']).text,
   'Perry is going to have a grave time along with Rowan');
});
