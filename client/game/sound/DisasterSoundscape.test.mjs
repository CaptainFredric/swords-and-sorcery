import test from 'node:test';
import assert from 'node:assert/strict';
import {DisasterSoundscape} from './DisasterSoundscape.mjs';
const tiers=(value=0)=>({fire:value,frost:value,gale:value,lightning:value,steel:value});
function fixture(listener={x:0,y:0,z:0}){
  const played=[],stopped=[];
  const sound=new DisasterSoundscape({
    play:(recipe,point,gain,delay)=>{
      played.push({recipe,point,gain,delay});
      return {stop:fade=>stopped.push(fade)};
    },
    listener:()=>listener,
    playerPosition:id=>id==='a'?{x:0,y:1,z:0}:null,
    random:()=>.4,
  });
  return {sound,played,stopped,listener};
}
const field=(id='f',states=tiers(0),x=3)=>({
  id,ownerId:'a',position:{x,y:0,z:0},bornAt:0,until:5,tiers:states,
});
test('Coreflagration is armed, actively bubbles, then EXPLODES ONCE with a deep distinct final blast',()=>{
  const {sound,played,stopped}=fixture();
  sound.onEvent({type:'coreflagrationArmed',projectileId:'c1',point:{x:2,y:0,z:0},
    at:1,detonateAt:1.6});
  assert.equal(played.length,2,'arming and sustained bubbling are separate');
  assert.ok(played[1].recipe.layers.some(l=>(l.at??0)>.1),'magma bubbles over the fuse');
  sound.onEvent({type:'projectileImpact',projectileId:'c1',spell:'coreflagration',
    stage:'final',point:{x:2,y:0,z:0},at:1.6});
  assert.equal(played.length,3,'single deep second explosion');
  assert.equal(stopped.length,1,'cancel fuse sound at actual explosion');
  assert.equal(sound.cores.size,0,'no stale bubbling while the stone is gone');
  sound.dispose();
});
test('Line of Conduct is positional along its actual bolt, not just its caster',()=>{
  const {sound,played}=fixture({x:12,y:0,z:1});
  const snapshot={players:[{id:'a',position:{x:0,y:0,z:0},alive:true}]};
  sound.onEvent({type:'spellCast',spell:'line_of_conduct',playerId:'a',
    at:1,castEndsAt:1.45},snapshot);
  assert.equal(played.length,1,'distinct rising charge');
  sound.onEvent({type:'lineConductDischarge',playerId:'a',
    origin:{x:0,y:0,z:0},end:{x:40,y:0,z:0},at:1.45},snapshot);
  assert.equal(played.length,3,'source crack plus listener-nearest wire crackle');
  assert.ok(Math.abs(played[2].point.x-12)<.01,'nearest point of 40m wire');
  assert.ok(played[1].recipe.layers.some(l=>l.type==='tone'&&l.freq<100));
});
test('Base Shaken field makes decaying sound, pauses with frozen simulation, expires on server time',()=>{
  const {sound,played}=fixture();
  const sample={oneHitFields:[field()],players:[],oneHitWaves:[]};
  sound.update(sample,.02);
  assert.equal(played.length,0,'ambient starts after the entry, not a surprise boom');
  sound.update(sample,.31);
  assert.equal(played.length,1,'base has audible ground even at zero infusions');
  const n=played.length;
  for(let i=0;i<40;i++)sound.update(sample,.31);
  assert.equal(played.length,n,'frozen Inspection has no sound replay');
  sound.update(sample,1.7);
  assert.ok(played.length>n,'live decaying field pulses again');
  sound.update(sample,5.1);
  assert.equal(sound.fields.size,0);
  const ended=played.length;
  sound.update(sample,6);
  assert.equal(played.length,ended,'no sounds after server field expiry');
});
test('All five infusions remain DISTINCT during a field, alternating without a wall of sound',()=>{
  const {sound,played}=fixture();
  const sample={oneHitFields:[field('full',tiers(2))],players:[],oneHitWaves:[]};
  for(let sec=.1;sec<=4.3;sec+=.55)sound.update(sample,sec);
  assert.ok(played.length>=9);
  // At most the base plus two distinct accents per field beat.
  assert.ok(played.length<=18,'polyphony cap');
  const unique=new Set(played.map(p=>JSON.stringify(p.recipe)));
  assert.ok(unique.size>5,'base plus five different timbres over lifetime');
  assert.ok(played.every(p=>p.gain<=1.15),'safe mix');
});
test('Only nearest three fields play; distant battlefield chaos cannot spawn unlimited voices',()=>{
  const {sound,played}=fixture();
  const sample={oneHitFields:Array.from({length:22},(_,i)=>
    field('field-'+i,tiers(2),i===0?2:i*3+25)),players:[],oneHitWaves:[]};
  sound.update(sample,0);
  sound.update(sample,.35);
  assert.ok(sound.fields.size<=3,'bounded field voices');
  assert.ok(played.length<=9);
  sound.dispose();assert.equal(sound.fields.size,0);
});
test('Moving Gale plays from changing world position and ends with server-owned wave',()=>{
  const {sound,played}=fixture();
  const wave={id:'w1',ownerId:'a',position:{x:1,y:1,z:0},
    direction:{x:1,y:0,z:0},tiers:{...tiers(),gale:2,steel:2}};
  const sample={oneHitFields:[],players:[],oneHitWaves:[wave]};
  sound.update(sample,1);
  assert.equal(sound.waves.size,1);
  assert.ok(played.some(x=>x.point===wave.position),'wave itself emits');
  wave.position={x:7,y:1,z:0};
  sound.update(sample,1.55);
  assert.ok(played.some(x=>x.point===wave.position),'sound travels with the new position');
  sample.oneHitWaves=[];
  sound.onEvent({type:'oneHitImpact',playerId:'a',impactId:'w1',
    point:{x:7,y:1,z:0},tiers:wave.tiers,at:1.7},sample);
  sound.update(sample,1.8);
  assert.equal(sound.waves.size,0,'no phantom wind after terminal explosion');
});
test('Rumble charge and all infused impacts are time-staggered, including low Steel and Frost',()=>{
  const {sound,played}=fixture();
  const full=tiers(2),snapshot={players:[{id:'a',alive:true,position:{x:0,y:0,z:0}}]};
  sound.onEvent({type:'ultimateStart',playerId:'a',ultimate:'one_hit_of_wonders',
    preparedTiers:full,at:1},snapshot);
  assert.equal(played.length,6,'one base pulse + five separately timed starts');
  assert.ok(new Set(played.map(p=>p.delay)).size>=5);
  const before=played.length;
  sound.onEvent({type:'oneHitImpact',playerId:'a',form:'ground',point:{x:0,y:0,z:0},
    fieldId:'field-a',tiers:full,at:2},snapshot);
  assert.equal(played.length-before,6,'one real earth impact + five infusion hit signatures');
  assert.ok(new Set(played.slice(before).map(p=>p.delay)).size===6);
  assert.equal(sound.fields.get('field-a')?.next,2.75);
});
test('Stopped/restarted server clock cannot retain stale effects from an old match',()=>{
  const {sound,played,stopped}=fixture();
  sound.onEvent({type:'coreflagrationArmed',projectileId:'old',at:11,detonateAt:11.6,
    point:{x:1,y:0,z:0}});
  sound.update({players:[],oneHitFields:[]},11);
  sound.update({players:[],oneHitFields:[]},1);
  assert.equal(sound.cores.size,0);
  assert.equal(stopped.length,1);
  sound.dispose();
});
