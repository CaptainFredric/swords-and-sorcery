// Authoritative machine Skill state. Equipment is personal; cooldowns,
// actual repeater debt and shared resources stay with Fight-and-Flight.
import {selectedSiegeSkill} from '../src/siegeLoadout.mjs';
import {PROWESS} from '../src/prowess.mjs';
import {updateNarrowTracking} from './fightFlightTracking.mjs';
export const FIRE_AWAY=Object.freeze({
  id:'fireAwayImRightHere',name:"Fire Away? I'm Right Here.",duration:3.5,cooldown:24,
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
// The terminal Valkyrie sacrifice belongs to Ascension ONLY: it is not a
// hidden bonus of Fire Away or Narrow to One. Require the live, activated Skill
// and intact rotor at every hold tick; no meter/one-use opportunity is spent
// until the complete one-second chord commits.
export function ascensionValkyrieReady(m,p,now){
 return Boolean(m&&!m.retired&&m.health>0&&!m.terminalDive&&!m.terminalDiveSpent&&
   m.rotorHP>0&&m.flightCharge>0&&p?.alive&&p.ultimate==='chivalry'&&
   !p.ultimateState&&(p.prowess??0)>=PROWESS.full&&
   fightFlightSkillActive(m,now,ASCENSION.id));
}
export function requestFightFlightSkill(room,m,p,now){
  const chosen=equippedFightFlightSkill(p);
  if(!m||!p?.alive||p.connected===false||m.health<=0||m.retired||m.mode==='DESTROYED'||
    m.operatorId!==p.id||p.operatingFightFlightId!==m.id||room.players.get(p.id)!==p||
    (room.mode!=='PRACTICE'&&room.state!=='PLAYING'))
    return chosen===FIRE_AWAY?'Operate Fight-and-Flight to use Fire Away.':'Operate Fight-and-Flight to use '+chosen.name+'.';
  if(m.skill?.phase==='active')return chosen===FIRE_AWAY?'Fire Away is already active.':chosen.name+' is already active.';
  if(now+1e-8<(m.skill?.readyAt??0))return chosen===FIRE_AWAY?'Fire Away is recovering.':chosen.name+' is recovering.';
  const old=m.skill??{};
  m.skill={...old,id:chosen.id,phase:'active',readyAt:now+chosen.cooldown,
    activeUntil:chosen.duration==null?null:now+chosen.duration,startedAt:now,
    borrowed:0,targetId:null,lockedOnce:false,targetVisible:false,noClearShot:false,
    trackingState:chosen===NARROW_TO_ONE?'acquiring':null,wasGrounded:Boolean(m.grounded)};
  if(chosen===NARROW_TO_ONE)updateNarrowTracking(room,m,p,now);
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
  if(now+1e-8>=(m.skill.activeUntil??0))endFightFlightSkill(room,m,now);
}
export function endFightFlightSkill(room,m,now,reason='expired'){
  if(!m||m.skill?.phase!=='active')return false;
  const skill=m.skill.id;
  m.skill.phase='idle';m.skill.activeUntil=0;m.skill.targetId=null;
  m.skill.targetVisible=false;m.skill.noClearShot=false;m.skill.trackingState=null;
  room.events.push({type:'siegeSkill',machineId:m.id,skill,
    action:reason,at:now,borrowed:m.skill.borrowed??0,ammoDebt:m.ammoDebt??0});
  return true;
}
export function fightFlightHoverSupport(m,now,{climbing=false,descending=false}={}){
  // Only Fire Away offsets level hover power, never climb.
  return fightFlightSkillActive(m,now)&&m.operatorId&&!m.firingOperatorId&&
    !m.grounded&&!climbing&&!descending&&m.rotorHP>0&&m.flightCharge>0;
}
