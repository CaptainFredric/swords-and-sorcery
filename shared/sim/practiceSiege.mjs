import {practiceFightFlight} from './practiceFightFlight.mjs';
import {fightFlightSolids} from './fightFlight.mjs';
import {fightFlightHitVolumes} from './fightFlightComponents.mjs';
import {createSoFistication,soFistTerrainPose,soFistClear,soFistExit,dismountSoFistication} from './soFistication.mjs';
import {soFistSolids} from './soFistGeometry.mjs';
import {createBiByeLlista,dismountBiByeLlista,getBiByeSolids} from './biByeLlista.mjs';
import {biByeTerrainContext,biByeTerrainPose,biByeTerrainClear,biByeDeploymentSupport} from './biByeTerrain.mjs';
import {surfaceHeightAt,resolvePlayerWorld,segmentAabbHit} from '../src/collision.mjs';
import {DRAG_OON_ID} from '../src/dragOonConfig.mjs';
import {selectedSiegeSkill} from '../src/siegeLoadout.mjs';
import {createDragOon} from './dragOon.mjs';
import {dragOonSolids,dragOonTerrainPose,dragOonClear,dragOonExit} from './dragOonGeometry.mjs';
import {dragOonOccupantIds,removeDragOonOccupant} from './dragOonCrew.mjs';

