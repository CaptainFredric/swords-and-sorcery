// Purpose-built procedural sound identities for Castleward's elemental magic.
// Not five copies of an explosion: each element owns different attack, timbre,
// rhythmic tail and spectral position. Pure recipe data for the existing WebAudio
// engine; no downloaded assets, no extra mixer, no change to saved volume prefs.
import {jitter,ring,fireballImpactRecipe,coreflagrationImpactRecipe} from './soundRecipes.mjs';

const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,Number(v)||0));
const n=(filter,freq,attack,decay,gain,extra={})=>({
  type:'noise',filter,freq,q:.8,attack,decay,gain,...extra,
});
const t=(wave,freq,to,attack,decay,gain,extra={})=>({
  type:'tone',wave,freq,slideTo:to,attack,decay,gain,...extra,
});
const recipe=(layers,reverb=.22,hall=.03)=>({layers,reverb,hall});

export const DISASTER_AUDIO_ELEMENTS=Object.freeze(['fire','frost','gale','lightning','steel']);

/** Coreflagration's armed stone: pressure gathering under the crust, not its final blast. */
export function coreMagmaArmRecipe(rand=Math.random){
  return recipe([
    n('lowpass',400,.012,.23,.28,{sweepTo:160}),
    t('sine',74,54,.008,.32,.24),
    n('bandpass',870,.012,.10,.21,{at:.09,sweepTo:420}),
  ],.18);
}
/** Bubbling magma during the actual .6s fuse. Pockets erupt irregularly BEFORE detonation. */
export function coreMagmaFuseRecipe(rand=Math.random,{seconds=.6}={}){
  const sec=Math.max(.16,Math.min(2,Number(seconds)||.6));
  const layers=[
    n('lowpass',280,.045,Math.max(.05,sec-.07),.21,{sweepTo:115}),
    t('triangle',62,37,.035,Math.max(.05,sec-.06),.15),
  ];
  const bubbles=Math.max(3,Math.min(9,Math.round(sec*11)));
  for(let i=0;i<bubbles;i++){
    const at=.055+(sec-.14)*(i+.20*rand())/bubbles;
    layers.push(n('bandpass',(180+rand()*370)*jitter(rand,.08),.003,
      .045+rand()*.06,.11+rand()*.08,{at,q:1.5,sweepTo:110+rand()*130}));
    layers.push(t('sine',140+rand()*75,65+rand()*30,.002,.065,.085,{at:at+.012}));
  }
  return recipe(layers,.18);
}
/** Second Coreflagration explosion: subterranean pressure, crust fracture, then roaring heat. */
export function coreMagmaDetonationRecipe(rand=Math.random){
  const old=coreflagrationImpactRecipe(rand);
  return recipe([
    // Leading earth-splitting knock, preceding the old fiery body.
    n('bandpass',940,.001,.09,.32,{q:1.7,sweepTo:180}),
    t('sine',59,25,.004,.89,.57),
    n('lowpass',410,.018,.95,.32,{at:.07,sweepTo:90}),
    ...old.layers.map(layer=>({...layer,at:(layer.at??0)+.035,
      ...(layer.gain!==undefined?{gain:layer.gain*.67}:{})})),
    // One delayed lava cavern roll, so it is not a single transient blob.
    n('lowpass',340,.07,.74,.19,{at:.28,sweepTo:120}),
  ],.43,.22);
}
/** Line of Conduct: charged high-voltage needle over a restrained mains hum. */
export function conductChargeRecipe(rand=Math.random,{seconds=.45}={}){
  const sec=Math.max(.16,Math.min(1.4,Number(seconds)||.45));
  const layers=[
    t('sawtooth',175,540,sec*.5,sec*.45,.10),
    n('bandpass',2200,sec*.45,sec*.48,.13,{sweepTo:4950,q:2.5}),
    t('sine',58,82,sec*.3,sec*.55,.16),
  ];
  for(let i=0;i<4;i++)layers.push(n('highpass',3600+i*290,.001,.019,.055,
    {at:sec*(.18+i*.18),q:1.4}));
  return recipe(layers,.16);
}
/** Lightning actually fires: dielectric snap, branching arc, low thunder heard afterward. */
export function conductDischargeRecipe(rand=Math.random){
  return recipe([
    n('highpass',4700,.001,.095,.57,{sweepTo:1900,q:1.2}),
    n('bandpass',2400,.005,.37,.3,{at:.022,sweepTo:850,q:2.3}),
    t('sawtooth',2600,380,.001,.24,.13,{at:.008}),
    t('sine',95,33,.008,.63,.36,{at:.055}),
    n('lowpass',460,.035,.62,.28,{at:.09,sweepTo:110}),
    ...Array.from({length:4},(_,i)=>n('highpass',4900*jitter(rand,.18),
      .001,.027,.095*(1-i*.16),{at:.045+i*.055+rand()*.02})),
  ],.34,.08);
}
/** The wire hisses away only while the authoritative line remains visible. */
export function conductWireTailRecipe(rand=Math.random){
  return recipe([
    n('bandpass',2600*jitter(rand,.17),.009,.24,.09,{sweepTo:3800,q:2}),
    t('triangle',2900*jitter(rand,.12),920,.003,.16,.03),
  ],.09);
}
/** Air rushing around the target AFTER Gale's initial release, not another blast. */
export function galeStreamRecipe(rand=Math.random,{seconds=.7,weight=1}={}){
  const sec=Math.max(.18,Math.min(1.5,Number(seconds)||.7));
  const w=clamp(weight);
  return recipe([
    n('bandpass',850*jitter(rand,.12),.08,Math.max(.08,sec-.12),(.2+.13*w),
      {sweepTo:380,q:.9}),
    n('highpass',3800*jitter(rand,.13),.03,Math.max(.07,sec-.09),.055+.08*w,
      {sweepTo:1700}),
    t('sine',115*jitter(rand,.08),69,.045,Math.max(.08,sec-.08),.045+.04*w),
  ],.13);
}
/** A base thunder-slam: cracked earth with a second delayed tectonic roll. */
export function disasterEarthImpactRecipe(rand=Math.random,{wave=false}={}){
  const q=wave?.58:1;
  return recipe([
    n('bandpass',1300,.002,.105,.42*q,{sweepTo:320,q:1.35}),
    n('lowpass',510,.009,.46,.45*q,{sweepTo:125}),
    t('sine',86,33,.004,.48,.57*q),
    n('bandpass',2700*jitter(rand,.18),.002,.16,.14*q,{at:.11,sweepTo:800,q:2}),
    n('lowpass',300,.065,.62,.2*q,{at:.17,sweepTo:95}),
  ],.37,.13);
}
/** Infusion cast signature, differentiated before the main earth impact. */
export function disasterInfusionChargeRecipe(element,rand=Math.random,{tier=1}={}){
  const full=Number(tier)>=2,m=full?1:.66;
  switch(element){
    case 'fire':return recipe([
      n('bandpass',410*jitter(rand,.09),.07,.53,.20*m,{sweepTo:1100}),
      n('highpass',3300,.02,.27,.08*m,{sweepTo:1800}),
      t('triangle',88,140,.08,.39,.10*m),
    ],.2);
    case 'frost':return recipe([
      n('highpass',4700,.11,.4,.08*m,{sweepTo:1900}),
      ring(rand,680,{decay:.56,gain:.065*m,partials:4,bright:1.25}),
      t('sine',270,225,.08,.38,.08*m),
    ],.36);
    case 'gale':return recipe([
      n('bandpass',700,.08,.57,.21*m,{sweepTo:1700}),
      n('highpass',3600,.09,.38,.055*m,{sweepTo:2800}),
    ],.14);
    case 'lightning':return recipe([
      n('highpass',5100,.006,.1,.16*m),
      t('sawtooth',480,1700,.04,.31,.055*m),
      ...Array.from({length:3},(_,i)=>n('bandpass',3700+jitter(rand,550),
        .001,.035,.056*m,{at:.13+i*.11,q:2.1})),
    ],.18);
    case 'steel':return recipe([
      t('sine',81,46,.09,.61,.22*m),
      n('lowpass',270,.1,.57,.15*m,{sweepTo:115}),
      ring(rand,225,{decay:.66,gain:.06*m,partials:3,bright:.45}),
    ],.27);
    default:return recipe([]);
  }
}
/** Infusion impact signature: timbral identities distinct from base stone and from each other. */
export function disasterInfusionImpactRecipe(element,rand=Math.random,{tier=1,wave=false}={}){
  const full=Number(tier)>=2,level=(full?1:.69)*(wave?.72:1);
  switch(element){
    case 'fire':{
      const old=fireballImpactRecipe(rand);
      return recipe([
        n('bandpass',840,.004,.22,.29*level,{sweepTo:250}),
        ...old.layers.slice(0,3).map(l=>({...l,gain:l.gain*.34*level})),
        ...Array.from({length:4},(_,i)=>n('highpass',3900*jitter(rand,.2),
          .001,.03,.075*level,{at:.18+i*.12})),
      ],.32,.08);
    }
    case 'frost':return recipe([
      n('highpass',6500,.002,.085,.34*level,{sweepTo:2500}),
      n('bandpass',1800,.035,.5,.16*level,{sweepTo:700,q:1.5}),
      ring(rand,1650*jitter(rand,.04),{decay:.58,gain:.13*level,partials:5,bright:1.1}),
      ...Array.from({length:6},(_,i)=>n('highpass',4300+jitter(rand,800),
        .001,.018,.065*level,{at:.045+i*.085+rand()*.02})),
    ],.36,.1);
    case 'gale':return recipe([
      n('bandpass',2200,.003,.42,.46*level,{sweepTo:300,q:.65}),
      n('lowpass',650,.007,.49,.26*level,{sweepTo:170}),
      t('sine',135,70,.008,.34,.13*level),
      n('highpass',3400,.02,.43,.08*level,{at:.06,sweepTo:1100}),
    ],.13);
    case 'lightning':return recipe([
      n('highpass',5700,.001,.085,.43*level,{sweepTo:1900}),
      t('sawtooth',2300,440,.002,.22,.09*level),
      n('bandpass',2800,.008,.26,.21*level,{at:.035,sweepTo:700,q:2}),
      t('sine',94,44,.018,.39,.18*level,{at:.052}),
    ],.29,.05);
    case 'steel':return recipe([
      // A slow cavernous load-bearing groan, NOT a second fire explosion.
      t('sine',67,28,.01,.92,.34*level),
      n('lowpass',350,.03,.81,.21*level,{sweepTo:115}),
      ring(rand,300,{decay:full?1.25:.8,gain:.15*level,partials:5,bright:.7}),
      n('highpass',2700,.001,.055,.25*level),
    ],.42,.15);
    default:return recipe([]);
  }
}
/** The decaying rocky field is alive even without a single infusion. */
export function disasterFieldPulseRecipe(rand=Math.random,{strength=1}={}){
  const s=clamp(strength);
  return recipe([
    n('lowpass',350*jitter(rand,.11),.035,.36,.09*s,{sweepTo:115}),
    n('bandpass',1150,.003,.075,.075*s,{at:.16,q:1.2,sweepTo:450}),
    t('sine',61,44,.04,.34,.075*s),
  ],.17);
}
/** Low-density, distinct ambient accents, never replay an entire blast. */
export function disasterInfusionFieldRecipe(element,rand=Math.random,{tier=1,strength=1}={}){
  const s=clamp(strength)*(Number(tier)>=2?1:.62);
  switch(element){
    case 'fire':return recipe([
      n('bandpass',2500*jitter(rand,.2),.004,.075,.11*s,{at:.035}),
      n('lowpass',350,.02,.26,.06*s,{sweepTo:210}),
      n('highpass',4300,.001,.025,.05*s,{at:.18}),
    ],.12);
    case 'frost':return recipe([
      n('highpass',4600,.025,.23,.055*s,{sweepTo:3200}),
      ring(rand,1850*jitter(rand,.14),{decay:.3,gain:.028*s,partials:3}),
      n('highpass',5900,.001,.03,.065*s,{at:.16}),
    ],.24);
    case 'gale':return galeStreamRecipe(rand,{seconds:.42,weight:.2+.6*s});
    case 'lightning':return recipe([
      n('highpass',5100,.001,.035,.12*s),
      n('bandpass',2700,.01,.13,.073*s,{at:.095,q:2.2,sweepTo:1150}),
      t('sawtooth',680,330,.002,.085,.025*s,{at:.11}),
    ],.13);
    case 'steel':return recipe([
      t('sine',64,42,.04,.45,.12*s),
      n('lowpass',240,.03,.33,.055*s,{sweepTo:105}),
      ring(rand,225,{decay:.39,gain:.028*s,partials:2,bright:.5}),
    ],.18);
    default:return recipe([]);
  }
}
/** The wave body keeps rushing until terminal contact, with room for infused accents. */
export function disasterWaveRushRecipe(rand=Math.random,{tier=0}={}){
  const rich=clamp(tier/2);
  return recipe([
    n('bandpass',1750*jitter(rand,.12),.01,.49,.20+.08*rich,{sweepTo:440}),
    n('highpass',4100,.005,.19,.075,{sweepTo:2100}),
    t('sine',124,59,.008,.26,.085),
  ],.17);
}
