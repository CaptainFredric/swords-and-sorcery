// Authoritative HELLping Hand state and animation clock.
// Passenger boarding requires the ally's own INTERACT command.
import {areAllies} from '../src/teams.mjs';
import {postureOf} from '../src/body.mjs';
import {surfaceHeightAt,resolvePlayerWorld} from '../src/collision.mjs';
import {applyDamage,interruptHitActions,isInGuardCone,breakGuard} from './combat.mjs';
import {launchBody} from '../src/movement.mjs';
import {skillOperator,SIEGE_SKILLS,skillEvent} from './siegeSkills.mjs';
import {SO_FIST_SCALE,soFistFrame,soFistSolids,machineryOverlap} from './soFistGeometry.mjs';
import {soFistUpperPoint} from './soFistElevation.mjs';
import {getBiByeSolids} from './biByeLlista.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const HELLPING=Object.freeze({crushSeconds:4,reach:2.25,openSeconds:1,
  vaultSeconds:3,vaultTravel:1.15*SO_FIST_SCALE,vaultHeight:.969,cooldown:24});
const site=(b,y,z)=>soFistUpperPoint(soFistFrame(b),b,[0,y*SO_FIST_SCALE,z*SO_FIST_SCALE]);
const palm=b=>site(b,.34,.885);
const seat=b=>site(b,.33,.715);
const distance=(p,v)=>Math.hypot(p.position.x-v[0],p.position.y+postureOf(p).height*.5-v[1],p.position.z-v[2]);
const near=(b,p,r=HELLPING.reach)=>distance(p,palm(b))<=r;
const emit=(room,b,action,at,extra={})=>room.events.push({type:'soFistHellping',machineId:b.id,action,at,...extra});
function eligible(p,b){
 return Boolean(p?.alive&&p.id!==b.operatorId&&!p.operatingRamId&&!p.operatingBallistaId&&
  !p.operatingFightFlightId&&!p.hellpingCapturedBy&&!p.hellpingCarriedBy);
}
function safeExit(room,b,p){
 const frame=soFistFrame(b),rear=frame.axes[2],right=frame.axes[0],world=room.world;
 for(const side of [1,-1,0]){
  const x=b.x-rear[0]*3.3+right[0]*side*2.6,z=b.z-rear[2]*3.3+right[2]*side*2.6;
  const y=surfaceHeightAt(x,z,b.y+.7,world);
  if(y==null||Math.abs(y-b.y)>1.2)continue;
  const point={x,y,z};
  const collision=[...(world.solids??[]),...soFistSolids(b),...getBiByeSolids(room.biByeLlista)];
  const resolved=resolvePlayerWorld(point,.45,collision,postureOf(p).height);
  if(Math.hypot(resolved.x-x,resolved.z-z)<.04)return point;
 }
 return null;
}
function dislodge(room,b,now,force){
 const h=b.hellping,p=room.players.get(h?.targetId);
 if(!p)return true;
 if(h.phase==='transport'){
  const exit=safeExit(room,b,p);
  if(!exit&&!force)return false;
  if(exit)p.position=exit;
  else{
   const q=palm(b),direction=soFistFrame(b).axes[2];
   p.position={x:q[0],y:q[1],z:q[2]};
   launchBody(p,{x:-direction[0]*5,y:2.5,z:-direction[2]*5},5);
  }
  delete p.hellpingCarriedBy;
 }else if(h.phase==='grasp'){
  delete p.hellpingCapturedBy;
  if(p.alive){
   const q=palm(b),direction=soFistFrame(b).axes[2];
   p.position={x:q[0],y:Math.max(b.y,q[1]-.7),z:q[2]};
   launchBody(p,{x:direction[0]*5,y:3,z:direction[2]*5},5);
  }
 }
 h.targetId=null;
 return true;
}
export function releaseHellpingHand(room,b,now,{force=false}={}){
 const h=b?.hellping;
 if(!h||h.phase==='release')return true;
 if(!dislodge(room,b,now,force))return false;
 b.hellping={phase:'release',at:now,until:now+1.2};
 if(b.skill?.id==='hellpingHand'){
  b.skill.phase='idle';
  b.skill.readyAt=Math.max(b.skill.readyAt??0,now+SIEGE_SKILLS.hellpingHand.cooldown);
  skillEvent(room,b,now,'released');
 }
 emit(room,b,'released',now);return true;
}
export function boardHellpingHand(room,b,p,now){
 if(!b||!b.operatorId||b.skill?.id!=='hellpingHand'||b.hellping?.phase!=='open'||
    !eligible(p,b)||!areAllies(room,b.operatorId,p.id)||!near(b,p,3)||
    b.fistMounted===false||(b.components?.Fist?.health??0)<=0)return false;
 b.hellping={phase:'transport',targetId:p.id,at:now};
 p.hellpingCarriedBy=b.id;p.velocity={x:0,y:0,z:0};
 emit(room,b,'passengerBoarded',now,{passengerId:p.id});return true;
}
export function exitHellpingHand(room,b,p,now){
 if(b?.hellping?.phase!=='transport'||b.hellping.targetId!==p?.id)return false;
 const exit=safeExit(room,b,p);
 if(!exit)return false;
 p.position=exit;delete p.hellpingCarriedBy;
 // Keep the open-palm mechanics while all clients play Argon's real rear
 // egress clip; exitAt replicates with the ordinary authoritative snapshot.
 b.hellping={phase:'open',at:now-HELLPING.openSeconds,exitAt:now};
 emit(room,b,'passengerExited',now,{passengerId:p.id});return true;
}
function vault(room,b,now,direction){
 const f=soFistFrame(b).axes[2];
 const x=b.x+f[0]*direction*HELLPING.vaultTravel;
 const z=b.z+f[2]*direction*HELLPING.vaultTravel;
 const y=surfaceHeightAt(x,z,b.y+.7,room.world);
 if(y==null||Math.abs(y-b.y)>1)return false;
 b.hellping={phase:'vault',at:now,direction,
  start:{x:b.x,y:b.y,z:b.z},landing:{x,y,z}};
 b.speed=0;b.charging=false;emit(room,b,'vaultStarted',now,{direction});
 return true;
}
export function requestHellpingHand(room,b,p,now){
 if(!skillOperator(room,b,p,now))return 'The ram operator is unavailable.';
 if(b.fistMounted===false||(b.components?.Fist?.health??0)<=0||
    (b.components?.Drive?.health??0)<=0)return 'HELLping Hand requires a functional armored fist and drive.';
 const h=b.hellping;
 if(h?.phase==='transport'||h?.phase==='grasp')
  return releaseHellpingHand(room,b,now)?null:'No safe rear exit; move the ram to clear ground.';
 if(h?.phase==='vault'||h?.phase==='release')return 'HELLping Hand is recovering.';
 if(h?.phase!=='open'){
  if(now<(b.skill.readyAt??0)-1e-8)return 'HELLping Hand is recovering.';
  b.hellping={phase:'open',at:now};b.skill.phase='active';b.skill.primedAt=now;
  skillEvent(room,b,now,'activated');emit(room,b,'opened',now);return null;
 }
 const victim=[...room.players.values()].filter(q=>eligible(q,b)&&
  !areAllies(room,b.operatorId,q.id)&&near(b,q))
   .sort((a,c)=>distance(a,palm(b))-distance(c,palm(b))||
     String(a.id).localeCompare(String(c.id)))[0];
 if(victim){
  if(victim.guarding&&isInGuardCone(victim,{position:{x:b.x,y:b.y,z:b.z}},now)){
   victim.guardStamina=Math.max(0,(victim.guardStamina??0)-50);
   victim.lastGuardDrainAt=now;
   if(victim.guardStamina<=0){
    // A depleted Guard cannot block the open palm indefinitely.
    breakGuard(victim,.4,now);
    room.events.push({type:'guardBreak',attackerId:b.operatorId,defenderId:victim.id,hellping:true,at:now});
   }
   emit(room,b,'guarded',now,{targetId:victim.id});return null;
  }
  b.hellping={phase:'grasp',targetId:victim.id,at:now,lastAt:now};
  victim.hellpingCapturedBy=b.id;
  interruptHitActions(room,victim,b.operatorId,now,'hellping-capture');
  // Clear held input at the actual grasp. The wire gate prevents subsequent
  // input packets from restoring movement/attacks until the hand releases.
  victim.input={...victim.input,forward:0,right:0,jump:false,sprint:false,
    crouch:false,attack:false,guard:false};
  victim.attackHeld=false;victim.guardHeld=false;victim.guarding=false;
  emit(room,b,'captured',now,{targetId:victim.id});return null;
 }
 const direction=(p.input?.forward??0)>.45?1:(p.input?.forward??0)<-.45?-1:0;
 if(direction&&vault(room,b,now,direction))return null;
 return releaseHellpingHand(room,b,now)?null:'HELLping Hand cannot release yet.';
}
export function stepHellpingHand(room,b,dt,now){
 const h=b?.hellping;if(!h)return;
 if(h.phase==='release'){if(now>=h.until)b.hellping=null;return;}
 if(b.retired||b.health<=0||b.fistMounted===false||
  (b.components?.Fist?.health??0)<=0||(b.components?.Drive?.health??0)<=0||
  !b.operatorId||!room.players.get(b.operatorId)?.alive){
  releaseHellpingHand(room,b,now,{force:true});return;
 }
 const p=room.players.get(h.targetId);
 if(h.phase==='grasp'){
  if(!p?.alive||p.hellpingCapturedBy!==b.id){
   releaseHellpingHand(room,b,now,{force:true});return;
  }
  const crushAt=h.at+1;
  const interval=clamp(now-Math.max(crushAt,h.lastAt??crushAt),0,dt);
  const q=palm(b),height=postureOf(p).height;
  p.position={x:q[0],y:Math.max(b.y,q[1]-height*.5),z:q[2]};
  p.velocity={x:0,y:0,z:0};p.staggerUntil=Math.max(p.staggerUntil??0,now+.16);
  if(interval>0)applyDamage(room,b.operatorId,p.id,(p.maxHealth??100)*.25*interval,
    'hellping-crush',now,null,{ongoing:true});
  h.lastAt=now;
  if(now-h.at>=1+HELLPING.crushSeconds){
   if(p.alive)applyDamage(room,b.operatorId,p.id,p.health+1,
     'hellping-crush',now,null,{ongoing:true});
   releaseHellpingHand(room,b,now,{force:true});
  }
 }else if(h.phase==='transport'){
  if(!p?.alive||p.hellpingCarriedBy!==b.id){
   releaseHellpingHand(room,b,now,{force:true});return;
  }
  const q=seat(b),height=postureOf(p).height;
  p.position={x:q[0],y:q[1]-height*.5,z:q[2]};
  p.velocity={x:0,y:0,z:0};p.grounded=false;
  // No stagger or attack cancellation: passengers can still fight.
 }else if(h.phase==='vault'){
  const t=clamp((now-h.at)/HELLPING.vaultSeconds,0,1),from=h.start,to=h.landing;
  const next={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t+
    HELLPING.vaultHeight*4*t*(1-t),z:from.z+(to.z-from.z)*t};
  const obstacles=[...(room.world?.solids??[]),...getBiByeSolids(room.biByeLlista)];
  if(soFistSolids({...b,...next}).some(box=>obstacles.some(s=>machineryOverlap(box,s)))){
   releaseHellpingHand(room,b,now,{force:true});return;
  }
  Object.assign(b,next);b.speed=0;b.charging=false;
  if(t>=1-1e-8){emit(room,b,'vaultLanded',now);releaseHellpingHand(room,b,now,{force:true});}
 }
}
