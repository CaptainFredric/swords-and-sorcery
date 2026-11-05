// Authoritative single-target repeater assistance. The player selects whom to
// follow; the actual mounted crossbow and physical bolts still do all damage.
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {postureOf} from '../src/body.mjs';
import {areAllies} from '../src/teams.mjs';
import {structureWorld} from './structures.mjs';
import {sweptSegmentCylinderHit} from './biByeLlista.mjs';
import {biByeFirstHit} from './biByeComponents.mjs';
import {soFistFirstHit} from './soFistGeometry.mjs';
import {frostGuardFaces,frostParryContact} from './biByeFrostGuard.mjs';
import {FLIGHT_REPEATER,flightMuzzle,flightDirection,flightRepeaterAim,flightTransform} from '../src/flightRepeaterAim.mjs';

const MAX_RANGE=FLIGHT_REPEATER.speed*FLIGHT_REPEATER.lifespan;
const RETARGET_LANDING_SEC=.45;
// Screen-space fractions of the half-viewport, not world-distance bubbles.
// Acquire with a forgiving cone; switch requires a closer look at somebody
// ELSE for a short dwell so two overlapping silhouettes cannot chatter.
export const NARROW_PREVIEW=Object.freeze({acquireRadius:.48,switchRadius:.36,
  switchMargin:.16,switchDwell:.12});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rayPoint=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
// Server-controlled bots and dummies intentionally have connected=false.
// Only disconnected *human* players are unavailable targets.
const targetOnline=p=>Boolean(p?.alive&&p.position&&
  (p.actorKind!=='human'||p.connected!==false));
const cylinder=(p,at=p.position)=>({x:at.x,y:at.y-FLIGHT_REPEATER.radius,z:at.z,
  radius:.45+FLIGHT_REPEATER.radius,height:postureOf(p).height+2*FLIGHT_REPEATER.radius});
const visor=m=>{const v=flightTransform(m,0,1.555,.215);
  return {x:m.x+v.x,y:m.y+v.y,z:m.z+v.z};};
const obstacles=room=>(structureWorld(room.world,room.structures).solids??[])
  .filter(s=>!String(s.id??'').startsWith('fight-flight-'));
