import test from 'node:test';
import assert from 'node:assert/strict';
import {killFeedAppearance,killFeedTone,killFeedInfusionTags,KILLFEED_SOURCE_TONES,
  KILLFEED_ELEMENTS,KILLFEED_TONES} from './killFeedColor.mjs';
import {killFeedDeath,terminalAscensionFeed} from './killFeedText.mjs';

const lethal=(source,rest={})=>({source,killerId:'Rowan',victimId:'Perry',at:12,...rest});
test('sword, fire, ice, Gale, electricity, Steel and siege use their actual lethal cause, not text joke',()=>{
 const families={
   sword:['sword','gauntlet'],fire:['fireball','coreflagration','burn','fight-flight-burning-ground','one_hit_air_fire'],
   frost:['frostfire','bibye-conditioning','bibye-shockwave'],
   gale:['gale','vortex','one_hit_vortex'],
   lightning:['line_of_conduct','electrical_backlash','one_hit_lightning_ground'],
   steel:['rupture'],
   siege:['ram','knock-on-steel','so-fist','so-fist-flick','hellping-crush',
     'bibye-siege','bibye-sharp-turn','bibye-blade-sweep',
     'fight-flight-repeater','fight-flight-rotor'],
 };
 for(const [tone,sources] of Object.entries(families))
  for(const source of sources){
   const result=killFeedAppearance(lethal(source));
   assert.equal(result.tone,tone,source);
   assert.equal(result.infusions.length,0,source+' is not a decorated Disaster');
   assert.ok(KILLFEED_TONES[tone],'registered CSS family '+tone);
  }
 const reversal=lethal('electrical_backlash',{killContext:'shocking-conduct-interrupted'});
 const joke=killFeedDeath(reversal,'Rowan','Perry');
 assert.equal(joke.kind,'fire','preserved historical joke metadata is not source truth');
 assert.equal(killFeedAppearance(reversal).tone,'lightning','the UI is correctly yellow');
 const overload=lethal('one_hit_of_wonders',{killContext:'nearly-full-disaster'});
 assert.equal(killFeedDeath(overload,'Rowan','Perry').kind,'frost');
 assert.equal(killFeedAppearance(overload).tone,'sword',
   'without reliable tiers, do not invent a Frost-first infusion');
});
test('neutral attributed/uncredited abyss and generic suicide stay ivory, Valkyrie Ascension remains gold',()=>{
 assert.equal(killFeedTone(lethal('abyss')),'abyss');
 assert.equal(killFeedTone(lethal('abyss',{killerId:null})),'abyss');
 assert.equal(killFeedTone(lethal('fireball',{killerId:'Perry'})),'self');
 assert.equal(killFeedTone(lethal('sword',{killerId:null})),'self');
 assert.equal(killFeedTone(lethal('fight-flight-terminal',{killerId:null})),'ascension');
 assert.deepEqual(terminalAscensionFeed('Perry',[]),{text:'Perry Ascended',kind:'fire'},
   'original author-facing Ascension copy stays unchanged');
});
test('multi-infused Disaster prints each REAL element in canonical order and keeps existing authored joke intact',()=>{
 const event=lethal('one_hit_of_wonders',{killContext:'disaster-windblade',
   infusionTiers:{fire:2,frost:1,gale:2,lightning:1,steel:2}});
 const copy=killFeedDeath(event,'Rowan','Perry');
 const presentation=killFeedAppearance(event);
 assert.equal(presentation.tone,'mixed');
 assert.deepEqual(presentation.infusions.map(x=>x.label),['FIRE','FROST','GALE','LIGHTNING','STEEL']);
 assert.deepEqual(presentation.infusions.map(x=>x.tier),[2,1,2,1,2]);
 assert.equal(presentation.infusions[3].tone,'lightning');
 assert.equal(copy.text,killFeedDeath(event,'Rowan','Perry').text,
   'killfeed joke is unchanged by decoration');
 for(const source of ['one_hit_ground_fire','one_hit_air_fire','one_hit_lightning_ground','one_hit_vortex','one_hit_charge_fire','rupture']){
   const view=killFeedAppearance({...event,source});
   assert.equal(view.infusions.length,5,source+' preserves the original cast tiers');
 }
});
test('only actual infusions are rendered, full tier does not repeat a word, future unknown keys never leak',()=>{
 const event=lethal('one_hit_of_wonders',{
   infusionTiers:{fire:0,frost:2,gale:1,lightning:0,steel:0,protagonist:2,constructor:2}});
 assert.deepEqual(killFeedAppearance(event).infusions.map(x=>x.label),['FROST','GALE']);
 assert.deepEqual(killFeedInfusionTags('one_hit_of_wonders',{frost:2}),[
   {tone:'frost',label:'FROST',tier:2}]);
 assert.deepEqual(killFeedAppearance(lethal('sword',{infusionTiers:event.infusionTiers})).infusions,[],
   'ordinary sword kill never borrows stored infusions from victim or killer');
 assert.equal(killFeedAppearance(lethal('one_hit_of_wonders',{infusionTiers:{steel:2}})).tone,'steel');
 assert.equal(killFeedAppearance(lethal('one_hit_of_wonders',{infusionTiers:{}})).tone,'sword');
 assert.deepEqual(KILLFEED_ELEMENTS,['fire','frost','gale','lightning','steel']);
 assert.ok(Object.keys(KILLFEED_SOURCE_TONES).length>20,'all source variants are explicitly registered');
});
