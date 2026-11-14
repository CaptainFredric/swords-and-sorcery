import { siegeSkillControlLabel } from './siegeSkillView.mjs';
import { SIEGE_SKILLS } from '../../shared/sim/siegeSkills.mjs';
import { canBiByeCouple } from '../../shared/sim/biByeWeapons.mjs';

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
 if(b?.skill?.id==='lookAroundAndFindOut')return 'siegeSweep';
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

/** A stable right-thumb firing tray: the primary button changes its identity,
 * not its location. "coupled" is the ordinary upper-first volley; "skill"
 * is the distinct primed heavy-first atomic command. */
export function biByeCombatView(b,now){
 if(b?.sweep)return {primary:{label:b.sweep.kind==='skill'?'STOP & FIRE':'SWEEPING',icon:'siegeSweep',description:b.sweep.kind==='skill'?'Stop, settle, and fire only loaded ammunition':'One committed lower-bow sweep'},secondary:null,secondaryDescription:null};
 const primed=b?.skill?.id==='boltToTheOccasion'&&b.skill.phase==='primed';
 const mainCoupled=b?.mode==='DEPLOYED'&&b.weaponFocus==='MAIN'&&!primed;
 const secondary=primed&&biByeCombinedReady(b,now)?'skill':
  !primed&&b?.skill?.phase!=='releasing'&&b?.mode==='DEPLOYED'&&b.weaponFocus==='UPPER'&&
  !b.upperPending&&!b.upperQueued&&!b.pendingCoupledFromUpper&&
  canBiByeCouple(b,now)?'coupled':null;
 return {
  primary:{label:mainCoupled?'BOTH':'BOLT I',icon:mainCoupled?'boltBoth':'boltI',
   description:mainCoupled?'Coupled volley: Bolt I then Bolt II':'Fire Bolt I'},
  secondary,
  secondaryDescription:secondary==='coupled'?'Coupled volley: Bolt I then Bolt II':
   secondary==='skill'?'Skill combined volley: Bolt II then Bolt I':null,
 };
}
