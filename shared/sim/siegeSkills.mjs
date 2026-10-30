// Authoritative, machine-owned Skill clocks. Priming is not the same as spending.
export const SIEGE_SKILLS=Object.freeze({
 boltToTheOccasion:Object.freeze({cooldown:24,interShotPrep:.2}),
 beatToThePunch:Object.freeze({
  cooldown:24,chassisTrigger:35,reverseSpeed:8,reverseDebt:1.5,
  initialHazard:.0025,growthRate:.0012,shudder:.008,shudderGrowth:.00055,maxShudder:.032,
 }),
});
export const createSiegeSkill=id=>({id,readyAt:0,phase:'idle',expiresAt:null,debt:0,primedAt:null});
export function skillOperator(room,b,p,now){return Boolean(b&&!b.retired&&b.health>0&&p?.alive&&p.connected!==false&&b.operatorId===p.id&&(p.operatingRamId===b.id||p.operatingBallistaId===b.id)&&(p.staggerUntil??0)<=now&&(room.mode==='PRACTICE'||room.state==='PLAYING'));}
export function primeSiegeSkill(b,now){
 const s=b?.skill;if(!s||s.phase!=='idle'||now+1e-8<s.readyAt)return false;
 s.phase='primed';s.primedAt=now;s.expiresAt=null;s.debt=0;return true;
}
export function commitSiegeSkill(b,now){
 const s=b?.skill;if(!s||s.phase!=='primed')return false;
 s.readyAt=now+SIEGE_SKILLS[s.id].cooldown+(s.debt??0);s.phase='releasing';return true;
}
// Ram priming consumes its opportunity when resolved. Ballista aiming does NOT
// spend an opportunity unless the operator has deliberately committed Bolt II.
export function endSiegeSkill(b,now=b?.poseTime??b?.skill?.primedAt??0){
 const s=b?.skill;if(!s)return;
 if(s.phase==='primed'&&s.id==='beatToThePunch')
  s.readyAt=Math.max(s.readyAt,Math.max(now,s.primedAt??now)+SIEGE_SKILLS[s.id].cooldown+(s.debt??0));
 s.phase='idle';s.expiresAt=null;s.primedAt=null;s.failureThreshold=null;s.integratedHazard=0;s.boltIReleasedAt=null;
}
// Closed-form integrated continuous-time hazard. Changing the tick rate does
// not change the probability of spontaneous discharge.
export function integratedRamHazard(seconds,config=SIEGE_SKILLS.beatToThePunch){
 const t=Math.max(0,seconds);return config.initialHazard*t+.5*config.growthRate*t*t;
}
export function sampleRamFailure(room){
 // Room currently uses Math.random for authoritative randomization. The
 // optional injected source makes deterministic server tests possible.
 const value=room?.siegeSkillRandom?.()??Math.random();
 const u=Math.max(0,Math.min(1-Number.EPSILON,Number.isFinite(value)?value:0));
 return -Math.log1p(-u);
}
export function skillEvent(room,b,now,action,extra={}){room.events.push({type:'siegeSkill',machineId:b.id,skill:b.skill.id,action,at:now,...extra});}
