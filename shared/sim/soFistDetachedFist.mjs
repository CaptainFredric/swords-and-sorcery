// SO-FIST-ICATION's detachable fist. State belongs to the MACHINE, not to the
// rider, and never resets fist HP on a throw, pickup, abyss loss or remount.
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {postureOf} from '../src/body.mjs';
import {areAllies} from '../src/teams.mjs';
import {structureWorld,structureForSolid,damageStructure} from './structures.mjs';
import {applyDamage,staggerBy,interruptHitActions,isInGuardCone} from './combat.mjs';
import {launchBody} from '../src/movement.mjs';
import {soFistStriker} from './soFistGeometry.mjs';
import {SO_FIST_LIFT} from './soFistElevation.mjs';
import {damageBiByeLlista} from './biByeLlista.mjs';
import {biByeHitVolumes} from './biByeComponents.mjs';
import {fightFlightFirstHit,damageFightFlight} from './fightFlightComponents.mjs';
import {orientedBoxHit} from '../src/orientedBox.mjs';
import {skillOperator} from './siegeSkills.mjs';

export const RAM_FIST=Object.freeze({speed:23,gravity:17,radius:.62,
  falloffStart:12,falloffEnd:36,closeDamage:125,farDamage:55,
  horizontalDamping:.15,flightTimeout:8,
  maxSubstep:1/90,maxTravelStep:.26,wallRestitution:.14});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hypot=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const vec=a=>[a.x,a.y,a.z];
const point=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
const wallNormal=(normal,velocity)=>{
 const length=Math.hypot(...(normal??[]));
 if(length>1e-6)return normal.map(v=>v/length);
 const motion=Math.hypot(velocity.x,velocity.y,velocity.z)||1;
 return [-velocity.x/motion,-velocity.y/motion,-velocity.z/motion];
};
function hasPickupLine(room,b,position){
 // Proximity alone cannot recall a fist through a masonry wall or bridge.
 const start=[b.x,b.y+.9,b.z],end=[position.x,position.y,position.z];
 for(const solid of structureWorld(room.world,room.structures).solids??[]){
  const hit=segmentAabbHit(start,end,solid);
  if(hit&&hit.t>1e-4&&hit.t<.999)return false;
 }
 return true;
}
function validRamOperator(room,b,p,now){
 return Boolean(p&&room.players.get(p.id)===p&&skillOperator(room,b,p,now));
}
const event=(room,b,action,at,extra={})=>room.events.push({type:'soFistDetachedFist',machineId:b.id,action,at,...extra});
const fistDamage=distance=>Math.round(RAM_FIST.closeDamage+
  (RAM_FIST.farDamage-RAM_FIST.closeDamage)*
  clamp((distance-RAM_FIST.falloffStart)/(RAM_FIST.falloffEnd-RAM_FIST.falloffStart),0,1));
