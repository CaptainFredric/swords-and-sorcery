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
 room.events?.push({type:'siegeWreckStarted',machineId:m.id,machine,attackerId,source,point,
   at:now,settleAt:m.wreckSettleAt,cleanupAt:m.wreckCleanupAt});
 return true;
}
export function stepSiegeWreck(room,m,now){
 if(!m||!Number.isFinite(m.destroyedAt)||m.wreckVisualExpired)return;
 if(m.wreckPhase==='collapsing'&&now>=m.wreckSettleAt){
   m.wreckPhase='settled';
   room.events?.push({type:'siegeWreckSettled',machineId:m.id,at:now});
 }
 if(now>=m.wreckCleanupAt){
   m.wreckPhase='expired';m.wreckVisualExpired=true;
   room.events?.push({type:'siegeWreckVisualExpired',machineId:m.id,at:now});
 }
}
