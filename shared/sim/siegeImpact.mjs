// Bounded authoritative impact response shared by the two heavy siege chassis.
// All translation remains subject to each machine's existing terrain/collision solver.
export const SIEGE_IMPACT=Object.freeze({
 minSoundSpeed:2.8,heavySpeed:10,
 ramReboundFraction:.16,ramReboundMax:1.55,
 pistonReboundMax:.78,ramReverseChargeAcceleration:6.25,
 mobileBallistaTransfer:.19,mobileBallistaMaxSpeed:3.4,
 mobileDrag:4.2,restSpeed:.06,rockDuration:1.15,rockPitch:.075,rockRoll:.042,
});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function recordSiegeImpact(room,machine,now,{speed=0,normal={x:0,z:0},kind='chassis',point=null}={}){
 const strength=clamp((Math.abs(speed)-SIEGE_IMPACT.minSoundSpeed)/(SIEGE_IMPACT.heavySpeed-SIEGE_IMPACT.minSoundSpeed),0,1);
 if(strength<=0)return false;
 // An unresolved contact is not a new collision on every 30 Hz tick.
 if(now-(machine.impactReaction?.at??-Infinity)<.16)return false;
 machine.impactReaction={at:now,strength,kind,normal:{x:normal.x??0,z:normal.z??0}};
 room?.events?.push({type:'siegeImpact',machineId:machine.id,at:now,kind,strength,point,normal:machine.impactReaction.normal});
 return true;
}
export function siegeRock(machine,now){
 const impact=machine?.impactReaction;
 if(!impact)return {pitch:0,roll:0};
 const age=now-impact.at;
 if(age<0||age>SIEGE_IMPACT.rockDuration)return {pitch:0,roll:0};
 const envelope=Math.exp(-4.0*age)*Math.sin(age*18);
 const f=impact.strength*envelope;
 return {pitch:f*SIEGE_IMPACT.rockPitch,roll:f*SIEGE_IMPACT.rockRoll*clamp(impact.normal?.x??0,-1,1)};
}
export function ramReboundSpeed(speed){
 const strength=Math.max(0,Math.abs(speed)-SIEGE_IMPACT.minSoundSpeed);
 return -Math.sign(speed)*Math.min(SIEGE_IMPACT.ramReboundMax,strength*SIEGE_IMPACT.ramReboundFraction);
}
export function applyBallistaImpact(room,b,now,{normal,speed,point=null}){
 if(!b||b.retired||b.health<=0||b.mode==='DESTROYED')return false;
 const nx=normal?.x??0,nz=normal?.z??0,len=Math.hypot(nx,nz);
 if(len<.01)return false;
 const grounded=b.mode==='MOBILE',free=grounded?1:.45;
 recordSiegeImpact(room,b,now,{speed:speed*free,normal:{x:nx/len,z:nz/len},kind:grounded?'mobile-piston':'braced-piston',point});
 if(grounded){
  const impulse=Math.min(SIEGE_IMPACT.mobileBallistaMaxSpeed,Math.max(0,speed)*SIEGE_IMPACT.mobileBallistaTransfer);
  const old=b.externalVelocity??{x:0,z:0},x=old.x+nx/len*impulse,z=old.z+nz/len*impulse;
  const scale=Math.min(1,SIEGE_IMPACT.mobileBallistaMaxSpeed/Math.max(.001,Math.hypot(x,z)));
  b.externalVelocity={x:x*scale,z:z*scale};
 }
 return true;
}
