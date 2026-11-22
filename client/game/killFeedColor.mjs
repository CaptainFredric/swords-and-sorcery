// Killfeed colors are a PRESENTATION contract driven by the authoritative
// lethal source, never by whether the chronicler chose a Fire/Steel joke.
// Adding a new weapon only requires registering its server damage source here.
export const KILLFEED_TONES=Object.freeze({
  sword:'#f4efe6', // steel blade, neutral physical impact
  fire:'#ffa477',
  frost:'#a9e0ff',
  gale:'#c1f2cb',
  lightning:'#ffe477',
  steel:'#c7d5de',
  siege:'#c3c5c8',
  abyss:'#e3e2df',
  self:'#e9e8e4',
  ascension:'#ffc05c',
  mixed:'#f2ede4',
});
export const KILLFEED_ELEMENTS=Object.freeze(['fire','frost','gale','lightning','steel']);

// Explicit classifications are intentional. For example, Bi-Bye's
// conditioning shockwave is Frost, but its ordinary bolts are siege metal.
export const KILLFEED_SOURCE_TONES=Object.freeze({
  sword:'sword',gauntlet:'sword',ram:'siege',
  fireball:'fire',burn:'fire',coreflagration:'fire',
  frostfire:'frost',gale:'gale',line_of_conduct:'lightning',
  electrical_backlash:'lightning',
  abyss:'abyss',
  'fight-flight-repeater':'siege','fight-flight-rotor':'siege',
  'fight-flight-burning-ground':'fire',
  'fight-flight-terminal':'ascension',
  'bibye-siege':'siege','bibye-conditioning':'frost',
  'bibye-shockwave':'frost','bibye-sharp-turn':'siege',
  'bibye-blade-sweep':'siege',
  'so-fist':'siege','so-fist-flick':'siege',
  'hellping-crush':'siege','knock-on-steel':'siege',
  rupture:'steel',
  vortex:'gale',ember:'fire',vortexFire:'fire',vortexBlaze:'fire',
  'one_hit_of_wonders':'sword','one_hit_ground_fire':'fire',
  'one_hit_air_fire':'fire','one_hit_charge_fire':'fire',
  'one_hit_lightning_ground':'lightning','one_hit_vortex':'gale',
});
const hasOwn=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const isDisasterSource=(source,tiers)=>source==='one_hit_of_wonders'||
  source.startsWith('one_hit_')||(source==='rupture'&&Boolean(tiers));
export function killFeedInfusionTags(source,tiers){
 if(!isDisasterSource(source,tiers)||!tiers||typeof tiers!=='object')return [];
 return KILLFEED_ELEMENTS.filter(element=>Number(tiers[element])>=1)
   .map(element=>({tone:element,label:element.toUpperCase(),
     tier:Number(tiers[element])>=2?2:1}));
}
export function killFeedTone(event){
 const source=String(event?.source??'');
 // The separate Valkyrie summary should always be bright fiery gold, not
 // ordinary white for a technically self-inflicted terminal strike.
 if(source==='fight-flight-terminal'||event?.ascension===true)return 'ascension';
 if(source==='abyss')return 'abyss'; // attributed and uncredited falls alike
 if(!event?.killerId||event.killerId===event.victimId)return 'self';
 if(source==='one_hit_of_wonders'){
   const context=event?.killContext;
   if(context==='disaster-windblade')return 'gale';
   if(context==='disaster-terminal-fire')return 'fire';
   if(context==='lightning-teleport-slam')return 'lightning';
   if(context==='nearly-full-disaster')return 'mixed';
 }
 if(hasOwn(KILLFEED_SOURCE_TONES,source))return KILLFEED_SOURCE_TONES[source];
 // A newly introduced elemental source can be classified by its canonical
 // prefix until it receives a deliberate explicit classification.
 if(source.startsWith('one_hit_lightning'))return 'lightning';
 if(source.startsWith('one_hit_fire'))return 'fire';
 if(source.startsWith('one_hit_frost'))return 'frost';
 if(source.startsWith('one_hit_gale'))return 'gale';
 if(source.startsWith('one_hit_'))return 'sword';
 return 'sword';
}
export function killFeedAppearance(event){
 const source=String(event?.source??'');
 const cause=killFeedTone(event);
 // Self-deaths and falls remain neutral; a credited attack is required for
 // the colored attack composition. The Ascension summary is always gold.
 const infusions=['self','abyss','ascension'].includes(cause)?[]:
   killFeedInfusionTags(source,event?.infusionTiers);
 // The original physical cause still determines the color of the line if
 // only a single element is present; multiple sources get an ivory body and
 // individually colored words, so no tier is misleadingly treated as primary.
 const tone=infusions.length>1?'mixed':
   infusions.length===1?infusions[0].tone:cause;
 return {tone,infusions};
}
