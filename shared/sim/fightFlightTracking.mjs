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
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rayPoint=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});
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
  if(!target?.alive||!target.position)return false;
  const start=visor(m);
  return bodyPoints(target).some(point=>!blocked(room,start,point,solids));
}
// The reticle is a choice, not a proximity sensor. Use the actual server-side
// visor and body cylinder; near misses or bodies hidden behind machinery fail.
export function narrowAcquireTarget(room,m,operator,now,aim=null){
  const skill=m.skill;
  if(!skill||skill.phase!=='active'||skill.id!=='narrowToOne')return null;
  if(skill.targetId&&(!m.grounded||!(now>=(skill.retargetReadyAt??Infinity))))return null;
  const frame=aimFrame(operator,aim),source=visor(m),c=Math.cos(frame.pitch);
  const end={x:source.x-Math.sin(frame.yaw)*c*MAX_RANGE,
    y:source.y+Math.sin(frame.pitch)*MAX_RANGE,
    z:source.z-Math.cos(frame.yaw)*c*MAX_RANGE};
  const solids=obstacles(room),hits=[];
  for(const p of room.players.values()){
    if(!p?.alive||p.id===operator.id||areAllies(room,operator.id,p.id)||!p.position)continue;
    const hit=sweptSegmentCylinderHit(source,end,cylinder(p));
    if(!hit)continue;
    const point=rayPoint(source,end,hit.t);
    if(blocked(room,source,point,solids)||!narrowTargetVisible(room,m,p,solids))continue;
    hits.push({p,t:hit.t});
  }
  hits.sort((a,b)=>a.t-b.t||String(a.p.id).localeCompare(String(b.p.id)));
  const selected=hits[0]?.p;
  if(!selected)return null;
  skill.targetId=selected.id;skill.lockedOnce=true;skill.retargetReadyAt=Infinity;
  skill.wasGrounded=Boolean(m.grounded);
  room.events.push({type:'fightFlightTargetLock',machineId:m.id,operatorId:operator.id,targetId:selected.id,at:now});
  updateNarrowTracking(room,m,operator,now);
  return selected.id;
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
// Never change targets automatically. Landing only grants a new deliberate
// reticle press, and a missing opening never makes an ordinary shot magical.
export function updateNarrowTracking(room,m,operator,now){
  const skill=m.skill;
  if(!skill||skill.phase!=='active'||skill.id!=='narrowToOne')return null;
  if(skill.wasGrounded===false&&m.grounded)skill.retargetReadyAt=now+RETARGET_LANDING_SEC;
  skill.wasGrounded=Boolean(m.grounded);
  const target=skill.targetId?room.players.get(skill.targetId):null;
  if(skill.targetId&&(!target?.alive||target.connected===false))
    return {invalid:true,reason:'targetLost'};
  const solids=obstacles(room);
  // Camera aim selects a target only at Skill activation. Once locked, actual
  // crossbow traverse/elevation and physical visibility control tracking.
  // This deliberately works in third-person when the camera looks elsewhere.
  const visible=Boolean(target&&narrowTargetVisible(room,m,target,solids));
  const predicted=target?predictedPosition(m,target):null;
  const distance=target?Math.hypot(target.position.x-m.x,target.position.y-m.y,target.position.z-m.z):Infinity;
  const inTraverse=Boolean(visible&&distance<=MAX_RANGE&&
    bodyPoints(target,predicted).some(point=>!flightRepeaterAim(m,{siegeTarget:point}).limited));
  const aim=inTraverse?exposedShot(room,m,operator,target,now,solids):null;
  skill.targetVisible=visible;
  skill.targetInTraverse=inTraverse;
  skill.noClearShot=Boolean(target&&inTraverse&&!aim);
  skill.trackingState=!target?'acquiring':!visible?'sightLost':!inTraverse?'outOfTraverse':
    !aim?'noClearShot':'locked';
  return {targetId:target?.id??null,visible,inTraverse,aim};
}
