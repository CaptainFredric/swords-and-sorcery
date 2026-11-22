// Practice's machine pilots: actual server actors operating the ordinary siege
// machinery. Decision quality varies, never damage, ammunition or cooldowns.
import {createBiByeLlista,mountBiByeLlista,dismountBiByeLlista,toggleBiByeDeploy,
  fireBiByeMobile,fireBiByeFullVolley,biByeTargetAim} from './biByeLlista.mjs';
import {requestBiByeHeavySkill,requestColdHowTouching,setBiByeWeaponFocus} from './biByeWeapons.mjs';
import {requestBiByeSharpTurn,requestLookAroundAndFindOut,requestBiByeSweepStop} from './biByeSweep.mjs';
import {createSoFistication,mountSoFistication,dismountSoFistication,soFistExit,
  soFistEntry,primeSoFistSkill,fireSoFistication} from './soFistication.mjs';
import {createFightFlight,mountFightFlight,dismountFightFlight,fightFlightExit} from './fightFlight.mjs';
import {fightFlightConstructionClear} from './practiceFightFlight.mjs';
import {requestFightFlightFire,flightMuzzle} from './fightFlightWeapons.mjs';
import {flightRepeaterAim,FLIGHT_REPEATER} from '../src/flightRepeaterAim.mjs';
import {requestFightFlightSkill,endFightFlightSkill} from './fightFlightSkill.mjs';
import {requestFlightDash} from './fightFlightRun.mjs';
import {setFlightUltimateHold} from './fightFlightTerminal.mjs';
import {practiceHostileSiegePlacement} from './practiceSiege.mjs';
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {wayToward} from './botNav.mjs';
import {beginAttack,endAttack,tryCastSpell} from './combat.mjs';
import {machineSteelParts} from './siegeSteel.mjs';
import {SIEGE_LOADOUT_DEFAULT,SIEGE_SKILL_OPTIONS,normalizeSiegeLoadout} from '../src/siegeLoadout.mjs';

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
// A Sharp Turn belongs to every ballista, independent of equipped Skills.
const SLOT=Object.freeze({'bi-bye-llista':'biBye','so-fist-ication':'soFist','fight-and-flight':'fightFlight'});
export const PRACTICE_SIEGE_SKILL_CHOICES=Object.freeze(Object.fromEntries(
  Object.entries(SLOT).map(([machine,slot])=>[machine,Object.freeze([
    'auto',...SIEGE_SKILL_OPTIONS[slot],
  ])])));
export function practiceOperatorSkill(machine,choice='auto'){
  if(!PRACTICE_SIEGE_SKILL_CHOICES[machine]?.includes(choice))return null;
  return choice==='auto'
    ?SIEGE_LOADOUT_DEFAULT[SLOT[machine]]:choice;
}
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
/** Skilled pilots use the identical Sheathe in Steel spell and its normal
 * 18s cooldown. The vehicle's linked, finite repair budget is untouched.
 * Choose the moment based on actual damaged parts or approaching fire, and
 * do not cast on an intact idle chassis merely to farm infinite repair. */