const actorBoxes=(room,ignore)=>[...room.players.values()].filter(p=>p.alive&&p.id!==ignore).map(p=>({id:'actor-'+p.id,center:[p.position.x,p.position.y+.9,p.position.z],size:[.9,1.8,.9]}));
// Pure validation. No fallback coordinates and no mutation before a complete plan exists.
export function practiceBiByeExit(room,b,player,extraSolids=[]){
 const forward=[-Math.sin(b.heading),-Math.cos(b.heading)],right=[Math.cos(b.heading),-Math.sin(b.heading)];
 const solids=[...(room.world.solids??[]),...getBiByeSolids(b),...soFistSolids(room.soFistication),
  ...fightFlightHitVolumes(room.fightFlight),...extraSolids,...actorBoxes(room,player.id)];
 for(const [back,side]of [[3,0],[2.8,0],[3,-1.8],[3,1.8],[2,-2.8],[2,2.8],[0,-3.5],[0,3.5]]){
  const x=b.x-forward[0]*back+right[0]*side,z=b.z-forward[1]*back+right[1]*side;
  const y=surfaceHeightAt(x,z,b.y+1,room.world);if(y===null||Math.abs(y-b.y)>1)continue;
  const p={x,y,z},resolved=resolvePlayerWorld(p,.45,solids,1.8);
  if(Math.hypot(resolved.x-x,resolved.z-z)<.015)return p;
 }
 return null;
}
function candidate(room,player,x,z,heading,old,ram=false){
 const y=surfaceHeightAt(x,z,player.position.y+1.5,room.world);if(y===null)return null;
 const b=ram?createSoFistication({x,y,z,heading}):createBiByeLlista({x,y,z,baseYaw:heading});
 const flight=[...fightFlightSolids(room.fightFlight),...fightFlightHitVolumes(room.fightFlight)];
 const other=ram?[...getBiByeSolids(room.biByeLlista),...flight]:
   [...soFistSolids(room.soFistication),...flight],actors=actorBoxes(room,old?.operatorId);
 const ctx=ram?null:biByeTerrainContext(room.world,b,[...actors,...other]);
 const pose=ram?soFistTerrainPose(b,room.world):biByeTerrainPose(b,ctx);if(!pose)return null;Object.assign(b,pose,{terrainInitialized:true});
 if(ram?!soFistClear({...b,operatorId:player.id},room.world,[...actors,...other])||Math.hypot(b.chassisPitch,b.chassisRoll)>8*Math.PI/180:!biByeTerrainClear(b,ctx)||!biByeDeploymentSupport(b,room.world).ok)return null;
 if(!old){
  const eye=[player.position.x,player.position.y+1.35,player.position.z],target=[x,b.y+1.3,z];
  if([...(room.world.solids??[]),...other].some(s=>segmentAabbHit(eye,target,s)))return null;
 }
 if(!(ram?soFistExit(room,b,player,other):practiceBiByeExit(room,b,player)))return null;
 const exit=old?.operatorId?(ram?soFistExit(room,old,player,[...soFistSolids(b),...other]):practiceBiByeExit(room,old,player,getBiByeSolids(b))):null;
 if(old?.operatorId&&!exit)return null;
 return {b,exit};
}
// Reuse actual wheel/terrain, construction and egress constraints for hostile
// operators. Candidate placement is pure; only the caller owns commitment.
export function practiceHostileSiegePlacement(room,player,machine){
 const ram=machine==='so-fist-ication';
 if(!ram&&machine!=='bi-bye-llista')return null;
 const at=player.position,yaw=player.yaw??0;
 const distances=ram?[8,10,11,13,15,20]:[11,15,20,25,8];
 for(const range of distances)for(const offset of [0,.6,-.6,1.25,-1.25,Math.PI]){
  const angle=yaw+offset,x=at.x-Math.sin(angle)*range,z=at.z-Math.cos(angle)*range;
  const facing=Math.atan2(-(at.x-x),-(at.z-z));
  const plan=candidate(room,player,x,z,facing,null,ram);
  if(!plan)continue;
  if(ram){
   // Static clearance is insufficient for this long, wheel-contact chassis.
   // Refuse a barely fitting spawn if the next 1.5 m of *real* straight
   // travel would clip masonry or lose support before combat can begin.
   const other=[...getBiByeSolids(room.biByeLlista),...actorBoxes(room,player.id)];
   let viable=true;
   for(const distance of [.5,1,1.5]){
    const projected={...plan.b,x:plan.b.x-Math.sin(facing)*distance,
      z:plan.b.z-Math.cos(facing)*distance};
    const terrain=soFistTerrainPose(projected,room.world);
    if(!terrain||!soFistClear({...projected,...terrain,operatorId:player.id},room.world,other)){
      viable=false;break;
    }
   }
   if(!viable)continue;
  }
  return plan;
 }
 return null;
}
function placement(room,player,old,ram=false){
 const heading=old?.heading??player.yaw??0;
 if(old){
  const same=candidate(room,player,old.x,old.z,heading,old,ram);if(same)return same;
  for(const radius of [1.5,3,4.5])for(let n=0;n<8;n++){
   const angle=n*Math.PI/4,found=candidate(room,player,old.x+Math.cos(angle)*radius,old.z+Math.sin(angle)*radius,heading,old,ram);if(found)return found;
  }
 }else{
  for(const distance of [6,5,7])for(const offset of [0,.25,-.25,.5,-.5,.8,-.8]){
   const angle=heading+offset,found=candidate(room,player,player.position.x-Math.sin(angle)*distance,player.position.z-Math.cos(angle)*distance,heading,null,ram);if(found)return found;
  }
 }
 return null;
}
function retire(room,b,player,exit,ram=false){
 if(ram){dismountSoFistication(room,b,player,{administrative:true,exit,force:true});b.mode='DESTROYED';return;}
 if(b.operatorId){dismountBiByeLlista(b,player);player.attackHeld=false;player.guardHeld=false;player.attackButton=false;player.guardButton=false;player.guarding=false;if(exit){player.position={...exit};player.velocity={x:0,y:0,z:0};player.input={forward:0,right:0,jump:false,yaw:player.yaw,pitch:0};}}
 // Administrative retirement cancels even a delay already committed by Shot I.
 Object.assign(b,{retired:true,mode:'DESTROYED',operatorId:null,pendingVolley:null,pendingIndependent:null,mobileShotPendingAt:null,firingOperatorId:null,coupling:'INDEPENDENT',state:'SPENT',firedAt:-Infinity,mainReleasedAt:null,upperReleasedAt:null,reloadStartedAt:-Infinity,reloadEndsAt:-Infinity,speed:0,steer:0});
 for(const [id,p]of room.bibyeProjectiles??[])if(p.ballistaId===b.id)room.bibyeProjectiles.delete(id);
}
function dragOonCandidate(room, player, x, z, heading, old) {
  const y = surfaceHeightAt(x, z, player.position.y + 1.5, room.world);
  if (y === null) return null;
  const b = createDragOon({ x, y, z, heading });
  const other = [
    ...getBiByeSolids(room.biByeLlista),
    ...soFistSolids(room.soFistication),
    ...fightFlightSolids(room.fightFlight),
    ...fightFlightHitVolumes(room.fightFlight),
  ];
  const ignore = new Set(old ? dragOonOccupantIds(old) : []);
  const actors = [...room.players.values()]
    .filter(p => p.alive && !ignore.has(p.id))
    .map(p => ({ id: 'actor-' + p.id, center: [p.position.x, p.position.y + 0.9, p.position.z], size: [0.9, 1.8, 0.9] }));
  const pose = dragOonTerrainPose(b, room.world);
  if (!pose) return null;
  Object.assign(b, pose, { terrainInitialized: true });
  if (!dragOonClear({ ...b, operatorId: player.id }, room.world, [...actors, ...other])) return null;
  if (Math.hypot(b.chassisPitch, b.chassisRoll) > 10 * Math.PI / 180) return null;
  if (!old) {
    const eye = [player.position.x, player.position.y + 1.35, player.position.z];
    const target = [x, b.y + 1.4, z];
    if ([...(room.world.solids ?? []), ...other].some(s => segmentAabbHit(eye, target, s))) return null;
  }
  if (!dragOonExit(room, b, player, other)) return null;
  const exits = {};
  if (old) {
    const extra = [...dragOonSolids(b), ...other];
    for (const pid of dragOonOccupantIds(old)) {
      const occ = room.players.get(pid);
      if (!occ) continue;
      const ex = dragOonExit(room, old, occ, extra);
      if (!ex) return null;
      exits[pid] = ex;
    }
  }
  return { b, exits };
}

