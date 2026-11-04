import {SIEGE_SKILL_NAMES,SIEGE_SKILL_OPTIONS,normalizeSiegeLoadout} from '../../shared/src/siegeLoadout.mjs';

// Static 2D heraldic marks: presentation only, never a 3D model or asset fetch.
const MACHINES=Object.freeze([
 {id:'biBye',name:'BI-BYE-LLISTA',mark:'II',icon:'heavyBolt',subtitle:'TWO BOWS · ONE BAD IDEA',
  line:'A traveling frost-conditioning bolt followed by a massive physical siege bolt.',
  facts:'650 hull · Bolt I: 18 frost / 2 m · Bolt II: 85 physical'},
 {id:'soFist',name:'SO-FIST-ICATION',mark:'FIST',icon:'ram',subtitle:'A MOST FORCEFUL ARGUMENT',
  line:'A charging, piston-driven battering ram capable of delivering a mechanical uppercut.',
  facts:'Armored piston · charging drive · counterattack Skill'},
 {id:'fightFlight',name:'FIGHT-AND-FLIGHT',mark:'FLIGHT',icon:'flightDash',subtitle:'A DIFFERENT KIND OF HIGH GROUND',
  line:'A wearable flying apparatus with a sword rotor and a repeating crossbow.',
  facts:'Finite flight charge · rotor integrity · repeating bolts'}
]);
const EXPLANATIONS={
 boltToTheOccasion:'Prime independent heavy aiming, then release Bolt II on a second Skill press. Bolt I may fire in between.',
 coldHowTouching:'Skill activates Bolt I proximity frost detonation until the next real Bolt II release. No homing or added damage.',
 beatToThePunch:'Prime the ram for a physically triggered counterstroke. The machine can become unstable.',
 fireAwayRightHere:'For 3.5 seconds, the repeater can fire borrowed bolts. Reloading repays those debts first; release Fire to stabilize hover.',
  narrowToOne:'Lock a single visible enemy. Hold Fire to strike exposed regions within the crossbow’s real traverse. Losing sight and firing ends the lock; landing permits a new target.',
  doNotStopMyAscension:'Until your next repeater bolt, rotor Dash uses flight charge instead of prowess, at the Rise rate. While active, with an intact rotor and full Spells & Chivalry, hold Dash + Ultimate for 1 second to commit the once-per-machine Valkyrie Dive.'
};
export function siegeArmoryView(choice){
 const selected=normalizeSiegeLoadout(choice);
 return MACHINES.map(machine=>({...machine,skills:SIEGE_SKILL_OPTIONS[machine.id].map(id=>({
  id,name:SIEGE_SKILL_NAMES[id],line:EXPLANATIONS[id],
  ...(id==='boltToTheOccasion'?{icon:'boltToTheOccasion'}:{}),
   ...(machine.id==='fightFlight'?{icon:id==='fireAwayRightHere'?'fireAway':id}:{}),
  equipped:selected[machine.id]===id
 }))}));
}
