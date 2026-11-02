// Sheathe in Steel's machine-linked ward: a SINGLE repair budget, not one per part.
// The operator's personal Steel remains independent; the effect belongs to the
// specific machine instance even after dismount, disconnect or pilot death.
import {GAME} from '../src/combat.mjs';
import {STEEL,STEEL_DAMAGE_RANGES,callSteel,steelMitigate,steelStrength,steelTakes} from '../src/steel.mjs';
import {SO_FIST_PISTON} from '../src/soFistPiston.mjs';

export const SIEGE_STEEL_REFERENCES=Object.freeze({
  flight:Object.freeze({minimum:GAME.swordGlance,maximum:GAME.swordDamage}),
  bibye:Object.freeze({minimum:STEEL_DAMAGE_RANGES['bibye-siege'].min,maximum:STEEL_DAMAGE_RANGES['bibye-siege'].max}),
  ram:Object.freeze({minimum:SO_FIST_PISTON.minimum,maximum:SO_FIST_PISTON.maximum}),
});
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const EPS=1e-7;
const machineLive=(m,kind)=>Boolean(m&&!m.retired&&m.mode!=='DESTROYED'&&m.health>0&&
  !(kind==='bibye'&&m.state==='SPENT'&&m.mode==='DESTROYED'));
export function operatedSiegeSteelMachine(room,p){
  if(!p?.alive||room.players?.get(p.id)!==p)return null;
  for(const [field,key,kind] of [
    ['operatingFightFlightId','fightFlight','flight'],
    ['operatingBallistaId','biByeLlista','bibye'],
    ['operatingRamId','soFistication','ram'],
  ]){
    const m=room[key];
    if(p[field]&&m?.id===p[field]&&m.operatorId===p.id&&machineLive(m,kind))
      return {machine:m,kind};
  }
  return null;
}
function parts(m,kind){
  const all=[];
  if(kind==='flight'){
    all.push({id:'main',owner:m,key:'health',maximum:m.maxHealth??250,rank:6});
    all.push({id:'rotor',owner:m,key:'rotorHP',maximum:100,rank:0});
    all.push({id:'braceL',owner:m,key:'braceLHP',maximum:80,rank:4});
    all.push({id:'braceR',owner:m,key:'braceRHP',maximum:80,rank:4});
  }else{
    all.push({id:'hull',owner:m,key:'health',maximum:m.maxHealth??(kind==='bibye'?650:1400),rank:6});
    for(const [id,c] of Object.entries(m.components??{})){
      const rank=/drive/i.test(id)?0:/fist/i.test(id)?1:/stabilizer/i.test(id)?2:/wheel/i.test(id)?3:4;
      all.push({id,owner:c,key:'health',maximum:c.maxHealth??c.health,rank});
    }
  }
  return all.filter(x=>Number.isFinite(x.owner?.[x.key])&&Number.isFinite(x.maximum)&&x.maximum>0);
}
export function machineSteelParts(m,kind){
  return parts(m,kind).map(x=>({id:x.id,health:x.owner[x.key],maxHealth:x.maximum}));
}
export function beginSiegeSteel(room,m,kind,p,now){
  if(!machineLive(m,kind)||!SIEGE_STEEL_REFERENCES[kind]||
    operatedSiegeSteelMachine(room,p)?.machine!==m)return false;
  // A legitimate later cast must settle the previous ward before overwriting
  // its machine-linked bookkeeping; it cannot discard or duplicate old credit.
  if(m.siegeSteel)stepSiegeSteel(room,m,now);
  if(m.siegeSteel&&m.siegeSteel.state!=='expired')return false;
  const reference=SIEGE_STEEL_REFERENCES[kind];
  m.siegeSteel={
    kind,operatorId:p.id,calledAt:now,steel:callSteel(now),state:'active',
    fullRepairUntil:now+STEEL.fullSec,repairUntil:now+STEEL.fullSec+STEEL.fadeSec,
    protectionUntil:now+STEEL.fullSec+STEEL.fadeSec,
    minimum:reference.minimum,maximum:reference.maximum,
    baselineHealed:0,baselineClosed:false,bonusHealed:0,bonusPrevented:0,blockedDamage:0,
    healed:0,lastStepAt:now,
  };
  room.events?.push({type:'siegeSteelOn',machineId:m.id,kind,operatorId:p.id,
    minimum:reference.minimum,maximum:reference.maximum,
    repairUntil:m.siegeSteel.repairUntil,protectionUntil:m.siegeSteel.protectionUntil,at:now});
  return true;
}
// Call ONLY after friendly-fire, destroyed-part and other hit eligibility checks.
// "innateAmount" is the damage already allowed by existing material protections.
// Compare alternate wards against the SAME original blow: never steelMitigate twice.
export function mitigateSiegeSteel(room,m,amount,source,now,{
  innateAmount=amount,componentId=null,explicitMin=null,point=null,
}={}){
  // Settle at the exact expiry boundary BEFORE this hit can damage a component.
  // Otherwise a late strike could create missing HP that the expired ward heals.
  stepSiegeSteel(room,m,now);
  const ward=m?.siegeSteel;
  if(!ward||ward.state==='expired'||!machineLive(m,ward.kind)||
     steelStrength(ward.steel,now)<=.005)
    return {amount:innateAmount,turned:0};
  const shield=steelMitigate(ward.steel,amount,source,now,explicitMin);
  const actual=Math.min(innateAmount,shield.amount);
  const turned=Math.max(0,innateAmount-actual);
  if(turned>EPS){
    // The finite bonus is spent by *additional* mitigation, not by a fist's
    // inherent armor or the flight rotor's pre-existing component Steel.
    const spend=Math.min(turned,Math.max(0,ward.maximum-ward.minimum-ward.bonusPrevented));
    ward.bonusPrevented+=spend;ward.blockedDamage+=turned;
    ward.steel=steelTakes(ward.steel,now);
    ward.protectionUntil=ward.steel.fullUntil+STEEL.fadeSec;
    // Legacy snapshot field now follows the real settlement deadline.
    ward.repairUntil=ward.protectionUntil;
    room.events?.push({type:'siegeSteelBlocked',machineId:m.id,componentId,
      source,attackerDamagePrevented:turned,bonusSpent:spend,point,at:now});
  }
  return {amount:actual,turned};
}
export function endSiegeSteel(room,m,now,reason='destroyed'){
  const ward=m?.siegeSteel;
  if(!ward||ward.state==='expired')return false;
  ward.state='expired';ward.protectionUntil=Math.min(now,ward.protectionUntil);
  room.events?.push({type:'siegeSteelEnded',machineId:m.id,kind:ward.kind,reason,at:now,
    healed:ward.healed,blocked:ward.blockedDamage});
  return true;
}
function heal(room,m,ward,amount,phase,now){
  if(!(amount>EPS))return 0;
  const eligible=parts(m,ward.kind).filter(x=>x.owner[x.key]>EPS&&x.owner[x.key]<x.maximum-EPS);
  eligible.sort((a,b)=>{
    const ac=a.owner[a.key]/a.maximum,bc=b.owner[b.key]/b.maximum;
    const critical=(ac<=.35?0:1)-(bc<=.35?0:1);
    return critical||a.rank-b.rank||ac-bc||a.id.localeCompare(b.id);
  });
  let remaining=amount,delivered=0;
  for(const p of eligible){
    if(remaining<EPS)break;
    const gain=Math.min(remaining,p.maximum-p.owner[p.key]);
    if(gain<=EPS)continue;
    p.owner[p.key]=Math.min(p.maximum,p.owner[p.key]+gain);
    delivered+=gain;remaining-=gain;
    room.events?.push({type:'siegeSteelRepair',machineId:m.id,kind:ward.kind,
      componentId:p.id,amount:gain,health:p.owner[p.key],phase,at:now});
  }
  return delivered;
}
// The first five seconds accrue the guaranteed minimum, once per absolute
// timestamp. Whatever cannot be applied to existing damage during that phase
// is forfeited, not banked for a late strike.
function accrueGuaranteedRepair(room,m,ward,now){
  if(ward.baselineClosed)return;
  const at=Math.max(ward.calledAt,Math.min(now,ward.fullRepairUntil));
  const earned=ward.minimum*clamp((at-ward.calledAt)/STEEL.fullSec,0,1);
  const delivered=heal(room,m,ward,Math.max(0,earned-ward.baselineHealed),'full',at);
  ward.baselineHealed+=delivered;
  ward.healed+=delivered;
  if(now+EPS>=ward.fullRepairUntil)ward.baselineClosed=true;
}

