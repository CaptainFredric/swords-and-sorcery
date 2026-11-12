import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISASTER_AUDIO_ELEMENTS,coreMagmaArmRecipe,coreMagmaFuseRecipe,
  coreMagmaDetonationRecipe,conductChargeRecipe,conductDischargeRecipe,
  conductWireTailRecipe,galeStreamRecipe,disasterEarthImpactRecipe,
  disasterInfusionChargeRecipe,disasterInfusionImpactRecipe,
  disasterFieldPulseRecipe,disasterInfusionFieldRecipe,disasterWaveRushRecipe,
} from './disasterSoundRecipes.mjs';
const rnd=()=>.37;
function verify(recipe){
  assert.ok(Array.isArray(recipe.layers)&&recipe.layers.length);
  assert.ok(Number.isFinite(recipe.reverb)&&recipe.reverb>=0&&recipe.reverb<=1);
  for(const l of recipe.layers){
    assert.ok(['noise','tone','ring'].includes(l.type),l.type);
    assert.ok((l.at??0)>=0&&Number.isFinite(l.at??0));
    if(l.type==='ring'){
      assert.ok(l.partials.length>0);
      for(const p of l.partials)assert.ok(p.freq>0&&p.decay>0&&p.gain>=0);
    }else{
      assert.ok(l.freq>0);
      assert.ok(l.attack>=0&&l.decay>0&&l.gain>=0);
    }
  }
  return recipe;
}
const toneRange=recipe=>recipe.layers.filter(l=>l.type==='tone').map(l=>l.freq);
const bandRange=recipe=>recipe.layers.filter(l=>l.type==='noise').map(l=>l.freq);
test('Coreflagration has bubbling ARMED fuse before a subterranean secondary detonation',()=>{
  const armed=verify(coreMagmaArmRecipe(rnd));
  const fuse=verify(coreMagmaFuseRecipe(rnd,{seconds:.6}));
  const burst=verify(coreMagmaDetonationRecipe(rnd));
  assert.ok(armed.layers.some(l=>l.type==='tone'&&l.freq<100));
  assert.ok(fuse.layers.filter(l=>(l.at??0)>.02).length>=8,
    'at least four individually timed bubbles before detonation');
  assert.ok(fuse.layers.every(l=>(l.at??0)<.61),
    'fuse never inadvertently plays bubbles after the second explosion');
  assert.ok(burst.layers.some(l=>l.type==='tone'&&l.freq<65&&l.decay>.75),
    'deep, long pressure roll is distinct from the ordinary fireball');
  assert.ok(burst.layers.some(l=>(l.at??0)>=.28),
    'the big blast develops a delayed cavernous tail');
});
test('Line of Conduct has a rising electrical charge, a separate hard crack and a finite residual wire hiss',()=>{
  const charge=verify(conductChargeRecipe(rnd));
  const hit=verify(conductDischargeRecipe(rnd));
  const wire=verify(conductWireTailRecipe(rnd));
  assert.ok(charge.layers.some(l=>l.type==='tone'&&l.slideTo>l.freq));
  assert.ok(hit.layers.some(l=>l.filter==='highpass'&&l.freq>4500&&l.attack<.01));
  assert.ok(hit.layers.some(l=>l.type==='tone'&&l.freq<100&&l.slideTo<50),
    'low thunder arrives behind the electrical snap');
  assert.ok(wire.layers.length<hit.layers.length,'lingering wire is a quieter texture, not repeated lightning');
});
test('Base thunder/earth has sound even without an infusion, plus five DISTINCT full/half timbres',()=>{
  const earth=verify(disasterEarthImpactRecipe(rnd));
  assert.ok(earth.layers.some(l=>l.type==='noise'&&l.filter==='lowpass'));
  assert.ok(earth.layers.some(l=>l.at>.1),'fractured-earth aftershock is delayed');
  assert.deepEqual(DISASTER_AUDIO_ELEMENTS,['fire','frost','gale','lightning','steel']);
  const chargeSignatures=[],impactSignatures=[];
  for(const element of DISASTER_AUDIO_ELEMENTS){
    for(const tier of [1,2]){
      verify(disasterInfusionChargeRecipe(element,rnd,{tier}));
      verify(disasterInfusionImpactRecipe(element,rnd,{tier}));
      verify(disasterInfusionFieldRecipe(element,rnd,{tier,strength:.6}));
    }
    const charge=disasterInfusionChargeRecipe(element,rnd,{tier:2});
    const hit=disasterInfusionImpactRecipe(element,rnd,{tier:2});
    chargeSignatures.push(JSON.stringify(charge));
    impactSignatures.push(JSON.stringify(hit));
  }
  assert.equal(new Set(chargeSignatures).size,5);
  assert.equal(new Set(impactSignatures).size,5);
  const steel=disasterInfusionImpactRecipe('steel',rnd,{tier:2});
  assert.ok(toneRange(steel).some(f=>f<90),'Steel has deep metal/earth rumble');
  const frost=disasterInfusionImpactRecipe('frost',rnd,{tier:2});
  assert.ok(frost.layers.some(l=>l.type==='ring'),'Frost has brittle harmonics');
  const gale=disasterInfusionImpactRecipe('gale',rnd,{tier:2});
  assert.ok(bandRange(gale).some(f=>f>=2000),'Gale has physical turbulent air');
});
test('Persistent pulses and moving Gale are softer than impacts and finite',()=>{
  verify(disasterFieldPulseRecipe(rnd,{strength:.5}));
  verify(galeStreamRecipe(rnd,{seconds:.75}));
  verify(disasterWaveRushRecipe(rnd,{tier:2}));
  assert.ok(galeStreamRecipe(rnd).layers.every(l=>l.decay<=1.5));
  const fireImpact=disasterInfusionImpactRecipe('fire',rnd,{tier:2});
  const fireField=disasterInfusionFieldRecipe('fire',rnd,{tier:2,strength:.6});
  assert.ok(Math.max(...fireField.layers.map(l=>l.gain??0))<
    Math.max(...fireImpact.layers.map(l=>l.gain??0)),
    'field fire sputters, it does not cause additional explosions');
});
