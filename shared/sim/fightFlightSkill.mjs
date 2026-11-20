// Authoritative machine Skill state. Equipment is personal; cooldowns,
// flight charge, ammunition and other shared resources belong to the machine.
import {selectedSiegeSkill} from '../src/siegeLoadout.mjs';
import {updateNarrowTracking} from './fightFlightTracking.mjs';
export const FIRE_AWAY=Object.freeze({
  id:'fireAwayImRightHere',name:"Fire Away? I'm Right Here.",duration:null,cooldown:24,
  boltCharge:1.5,requiredRPM:450,rpmTolerance:.5,
});
export const NARROW_TO_ONE=Object.freeze({id:'narrowToOne',name:'Narrow to One',duration:null,cooldown:24});
export const ASCENSION=Object.freeze({id:'doNotStopMyAscension',name:'Do Not Stop My Ascension!',duration:null,cooldown:24});
const SKILLS=Object.freeze({fireAwayRightHere:FIRE_AWAY,narrowToOne:NARROW_TO_ONE,doNotStopMyAscension:ASCENSION});
export const equippedFightFlightSkill=p=>SKILLS[selectedSiegeSkill(p,'fightFlight')]??FIRE_AWAY;
export function fightFlightSkillActive(m,now,id=FIRE_AWAY.id){
  if(!m||m.retired||m.mode==='DESTROYED'||m.skill?.phase!=='active'||
    (m.skill.id??FIRE_AWAY.id)!==id)return false;
  return m.skill.activeUntil==null||now+1e-8<m.skill.activeUntil;
}
export function requestFightFlightSkill(room,m,p,now,aim=null){
  const chosen=equippedFightFlightSkill(p);
  if(!m||!p?.alive||p.connected===false||m.health<=0||m.retired||m.mode==='DESTROYED'||
    m.operatorId!==p.id||p.operatingFightFlightId!==m.id||room.players.get(p.id)!==p||
    (room.mode!=='PRACTICE'&&room.state!=='PLAYING'))
    return chosen===FIRE_AWAY?'Operate Fight-and-Flight to use Fire Away.':'Operate Fight-and-Flight to use '+chosen.name+'.';
  if(m.skill?.phase==='active'){
    if(chosen===NARROW_TO_ONE&&m.skill.id===NARROW_TO_ONE.id){
      // During soft acquisition the Skill stays on while gaze chooses a
      // candidate. Pressing Skill twice must never fabricate a lock.
      if(!m.skill.lockedOnce){updateNarrowTracking(room,m,p,now);return null;}
      // Keep the deliberate grounded retarget from the original skill: a
      // locked airborne target cannot be silently replaced by camera aim.
      updateNarrowTracking(room,m,p,now);
      if(m.grounded&&now>=(m.skill.retargetReadyAt??Infinity)){
        m.skill.lockedOnce=false;m.skill.targetId=null;
        m.skill.lastPreviewId=null;m.skill.pendingTargetId=null;
        m.skill.pendingSince=null;
        updateNarrowTracking(room,m,p,now,aim);
        return null;
      }
    }
    return chosen===FIRE_AWAY?'Fire Away is already active.':chosen.name+' is already active.';
  }
  if(now+1e-8<(m.skill?.readyAt??0))return chosen===FIRE_AWAY?'Fire Away is recovering.':chosen.name+' is recovering.';
  if(chosen===FIRE_AWAY){
    if(m.rotorHP<=0||(m.rotorRPM??0)<FIRE_AWAY.requiredRPM-FIRE_AWAY.rpmTolerance)
      return 'Fire Away requires an intact rotor at 450 RPM.';
    if(!(m.flightCharge>0))return 'Fire Away requires flight charge.';
  }
  const old=m.skill??{};
  m.skill={...old,id:chosen.id,phase:'active',
    readyAt:chosen===NARROW_TO_ONE?now:now+chosen.cooldown,
    activeUntil:chosen.duration==null?null:now+chosen.duration,startedAt:now,
    borrowed:0,targetId:null,lockedOnce:false,targetVisible:false,targetInTraverse:false,noClearShot:false,
    trackingState:chosen===NARROW_TO_ONE?'acquiring':null,
    lastPreviewId:null,pendingTargetId:null,pendingSince:null,
    wasGrounded:Boolean(m.grounded),retargetReadyAt:Infinity};
  if(chosen===NARROW_TO_ONE)updateNarrowTracking(room,m,p,now,aim);
  room.events.push({type:'siegeSkill',machineId:m.id,skill:chosen.id,
    action:'activated',at:now,until:m.skill.activeUntil});
  return null;
}
export function stepFightFlightSkill(room,m,now){
  if(!m||m.skill?.phase!=='active')return;
  const op=m.operatorId?room.players.get(m.operatorId):null;
  if(m.mode==='DESTROYED'||m.retired||!op?.alive||op.operatingFightFlightId!==m.id){
    endFightFlightSkill(room,m,now,'interrupted');return;
  }
  if(m.skill.id===NARROW_TO_ONE.id){
    const state=updateNarrowTracking(room,m,op,now);
    if(state?.invalid)endFightFlightSkill(room,m,now,state.reason);
    return;
  }
  if(m.skill.id===ASCENSION.id)return; // A real bolt release ends this, not elapsed time.
  if(m.skill.id===FIRE_AWAY.id){
    if(m.rotorHP<=0||(m.rotorRPM??0)<FIRE_AWAY.requiredRPM-FIRE_AWAY.rpmTolerance){
      endFightFlightSkill(room,m,now,'rotorLost');return;
    }
    // Residual power below one bolt cannot fund another attack: exhaust it.
    if((m.flightCharge??0)+1e-8<FIRE_AWAY.boltCharge){
      m.flightCharge=0;endFightFlightSkill(room,m,now,'exhausted');
    }
    return;
  }
  if(now+1e-8>=(m.skill.activeUntil??0))endFightFlightSkill(room,m,now);
}
export function endFightFlightSkill(room,m,now,reason='expired'){
  if(!m||m.skill?.phase!=='active')return false;
  const skill=m.skill.id;
  m.skill.phase='idle';m.skill.activeUntil=0;m.skill.targetId=null;
  m.skill.lockedOnce=false;m.skill.lastPreviewId=null;
  m.skill.pendingTargetId=null;m.skill.pendingSince=null;
  // A sustained lock must never have completed its cooldown before it ends.
  if(skill===NARROW_TO_ONE.id)m.skill.readyAt=now+NARROW_TO_ONE.cooldown;
  if(skill===FIRE_AWAY.id){
    // No debt, reserve or fractional production carries past the charge-fed barrage.
    m.ammo=0;m.ammoProduction=0;
  }
  m.skill.targetVisible=false;m.skill.targetInTraverse=false;m.skill.noClearShot=false;m.skill.trackingState=null;
  room.events.push({type:'siegeSkill',machineId:m.id,skill,
    action:reason,at:now,borrowed:m.skill.borrowed??0,ammoDebt:m.ammoDebt??0});
  return true;
}
export function fightFlightBarrageFiring(m,now){
  return fightFlightSkillActive(m,now,FIRE_AWAY.id)&&
    (Boolean(m.firingOperatorId)||now-(m.lastShotAt??-Infinity)<.16);
}
export function fightFlightHoverSupport(m,now,{climbing=false,descending=false}={}){
  // Only Fire Away offsets level hover power, never climb.
  return fightFlightSkillActive(m,now,FIRE_AWAY.id)&&m.operatorId&&
    !fightFlightBarrageFiring(m,now)&& // Do not gain a free hover tick by feathering Fire between bolts.
    !m.grounded&&!climbing&&!descending&&m.rotorHP>0&&m.flightCharge>0;
}
