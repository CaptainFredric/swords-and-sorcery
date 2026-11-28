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
  'dragoon-rite-crew':'ascension',
  'dragoon-rite-of-ascension':'ascension',
  'dragoon-rite-exhaust':'ascension',
  'dragoon-desolation-spray':'fire',
  'dragoon-flame-dot':'fire',
  'dragoon-radiant-heat':'fire',
  'dragoon-raze':'fire',
  'dragoon-raze-dot':'fire',
  'dragoon-camp-fire':'fire',
  'dragoon-flight-like-hell':'fire',
  'dragoon-leap-slam':'fire',
  'dragoon-steam':'steel',
  'dragoon-all-abort':'fire',
  'dragoon-all-abort-crew':'fire',
  'brimming-internal-heat':'fire',
  'dragoon-overheat':'fire',
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
 // The separate Valkyrie & Rite Ascension entries should always be bright fiery gold.
 if(source==='fight-flight-terminal'||source==='dragoon-rite-crew'||source==='dragoon-rite-of-ascension'||source==='dragoon-rite-exhaust'||event?.ascension===true)return 'ascension';
 if(source==='dragoon-all-abort-crew'||source==='dragoon-abort'||source==='brimming-internal-heat'||source==='dragoon-overheat')return 'fire';
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
 let infusions=['self','abyss','ascension'].includes(cause)?[]:
   killFeedInfusionTags(source,event?.infusionTiers);
 if(!infusions.length&&!['self','abyss','ascension'].includes(cause)&&Array.isArray(event?.elementalCauses)){
   const converged=KILLFEED_ELEMENTS.filter(element=>event.elementalCauses.includes(element));
   if(converged.length>=2){
     infusions=converged.map(element=>({tone:element,label:element.toUpperCase(),tier:1}));
   }
 }
 // The original physical cause still determines the color of the line if
 // only a single element is present; multiple sources get an ivory body and
 // individually colored words, so no tier is misleadingly treated as primary.
 const tone=infusions.length>1?'mixed':
   infusions.length===1?infusions[0].tone:cause;
 return {tone,infusions};
}

/** Letter-level elemental assignment for highlighted natural-causes tokens. */
export function killFeedColoredLetters(text,infusions=[]){
  const original=String(text??'');
  const tones=[...new Set((Array.isArray(infusions)?infusions:[])
    .map(entry=>typeof entry==='string'?entry:entry?.tone)
    .filter(tone=>KILLFEED_ELEMENTS.includes(tone)))];
  if(tones.length<2||!original.trim())return [];
  const chars=[...original];
  const visibleCount=chars.filter(ch=>/\S/u.test(ch)).length;
  if(!visibleCount)return [];
  let pos=0;
  return chars.map(ch=>{
    if(!/\S/u.test(ch))return {text:ch,tones:[]};
    const tone=tones[pos%tones.length];
    pos++;
    return {text:ch,tones:[tone]};
  });
}

/**
 * Color the ACTUAL killfeed sentence, without appending an elemental legend.
 * Keep contiguous stretches of prose together instead of cycling rainbow
 * colors every letter. Assign one or more real infusions to each word.
 * For short messages with fewer words than elements, blend the extra tones
 * inside the existing words rather than inventing extra text.
 *
 * Text is passed to DOM textContent by the renderer, never innerHTML.
 */
export function killFeedColoredWords(text,infusions=[]){
  const original=String(text??'');
  const tones=[...new Set((Array.isArray(infusions)?infusions:[])
    .map(entry=>entry?.tone).filter(tone=>KILLFEED_ELEMENTS.includes(tone)))];
  if(tones.length<2)return [];
  const tokens=original.match(/\S+\s*|\s+/gu)??[];
  const count=tokens.filter(token=>/\S/u.test(token)).length;
  if(!count)return [];
  let position=0;
  return tokens.map(token=>{
    if(!/\S/u.test(token))return {text:token,tones:[]};
    const start=Math.floor(position*tones.length/count);
    const end=Math.max(start+1,Math.floor((position+1)*tones.length/count));
    position++;
    const assigned=tones.slice(start,end);
    const trimmed=token.trim().toLowerCase();
    const entry={text:token,tones:assigned};
    if(/^(all-natural|natural)$/i.test(trimmed)){
      const letterTones=killFeedColoredLetters(token,tones.map(tone=>({tone})));
      if(letterTones.length)entry.letters=letterTones;
    }
    return entry;
  });
}
