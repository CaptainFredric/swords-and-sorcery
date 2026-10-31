import {SIEGE_SKILLS} from '../../shared/sim/siegeSkills.mjs';

export function siegeSkillControlLabel(b,now){
 const s=b?.skill;if(!s)return 'SKILL';
 const remaining=Math.max(0,(s.readyAt??0)-now);
 if(s.id==='coldHowTouching')
  return s.phase==='active'?'ACTIVE':remaining>0?`${Math.ceil(remaining)}s`:'ACTIVATE';
 if(s.phase==='releasing')return 'II RELEASING';
 if(s.id==='beatToThePunch'){
  if(s.phase==='primed')return 'PRIMED';
  return remaining>0?`${Math.ceil(remaining)}s`:'PRIME';
 }
 if(s.phase==='primed'){
  const afterI=(s.boltIReleasedAt??b.upperReleasedAt);
  if(b.mobileShotPendingAt!=null||b.upperPending||b.pendingIndependent||b.upperQueued||afterI!=null&&now+1e-8<afterI+SIEGE_SKILLS.boltToTheOccasion.interShotPrep||b.coupling==='RELEASING'&&now<(b.couplingEndsAt??0))
   return 'II PREPARING';
  return 'FIRE II';
 }
 return remaining>0?`${Math.ceil(remaining)}s`:'PRIME II';
}
export function siegeSkillLabel(b,now){
 const s=b?.skill;if(!s)return '';
 const name=s.id==='beatToThePunch'?'Beat to the Punch':
  s.id==='coldHowTouching'?'Cold, How Touching':'Bolt to the Occasion';
 if(s.id==='coldHowTouching'&&s.phase==='active')return `${name}: ACTIVE · Bolt I proximity frost until Bolt II`;
 if(s.id==='beatToThePunch'&&s.phase==='primed'){
  const t=Math.max(0,now-(s.primedAt??now));
  return `${name}: PRIMED ${t.toFixed(1)}s · instability rising`;
 }
 if(s.phase==='idle'&&now<(s.readyAt??0))return `${name}: ${Math.ceil(s.readyAt-now)}s`;
 return `${name}: ${siegeSkillControlLabel(b,now)}`;
}