export function requestLongArmToJaw(room,b,p,now){
 if(!validRamOperator(room,b,p,now))return 'The SO-FIST-ICATION operator is unavailable.';
 const f=b.detachedFist;
 if(f?.state==='resting'){
  if(hypot({x:b.x,y:b.y,z:b.z},f.position)>SO_FIST_LIFT.pickupRadius)
   return 'Drive the carriage beside your fist to retrieve it.';
  if(!hasPickupLine(room,b,f.position))
   return 'The fist is obstructed. Drive around the obstacle before retrieving it.';
  b.detachedFist=null;b.fistMounted=b.components.Fist.health>0;
  b.skill.phase='idle';
  b.skill.readyAt=Math.max(b.skill.readyAt??0,
    now+SO_FIST_LIFT.recoveryCooldown);
  event(room,b,'retrieved',now,{hp:b.components.Fist.health,readyAt:b.skill.readyAt});
  return null;
 }
 if(f?.state==='abyss')return 'Return to the original deployment site, then leave the ram for recovery.';
 if(f?.state==='recovering')return 'The ram is undergoing unoccupied fist recovery.';
 if(f)return 'The fist is still airborne.';
 if(b.skill?.id!=='longArmToTheJaw')return 'Equip Long Arm to the Jaw first.';
 if(b.fistMounted===false)return 'The fist is not attached.';
 if((b.components?.Fist?.health??0)<=0)
  return 'The armored fist is destroyed. The exposed piston still punches.';
 if(now+1e-8<(b.skill?.readyAt??0))return 'Long Arm to the Jaw is recovering.';
 if(b.strikeAt!=null&&now-b.strikeAt<4)return 'Wait for the forward piston to return.';
 // Launch from the actual fully attached striker in the new lifted/pitched
 // frame; the old piston-only fallback becomes active on the very next tick.
 const head=soFistStriker(b,now),axis=head.axes[2],
  // The detached body's center begins exactly where the attached mesh stood.
  // Spawning a half-fist ahead would teleport it through nearby targets.
  origin={x:head.center[0],y:head.center[1],z:head.center[2]};
 const velocity={x:axis[0]*RAM_FIST.speed,y:axis[1]*RAM_FIST.speed,z:axis[2]*RAM_FIST.speed};
 const home=b.fistHome??{x:b.spawnX??b.x,y:b.spawnY??b.y,z:b.spawnZ??b.z};
 b.fistHome=home;
 b.detachedFist={state:'flying',position:origin,velocity,launchedAt:now,
   traveled:0,ownerId:p.id,home:{...home},impactCount:0,
   spin:{x:0,y:0,z:0},angularVelocity:{x:6.8,y:1.1,z:.7},
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
// A descending spherical fist lands on the upper surface. Never snap an
// ascending fist to a floor above it, nor teleport up through a bridge from
// below. Small ballistic substeps resolve ramp transitions and ledge edges.
function hitGround(start,end,world){
 if(end.y>=start.y-1e-9)return null;
 const horizon=Math.max(start.y,end.y)+RAM_FIST.radius+.04;
 const a=surfaceHeightAt(start.x,start.z,horizon,world);
 const b=surfaceHeightAt(end.x,end.z,horizon,world);
 if(b==null)return null;
 const initial=a==null?null:start.y-RAM_FIST.radius-a;
 const final=end.y-RAM_FIST.radius-b;
 if(final>0||initial!=null&&initial<-.025)return null;
 const t=initial==null?1:clamp(initial/(initial-final||1),0,1);
 const center=point(start,end,t);
 return {t,kind:'ground',point:[center.x,b+RAM_FIST.radius,center.z],normal:[0,1,0]};
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
  const guarded=Boolean(hit.victim.guarding&&
    isInGuardCone(hit.victim,{position:at},now));
  if(guarded){
   hit.victim.guardStamina=Math.max(0,(hit.victim.guardStamina??0)-55);
   hit.victim.lastGuardDrainAt=now;
   if(hit.victim.guardStamina<=0){
    hit.victim.guarding=false;
    room.events.push({type:'guardBreak',attackerId:f.ownerId,
      defenderId:hit.victim.id,at:now});
   }
  }
  if(applyDamage(room,f.ownerId,hit.victim.id,guarded?Math.round(damage*.55):damage,
    'long-arm-to-the-jaw',now,null)){
   staggerBy(room,hit.victim,guarded?45:90,now,f.ownerId);
   launchBody(hit.victim,{x:f.velocity.x*(guarded?.26:.55),y:guarded?2:5,
     z:f.velocity.z*(guarded?.26:.55)},8);
   interruptHitActions(room,hit.victim,f.ownerId,now,'long-arm-to-the-jaw');
  }
 }else if(hit.kind==='ballista'){
  damageBiByeLlista(room,room.biByeLlista,damage,f.ownerId,'long-arm-to-the-jaw',now,
   {componentId:hit.box.componentId,point:at});
 }else if(hit.kind==='flight'){
  damageFightFlight(room,room.fightFlight,damage,f.ownerId,'long-arm-to-the-jaw',now,
   {componentId:hit.componentId??hit.box.componentId,point:at});
 }else if(hit.kind==='wall'){
  const structure=structureForSolid(room.world,hit.solid);
  if(structure)damageStructure(room,structure.id,damage,f.ownerId,
    'long-arm-to-the-jaw',now,{raw:true,point:at});
 }
 event(room,b,'impact',now,{kind:hit.kind,componentId:hit.box?.componentId??hit.componentId,
   position:at,damage});
 f.position=at;
 const normal=wallNormal(hit.normal,f.velocity);
 const inward=f.velocity.x*normal[0]+f.velocity.y*normal[1]+f.velocity.z*normal[2];
 const reflect=hit.kind==='wall'&&inward<0?(1+RAM_FIST.wallRestitution)*inward:0;
 f.velocity={x:(f.velocity.x-reflect*normal[0])*RAM_FIST.horizontalDamping,
   y:Math.max(-3,Math.min(2,(f.velocity.y-reflect*normal[1])*.15)),
   z:(f.velocity.z-reflect*normal[2])*RAM_FIST.horizontalDamping};
 f.angularVelocity={x:3.4,y:2.8,z:2.1};
 f.state='falling';f.impactCount++;
}
export function stepDetachedRamFist(room,b,dt,now,world=room.world){
 if(!b?.detachedFist||b.retired||b.health<=0)return;
 const f=b.detachedFist;
 const parked=()=>{
  const home=f.home??b.fistHome;
  return Boolean(home&&!b.operatorId&&
   Math.hypot(b.x-home.x,b.z-home.z)<=SO_FIST_LIFT.recoveryRadius&&
   Math.abs(b.y-(home.y??b.y))<=1.5);
 };
 if(f.state==='abyss'){
  if(parked()){
   f.state='recovering';f.recoverAt=now+SO_FIST_LIFT.recoveryCooldown;
   b.fistRecoveryUntil=f.recoverAt;b.speed=0;b.charging=false;
   event(room,b,'recoveryStarted',now,
     {readyAt:f.recoverAt,hp:b.components.Fist.health});
  }
  return;
 }
 if(f.state==='recovering'){
  // No teleporting a recovering machine away, boarding it, or accruing an
  // unattended repair timer while it is no longer at the real home site.
  if(!parked()){
   f.state='abyss';f.recoverAt=null;b.fistRecoveryUntil=0;
   event(room,b,'recoveryInterrupted',now);
   return;
  }
  if(now+1e-8>=f.recoverAt){
   b.fistMounted=b.components.Fist.health>0;b.detachedFist=null;
   b.fistRecoveryUntil=0;b.skill.phase='idle';b.skill.readyAt=now;
   event(room,b,'recoveredFromAbyss',now,{hp:b.components.Fist.health});
  }
  return;
 }
 if(f.state==='resting')return;
 if(!['flying','falling'].includes(f.state)||!Number.isFinite(dt)||dt<=0)return;
 const initialSpeed=Math.hypot(f.velocity.x,f.velocity.y,f.velocity.z);
 const steps=Math.max(1,Math.min(128,Math.ceil(dt/RAM_FIST.maxSubstep),
   Math.ceil(initialSpeed*dt/RAM_FIST.maxTravelStep)));
 const h=dt/steps;
 for(let i=0;i<steps;i++){
  const previous={...f.position},v={...f.velocity};
  const next={x:previous.x+v.x*h,
   y:previous.y+v.y*h-.5*RAM_FIST.gravity*h*h,
   z:previous.z+v.z*h};
  const movement=Math.hypot(next.x-previous.x,next.y-previous.y,next.z-previous.z);
  const at=now-dt+h*(i+1);
  let hits=[hitWall(room,previous,next,world),hitGround(previous,next,world)];
  if(f.state==='flying'){
   hits.push(hitActors(room,b,previous,next));
   const ballista=room.biByeLlista;
   // Use the REAL articulated component OBBs. getBiByeSolids only provides
   // broad-phase AABBs and loses component IDs / physical openings.
   if(ballista&&ballista.health>0&&!ballista.retired)
    for(const box of biByeHitVolumes(ballista,at)){
     const hit=orientedBoxHit(vec(previous),vec(next),box,RAM_FIST.radius);
     if(hit)hits.push({...hit,kind:'ballista'});
    }
   const flight=room.fightFlight;
   if(flight&&flight.health>0&&!flight.retired){
    const hit=fightFlightFirstHit(flight,vec(previous),vec(next),RAM_FIST.radius);
    if(hit)hits.push({...hit,kind:'flight'});
   }
  }
  const earliest=hits.filter(Boolean).sort((a,b)=>a.t-b.t)[0];
  const alpha=earliest?clamp(earliest.t,0,1):1;
  f.traveled+=movement*alpha;
  f.position=earliest?
    {x:earliest.point[0],y:earliest.point[1],z:earliest.point[2]}:next;
  f.velocity.y=v.y-RAM_FIST.gravity*h*alpha;
  f.spin??={x:0,y:0,z:0};
  f.angularVelocity??={x:6.8,y:1.1,z:.7};
  for(const axis of ['x','y','z'])
   f.spin[axis]+=f.angularVelocity[axis]*h*alpha;
  if(earliest){
   const impactTime=at-h*(1-alpha);
   if(earliest.kind==='ground'){
    f.velocity={x:0,y:0,z:0};f.angularVelocity={x:0,y:0,z:0};
    f.state='resting';
    event(room,b,'landed',impactTime,{position:f.position});
   }else if(f.state==='flying'){
    projectileImpact(room,b,f,earliest,impactTime);
   }else{
    // Once spent, the fist can glance off masonry but cannot deal a second
    // full-power attack by being bounced or dragged through another collider.
    const normal=wallNormal(earliest.normal,f.velocity);
    const inward=f.velocity.x*normal[0]+f.velocity.y*normal[1]+f.velocity.z*normal[2];
    if(inward<0){
     const impulse=(1+RAM_FIST.wallRestitution)*inward;
     f.velocity.x=(f.velocity.x-impulse*normal[0])*.55;
     f.velocity.y=(f.velocity.y-impulse*normal[1])*.55;
     f.velocity.z=(f.velocity.z-impulse*normal[2])*.55;
    }
    f.position={x:f.position.x+normal[0]*.005,y:f.position.y+normal[1]*.005,
      z:f.position.z+normal[2]*.005};
   }
   break;
  }
  if(f.position.y<(Number.isFinite(world.abyssY)?world.abyssY:-30)||
     at-f.launchedAt>RAM_FIST.flightTimeout&&
      surfaceHeightAt(f.position.x,f.position.z,f.position.y+2,world)==null){
   f.state='abyss';f.velocity={x:0,y:0,z:0};
   event(room,b,'abyssLost',at,{home:f.home,hp:b.components.Fist.health});
   break;
  }
 }
}
