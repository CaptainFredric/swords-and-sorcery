// Bi-Bye-llista physical sweep. Authored Argon v26 clip clocks and pivot geometry
// are authoritative gameplay timing; visual channels never grant damage.
import {biByeCondition,biByeHitVolumes} from './biByeComponents.mjs';
import {skillOperator,endSiegeSkill,skillEvent,SIEGE_SKILLS} from './siegeSkills.mjs';
import {orientedBoxHit} from '../src/orientedBox.mjs';
import {surfaceHeightAt} from '../src/collision.mjs';
import {postureOf} from '../src/body.mjs';
import {applyDamage,staggerBy,interruptHitActions,isInGuardCone} from './combat.mjs';
import {launchBody} from '../src/movement.mjs';
import {armWorldImpact} from './worldImpact.mjs';
import {areAllies} from '../src/teams.mjs';
import {soFistVolumes} from './soFistGeometry.mjs';
import {damageSoFistication} from './soFistication.mjs';
import {fightFlightHitVolumes,damageFightFlight} from './fightFlightComponents.mjs';

export const BI_BYE_SWEEP=Object.freeze({
  single:1.65,opening:1.04,loop:1.20,settleClip:2.20,
  damage:45,guardScale:.55,shove:13,stagger:62,
  settleRate:Math.PI*2/3,maxArcStep:Math.PI/32,
  // Clip 22: time, unwrapped Traverse_Mount yaw, cradle lowering.
  // Keyframes sourced from Bi_Bye_llista_GameReady_PBR.glb, NOT invented contact markers.
  keys:[[0,0,0],[.26,-Math.PI/6,1],[.45,Math.PI/3,1],
        [.68,Math.PI,1],[.86,4.45,1],[1.04,6.14,.72],
        [1.32,6.21,.23],[1.65,2*Math.PI,0]],
  contactStart:.45,contactEnd:1.04
});
const TAU=2*Math.PI;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const delta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const inside=s=>s&&['opening','loop','single','settle'].includes(s.phase);
const impeded=b=>!b||b.retired||!['MOBILE','DEPLOYED'].includes(b.mode)||
  !biByeCondition(b).canSiege||(b.health??0)<=0;
