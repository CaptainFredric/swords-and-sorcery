// One source of truth for player-equippable siege techniques. Equipment is
// personal; mechanical cooldowns, ammunition and damage stay on the machine.
export const SIEGE_LOADOUT_DEFAULT=Object.freeze({
 biBye:'boltToTheOccasion',soFist:'beatToThePunch',fightFlight:'fireAwayRightHere'
});
export const SIEGE_SKILL_OPTIONS=Object.freeze({
 biBye:Object.freeze(['boltToTheOccasion','coldHowTouching','lookAroundAndFindOut']),
 soFist:Object.freeze(['beatToThePunch','longArmToTheJaw','hellpingHand']),
 fightFlight:Object.freeze(['fireAwayRightHere','narrowToOne','doNotStopMyAscension'])
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
 doNotStopMyAscension:'Do Not Stop My Ascension!'
});
export function normalizeSiegeLoadout(input){
 return Object.fromEntries(Object.entries(SIEGE_LOADOUT_DEFAULT).map(([machine,def])=>
   [machine,SIEGE_SKILL_OPTIONS[machine].includes(input?.[machine])?input[machine]:def]));
}
export function selectedSiegeSkill(actor,machine){
 return normalizeSiegeLoadout(actor?.siegeLoadout)[machine];
}