const bodyPoints=(p,position=p.position)=>{
  const h=postureOf(p).height,points=[];
  // The swept body is a cylinder; small upper/lower and lateral openings
  // matter. Start with the likely torso, then actual uncovered extremities.
  for(const [height,sides] of [[.54,[0,-.31,.31]],[.97,[0,-.25,.25]],
    [.23,[0,-.31,.31]],[.79,[0,-.39,.39]],[.38,[0,-.42,.42]],
    [.9,[0,-.35,.35]],[.11,[0]]]){
    for(const side of sides)points.push({x:position.x+side,y:position.y+h*height,z:position.z});
  }
  return points;
};
function blocked(room,a,b,solids){
  const start=[a.x,a.y,a.z],end=[b.x,b.y,b.z];
  if(solids.some(s=>{const hit=segmentAabbHit(start,end,s);return hit&&hit.t<.995;}))return true;
  // A siege operator is not targetable through the machine's actual metal.
  if(room.biByeLlista&&biByeFirstHit(room.biByeLlista,start,end,0))return true;
  if(room.soFistication&&soFistFirstHit(room.soFistication,start,end,0))return true;
  return false;
}
function aimFrame(operator,aim=null){
  const input=operator?.input??{};
  return {yaw:Number.isFinite(aim?.yaw)?aim.yaw:Number.isFinite(input.yaw)?input.yaw:0,
    pitch:clamp(Number.isFinite(aim?.pitch)?aim.pitch:Number.isFinite(input.pitch)?input.pitch:0,-1.45,1.45),
    fov:clamp(Number.isFinite(input.viewFov)?input.viewFov:78,50,110)*Math.PI/180,
    aspect:clamp(Number.isFinite(input.viewAspect)?input.viewAspect:16/9,.65,2.8)};
}
export function narrowTargetVisible(room,m,target,solids=obstacles(room)){
  if(!targetOnline(target))return false;
  const start=visor(m);
  return bodyPoints(target).some(point=>!blocked(room,start,point,solids));
}
// Screen-space targeting only chooses candidates; camera aim never directly
// steers a shot at an enemy. This uses the authenticated server-side player
// view, never client-supplied target IDs or client-computed damage.
function angularScore(point,source,frame){
 const dx=point.x-source.x,dy=point.y-source.y,dz=point.z-source.z;
 const dist=Math.hypot(dx,dy,dz);
 if(dist<.001||dist>MAX_RANGE)return Infinity;
 const yaw=Math.atan2(-dx,-dz);
 const yawError=Math.atan2(Math.sin(yaw-frame.yaw),Math.cos(yaw-frame.yaw));
 const pitchError=Math.asin(clamp(dy/dist,-1,1))-frame.pitch;
 if(Math.abs(yawError)>=Math.PI/2||Math.abs(pitchError)>=Math.PI/2)return Infinity;
 const vertical=Math.tan(frame.fov/2);
 return Math.hypot(Math.tan(yawError)/(vertical*frame.aspect),
   Math.tan(pitchError)/vertical);
}
function reticleDistance(source,frame,p){
 const h=postureOf(p).height;
 return Math.min(...[.27,.52,.75,.93].map(v=>
   angularScore({x:p.position.x,y:p.position.y+h*v,z:p.position.z},source,frame)));
}
function previewCandidates(room,m,operator,aim){
 const frame=aimFrame(operator,aim),source=visor(m),solids=obstacles(room),out=[];
 for(const p of room.players.values()){
  if(!targetOnline(p)||p.id===operator.id||
    areAllies(room,operator.id,p.id)||!p.position)continue;
  const score=reticleDistance(source,frame,p);
  // Avoid a 20-point masonry/guard raycast for every distant/off-reticle
  // player on every 30Hz multiplayer tick. Keep the old incumbent eligible
  // for hysteresis even while it has drifted outside the acquisition cone.
  const incumbent=p.id===m.skill?.targetId;
  if(score>(incumbent?1.6:NARROW_PREVIEW.acquireRadius))continue;
  const visible=narrowTargetVisible(room,m,p,solids);
  out.push({p,score,visible});
 }
 out.sort((a,b)=>a.score-b.score||
   String(a.p.id).localeCompare(String(b.p.id)));
 return out;
}
export function narrowAcquireTarget(room,m,operator,now,aim=null){
 const skill=m.skill;
 if(!skill||skill.phase!=='active'||skill.id!=='narrowToOne'||skill.lockedOnce)return null;
 const options=previewCandidates(room,m,operator,aim);
 const previous=skill.targetId?room.players.get(skill.targetId):null;
 const valid=Boolean(targetOnline(previous)&&
   !areAllies(room,operator.id,previous.id)&&
   Math.hypot(previous.position.x-m.x,previous.position.y-m.y,
     previous.position.z-m.z)<=MAX_RANGE);
 if(!valid)skill.targetId=null;
 const incumbent=options.find(entry=>entry.p.id===skill.targetId);
 const best=options.find(entry=>entry.visible&&entry.score<=
   (skill.targetId?NARROW_PREVIEW.switchRadius:NARROW_PREVIEW.acquireRadius));
 if(!skill.targetId){
  skill.pendingTargetId=null;skill.pendingSince=null;
  if(best)skill.targetId=best.p.id; // immediate initial soft acquisition
 }else if(best&&best.p.id!==skill.targetId&&
   best.score+NARROW_PREVIEW.switchMargin<(incumbent?.score??Infinity)){
  if(skill.pendingTargetId!==best.p.id){
   skill.pendingTargetId=best.p.id;skill.pendingSince=now;
  }else if(now-(skill.pendingSince??now)>=NARROW_PREVIEW.switchDwell){
   skill.targetId=best.p.id;skill.pendingTargetId=null;skill.pendingSince=null;
  }
 }else{skill.pendingTargetId=null;skill.pendingSince=null;}
 if(skill.targetId!==skill.lastPreviewId){
  skill.lastPreviewId=skill.targetId;
  if(skill.targetId)room.events.push({type:'fightFlightTargetPreview',
    machineId:m.id,operatorId:operator.id,targetId:skill.targetId,at:now});
 }
 return skill.targetId;
}
// Only a REAL spawned bolt hard-locks the highlighted target. A preview is
// allowed to change with deliberate aim, but the final lock cannot drift as
// the third-person camera or player turns away.
export function narrowCommitLock(room,m,operator,now){
 const skill=m.skill;
 if(!skill||skill.phase!=='active'||skill.id!=='narrowToOne'||skill.lockedOnce||
   !skill.targetId)return false;
 skill.lockedOnce=true;skill.retargetReadyAt=Infinity;
 skill.trackingState='locked'; // immediate HUD feedback on the firing tick
 skill.pendingTargetId=null;skill.pendingSince=null;
 skill.wasGrounded=Boolean(m.grounded);
 room.events.push({type:'fightFlightTargetLock',
   machineId:m.id,operatorId:operator.id,targetId:skill.targetId,at:now});
 return true;
}
function predictedPosition(m,target){
  const t=Math.hypot(target.position.x-m.x,target.position.y-m.y,target.position.z-m.z)/FLIGHT_REPEATER.speed;
  const horizon=clamp(t,0,.9),v=target.velocity??{};
  // Lead a moving body without manufacturing movement faster than a normal
  // fighter can actually achieve. Bolts remain non-homing after release.
  const vx=clamp(Number.isFinite(v.x)?v.x:0,-12,12);
  const vy=clamp(Number.isFinite(v.y)?v.y:0,-10,10);
  const vz=clamp(Number.isFinite(v.z)?v.z:0,-12,12);
  return {x:target.position.x+vx*horizon,y:target.position.y+vy*horizon,z:target.position.z+vz*horizon};
}
function exposedShot(room,m,operator,target,now,solids){
  const at=predictedPosition(m,target),height=postureOf(target).height;
  for(const point of bodyPoints(target,at)){
    const aim=flightRepeaterAim(m,{siegeTarget:point});
    if(aim.limited)continue;
    const origin=flightMuzzle(m,aim),unit=flightDirection(m,aim);
    const projected=(point.x-origin.x)*unit.x+(point.y-origin.y)*unit.y+(point.z-origin.z)*unit.z;
    if(projected<=0||projected>MAX_RANGE)continue;
    const end={x:origin.x+unit.x*(projected+.6),y:origin.y+unit.y*(projected+.6),
      z:origin.z+unit.z*(projected+.6)};
    const targetHit=sweptSegmentCylinderHit(origin,end,cylinder(target,at));
    if(!targetHit)continue;
    const impact=rayPoint(origin,end,targetHit.t);
    if(blocked(room,origin,impact,solids))continue;
    const floor=surfaceHeightAt(impact.x,impact.z,origin.y,room.world);
    if(floor!=null&&impact.y<floor+.07)continue;
    if([...room.players.values()].some(other=>other.alive&&other.id!==operator.id&&
      other.id!==target.id&&!areAllies(room,operator.id,other.id)&&
      (sweptSegmentCylinderHit(origin,impact,cylinder(other))?.t??Infinity)<.995))continue;
    const velocity={x:unit.x*FLIGHT_REPEATER.speed,y:unit.y*FLIGHT_REPEATER.speed,
      z:unit.z*FLIGHT_REPEATER.speed};
    const dx=impact.x-at.x,dz=impact.z-at.z;
    const lateral=Math.abs(dx*Math.cos(target.yaw)+dz*-Math.sin(target.yaw));
    const guarded=frostGuardFaces(target,impact,velocity,true,FLIGHT_REPEATER.guardArc)&&
      impact.y-at.y>=height*.4&&impact.y-at.y<=height*.93&&lateral<=.43;
    const parried=Boolean(frostParryContact(target,{velocity,radius:FLIGHT_REPEATER.radius},
      origin,end,now,FLIGHT_REPEATER.guardArc));
    if(guarded||parried)continue;
    return aim;
  }
  return null;
}
// Before the first real bolt: sticky, continuously refreshed soft preview.
// After that bolt: the selected target remains exclusive until termination or
// an explicit grounded retarget. Camera motion never steers an active lock.
export function updateNarrowTracking(room,m,operator,now,previewAim=null){
  const skill=m.skill;
  if(!skill||skill.phase!=='active'||skill.id!=='narrowToOne')return null;
  if(skill.wasGrounded===false&&m.grounded&&skill.lockedOnce)
    skill.retargetReadyAt=now+RETARGET_LANDING_SEC;
  skill.wasGrounded=Boolean(m.grounded);
  if(!skill.lockedOnce)narrowAcquireTarget(room,m,operator,now,previewAim);
  const target=skill.targetId?room.players.get(skill.targetId):null;
  if(skill.lockedOnce&&skill.targetId&&!targetOnline(target))
    return {invalid:true,reason:'targetLost'};
  const solids=obstacles(room);
  // Once locked, actual crossbow traverse/elevation and physical visibility
  // control tracking. Before lock, the camera only nominates the preview.
  const visible=Boolean(target&&narrowTargetVisible(room,m,target,solids));
  const predicted=target?predictedPosition(m,target):null;
  const distance=target?Math.hypot(target.position.x-m.x,target.position.y-m.y,target.position.z-m.z):Infinity;
  const inTraverse=Boolean(visible&&distance<=MAX_RANGE&&
    bodyPoints(target,predicted).some(point=>!flightRepeaterAim(m,{siegeTarget:point}).limited));
  const aim=inTraverse?exposedShot(room,m,operator,target,now,solids):null;
  // Even if armour, cover or the joint stop prevents a *shot*, the real
  // articulated crossbow continues following the visible locked body.
  // The follow aim is presentation only: firing still requires `aim`.
  const followAim=visible?flightRepeaterAim(m,{siegeTarget:{
    x:predicted.x,y:predicted.y+postureOf(target).height*.56,z:predicted.z}}):null;
  skill.targetVisible=visible;
  skill.targetInTraverse=inTraverse;
  skill.noClearShot=Boolean(target&&inTraverse&&!aim);
  skill.trackingState=!target?'acquiring':!visible?'sightLost':!inTraverse?'outOfTraverse':
    !aim?'noClearShot':skill.lockedOnce?'locked':'preview';
  return {targetId:target?.id??null,visible,inTraverse,aim,followAim,
    locked:Boolean(skill.lockedOnce)};
}
