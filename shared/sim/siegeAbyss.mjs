// Authoritative cleanup of siege machines that have genuinely fallen past
// the arena's kill plane. On death a machine is GONE, not an unreachable
// singleton that prevents a Practice rebuild. This is not a terrain-support
// check: a legitimate airborne aircraft above the void is still playable.
const TYPES=Object.freeze([
 {field:'fightFlight',revision:'fightFlightRevision',name:'fight-and-flight',event:'fightFlightDestroyed'},
 {field:'soFistication',revision:'soFistRevision',name:'so-fist-ication',event:'soFistDestroyed'},
 {field:'biByeLlista',revision:'biByeRevision',name:'bi-bye-llista',event:'bibyeDestroyed'},
]);
export const siegeAbyssLimit=world=>Number.isFinite(world?.abyssY)?world.abyssY:-9;

export function lostSiegeMachines(room,now,killPlayer){
  if(!room||!room.world)return [];
  const abyss=siegeAbyssLimit(room.world),lost=[];
  for(const cfg of TYPES){
    const m=room[cfg.field];
    if(!m||m.retired)continue;
    if(!Number.isFinite(m.y)||m.y>=abyss)continue;
    const id=m.id,at={x:m.x,y:m.y,z:m.z},owner=m.operatorId;
    // A terminal Valkyrie dive over the void has no collision and must not
    // detonate in midair or defer the pilot's respawn for 30 extra seconds.
    if(m.terminalDive&&!m.terminalDive.resolved){
      m.terminalDive.resolved=true;m.terminalDive.resolvedAt=now;
    }
    if(owner){
      const pilot=room.players?.get(owner);
      if(pilot?.alive){
        // killPlayer owns regular death/respawn/score attribution and safely
        // dismounts the operator; do not teleport them back to their seat.
        killPlayer(room,pilot.id,null,'abyss',now);
      }
      // A disconnected/dead pilot must not keep a ghost machine mount.
      const other=room.players?.get(owner);
      if(other){
        if(other.operatingFightFlightId===id)other.operatingFightFlightId=null;
        if(other.operatingRamId===id)other.operatingRamId=null;
        if(other.operatingBallistaId===id)other.operatingBallistaId=null;
      }
    }
    Object.assign(m,{retired:true,mode:'DESTROYED',operatorId:null,offensiveRun:false,
      flightDashHeld:false,speed:0,charging:false,strokeAt:null,runGroundPhase:null});
    // Any already-fired projectile remains physically independent. Retire
    // unreleased/queued rounds on the lost chassis to avoid ghost discharges.
    m.pendingVolley=null;m.pendingIndependent=null;
    if(room.bibyeProjectiles)for(const [projectileId,p]of room.bibyeProjectiles)
      if(p.ballistaId===id&&p.pendingRelease)room.bibyeProjectiles.delete(projectileId);
    room[cfg.field]=null;
    room[cfg.revision]=(room[cfg.revision]??0)+1;
    if(room.highGrounds?.foundries)for(const f of room.highGrounds.foundries)
      if(f.machineId===id){f.machineId=null;f.machine=null;}
    const fields={machineId:id,...(cfg.field==='biByeLlista'?{ballistaId:id}:{}),
      operatorId:owner??null,source:'abyss',point:at,at:now};
    room.events?.push({type:cfg.event,...fields});
    room.events?.push({type:'siegeMachineAbyss',machine:cfg.name,...fields});
    lost.push({machineId:id,machine:cfg.name,operatorId:owner??null});
  }
  return lost;
}
