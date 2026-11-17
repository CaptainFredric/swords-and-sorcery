import test from 'node:test';
import assert from 'node:assert/strict';
import {killFeedDeath,terminalAscensionFeed,vortexStreakFeed,graveTimeFeed,groupCheatingFeed,groupHeroFeed,allowsSharedHeroEpitaph} from './killFeedText.mjs';

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
  'bibye-siege':['stuck around','bad name','got through','bolted away','ballista bolt'],
  'bibye-conditioning':['chilled out','calm down'],
  'so-fist':['handshake','broke','ahold','convinced'],
  'so-fist-flick':['showed','fainted','finger'],
  'knock-on-steel':['ran through','battering ram','battery'],
  'bibye-sharp-turn':['decoration','sharp turn','admired'],
  'ram':['knocked down','misremembered','convinced'],
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

test('extreme overkill preserves both existing saint and paragon epitaphs',()=>{
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
test('original Lightning lines remain available and armor claims require real Steel',()=>{
 const lines=new Set(Array.from({length:450},(_,i)=>killFeedDeath(
   death('line_of_conduct',null,i/30),'Rowan','Perry').text));
 for(const fragment of ['was stunned','fork stuck in the wrong place','shocking conduct','enough of Rowan\'s power'])
   assert.ok([...lines].some(line=>line.includes(fragment)),fragment);
 const fire=new Set(Array.from({length:150},(_,i)=>killFeedDeath(
   death('fireball',null,i/30),'Rowan','Perry').text));
 assert.ok(![...fire].some(line=>/fork stuck|shocking conduct|insulate them/.test(line)));
 assert.ok(![...lines].some(line=>line.includes('insulate them')),
   'claiming armor insulation requires authoritative steeled evidence');
 const armored=new Set(Array.from({length:450},(_,i)=>killFeedDeath(
   {...death('line_of_conduct',null,i/30),steeled:true},'Rowan','Perry').text));
 assert.ok(armored.has('Perry believed their armor would insulate them'));

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

test('lightning-teleport ground slam alone gets the element-of-surprise epitaph',()=>{
 const surprise=death('one_hit_of_wonders','lightning-teleport-slam');
 assert.equal(killFeedDeath(surprise,'Rowan','Perry').text,
   'Perry forgot the element of surprise');
 assert.notEqual(killFeedDeath(death('one_hit_of_wonders'),'Rowan','Perry').text,
   'Perry forgot the element of surprise');
});
test('ballista bolt and the ram charge have their own absurd questions and batteries',()=>{
 const bolts=new Set(Array.from({length:300},(_,i)=>killFeedDeath(
   death('bibye-siege',null,i/30),'Rowan','Perry').text));
 assert.ok(bolts.has("Why did Rowan's ballista bolt kill you, Perry?"));
 assert.ok([...bolts].some(t=>t.includes('bolted away')));
 assert.ok([...bolts].some(t=>t.includes('got through')));
 const ram=new Set(Array.from({length:240},(_,i)=>killFeedDeath(
   death('knock-on-steel',null,i/30),'Rowan','Perry').text));
 assert.ok(ram.has('Rowan was charged with assault and battery against Perry'));
 assert.ok(ram.has('Rowan assaulted Perry and no longer has battery'));
});
test('additional dry remarks are available rarely; gale exaggeration and abyss kingdom stay contextual',()=>{
 const swords=new Set(Array.from({length:9000},(_,i)=>killFeedDeath(
   death('sword',null,i/30),'Rowan','Perry',{mode:'BREAKTHROUGH'}).text));
 assert.ok(swords.has('Perry is actually a squire in disguise'));
 assert.ok(swords.has('Perry is wondering why this message is being shown'));
 const gales=new Set(Array.from({length:180},(_,i)=>killFeedDeath(
   death('gale',null,i/30),'Rowan','Perry').text));
 assert.ok(gales.has('Rowan blew that way out of proportion'));
 const falls=new Set(Array.from({length:180},(_,i)=>killFeedDeath(
   death('abyss',null,i/30),'Rowan','Perry').text));
 assert.ok(falls.has("And Perry ran off to kingdom come—don't come back"));
});
test('team-targeted accusation is impossible outside the victim viewer team and real repeated deaths',()=>{
 const options={mode:'BREAKTHROUGH'};
 const trueEvents=new Set(Array.from({length:9000},(_,i)=>killFeedDeath(
   {...death('sword',null,i/30),sameKillerDeaths:3,sameTeamAsViewer:true},
   'Rowan','Perry',options).text));
 assert.ok(trueEvents.has('Perry wants your team to lose'));
 const otherTeam=new Set(Array.from({length:9000},(_,i)=>killFeedDeath(
   {...death('sword',null,i/30),sameKillerDeaths:3,sameTeamAsViewer:false},
   'Rowan','Perry',options).text));
 assert.ok(!otherTeam.has('Perry wants your team to lose'));
});
test('the actual circle chase and sustained losing streak author special sarcastic remarks',()=>{
 const chase=new Set(Array.from({length:210},(_,i)=>killFeedDeath(
   {...death('sword',null,i/30),abandonedCaptureCircle:true},'Rowan','Perry').text));
 assert.ok(chase.has("Perry doesn't know how to stand in a circle"));
 const streak=new Set(Array.from({length:210},(_,i)=>killFeedDeath(
   {...death('sword',null,i/30),sameKillerDeaths:3},'Rowan','Perry').text));
 assert.ok(streak.has('Perry should really stop holding back'));
});
test('real multi-victim and multi-attacker events produce appropriate named group satire',()=>{
 const groupVictims=new Set(Array.from({length:250},(_,i)=>groupCheatingFeed(
   'Rowan',['Perry','Basil'],{source:'sword',killerId:'R',victimId:'B',at:i/30}).text));
 assert.ok(groupVictims.has('Perry and Basil think that Rowan must be cheating'));
 assert.ok(groupVictims.has('Perry is going to have a grave time along with Basil'));
 assert.equal(groupCheatingFeed('Rowan',['Perry']),null);
 const groupHeroes=new Set(Array.from({length:250},(_,i)=>groupHeroFeed(
   'Rowan',['Perry','Basil'],{source:'sword',killerId:'P',victimId:'R',at:i/30})?.text));
 assert.ok(groupHeroes.has('Rowan knows better than to mess with Perry, Basil'));
 assert.ok(groupHeroes.has("Perry and Basil didn't allow Rowan to be a hero..."));
 assert.equal(groupHeroFeed('Rowan',['Perry']),null);
});

test('Existing author-written phrases follow the actual lethal Disaster contact',()=>{
 const scenarios=[
  ['disaster-ground-slam',['knocked down','lay down arms'],'sword'],
  ['disaster-windblade',['blew Perry away','became winded','blew that way out of proportion'],'gale'],
  ['disaster-terminal-fire',['roasted','burned'],'fire'],
 ];
 for(const [context,parts,kind] of scenarios){
  const seen=new Set(Array.from({length:180},(_,i)=>
    killFeedDeath(death('one_hit_of_wonders',context,i/30),'Rowan','Perry').text));
  assert.equal(seen.size,parts.length,context+' all variants circulate');
  for(const part of parts)assert.ok([...seen].some(line=>line.includes(part)),context+' '+part);
  for(const line of seen) {
   assert.ok(line.includes('Rowan'),context+' names the killer');
   // The author's intentional "blew that way out of proportion" Gale
   // quip never identifies its victim. It was already valid in production:
   // do not rewrite it to satisfy an overstrict test.
   if(line.includes('blew that way out of proportion'))continue;
   assert.ok(line.includes('Perry'),context+' names the victim');
  }
  assert.equal(killFeedDeath(death('one_hit_of_wonders',context),'Rowan','Perry').kind,kind);
 }
 const old=killFeedDeath(death('one_hit_of_wonders'),'Rowan','Perry');
 assert.equal(old.text,'Rowan slew Perry','historic untagged events keep their existing fallback');
 assert.match(killFeedDeath(death('one_hit_vortex'),'Rowan','Perry').text,/became winded/);
 assert.match(killFeedDeath(death('one_hit_ground_fire'),'Rowan','Perry').text,/burned Perry down/);
 assert.doesNotMatch(killFeedDeath(death('sword'),'Rowan','Perry').text,/Disaster|Windblade/);
});
test('a real objective-chase death always earns its tactical insult',()=>{
 for(let i=0;i<80;i++){
  const event={...death('sword',null,i/30),abandonedCaptureCircle:true};
  assert.equal(killFeedDeath(event,'Rowan','Perry').text,
    "Perry doesn't know how to stand in a circle");
 }
 const plain=new Set(Array.from({length:1500},(_,i)=>
   killFeedDeath(death('sword',null,i/30),'Rowan','Perry',{mode:'HIGH_GROUNDS'}).text));
 assert.ok(!plain.has("Perry doesn't know how to stand in a circle"));
});
test('team-blame requires repeated kills on a genuine teammate',()=>{
 const options={mode:'BREAKTHROUGH'};
 const loops=flags=>new Set(Array.from({length:600},(_,i)=>
   killFeedDeath({...death('sword',null,i/30),...flags},'Rowan','Perry',options).text));
 assert.ok(loops({sameKillerDeaths:3,sameTeamAsViewer:true}).has('Perry wants your team to lose'));
 assert.ok(!loops({sameKillerDeaths:3,sameTeamAsViewer:false}).has('Perry wants your team to lose'));
 assert.ok(!loops({sameKillerDeaths:1,sameTeamAsViewer:true}).has('Perry wants your team to lose'));
});
test('an actual Squire is never called a secret squire',()=>{
 const lines=new Set(Array.from({length:9000},(_,i)=>
   killFeedDeath(death('sword',null,i/30),'Rowan','Squire Rowan').text));
 assert.ok(![...lines].some(line=>line.includes('squire in disguise')));
 const knight=new Set(Array.from({length:9000},(_,i)=>
   killFeedDeath(death('sword',null,i/30),'Rowan','Knight Perry').text));
 assert.ok(knight.has('Knight Perry is actually a squire in disguise'));
});

test('a generic multi-assist gag cannot erase an earned weapon finisher or tactical insult',()=>{
 for(const source of ['one_hit_of_wonders','one_hit_ground_fire','fight-flight-rotor','bibye-siege','so-fist-flick','abyss'])
  assert.equal(allowsSharedHeroEpitaph({source,damageContributors:['a','b']}),false,source);
 for(const context of ['chivalry','sunder','disaster-ground-slam','disaster-windblade','disaster-terminal-fire'])
  assert.equal(allowsSharedHeroEpitaph({source:'sword',killContext:context}),false,context);
 for(const [flag,value] of [['abandonedCaptureCircle',true],['guardWouldSave',true],
   ['extremeOverkill',true],['sameKillerDeaths',3]])
  assert.equal(allowsSharedHeroEpitaph({source:'sword',[flag]:value}),false,flag);
 for(const source of ['sword','fireball','burn','frostfire','gale','gauntlet','ram'])
  assert.equal(allowsSharedHeroEpitaph({source}),true,source+' supports ordinary genuine group-assist narration');
});

test('the six new author-written lines circulate only when their death context supports them',()=>{
 const samples=(source,flags={},count=500,mode='BREAKTHROUGH')=>
   new Set(Array.from({length:count},(_,i)=>
     killFeedDeath({...death(source,null,i/30),...flags},'Rowan','Perry',{mode}).text));

 // These two jokes require an actual large overkill, not a normal death.
 const overkill=samples('sword',{extremeOverkill:true});
 assert.ok(overkill.has('Perry is experiencing proper powerscaling'));
 assert.ok(overkill.has("Perry's going on a mantel..."));
 const ordinary=samples('sword',{},9000);
 assert.ok(!ordinary.has('Perry is experiencing proper powerscaling'));
 assert.ok(!ordinary.has("Perry's going on a mantel..."));

 // The narrator encourages a repeatedly defeated player before it finally
 // declares their will lost. Neither assessment appears for the first death.
 const repeated=samples('sword',{sameKillerDeaths:3});
 assert.ok(repeated.has('Keep it up, Perry!'));
 assert.ok(!repeated.has('Perry has lost his will.'));
 const prolonged=samples('sword',{sameKillerDeaths:4});
 assert.ok(prolonged.has('Perry has lost his will.'));
 assert.ok(!ordinary.has('Keep it up, Perry!'));
 assert.ok(!ordinary.has('Perry has lost his will.'));

 // The overly formal messenger is a RARE aside for an ordinary sword death.
 assert.ok(ordinary.has('Perry has just received news that Rowan has bested him.'));
 assert.ok(!samples('fight-flight-repeater',{},500).has(
   'Perry has just received news that Rowan has bested him.'));

 // Physical impacts get the negotiation gag. Ordinary arrow or lightning
 // kills do not misrepresent their cause as a knockdown.
 for(const source of ['ram','so-fist'])
   assert.ok(samples(source).has('Rowan convinced Perry to lie down first'),source);
 for(const source of ['fight-flight-repeater','line_of_conduct'])
   assert.ok(!samples(source).has('Rowan convinced Perry to lie down first'),source);
});

test('new lines keep actual player names and do not claim a killer for uncredited falls',()=>{
 const remarks=new Set(Array.from({length:700},(_,i)=>
   killFeedDeath({...death('sword',null,i/30),extremeOverkill:true,
     sameKillerDeaths:4},'Knight Ash','Baron Vale').text));
 assert.ok(remarks.has('Baron Vale is experiencing proper powerscaling'));
 assert.ok(remarks.has("Baron Vale's going on a mantel..."));
 assert.ok(remarks.has('Keep it up, Baron Vale!'));
 assert.ok(remarks.has('Baron Vale has lost his will.'));
 const withoutKiller=killFeedDeath({source:'abyss',killerId:null,victimId:'B',at:5},
   null,'Baron Vale');
 assert.ok(!withoutKiller.text.includes('Rowan'));
 assert.ok(!withoutKiller.text.includes('bested'));
});