function practiceDragOon(room, player, action, now) {
  if (!['build', 'rebuild', 'dismantle'].includes(action)) return { rejected: 'Unknown DRAG-OON action.' };
  if (room?.mode !== 'PRACTICE' || room.state !== 'PLAYING' || !player?.alive || player.actorKind !== 'human' || room.players.get(player.id) !== player) {
    return { rejected: 'DRAG-OON tools are available to living Spellblades in Practice.' };
  }
  const old = room.dragOon;
  if (action === 'build' && old) return { rejected: 'DRAG-OON already exists. Rebuild or dismantle it.' };
  if (action !== 'build' && !old) return { rejected: 'Build DRAG-OON first.' };
  const others = old ? dragOonOccupantIds(old).filter(id => id !== player.id) : [];
  if (others.length) return { rejected: 'Another Spellblade is currently inside DRAG-OON.' };
  if (old && !old.grounded) return { rejected: 'Land DRAG-OON before rebuilding or dismantling.' };

  let plan = null;
  const exits = {};
  if (action === 'dismantle') {
    for (const pid of dragOonOccupantIds(old)) {
      const occ = room.players.get(pid);
      if (!occ) continue;
      const ex = dragOonExit(room, old, occ);
      if (!ex) return { rejected: 'No safe place to exit. Move DRAG-OON onto open ground.' };
      exits[pid] = ex;
    }
  } else {
    const heading = old?.heading ?? player.yaw ?? 0;
    if (old) {
      plan = dragOonCandidate(room, player, old.x, old.z, heading, old);
      if (!plan) {
        for (const radius of [2, 4, 6]) {
          for (let n = 0; n < 8 && !plan; n++) {
            const a = n * Math.PI / 4;
            plan = dragOonCandidate(room, player, old.x + Math.cos(a) * radius, old.z + Math.sin(a) * radius, heading, old);
          }
          if (plan) break;
        }
      }
    } else {
      for (const distance of [7.5, 6.5, 9, 10.5]) {
        for (const offset of [0, 0.35, -0.35, 0.7, -0.7]) {
          const a = heading + offset;
          plan = dragOonCandidate(room, player, player.position.x - Math.sin(a) * distance, player.position.z - Math.cos(a) * distance, heading, null);
          if (plan) break;
        }
        if (plan) break;
      }
    }
    if (!plan) return { rejected: 'No clear, supported ground for DRAG-OON. Move into a wider open area.' };
    Object.assign(exits, plan.exits);
  }

  if (old) {
    for (const pid of dragOonOccupantIds(old)) {
      const occ = room.players.get(pid);
      if (occ) removeDragOonOccupant(room, old, occ, { exitPos: exits[pid] ?? null, at: now, reason: 'administrative' });
    }
    old.retired = true;
    old.mode = 'DESTROYED';
    old.operatorId = null;
    old.sprayHeld = false;
  }
  room.dragOonRevision = (room.dragOonRevision ?? 0) + 1;
  if (action === 'dismantle') {
    room.dragOon = null;
    room.events.push({ type: 'dragOonDismantled', machineId: old.id, at: now });
  } else {
    const b = plan.b;
    const skillId = selectedSiegeSkill(player, 'dragOon');
    Object.assign(b, {
      id: `dragoon-${room.code}-${room.dragOonRevision}`,
      ownerId: player.id,
      team: player.team ?? null,
      builtAt: now,
      skill: { ...(b.skill ?? {}), id: skillId },
    });
    room.dragOon = b;
    room.events.push({ type: 'dragOonConstructed', machineId: b.id, rebuild: Boolean(old), point: { x: b.x, y: b.y, z: b.z }, at: now });
  }
  return {};
}

