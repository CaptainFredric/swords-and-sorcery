import {SIEGE_SKILL_NAMES,SIEGE_SKILL_OPTIONS,normalizeSiegeLoadout} from '../../shared/src/siegeLoadout.mjs';

// Static 2D heraldic marks: presentation only, never a 3D model or asset fetch.
const MACHINES=Object.freeze([
 {id:'biBye',name:'BI-BYE-LLISTA',mark:'II',icon:'heavyBolt',subtitle:'THE FIRST SHOT LOWERS THEIR DEFENSE...',
  overview:'A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.',
  preview:'A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.',
  // Restored from the original siege copy preserved in the October browser evidence.
  line:`A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.

The first shot lowers the target's defense.`,
  facts:'650 hull · Bolt I: 18 frost / 2 m · Bolt II: 85 physical',
  attacks:[
   {
    id:'boltI',
    name:'BOLT I · FROST CONDITIONING',
    icon:'frostBolt',
    summary:'Fire a rapid frost bolt that bursts in a 2 m cloud, chilling targets and lowering defense.',
    facts:'18 direct / 12 splash frost · 2 m radius · 2.5s recock',
    line:'Rapid-fire conditioning bolt usable in Mobile or Deployed stance (2.5s recock). Bursts across a 2.0 m cloud for 18 direct / 12 edge frost damage, 40% Chill slow for 5.0s, and up to 22 Guard stamina drain to soften targets before Bolt II.'
   },
   {
    id:'boltII',
    name:'BOLT II · SIEGE CONCLUSION',
    icon:'boltII',
    summary:'Commit a high-velocity armor-piercing heavy bolt that skewered formations and walls cannot ignore.',
    facts:'85 direct (+35 shockwave) · pierces 2 · 4.5s reload',
    line:'Requires Deployed Outriggers (X) and Main focus (B). Launches Bolt I first (0.45s), then releases Bolt II 0.20s later: 85 physical damage, pierces up to 2 targets (70% falloff), 3.5 m shockwave (35 center damage), and heavy knockback (4.5s reload). Shares a 4.0s heavy gate with A Sharp Turn.'
   },
   {
    id:'aSharpTurn',
    name:'A SHARP TURN',
    icon:'siegeSweep',
    summary:'Drop the main bow and sweep it through a full 360° arc, shoving aside nearby attackers.',
    facts:'45 physical · heavy shove · shares 4s Bolt II gate',
    line:'Lowers the main bow limbs for one genuine 360° physical rotation (E on desktop, SWEEP on mobile) in Mobile or Deployed mode. Deals 45 physical damage with heavy stagger and shove strictly along the bow limbs (blocked by terrain; facing Guard mitigates damage and shove). Shares the 4.0s heavy recovery gate with Bolt II.'
   },
   {
    id:'outriggerAnchor',
    name:'OUTRIGGER ANCHOR',
    icon:'deploy',
    summary:'Plant the stabilizer legs to aim the heavy bow, or pack them to roll on six wheels.',
    facts:'1.2s deploy / retract · unlocks ±45° Main traverse',
    line:'Transitions between 6-wheel Mobile travel (3.2 m/s forward, 2.4 m/s reverse) and anchored Deployed siege stance in 1.2s, unlocking coupled Main aiming (±45° yaw, -8.6° to +20° pitch).'
   }
  ],
  controls:{
   desktop:'[W/A/S/D] Steer carriage · [X] Deploy / Pack outriggers · [Left Click / F] Fire Bolt I or coupled Main volley · [E] A Sharp Turn · [B] Upper / Main focus · [Right Click] Primed Bolt II · [U] Skill · [Z] Sights · [T] Dismount',
   touch:'Left Stick: Drive carriage · DEPLOY: Anchor/Pack · FIRE I / HEAVY: Shoot · SWEEP: A Sharp Turn · FOCUS: Upper/Main · SKILL: Skill · VIEW: Sights · LEAVE: Dismount'
  }
 },
 {id:'soFist',name:'SO-FIST-ICATION',mark:'FIST',icon:'ram',subtitle:'SUBTLETY COMES KNOCKING DOWN, KNOCKING DOWN, KNOCKING DOWN',
  overview:'This hulking, unsubtle contraption has the strength of a stubborn Spellblade and the durability of many more.',
  preview:'This hulking, unsubtle contraption has the strength of a stubborn Spellblade and the durability of many more.',
  // The October 24 siege refinement plan explicitly preserves this exact text.
  line:`This hulking, unsubtle contraption has the strength of a stubborn Spellblade and the durability of many more. The sword is mightier than the pen, but siege engineers have devised a more sophisticated form of persuasion: an armored fist, delivered at a speed that cannot be ignored.

Will not leave a scratch.`,
  facts:'1400 hull · 500 fist · 4.0s strike cycle · 100 Pressure',
  attacks:[
   {
    id:'reciprocatingPiston',
    name:'RECIPROCATING PISTON',
    icon:'ram',
    summary:'Drive your steel fist into enemies, sending them reeling and battering through fortifications.',
    facts:'90–120 physical (75–90 exposed) · 4.0s cycle · heavy shove',
    line:'Hydraulic steel ram stroke scaling with carriage speed and extension: deals 90–120 physical damage with an intact armored fist (or 75–90 on the exposed piston) over a 4.0s cycle, smashing fortifications and launching opposing combatants.'
   },
   {
    id:'ramFingerFlick',
    name:'FINGER FLICK',
    icon:'siegeWeapon',
    summary:'Snap Argon’s articulated index finger forward for a quick strike with heavy knockback.',
    facts:'80 damage · 44 against Guard · shared 4.0s cycle',
    line:'Snaps the articulated gauntlet index finger forward for 80 physical damage with forceful knockback. Facing Guard reduces it to 44 damage and drains Guard Stamina. Requires an attached armored fist and shares the 4.0s piston cycle.',
    previewSkill:'ramFingerFlick'
   },
   {
    id:'ramShunt',
    name:'SHUNT',
    icon:'dash',
    summary:'Vent Drive Pressure for a sudden forward or reverse lunge, even up steep inclines.',
    facts:'7.4 m/s burst · 0.40s · 18 Pressure · 5.5s cooldown',
    sections:[
     {title:'Pressure Burst',text:'Commits an immediate 7.4 m/s surge lasting 0.40s at a cost of 18 Drive Pressure (5.5s cooldown), overcoming steep uphill stalls and feeding extra momentum into Piston impacts.'},
     {title:'Direction & Controls',text:'Tap Space quickly (under 0.26s without holding lift) or press Guard (G / Right Click) to Shunt forward; hold Reverse (S) to Shunt backward. On touch, tap SHUNT with Left Stick direction.'}
    ],
    line:'Vents 18 Drive Pressure for an immediate 7.4 m/s burst lasting 0.40s (5.5s cooldown), overcoming uphill grade stalls and adding impact momentum to Piston strikes. Quick-tap Space, press G / Right Click, or tap SHUNT on mobile; hold Reverse to Shunt backward.'
   },
   {
    id:'carriageElevation',
    name:'CARRIAGE ELEVATION',
    icon:'rise',
    summary:'Tilt or hydraulically raise the upper saddle to strike elevated battlements or low portals.',
    facts:'Hydraulic pitch + lift · maintains held angle',
    line:'Use Pitch (E / C) to tilt the ram cradle upward or downward, or hold Space + E / C to hydraulically lift and lower the upper saddle. The chassis preserves your selected angle automatically until adjusted or blocked by obstacles.'
   },
   {
    id:'rammingCharge',
    name:'RAMMING CHARGE',
    icon:'sprint',
    summary:'Build full forward Drive engine speed while holding Sprint to turn mass into impact.',
    facts:'Up to 12 m/s peak · boosts Piston impact',
    line:'Hold Sprint while driving forward to wind the pressure engine from 5.3 m/s up to 12 m/s, amplifying Piston damage, shove distance, and structure breaches (reverse drive travels at 3.1 m/s unless Beat to the Punch is primed).'
   }
  ],
  controls:{
   desktop:'[W/A/S/D] Steer · [Shift+W] Charge · [Tap Space / G / Right Click] Shunt (+ S reverse) · [Left Click / F] Piston · [X] Finger Flick · [E/C] Pitch ([Space+E/C] Lift) · [U] Skill · [T] Dismount',
   touch:'Left Stick: Drive · ATTACK: Piston · FLICK: Finger Flick · SHUNT: Pressure Burst · ELEVATE: Pitch/Lift · SKILL: Skill · LEAVE: Dismount'
  }
 },
 {id:'fightFlight',name:'FIGHT-AND-FLIGHT',mark:'FLIGHT',icon:'flightDash',subtitle:'YOU ARE FREE TO FLEE',
  overview:'Personal twin-blade aerial apparatus. Eliminates the awkward choice between tactical retreat and glorious combat by enabling both simultaneously.',
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
  facts:'250 hull · 100 rotor · 100 flight charge · 18-bolt repeater',
  attacks:[
   {
    id:'repeatingCrossbow',
    name:'REPEATING CROSSBOW',
    icon:'repeater',
    summary:'Fire rapid quarrels from a rotary hopper with an independently gimbaled barrel.',
    facts:'18-bolt hopper · 7 bolts/s · 2 bolts/s reload · 4–2 dmg',
    line:'Streams physical high-velocity bolts at 7 bolts/s (4 close to 2 far damage, 8 Guard stamina drain) while recharging 2 bolts/s. Tracks within ±50° yaw and ±65° pitch along your reticle.'
   },
   {
    id:'rotorBladeDash',
    name:'ROTOR-BLADE DASH',
    icon:'flightDash',
    summary:'Pitch the spinning counter-rotating sword blades into an 18 m/s slashing flight run.',
    facts:'18 m/s committed strike · consumes Prowess (42/s) · requires intact rotor',
    line:'Launches a high-speed offensive flight run at 18 m/s (taking off cleanly if grounded), pitching the twin counter-rotating sword blades toward your reticle while draining personal Prowess unless fueled by Do Not Stop My Ascension!'
   },
   {
    id:'verticalAscension',
    name:'VERTICAL ASCENSION',
    icon:'rise',
    summary:'Climb into castle airspace or descend smoothly while managing rechargeable flight charge.',
    facts:'100 flight charge · 15/s climb · 8/s hover · +5/s descent recharge',
    line:'Spins the main rotor to climb (15/s drain) or sustain level hover (8/s drain) from a 100-point battery; descending gently recharges flight power (+5/s).'
   }
  ],
  controls:{
   desktop:'[W/A/S/D] Pitch & yaw · [Space] Rise · [Shift / C] Descend · [Left Click / X] Repeater · [E] Rotor Dash · [U / B] Skill · [R] Ultimate · [T] Eject',
   touch:'Left Stick: Steer · RISE / DESCEND: Altitude · FIRE: Repeater · DASH: Rotor Strike · SKILL: Skill · LEAVE: Eject'
  }
 }
]);
const EXPLANATIONS={
 boltToTheOccasion:'Prime independent heavy aiming while Deployed, then fire Bolt II on a second Skill press (or Right Click). You may keep firing Bolt I in between (subject to a brief 0.2s safety catch after any Bolt I release). Cancelling before Bolt II spends no cooldown; firing starts a 24s cooldown.',
 coldHowTouching:'Activate to equip Bolt I projectiles with proximity frost detonation on near misses until your next real Bolt II release. Adds no homing and no bonus damage; enters a 24s cooldown once Bolt II ends the effect.',
 lookAroundAndFindOut:'Sustain A Sharp Turn as a stationary 360° bow sweep. Firing stops and settles the bow to release only truly loaded bolts; pressing Skill again cancels cleanly. Bolt II coupling stays locked throughout rotation. The 24s cooldown begins when the action resolves.',
 beatToThePunch:'Overload the ram engine to unlock backwards charging (up to 11.5 m/s) and prime an automatic armored punch whenever an enemy enters range. Suffering 35+ hull shock damage or mounting engine instability triggers the punch early. Enters a 24s cooldown (+1.5s if reverse charge was used) once resolved.',
 longArmToTheJaw:'Fire the armored fist itself downrange (125 close to 55 far physical damage) while the exposed piston keeps fighting. Drive to the grounded fist with clear sightlines and press Skill to retrieve it, entering a 24s recovery cooldown; if lost to the abyss, return to your deployment site and dismount for locked 24s restoration at the same fist HP. If the ram hull is destroyed while the fist is attached (or shattered by the fatal hit), the chassis automatically selects a clear ballistic arc within ±15° yaw and -22° to +21° relative pitch (prioritizing the fatal attacker) to fire one final aimed punch—full force if intact, or 85 base damage if shattered. Already detached or missing fists cannot fire.',
 hellpingHand:'Unfold your armored fist into an articulated hand for grappling, allied transport, braced pivoting, or ground-vaulting mobility.',
 fireAwayRightHere:'Spin the rotor to operating speed and keep firing physical bolts at up to 7/s, spending 1.5 flight charge per bolt instead of magazine ammo. Cease fire to hold a level hover without spending flight charge (climbing still costs power). Ends when charge or rotor speed fails—emptying the normal magazine—with its 24s cooldown starting on activation.',
 narrowToOne:'Scan with Skill to softly mark the exposed enemy closest to your gaze, then fire your first real bolt to hard-lock them while looking elsewhere. The repeating crossbow independently tracks within ±50° yaw / ±65° pitch and never fires through cover or Guards. Land and press Skill to pick another target; the 24s cooldown begins when the lock ends.',
 doNotStopMyAscension:'Until your next repeater bolt, every rotor Dash consumes flight charge at the Climb rate instead of personal Prowess. While active, with an intact rotor and full Spells & Chivalry, hold Dash + Ultimate for 1 second to commit the once-per-machine Valkyrie Dive.'
};
const SKILL_SECTIONS={
 longArmToTheJaw:[
  {title:'Detached Strike & Exposed Piston',text:'Launches the armored fist downrange at 23 m/s (125 close to 55 far damage across 12–36 m). While detached, the carriage’s exposed hydraulic piston continues to punch.'},
  {title:'Retrieval & Abyss Recovery',text:'Drive alongside the grounded fist with unobstructed sightlines and press Skill to retrieve it (24s cooldown). If lost to the abyss, return to your deployment home site and dismount for a locked 24s restoration at the same fist HP.'},
  {title:'Final Discharge on Destruction',text:'If the ram hull is destroyed while the fist is physically mounted (or shattered by the fatal blow), it fires one final low-arc shot within ±15° yaw and -22° to +21° relative pitch toward a clear-arc enemy (prioritizing the attacker), dealing full damage if intact or 85 close base if shattered. Already detached or missing fists do not fire.'}
 ],
 hellpingHand:[
  {title:'Seize & Crush',text:'Press Skill near an enemy to seize and crush them over 4 seconds. Facing Guard resists capture while draining Guard Stamina until broken.'},
  {title:'Allied Transportation',text:'An ally beside the braced open palm can press Interact to board, attack freely while carried inside the hand, and press Interact again to step onto clear ground.'},
  {title:'Hand-Assisted Vault',text:'Hold forward or reverse (steering slightly if desired) and press Skill to push off the planted palm for a short aimed carriage hop (3.65 m forward / 2.65 m back).'},
  {title:'Stationary Bracing & Aiming',text:'While parked with the open palm braced against the ground, steer sideways (A/D) to pivot the ram chassis around the planted hand and re-aim smoothly.'},
  {title:'Cooldown & Restrictions',text:'Requires an intact, attached Armored Fist and operational Drive. Pressing Skill neutrally with no grab target closes the hand and triggers a 24s cooldown after release.'}
 ],
 beatToThePunch:[
  {title:'Reverse Engine Overload',text:'Unlocks high-speed backwards Pressure charging (up to 11.5 m/s) and arms the fist to punch automatically as soon as a foe enters strike range.'},
  {title:'Triggers & Cooldown',text:'Receiving 35+ hull shock damage or mounting internal instability fires the punch prematurely. Resolves into a 24s cooldown (+1.5s recovery debt if reverse charge was used).'}
 ],
 narrowToOne:[
  {title:'Soft Mark & Hard Lock',text:'Press Skill to scan and softly highlight the exposed foe closest to your gaze; fire your first real bolt to hard-lock that target and continue shooting while looking freely elsewhere.'},
  {title:'Independent Gimbal Arc',text:'The repeating crossbow tracks autonomously within ±50° horizontal traverse and ±65° vertical pitch, pausing automatically when sightlines are blocked by cover or facing Guards.'},
  {title:'Retargeting & Cooldown',text:'Land and settle to press Skill for a new target. Entering or ending the Skill leaves its 24s cooldown once the lock finishes.'}
 ],
 doNotStopMyAscension:[
  {title:'Charge-Fueled Rotor Dashes',text:'Until you fire your next repeating crossbow bolt, every rotor Dash draws from Flight Charge at the Climb rate instead of spending personal Prowess.'},
  {title:'Valkyrie Dive',text:'While active—with an intact rotor, positive flight charge, and full Spells & Chivalry Ultimate readiness—hold Dash + Ultimate for 1 full second to commit a devastating once-per-machine terminal dive.'}
 ]
};
const SKILL_SUMMARIES={
 longArmToTheJaw:'Launch your fist at distant foes and retrieve it. Deliver one last aimed punch upon destruction.',
 hellpingHand:'Unfold your fist to crush foes, carry allies or vault by pushing off the ground.',
 beatToThePunch:'Overload your engine to charge backwards and punch approaching foes automatically. Damage or instability may trigger the punch prematurely.',
 boltToTheOccasion:'Prime an independent heavy Bolt II shot while continuing to fire Bolt I until release.',
 coldHowTouching:'Give Bolt I a frost detonation on near misses until Bolt II is fired.',
 lookAroundAndFindOut:'Sustain a sweeping rotation. Stop and unleash your loaded bolts when opportunity strikes.',
 fireAwayRightHere:'Rain bolts using flight charge instead of ammunition. Cease fire to conserve power while hovering.',
 narrowToOne:'Scan and hard-lock a visible target so the repeating crossbow tracks them while you look elsewhere.',
 doNotStopMyAscension:'Fuel rotor Dashes with flight charge until you fire. With Spells & Chivalry, commit to a Valkyrie Dive.',
};
export function siegeArmoryView(choice){
 const selected=normalizeSiegeLoadout(choice);
 return MACHINES.map(machine=>({...machine,skills:SIEGE_SKILL_OPTIONS[machine.id].map(id=>({
  id,name:SIEGE_SKILL_NAMES[id],summary:SKILL_SUMMARIES[id]??EXPLANATIONS[id],line:EXPLANATIONS[id],
  ...(SKILL_SECTIONS[id]?{sections:SKILL_SECTIONS[id]}:{}),
  ...(id==='boltToTheOccasion'?{icon:'boltToTheOccasion'}:id==='lookAroundAndFindOut'?{icon:'siegeSweep'}:{}),
   ...(machine.id==='fightFlight'?{icon:id==='fireAwayRightHere'?'fireAway':id}:{}),
  equipped:selected[machine.id]===id
 }))}));
}
