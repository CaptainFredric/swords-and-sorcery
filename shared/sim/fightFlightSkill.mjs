// Fight-and-Flight's MACHINE Skill. Borrowing is a real delivered-quarrel debt,
// while hover stability uses the rotor's existing power model. Not an Ultimate.
export const FIRE_AWAY=Object.freeze({
  id:'fireAwayImRightHere',name:"Fire Away? I'm Right Here.",
  duration:3.5,cooldown:24,
});
export function fightFlightSkillActive(m,now){
  return Boolean(m?.skill?.phase==='active'&&now+1e-8<(m.skill.activeUntil??0)&&!m.retired&&m.mode!=='DESTROYED');
}
export function requestFightFlightSkill(room,m,p,now){
  if(!m||!p?.alive||p.connected===false||m.health<=0||m.retired||m.mode==='DESTROYED'||
    m.operatorId!==p.id||p.operatingFightFlightId!==m.id||room.players.get(p.id)!==p||
    (room.mode!=='PRACTICE'&&room.state!=='PLAYING'))
    return 'Operate Fight-and-Flight to use Fire Away.';
  if(m.skill?.phase==='active'&&now<(m.skill.activeUntil??0))
    return 'Fire Away is already active.';
  if(now+1e-8<(m.skill?.readyAt??0))
    return 'Fire Away is recovering.';
  const old=m.skill??{};
  m.skill={...old,id:FIRE_AWAY.id,phase:'active',readyAt:now+FIRE_AWAY.cooldown,
    activeUntil:now+FIRE_AWAY.duration,startedAt:now,borrowed:0};
  room.events.push({type:'siegeSkill',machineId:m.id,skill:FIRE_AWAY.id,
    action:'activated',at:now,until:m.skill.activeUntil});
  return null;
}
export function stepFightFlightSkill(room,m,now){
  if(!m||m.skill?.phase!=='active')return;
  if(now+1e-8<(m.skill.activeUntil??0)&&m.mode!=='DESTROYED'&&!m.retired)return;
  endFightFlightSkill(room,m,now);
}
export function endFightFlightSkill(room,m,now,reason='expired'){
  if(!m||m.skill?.phase!=='active')return false;
  m.skill.phase='idle';m.skill.activeUntil=0;
  room.events.push({type:'siegeSkill',machineId:m.id,skill:FIRE_AWAY.id,
    action:reason,at:now,borrowed:m.skill.borrowed??0,ammoDebt:m.ammoDebt??0});
  return true;
}
export function fightFlightHoverSupport(m,now,{climbing=false,descending=false}={}){
  // Holding the repeater trigger elects suppression. Letting go elects hover.
  // The assistance only offsets steady level-flight power, never climb.
  return fightFlightSkillActive(m,now)&&m.operatorId&&!m.firingOperatorId&&
    !m.grounded&&!climbing&&!descending&&m.rotorHP>0&&m.flightCharge>0;
}
