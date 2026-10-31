// Practice's machine pilots: actual server actors operating the ordinary siege
// machinery. Decision quality varies, never damage, ammunition or cooldowns.
import {createBiByeLlista,mountBiByeLlista,dismountBiByeLlista,toggleBiByeDeploy,
  fireBiByeMobile,fireBiByeFullVolley,biByeTargetAim} from './biByeLlista.mjs';
import {requestBiByeHeavySkill,setBiByeWeaponFocus} from './biByeWeapons.mjs';
import {createSoFistication,mountSoFistication,dismountSoFistication,
  soFistEntry,primeSoFistSkill,fireSoFistication} from './soFistication.mjs';
import {createFightFlight,mountFightFlight,dismountFightFlight,fightFlightExit} from './fightFlight.mjs';
import {fightFlightConstructionClear} from './practiceFightFlight.mjs';
import {requestFightFlightFire} from './fightFlightWeapons.mjs';
import {requestFightFlightSkill} from './fightFlightSkill.mjs';
import {requestFlightDash} from './fightFlightRun.mjs';
import {setFlightUltimateHold} from './fightFlightTerminal.mjs';
import {practiceHostileSiegePlacement} from './practiceSiege.mjs';
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {beginAttack,endAttack} from './combat.mjs';

export const SIEGE_OPERATORS=Object.freeze({
  'bi-bye-llista':Object.freeze({name:'Ballistefan',field:'biByeLlista'}),
  'so-fist-ication':Object.freeze({name:'Sir Uppercuff',field:'soFistication'}),
  'fight-and-flight':Object.freeze({name:'Mr. Donte Shoot',field:'fightFlight'}),
});
export const SIEGE_DIFFICULTIES=Object.freeze({
  learner:Object.freeze({reaction:.48,lead:.12,preferred:17,skill:'squire',error:.065}),
  skilled:Object.freeze({reaction:.23,lead:.78,preferred:19,skill:'champion',error:.012}),
  formidable:Object.freeze({reaction:.10,lead:1,preferred:21,skill:'spellblade',error:0}),
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const difference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const bearing=(a,b)=>Math.atan2(-(b.x-a.x),-(b.z-a.z));
const dist=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const mounted=(a)=>Boolean(a?.operatingBallistaId||a?.operatingRamId||a?.operatingFightFlightId);
const near=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const blocked=(room,a,b)=> (room.world?.solids??[]).some(s=>segmentAabbHit(
  [a.x,a.y+1.45,a.z],[b.x,b.y+1.05,b.z],s));
function enemy(room,a){
  return [...room.players.values()].filter(p=>p.actorKind==='human'&&p.connected!==false&&p.alive&&p.id!==a.id)
    .sort((x,y)=>dist(a.position,x.position)-dist(a.position,y.position))[0]??null;
}
function predicted(from,target,speed,difficulty,delay=0){
  const v=target.velocity??{},t=clamp(near(from,target.position)/speed+delay,0,3)*difficulty.lead;
  return {x:target.position.x+(v.x??0)*t,y:target.position.y+(v.y??0)*t,
    z:target.position.z+(v.z??0)*t};
}
function aimInput(a,b,ai,difficulty,speed=48){
  const point=predicted(a,b,speed,difficulty);
  const error=Math.sin(ai.decisions*2.71+ai.seed)*difficulty.error;
  const yaw=bearing(a,point)+error;
  return {point,yaw,pitch:Math.atan2(point.y+1.0-(a.y+1.5),dist(a,point))+error*.5};
}
function drive(room,m,target,ai,difficulty,{ideal=10,deadZone=2,reverse=true}={}){
  const point=predicted({x:m.x,y:m.y,z:m.z},target.position?target:{position:target,velocity:{}},36,difficulty);
  const at={x:m.x,y:m.y,z:m.z},d=dist(at,point),yaw=bearing(at,point),err=difference(yaw,m.heading);
  let forward=d>ideal+deadZone?1:d<ideal-deadZone&&reverse?-.7:0;
  if(Math.abs(err)>1.4&&forward>0)forward=.4;
  let right=clamp(-err*1.25,-1,1); // wheeled heading turns opposite the signed steer
  // If blocked, sweep a new approach arc; never ask physics to drive through it.
  const look=4.2,front={x:at.x-Math.sin(m.heading)*look,y:at.y,z:at.z-Math.cos(m.heading)*look};
  if(forward>0&&blocked(room,at,front)){right=ai.side;forward=.45;}
  if(ai.stuckUntil>0&&ai.stuckUntil>ai.now){right=ai.side;forward=-.65;}
  const moved=dist(at,ai.lastPosition??at);
  if(ai.now-(ai.lastSampleAt??ai.now)>1.8){
    if(forward>.3&&moved<.35){ai.side=-ai.side;ai.stuckUntil=ai.now+1.3;}
    ai.lastPosition={...at};ai.lastSampleAt=ai.now;
  }
  return {forward,right,err,d};
}
function noOperation(room,actor,now){
  const name=actor.practiceSiegeOperator?.machine,def=SIEGE_OPERATORS[name],m=room[def?.field];
  return !m||m.retired||m.mode==='DESTROYED'||m.health<=0||m.operatorId!==actor.id||!mounted(actor);
}
function cleanProjectiles(room,actor,machineId){
  for(const pool of [room.projectiles,room.bibyeProjectiles,room.fightFlightProjectiles])
    for(const [id,q] of pool??[])if(q.ownerId===actor.id||q.machineId===machineId||q.ballistaId===machineId)pool.delete(id);
}
/** Plan first. Reject occupied authoritative machines rather than making copies. */
export function spawnPracticeSiegeOperator(room,requester,machine,difficulty='skilled',now=0){
  const def=SIEGE_OPERATORS[machine],tuning=SIEGE_DIFFICULTIES[difficulty];
  if(room?.mode!=='PRACTICE'||room.state!=='PLAYING'||!requester?.alive||
    requester.actorKind!=='human'||room.players.get(requester.id)!==requester)
    return {rejected:'Only a living Practice player can summon hostile operators.'};
  if(!def||!tuning)return {rejected:'Choose a siege opponent and difficulty.'};
  if(room.players.size>=8)return {rejected:'Practice has reached the actor limit.'};
  if(room[def.field])return {rejected:'That machine is already in use. Remove or dismantle it before summoning its operator.'};
  if([...room.players.values()].some(p=>p.practiceSiegeOperator?.machine===machine))
    return {rejected:'That hostile operator already exists. Remove or reset him first.'};
  const candidate=machine==='fight-and-flight'?flightPlacement(room,requester):
    practiceHostileSiegePlacement(room,requester,machine);
  if(!candidate)return {rejected:'No supported, unobstructed siege position is available nearby.'};
  const m=candidate.b??candidate,revision=def.field==='biByeLlista'?'biByeRevision':
    def.field==='soFistication'?'soFistRevision':'fightFlightRevision';
  const id='hostile-'+machine+'-'+room.code,revisionNo=(room[revision]??0)+1;
  m.id='hostile-'+machine+'-'+room.code+'-'+revisionNo;
  m.lifecycleId=m.id;m.builtAt=now;m.team=null;
  const actor=room.addServerActor({id,name:def.name,actorKind:'bot',spell:'fireball',
    ultimate:machine==='fight-and-flight'?'chivalry':'sunder'},now);
  actor.botSkill=tuning.skill;actor.botProfile='melee';
  actor.practiceSiegeOperator={machine,difficulty};
  const entry=machine==='so-fist-ication'?soFistEntry(m,room.world):
    machine==='fight-and-flight'?{x:m.x,y:m.y,z:m.z+1}:{x:m.x,y:m.y,z:m.z};
  actor.position={...entry};actor.spawnProtectionUntil=now+.35;
  room[def.field]=m;
  const ok=machine==='bi-bye-llista'?mountBiByeLlista(m,actor,now):
    machine==='so-fist-ication'?mountSoFistication(room,m,actor,now):mountFightFlight(room,m,actor,now);
  if(!ok){room[def.field]=null;room.players.delete(actor.id);return {rejected:'The operator could not board this actual machine safely.'};}
  room[revision]=revisionNo;
  actor.siegeAi={seed:revisionNo,decisions:0,nextThinkAt:now,side:revisionNo%2?1:-1,
    lastSampleAt:now,lastPosition:{x:m.x,y:m.y,z:m.z},stuckUntil:0,now,
    lastShotIAt:-Infinity,lastVolleyAt:-Infinity,nextRamAt:now,nextDiveAt:now,phase:'mounted'};
  room.events.push({type:'practiceSiegeOpponentSpawned',playerId:actor.id,machineId:m.id,
    machine,difficulty,name:def.name,at:now});
  return {};
}
function flightPlacement(room,human){
  const at=human.position,origYaw=human.yaw??0;
  for(const distance of [10,14,18,22,8])for(const delta of [0,.8,-.8,1.6,-1.6,Math.PI]){
    const angle=origYaw+delta,x=at.x-Math.sin(angle)*distance,z=at.z-Math.cos(angle)*distance;
    const y=surfaceHeightAt(x,z,at.y+2,room.world);if(y==null||Math.abs(y-at.y)>1.7)continue;
    const pose={x,y,z},heading=bearing(pose,at);
    if(!fightFlightConstructionClear(room,pose,human.id))continue;
    const m=createFightFlight({...pose,heading});
    if(!fightFlightExit(room,m,human))continue;
    return m;
  }
  return null;
}
export function removePracticeSiegeOperator(room,requester,machine='all',now=0){
  if(room?.mode!=='PRACTICE'||requester?.actorKind!=='human'||room.players.get(requester.id)!==requester)
    return {rejected:'Only Practice players can remove hostile operators.'};
  const bots=[...room.players.values()].filter(p=>p.practiceSiegeOperator&&
    (machine==='all'||p.practiceSiegeOperator.machine===machine));
  if(!bots.length)return {rejected:'No matching hostile siege operator exists.'};
  for(const actor of bots){
    const def=SIEGE_OPERATORS[actor.practiceSiegeOperator.machine],m=room[def.field];
    if(m?.operatorId===actor.id){
      if(def.field==='biByeLlista')dismountBiByeLlista(m,actor,false);
      if(def.field==='soFistication')dismountSoFistication(room,m,actor,{force:true,at:now});
      if(def.field==='fightFlight')dismountFightFlight(room,m,actor,{force:true,at:now});
    }
    cleanProjectiles(room,actor,m?.id);
    if(m?.id.startsWith('hostile-')&&!m.operatorId){
      m.retired=true;m.mode='DESTROYED';room[def.field]=null;
    }
    room.players.delete(actor.id);
    room.events.push({type:'practiceSiegeOpponentRemoved',playerId:actor.id,machine:def.field,at:now});
  }
  return {};
}
export function resetPracticeSiegeOperator(room,requester,machine,difficulty,now=0){
  const found=[...room.players.values()].find(p=>p.practiceSiegeOperator?.machine===machine);
  if(!found)return spawnPracticeSiegeOperator(room,requester,machine,difficulty,now);
  const last=found.practiceSiegeOperator.difficulty;
  const removed=removePracticeSiegeOperator(room,requester,machine,now);
  if(removed.rejected)return removed;
  return spawnPracticeSiegeOperator(room,requester,machine,difficulty??last,now);
}
function ballistefan(room,a,m,target,ai,tuning,now){
  const at={x:m.x,y:m.y,z:m.z},d=dist(at,target.position);
  const los=!blocked(room,at,target.position);
  const desired=aimInput(at,target,ai,tuning,48);
  if(m.mode==='MOBILE'){
    const wheel=drive(room,m,target,ai,tuning,{ideal:tuning.preferred,deadZone:3});
    a.input={...a.input,...wheel,yaw:desired.yaw,pitch:desired.pitch,siegeTarget:{...desired.point,y:desired.point.y+1.15}};
    if(d>9&&d<42&&Math.abs(wheel.err)<.4&&los&&Math.abs(m.speed??0)<.3)
      toggleBiByeDeploy(m,now,room.world);
  }else{
    a.input={...a.input,forward:0,right:0,sprint:false,yaw:desired.yaw,
      pitch:desired.pitch,siegeTarget:{...desired.point,y:desired.point.y+1.15}};
    if(m.mode==='DEPLOYED'&&(!los||d<7||d>47))toggleBiByeDeploy(m,now,room.world);
  }
  if(!los||m.mode==='DESTROYED'||m.mode==='DEPLOYING'||m.mode==='RETRACTING')return;
  const isAligned=Math.abs(difference(desired.yaw,m.mainYaw??m.heading))<.2;
  // Deployed and aligned at close range, conduct a *real* coupled volley.
  // Tracking may require repeated deliberate input until the latch engages;
  // never prime the independent Skill in the middle of that preparation.
  if(m.mode==='DEPLOYED'&&m.mainBoltLoaded&&m.skill?.phase==='idle'&&
    isAligned&&(m.pendingVolley||(!ai.lastVolleyAt&&d<17))){
    setBiByeWeaponFocus(m,'MAIN',now);
    if(fireBiByeFullVolley(room,m,now))ai.lastVolleyAt=now;
    return;
  }
  // Otherwise the upper bolt conditions the target ahead of the separately
  // primed heavy Skill's authentic release catch.
  if(m.mainBoltLoaded&&m.skill?.phase==='idle'&&d<55&&isAligned)
    requestBiByeHeavySkill(room,m,a,now,biByeTargetAim);
  if(m.skill?.phase==='primed'){
    if(now>=(m.smallBoltReadyAt??0)&&m.mobileShotPendingAt==null&&!m.pendingIndependent){
      setBiByeWeaponFocus(m,'UPPER',now);
      if(fireBiByeMobile(room,m,now))ai.lastShotIAt=now;
    }
    if(now-ai.lastShotIAt>.26&&isAligned&&m.mainBoltLoaded&&
      m.mobileShotPendingAt==null&&now>=(m.mainSkillUntil??0))
      requestBiByeHeavySkill(room,m,a,now,biByeTargetAim);
  }else if(m.mode==='DEPLOYED'&&m.mainBoltLoaded&&m.skill?.phase==='idle'&&
    m.coupling==='INDEPENDENT'&&isAligned&&now-ai.lastVolleyAt>4){
    setBiByeWeaponFocus(m,'MAIN',now);
    if(fireBiByeFullVolley(room,m,now))ai.lastVolleyAt=now;
  }else if(now>=(m.smallBoltReadyAt??0)&&m.mobileShotPendingAt==null&&
    m.skill?.phase==='idle'&&Math.abs(difference(desired.yaw,m.upperYaw??m.heading))<.25){
    setBiByeWeaponFocus(m,'UPPER',now);
    if(fireBiByeMobile(room,m,now))ai.lastShotIAt=now;
  }
}
function uppercuff(room,a,m,target,ai,tuning,now){
  const d=dist({x:m.x,z:m.z},target.position);
  const approach=drive(room,m,target,ai,tuning,{ideal:2.8,deadZone:1.2,reverse:true});
  // Commit an actual approach *through* the piston release window. Retreat
  // only after the fist has passed its physical contact point, not as the
  // machine begins the windup (which previously pulled every clean hit away).
  if(m.strikeAt!=null&&now-m.strikeAt<1.1){
    approach.forward=.82;approach.right=clamp(-approach.err*.42,-.5,.5);
  }else if(d<3.8){
    approach.forward=-.8;approach.right=clamp(-approach.err*.5,-1,1);
  }
  const forwardFacing=Math.abs(approach.err)<.5;
  a.input={...a.input,forward:approach.forward,right:approach.right,
    sprint:forwardFacing&&d>5&&d<22&&m.pressure>28&&m.components?.Drive?.health>0,
    yaw:m.heading,pitch:0};
  // Beat to the Punch is a deliberate counterattack stance, not a permanent
  // prime that prevents ordinary piston attacks from ever being released.
  const visibleThreat=Boolean(target.attackActive||target.pendingSpell||
    (target.dashUntil??-Infinity)>now);
  if(forwardFacing&&d<11&&visibleThreat&&m.skill?.phase==='idle'&&
    m.components?.Fist?.health>0&&m.components?.Drive?.health>0)
    primeSoFistSkill(room,m,a,now);
  if(forwardFacing&&d>=2.1&&d<6.2&&now>=ai.nextRamAt&&
    (m.strikeAt==null||now-m.strikeAt>=3.95)){
    if(fireSoFistication(room,m,now))ai.nextRamAt=now+3.95;
  }
}
function donte(room,a,m,target,ai,tuning,now){
  const at={x:m.x,y:m.y,z:m.z},d=dist(at,target.position);
  const aim=aimInput(at,target,ai,tuning,64);
  const charge=m.flightCharge??0;
  // An offensive run must descend into actual blade altitude: hovering five
  // metres above a grounded foe makes the beautiful rotor tactically useless.
  const attackPass=ai.difficulty==='formidable'&&!m.grounded&&m.rotorHP>0&&
    charge>37&&d>3&&d<17;
  const desiredHeight=attackPass?target.position.y+.1:
    target.position.y+(d<6?2.0:5.4);
  // Real helm authority is bounded by the flight physics turn rate.
  const heading=bearing(at,aim.point);
  const climb=m.grounded?charge>22:charge>18&&m.y<desiredHeight-.8;
  const descend=!m.grounded&&(m.y>desiredHeight+1.5||charge<17);
  // Offensive passes, not stationary hovering at a single point.
  const advance=d>5?1:d<2.1?-.6:.45;
  const flank=d<13?ai.side*.4:0;
  a.input={...a.input,forward:advance,right:flank,yaw:heading,
    pitch:clamp(Math.atan2(aim.point.y+1.1-(m.y+1.098),Math.max(1,d)),-.35,.35),
    jump:climb,crouch:descend,sprint:false};
  if(m.ammo<4&&m.skill?.phase==='idle'&&d<32)requestFightFlightSkill(room,m,a,now);
  // While Sword is committed, the real weapon gate controls the repeater;
  // its requested trigger is a hold, never additional client-like damage.
  requestFightFlightFire(room,m,a,d<42&&!blocked(room,at,target.position),now);
  const close=d<2.5&&Math.abs(m.y-target.position.y)<2.7;
  if(close&&!a.attackHeld&&now>=(a.attackRestartAt??0)){
    // Ordinary mounted sword collision is resolved by standard combat step.
    // Chivalry retains its normal concurrency permission.
    beginAttack(room,a.id,now);
  }else if(a.attackHeld)endAttack(room,a.id,now);
  if(attackPass&&m.y<=target.position.y+1.3&&d>5&&
    Math.abs(difference(heading,m.heading))<.25&&!m.offensiveRun)
    requestFlightDash(room,m,a,true,now);
  if(m.offensiveRun&& (charge<24||d<3))requestFlightDash(room,m,a,false,now);
  if(ai.difficulty==='formidable'&&!m.grounded&&a.ultimate==='chivalry'&&
    a.prowess>=100&&!a.ultimateState&&d<15&&m.rotorHP>0){
    requestFlightDash(room,m,a,true,now);
    setFlightUltimateHold(room,m,a,true,now);
  }
}
/** Call before stepRoom, for both LocalHost and network authority. */
export function stepPracticeSiegeOperators(room,now,world=room.world){
  if(room.mode!=='PRACTICE'||room.state!=='PLAYING')return;
  for(const a of room.players.values()){
    if(!a.alive||!a.practiceSiegeOperator||room.inspectionFrozenActors?.has(a.id))continue;
    const {machine,difficulty}=a.practiceSiegeOperator,def=SIEGE_OPERATORS[machine];
    const m=room[def.field],ai=a.siegeAi;
    if(!ai)continue;
    if(noOperation(room,a,now)){
      // Wrecked or dismounted: use existing foot Spellblade controller next tick.
      if(ai.phase!=='foot'){ai.phase='foot';room.events.push({type:'practiceSiegePilotOnFoot',playerId:a.id,at:now});}
      continue;
    }
    if(ai.phase!=='mounted')ai.phase='mounted';
    ai.now=now;ai.difficulty=difficulty;
    const target=enemy(room,a);
    if(!target){
      a.input={...a.input,forward:0,right:0,jump:false,crouch:false,sprint:false,attack:false};
      if(machine==='fight-and-flight')requestFightFlightFire(room,m,a,false,now);
      continue;
    }
    if(now+1e-8<ai.nextThinkAt)continue;
    const tuning=SIEGE_DIFFICULTIES[difficulty];
    ai.nextThinkAt=now+tuning.reaction;ai.decisions++;
    if(machine==='bi-bye-llista')ballistefan(room,a,m,target,ai,tuning,now);
    else if(machine==='so-fist-ication')uppercuff(room,a,m,target,ai,tuning,now);
    else donte(room,a,m,target,ai,tuning,now);
  }
}
