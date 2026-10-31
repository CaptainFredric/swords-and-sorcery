// "Fire Away? I'm Right Here." — machine-owned Skill, not personal Ultimate.
// Borrow *actual delivered bolts*, never a projected magazine or an activation fee.
import {SIEGE_SKILLS,skillEvent,endSiegeSkill} from './siegeSkills.mjs';
export const FLIGHT_SKILL_ID='fireAway';
export function flightSkillActive(m,now){
 return Boolean(m?.skill?.phase==='active'&&now<(m.skill.expiresAt??0)&&m.health>0&&m.mode!=='DESTROYED');
}
export function activateFlightSkill(room,m,p,now){
 if(!m||m.retired||m.mode==='DESTROYED'||m.health<=0||!p?.alive||
   room.players.get(p.id)!==p||m.operatorId!==p.id||p.operatingFightFlightId!==m.id)return 'Operate Fight-and-Flight first.';
 const s=m.skill??={id:FLIGHT_SKILL_ID,readyAt:0,phase:'idle'};
 if(s.phase==='active'&&now<s.expiresAt)return 'Fire Away is already active.';
 if(now+1e-8<(s.readyAt??0))return 'Fire Away is still cooling down.';
 s.id=FLIGHT_SKILL_ID;s.phase='active';s.primedAt=now;
 s.expiresAt=now+SIEGE_SKILLS.fireAway.duration;
 s.activeUntil=s.expiresAt;s.readyAt=now+SIEGE_SKILLS.fireAway.cooldown;
 // Never clear outstanding ammoDebt or conjure a free loaded bolt.
 skillEvent(room,m,now,'activated',{expiresAt:s.expiresAt,ammoDebt:m.ammoDebt??0});
 return null;
}
export function stepFlightSkill(room,m,now){
 if(m?.skill?.phase!=='active')return;
 if(now+1e-8<m.skill.expiresAt&&m.mode!=='DESTROYED')return;
 const expiresAt=m.skill.expiresAt;
 endSiegeSkill(m,now);
 m.skill.activeUntil=0;
 skillEvent(room,m,now,'expired',{expiresAt,ammoDebt:m.ammoDebt??0});
}
export function flightSkillHoverRelief(m,now){
 if(!flightSkillActive(m,now)||m.grounded||m.rotorHP<=0)return 0;
 // Support costs are compensated only when *not actually firing*.
 // This never offsets upward acceleration or manufactures free rotor integrity.
 if(now-(m.lastShotAt??-Infinity)<SIEGE_SKILLS.fireAway.shotGrace)return 0;
 return SIEGE_SKILLS.fireAway.hoverOffset;
}
