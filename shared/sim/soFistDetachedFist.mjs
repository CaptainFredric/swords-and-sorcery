// SO-FIST-ICATION's detachable fist. State belongs to the MACHINE, not to the
// rider, and never resets fist HP on a throw, pickup, abyss loss or remount.
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {postureOf} from '../src/body.mjs';
import {areAllies} from '../src/teams.mjs';
import {structureWorld,structureForSolid,damageStructure} from './structures.mjs';
import {applyDamage,staggerBy,interruptHitActions} from './combat.mjs';
import {launchBody} from '../src/movement.mjs';
import {soFistStriker} from './soFistGeometry.mjs';
import {SO_FIST_LIFT} from './soFistElevation.mjs';
import {getBiByeSolids,damageBiByeLlista} from './biByeLlista.mjs';
import {fightFlightFirstHit,damageFightFlight} from './fightFlightComponents.mjs';
import {orientedBoxHit} from '../src/orientedBox.mjs';

export const RAM_FIST=Object.freeze({speed:23,gravity:17,radius:.62,
  falloffStart:12,falloffEnd:36,closeDamage:125,farDamage:55,
  horizontalDamping:.15,flightTimeout:8});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const hypot=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const vec=a=>[a.x,a.y,a.z];
const point=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
function validRamOperator(room,b,p){return Boolean(b&&p?.alive&&b.operatorId===p.id&&
  p.operatingRamId===b.id&&room.players.get(p.id)===p&&b.health>0&&!b.retired);}
const event=(room,b,action,at,extra={})=>room.events.push({type:'soFistDetachedFist',machineId:b.id,action,at,...extra});
const fistDamage=distance=>Math.round(RAM_FIST.closeDamage+
  (RAM_FIST.farDamage-RAM_FIST.closeDamage)*
  clamp((distance-RAM_FIST.falloffStart)/(RAM_FIST.falloffEnd-RAM_FIST.falloffStart),0,1));
