// Event-driven finite sound choreography for real Castleward gameplay.
// Snapshots own expiration and position. Uses existing positional SFX mixer.
import {fieldStrength} from '../../shared/src/oneHitStatus.mjs';
import {galeProfile} from '../../shared/src/galeModes.mjs';
import {
  DISASTER_AUDIO_ELEMENTS,coreMagmaArmRecipe,coreMagmaFuseRecipe,
  coreMagmaDetonationRecipe,conductChargeRecipe,conductDischargeRecipe,
  conductWireTailRecipe,galeStreamRecipe,disasterEarthImpactRecipe,
  disasterInfusionChargeRecipe,disasterInfusionImpactRecipe,
  disasterFieldPulseRecipe,disasterInfusionFieldRecipe,disasterWaveRushRecipe,
} from './disasterSoundRecipes.mjs';

const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number(n)||0));
const tiersOf=tiers=>DISASTER_AUDIO_ELEMENTS.filter(e=>Number(tiers?.[e]??0)>0);
const dist=(a,b)=>a&&b?Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z):0;
const originOf=p=>p?.position?{x:p.position.x,y:p.position.y+1,z:p.position.z}:null;
const roomGain=(position,listener)=>!position||!listener?1:
  clamp(1/(1+(dist(position,listener)/13)**2),.01,1);
const mix=count=>1/Math.sqrt(1+count*.34);
const at=(n,fallback)=>Number.isFinite(n)?n:fallback;
const impactPoint=event=>event?.groundBlast&&event?.groundPoint?event.groundPoint:event?.point;
// A long electrical ray is heard where it passes the listener, not teleported
// to the player's ears from a distant wall or from the caster.
export function nearestConductPoint(origin,end,ear){
  if(!origin||!end)return origin??end??null;
  if(!ear)return origin;
  const dx=end.x-origin.x,dy=end.y-origin.y,dz=end.z-origin.z;
  const len=dx*dx+dy*dy+dz*dz||1;
  const t=clamp(((ear.x-origin.x)*dx+(ear.y-origin.y)*dy+
    (ear.z-origin.z)*dz)/len);
  return {x:origin.x+dx*t,y:origin.y+dy*t,z:origin.z+dz*t};
}

