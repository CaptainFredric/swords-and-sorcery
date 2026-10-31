// One source of truth for player-equippable siege techniques. Equipment is
// personal; mechanical cooldowns, ammunition and damage stay on the machine.
export const SIEGE_LOADOUT_DEFAULT=Object.freeze({
 biBye:'boltToTheOccasion',soFist:'beatToThePunch',fightFlight:'fireAwayRightHere'
});
export const SIEGE_SKILL_OPTIONS=Object.freeze({
 biBye:Object.freeze(['boltToTheOccasion','coldHowTouching']),
 soFist:Object.freeze(['beatToThePunch']),
 fightFlight:Object.freeze(['fireAwayRightHere'])
});
export const SIEGE_SKILL_NAMES=Object.freeze({
 boltToTheOccasion:'Bolt to the Occasion',
 coldHowTouching:'Cold, How Touching',
 beatToThePunch:'Beat to the Punch',
 fireAwayRightHere:"Fire Away? I'm Right Here."
});
export function normalizeSiegeLoadout(input){
 return Object.fromEntries(Object.entries(SIEGE_LOADOUT_DEFAULT).map(([machine,def])=>
   [machine,SIEGE_SKILL_OPTIONS[machine].includes(input?.[machine])?input[machine]:def]));
}
export function selectedSiegeSkill(actor,machine){
 return normalizeSiegeLoadout(actor?.siegeLoadout)[machine];
}
