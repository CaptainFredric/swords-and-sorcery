// SO-FIST-ICATION's detachable fist. State belongs to the MACHINE, not to the
// rider, and never resets fist HP on a throw, pickup, abyss loss or remount.
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {postureOf} from '../src/body.mjs';
import {areAllies} from '../src/teams.mjs';
import {structureWorld,structureForSolid,damageStructure} from './structures.mjs';
import {applyDamage,staggerBy,interruptHitActions,isInGuardCone} from './combat.mjs';
import {launchBody} from '../src/movement.mjs';
import {soFistStriker,soFistFrame,soFistPose,SO_FIST_SCALE} from './soFistGeometry.mjs';
import {SO_FIST_LIFT,soFistUpperPoint} from './soFistElevation.mjs';
import {damageBiByeLlista} from './biByeLlista.mjs';
import {biByeHitVolumes} from './biByeComponents.mjs';
import {fightFlightFirstHit,damageFightFlight} from './fightFlightComponents.mjs';
import {orientedBoxHit} from '../src/orientedBox.mjs';
import {skillOperator} from './siegeSkills.mjs';

// Measured from the delivered standalone GLB: 0.34052 local radius from
// its COM, and 0.23627 local COM-to-lowest-vertex. Use a wide swept sphere
// against obstacles and actual bottom height against the ground.
export const RAM_FIST=Object.freeze({speed:23,gravity:17,radius:.971,
  groundRadius:.6734,
  falloffStart:12,falloffEnd:36,closeDamage:125,farDamage:55,
  // Massive gauntlet: a blocked attack costs momentum, not the entire shot.
  actorRetention:.84,machineRetention:.72,wallSlide:.72,
  rollDrag:1.08,rollStop:.38,rollMinSpeed:1.1,groundBounce:.17,
  ledgeStep:.38,flightTimeout:8,
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
   if((b.components?.Fist?.health??0)<=0){
    f.state='destroyed';b.fistMounted=false;
    event(room,b,'destroyed',now,{hp:0});
    return 'The fist is destroyed. Recovery cannot repair it.';
   }
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
 if(f?.state==='destroyed')return 'The fist is destroyed and cannot be recovered.';
 if(f?.state==='rolling')return 'The fist is still rolling. Drive alongside it once it stops.';
 if(f)return 'The fist is still airborne.';
 if(b.skill?.id!=='longArmToTheJaw')return 'Equip Long Arm to the Jaw first.';
 if(b.fistMounted===false)return 'The fist is not attached.';
 if((b.components?.Fist?.health??0)<=0)
  return 'The armored fist is destroyed. The exposed piston still punches.';
 if(now+1e-8<(b.skill?.readyAt??0))return 'Long Arm to the Jaw is recovering.';
 if(b.strikeAt!=null&&now-b.strikeAt<4)return 'Wait for the forward piston to return.';
 // Launch from the actual fully attached striker in the new lifted/pitched
 // frame; the old piston-only fallback becomes active on the very next tick.
 const head=soFistStriker(b,now),axis=head.axes[2];
 // The authored fist COM is [0,.015,.215] in the fist/socket frame, whose
 // neutral carriage world origin is [0,.365,.520] authored metres. The old
 // OBB center was ~8 cm off and caused a sideways teleport at launch.
 const pose=soFistPose(b,now);
 const com=soFistUpperPoint(soFistFrame(b),b,
   [0,.380*SO_FIST_SCALE,.735*SO_FIST_SCALE+pose.offset]);
 const origin={x:com[0],y:com[1],z:com[2]};
 const velocity={x:axis[0]*RAM_FIST.speed,y:axis[1]*RAM_FIST.speed,z:axis[2]*RAM_FIST.speed};
 const home=b.fistHome??{x:b.spawnX??b.x,y:b.spawnY??b.y,z:b.spawnZ??b.z};
 b.fistHome=home;
 b.detachedFist={state:'flying',position:origin,velocity,launchedAt:now,
   launchHeading:b.heading??0,launchPitch:b.ramElevPitch??0,
   traveled:0,ownerId:p.id,home:{...home},impactCount:0,
   hitVictims:[],hitMachines:[],
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
  const rawHit=segmentAabbHit(vec(start),vec(end),target);
  if(!rawHit)continue;
  // A fast projectile can start a substep *inside* the conservative wall
  // envelope after a preceding contact. The ray API then reports t=0 and
  // a zero normal. Recover the approach face instead of ignoring it and
  // permitting a high-speed tunnel through masonry.
  let hit=rawHit;
  if(hit.t<=1e-6&&hit.normal?.every(v=>Math.abs(v)<1e-8)&&
     !box.axes&&box.center&&box.size){
    const delta=[end.x-start.x,end.y-start.y,end.z-start.z];
    const axis=[0,1,2].sort((i,j)=>Math.abs(delta[j])-Math.abs(delta[i]))[0];
    if(Math.abs(delta[axis])>1e-8){
     const normal=[0,0,0],edge=[start.x,start.y,start.z];
     normal[axis]=-Math.sign(delta[axis]);
     edge[axis]=box.center[axis]+normal[axis]*(box.size[axis]/2+RAM_FIST.radius+.02);
     hit={...hit,point:edge,normal};
    }
  }
  // The broad sphere must not snag on a trim edge which the modeled
  // gauntlet's lower surface has already cleared. Gentle lips are stepped
  // over; a real vertical obstruction still deflects the heavy body.
  const top=box.center?.[1]+(box.size?.[1]??0)/2;
  // The wide swept body protects the fist from tunneling, but the actual
  // modeled bottom is higher than the conservative sphere's lowest point.
  // A beam that passes entirely below that bottom must not snag it at all.
  if(Number.isFinite(top)&&top<Math.min(start.y,end.y)-RAM_FIST.groundRadius-.035)continue;
  const rise=top-(start.y-RAM_FIST.groundRadius);
  const lowLip=Number.isFinite(rise)&&rise>=-.03&&rise<=RAM_FIST.ledgeStep &&
    Math.hypot(end.x-start.x,end.z-start.z)>1e-6;
  const hitKind=lowLip?'step':'wall';
  if(hit&&(!nearest||hit.t<nearest.t))nearest={...hit,kind:hitKind,solid:box,top};
 }
 return nearest;
}
// A descending spherical fist lands on the upper surface. Never snap an
// ascending fist to a floor above it, nor teleport up through a bridge from
// below. Small ballistic substeps resolve ramp transitions and ledge edges.
function hitGround(start,end,world){
 if(end.y>=start.y-1e-9)return null;
 const horizon=Math.max(start.y,end.y)+RAM_FIST.groundRadius+.04;
 const a=surfaceHeightAt(start.x,start.z,horizon,world);
 const b=surfaceHeightAt(end.x,end.z,horizon,world);
 if(b==null)return null;
 const initial=a==null?null:start.y-RAM_FIST.groundRadius-a;
 const final=end.y-RAM_FIST.groundRadius-b;
 if(final>0||initial!=null&&initial<-.025)return null;
 const t=initial==null?1:clamp(initial/(initial-final||1),0,1);
 const center=point(start,end,t);
 return {t,kind:'ground',point:[center.x,b+RAM_FIST.groundRadius,center.z],normal:[0,1,0]};
}
function hitActors(room,b,start,end){
 let best=null;
 for(const p of room.players.values()){
  if(!p.alive||p.id===b.detachedFist.ownerId||
     b.detachedFist.hitVictims?.includes(p.id)||
     areAllies(room,b.detachedFist.ownerId,p.id))continue;
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
 const normalDamage=fistDamage(f.traveled);
 const normalHit=f.isFinal&&f.fragment?
   Math.round(normalDamage*85/RAM_FIST.closeDamage):normalDamage;
 // A rolling gauntlet remains a collision hazard but cannot reproduce its
 // full launch impact indefinitely on the ground.
 const damage=f.state==='rolling'?Math.round(normalHit*.22):normalHit;
 if(hit.kind==='actor'){
  f.hitVictims??=[];
  if(f.hitVictims.includes(hit.victim.id))return;
  f.hitVictims.push(hit.victim.id);
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
  f.hitMachines??=[];
  if(f.hitMachines.includes('ballista'))return;
  f.hitMachines.push('ballista');
  damageBiByeLlista(room,room.biByeLlista,damage,f.ownerId,'long-arm-to-the-jaw',now,
   {componentId:hit.box.componentId,point:at});
 }else if(hit.kind==='flight'){
  f.hitMachines??=[];
  if(f.hitMachines.includes('flight'))return;
  f.hitMachines.push('flight');
  damageFightFlight(room,room.fightFlight,damage,f.ownerId,'long-arm-to-the-jaw',now,
   {componentId:hit.componentId??hit.box.componentId,point:at});
 }else if(hit.kind==='wall'){
  const structure=structureForSolid(room.world,hit.solid);
  if(structure)damageStructure(room,structure.id,damage,f.ownerId,
    'long-arm-to-the-jaw',now,{raw:true,point:at});
 }
 event(room,b,'impact',now,{kind:hit.kind,componentId:hit.box?.componentId??hit.componentId,
   position:at,damage});
 f.impactCount++;
 const multiplier=hit.kind==='actor'?RAM_FIST.actorRetention:RAM_FIST.machineRetention;
 // Guard changes damage and stamina. It does not magically turn a flying
 // half-ton armored fist into a stationary object. Momentum is retained
 // after each distinct body or machine, so a line of knights can be hit.
 f.velocity={x:f.velocity.x*multiplier,y:f.velocity.y*multiplier,
   z:f.velocity.z*multiplier};
 f.angularVelocity={x:5.1,y:1.8,z:2.8};
}
export function stepDetachedRamFist(room,b,dt,now,world=room.world){
 if(!b?.detachedFist||b.retired||(b.health<=0&&!b.detachedFist.isFinal))return;
 const f=b.detachedFist;
 const parked=()=>{
  const home=f.home??b.fistHome;
  return Boolean(home&&!b.operatorId&&
   Math.hypot(b.x-home.x,b.z-home.z)<=SO_FIST_LIFT.recoveryRadius&&
   Math.abs(b.y-(home.y??b.y))<=1.5);
 };
 if((b.components?.Fist?.health??0)<=0&&!f.isFinal){
   if(f.state!=='destroyed'){f.state='destroyed';b.fistMounted=false;event(room,b,'destroyed',now,{hp:0});}
   return;
  }
  if(f.isFinal&&['abyss','resting','destroyed'].includes(f.state))return;
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
 if(!['flying','falling','rolling'].includes(f.state)||!Number.isFinite(dt)||dt<=0)return;
 // A fist launched during this server tick has not flown for the entire
 // tick. Never integrate a final death discharge before its launch timestamp.
 const simulatedDt=Math.min(dt,Math.max(0,now-(f.launchedAt??(now-dt))));
 if(simulatedDt<=0)return;
 const initialSpeed=Math.hypot(f.velocity.x,f.velocity.y,f.velocity.z);
 const steps=Math.min(128,Math.max(1,Math.ceil(simulatedDt/RAM_FIST.maxSubstep),
   Math.ceil(initialSpeed*simulatedDt/RAM_FIST.maxTravelStep)));
 const h=simulatedDt/steps;
 for(let i=0;i<steps;i++){
  const previous={...f.position},v={...f.velocity};
  let next={x:previous.x+v.x*h,
   y:previous.y+v.y*h-.5*RAM_FIST.gravity*h*h,
   z:previous.z+v.z*h};
  if(f.state==='rolling'){
   // Rolling stays supported at the *current* ground height. A ledge with
   // no support sends the fist falling with its remaining horizontal speed.
   const floor=surfaceHeightAt(next.x,next.z,previous.y+.1,world);
   if(floor==null){f.state='falling';next.y=previous.y-.5*RAM_FIST.gravity*h*h;}
   else next.y=floor+RAM_FIST.groundRadius;
  }
  const movement=Math.hypot(next.x-previous.x,next.y-previous.y,next.z-previous.z);
  const at=now-simulatedDt+h*(i+1);
  let hits=[hitWall(room,previous,next,world),
    f.state==='rolling'?null:hitGround(previous,next,world)];
  if(f.state==='flying'||f.state==='rolling'){
   hits.push(hitActors(room,b,previous,next));
   const ballista=room.biByeLlista;
   // Use the REAL articulated component OBBs. getBiByeSolids only provides
   // broad-phase AABBs and loses component IDs / physical openings.
   if(ballista&&ballista.health>0&&!ballista.retired&&!f.hitMachines?.includes('ballista'))
    for(const box of biByeHitVolumes(ballista,at)){
     const hit=orientedBoxHit(vec(previous),vec(next),box,RAM_FIST.radius);
     if(hit)hits.push({...hit,kind:'ballista'});
    }
   const flight=room.fightFlight;
   if(flight&&flight.health>0&&!flight.retired&&!f.hitMachines?.includes('flight')){
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
    const speed=Math.hypot(f.velocity.x,f.velocity.z);
    f.position.y=earliest.point[1];
    f.velocity.y=0;
    f.state=speed>=RAM_FIST.rollMinSpeed?'rolling':'resting';
    if(f.state==='resting'){
     f.velocity={x:0,y:0,z:0};f.angularVelocity={x:0,y:0,z:0};
     event(room,b,'landed',impactTime,{position:{...f.position}});
    }
   }else if(earliest.kind==='step'){
    const stepUp=Math.max(0,earliest.top+RAM_FIST.groundRadius-f.position.y);
    f.position.y+=Math.min(stepUp,RAM_FIST.ledgeStep);
    f.velocity.x*=.94;f.velocity.z*=.94;
    // Rolling over a short masonry lip is not a second damaging impact.
   }else if(earliest.kind==='actor'||earliest.kind==='ballista'||earliest.kind==='flight'){
    projectileImpact(room,b,f,earliest,impactTime);
    // Move clear of the contacted body before the next swept substep. This
    // plus hitVictims/hitMachines prevents an immediate zero-time rehit.
    const length=Math.hypot(f.velocity.x,f.velocity.y,f.velocity.z)||1;
    f.position.x+=f.velocity.x/length*.025;
    f.position.y+=f.velocity.y/length*.025;
    f.position.z+=f.velocity.z/length*.025;
   }else{
    // A genuine wall absorbs *normal* motion, not all tangential momentum.
    // Friction and rebound settle it; a glancing fist can still roll away.
    const n=wallNormal(earliest.normal,f.velocity);
    const inward=f.velocity.x*n[0]+f.velocity.y*n[1]+f.velocity.z*n[2];
    if(inward<0){
     f.velocity.x=(f.velocity.x-(1+RAM_FIST.wallRestitution)*inward*n[0])*RAM_FIST.wallSlide;
     f.velocity.y=(f.velocity.y-(1+RAM_FIST.wallRestitution)*inward*n[1])*RAM_FIST.wallSlide;
     f.velocity.z=(f.velocity.z-(1+RAM_FIST.wallRestitution)*inward*n[2])*RAM_FIST.wallSlide;
    }
    f.position={x:f.position.x+n[0]*.026,y:f.position.y+n[1]*.026,
      z:f.position.z+n[2]*.026};
    if(f.state==='flying')projectileImpact(room,b,f,earliest,impactTime);
    if(f.state==='flying')f.state='falling';
   }
  }
  if(f.state==='rolling'){
   const drag=Math.exp(-RAM_FIST.rollDrag*h);
   f.velocity.x*=drag;f.velocity.z*=drag;f.velocity.y=0;
   // Rotation is visual evidence of translated mass; it diminishes as the
   // carriage-sized object slows, rather than spinning forever in place.
   f.angularVelocity={x:-f.velocity.z/RAM_FIST.groundRadius,
     y:0,z:f.velocity.x/RAM_FIST.groundRadius};
   if(Math.hypot(f.velocity.x,f.velocity.z)<RAM_FIST.rollStop){
    f.state='resting';f.velocity={x:0,y:0,z:0};
    f.angularVelocity={x:0,y:0,z:0};
    event(room,b,'landed',at,{position:{...f.position}});
   }
  }
  // A settled body has no remaining substeps: do not integrate it through
  // more gravity or dispatch duplicate ground-landed events this same tick.
  if(f.state==='resting')break;
  // A substantial masonry collision spends the remaining fractional tick:
  // the next authoritative step starts from the separated, rebounding body.
  // Only player and machine impacts are allowed to continue through the
  // current tick, so a thin wall can never be crossed by leftover substeps.
  if(earliest?.kind==='wall')break;
  if(f.position.y<(Number.isFinite(world.abyssY)?world.abyssY:-30)||
     at-f.launchedAt>RAM_FIST.flightTimeout&&
      surfaceHeightAt(f.position.x,f.position.z,f.position.y+2,world)==null){
   f.state='abyss';f.velocity={x:0,y:0,z:0};
   event(room,b,'abyssLost',at,{home:f.home,hp:b.components.Fist.health});
   break;
  }
 }
}