export function requestLongArmToJaw(room,b,p,now){
 if(!validRamOperator(room,b,p))return 'Operate SO-FIST-ICATION first.';
 if(b.skill?.id!=='longArmToTheJaw')return 'Equip Long Arm to the Jaw first.';
 if((b.components?.Fist?.health??0)<=0)return 'The armored fist is destroyed. The exposed piston still punches.';
 const f=b.detachedFist;
 if(f?.state==='resting'){
  if(hypot({x:b.x,y:b.y,z:b.z},f.position)>SO_FIST_LIFT.pickupRadius)
   return 'Drive the carriage beside your fist to retrieve it.';
  b.detachedFist=null;b.fistMounted=true;
  b.skill.phase='idle';b.skill.readyAt=now+SO_FIST_LIFT.recoveryCooldown;
  event(room,b,'retrieved',now,{hp:b.components.Fist.health,readyAt:b.skill.readyAt});
  return null;
 }
 if(f?.state==='abyss')return 'Return to the original deployment site, then leave the ram for recovery.';
 if(f?.state==='recovering')return 'The ram is undergoing unoccupied fist recovery.';
 if(f)return 'The fist is still airborne.';
 if(now+1e-8<(b.skill?.readyAt??0))return 'Long Arm to the Jaw is recovering.';
 if(b.strikeAt!=null&&now-b.strikeAt<4)return 'Wait for the forward piston to return.';
 // Launch from the actual fully attached striker in the new lifted/pitched
 // frame; the old piston-only fallback becomes active on the very next tick.
 const head=soFistStriker(b,now),axis=head.axes[2],
  origin={x:head.center[0]+axis[0]*head.size[2]/2,
    y:head.center[1]+axis[1]*head.size[2]/2,
    z:head.center[2]+axis[2]*head.size[2]/2};
 const velocity={x:axis[0]*RAM_FIST.speed,y:axis[1]*RAM_FIST.speed,z:axis[2]*RAM_FIST.speed};
 const home=b.fistHome??{x:b.spawnX??b.x,y:b.spawnY??b.y,z:b.spawnZ??b.z};
 b.fistHome=home;
 b.detachedFist={state:'flying',position:origin,velocity,launchedAt:now,
   traveled:0,ownerId:p.id,home:{...home},impactCount:0,
   healthAtLaunch:b.components.Fist.health};
 b.fistMounted=false;b.skill.phase='active';b.skill.primedAt=now;
 event(room,b,'launched',now,{position:origin,velocity,hp:b.components.Fist.health});
 return null;
}
function hitWall(room,start,end,world){
 let nearest=null;
 for(const box of structureWorld(world,room.structures).solids??[]){
  const target={...box,size:box.size?.map(x=>x+RAM_FIST.radius*2)};
  if(!target.size)continue;
  const hit=segmentAabbHit(vec(start),vec(end),target);
  if(hit&&(!nearest||hit.t<nearest.t))nearest={...hit,kind:'wall',solid:box};
 }
 return nearest;
}
function hitActors(room,b,start,end){
 let best=null;
 for(const p of room.players.values()){
  if(!p.alive||p.id===b.detachedFist.ownerId||areAllies(room,b.detachedFist.ownerId,p.id))continue;
  const h=postureOf(p).height,center=[p.position.x,p.position.y+h/2,p.position.z];
  const box={center,size:[.9+2*RAM_FIST.radius,h+2*RAM_FIST.radius,.9+2*RAM_FIST.radius],
    axes:[[1,0,0],[0,1,0],[0,0,1]]};
  const hit=orientedBoxHit(vec(start),vec(end),box);
  if(hit&&(!best||hit.t<best.t))best={...hit,kind:'actor',victim:p};
 }
 return best;
}
function projectileImpact(room,b,f,hit,now){
 const at={x:hit.point[0],y:hit.point[1],z:hit.point[2]};
 const damage=fistDamage(f.traveled);
 if(hit.kind==='actor'){
  if(applyDamage(room,f.ownerId,hit.victim.id,damage,'long-arm-to-the-jaw',now,null)){
   staggerBy(room,hit.victim,90,now,f.ownerId);
   launchBody(hit.victim,{x:f.velocity.x*.55,y:5,z:f.velocity.z*.55},8);
   interruptHitActions(room,hit.victim,f.ownerId,now,'long-arm-to-the-jaw');
  }
 }else if(hit.kind==='ballista'){
  damageBiByeLlista(room,room.biByeLlista,damage,f.ownerId,'long-arm-to-the-jaw',now,
   {componentId:hit.box.componentId,point:at});
 }else if(hit.kind==='flight'){
  damageFightFlight(room,room.fightFlight,damage,f.ownerId,'long-arm-to-the-jaw',now,
   {componentId:hit.box.componentId,point:at});
 }else if(hit.kind==='wall'){
  const structure=structureForSolid(room.world,hit.solid);
  if(structure)damageStructure(room,structure.id,damage,f.ownerId,'long-arm-to-the-jaw',now,{raw:true,point:at});
 }
 event(room,b,'impact',now,{kind:hit.kind,position:at,damage});
 f.position=at;f.velocity={x:f.velocity.x*.15,y:Math.min(0,f.velocity.y*.15),z:f.velocity.z*.15};
 f.state='falling';f.impactCount++;
}
export function stepDetachedRamFist(room,b,dt,now,world=room.world){
 if(!b?.detachedFist||b.retired||b.health<=0)return;
 const f=b.detachedFist;
 if(f.state==='abyss'){
  const home=f.home??b.fistHome;
  if(home&&!b.operatorId&&Math.hypot(b.x-home.x,b.z-home.z)<=SO_FIST_LIFT.recoveryRadius&&
    Math.abs(b.y-(home.y??b.y))<=1.5){
   f.state='recovering';f.recoverAt=now+SO_FIST_LIFT.recoveryCooldown;
   b.fistRecoveryUntil=f.recoverAt;b.speed=0;b.charging=false;
   event(room,b,'recoveryStarted',now,{readyAt:f.recoverAt,hp:b.components.Fist.health});
  }
  return;
 }
 if(f.state==='recovering'){
  if(now+1e-8>=f.recoverAt){
   // Same physical fist, same component HP. The downtime does not mend it.
   b.fistMounted=b.components.Fist.health>0;b.detachedFist=null;
   b.fistRecoveryUntil=0;b.skill.phase='idle';b.skill.readyAt=now;
   event(room,b,'recoveredFromAbyss',now,{hp:b.components.Fist.health});
  }
  return;
 }
 if(f.state==='resting')return;
 if(!['flying','falling'].includes(f.state))return;
 const previous={...f.position},v={...f.velocity};
 const next={x:previous.x+v.x*dt,
   y:previous.y+v.y*dt-.5*RAM_FIST.gravity*dt*dt,
   z:previous.z+v.z*dt};
 f.velocity.y-=RAM_FIST.gravity*dt;
 f.traveled+=Math.hypot(next.x-previous.x,next.y-previous.y,next.z-previous.z);
 if(f.state==='flying'){
  const hits=[hitWall(room,previous,next,world),hitActors(room,b,previous,next)];
  const ballista=room.biByeLlista;
  if(ballista&&ballista.health>0)for(const box of getBiByeSolids(ballista)){
   const hit=orientedBoxHit(vec(previous),vec(next),{...box,size:box.size.map(x=>x+RAM_FIST.radius*2)});
   if(hit)hits.push({...hit,kind:'ballista'});
  }
  const flight=room.fightFlight;
  if(flight&&flight.health>0&&!flight.retired){
   const hit=fightFlightFirstHit(flight,vec(previous),vec(next),RAM_FIST.radius);
   if(hit)hits.push({...hit,kind:'flight'});
  }
  const earliest=hits.filter(Boolean).sort((a,b)=>a.t-b.t)[0];
  if(earliest){projectileImpact(room,b,f,earliest,now);return;}
 }
 const floor=surfaceHeightAt(next.x,next.z,previous.y+2,world);
 if(floor!==null&&next.y-RAM_FIST.radius<=floor){
  f.position={x:next.x,y:floor+RAM_FIST.radius,z:next.z};
  f.velocity={x:0,y:0,z:0};f.state='resting';
  event(room,b,'landed',now,{position:f.position});
  return;
 }
 f.position=next;
 const abyss=Number.isFinite(world.abyssY)?world.abyssY:-30;
 if(next.y<abyss||now-f.launchedAt>RAM_FIST.flightTimeout&&floor===null){
  f.state='abyss';f.velocity={x:0,y:0,z:0};
  event(room,b,'abyssLost',now,{home:f.home,hp:b.components.Fist.health});
 }
}
