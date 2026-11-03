import { siegeSkillControlLabel } from './siegeSkillView.mjs';
import { SIEGE_SKILLS } from '../../shared/sim/siegeSkills.mjs';

// Action labels and icons describe the destination mode, from the authoritative
// snapshot. A tap never optimistically changes the presentation.
export function biByeModeButton(b){
 switch(b?.mode){
  case 'MOBILE': return {label:'HEAVY',icon:'boltII',disabled:false};
  case 'DEPLOYED': return {label:'MOBILE',icon:'ballistaWheel',disabled:false};
  case 'DEPLOYING': return {label:'DEPLOYING',icon:'boltII',disabled:true};
  case 'RETRACTING': return {label:'PACKING',icon:'ballistaWheel',disabled:true};
  default: return {label:'HEAVY',icon:'boltII',disabled:true};
 }
}

// One button: bolted wheel while priming, standalone heavy bolt when ready or
// releasing. Cold, How Touching retains its separate frost emblem.
export function biByeSkillIcon(b,now){
 if(b?.skill?.id==='coldHowTouching')return 'frostBolt';
 const label=siegeSkillControlLabel(b,now);
 return label==='FIRE II'||label==='II RELEASING'?'boltII':'boltToTheOccasion';
}

// Mirrors the authoritative atomic BOTH command's gating without modifying the
// network command, projectile order or physical weapon clocks.
export function biByeCombinedReady(b,now){
 if(b?.skill?.id!=='boltToTheOccasion'||b.skill.phase!=='primed'||
   b.mainBoltLoaded===false||b.state!=='LOADED'||b.heavySkill||
   b.upperPending||b.upperQueued||b.pendingIndependent||
   b.mobileShotPendingAt!=null||b.combinedUpperPendingAt!=null||
   (b.coupling&&b.coupling!=='INDEPENDENT'))return false;
 if(b.smallBoltReady===false||now+1e-8<(b.smallBoltReadyAt??0))return false;
 const lastI=b.skill.boltIReleasedAt??-Infinity;
 return now+1e-8>=lastI+SIEGE_SKILLS.boltToTheOccasion.interShotPrep;
}
