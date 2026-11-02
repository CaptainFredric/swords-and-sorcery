import {createSiegeSkill,primeSiegeSkill,endSiegeSkill,skillOperator,skillEvent,SIEGE_SKILLS,integratedRamHazard,sampleRamFailure} from './siegeSkills.mjs';
import { structureForSolid, damageStructure, STRUCTURE_PROFILES } from './structures.mjs';
import {surfaceHeightAt,resolvePlayerWorld} from '../src/collision.mjs';
import {boxWorld,orientedBoxHit,boxLocal} from '../src/orientedBox.mjs';
import {applyDamage,staggerBy,interruptHitActions,isInGuardCone} from './combat.mjs';
import {launchBody} from '../src/movement.mjs';
import {SIEGE_IMPACT,recordSiegeImpact,ramReboundSpeed,recoilRamOnPistonHit,applyBallistaImpact} from './siegeImpact.mjs';
import {postureOf} from '../src/body.mjs';
import {GAME} from '../src/combat.mjs';
import {STEEL_DAMAGE_RANGES} from '../src/steel.mjs';
import {SO_FIST_PISTON} from '../src/soFistPiston.mjs';
import {mitigateSiegeSteel,endSiegeSteel} from './siegeSteel.mjs';
import {areAllies} from '../src/teams.mjs';
import {beginSiegeWreck,stepSiegeWreck} from './siegeWreck.mjs';
import {sampleTransform} from './history.mjs';
import {armWorldImpact} from './worldImpact.mjs';
import {getBiByeSolids,damageBiByeLlista} from './biByeLlista.mjs';
import {biByeHitVolumes} from './biByeComponents.mjs';
import {SO_FIST_SCALE,SO_FIST_FIT,SO_FIST_STATION,SO_FIST_WHEELS,soFistTurnRate,soFistFrame,soFistPose,soFistVolumes,soFistStriker,soFistSolids,machineryOverlap} from './soFistGeometry.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const SO_FIST=Object.freeze({speed:4.8,reverse:2.5,peak:12,pressure:100,hull:1400,fist:500,cycle:4,piston:SO_FIST_PISTON});
export function createSoFistication(overrides={}){return{id:'sofist-practice',type:'so-fist-ication',skill:createSiegeSkill('beatToThePunch'),skillStroke:null,impactReaction:null,x:0,y:0,z:0,heading:0,chassisPitch:0,chassisRoll:0,speed:0,recoilVelocity:0,steer:0,pressure:100,charging:false,chargeSpent:false,operatorId:null,health:1400,maxHealth:1400,mode:'MOBILE',strikeAt:null,strokeVictims:[],bodyEpisodes:{},recentVictims:{},wheelRolls:[0,0,0,0],wheelOffsets:[0,0,0,0],components:Object.fromEntries([...SO_FIST_WHEELS.map(w=>[w.id,{health:180,maxHealth:180}]),['Fist',{health:500,maxHealth:500}],['Drive',{health:250,maxHealth:250}]]),...overrides};}
export function soFistOperator(b){const p=boxWorld(soFistFrame(b),SO_FIST_STATION.rider);return{x:p[0],y:p[1],z:p[2]};}
export function soFistEntry(b,world){const p=boxWorld(soFistFrame(b),SO_FIST_STATION.entry);return{x:p[0],y:world?surfaceHeightAt(p[0],p[2],b.y+.8,world):p[1],z:p[2]};}
function stationClear(b,world,extra=[]){
 const at=soFistOperator(b),hit=resolvePlayerWorld(at,.45,[...(world.solids??[]),...extra],1.8);
 const frame=soFistFrame(b),body={center:boxWorld(frame,[SO_FIST_STATION.rider[0],SO_FIST_STATION.rider[1]+.9,SO_FIST_STATION.rider[2]]),size:[.9,1.8,.9],axes:frame.axes};
 return Math.hypot(hit.x-at.x,hit.z-at.z)<.015&&!([...(world.solids??[]),...extra].some(s=>machineryOverlap(body,s)));
}
export function soFistExit(room,b,p,extras=[]){
 const frame=soFistFrame(b),solids=[...(room.world.solids??[]),...soFistSolids(b),...getBiByeSolids(room.biByeLlista),...extras,...[...room.players.values()].filter(v=>v.alive&&v.id!==p.id).map(v=>({center:[v.position.x,v.position.y+.9,v.position.z],size:[.9,1.8,.9]}))];
 for(const local of SO_FIST_STATION.exits){const at=boxWorld(frame,local),y=surfaceHeightAt(at[0],at[2],b.y+.8,room.world);if(y==null||Math.abs(y-b.y)>.85)continue;const candidate={x:at[0],y,z:at[2]},resolved=resolvePlayerWorld(candidate,.45,solids,1.8);if(Math.hypot(resolved.x-candidate.x,resolved.z-candidate.z)<.015)return candidate;}return null;
}
export function mountSoFistication(room,b,p,now=0){
 if(!b||b.retired||b.health<=0||!p?.alive||p.operatingBallistaId||p.operatingRamId||(p.staggerUntil??0)>now||p.pendingSpell||p.gauntlet||p.ultimateState||p.attackActive||b.operatorId)return false;
 if(b.team&&p.team!==b.team)return false;
 if(b.emplacementId&&(room.state!=='PLAYING'||!b.phases.includes(room.objectiveState?.phase)))return false;
 const entry=soFistEntry(b,room.world),seat=soFistOperator(b);
 const obstacles=[...getBiByeSolids(room.biByeLlista),...[...room.players.values()].filter(v=>v.alive&&v.id!==p.id).map(v=>({center:[v.position.x,v.position.y+.9,v.position.z],size:[.9,1.8,.9]}))];
 if(entry.y==null||Math.abs(p.position.y-entry.y)>1||Math.hypot(p.position.x-entry.x,p.position.z-entry.z)>2.2||!stationClear(b,room.world,obstacles)||!soFistExit(room,b,p))return false;
 b.operatorId=p.id;p.operatingRamId=b.id;p.position=seat;p.velocity={x:0,y:0,z:0};p.impulse={x:0,z:0};p.guarding=false;p.guardHeld=false;p.attackHeld=false;p.input={forward:0,right:0,yaw:b.heading,pitch:0,jump:false,sprint:false};return true;
}
export function dismountSoFistication(room,b,p,{administrative=false,exit=null,force=false,at=null}={}){
 if(!b)return false;if(p?.alive&&!exit){exit=soFistExit(room,b,p);if(!exit&&!administrative&&!force)return false;}
 endSiegeSkill(b,at??Math.max(b.poseTime??0,b.skill?.primedAt??0));b.operatorId=null;b.charging=false;b.chargeSpent=false;b.speed=0;if(administrative){b.retired=true;b.strikeAt=null;}
 if(p){p.operatingRamId=null;p.input={forward:0,right:0,yaw:p.yaw,pitch:p.pitch,jump:false,sprint:false};p.attackHeld=false;p.guarding=false;p.velocity={x:0,y:0,z:0};p.impulse={x:0,z:0};if(exit)p.position={...exit};}return true;
}
export function fireSoFistication(room,b,now){
 if(b?.emplacementId&&room.state!=='PLAYING')return false;
 if(!b||b.retired||b.health<=0||!room.players.get(b.operatorId)?.alive||
   (room.players.get(b.operatorId)?.staggerUntil??0)>now||
   b.strikeAt!=null&&now-b.strikeAt<SO_FIST.cycle)return false;
 // Invalid manual attempts must not disarm a waiting counterattack.
 if(b.skill?.phase==='primed'){endSiegeSkill(b,now);skillEvent(room,b,now,'cancelled',{reason:'manual'});}
 b.skillStroke=null;b.strikeAt=now;b.strokeLimit=null;b.strokeBlockedAt=null;
 b.strikeOperatorId=b.operatorId;b.strokeVictims=[];b.strokeMachines=[];b.strokeStructures=[];
 room.events.push({type:'soFistStrike',machineId:b.id,at:now});return true;
}
export function primeSoFistSkill(room,b,p,now){
 if(!skillOperator(room,b,p,now)||b.components.Fist.health<=0||b.components.Drive.health<=0)return 'The fist and drive must be functioning.';
 if(!primeSiegeSkill(b,now))return 'Beat to the Punch is cooling down or already primed.';
 b.skill.chassisDamage=0;b.skill.failureThreshold=sampleRamFailure(room);
 b.skill.integratedHazard=0;skillEvent(room,b,now,'primed');return null;
}
function triggerSoFistSkill(room,b,now,reason){
 if(b.skill?.phase!=='primed')return;
 if(!skillOperator(room,b,room.players.get(b.operatorId),now)||b.components.Fist.health<=0||b.components.Drive.health<=0){endSiegeSkill(b,now);return;}
 const from=soFistPose(b,now).offset,prepare=Math.max(.14,(from+.105*SO_FIST_SCALE)/4.5);
 b.skillStroke={from,prepare};b.strikeAt=now;b.strokeLimit=null;b.strokeBlockedAt=null;b.strokePreviousOffset=from;
 b.strokeVictims=[];b.strokeMachines=[];b.strokeStructures=[];b.strikeOperatorId=b.operatorId;
 endSiegeSkill(b,now);skillEvent(room,b,now,'triggered',{reason});room.events.push({type:'soFistStrike',machineId:b.id,at:now});
}
function stepSoFistSkill(room,b,now){
 if(b.skill?.phase!=='primed')return;
 const p=room.players.get(b.operatorId);
 if(!skillOperator(room,b,p,now)||b.components.Fist.health<=0||b.components.Drive.health<=0){
  endSiegeSkill(b,now);skillEvent(room,b,now,'ended');return;
 }
 // Preserve genuine enemy-reach and hull-damage releases through the same
 // moving piston strike. The instability can also strike empty air.
 const head=soFistStriker({...b,strikeAt:null,skillStroke:null},now),
  end={...head,center:head.center.map((v,i)=>v+head.axes[2][i]*.445*SO_FIST_SCALE)};
 for(const target of room.players.values())if(target.alive&&target.id!==p.id&&!areAllies(room,p.id,target.id)&&targetSweep(end,head,target,target.position)){
  triggerSoFistSkill(room,b,now,'reach');return;
 }
 const elapsed=Math.max(0,now-(b.skill.primedAt??now));
 b.skill.integratedHazard=integratedRamHazard(elapsed);
 if(b.skill.integratedHazard>=b.skill.failureThreshold)triggerSoFistSkill(room,b,now,'instability');
}
export function soFistTerrainPose(b,world){
 const flat=soFistFrame({...b,chassisPitch:0,chassisRoll:0}),samples=[];
 for(const w of SO_FIST_WHEELS){const point=boxWorld(flat,[w.pivot[0],0,w.pivot[2]]),h=surfaceHeightAt(point[0],point[2],b.y+.3,world);if(h==null||Math.abs(h-b.y)>.65)return null;samples.push(h);}
 const front=(samples[0]+samples[1])/2,rear=(samples[2]+samples[3])/2,left=(samples[0]+samples[2])/2,right=(samples[1]+samples[3])/2;
 const pitch=Math.atan2(front-rear,SO_FIST_FIT.wheelbase),roll=Math.atan2(right-left,(SO_FIST_FIT.frontTrack+SO_FIST_FIT.rearTrack)/2);if(Math.hypot(pitch,roll)>.384)return null;
 const tilted=soFistFrame({...b,y:0,chassisPitch:pitch,chassisRoll:roll}),y=SO_FIST_WHEELS.reduce((sum,w,i)=>sum+samples[i]+w.pivot[1]-boxWorld(tilted,w.pivot)[1],0)/SO_FIST_WHEELS.length,root=soFistFrame({...b,y,chassisPitch:pitch,chassisRoll:roll}),offsets=SO_FIST_WHEELS.map((w,i)=>(samples[i]+w.pivot[1]-boxWorld(root,w.pivot)[1])/root.axes[1][1]);if(offsets.some(v=>Math.abs(v)>.18))return null;
 return{y,chassisPitch:pitch,chassisRoll:roll,wheelOffsets:offsets};
}
export function soFistClear(b,world,extra=[],{operatorStation=false}={}){if((b.operatorId||operatorStation)&&!stationClear(b,world,extra))return false;const boxes=soFistVolumes(b);return !boxes.some(v=>[...(world.solids??[]),...extra].some(s=>machineryOverlap(v,s)));}
// Movement solids can press a player aside, but that correction must itself
// fit in the world. Stop the carriage when machinery and masonry leave no room.
function pinsPlayer(room,next,world,obstacles){
 const nearby=[...room.players.values()].filter(p=>p.alive&&p.id!==next.operatorId&&p.operatingRamId!==next.id&&Math.hypot(p.position.x-next.x,p.position.z-next.z)<SO_FIST_SCALE*2);
 if(!nearby.length)return false;
 const machine=soFistSolids(next),solids=[...(world.solids??[]),...obstacles];
 for(const p of nearby){
  const pressed=resolvePlayerWorld(p.position,.45,machine,postureOf(p).height);
  if(Math.hypot(pressed.x-p.position.x,pressed.z-p.position.z)<.001)continue;
  const safe=resolvePlayerWorld(pressed,.45,solids,postureOf(p).height);
  if(Math.hypot(safe.x-pressed.x,safe.z-pressed.z)>.0005)return true;
 }
 return false;
}
export function stepSoFistication(room,b,dt,now,world=room.world){
 if(!b||b.retired)return;if(b.health<=0){stepSiegeWreck(room,b,now);return;}b.poseTime=now;stepSoFistSkill(room,b,now);
 // Sweep the real striking surface against architecture before sampling contacts.
 const prior=soFistPose(b,now-dt),raw=soFistPose({...b,strokeLimit:null},now);
 b.strokePreviousOffset=prior.offset;b.strokeStepDt=dt;
 if(raw.active&&raw.offset>prior.offset){
  const start=soFistStriker(b,now-dt),end=soFistStriker({...b,strokeLimit:null},now);
  const extent=[0,1,2].map(i=>start.axes.reduce((n,axis,j)=>n+Math.abs(axis[i])*start.size[j],0));
  let first = null;
  // Architecture can arrest the piston; machines use component-specific contact below.
   for(const solid of world.solids??[]){
   const box={...solid,axes:[[1,0,0],[0,1,0],[0,0,1]],size:solid.size.map((v,i)=>v+extent[i])};
   const hit=orientedBoxHit(start.center,end.center,box);
   if(hit&&(!first||hit.t<first.hit.t))first={solid,hit};
  }
  if(first){
   const {solid,hit}=first,limit=prior.offset+(raw.offset-prior.offset)*hit.t-.002;
   if(b.strokeLimit==null||limit<b.strokeLimit){b.strokeLimit=limit;if(b.strokeBlockedAt==null){b.strokeBlockedAt=now;recoilRamOnPistonHit(room,b,now,{speed:Math.max(0,raw.velocity),normal:{x:Math.sin(b.heading),z:Math.cos(b.heading)},kind:'piston-wall',point:{x:hit.point[0],y:hit.point[1],z:hit.point[2]}});room.events.push({type:'soFistBlocked',machineId:b.id,point:{x:hit.point[0],y:hit.point[1],z:hit.point[2]},at:now});}}
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
 if(b.operatorId&&(!p?.alive||p.operatingRamId!==b.id||p.connected===false&&p.actorKind==='human'))dismountSoFistication(room,b,p,{force:true});
 const driver=room.players.get(b.operatorId),input=driver&&(driver.staggerUntil??0)<=now?driver.input??{}:{};
 const failed=SO_FIST_WHEELS.filter(w=>b.components[w.id].health<=0),canDrive=failed.length<3&&!['L','R'].some(s=>failed.filter(w=>w.id.endsWith(s)).length>=2),driveScale=canDrive?(1-failed.length*.22)*(b.components.Drive.health<=0?.45:1):0;
 const reverseSkill=b.skill?.phase==='primed'&&input.forward<0;
 const chargeHeld=Boolean(driver&&input.sprint&&(input.forward>=0||reverseSkill)&&driveScale>0);

 if(!chargeHeld)b.chargeSpent=false;
 if(chargeHeld&&!b.chargeSpent&&b.pressure>=25)b.charging=true;
 if(!chargeHeld)b.charging=false;
 if(b.charging){b.pressure=Math.max(0,b.pressure-(4+.07*b.speed*b.speed)*(1+failed.length*.18+(b.components.Drive.health<=0?.5:0))*dt);if(b.pressure<=0){b.charging=false;b.chargeSpent=true;}}
 else b.pressure=Math.min(100,b.pressure+(Math.abs(b.speed)>6?5:13)*(b.components.Drive.health<=0?.5:1)*dt);
 if(reverseSkill&&b.charging){const debt=SIEGE_SKILLS.beatToThePunch.reverseDebt*dt;b.skill.debt+=debt;}
 const target=(b.charging?(reverseSkill?-SIEGE_SKILLS.beatToThePunch.reverseSpeed:12):input.forward>0?SO_FIST.speed:input.forward<0?-SO_FIST.reverse:0)*driveScale*(1-.45*clamp(Math.max(0,b.chassisPitch*Math.sign(b.charging?(reverseSkill?-1:1):input.forward??0))/.384,0,1));
 const reversing=target*b.speed<0;
 const accel=b.charging?(reverseSkill?SIEGE_IMPACT.ramReverseChargeAcceleration:4):reversing||Math.abs(target)<Math.abs(b.speed)?5.8:3.8;
 b.speed+=clamp(target-b.speed,-accel*dt,accel*dt);if(Math.abs(b.speed)<.001)b.speed=0;
 b.steer=clamp(input.right??0,-1,1)*(1-.86*clamp((Math.abs(b.speed)-SO_FIST.speed)/(SO_FIST.peak-SO_FIST.speed),0,1));
 // Drive and impact momentum both move the carriage through terrain clearance.
 const travelSpeed=b.speed+(b.recoilVelocity??0);
 const steps=Math.max(1,Math.ceil(Math.abs(travelSpeed)*dt/.12)),sub=dt/steps;const wheelTravel=b.wheelRolls.slice();
 for(let i=0;i<steps;i++){
  if(Math.abs(travelSpeed)<1e-5)break;
  const from={...b},heading=b.heading+soFistTurnRate({...b,speed:travelSpeed})*sub;
  const rearZ=SO_FIST_WHEELS[2].pivot[2];
  const next={...b,x:b.x+(Math.sin(heading)-Math.sin(b.heading))*rearZ-Math.sin(heading)*travelSpeed*sub,z:b.z+(Math.cos(heading)-Math.cos(b.heading))*rearZ-Math.cos(heading)*travelSpeed*sub,heading};const pose=soFistTerrainPose(next,world);
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
   const crashSpeed=travelSpeed;b.recoilVelocity=0;
   recordSiegeImpact(room,b,now,{speed:Math.abs(crashSpeed),normal:{x:Math.sin(b.heading)*Math.sign(crashSpeed),z:Math.cos(b.heading)*Math.sign(crashSpeed)},kind:'carriage-wall'});
   b.speed=ramReboundSpeed(crashSpeed);break;
  }
  if(pinsPlayer(room,{...next,...pose},world,obstacles)){
   // Preserve the impact on the swept contact surface, then brake. Low energy
   // pressure reaches this path with no damage or armed wall consequence.
   resolveSoFistContacts(room,{...b,...next,...pose},from,sub,now-dt+(i+1)*sub,now-dt,dt);
   const crashSpeed=travelSpeed;b.recoilVelocity=0;
   recordSiegeImpact(room,b,now,{speed:Math.abs(crashSpeed),normal:{x:Math.sin(b.heading)*Math.sign(crashSpeed),z:Math.cos(b.heading)*Math.sign(crashSpeed)},kind:'carriage-body'});
   b.speed=ramReboundSpeed(crashSpeed);break;
  }
  Object.assign(b,next,pose);
  resolveSoFistContacts(room,b,from,sub,now-dt+(i+1)*sub,now-dt,dt);
  for(let w=0;w<4;w++){const a=boxWorld(soFistFrame(from),SO_FIST_WHEELS[w].pivot),c=boxWorld(soFistFrame(b),SO_FIST_WHEELS[w].pivot);wheelTravel[w]+=Math.hypot(c[0]-a[0],c[1]-a[1],c[2]-a[2])*Math.sign(travelSpeed)/SO_FIST_WHEELS[w].radius;}
 }
 if(Math.abs(travelSpeed)<.001&&soFistPose(b,now).active)resolveSoFistContacts(room,b,{...b},dt,now,now-dt,dt);
 const other=room.biByeLlista,stroke=soFistPose(b,now);
 if(other&&other.health>0&&stroke.active&&!(b.strokeMachines??[]).includes(other.id)){
  const head=soFistStriker(b,now),old=soFistStriker(b,now-dt);let first=null;
  for(const box of biByeHitVolumes(other,now)){
   const size=box.size.map((v,i)=>v+head.axes.reduce((n,axis,j)=>n+Math.abs(axis.reduce((d,x,k)=>d+x*box.axes[i][k],0))*head.size[j],0)+.012);
   const hit=orientedBoxHit(old.center,head.center,{...box,size});if(hit&&(!first||hit.t<first.t))first=hit;
  }
  if(first){const armored=b.components.Fist.health>0,damage=armored?110:75+15*clamp(stroke.velocity/12.6,0,1);if(damageBiByeLlista(room,other,damage,b.strikeOperatorId,'so-fist',now,{componentId:first.box.componentId,point:{x:first.point[0],y:first.point[1],z:first.point[2]}})){b.strokeMachines??=[];b.strokeMachines.push(other.id);
    const direction={x:-Math.sin(b.heading),z:-Math.cos(b.heading)};
    applyBallistaImpact(room,other,now,{normal:direction,speed:Math.max(0,stroke.velocity),point:{x:first.point[0],y:first.point[1],z:first.point[2]}});
    recoilRamOnPistonHit(room,b,now,{speed:Math.max(0,stroke.velocity),normal:{x:-direction.x,z:-direction.z},kind:'piston-machine',point:{x:first.point[0],y:first.point[1],z:first.point[2]}});
     const oldOffset=soFistPose(b,now-dt).offset;
     b.strokeLimit=Math.max(oldOffset,oldOffset+(stroke.offset-oldOffset)*first.t-.002);
     b.strokeBlockedAt=now;}}
 }
 const budget=b.structureChargeBudget;
 if(budget){const def=world.structures?.find(v=>v.id===budget.id),head=soFistStriker(b,now);if(!def||!(world.solids??[]).some(v=>def.solidIds.includes(v.id)&&Math.hypot(...head.center.map((n,i)=>Math.max(0,Math.abs(n-v.center[i])-v.size[i]/2-head.size[i]/2)))<1))b.structureChargeBudget=null;}
 b.wheelRolls=wheelTravel;
 const recoil=b.recoilVelocity??0;
 b.recoilVelocity=Math.sign(recoil)*Math.max(0,Math.abs(recoil)-SIEGE_IMPACT.ramPistonRecoilBrake*dt);
 if(driver){b.operatorY=soFistOperator(b).y;driver.position=soFistOperator(b);driver.velocity={x:-Math.sin(b.heading)*travelSpeed,y:0,z:-Math.cos(b.heading)*travelSpeed};driver.grounded=true;driver.yaw=input.yaw??b.heading;driver.pitch=input.pitch??0;driver.sprinting=false;driver.guardHeld=false;driver.guarding=false;}
 if(b.strikeAt!=null&&now-b.strikeAt>=4)b.strikeAt=null;
}

function targetSweep(box,oldBox,player,oldPosition,endPosition=player.position){
 const expanded={...box,size:[box.size[0]+.9,box.size[1]+1.8,box.size[2]+.9]};
 const old=[oldPosition.x,oldPosition.y+.9,oldPosition.z].map((v,i)=>v+box.center[i]-oldBox.center[i]);
 const end=[endPosition.x,endPosition.y+.9,endPosition.z];return orientedBoxHit(old,end,expanded);
}
function resolveSoFistContacts(room,b,previous,dt,now,tickStart,tickDt){
 const volumes=soFistVolumes(b,now),oldVolumes=soFistVolumes(previous,now-dt),forward={x:-Math.sin(b.heading),z:-Math.cos(b.heading)},pose=soFistPose(b,now),fistAlive=b.components.Fist.health>0;
 // A victim being thrown clear cannot by itself create a fresh approach.
 // Rearm through real carriage withdrawal or a lateral route around the old
 // collision, with physical clearance. There is no global impact cooldown.
 b.bodyEpisodes??={};
 for(const [id,episode]of Object.entries(b.bodyEpisodes)){
  const victim=room.players.get(id);
  if(!victim?.alive){delete b.bodyEpisodes[id];continue;}
  const clear=!volumes.some(v=>{const q=boxLocal(v,[victim.position.x,victim.position.y+.9,victim.position.z]);return Math.abs(q[0])<v.size[0]/2+1&&Math.abs(q[1])<v.size[1]/2+1.1&&Math.abs(q[2])<v.size[2]/2+1;});
  const travel=(b.x-episode.x)*episode.normal[0]+(b.z-episode.z)*episode.normal[2];
  if(travel>0){episode.x+=episode.normal[0]*travel;episode.z+=episode.normal[2]*travel;}
  const across=Math.abs((b.x-episode.x)*episode.normal[2]-(b.z-episode.z)*episode.normal[0]);
  if(clear&&(travel < -SO_FIST_FIT.wheelbase*.6 || across > SO_FIST_FIT.frontTrack))delete b.bodyEpisodes[id];
 }

 for(const victim of room.players.values()){
  if(!victim.alive||victim.id===b.operatorId||victim.operatingRamId===b.id||areAllies(room,b.operatorId,victim.id))continue;
  const old=sampleTransform(victim,tickStart).position,alpha=Math.max(0,Math.min(1,(now-dt-tickStart)/tickDt)),oldPosition={x:old.x+(victim.position.x-old.x)*alpha,y:old.y+(victim.position.y-old.y)*alpha,z:old.z+(victim.position.z-old.z)*alpha};
  const teleported=Math.hypot(victim.position.x-old.x,victim.position.z-old.z)>2;
  const beta=clamp((now-tickStart)/tickDt,0,1),endPosition=Object.fromEntries(['x','y','z'].map(k=>[k,old[k]+(victim.position[k]-old[k])*beta]));
  if(teleported){Object.assign(oldPosition,victim.position);Object.assign(endPosition,victim.position);}
  const velocity=teleported?{x:0,z:0}:{x:(victim.position.x-old.x)/tickDt,z:(victim.position.z-old.z)/tickDt};
  let piston=false,contact=null,surfaceVelocity={x:0,z:0};
  if(pose.active&&!b.strokeVictims.includes(victim.id)){
   contact=targetSweep(soFistStriker(b,now),soFistStriker(previous,now-dt),victim,oldPosition,endPosition);piston=Boolean(contact);
  }
  if(!contact&&!b.bodyEpisodes[victim.id]&&Math.abs(b.speed)>.001){
   for(let i=0;i<volumes.length;i++){
    const box=volumes[i],oldBox=oldVolumes[i]??box,h=targetSweep(box,oldBox,victim,oldPosition,endPosition);
    if(h&&(!contact||h.t<contact.t)){
     contact=h;surfaceVelocity={x:(box.center[0]-oldBox.center[0])/dt,z:(box.center[2]-oldBox.center[2])/dt};
     if(Math.hypot(...h.normal)<.1){
      // An initial overlap has no slab entry normal. Use the nearest actual
      // horizontal face rather than treating every overlap as a frontal hit.
      const q=boxLocal(box,[endPosition.x,endPosition.y+.9,endPosition.z]);
      const axis=box.size[0]/2+.45-Math.abs(q[0]) < box.size[2]/2+.45-Math.abs(q[2])?0:2;
      h.normal=box.axes[axis].map(v=>v*(Math.sign(q[axis])||1));
     }
    }
   }
  }
  if(!contact)continue;
  if(piston&&now-(b.recentVictims[victim.id]??-Infinity)<.25){b.strokeVictims.push(victim.id);continue;}
  let normal=contact.normal;const magnitude=Math.hypot(...normal);if(magnitude<.1)normal=[forward.x,0,forward.z];
  const closing=(surfaceVelocity.x-velocity.x)*normal[0]+(surfaceVelocity.z-velocity.z)*normal[2];
  const frontal=normal[0]*forward.x+normal[2]*forward.z>.65;
  // Normal kinetic energy above a harmless maneuvering band. Tangential
  // speed does not turn a glancing scrape into a full energy frontal blow.
  const force=clamp((closing*closing-3.5*3.5)/(SO_FIST.peak**2-3.5*3.5),0,1);
  if(!piston&&(closing<=3.5||Math.round((frontal?90:35)*force)===0))continue;
  let amount=piston?(fistAlive?SO_FIST_PISTON.minimum+(SO_FIST_PISTON.maximum-SO_FIST_PISTON.minimum)*clamp((pose.velocity+Math.max(0,b.speed)-4.4)/8.2,0,1):75+15*clamp(pose.velocity/12.6,0,1)):(frontal?90:35)*force;
  if(piston){
   const behind={x:victim.position.x+forward.x*.65,y:victim.position.y,z:victim.position.z+forward.z*.65},resolved=resolvePlayerWorld(behind,.45,room.world.solids??[],1.8);
   if(fistAlive&&Math.hypot(resolved.x-behind.x,resolved.z-behind.z)>.1)amount=110;
   b.strokeVictims.push(victim.id);
  }
  const guarded=Boolean(victim.guarding)&&isInGuardCone(victim,{position:{x:b.x,y:b.y,z:b.z}},now),stagger=(piston?78:52*Math.sqrt(force))*(guarded?.35:1),shove=(piston?18:18*Math.sqrt(force))*(guarded?.46:1),by=piston?b.strikeOperatorId??b.operatorId:b.operatorId;
  if(guarded){amount*=.55;victim.guardStamina=Math.max(0,victim.guardStamina-(piston?65:60*Math.sqrt(force)));victim.lastGuardDrainAt=now;if(victim.guardStamina<=0){victim.guarding=false;room.events.push({type:'guardBreak',attackerId:by,defenderId:victim.id,at:now});}}
  if(applyDamage(room,by,victim.id,Math.round(amount),piston?'so-fist':'knock-on-steel',now,null)){
   staggerBy(room,victim,stagger,now,by);
   const launch={x:normal[0]*shove,y:piston?4.5:2,z:normal[2]*shove};
   launchBody(victim,launch,6);
   if(victim.alive){armWorldImpact(victim,by,'so-fist',now);interruptHitActions(room,victim,by,now,'so-fist');}
   else if(piston&&!guarded&&shove>=10){
     // Kill credit and respawn are already settled by applyDamage.
     victim.deathFlight={at:now,until:Math.min(now+2.0,(victim.respawnAt??now+3)-.05)};
   }
   if(piston)recoilRamOnPistonHit(room,b,now,{speed:Math.max(0,pose.velocity),normal:{x:-forward.x,z:-forward.z},kind:'piston-body',point:{...victim.position}});
    b.bodyEpisodes[victim.id]={x:b.x,z:b.z,normal:[...normal]};
   b.recentVictims[victim.id]=now;
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
 // Existing piston armor is applied first. Only additional temporary Steel
 // mitigation spends the conditional restoration pool.
 const ward=mitigateSiegeSteel(room,b,amount,source,now,{componentId,point});
 amount=ward.amount;
 target.health=Math.max(0,target.health-amount);target.lastHitAt=now;
 room.events.push({type:'soFistDamaged',machineId:b.id,componentId,amount:old-target.health,point,pointLocal:point?boxLocal(soFistFrame(b),[point.x,point.y,point.z]):null,poseOffset:soFistPose(b,now).offset,attackerId,source,at:now});
 if(componentId==='hull'&&b.skill?.phase==='primed'&&target.health>0){b.skill.chassisDamage+=(old-target.health);if(b.skill.chassisDamage>=SIEGE_SKILLS.beatToThePunch.chassisTrigger)triggerSoFistSkill(room,b,now,'chassis');}
 if(target.health===0){target.failedAt=now;if(componentId==='Fist')b.fistBrokenAt=now;if(['Fist','Drive'].includes(componentId)&&b.skill?.phase==='primed'){endSiegeSkill(b,now);skillEvent(room,b,now,'ended');}if(componentId==='hull'){
    endSiegeSteel(room,b,now);
    beginSiegeWreck(room,b,'so-fist-ication',now,{attackerId,source,point});
    b.mode='DESTROYED';b.strikeAt=null;b.speed=0;b.recoilVelocity=0;
    const pilot=b.operatorId?room.players.get(b.operatorId):null;
    dismountSoFistication(room,b,pilot,{force:true,at:now});
    if(pilot?.alive)applyDamage(room,attackerId,pilot.id,35,'so-fist-collapse',now);
    room.events.push({type:'soFistDestroyed',machineId:b.id,attackerId,source,point,at:now});
   }}
 return true;
}

export function blastSoFistication(room,b,{point,radius,damage},attackerId,source,now){
 if(!b||!(radius>0))return;
 const exposures=new Map();for(const v of soFistVolumes(b,now)){const q=boxLocal(v,[point.x,point.y,point.z]);const d=Math.hypot(...q.map((x,i)=>Math.max(0,Math.abs(x)-v.size[i]/2)));const e=Math.max(0,1-d/radius);exposures.set(v.componentId,Math.max(exposures.get(v.componentId)??0,e));}
 const sum=[...exposures.values()].reduce((s,x)=>s+x,0);for(const [componentId,e]of exposures)if(e>0)damageSoFistication(room,b,damage*e/Math.max(1,sum),attackerId,source,now,{componentId,point});
}
