import {flightSupportAt} from './flightSupport.mjs';
import {resolvePlayerWorld} from '../src/collision.mjs';
// Server-authored wreck animation clock for Fight-and-Flight and SO-FIST-ICATION.
// Keep destroyed machine records for cooldown/spawner bookkeeping; their collision
// volumes are removed immediately, while visual timing is finite and replicated.
export const SIEGE_WRECK=Object.freeze({settleSec:1.4,visualSec:6});
export function beginSiegeWreck(room,m,machine,now,{attackerId=null,source=null,point=null}={}){
 if(!m||Number.isFinite(m.destroyedAt))return false;
 m.destroyedAt=now;m.wreckPhase='collapsing';
 m.wreckSettleAt=now+SIEGE_WRECK.settleSec;
 m.wreckCleanupAt=now+SIEGE_WRECK.visualSec;
 m.wreckVisualExpired=false;
 m.wreckAirborne=machine==='fight-flight'&&m.grounded===false;
 m.wreckPhysicsAt=now;
 room.events?.push({type:'siegeWreckStarted',machineId:m.id,machine,attackerId,source,point,
   at:now,settleAt:m.wreckSettleAt,cleanupAt:m.wreckCleanupAt});
 return true;
}
export function stepSiegeWreck(room,m,now){
 if(!m||!Number.isFinite(m.destroyedAt)||m.wreckVisualExpired)return;
 if(m.wreckAirborne){
   const elapsed=Math.max(0,now-(m.wreckPhysicsAt??now));
   const count=Math.max(1,Math.ceil(elapsed/(1/60))),dt=elapsed/count;
   for(let i=0;i<count&&m.wreckAirborne;i++){
     const oldY=m.y;
     m.velocity.y=Math.max(-25,m.velocity.y-13.5*dt);
     const next={x:m.x+m.velocity.x*dt,y:m.y+m.velocity.y*dt,z:m.z+m.velocity.z*dt};
     const floor=flightSupportAt(room.world,next.x,next.z,oldY+.01);
     if(floor!=null&&next.y<=floor){
       next.y=floor;m.velocity={x:0,y:0,z:0};m.grounded=true;m.wreckAirborne=false;
       const impactAt=now-elapsed+(i+1)*dt;
       m.wreckSettleAt=impactAt+SIEGE_WRECK.settleSec;
       m.wreckCleanupAt=impactAt+SIEGE_WRECK.visualSec;
       room.events?.push({type:'siegeWreckGroundImpact',machineId:m.id,at:impactAt,point:{...next}});
     }
     const contact=resolvePlayerWorld(next,.7,room.world.solids??[],1.6);
     if(Math.hypot(contact.x-next.x,contact.z-next.z)>.01){next.x=m.x;next.z=m.z;m.velocity.x=0;m.velocity.z=0;}
     m.x=next.x;m.y=next.y;m.z=next.z;m.position={...next};
     if(m.y<(room.world.abyssY??-30)-5){m.wreckAirborne=false;m.wreckCleanupAt=now;}
   }
 }
 m.wreckPhysicsAt=now;
 if(m.wreckAirborne)return;
 if(m.wreckPhase==='collapsing' &&now>=m.wreckSettleAt){
   m.wreckPhase='settled';
   room.events?.push({type:'siegeWreckSettled',machineId:m.id,at:now});
 }
 if(now>=m.wreckCleanupAt){
   m.wreckPhase='expired';m.wreckVisualExpired=true;
   room.events?.push({type:'siegeWreckVisualExpired',machineId:m.id,at:now});
 }
}
