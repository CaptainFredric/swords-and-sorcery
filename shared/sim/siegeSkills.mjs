// Machine owned clocks only. Ammunition and physical motion stay in each machine.
export const SIEGE_SKILLS=Object.freeze({
 boltToTheOccasion:Object.freeze({cooldown:24,release:.2}),
 beatToThePunch:Object.freeze({cooldown:24,armed:6,chassisTrigger:35,reverseSpeed:8,reverseDebt:1.5,shudder:.012}),
});
export const createSiegeSkill=id=>({id,readyAt:0,phase:'idle',expiresAt:null,debt:0});
export function skillOperator(room,b,p,now){return Boolean(b&&!b.retired&&b.health>0&&p?.alive&&p.connected!==false&&b.operatorId===p.id&&(p.operatingRamId===b.id||p.operatingBallistaId===b.id)&&(p.staggerUntil??0)<=now&&(room.mode==='PRACTICE'||room.state==='PLAYING'));}
export function spendSiegeSkill(b,now,phase,duration){const s=b.skill;if(!s||s.phase!=='idle'||now<s.readyAt)return false;s.readyAt=now+SIEGE_SKILLS[s.id].cooldown;s.phase=phase;s.expiresAt=now+duration;s.debt=0;return true;}
export function endSiegeSkill(b){if(b?.skill){b.skill.phase='idle';b.skill.expiresAt=null;}}
export function skillEvent(room,b,now,action,extra={}){room.events.push({type:'siegeSkill',machineId:b.id,skill:b.skill.id,action,at:now,...extra});}
