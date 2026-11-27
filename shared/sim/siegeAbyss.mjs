import { getFleetMachines, getMachineKind } from './fleetGeometry.mjs';
import { triggerAllAbortDestruction } from './dragOon.mjs';

// Authoritative cleanup of siege machines that have genuinely fallen past
// the arena's kill plane. On death a machine is GONE, not an unreachable
// singleton that prevents a Practice rebuild. This is not a terrain-support
// check: a legitimate airborne aircraft above the void is still playable.
export const siegeAbyssLimit=world=>Number.isFinite(world?.abyssY)?world.abyssY:-9;

export function lostSiegeMachines(room,now,killPlayer){
  if(!room||!room.world)return [];
  const abyss=siegeAbyssLimit(room.world),lost=[];
  const fleet=getFleetMachines(room);
  for(const m of fleet){
    if(!m||m.retired)continue;
    if(!Number.isFinite(m.y)||m.y>=abyss)continue;
    let isFlight = room.fightFlight === m;
    let isRam = room.soFistication === m;
    let isBallista = room.biByeLlista === m;
    let isDragOon = room.dragOon === m;
    if (!isFlight && !isRam && !isBallista && !isDragOon) {
      const kind = getMachineKind(m);
      isFlight = kind === 'flight';
      isRam = kind === 'ram';
      isBallista = kind === 'ballista';
      isDragOon = kind === 'dragoon';
    }
    if (isDragOon) {
      triggerAllAbortDestruction(room, m, now, { attackerId: null, source: 'abyss', point: { x: m.x, y: m.y, z: m.z } });
      m.retired = true;
      for (const p of room.players?.values?.() ?? []) {
        if ((p.operatingDragOonId === m.id || p.aboardDragOonId === m.id) && p.alive) {
          killPlayer(room, p.id, null, 'abyss', now);
        }
        if (p.operatingDragOonId === m.id) p.operatingDragOonId = null;
        if (p.aboardDragOonId === m.id) p.aboardDragOonId = null;
      }
      if (room.machines?.has(m.id)) room.machines.delete(m.id);
      if (room.dragOon === m) room.dragOon = null;
      room.dragOonRevision = (room.dragOonRevision ?? 0) + 1;
      room.events?.push({ type: 'siegeMachineAbyss', machine: 'drag-oon', machineId: m.id, operatorId: m.operatorId ?? null, source: 'abyss', point: { x: m.x, y: m.y, z: m.z }, at: now });
      lost.push({ machineId: m.id, machine: 'drag-oon', operatorId: m.operatorId ?? null });
      continue;
    }
    const cfgName = isFlight ? 'fight-and-flight' : isRam ? 'so-fist-ication' : 'bi-bye-llista';
    const eventName = isFlight ? 'fightFlightDestroyed' : isRam ? 'soFistDestroyed' : 'bibyeDestroyed';
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
    if(room.machines?.has(id))room.machines.delete(id);
    if(room.soFistication===m)room.soFistication=null;
    if(room.biByeLlista===m)room.biByeLlista=null;
    if(room.fightFlight===m)room.fightFlight=null;
    if(isFlight)room.fightFlightRevision=(room.fightFlightRevision??0)+1;
    else if(isRam)room.soFistRevision=(room.soFistRevision??0)+1;
    else if(isBallista)room.biByeRevision=(room.biByeRevision??0)+1;
    if(room.highGrounds?.foundries)for(const f of room.highGrounds.foundries)
      if(f.machineId===id){f.machineId=null;f.machine=null;}
    const fields={machineId:id,...(isBallista?{ballistaId:id}:{}),
      operatorId:owner??null,source:'abyss',point:at,at:now};
    room.events?.push({type:eventName,...fields});
    room.events?.push({type:'siegeMachineAbyss',machine:cfgName,...fields});
    lost.push({machineId:id,machine:cfgName,operatorId:owner??null});
  }
  return lost;
}
