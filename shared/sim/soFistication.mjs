import { structureForSolid, damageStructure, STRUCTURE_PROFILES } from './structures.mjs';
import {surfaceHeightAt,resolvePlayerWorld} from '../src/collision.mjs';
import {boxWorld,orientedBoxHit,boxLocal} from '../src/orientedBox.mjs';
import {applyDamage,staggerBy,interruptHitActions,isInGuardCone} from './combat.mjs';
import {launchBody} from '../src/movement.mjs';
import {GAME} from '../src/combat.mjs';
import {STEEL_DAMAGE_RANGES} from '../src/steel.mjs';
import {areAllies} from '../src/teams.mjs';
import {sampleTransform} from './history.mjs';
import {armWorldImpact} from './worldImpact.mjs';
import {getBiByeSolids,damageBiByeLlista} from './biByeLlista.mjs';
import {biByeHitVolumes} from './biByeComponents.mjs';
import {SO_FIST_SCALE,SO_FIST_FIT,SO_FIST_WHEELS,soFistTurnRate,soFistFrame,soFistPose,soFistVolumes,soFistStriker,soFistSolids,machineryOverlap} from './soFistGeometry.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const SO_FIST=Object.freeze({speed:4.8,reverse:2.5,peak:12,pressure:100,hull:1400,fist:500,cycle:4});
export function createSoFistication(overrides={}){return{id:'sofist-practice',type:'so-fist-ication',x:0,y:0,z:0,heading:0,chassisPitch:0,chassisRoll:0,speed:0,steer:0,pressure:100,charging:false,chargeSpent:false,operatorId:null,health:1400,maxHealth:1400,mode:'MOBILE',strikeAt:null,strokeVictims:[],contacts:[],recentVictims:{},wheelRolls:[0,0,0,0],wheelOffsets:[0,0,0,0],components:Object.fromEntries([...SO_FIST_WHEELS.map(w=>[w.id,{health:180,maxHealth:180}]),['Fist',{health:500,maxHealth:500}],['Drive',{health:250,maxHealth:250}]]),...overrides};}
export function soFistOperator(b,world=null){const p=boxWorld(soFistFrame(b),SO_FIST_FIT.operator);return{x:p[0],y:world?surfaceHeightAt(p[0],p[2],p[1]+.5,world):b.operatorY??p[1],z:p[2]};}
function stationClear(b,world,extra=[]){const at=soFistOperator(b,world);if(at.y==null||Math.abs(at.y-soFistOperator({...b,operatorY:undefined}).y)>.4)return false;const hit=resolvePlayerWorld(at,.45,[...(world.solids??[]),...extra],1.8);return Math.hypot(hit.x-at.x,hit.z-at.z)<.015;}
export function soFistExit(room,b,p,extras=[]){
 const frame=soFistFrame(b),solids=[...(room.world.solids??[]),...soFistSolids(b),...getBiByeSolids(room.biByeLlista),...extras,...[...room.players.values()].filter(v=>v.alive&&v.id!==p.id).map(v=>({center:[v.position.x,v.position.y+.9,v.position.z],size:[.9,1.8,.9]}))];
 for(const [x,z]of [[0,-3.3],[-1.8,-3.1],[1.8,-3.1],[-2,0],[2,0]]){const at=boxWorld(frame,[x,0,z].map(v=>v*SO_FIST_SCALE/2.65)),y=surfaceHeightAt(at[0],at[2],b.y+.6,room.world);if(y==null||Math.abs(y-b.y)>.75)continue;const candidate={x:at[0],y,z:at[2]},resolved=resolvePlayerWorld(candidate,.45,solids,1.8);if(Math.hypot(resolved.x-candidate.x,resolved.z-candidate.z)<.015)return candidate;}return null;
}
export function mountSoFistication(room,b,p,now=0){
 if(!b||b.retired||b.health<=0||!p?.alive||p.operatingBallistaId||p.operatingRamId||(p.staggerUntil??0)>now||p.pendingSpell||p.gauntlet||p.ultimateState||p.attackActive||b.operatorId)return false;
 if(b.emplacementId&&(room.state!=='PLAYING'||p.team!==b.team||!b.phases.includes(room.objectiveState?.phase)))return false;
 const seat=soFistOperator(b,room.world);if(!stationClear(b,room.world,getBiByeSolids(room.biByeLlista))||Math.hypot(p.position.x-seat.x,p.position.z-seat.z)>2.2||!soFistExit(room,b,p))return false;
 b.operatorId=p.id;p.operatingRamId=b.id;p.position=seat;p.velocity={x:0,y:0,z:0};p.impulse={x:0,z:0};p.guarding=false;p.guardHeld=false;p.attackHeld=false;p.input={forward:0,right:0,yaw:b.heading,pitch:0,jump:false,sprint:false};return true;
}
export function dismountSoFistication(room,b,p,{administrative=false,exit=null,force=false}={}){
 if(!b)return false;if(p?.alive&&!exit){exit=soFistExit(room,b,p);if(!exit&&!administrative&&!force)return false;}
 b.operatorId=null;b.charging=false;b.chargeSpent=false;b.speed=0;if(administrative){b.retired=true;b.strikeAt=null;}
 if(p){p.operatingRamId=null;p.input={forward:0,right:0,yaw:p.yaw,pitch:p.pitch,jump:false,sprint:false};p.attackHeld=false;p.guarding=false;p.velocity={x:0,y:0,z:0};p.impulse={x:0,z:0};if(exit)p.position={...exit};}return true;
}
export function fireSoFistication(room,b,now){if(b?.emplacementId&&room.state!=='PLAYING')return false;if(!b||b.retired||b.health<=0||!room.players.get(b.operatorId)?.alive||(room.players.get(b.operatorId)?.staggerUntil??0)>now||b.strikeAt!=null&&now-b.strikeAt<4)return false;b.strikeAt=now;b.strokeLimit=null;b.strokeBlockedAt=null;b.strikeOperatorId=b.operatorId;b.strokeVictims=[];b.strokeMachines=[];b.strokeStructures=[];room.events.push({type:'soFistStrike',machineId:b.id,at:now});return true;}
export function soFistTerrainPose(b,world){
 const flat=soFistFrame({...b,chassisPitch:0,chassisRoll:0}),samples=[];
 for(const w of SO_FIST_WHEELS){const point=boxWorld(flat,[w.pivot[0],0,w.pivot[2]]),h=surfaceHeightAt(point[0],point[2],b.y+.3,world);if(h==null||Math.abs(h-b.y)>.65)return null;samples.push(h);}
 const front=(samples[0]+samples[1])/2,rear=(samples[2]+samples[3])/2,left=(samples[0]+samples[2])/2,right=(samples[1]+samples[3])/2;
 const pitch=Math.atan2(front-rear,SO_FIST_FIT.wheelbase),roll=Math.atan2(right-left,(SO_FIST_FIT.frontTrack+SO_FIST_FIT.rearTrack)/2);if(Math.hypot(pitch,roll)>.384)return null;
 const y=(front+rear)/2,root=soFistFrame({...b,y,chassisPitch:pitch,chassisRoll:roll}),offsets=SO_FIST_WHEELS.map((w,i)=>(samples[i]+w.pivot[1]-boxWorld(root,w.pivot)[1])/root.axes[1][1]);if(offsets.some(v=>Math.abs(v)>.18))return null;
 return{y,chassisPitch:pitch,chassisRoll:roll,wheelOffsets:offsets};
}
export function soFistClear(b,world,extra=[],{operatorStation=false}={}){if((b.operatorId||operatorStation)&&!stationClear(b,world,extra))return false;const boxes=soFistVolumes(b);return !boxes.some(v=>[...(world.solids??[]),...extra].some(s=>machineryOverlap(v,s)));}
export function stepSoFistication(room,b,dt,now,world=room.world){
 if(!b||b.retired||b.health<=0)return;b.poseTime=now;
 // Sweep the real striking surface against architecture before sampling contacts.
 const prior=soFistPose(b,now-dt),raw=soFistPose({...b,strokeLimit:null},now);
 b.strokePreviousOffset=prior.offset;b.strokeStepDt=dt;
 if(raw.active&&raw.offset>prior.offset){
  const start=soFistStriker(b,now-dt),end=soFistStriker({...b,strokeLimit:null},now);
  const extent=[0,1,2].map(i=>start.axes.reduce((n,axis,j)=>n+Math.abs(axis[i])*start.size[j],0));
  let first = null;
  for(const solid of [...(world.solids??[]),...getBiByeSolids(room.biByeLlista)]){
   const box={...solid,axes:[[1,0,0],[0,1,0],[0,0,1]],size:solid.size.map((v,i)=>v+extent[i])};
   const hit=orientedBoxHit(start.center,end.center,box);
   if(hit&&(!first||hit.t<first.hit.t))first={solid,hit};
  }
  if(first){
   const {solid,hit}=first,limit=prior.offset+(raw.offset-prior.offset)*hit.t-.002;
   if(b.strokeLimit==null||limit<b.strokeLimit){b.strokeLimit=limit;if(b.strokeBlockedAt==null){b.strokeBlockedAt=now;room.events.push({type:'soFistBlocked',machineId:b.id,point:{x:hit.point[0],y:hit.point[1],z:hit.point[2]},at:now});}}
   const def=structureForSolid(world,solid);
   if(def&&!(b.strokeStructures??[]).includes(def.id)){
    const profile=STRUCTURE_PROFILES[def.profile],budget=b.structureChargeBudget;
    const maximum=b.components.Fist.health>0?profile.piston:profile.exposed;
    const already=budget?.id===def.id&&budget.strokeAt==null?budget.damage:0;
    if(damageStructure(room,def.id,Math.max(0,maximum-already),b.strikeOperatorId,'so-fist',now,{raw:true,point:{x:hit.point[0],y:hit.point[1],z:hit.point[2]}})){
     b.strokeStructures??=[];b.strokeStructures.push(def.id);
    }
    if(budget?.id===def.id)budget.strokeAt=b.strikeAt;
    world=room.world;
   }
  }
 }
const p=room.players.get(b.operatorId);
 if(b.operatorId&&(!p?.alive||p.operatingRamId!==b.id||p.connected===false&&p.actorKind==='human'))dismountSoFistication(room,b,p);
 const driver=room.players.get(b.operatorId),input=driver&&(driver.staggerUntil??0)<=now?driver.input??{}:{};
 const failed=SO_FIST_WHEELS.filter(w=>b.components[w.id].health<=0),canDrive=failed.length<3&&!['L','R'].some(s=>failed.filter(w=>w.id.endsWith(s)).length>=2),driveScale=canDrive?(1-failed.length*.22)*(b.components.Drive.health<=0?.45:1):0;
 const chargeHeld=Boolean(driver&&input.sprint&&input.forward>=0&&driveScale>0);
 if(!chargeHeld)b.chargeSpent=false;
 if(chargeHeld&&!b.chargeSpent&&b.pressure>=25)b.charging=true;
 if(!chargeHeld)b.charging=false;
 if(b.charging){b.pressure=Math.max(0,b.pressure-(4+.07*b.speed*b.speed)*(1+failed.length*.18+(b.components.Drive.health<=0?.5:0))*dt);if(b.pressure<=0){b.charging=false;b.chargeSpent=true;}}
 else b.pressure=Math.min(100,b.pressure+(Math.abs(b.speed)>6?5:13)*(b.components.Drive.health<=0?.5:1)*dt);
 const target=(b.charging?12:input.forward>0?SO_FIST.speed:input.forward<0?-SO_FIST.reverse:0)*driveScale*(1-.45*clamp(Math.max(0,b.chassisPitch*Math.sign(b.charging?1:input.forward??0))/.384,0,1));
 const reversing=target*b.speed<0;
 const accel=b.charging?4:reversing||Math.abs(target)<Math.abs(b.speed)?5.8:3.8;
 b.speed+=clamp(target-b.speed,-accel*dt,accel*dt);if(Math.abs(b.speed)<.001)b.speed=0;
 b.steer=clamp(input.right??0,-1,1)*(1-.86*clamp((Math.abs(b.speed)-SO_FIST.speed)/(SO_FIST.peak-SO_FIST.speed),0,1));
 const steps=Math.max(1,Math.ceil(Math.abs(b.speed)*dt/.12)),sub=dt/steps;const wheelTravel=b.wheelRolls.slice();
 for(let i=0;i<steps;i++){
  if(Math.abs(b.speed)<1e-5)break;
  const from={...b},heading=b.heading+soFistTurnRate(b)*sub;
  const next={...b,x:b.x-Math.sin(heading)*b.speed*sub,z:b.z-Math.cos(heading)*b.speed*sub,heading};const pose=soFistTerrainPose(next,world);
  const obstacles=getBiByeSolids(room.biByeLlista);
  if(!pose||Math.abs(pose.y-b.y)>.12||!soFistClear({...next,...pose},world,obstacles)){
   if(pose&&b.speed>4.2){
    const head=soFistStriker(b,now),end=soFistStriker({...next,...pose},now);
    const extent=[0,1,2].map(i=>head.axes.reduce((sum,axis,j)=>sum+Math.abs(axis[i])*head.size[j],0));
    let first=null;
    for(const solid of world.solids??[]){const hit=orientedBoxHit(head.center,end.center,{...solid,axes:[[1,0,0],[0,1,0],[0,0,1]],size:solid.size.map((v,i)=>v+extent[i])});if(hit&&(!first||hit.t<first.hit.t))first={solid,hit};}
    const def=first&&structureForSolid(world,first.solid);
    if(def&&b.structureChargeBudget?.id!==def.id){
     const damage=STRUCTURE_PROFILES[def.profile].charge*clamp((b.speed-2)/10,0,1);
     if(damageStructure(room,def.id,damage,b.operatorId,'ram-charge',now,{raw:true,point:{x:first.hit.point[0],y:first.hit.point[1],z:first.hit.point[2]}}))b.structureChargeBudget={id:def.id,damage,strokeAt:null};
     world=room.world;
    }
   }
   b.speed=0;break;
  }
  Object.assign(b,next,pose);
  resolveSoFistContacts(room,b,from,sub,now-dt+(i+1)*sub,now-dt,dt);
  for(let w=0;w<4;w++){const a=boxWorld(soFistFrame(from),SO_FIST_WHEELS[w].pivot),c=boxWorld(soFistFrame(b),SO_FIST_WHEELS[w].pivot);wheelTravel[w]+=Math.hypot(c[0]-a[0],c[1]-a[1],c[2]-a[2])*Math.sign(b.speed)/SO_FIST_WHEELS[w].radius;}
 }
 if(Math.abs(b.speed)<.001&&soFistPose(b,now).active)resolveSoFistContacts(room,b,{...b},dt,now,now-dt,dt);
 const other=room.biByeLlista,stroke=soFistPose(b,now);
 if(other&&other.health>0&&stroke.active&&!(b.strokeMachines??[]).includes(other.id)){
  const head=soFistStriker(b,now),old=soFistStriker(b,now-dt);let first=null;
  for(const box of biByeHitVolumes(other,now)){
   const size=box.size.map((v,i)=>v+head.axes.reduce((n,axis,j)=>n+Math.abs(axis.reduce((d,x,k)=>d+x*box.axes[i][k],0))*head.size[j],0)+.012);
   const hit=orientedBoxHit(old.center,head.center,{...box,size});if(hit&&(!first||hit.t<first.t))first=hit;
  }
  if(first){const armored=b.components.Fist.health>0,damage=armored?110:75+15*clamp(stroke.velocity/12.6,0,1);if(damageBiByeLlista(room,other,damage,b.strikeOperatorId,'so-fist',now,{componentId:first.box.componentId,point:{x:first.point[0],y:first.point[1],z:first.point[2]}})){b.strokeMachines??=[];b.strokeMachines.push(other.id);}}
 }
 const budget=b.structureChargeBudget;
 if(budget){const def=world.structures?.find(v=>v.id===budget.id),head=soFistStriker(b,now);if(!def||!(world.solids??[]).some(v=>def.solidIds.includes(v.id)&&Math.hypot(...head.center.map((n,i)=>Math.max(0,Math.abs(n-v.center[i])-v.size[i]/2-head.size[i]/2)))<1))b.structureChargeBudget=null;}
 b.wheelRolls=wheelTravel;
 if(driver){b.operatorY=soFistOperator(b,world).y;driver.position=soFistOperator(b);driver.velocity={x:-Math.sin(b.heading)*b.speed,y:0,z:-Math.cos(b.heading)*b.speed};driver.grounded=true;driver.yaw=input.yaw??b.heading;driver.pitch=input.pitch??0;driver.sprinting=false;driver.guardHeld=false;driver.guarding=false;}
 if(b.strikeAt!=null&&now-b.strikeAt>=4)b.strikeAt=null;
}

