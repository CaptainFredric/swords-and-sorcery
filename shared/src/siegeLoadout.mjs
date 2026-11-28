// One source of truth for player-equippable siege techniques. Equipment is
// personal; mechanical cooldowns, ammunition and damage stay on the machine.
export const SIEGE_LOADOUT_DEFAULT=Object.freeze({
 biBye:'boltToTheOccasion',soFist:'beatToThePunch',fightFlight:'fireAwayRightHere',dragOon:'razeThePasture'
});
export const SIEGE_SKILL_OPTIONS=Object.freeze({
 biBye:Object.freeze(['boltToTheOccasion','coldHowTouching','lookAroundAndFindOut']),
 soFist:Object.freeze(['beatToThePunch','longArmToTheJaw','hellpingHand']),
 fightFlight:Object.freeze(['fireAwayRightHere','narrowToOne','doNotStopMyAscension']),
 dragOon:Object.freeze(['razeThePasture','flightLikeHell','campFire','brimmingWithPotential'])
});
export const SIEGE_SKILL_NAMES=Object.freeze({
 boltToTheOccasion:'Bolt to the Occasion',
 coldHowTouching:'Cold, How Touching',
 lookAroundAndFindOut:'Look Around and Find Out',
 beatToThePunch:'Beat to the Punch',
 longArmToTheJaw:'Long Arm to the Jaw',
 hellpingHand:'HELLping Hand',
 fireAwayRightHere:"Fire Away? I'm Right Here.",
 narrowToOne:'Narrow to One',
 doNotStopMyAscension:'Do Not Stop My Ascension!',
 razeThePasture:'Raze the Pasture',
 flightLikeHell:'Flight Like Hell',
 campFire:'Camp Fire',
 brimmingWithPotential:'Brimming with Potential'
});
export function normalizeSiegeLoadout(input){
 const canonical=Object.fromEntries(['biBye','soFist','fightFlight'].map(machine=>[
   machine,SIEGE_SKILL_OPTIONS[machine].includes(input?.[machine])?input[machine]:SIEGE_LOADOUT_DEFAULT[machine],
 ]));
 if(input&&Object.prototype.hasOwnProperty.call(input,'dragOon')){
   canonical.dragOon=SIEGE_SKILL_OPTIONS.dragOon.includes(input.dragOon)?input.dragOon:SIEGE_LOADOUT_DEFAULT.dragOon;
 }
 return canonical;
}
export function selectedSiegeSkill(actor,machine){
 const raw=actor?.siegeLoadout?.[machine];
 return SIEGE_SKILL_OPTIONS[machine]?.includes(raw)?raw:SIEGE_LOADOUT_DEFAULT[machine];
}
