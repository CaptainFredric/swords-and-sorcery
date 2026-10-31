import {SIEGE_SKILL_NAMES,SIEGE_SKILL_OPTIONS,normalizeSiegeLoadout} from '../../shared/src/siegeLoadout.mjs';

// Static 2D heraldic marks: presentation only, never a 3D model or asset fetch.
const MACHINES=Object.freeze([
 {id:'biBye',name:'BI-BYE-LLISTA',mark:'ⅹⅡ',subtitle:'TWO BOWS · ONE BAD IDEA',
  line:'A traveling frost-conditioning bolt followed by a massive physical siege bolt.',
  facts:'650 hull · Bolt I: 18 frost / 2 m · Bolt II: 85 physical'},
 {id:'soFist',name:'SO-FIST-ICATION',mark:'✊',subtitle:'A MOST FORCEFUL ARGUMENT',
  line:'A charging, piston-driven battering ram capable of delivering a mechanical uppercut.',
  facts:'Armored piston · charging drive · counterattack Skill'},
 {id:'fightFlight',name:'FIGHT-AND-FLIGHT',mark:'✥',subtitle:'A DIFFERENT KIND OF HIGH GROUND',
  line:'A wearable flying apparatus with a sword rotor and a repeating crossbow.',
  facts:'Finite flight charge · rotor integrity · repeating bolts'}
]);
const EXPLANATIONS={
 boltToTheOccasion:'Prime independent heavy aiming, then release Bolt II on a second Skill press. Bolt I may fire in between.',
 coldHowTouching:'Skill activates Bolt I proximity frost detonation until the next real Bolt II release. No homing or added damage.',
 beatToThePunch:'Prime the ram for a physically triggered counterstroke. The machine can become unstable.',
 fireAwayRightHere:'The flying repeater borrows from its finite ammunition supply, paid back through its normal mechanism.'
};
export function siegeArmoryView(choice){
 const selected=normalizeSiegeLoadout(choice);
 return MACHINES.map(machine=>({...machine,skills:SIEGE_SKILL_OPTIONS[machine.id].map(id=>({
  id,name:SIEGE_SKILL_NAMES[id],line:EXPLANATIONS[id],equipped:selected[machine.id]===id
 }))}));
}