function targetSweep(box,oldBox,player,oldPosition,endPosition=player.position){
 const expanded={...box,size:[box.size[0]+.9,box.size[1]+1.8,box.size[2]+.9]};
 const old=[oldPosition.x,oldPosition.y+.9,oldPosition.z].map((v,i)=>v+box.center[i]-oldBox.center[i]);
 const end=[endPosition.x,endPosition.y+.9,endPosition.z];return orientedBoxHit(old,end,expanded);
}
function resolveSoFistContacts(room,b,previous,dt,now,tickStart,tickDt){
 const volumes=soFistVolumes(b,now),oldVolumes=soFistVolumes(previous,now-dt),forward={x:-Math.sin(b.heading),z:-Math.cos(b.heading)},pose=soFistPose(b,now),fistAlive=b.components.Fist.health>0;
 b.contacts=b.contacts.filter(id=>{const p=room.players.get(id);return p?.alive&&volumes.some(v=>{const q=boxLocal(v,[p.position.x,p.position.y+.9,p.position.z]);return Math.abs(q[0])<v.size[0]/2+1&&Math.abs(q[1])<v.size[1]/2+1.1&&Math.abs(q[2])<v.size[2]/2+1;});});
 for(const victim of room.players.values()){
  if(!victim.alive||victim.id===b.operatorId||victim.operatingRamId===b.id||areAllies(room,b.operatorId,victim.id))continue;
  const old=sampleTransform(victim,tickStart).position,alpha=Math.max(0,Math.min(1,(now-dt-tickStart)/tickDt)),oldPosition={x:old.x+(victim.position.x-old.x)*alpha,y:old.y+(victim.position.y-old.y)*alpha,z:old.z+(victim.position.z-old.z)*alpha};
  const teleported=Math.hypot(victim.position.x-old.x,victim.position.z-old.z)>2;
  const beta=clamp((now-tickStart)/tickDt,0,1),endPosition=Object.fromEntries(['x','y','z'].map(k=>[k,old[k]+(victim.position[k]-old[k])*beta]));
  if(teleported){Object.assign(oldPosition,victim.position);Object.assign(endPosition,victim.position);}
  const velocity=teleported?{x:0,z:0}:{x:(victim.position.x-old.x)/tickDt,z:(victim.position.z-old.z)/tickDt};
  let piston=false,contact=null;
  if(pose.active&&!b.strokeVictims.includes(victim.id)){
   contact=targetSweep(soFistStriker(b,now),soFistStriker(previous,now-dt),victim,oldPosition,endPosition);piston=Boolean(contact);
  }
  if(!contact&&!b.contacts.includes(victim.id)&&Math.abs(b.speed)>2){
   for(let i=0;i<volumes.length;i++){const h=targetSweep(volumes[i],oldVolumes[i]??volumes[i],victim,oldPosition,endPosition);if(h&&(!contact||h.t<contact.t))contact=h;}
  }
  if(!contact)continue;
  if(now-(b.recentVictims[victim.id]??-Infinity)<.25){if(piston)b.strokeVictims.push(victim.id);continue;}
  let normal=contact.normal;const magnitude=Math.hypot(...normal);if(magnitude<.1)normal=[forward.x,0,forward.z];
  const closing=(-Math.sin(b.heading)*b.speed-velocity.x)*normal[0]+(-Math.cos(b.heading)*b.speed-velocity.z)*normal[2];
  if(!piston&&closing<=2)continue;
  const frontal=normal[0]*forward.x+normal[2]*forward.z>.65,force=clamp((closing-2)/10,0,1);
  let amount=piston?(fistAlive?90+30*clamp((pose.velocity+Math.max(0,b.speed)-4.4)/8.2,0,1):75+15*clamp(pose.velocity/12.6,0,1)):(frontal?20+70*force:8+27*force);
  if(piston){
   const behind={x:victim.position.x+forward.x*.65,y:victim.position.y,z:victim.position.z+forward.z*.65},resolved=resolvePlayerWorld(behind,.45,room.world.solids??[],1.8);
   if(fistAlive&&Math.hypot(resolved.x-behind.x,resolved.z-behind.z)>.1)amount=110;
   b.strokeVictims.push(victim.id);
  }
  const guarded=Boolean(victim.guarding)&&isInGuardCone(victim,{position:{x:b.x,y:b.y,z:b.z}},now),stagger=(piston?78:26+26*force)*(guarded?.35:1),shove=(piston?18:8+10*force)*(guarded?.8:1),by=piston?b.strikeOperatorId??b.operatorId:b.operatorId;
  if(guarded){amount*=.55;victim.guardStamina=Math.max(0,victim.guardStamina-(piston?65:30+30*force));victim.lastGuardDrainAt=now;if(victim.guardStamina<=0){victim.guarding=false;room.events.push({type:'guardBreak',attackerId:by,defenderId:victim.id,at:now});}}
  if(applyDamage(room,by,victim.id,Math.round(amount),piston?'so-fist':'knock-on-steel',now,null)){
   staggerBy(room,victim,stagger,now,by);
   if(victim.alive){launchBody(victim,{x:normal[0]*shove,y:piston?4.5:2,z:normal[2]*shove},6);armWorldImpact(victim,by,'so-fist',now);interruptHitActions(room,victim,by,now,'so-fist');}
   b.recentVictims[victim.id]=now;if(!b.contacts.includes(victim.id))b.contacts.push(victim.id);
   room.events.push({type:'soFistImpact',machineId:b.id,victimId:victim.id,piston,guarded,point:{...victim.position},at:now});
   if(!piston)b.speed*=.65;
  }
 }
}
export function damageSoFistication(room,b,amount,attackerId,source,now,{componentId='hull',point=null}={}){
 if(!b||b.retired||b.health<=0||!Number.isFinite(amount)||!(amount>0))return false;
 if(componentId!=='hull'&&componentId!=='Piston'&&!b.components[componentId])return false;
 if(room.mode!=='PRACTICE'&&(b.operatorId===attackerId||areAllies(room,b.operatorId,attackerId)||b.team&&room.players.get(attackerId)?.team===b.team))return false;
 const component=b.components[componentId],target=component??b;if(target.health<=0)return false;
 const old=target.health;
 if(componentId==='Fist'){const range=STEEL_DAMAGE_RANGES[source];amount=Math.min(amount,range?.min??Math.round(amount*GAME.swordGlance/GAME.swordDamage));}
 target.health=Math.max(0,target.health-amount);target.lastHitAt=now;
 room.events.push({type:'soFistDamaged',machineId:b.id,componentId,amount:old-target.health,point,pointLocal:point?boxLocal(soFistFrame(b),[point.x,point.y,point.z]):null,poseOffset:soFistPose(b,now).offset,attackerId,source,at:now});
 if(target.health===0){target.failedAt=now;if(componentId==='Fist')b.fistBrokenAt=now;if(componentId==='hull'){b.mode='DESTROYED';b.strikeAt=null;const p=room.players.get(b.operatorId);dismountSoFistication(room,b,p,{force:true});}}
 return true;
}

export function blastSoFistication(room,b,{point,radius,damage},attackerId,source,now){
 if(!b||!(radius>0))return;
 const exposures=new Map();for(const v of soFistVolumes(b,now)){const q=boxLocal(v,[point.x,point.y,point.z]);const d=Math.hypot(...q.map((x,i)=>Math.max(0,Math.abs(x)-v.size[i]/2)));const e=Math.max(0,1-d/radius);exposures.set(v.componentId,Math.max(exposures.get(v.componentId)??0,e));}
 const sum=[...exposures.values()].reduce((s,x)=>s+x,0);for(const [componentId,e]of exposures)if(e>0)damageSoFistication(room,b,damage*e/Math.max(1,sum),attackerId,source,now,{componentId,point});
}
