import {SIEGE_SKILL_NAMES,SIEGE_SKILL_OPTIONS,normalizeSiegeLoadout} from '../../shared/src/siegeLoadout.mjs';

// Static 2D heraldic marks: presentation only, never a 3D model or asset fetch.
const MACHINES=Object.freeze([
 {id:'biBye',name:'BI-BYE-LLISTA',mark:'II',icon:'heavyBolt',subtitle:'TWO BOWS · ONE BAD IDEA',
  preview:'A traveling frost-conditioning bolt followed by a massive physical siege bolt.',
  line:`A traveling frost-conditioning bolt followed by a massive physical siege bolt.

Castleward's engineers saw no need to settle for a single warning shot. The smaller bolt subjects the enemy to a most inconvenient cold. The larger bolt supplies the conclusion, and, rather generously, enough force to make further argument unnecessary.`,
  facts:'650 hull · Bolt I: 18 frost / 2 m · Bolt II: 85 physical'},
 {id:'soFist',name:'SO-FIST-ICATION',mark:'FIST',icon:'ram',subtitle:'A MOST FORCEFUL ARGUMENT',
  preview:'A charging, piston-driven battering ram capable of delivering a mechanical uppercut.',
  line:`A charging, piston-driven battering ram capable of delivering a mechanical uppercut.

The engineers of Castleward discovered that a siege engine could have all the subtlety of a clenched fist—and built precisely that. Elevate the carriage, align the piston, and teach a wall how to receive a proper introduction. The detachable gauntlet ensures the enemy may still appreciate the machine's reach from a distance.`,
  facts:'Armored piston · charging drive · counterattack Skill'},
 {id:'fightFlight',name:'FIGHT-AND-FLIGHT',mark:'FLIGHT',icon:'flightDash',subtitle:'A DIFFERENT KIND OF HIGH GROUND',
  preview:'Why choose to Fight or Flee? When you could be Free?',
  line:`*Why choose to Fight or Flee? When you could be Free?*

...To do both at the same time. And get away with it.

This perilous contraption, made possible only through the ambitious aspirations of Castleward's infamous engineers, was conceived to eliminate the meddlesome matter of having to choose between retreating and enjoying the thrill of battle just one last time.

Now, you can enjoy the thrill of battle while ensuring that *they* cannot retreat from it.

Fire your repeating crossbow at those who are far. Dash into foes who are too close with your aptly placed Rotor-Blades. Prove that the only safe existence for your enemies is non-existence.

Or yourself.

It is not a dove. Nor does it mean mutual mortality.

It is simply doom.

And it is nigh-unreachable.`,
  facts:'Finite flight charge · rotor integrity · repeating bolts'}
]);
const EXPLANATIONS={
 boltToTheOccasion:'Prime independent heavy aiming, then release Bolt II on a second Skill press. Bolt I may fire in between.',
 coldHowTouching:'Skill activates Bolt I proximity frost detonation until the next real Bolt II release. No homing or added damage.',
 beatToThePunch:'Prime the ram for a physically triggered counterstroke. The machine can become unstable.',
 longArmToTheJaw:'Fire the actual fist into the world. The exposed piston keeps working. Drive to the grounded fist, press Skill to retrieve, then recover for 24s. If lost to the abyss, return to deployment and dismount for locked, 24s restoration at the same fist HP.',
 fireAwayRightHere:'For 3.5 seconds, the repeater can fire borrowed bolts. Reloading repays those debts first; release Fire to stabilize hover.',
  narrowToOne:'Press Skill to scan. Your reticle softly marks the exposed enemy closest to where you look and stays with them until you deliberately look at another. Fire the first real bolt to hard-lock that foe; hold Fire to keep shooting while looking elsewhere, even in third person. The repeating crossbow independently follows only within its mechanical turning arc and never fires through cover or guards. Land, settle, and press Skill to pick another target. The 24s cooldown starts when the Skill ends.',
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
