import {biByeDeployProgress,biByeAimPose} from './biByeComponents.mjs';
import {interruptBiByeSupport} from './biByeWeapons.mjs';
// Bounded authoritative impact response shared by the two heavy siege chassis.
// All translation remains subject to each machine's existing terrain/collision solver.
export const SIEGE_IMPACT=Object.freeze({
 minSoundSpeed:2.8,heavySpeed:10,
 ramReboundFraction:.16,ramReboundMax:1.55,
 pistonReboundMax:.78,ramReverseChargeAcceleration:6.25,
 ramPistonRecoilTransfer:.33,ramPistonRecoilMax:3.75,ramPistonRecoilBrake:4.9,
 mobileBallistaTransfer:.19,mobileBallistaMaxSpeed:3.4,
 mobileDrag:4.2,restSpeed:.06,rockDuration:1.15,rockPitch:.075,rockRoll:.042,
 forceOutriggersSpeed:8,forceOutriggersSec:.65,forcedHoldSec:3.2,
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
 if(strength===0)return 0;
 return -Math.sign(speed)*Math.min(SIEGE_IMPACT.ramReboundMax,strength*SIEGE_IMPACT.ramReboundFraction);
}
// The motor must not cancel a real piston collision one frame later.
export function recoilRamOnPistonHit(room,b,now,{speed,normal,kind,point=null}){
 const energy=Math.max(0,speed);
 if(energy<1.4)return false;
 const impulse=Math.min(SIEGE_IMPACT.ramPistonRecoilMax,(energy-1.4)*SIEGE_IMPACT.ramPistonRecoilTransfer);
 b.recoilVelocity=Math.max(-SIEGE_IMPACT.ramPistonRecoilMax,(b.recoilVelocity??0)-impulse);
 recordSiegeImpact(room,b,now,{speed:energy,normal,kind,point});
 return true;
}
export function applyBallistaImpact(room,b,now,{normal,speed,point=null}){
 if(!b||b.retired||b.health<=0||b.mode==='DESTROYED')return false;
 const nx=normal?.x??0,nz=normal?.z??0,len=Math.hypot(nx,nz);
 if(len<.01)return false;
 const mobile=b.mode==='MOBILE';
 const braced=b.mode==='DEPLOYED'||b.mode==='DEPLOYING';
 const energy=Math.max(0,speed);
 const direction={x:nx/len,z:nz/len};
 recordSiegeImpact(room,b,now,{speed:energy*(mobile?1:.45),normal:direction,
   kind:mobile?'mobile-piston':'braced-piston',point});
 const impulse=Math.min(SIEGE_IMPACT.mobileBallistaMaxSpeed,
   energy*SIEGE_IMPACT.mobileBallistaTransfer);
 if(mobile){
  // Ordinary mobile chassis keeps its inertia; a ram NEVER plants its feet.
  const old=b.externalVelocity??{x:0,z:0};
  const x=old.x+direction.x*impulse,z=old.z+direction.z*impulse;
  const scale=Math.min(1,SIEGE_IMPACT.mobileBallistaMaxSpeed/Math.max(.001,Math.hypot(x,z)));
  b.externalVelocity={x:x*scale,z:z*scale};
 }else if(braced&&energy>=SIEGE_IMPACT.uprootOutriggersSpeed){
  // The deployed legs are torn FREE, not magically planted harder.
  // Use the actual retracting assembly animation so all observers see
  // outriggers jerk out of the ground, then let the chassis skid.
  const planted=biByeDeployProgress(b,now);
  if(planted>.08){
   const aim=biByeAimPose(b,now);
   b.retractFrom=planted;
   b.retractAim={yaw:aim.mainYaw,pitch:aim.mainPitch};
   b.pendingIndependent=null;
   b.pendingCoupledFromUpper=null;
   interruptBiByeSupport(b,now);
   b.mode='RETRACTING';
   b.modeTransitionStartedAt=now;
   b.modeTransitionEndsAt=now+SIEGE_IMPACT.uprootRetractSeconds*planted;
   b.outriggersDislodgedAt=now;
   b.outriggersDislodgedUntil=now+SIEGE_IMPACT.outriggerRecoverySec;
   b.outriggersDislodgedSource='so-fist';
   // Defer translational impulse until the legs physically clear the floor.
   // The existing mobile solver will then enforce slope, walls, wheels and
   // boundary checks before moving the machine or its mounted operator.
   b.dislodgedImpulse={x:direction.x*impulse,z:direction.z*impulse};
   b.speed=0;
   room?.events?.push({type:'bibyeOutriggersUprooted',ballistaId:b.id,
     source:'so-fist',point,at:now,until:b.outriggersDislodgedUntil});
  }
 }
 return true;
}