const phaseAt=t=>{
 const keys=BI_BYE_SWEEP.keys;
 for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
  const [at,a,l]=keys[i-1],[bt,c,m]=keys[i],f=clamp((t-at)/(bt-at),0,1);
  return {angle:a+(c-a)*f,lower:l+(m-l)*f};
 }
 return {angle:TAU,lower:0};
};
export function biByeSweepActive(b){return Boolean(inside(b?.sweep));}
export function biByeSweepFireLocked(b){return Boolean(b?.sweep?.phase==='opening'||b?.sweep?.phase==='loop'||b?.sweep?.phase==='single'||b?.sweep?.phase==='settle');}
const blades=b=>biByeHitVolumes(b).filter(v=>v.assembly==='main'&&v.size[0]>1.8&&v.size[1]<.6);
function expand(target,attacker,extra=0){
 return {...target,size:target.size.map((width,i)=>width+
   attacker.axes.reduce((sum,axis,j)=>sum+Math.abs(axis.reduce((v,c,k)=>v+c*target.axes[i][k],0))*attacker.size[j],0)+extra*2)};
}
const aabb=s=>({...s,axes:s.axes??[[1,0,0],[0,1,0],[0,0,1]]});
function contact(a,b,targets,extra=0){
 let best=null;
 for(let i=0;i<a.length;i++)for(const target of targets){
  const hit=orientedBoxHit(a[i].center,b[i].center,expand(aabb(target),b[i],extra));
  if(hit&&(!best||hit.t<best.t))best={...hit,target,blade:b[i],from:a[i]};
 }
 return best;
}
function terrainBlocked(b,volumes,world){
 if(!world||(!world.floors&&!world.ramps))return false;
 for(const box of volumes){
  const bottom=box.center[1]-.5*box.axes.reduce((sum,axis,i)=>sum+Math.abs(axis[1])*box.size[i],0);
  // Sample the contact limbs, not the ground-touching wheels / outrigger feet.
  const ground=surfaceHeightAt(box.center[0],box.center[2],b.y+3,world);
  if(ground!=null&&bottom<ground-.04)return true;
 }
 return false;
}
function bladesAt(b,angle,lower){
 return blades({...b,mainYaw:b.heading+angle,sweep:{phase:'opening',lower}});
}
function worldBlocked(b,oldBlades,nextBlades,world){
 const solids=(world?.solids??[]).filter(s=>!String(s.id??'').startsWith('bibye-'));
 return Boolean(contact(oldBlades,nextBlades,solids,.015)||terrainBlocked(b,nextBlades,world));
}
// Conservative complete clearance before either action. Dynamic enemies and
// machines are legitimate impact targets, not imaginary walls.
export function biByeSweepClearance(b,world){
 const original=bladesAt(b,0,1);
 let last=original;
 for(let a=BI_BYE_SWEEP.maxArcStep;a<TAU+.001;a+=BI_BYE_SWEEP.maxArcStep){
  const next=bladesAt(b,Math.min(TAU,a),1);
  if(worldBlocked(b,last,next,world))return false;
  last=next;
 }
 return !worldBlocked(b,last,original,world);
}
function readyToStart(b){
 return !impeded(b)&&!b.sweep&&(!b.sweepRecovery||b.poseTime>=b.sweepRecovery.until)&&!b.heavySkill&&
  b.mobileShotPendingAt==null&&b.combinedUpperPendingAt==null&&
  !b.pendingIndependent&&!b.pendingCoupledFromUpper&&!b.pendingVolley&&
  !['FIRING','ALIGNING','ENGAGING','COUPLED'].includes(b.coupling)&&
  !(b.skill?.phase==='primed'||b.skill?.phase==='releasing');
}
function start(room,b,p,now,kind){
 if(!skillOperator(room,b,p,now))return 'Operate the ballista to use its bow sweep.';
 if(!readyToStart(b))return 'Finish the current weapon mechanism or repair the supports.';
 if(kind==='skill'&&(b.skill?.id!=='lookAroundAndFindOut'||b.skill.phase!=='idle'||now+1e-8<b.skill.readyAt))
  return 'Look Around and Find Out is not ready.';
 if(!biByeSweepClearance(b,room.world))return 'The bow does not have physical clearance for a full turn.';
 b.trackingSince=null;b.pendingVolley=null;b.coupling='INDEPENDENT';b.couplingProgress=0;
 b.speed=0;b.steer=0;
 b.sweep={kind,phase:kind==='skill'?'opening':'single',startedAt:now,
   angle:0,lower:0,revolution:0,victims:{},machines:{},ownerId:p.id};
 if(kind==='skill'){
  b.skill.phase='active';b.skill.ownerId=p.id;b.skill.primedAt=now;
  skillEvent(room,b,now,'activated');
 }
 room.events?.push({type:'bibyeSweep',ballistaId:b.id,action:'started',kind,at:now});
 return null;
}
export function requestBiByeSharpTurn(room,b,p,now){return start(room,b,p,now,'single');}
export function requestLookAroundAndFindOut(room,b,p,now){
 if(b?.sweep?.kind==='skill'&&b.operatorId===p?.id){
  requestBiByeSweepStop(b,now,false);return null;
 }
 return start(room,b,p,now,'skill');
}
export function requestBiByeSweepStop(b,now,fire=true){
 if(!b?.sweep||b.sweep.phase==='settle')return false;
 if(b.sweep.kind!=='skill'||!['opening','loop'].includes(b.sweep.phase))return false;
 b.sweep.phase='settle';b.sweep.stopAt=now;b.sweep.fireOnStop=Boolean(fire);
 b.sweep.settleAngle=b.sweep.angle;
 return true;
}
export function finishBiByeSweep(room,b,now,reason='finished'){
 const s=b?.sweep;if(!s)return;
 if(s.kind==='skill'&&b.skill?.id==='lookAroundAndFindOut'){
  b.skill.readyAt=Math.max(b.skill.readyAt??0,now+SIEGE_SKILLS.lookAroundAndFindOut.cooldown);
  endSiegeSkill(b,now);
  if(room)skillEvent(room,b,now,'ended',{reason});
 }
 b.sweep=null;
 if(room)room.events?.push({type:'bibyeSweep',ballistaId:b.id,action:'ended',reason,at:now});
}
const owner=(room,b)=>room.players?.get(b.sweep?.ownerId);
function hitPlayer(room,b,s,player,point,normal,now){
 if(player.id===s.ownerId||!player.alive||areAllies(room,s.ownerId,player.id))return;
 if(s.victims[player.id]===s.revolution)return;
 s.victims[player.id]=s.revolution;
 const guarded=Boolean(player.guarding&&player.guardStamina>0&&
  isInGuardCone(player,{position:point},now));
 const damage=guarded?Math.round(BI_BYE_SWEEP.damage*BI_BYE_SWEEP.guardScale):BI_BYE_SWEEP.damage;
 if(guarded){
  player.guardStamina=Math.max(0,player.guardStamina-40);
  player.lastGuardDrainAt=now;
  if(player.guardStamina===0){player.guarding=false;room.events?.push({type:'guardBreak',attackerId:s.ownerId,defenderId:player.id,at:now});}
 }
 if(!applyDamage(room,s.ownerId,player.id,damage,'bibye-sweep',now,null))return;
 const outward=Math.hypot(player.position.x-b.x,player.position.z-b.z)||1;
 const dx=(player.position.x-b.x)/outward,dz=(player.position.z-b.z)/outward;
 const shove=BI_BYE_SWEEP.shove*(guarded?.4:1);
 staggerBy(room,player,BI_BYE_SWEEP.stagger*(guarded?.35:1),now,s.ownerId);
 launchBody(player,{x:dx*shove,y:guarded?1.2:3,z:dz*shove},6);
 if(player.alive){armWorldImpact(player,s.ownerId,'bibye-sweep',now);interruptHitActions(room,player,s.ownerId,now,'bibye-sweep');}
 room.events?.push({type:'bibyeSweepImpact',ballistaId:b.id,victimId:player.id,guarded,point,at:now});
}
function hitMachines(room,b,s,oldBlades,newBlades,now){
 for(const machine of [room.soFistication,room.fightFlight]){
  if(!machine||machine.retired||machine.mode==='DESTROYED'||machine.health<=0||
      machine.operatorId===s.ownerId||s.machines[machine.id]===s.revolution)continue;
  if(machine.team&&owner(room,b)?.team===machine.team&&room.mode!=='PRACTICE')continue;
  const volumes=machine===room.soFistication?soFistVolumes(machine,now):fightFlightHitVolumes(machine);
  const hit=contact(oldBlades,newBlades,volumes,.015);
  if(!hit)continue;
  s.machines[machine.id]=s.revolution;
  const point={x:hit.point[0],y:hit.point[1],z:hit.point[2]};
  const caused=machine===room.soFistication?
   damageSoFistication(room,machine,BI_BYE_SWEEP.damage,s.ownerId,'bibye-sweep',now,{componentId:hit.target.componentId??'hull',point}):
   damageFightFlight(room,machine,BI_BYE_SWEEP.damage,s.ownerId,'bibye-sweep',now,{componentId:hit.target.componentId??'main',point});
  if(caused){
   const dx=machine.x-b.x,dz=machine.z-b.z,length=Math.hypot(dx,dz)||1;
   if(machine===room.soFistication){
    // Existing longitudinal recoil drive; no changes to the ram implementation.
    const projected=dx/length*(-Math.sin(machine.heading))+dz/length*(-Math.cos(machine.heading));
    machine.recoilVelocity=(machine.recoilVelocity??0)+projected*4;
   }else if(machine.velocity){
    machine.velocity.x+=dx/length*4;machine.velocity.z+=dz/length*4;
   }
   room.events?.push({type:'bibyeSweepMachineImpact',ballistaId:b.id,machineId:machine.id,componentId:hit.target.componentId,point,at:now});
  }
 }
}
function contacts(room,b,s,prevAngle,angle,previousLower,lower,now){
 const count=Math.max(1,Math.ceil(Math.abs(angle-prevAngle)/BI_BYE_SWEEP.maxArcStep));
 let last=bladesAt(b,prevAngle,previousLower);
 for(let i=1;i<=count;i++){
  const frac=i/count,a=prevAngle+(angle-prevAngle)*frac,l=previousLower+(lower-previousLower)*frac;
  const next=bladesAt(b,a,l);
  if(worldBlocked(b,last,next,room.world))return false;
  // The seam at exactly 360 degrees belongs to the previous revolution.
  const revolution=s.kind==='single'?0:Math.max(0,Math.floor((a-1e-6)/TAU));
  s.revolution=revolution;
  for(const player of room.players?.values()??[]){
   if(!player.alive||player.id===s.ownerId||areAllies(room,s.ownerId,player.id))continue;
   const height=postureOf(player).height,point=player.position;
   const target={center:[point.x,point.y+height/2,point.z],size:[.9,height,.9]};
   const h=contact(last,next,[target],.02);
   if(h)hitPlayer(room,b,s,player,{x:h.point[0],y:h.point[1],z:h.point[2]},h.normal,now);
  }
  hitMachines(room,b,s,last,next,now);
  last=next;
 }
 return true;
}
export function stepBiByeSweep(room,b,dt,now,fireOrdinary){
 const s=b?.sweep;if(!s)return;
 if(impeded(b)||s.kind==='skill'&&!skillOperator(room,b,owner(room,b),now)){
  finishBiByeSweep(room,b,now,'interrupted');return;
 }
 const age=Math.max(0,now-s.startedAt),prior=s.angle,priorLower=s.lower;
 let next=prior,lower=priorLower,canHit=false;
 if(s.phase==='single'){
  const p=phaseAt(Math.min(age,BI_BYE_SWEEP.single));
  next=p.angle;lower=p.lower;
  canHit=age>=BI_BYE_SWEEP.contactStart&&age<=BI_BYE_SWEEP.contactEnd+dt;
 }else if(s.phase==='opening'){
  const p=phaseAt(Math.min(age,BI_BYE_SWEEP.opening));
  next=p.angle;lower=p.lower;
  canHit=age>=BI_BYE_SWEEP.contactStart;
  if(age>=BI_BYE_SWEEP.opening){
   s.phase='loop';s.loopAt=s.startedAt+BI_BYE_SWEEP.opening;
   lower=1;
  }
 }else if(s.phase==='loop'){
  next=TAU+(now-s.loopAt)*TAU/BI_BYE_SWEEP.loop;lower=1;canHit=true;
 }else if(s.phase==='settle'){
  const target=Math.round(prior/TAU)*TAU;
  next=prior+clamp(target-prior,-BI_BYE_SWEEP.settleRate*dt,BI_BYE_SWEEP.settleRate*dt);
  lower=Math.max(0,priorLower-dt/Math.max(.24,BI_BYE_SWEEP.settleClip*.20));
 }
 if(canHit){
  if(!contacts(room,b,s,prior,next,priorLower,lower,now)){
   if(s.kind==='skill')requestBiByeSweepStop(b,now,false);
   else finishBiByeSweep(room,b,now,'obstructed');
   return;
  }
 }else if(s.phase==='settle'&&worldBlocked(b,bladesAt(b,prior,priorLower),bladesAt(b,next,lower),room.world)){
  finishBiByeSweep(room,b,now,'obstructed');return;
 }
 s.angle=next;s.lower=lower;
 b.mainYaw=b.heading+next;b.mainPitch=-.435*lower;b.yaw=b.mainYaw;b.pitch=b.mainPitch;
 b.speed=0;b.steer=0;
 if(s.phase==='single'&&age>=BI_BYE_SWEEP.single){
  b.mainYaw=b.heading;b.mainPitch=0;finishBiByeSweep(room,b,now);
 }else if(s.phase==='settle'&&Math.abs(delta(next,0))<.015&&
          now-s.stopAt>=.24){
  const shouldFire=s.fireOnStop;
  b.mainYaw=b.heading;b.mainPitch=0;
  // Resolution starts the full Skill cooldown. The ordinary loader, physical
  // clutch and projectile pipeline still decide whether anything can fire.
  const transitionStart=s.stopAt;
  finishBiByeSweep(room,b,now,shouldFire?'firing':'cancelled');
  if(shouldFire){
   fireOrdinary?.(room,b,now);
   // Preserve the rest of original clip 24's 2.2-second recoil/recovery
   // without retaining a second active sweep or delaying the actual loader.
   b.sweepRecovery={from:transitionStart,until:transitionStart+BI_BYE_SWEEP.settleClip};
  }
 }
}
