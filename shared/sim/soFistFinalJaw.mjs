// One final, server-selected Long Arm to the Jaw discharge after hull failure.
// Does not invent ammunition: the attached fist must physically exist at death.
// Already detached/destroyed fist -> ordinary absent-fist collapse, never a clone.
import {postureOf} from '../src/body.mjs';
import {areAllies} from '../src/teams.mjs';
import {SO_FIST_SCALE,soFistFrame} from './soFistGeometry.mjs';
import {soFistUpperPoint} from './soFistElevation.mjs';
import {RAM_FIST} from './soFistDetachedFist.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const FINAL_JAW=Object.freeze({
  releaseSec:.36, spawnSec:.44, hideSec:.52,
  yawLimit:15*Math.PI/180,pitchDown:-22*Math.PI/180,pitchUp:21*Math.PI/180,
  fragmentCloseDamage:85,
});
const dot=(a,b)=>a.reduce((v,n,i)=>v+n*b[i],0);
const normalized=a=>{const m=Math.hypot(...a)||1;return a.map(v=>v/m);};
function initialMuzzle(b){
  return soFistUpperPoint(soFistFrame(b),b,[0,.365*SO_FIST_SCALE,.965*SO_FIST_SCALE]);
}
// Return a physically possible low-arc elevation angle for a gravitational shot.
// Null means this target cannot be reached at the existing projectile velocity.
function arcPitch(horizontal,vertical){
  if(horizontal<=.2)return null;
  const speed2=RAM_FIST.speed**2,g=RAM_FIST.gravity;
  const d=speed2**2-g*(g*horizontal*horizontal+2*vertical*speed2);
  if(d<0)return null;
  return Math.atan2(speed2-Math.sqrt(d),g*horizontal);
}
function aimAt(b,target){
  const muzzle=initialMuzzle(b),root=soFistFrame(b);
  const v=[target.x-muzzle[0],target.y-muzzle[1],target.z-muzzle[2]];
  const horizontal=Math.hypot(v[0],v[2]);
  const towards=normalized([v[0],0,v[2]]);
  const right=root.axes[0],flatForward=normalized([root.axes[2][0],0,root.axes[2][2]]);
  const yaw=Math.atan2(dot(towards,right),dot(towards,flatForward));
  if(Math.abs(yaw)>FINAL_JAW.yawLimit)return null;
  const elevation=arcPitch(horizontal,v[1]);
  if(elevation==null)return null;
  const relativePitch=elevation-(b.ramElevPitch??0);
  if(relativePitch<FINAL_JAW.pitchDown||relativePitch>FINAL_JAW.pitchUp)return null;
  return {yaw,relativePitch,range:horizontal};
}
function chooseAim(room,b,attackerId){
  const list=[];
  for(const p of room.players.values()){
    if(!p.alive||p.id===b.operatorId||areAllies(room,b.operatorId,p.id))continue;
    const h=postureOf(p).height,aim=aimAt(b,{x:p.position.x,y:p.position.y+h*.48,z:p.position.z});
    if(aim)list.push({...aim,id:p.id,priority:p.id===attackerId?0:1});
  }
  list.sort((a,b)=>a.priority-b.priority||a.range-b.range||String(a.id).localeCompare(String(b.id)));
  const v=list[0];
  return v?{yaw:v.yaw,pitch:v.relativePitch,targetId:v.id}:{
    yaw:0,pitch:0,targetId:null,
  };
}
export function queueFinalJaw(room,b,now,{attackerId=null}={}){
  if(!b||b.finalJaw||b.skill?.id!=='longArmToTheJaw')return false;
  if(b.detachedFist||b.fistMounted===false)return false;
  const hp=b.components?.Fist?.health??0;
  // A component that hit 0 on this very same fatal server timestamp still
  // leaves a ruined assembly to eject. A previously absent fist does not.
  const justBroken=hp<=0&&Math.abs((b.fistBrokenAt??-Infinity)-now)<1e-6;
  if(hp<=0&&!justBroken)return false;
  const variant=hp>0?'intact':'damaged';
  const aim=chooseAim(room,b,attackerId);
  b.finalJaw={phase:'aiming',at:now,spawnAt:now+FINAL_JAW.spawnSec,
    variant,aimYaw:aim.yaw,aimPitch:aim.pitch,targetId:aim.targetId,
    ownerId:b.operatorId,spent:false};
  room.events.push({type:'soFistFinalJawQueued',machineId:b.id,at:now,
    variant,targetId:aim.targetId,yaw:aim.yaw,pitch:aim.pitch});
  return true;
}
export function stepFinalJaw(room,b,now){
  const s=b?.finalJaw;
  if(!s||s.spent||now+1e-8<s.spawnAt)return false;
  // This state lives on the machine, not the deceased operator. Do not run
  // requestLongArmToJaw(), whose usual alive/cooldown requirements must remain.
  s.spent=true;s.phase='released';
  if(b.detachedFist||b.fistMounted===false)return false;
  const root=soFistFrame(b),angle=(b.ramElevPitch??0)+s.aimPitch;
  const yaw=s.aimYaw;
  const horizontal=[
    root.axes[2][0]*Math.cos(yaw)+root.axes[0][0]*Math.sin(yaw),
    root.axes[2][2]*Math.cos(yaw)+root.axes[0][2]*Math.sin(yaw),
  ];
  const direction=normalized([horizontal[0]*Math.cos(angle),Math.sin(angle),horizontal[1]*Math.cos(angle)]);
  const pos=initialMuzzle(b);
  const origin={x:pos[0],y:pos[1],z:pos[2]};
  const home=b.fistHome??{x:b.x,y:b.y,z:b.z};
  b.detachedFist={state:'flying',position:origin,
    velocity:{x:direction[0]*RAM_FIST.speed,y:direction[1]*RAM_FIST.speed,z:direction[2]*RAM_FIST.speed},
    launchedAt:now,launchHeading:b.heading??0,launchPitch:angle,
    traveled:0,ownerId:s.ownerId,home:{...home},impactCount:0,
    spin:{x:0,y:0,z:0},angularVelocity:{x:6.8,y:1.1,z:.7},
    healthAtLaunch:Math.max(0,b.components?.Fist?.health??0),
    isFinal:true,fragment:s.variant==='damaged'};
  b.fistMounted=false;
  room.events.push({type:'soFistDetachedFist',machineId:b.id,action:'finalLaunched',
    at:now,variant:s.variant,position:origin,
    velocity:b.detachedFist.velocity,targetId:s.targetId});
  return true;
}
