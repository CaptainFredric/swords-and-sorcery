import {SIEGE_SKILLS} from '../../shared/sim/siegeSkills.mjs';

export function siegeSkillControlLabel(b,now){
 const s=b?.skill;if(!s)return 'SKILL';
 // A grounded fist belongs to the apparatus, not the current rider's
 // chosen technique; any operator must be able to collect it.
 if(b.detachedFist?.state==='resting')return 'PICK UP';
 if(b.detachedFist?.state==='abyss')return 'RETURN';
 if(b.detachedFist?.state==='recovering')
  return Math.ceil(Math.max(0,(b.fistRecoveryUntil??now)-now))+'s';
 const remaining=Math.max(0,(s.readyAt??0)-now);
 if(s.id==='lookAroundAndFindOut')return b.sweep?.kind==='skill'?(b.sweep.phase==='settle'?'SETTLING':'CANCEL SPIN'):remaining>0?Math.ceil(remaining)+'s':'SPIN';
  if(s.id==='coldHowTouching')
  return s.phase==='active'?'ACTIVE':remaining>0?`${Math.ceil(remaining)}s`:'ACTIVATE';
 if(s.phase==='releasing')return 'II RELEASING';
 if(s.id==='longArmToTheJaw'){
  if(b.detachedFist?.state==='flying'||b.detachedFist?.state==='falling')return 'IN FLIGHT';
  if(b.detachedFist?.state==='resting')return 'PICK UP';
  if(b.detachedFist?.state==='abyss')return 'RETURN HOME';
  if(b.detachedFist?.state==='recovering')return Math.ceil(Math.max(0,b.fistRecoveryUntil-now))+'s';
  return remaining>0?`${Math.ceil(remaining)}s`:'LAUNCH';
 }
 if(s.id==='hellpingHand'){
  const phase=b.hellping?.phase;
  if(phase==='grasp')return 'CRUSH';
  if(phase==='transport')return 'RELEASE ALLY';
  if(phase==='vault')return 'VAULTING';
  if(phase==='open')return 'GRAB / VAULT / CLOSE';
  return remaining>0?Math.ceil(remaining)+'s':'OPEN HAND';
 }
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
 const name=s.id==='hellpingHand'?'HELLping Hand':
  s.id==='longArmToTheJaw'?'Long Arm to the Jaw':
  s.id==='beatToThePunch'?'Beat to the Punch':
  s.id==='coldHowTouching'?'Cold, How Touching':
  s.id==='lookAroundAndFindOut'?'Look Around and Find Out':'Bolt to the Occasion';
 if(s.id==='coldHowTouching'&&s.phase==='active')return `${name}: ACTIVE · Bolt I proximity frost until Bolt II`;
 if(s.id==='beatToThePunch'&&s.phase==='primed'){
  const t=Math.max(0,now-(s.primedAt??now));
  return `${name}: PRIMED ${t.toFixed(1)}s · instability rising`;
 }
 if(s.phase==='idle'&&now<(s.readyAt??0))return `${name}: ${Math.ceil(s.readyAt-now)}s`;
 return `${name}: ${siegeSkillControlLabel(b,now)}`;
}
