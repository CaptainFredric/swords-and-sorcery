import { galeProfile } from './galeModes.mjs';
// Integral of the existing full-strength wind and linear final fade. Presentation frames never set damage.
function windArea(t,life,fade){t=Math.max(0,Math.min(life,t));const edge=life-fade;if(t<=edge)return t;const x=t-edge;return edge+x-x*x/(2*fade);}
export function galeDose(gust,id,now,dt,exposure,{guarded=false,steel=0}={}){
  const cone=galeProfile('sustained').cone;
  const accounts=gust.damageAccounts??={};
  const a=accounts[id]??={raw:0,felt:0,emitted:0,rawPending:0,through:gust.bornAt};
  const end=Math.min(gust.until,now),start=Math.max(gust.bornAt,now-Math.max(0,dt),a.through);
  if(!(end>start))return {amount:0,rawDamage:0};
  a.through=end;
  const area=windArea(end-gust.bornAt,cone.lastsSec,cone.fadeSec)-windArea(start-gust.bornAt,cone.lastsSec,cone.fadeSec);
  const raw=Math.min(Math.max(0,cone.damage-a.raw),cone.damage/cone.lastsSec*area*Math.max(0,Math.min(1,exposure)));
  a.raw+=raw;
  // Steel's full-gust 8 -> 1 mitigation applied fractionally, before integer emission.
  if (!guarded) a.rawPending+=raw;
  a.felt+=guarded?0:raw*(1-(1-1/cone.damage)*Math.max(0,Math.min(1,steel)));
  const whole=Math.floor(a.felt+1e-9),amount=Math.max(0,whole-a.emitted);a.emitted=whole;
  const rawDamage=amount?a.rawPending:0;if(amount)a.rawPending=0;
  return {amount,rawDamage};
}
