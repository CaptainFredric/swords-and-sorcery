// Authoritative exposure to Flight to the Valkyrie's burning ground.
// Used both by scheduled flame ticks and by every ordinary source of HP damage:
// Area of Denial's deferred death and enemy Prowess loss cannot depend on
// which weapon happens to hit between two fire ticks.
import {areAllies} from '../src/teams.mjs';
import {segmentAabbHit} from '../src/collision.mjs';

export function valkyrieFlameContains(room,zone,player,now){
  if(!zone||!player?.position||!Number.isFinite(zone.startedAt)||
    !Number.isFinite(zone.expiresAt)||now<zone.startedAt||now>=zone.expiresAt)
    return false;
  const point=zone.point;
  if(!point||!(zone.radius>0))return false;
  if(Math.hypot(player.position.x-point.x,player.position.z-point.z)>zone.radius||
     Math.abs(player.position.y-point.y)>1.5)return false;
  const end=[player.position.x,player.position.y+.9,player.position.z];
  return !(room.world?.solids??[]).some(solid=>{
    if(String(solid.id??'').startsWith('fight-flight'))return false;
    const hit=segmentAabbHit([point.x,point.y+.6,point.z],end,solid);
    return hit&&hit.t>.02&&hit.t<.98;
  });
}

export function valkyrieFlameAllied(room,zone,player){
  if(zone.sourceId===player.id)return true;
  // Preserve team ownership even if the sacrificed pilot subsequently leaves
  // the room: the burnt ground outlives the machine and may outlive its rider.
  if(zone.team&&player.team)return zone.team===player.team;
  return areAllies(room,zone.sourceId,player.id);
}

export function valkyrieFlameExposure(room,player,now){
  let allied=false,hostile=false;
  for(const zone of room.flightBurnZones??[]){
    if(!valkyrieFlameContains(room,zone,player,now))continue;
    if(valkyrieFlameAllied(room,zone,player))allied=true;
    else hostile=true;
    if(allied&&hostile)break;
  }
  return {allied,hostile};
}