// Damage entrypoints call this BEFORE mutating HP; stepRoom also calls it
// after collision/projectile resolution. A hit at the expiry timestamp
// therefore cannot create an eligible wound before the reserved bonus settles.
export function stepSiegeSteel(room,m,now){
  const ward=m?.siegeSteel;
  if(!ward||ward.state==='expired')return;
  if(!machineLive(m,ward.kind)){endSiegeSteel(room,m,now);return;}
  const at=Math.max(ward.lastStepAt,now);
  accrueGuaranteedRepair(room,m,ward,at);
  ward.lastStepAt=at;
  if(at+EPS<ward.protectionUntil)return;
  // All prevented damage throughout the actual protection window (including
  // the one-time first-hit extension) has already consumed this reserve.
  const available=Math.max(0,ward.maximum-ward.minimum-ward.bonusPrevented-ward.bonusHealed);
  const bonus=heal(room,m,ward,available,'expiry',ward.protectionUntil);
  ward.bonusHealed+=bonus;ward.healed+=bonus;
  ward.state='settled';
  room.events?.push({type:'siegeSteelRepairFinished',machineId:m.id,kind:ward.kind,
    healed:ward.healed,bonusPrevented:ward.bonusPrevented,bonusHealed:ward.bonusHealed,
    at:ward.protectionUntil});
  endSiegeSteel(room,m,ward.protectionUntil,'expired');
}