export function considerOperatorSteel(room,a,m,kind,foe,now){
  const diff=a.practiceSiegeOperator?.difficulty??a.siegeAi?.difficulty??'skilled';
  if(diff==='learner'||a.spell!=='steel'||
    !m||m.operatorId!==a.id||now<(a.spellReadyAt??0)||
    now<(a.siegeAi?.nextSteelAt??0)||
    m.siegeSteel&&m.siegeSteel.state!=='expired'&&now<(m.siegeSteel.protectionUntil??Infinity))
    return false;
  const parts=machineSteelParts(m,kind);
  const missing=parts.reduce((sum,p)=>sum+Math.max(0,p.maxHealth-p.health),0);
  const critical=parts.some(p=>p.health>0&&p.health/p.maxHealth<.65);
  const approaching=Boolean(foe&&dist({x:m.x,z:m.z},foe.position)<(
    kind==='flight'?16:kind==='ram'?9:30));
  const endangered=approaching&&(
    m.health/(m.maxHealth??m.health)<.88||
    parts.some(p=>p.health>0&&p.health/p.maxHealth<.85));
  // A damaged but quiet carriage can repair before heading back into combat.
  // A threatened intact carriage may pre-cast only if an actual attack is
  // underway: proactive mitigation, not free resource generation.
  const anticipated=approaching&&Boolean(foe.attackActive||foe.pendingSpell||
    foe.operatingBallistaId||foe.operatingRamId||foe.operatingFightFlightId);
  if(missing<8&&!critical&&!endangered&&!anticipated)return false;
  const used=tryCastSpell(room,a.id,{x:0,y:0,z:-1},now);
  if(a.siegeAi) a.siegeAi.nextSteelAt=now+(used?1:1.5);
  return used;
}
function noOperation(room,actor,now){
  const name=actor.practiceSiegeOperator?.machine,def=SIEGE_OPERATORS[name],m=room[def?.field];
  return !m||m.retired||m.mode==='DESTROYED'||m.health<=0||m.operatorId!==actor.id||!mounted(actor);
}
function cleanProjectiles(room,actor,machineId){
  for(const pool of [room.projectiles,room.bibyeProjectiles,room.fightFlightProjectiles])
    for(const [id,q] of pool??[])if(q.ownerId===actor.id||q.machineId===machineId||q.ballistaId===machineId)pool.delete(id);
}
/** A top-tier Practice Spellblade can appropriate an EXISTING, empty machine
 * when doing so is tactically useful. No duplicate chassis, free remote mount,
 * skill cooldown, health, damage, or ammo change. The real formidable pilot
 * will navigate to its ordinary seat and operate it next ticks.
 */