export const practiceBiByeCommand=(room,player,action,now)=>practiceSiegeCommand(room,player,action,'bi-bye-llista',now);
export function practiceSiegeCommand(room,player,action,machine,now){
 if(machine==='fight-and-flight')return practiceFightFlight(room,player,action,now);
 if(machine===DRAG_OON_ID)return practiceDragOon(room,player,action,now);
 if(!['build','rebuild','dismantle'].includes(action)||!['bi-bye-llista','so-fist-ication'].includes(machine))return {rejected:'Unknown siege action or machine.'};
 const ram=machine==='so-fist-ication',field=ram?'soFistication':'biByeLlista',revision=ram?'soFistRevision':'biByeRevision';
 if(room?.mode!=='PRACTICE'||room.state!=='PLAYING'||!player?.alive||player.actorKind!=='human'||room.players.get(player.id)!==player)return {rejected:'Siege tools are available to living players in Practice.'};
 const old=room[field];
 if(action==='build'&&old)return {rejected:'This machine already exists. Rebuild or dismantle it.'};
 if(action!=='build'&&!old)return {rejected:'Build this siege machine first.'};
 if(old?.operatorId&&old.operatorId!==player.id)return {rejected:'Another Spellblade is operating this machine.'};
 let plan=null,exit=null;
 if(action==='dismantle'){
  if(old.operatorId){exit=ram?soFistExit(room,old,player,getBiByeSolids(room.biByeLlista)):practiceBiByeExit(room,old,player);if(!exit)return {rejected:'No safe place to dismount. Move the machine onto open ground.'};}
 }else{
  plan=placement(room,player,old,ram);if(!plan)return {rejected:'No clear, supported ground with safe access. Try a more open area.'};exit=plan.exit;
 }
 // All validation has succeeded. Removal/replacement is a single synchronous commit.
 if(old)retire(room,old,player,exit,ram);
 room[revision]=(room[revision]??0)+1;
 if(action==='dismantle'){
  room[field]=null;room.events.push({type:ram?'soFistDismantled':'bibyeDismantled',machineId:old.id,...(!ram?{ballistaId:old.id}:{}),at:now});
 }else{
  const b=plan.b;Object.assign(b,{id:`${ram?'sofist':'bibye'}-${room.code}-${room[revision]}`,ownerId:player.id,builtAt:now,...(!ram?{smallBoltReadyAt:now}:{})});
  room[field]=b;room.bibyeProjectiles??=new Map();
  room.events.push({type:ram?'soFistConstructed':'bibyeConstructed',machineId:b.id,...(!ram?{ballistaId:b.id}:{}),rebuild:Boolean(old),point:{x:b.x,y:b.y,z:b.z},at:now});
 }
 return {};
}