export class DisasterSoundscape {
  // Play callbacks preserve the existing SoundEngine sound mixer/panning.
  constructor({play,listener=()=>null,playerPosition=()=>null,random=Math.random}={}){
    this.play=play??(()=>{});
    this.listener=listener;
    this.playerPosition=playerPosition;
    this.random=random;
    this.fields=new Map();this.charges=new Map();this.waves=new Map();
    this.lines=new Map();
    this.gusts=new Map();this.cores=new Map();this.lastNow=-Infinity;
    this.density=1;this.recent=new Map();
  }
  setDensity(factor=1){this.density=clamp(factor,.35,1);}
  #emit(recipe,point,gain=1,delay=0){
    if(!(gain>.01))return null;
    // Phones still hear EVERY infusion. Thin only redundant micro-sparks and
    // upper ringing partials; never remove an element's audible identity.
    // One large five-element slam otherwise spawns dozens of tiny sources.
    const layers=recipe?.layers??[];
    let playable=recipe;
    if(this.density<.8 && layers.length){
      const keep=new Set([0,1,2]);
      const extra=Math.min(3,Math.max(0,layers.length-3));
      for(let i=0;i<extra;i++)
        keep.add(3+Math.floor((layers.length-3)*(i+.5)/extra));
      const slim=layers.filter((_,i)=>keep.has(i)).map(l=>
        l.type==='ring' ? {...l,partials:l.partials.slice(0,3)} : l);
      playable={...recipe,layers:slim};
    }
    return this.play(playable,point,clamp(gain,0,1.15),Math.max(0,delay))??null;
  }
  #around(point,recipe,gain,delay=0){
    if(roomGain(point,this.listener())<.035)return null;
    return this.#emit(recipe,point,gain,delay);
  }
  onEvent(event,snapshot=null){
    if(!event?.type)return;
    // Network resends or a frozen/replayed Inspection snapshot must never
    // produce a second huge blast. Distinct projectile uses retain their IDs.
    if(['coreflagrationArmed','projectileImpact','lineConductDischarge',
      'spellCast','ultimateStart','oneHitTeleport','oneHitWave','oneHitImpact',
      'galeBlast'].includes(event.type)){
      const key=[event.type,event.projectileId??event.impactId??event.waveId??
        event.playerId??event.ownerId??'',event.at??'',event.stage??''].join(':');
      if(this.recent.has(key))return;
      this.recent.set(key,at(event.at,this.lastNow));
      if(this.recent.size>128)this.recent.delete(this.recent.keys().next().value);
    }
    const rand=this.random;
    const actorId=event.playerId??event.ownerId;
    const actor=snapshot?.players?.find(p=>p.id===actorId);
    const origin=event.origin??originOf(actor)??this.playerPosition(actorId);
    switch(event.type){
      case 'coreflagrationArmed':{
        const previous=this.cores.get(event.projectileId);
        previous?.handle?.stop?.(.04);
        this.#around(event.point,coreMagmaArmRecipe(rand),.55);
        const seconds=clamp(event.detonateAt-at(event.at,0),.16,1.8);
        const handle=this.#around(event.point,coreMagmaFuseRecipe(rand,{seconds}),.72,.035);
        this.cores.set(event.projectileId,{handle,until:event.detonateAt});
        break;
      }
      case 'coreflagrationParried':{
        const old=this.cores.get(event.projectileId);
        old?.handle?.stop?.(.055);this.cores.delete(event.projectileId);
        break;
      }
      case 'projectileImpact':{
        if(event.spell!=='coreflagration'||event.stage!=='final')break;
        const old=this.cores.get(event.projectileId);
        old?.handle?.stop?.(.035);this.cores.delete(event.projectileId);
        // Calibrated against the baseline earth impact: explosive but not
        // overwhelmingly sub-bass-heavy or hard limiting the whole SFX bus.
        this.#around(event.point,coreMagmaDetonationRecipe(rand),.86);
        break;
      }
      case 'lineConductDischarge':{
        this.#around(event.origin,conductDischargeRecipe(rand),.93);
        // The ear hears the segment nearest it, not just a lightning sound
        // at the caster or at the far end of a 240-metre hitscan.
        const ear=this.listener(),from=event.origin,to=event.end;
        if(from&&to&&ear){
          const near=nearestConductPoint(from,to,ear);
          if(dist(near,from)>3.5)
            this.#around(near,conductWireTailRecipe(rand),.49,.025);
        }
        break;
      }
      case 'spellCast':{
        if(event.spell!=='line_of_conduct')break;
        const seconds=clamp((event.castEndsAt??at(event.at,0)+.45)-at(event.at,0),.16,1.4);
        this.#around(origin,conductChargeRecipe(rand,{seconds}),.85);
        break;
      }
      case 'ultimateStart':{
        if(event.ultimate!=='one_hit_of_wonders')break;
        const tiers=event.preparedTiers??actor?.ultimateState?.preparedTiers??{};
        const elements=tiersOf(tiers),balance=mix(elements.length);
        this.#around(origin,disasterFieldPulseRecipe(rand,{strength:1}),.52*balance);
        elements.forEach((e,i)=>this.#around(origin,
          disasterInfusionChargeRecipe(e,rand,{tier:tiers[e]}),
          .66*balance,.09+i*.12));
        break;
      }
      case 'oneHitTeleport':{
        this.#around(event.from??origin,conductDischargeRecipe(rand),.6);
        this.#around(event.to,disasterWaveRushRecipe(rand,{tier:2}),.52,.055);
        this.#around(event.to,conductWireTailRecipe(rand),.3,.14);
        break;
      }
      case 'oneHitWave':{
        const elements=tiersOf(event.tiers);
        this.#around(event.origin,disasterWaveRushRecipe(rand,{tier:event.tiers?.gale??0}),
          .78*mix(elements.length));
        this.waves.set(event.waveId,{next:at(event.at,0)+.28,index:0});
        break;
      }
      case 'oneHitImpact':{
        const point=impactPoint(event),elements=tiersOf(event.tiers),balance=mix(elements.length);
        // Preserve the attack's initial weight regardless of infusion count.
        // Only the EXTRA elemental layers share a collective loudness budget;
        // previously all five infusions paradoxically weakened the base hit.
        this.#around(point,disasterEarthImpactRecipe(rand,{wave:Boolean(event.impactId)}),
          event.impactId?.72:.89);
        // Fire ignites, frost fractures, Gale evacuates, lightning snaps, Steel
        // rumbles last. Avoid simply synchronizing five entire explosions.
        const delays={fire:.035,frost:.095,gale:.135,lightning:.185,steel:.23};
        for(const e of elements)this.#around(point,disasterInfusionImpactRecipe(e,rand,{
          tier:event.tiers[e],wave:Boolean(event.impactId)}),.76*balance,delays[e]);
        if(event.fieldId)this.fields.set(event.fieldId,{next:at(event.at,0)+.75,index:0});
        if(event.impactId)this.waves.delete(event.impactId);
        break;
      }
      case 'galeBlast':{
        this.#around(event.origin,galeStreamRecipe(rand,{seconds:.56,weight:1}),.37,.16);
        // Sustain tracks the ACTUAL chosen Gale cone duration, not the
        // earlier hard-coded .75 s (sustained Gale physically lasts 1.25 s).
        this.gusts.set(event.playerId,{point:event.origin,next:at(event.at,0)+.53,
          until:at(event.at,0)+galeProfile(event.mode).cone.lastsSec});
        break;
      }
      case 'galeEnded':
      case 'death':
        this.gusts.delete(event.playerId??event.victimId);
        break;
      default:break;
    }
  }
  update(snapshot,nowSec){
    if(!snapshot||!Number.isFinite(nowSec))return;
    if(nowSec+1e-5<this.lastNow){
      this.fields.clear();this.charges.clear();this.waves.clear();this.gusts.clear();
      this.lines.clear();this.recent.clear();
      for(const core of this.cores.values())core.handle?.stop?.(.06);
      this.cores.clear();
    }
    // Inspection freeze: no double playback on repeated frames at same tick.
    if(nowSec<=this.lastNow+1e-6)return;
    this.lastNow=nowSec;
    for(const [key,when] of this.recent)
      if(Number.isFinite(when)&&nowSec-when>8)this.recent.delete(key);
    const ear=this.listener();
    const fields=(snapshot.oneHitFields??[])
      .filter(f=>nowSec<f.until&&(!ear||dist(f.position,ear)<28))
      .sort((a,b)=>dist(a.position,ear)-dist(b.position,ear))
      .slice(0,this.density<.8?2:3);
    const liveFields=new Set(fields.map(f=>f.id));
    for(const id of this.fields.keys())if(!liveFields.has(id))this.fields.delete(id);
    for(const field of fields){
      let cursor=this.fields.get(field.id);
      if(!cursor){cursor={next:nowSec+.22,index:0};this.fields.set(field.id,cursor);}
      if(nowSec+1e-5<cursor.next)continue;
      cursor.next=nowSec+1.08;
      const strength=fieldStrength(field,nowSec);
      if(strength<=.045)continue;
      const elements=tiersOf(field.tiers),balance=mix(elements.length);
      // Recipe envelopes already multiply by authoritative strength.
      // Multiplying the outer gain by strength as well made the field fade
      // quadratically and nearly disappear while Shaken remained active.
      const gain=.52*balance;
      this.#around(field.position,disasterFieldPulseRecipe(this.random,{strength}),gain);
      // All five infusion timbres take turns throughout the authoritative
      // field lifetime, two gentle accents per beat. Never five full booms.
      for(let i=0;i<Math.min(2,elements.length);i++){
        const e=elements[cursor.index++%elements.length];
        this.#around(field.position,disasterInfusionFieldRecipe(e,this.random,{
          tier:field.tiers[e],strength}),gain*.94,.19+i*.34);
      }
    }
    // Line of Conduct's visible wire remains in the server snapshot for one
    // second. A short electrical aftercurrent follows that REAL lifetime,
    // closest to the listening knight; no repeated full thunder strike.
    const liveLines=new Set();
    const lines=(snapshot.lineConductWires??[])
      .filter(w=>nowSec<w.until&&(!ear||
        dist(nearestConductPoint(w.origin,w.end,ear),ear)<21))
      .sort((a,b)=>dist(nearestConductPoint(a.origin,a.end,ear),ear)-
                   dist(nearestConductPoint(b.origin,b.end,ear),ear))
      .slice(0,this.density<.8?1:2);
    for(const wire of lines){
      liveLines.add(wire.id);
      let cursor=this.lines.get(wire.id);
      if(!cursor){cursor={next:nowSec+.12};this.lines.set(wire.id,cursor);}
      if(nowSec<cursor.next)continue;
      cursor.next=nowSec+.39;
      const point=nearestConductPoint(wire.origin,wire.end,ear);
      this.#around(point,conductWireTailRecipe(this.random),.21);
    }
    for(const id of this.lines.keys())if(!liveLines.has(id))this.lines.delete(id);
    // Held Half/Full Lightning charging remains active but quietly alive.
    const chargers=(snapshot.players??[])
      .filter(p=>p.alive&&p.ultimateState?.id==='one_hit_of_wonders'&&
        p.ultimateState.phase==='startup'&&(!ear||dist(p.position,ear)<24))
      .sort((a,b)=>dist(a.position,ear)-dist(b.position,ear))
      .slice(0,this.density<.8?1:2);
    const charging=new Set(chargers.map(p=>p.id));
    for(const id of this.charges.keys())if(!charging.has(id))this.charges.delete(id);
    for(const p of chargers){
      let cursor=this.charges.get(p.id);
      if(!cursor){cursor={next:nowSec+.65,index:0};this.charges.set(p.id,cursor);}
      if(nowSec<cursor.next)continue;
      cursor.next=nowSec+.99;
      const elements=tiersOf(p.ultimateState.preparedTiers),balance=mix(elements.length);
      const point=originOf(p);
      this.#around(point,disasterFieldPulseRecipe(this.random,{strength:.45}),.23*balance);
      if(elements.length){
        const e=elements[cursor.index++%elements.length];
        this.#around(point,disasterInfusionChargeRecipe(e,this.random,{
          tier:p.ultimateState.preparedTiers[e]}),.37*balance,.12);
      }
    }
    // The single Gale wave is a moving emitter, not a sound at its starting
    // position. Only three nearest waves may contribute at any given tick.
    const liveWaves=new Set();
    const waves=(snapshot.oneHitWaves??[]).filter(w=>(!ear||dist(w.position,ear)<32))
      .sort((a,b)=>dist(a.position,ear)-dist(b.position,ear))
      .slice(0,this.density<.8?2:3);
    for(const wave of waves){
      liveWaves.add(wave.id);
      let cursor=this.waves.get(wave.id);
      if(!cursor){cursor={next:nowSec,index:0};this.waves.set(wave.id,cursor);}
      if(nowSec<cursor.next)continue;
      cursor.next=nowSec+.38;
      const elements=tiersOf(wave.tiers),balance=mix(elements.length);
      this.#around(wave.position,disasterWaveRushRecipe(this.random,{
        tier:wave.tiers?.gale??0}),.38*balance);
      if(elements.length){
        const e=elements[cursor.index++%elements.length];
        this.#around(wave.position,disasterInfusionFieldRecipe(e,this.random,{
          strength:1,tier:wave.tiers[e]}),.3*balance,.08);
      }
    }
    for(const id of this.waves.keys())if(!liveWaves.has(id))this.waves.delete(id);
    for(const [id,gust] of this.gusts){
      if(nowSec>=gust.until){this.gusts.delete(id);continue;}
      if(nowSec>=gust.next){
        gust.next=nowSec+.48;
        this.#around(gust.point,galeStreamRecipe(this.random,{seconds:.48}),.23);
      }
    }
    for(const [id,core] of this.cores)
      if(nowSec>core.until+1){core.handle?.stop?.(.04);this.cores.delete(id);}
    if(this.cores.size>24)
      for(const [id,core] of [...this.cores].slice(0,this.cores.size-24)){
        core.handle?.stop?.(.04);this.cores.delete(id);
      }
  }
  dispose(){
    for(const core of this.cores.values())core.handle?.stop?.(.04);
    this.cores.clear();this.fields.clear();this.charges.clear();this.waves.clear();this.gusts.clear();
    this.lines.clear();this.recent.clear();this.lastNow=-Infinity;
  }
}