export function seekSpellbladeSiegeMachine(room,actor,now){
  if(room?.mode!=='PRACTICE'||actor?.practiceMode!=='SPELLBLADE'||
     !actor.alive)return false;
  if(actor.practiceSiegeOperator){
    const old=SIEGE_OPERATORS[actor.practiceSiegeOperator.machine];
    const m=room[old?.field];
    if(m&&!m.retired&&m.health>0&&m.mode!=='DESTROYED'&&
       (!m.operatorId||m.operatorId===actor.id))return true;
    actor.practiceSiegeOperator=null;actor.siegeAi=null;
    actor.ai=null;
  }
  if(now<(actor.nextSiegeDecisionAt??-Infinity))return false;
  actor.nextSiegeDecisionAt=now+1.75;
  if(mounted(actor)||actor.ultimateState)return false;
  const foe=enemy(room,actor);
  if(!foe||dist(actor.position,foe.position)<4)return false;
  const candidates=[];
  for(const [machine,def] of Object.entries(SIEGE_OPERATORS)){
    const m=room[def.field];
    if(!m||m.operatorId||m.retired||m.mode==='DESTROYED'||m.health<=0||
       (m.team&&m.team!==actor.team))continue;
    if(machine==='fight-and-flight'&&(!m.grounded||m.rotorHP<=0||m.terminalDive))continue;
    if(machine==='so-fist-ication'&&(m.components?.Drive?.health??0)<=0)continue;
    const here={x:m.x,y:m.y,z:m.z};
    const distance=dist(actor.position,here);
    if(distance>17||dist(foe.position,here)>43)continue;
    // Do not claim a machine a nearby human could be about to mount.
    if([...room.players.values()].some(p=>p.actorKind==='human'&&p.alive&&
       dist(p.position,here)<2.7))continue;
    candidates.push({machine,m,score:distance+(machine==='fight-and-flight'?-2:0)});
  }
  if(!candidates.length)return false;
  candidates.sort((a,b)=>a.score-b.score);
  const {machine,m}=candidates[0];
  actor.practiceSiegeOperator={machine,difficulty:'formidable',opportunistic:true};
  actor.siegeAi={seed:Math.floor(now*30)%2147483647,decisions:0,nextThinkAt:now,
    side:1,lastSampleAt:now,lastPosition:{x:m.x,y:m.y,z:m.z},
    stuckUntil:0,now,lastShotIAt:-Infinity,lastVolleyAt:-Infinity,
    nextRamAt:now,nextDiveAt:now,phase:'remount'};
  actor.ai=null;
  room.events.push({type:'spellbladeSiegeIntent',playerId:actor.id,
    machine,machineId:m.id,at:now});
  return true;
}
/** Plan first. Reject occupied authoritative machines rather than making copies. */
export function spawnPracticeSiegeOperator(room,requester,machine,difficulty='skilled',now=0,skill='auto'){
  const def=SIEGE_OPERATORS[machine],tuning=SIEGE_DIFFICULTIES[difficulty];
  const equipped=practiceOperatorSkill(machine,skill);
  if(room?.mode!=='PRACTICE'||room.state!=='PLAYING'||!requester?.alive||
    requester.actorKind!=='human'||room.players.get(requester.id)!==requester)
    return {rejected:'Only a living Practice player can summon hostile operators.'};
  if(!def||!tuning)return {rejected:'Choose a siege opponent and difficulty.'};
  if(!equipped)return {rejected:'Choose a valid Skill for the selected siege machine.'};
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
  const actor=room.addServerActor({id,name:def.name,actorKind:'bot',
    spell:difficulty==='learner'?'fireball':'steel',
    ultimate:machine==='fight-and-flight'?'chivalry':'sunder'},now);
  actor.botSkill=tuning.skill;actor.botProfile='melee';
  actor.siegeLoadout=normalizeSiegeLoadout({...actor.siegeLoadout,[SLOT[machine]]:equipped});
  actor.practiceSiegeOperator={machine,difficulty,skill};
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
    machine,difficulty,skill,name:def.name,at:now});
  return {};
}
// Grounded rotor clearance alone does not make a safe vertical launch site.
// Hostile pilots cannot plan around a roof intersecting their first metres of
// powered ascent; do not spawn them trapped below an otherwise clear canopy.
function flightLaunchCorridorClear(room,pose){
  const top=pose.y+2.65+4.5;
  const radius=1.35;
  return (room.world?.solids??[]).every(s=>{
    if(!s?.center||!s?.size)return true;
    const center=s.center,size=s.size,axes=s.axes;
    // An oriented solid's enclosing AABB is conservative for placement only.
    const ext=axis=>axes?axes.reduce((sum,v,i)=>sum+Math.abs(v[axis])*(size[i]??0)/2,0):(size[axis]??0)/2;
    const above=center[1]+ext(1)>=pose.y&&center[1]-ext(1)<=top;
    const horizontal=Math.abs(center[0]-pose.x)<=radius+ext(0)&&
      Math.abs(center[2]-pose.z)<=radius+ext(2);
    return !above||!horizontal;
  });
}
function flightPlacement(room,human){
  const at=human.position,origYaw=human.yaw??0;
  for(const distance of [10,14,18,22,8])for(const delta of [0,.8,-.8,1.6,-1.6,Math.PI]){
    const angle=origYaw+delta,x=at.x-Math.sin(angle)*distance,z=at.z-Math.cos(angle)*distance;
    const y=surfaceHeightAt(x,z,at.y+2,room.world);if(y==null||Math.abs(y-at.y)>1.7)continue;
    const pose={x,y,z},heading=bearing(pose,at);
    if(!fightFlightConstructionClear(room,pose,human.id))continue;
    if(!flightLaunchCorridorClear(room,pose)||blocked(room,pose,human.position))continue;
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
export function resetPracticeSiegeOperator(room,requester,machine,difficulty,now=0,skill=null){
  const found=[...room.players.values()].find(p=>p.practiceSiegeOperator?.machine===machine);
  const previous=found?.practiceSiegeOperator;
  const chosen=skill??previous?.skill??'auto';
  // Reject an invalid loadout BEFORE removing a living machine/pilot.
  if(!practiceOperatorSkill(machine,chosen))return {rejected:'Choose a valid Skill for the selected siege machine.'};
  if(!found)return spawnPracticeSiegeOperator(room,requester,machine,difficulty,now,chosen);
  const last=previous.difficulty;
  const removed=removePracticeSiegeOperator(room,requester,machine,now);
  if(removed.rejected)return removed;
  return spawnPracticeSiegeOperator(room,requester,machine,difficulty??last,now,chosen);
}
function ballistefan(room,a,m,target,ai,tuning,now){
  const at={x:m.x,y:m.y,z:m.z},d=dist(at,target.position);
  const los=!blocked(room,at,target.position);
  const desired=aimInput(at,target,ai,tuning,48);
  // Close threats get the innate sweep; equipping a Skill never replaces it.
  const sweepFocus=m.skill?.id==='lookAroundAndFindOut';
  // Cold is a pre-shot enhancement. A mobile operator may legitimately
  // activate it BEFORE deploying stabilizers; doing it afterward can miss
  // the entire exposure window while the outriggers are moving.
  if(los&&d<43&&
    ['MOBILE','DEPLOYED'].includes(m.mode)&&
    m.skill?.id==='coldHowTouching'&&m.skill.phase==='idle'&&
    now+1e-8>=(m.skill.readyAt??0))
    requestColdHowTouching(room,m,a,now);
  if(m.mode==='MOBILE'){
    const wheel=drive(room,m,target,ai,tuning,{
      ideal:sweepFocus?3.0:tuning.preferred,deadZone:sweepFocus?.5:3});
    a.input={...a.input,...wheel,yaw:desired.yaw,pitch:desired.pitch,siegeTarget:{...desired.point,y:desired.point.y+1.15}};
    if(d>9&&d<42&&Math.abs(wheel.err)<.4&&los&&Math.abs(m.speed??0)<.3)
      toggleBiByeDeploy(m,now,room.world);
  }else{
    a.input={...a.input,forward:0,right:0,sprint:false,yaw:desired.yaw,
      pitch:desired.pitch,siegeTarget:{...desired.point,y:desired.point.y+1.15}};
    if(m.mode==='DEPLOYED'&&(!los||d<7||d>47))toggleBiByeDeploy(m,now,room.world);
  }
  if(m.sweep){
    // A real sustained bow spin needs an ending. Commit the built-in
    // mechanical settle/fire behavior, not an arbitrary instant animation.
    if(m.sweep.kind==='skill'&&m.sweep.phase==='loop'&&
      now-m.sweep.startedAt>2.35)requestBiByeSweepStop(m,now,true);
    return;
  }
  if(!los||m.mode==='DESTROYED'||m.mode==='DEPLOYING'||m.mode==='RETRACTING')return;
  const isAligned=Math.abs(difference(desired.yaw,m.mainYaw??m.heading))<.2;
  const competent=ai.difficulty!=='learner';
  // Equipped Skill receives first refusal in its actual tactical window.
  // Otherwise the ordinary Sharp Turn would always preempt Look Around,
  // effectively making that selected Skill impossible for a capable pilot.
  if(m.skill?.id==='lookAroundAndFindOut'&&
    m.skill.phase==='idle'&&now+1e-8>=(m.skill.readyAt??0)&&
    d<(competent?3.8:2.9)&&now>=(ai.nextSweepAt??0)&&
    (competent||ai.decisions%3===0)){
    const problem=requestLookAroundAndFindOut(room,m,a,now);
    ai.nextSweepAt=now+(problem?1.25:4.5);
    if(!problem)return;
  }
  if(d<=(competent?3.4:2.8)&&
    now>=(ai.nextSweepAt??0)&&m.skill?.phase==='idle'&&
    (competent||ai.decisions%3===0)){
    // A Sharp Turn is available on any equipped ballista. It physically
    // checks its entire bow sweep against terrain and machinery, spends the
    // same four-second heavy gate as a human, and uses real blade hitboxes.
    const problem=requestBiByeSharpTurn(room,m,a,now);
    ai.nextSweepAt=now+(problem?1.15:4.2);
    if(!problem)return;
  }
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
  if(m.skill?.id==='boltToTheOccasion'&&m.mainBoltLoaded&&
    m.skill.phase==='idle'&&d<55&&isAligned)
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
    (m.skill?.phase==='idle'||m.skill?.id==='coldHowTouching'&&m.skill?.phase==='active')&&
    Math.abs(difference(desired.yaw,m.upperYaw??m.heading))<.25){
    setBiByeWeaponFocus(m,'UPPER',now);
    if(fireBiByeMobile(room,m,now))ai.lastShotIAt=now;
  }
}
function uppercuff(room,a,m,target,ai,tuning,now){
  const d=dist({x:m.x,z:m.z},target.position);
  const recoveringFist=m.skill?.id==='longArmToTheJaw'&&
    m.detachedFist?.state==='resting';
  const destination=recoveringFist
    ?{position:m.detachedFist.position,velocity:{}}:target;
  const approach=drive(room,m,destination,ai,tuning,{
    ideal:recoveringFist?1.2:2.8,deadZone:recoveringFist?.45:1.2,
    reverse:!recoveringFist});
  // Commit an actual approach *through* the piston release window. Retreat
  // only after the fist has passed its physical contact point, not as the
  // machine begins the windup (which previously pulled every clean hit away).
  if(m.strikeAt!=null&&now-m.strikeAt<1.1){
    approach.forward=.82;approach.right=clamp(-approach.err*.42,-.5,.5);
  }else if(d<3.8&&!recoveringFist){
    approach.forward=-.8;approach.right=clamp(-approach.err*.5,-1,1);
  }
  const forwardFacing=Math.abs(approach.err)<.5;
  a.input={...a.input,forward:approach.forward,right:approach.right,
    sprint:forwardFacing&&d>5&&d<22&&m.pressure>28&&m.components?.Drive?.health>0,
    yaw:m.heading,pitch:0};
  const chosen=m.skill?.id;
  const ready=now+1e-8>=(m.skill?.readyAt??0);
  const healthy=(m.components?.Fist?.health??0)>0&&
    (m.components?.Drive?.health??0)>0;
  // Beat to the Punch stays a reactive counter, not permanent priming.
  const visibleThreat=Boolean(target.attackActive||target.pendingSpell||
    (target.dashUntil??-Infinity)>now);
  if(chosen==='beatToThePunch'&&forwardFacing&&d<11&&visibleThreat&&
    m.skill?.phase==='idle'&&healthy)
    primeSoFistSkill(room,m,a,now);
  if(chosen==='longArmToTheJaw'&&
    now>=(ai.nextSkillAt??0)){
    // Recover a resting fist by the real pickup rule; never replenish an
    // absent fist merely to let an AI fire its equipped Skill again.
    if(m.detachedFist?.state==='resting'||
      m.fistMounted!==false&&forwardFacing&&d>5.5&&d<18&&ready&&healthy){
      const problem=primeSoFistSkill(room,m,a,now);
      ai.nextSkillAt=now+(problem?.8:3.6);
    }
  }
  if(chosen==='hellpingHand'&&
    forwardFacing&&d<6.2&&healthy&&
    (!m.hellping||m.hellping.phase==='open')&&
    now>=(ai.nextSkillAt??0)&&ready){
    const problem=primeSoFistSkill(room,m,a,now);
    ai.nextSkillAt=now+(problem?.8:.3);
  }
  if(forwardFacing&&d>=2.1&&d<6.2&&now>=ai.nextRamAt&&
    (m.strikeAt==null||now-m.strikeAt>=3.95)){
    if(fireSoFistication(room,m,now))ai.nextRamAt=now+3.95;
  }
}
function donte(room,a,m,target,ai,tuning,now){
  const at={x:m.x,y:m.y,z:m.z},d=dist(at,target.position);
  const charge=m.flightCharge??0,ammo=m.ammo??0;
  const skilled=ai.difficulty!=='learner',formidable=ai.difficulty==='formidable';
  const rotorIntact=m.rotorHP>0;
  const aim=aimInput(at,target,ai,tuning,FLIGHT_REPEATER.speed);
  const heading=bearing(at,aim.point),facing=Math.abs(difference(heading,m.heading??0));
  // Charge is fuel, not a timer to spend indiscriminately. When reserves fall,
  // land and use the actual grounded recharge; do not hover forever on fumes.
  if(skilled&&charge<27)ai.regroupForCharge=true;
  if(ai.regroupForCharge&&charge>=(formidable?72:65))ai.regroupForCharge=false;
  const regroup=Boolean(skilled&&ai.regroupForCharge);
  // Close to sword/rotor reach only for a committed offensive pass. Otherwise
  // keep the repeater clear of melee range, with lateral space to turn.
  const readyDash=skilled&&rotorIntact&&!m.grounded&&!m.offensiveRun&&
    !m.flightDashHeld&&!(m.terminalDive||m.terminalPrep)&&
    charge>55&&(a.prowess??0)>=(formidable?44:70)&&
    d>8&&d<17&&facing<.21&&
    Math.abs(m.y-target.position.y)<2.6&&!regroup&&
    now>=(ai.nextDashAt??0);
  if(readyDash&&requestFlightDash(room,m,a,true,now)){
    ai.dashDownAt=now;
    ai.nextDashAt=now+(formidable?4:7);
  }
  if(m.flightDashHeld&&
    ((!m.terminalPrep&&now-(ai.dashDownAt??now)>.64)||
      now-(ai.dashDownAt??now)>2.4||charge<20||!target.alive)){
    // Ordinary rotor passes release promptly. A genuine Ascension/Chivalry
    // terminal chord may finish its one-second windup before Dash lets go.
    requestFlightDash(room,m,a,false,now);
    ai.dashDownAt=null;
  }
  const attacking=Boolean(m.offensiveRun||m.flightDashHeld);
  const optimalAltitude=clamp(d*.24,1.3,4.5);
  const desiredHeight=attacking?target.position.y+.3:
    regroup?target.position.y:target.position.y+optimalAltitude;
  const climb=rotorIntact&&!regroup&&charge>=(skilled?37:22)&&
    (m.grounded||m.y<desiredHeight-.9);
  const descend=!m.grounded&&(regroup||m.y>desiredHeight+1.15||charge<20);
  const retreat=d<(skilled?5.8:2.1)&&!attacking;
  const steer=regroup?.2:retreat?-.9:d>(skilled?11:5)?1:.25;
  const strafe=skilled&&!attacking&&d<24?ai.side*.48:0;
  const impact={x:aim.point.x,y:aim.point.y+1.05,z:aim.point.z};
  // Aim and collision share the ACTUAL crossbow muzzle and hinge limits.
  // A target outside its 50-degree traverse or 65-degree elevation is not
  // a reason to fire into the sky. Turn the chassis and wait for convergence.
  const solution=flightRepeaterAim(m,{siegeTarget:impact});
  const muzzle=flightMuzzle(m,solution),clear=!blocked(room,muzzle,impact);
  const accurate=solution.missDistance<=
    (formidable?.32:skilled?.45:.7)&&!solution.limited;
  const visible=clear&&d<Math.min(FLIGHT_REPEATER.speed*FLIGHT_REPEATER.lifespan,43)&&
    facing<1.02;
  a.input={...a.input,forward:steer,right:strafe,yaw:heading,
    pitch:clamp(solution.pitch,-1.45,1.45),siegeTarget:impact,
    jump:climb,crouch:descend,sprint:false};
  // Use finite bursts, not a held 7Hz stream. Reserve the last rounds for a
  // genuine close-range shot. Reload/regen already happen on machine ticks.
  const shotSeq=m.shotSeq??0;
  if(ai.burstStartSeq==null)ai.burstStartSeq=shotSeq;
  const maxBurst=formidable?5:skilled?3:8;
  if(shotSeq-ai.burstStartSeq>=maxBurst){
    ai.nextFireAt=now+(formidable?.52:skilled?.78:.18);
    ai.burstStartSeq=shotSeq;
  }
  const canSpend=ammo>=(skilled?3:1)||d<8&&ammo>=1;
  // Fire Away replaces ammunition with real Flight Charge; stop its barrage
  // before it can deprive the pilot of a controlled landing.
  const fireAway=m.skill?.id==='fireAwayImRightHere'&&m.skill.phase==='active';
  if(fireAway&&(charge<38||!visible)){
    endFightFlightSkill(room,m,now,charge<38?'chargeReserve':'lostSight');
  }
  const chosen=m.skill?.id;
  if(m.skill?.phase==='idle'&&
    now+1e-8>=(m.skill.readyAt??0)&&visible&&accurate&&!regroup){
    const want=chosen==='fireAwayImRightHere'
      ?charge>77&&ammo<7&&d>9&&d<29&&!attacking:
      chosen==='narrowToOne'?d>7&&d<34:
      chosen==='doNotStopMyAscension'?d>4&&d<20&&ammo>3&&charge>32:
      false;
    if(want)requestFightFlightSkill(room,m,a,now);
  }
  const skillActive=m.skill?.phase==='active'&&
    m.skill.id==='narrowToOne';
  const blastMode=m.skill?.phase==='active'&&
    m.skill.id==='fireAwayImRightHere';
  const fire=visible&&!regroup&&!attacking&&
    (accurate||skillActive)&&now+1e-8>=(ai.nextFireAt??0)&&
    (blastMode?charge>38:canSpend);
  requestFightFlightFire(room,m,a,fire,now);
  const close=d<2.7&&Math.abs(m.y-target.position.y)<2.5;
  if(close&&!attacking&&!a.attackHeld&&now>=(a.attackRestartAt??0)){
    beginAttack(room,a.id,now);
  }else if(a.attackHeld&&!close)endAttack(room,a.id,now);
  // A pilot does not hold Dash indefinitely or trigger the terminal Ultimate
  // in the middle of a low-charge escape.
  if(formidable&&!regroup&&!m.grounded&&!m.offensiveRun&&
    !m.flightDashHeld&&m.skill?.id==='doNotStopMyAscension'&&
    m.skill.phase==='active'&&a.ultimate==='chivalry'&&a.prowess>=100&&
    !a.ultimateState&&d<13&&charge>70&&rotorIntact&&
    now>=(ai.nextDiveAt??0)){
    if(requestFlightDash(room,m,a,true,now)){
      setFlightUltimateHold(room,m,a,true,now);
      ai.dashDownAt=now;
      ai.nextDiveAt=now+15;
    }
  }
}
/** Hostile Practice pilots return to their ORIGINAL intact machine by
 * walking and using its real mount function. No teleport, privilege bypass,
 * rebuilt chassis, free repair, or appropriation of somebody else's seat. */
function tryHostileRemount(room,a,m,machine,ai,now,world){
 if(!m||m.retired||m.mode==='DESTROYED'||m.health<=0||
   m.operatorId||mounted(a)||m.team&&m.team!==a.team||
   machine==='fight-and-flight'&&(!m.grounded||m.rotorHP<=0||m.terminalDive)||
   machine==='so-fist-ication'&&
     ((m.components?.Drive?.health??0)<=0||
      m.detachedFist?.state==='recovering'||
      (()=>{const failed=['FL','FR','RL','RR'].filter(w=>
        (m.components?.['Wheel_'+w]?.health??0)<=0);
        return failed.length>=3||failed.includes('FL')&&failed.includes('FR')||
          ['L','R'].some(side=>failed.filter(w=>w.endsWith(side)).length>=2);
      })()))
   return false;
 let entry;
 if(machine==='so-fist-ication')entry=soFistEntry(m,world);
 else{
   // Approach the rear of a vehicle, rather than its collision-blocked centre.
   const back=machine==='bi-bye-llista'?2.35:1.55;
   entry={x:m.x+Math.sin(m.heading??0)*back,y:m.y,
     z:m.z+Math.cos(m.heading??0)*back};
   if(machine==='bi-bye-llista'){
     const y=surfaceHeightAt(entry.x,entry.z,m.y+2,world);
     if(y!==null)entry.y=y;
   }
 }
 if(!entry||![entry.x,entry.y,entry.z].every(Number.isFinite))return false;
 const d=dist(a.position,entry);
 if(d<=(machine==='bi-bye-llista'?1.45:1.05)&&
   now>=(ai.nextRemountAt??0)){
   // A human must stop swinging before climbing into the apparatus; so does
   // its hostile operator. Otherwise all the usual mounting gates still apply.
   if(a.attackHeld||a.attackActive)endAttack(room,a.id,now);
   const ok=machine==='bi-bye-llista'?mountBiByeLlista(m,a,now):
     machine==='so-fist-ication'?mountSoFistication(room,m,a,now):
       mountFightFlight(room,m,a,now);
   ai.nextRemountAt=now+.45;
   if(ok){
     ai.phase='mounted';ai.route=null;ai.routeCheckAt=-Infinity;
     ai.nextThinkAt=now;
     room.events.push({type:'practiceSiegePilotRemounted',
       playerId:a.id,machineId:m.id,machine,at:now});
     return true;
   }
 }
 const point=wayToward(world,a,{position:entry},ai,now)??entry;
 const yaw=bearing(a.position,point),distance=dist(a.position,point);
 ai.phase='remount';
 // Use the same ordinary foot-movement input as the player; never directly
 // assign the pilot's position to the machine's seat.
 a.input={...a.input,yaw,pitch:0,forward:distance>.75?1:0,right:0,
   sprint:distance>5,jump:false,crouch:false,attack:false,guard:false};
 return true;
}
/** Call before stepRoom, for both LocalHost and network authority. */
export function stepPracticeSiegeOperators(room,now,world=room.world){
  if(room.mode!=='PRACTICE'||room.state!=='PLAYING')return;
  for(const a of room.players.values()){
    if(!a.alive||!a.practiceSiegeOperator||room.inspectionFrozenActors?.has(a.id))continue;
    const {machine,difficulty}=a.practiceSiegeOperator,def=SIEGE_OPERATORS[machine];
    const m=room[def.field],ai=a.siegeAi;
    if(!ai)continue;
    // Realistic retreat: an intact pilot can abandon a physically unusable
    // machine only via the same supported ground egress as a human. A rotor
    // failure aloft must first complete its genuine fall and landing.
    if(m?.operatorId===a.id&&machine==='fight-and-flight'&&
      m.rotorHP<=0&&m.grounded&&fightFlightExit(room,m,a))
      dismountFightFlight(room,m,a,{at:now});
    if(m?.operatorId===a.id&&machine==='so-fist-ication'){
      const failed=['FL','FR','RL','RR'].filter(w=>
        (m.components?.['Wheel_'+w]?.health??0)<=0);
      // The front pair are the actual steering axle. Losing both front
      // wheels leaves a nominally drivable chassis unable to choose a safe
      // approach angle, so a competent pilot abandons it if egress is real.
      const immobilized=failed.length>=3||
        (failed.includes('FL')&&failed.includes('FR'))||
        ['L','R'].some(side=>failed.filter(w=>w.endsWith(side)).length>=2);
      if(immobilized&&soFistExit(room,m,a))
        dismountSoFistication(room,m,a,{at:now});
    }
    if(noOperation(room,a,now)){
      // An intact unoccupied original machine can be reclaimed through the
      // exact player mount path. Only a truly unusable or occupied machine
      // forces the hostile pilot back into ordinary foot combat.
      if(tryHostileRemount(room,a,m,machine,ai,now,world))continue;
      ai.route=null;ai.routeCheckAt=-Infinity;
      if(ai.phase!=='foot'){ai.phase='foot';room.events.push({type:'practiceSiegePilotOnFoot',playerId:a.id,at:now});}
      continue;
    }
    if(ai.phase!=='mounted')ai.phase='mounted';
    ai.now=now;ai.difficulty=difficulty;
    const target=enemy(room,a);
    if(difficulty!=='learner')
      considerOperatorSteel(room,a,m,def.field==='fightFlight'?'flight':
        def.field==='soFistication'?'ram':'bibye',target,now);
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
