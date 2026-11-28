import {SIEGE_SKILL_NAMES,SIEGE_SKILL_OPTIONS,normalizeSiegeLoadout} from '../../shared/src/siegeLoadout.mjs';

// Static 2D heraldic marks: presentation only, never a 3D model or asset fetch.
const MACHINES=Object.freeze([
 {id:'biBye',name:'BI-BYE-LLISTA',mark:'II',icon:'heavyBolt',subtitle:'THE FIRST SHOT LOWERS THEIR DEFENSE...',
  overview:'A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.',
  preview:'A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.',
  // Restored from the original siege copy preserved in the October browser evidence.
  line:`A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.

The first shot lowers the target's defense.`,
  facts:'650 hull · 4.0 m/s forward / 3.0 reverse (3.2 / 2.4 base) · Bolt I: 18 frost · Bolt II: 85 physical',
  attacks:[
   {
    id:'boltI',
    name:'BOLT I · FROST CONDITIONING',
    icon:'frostBolt',
    summary:'Chill enemies and weaken their Guard with bursting frost bolts.',
    facts:'18 direct / 12 splash frost · 2 m blast · 2.5s recock',
    line:'Fire a conditioning bolt in Mobile or Deployed stance (2.5s recock). Bursts across a 2.0 m cloud for 18 direct or 12 edge frost damage, 40% Chill slow for 5.0s, and up to 22 Guard stamina drain to weaken targets before Bolt II.'
   },
   {
    id:'boltII',
    name:'BOLT II · SIEGE CONCLUSION',
    icon:'boltII',
    summary:'Skewer enemies with a heavy bolt and send others reeling with its impact.',
    facts:'85 direct (+35 shockwave) · pierces 2 · 4.5s reload',
    line:'Requires Deployed Outriggers (X) and Main focus (B). Launches Bolt I first (0.45s), followed 0.20s later by Bolt II for 85 physical damage, piercing up to 2 targets (70% falloff on the second), a 3.5 m radial shockwave (35 center / 10 edge damage), and heavy knockback (4.5s reload). Shares a 4.0s heavy recovery gate with A Sharp Turn.'
   },
   {
    id:'aSharpTurn',
    name:'A SHARP TURN',
    icon:'siegeSweep',
    summary:'Lower your bow and sweep nearby enemies aside with a full rotation.',
    facts:'45 physical · 62 stagger · shares 4s Bolt II gate',
    line:'Lowers the main bow and sweeps it through a full 360° turn (E on desktop, SWEEP on mobile) in Mobile or Deployed stance. Deals 45 physical damage with heavy stagger and knockback along the sweeping bow limbs. Steep slopes or low obstacles can block the swing, and a facing Guard reduces damage and shove. Shares the 4.0s heavy recovery gate with Bolt II.'
   },
   {
    id:'outriggerAnchor',
    name:'OUTRIGGER ANCHOR',
    icon:'deploy',
    summary:'Anchor the carriage to aim and fire your heavy launcher.',
    facts:'1.2s deploy / retract · ±45° Main traverse',
    line:'Anchors or packs the carriage outriggers in 1.2s. Anchoring unlocks coupled Main aiming (±45° yaw, -8.6° to +20° pitch) for Bolt II; packing lets the six-wheeled carriage roll at 4.0 m/s forward and 3.0 m/s reverse in Siege Blades (3.2 / 2.4 m/s base).'
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
  facts:'1400 hull · 500 fist · 6.3 m/s (5.3 base; 12 charge) · 4s cycle',
  attacks:[
   {
    id:'reciprocatingPiston',
    name:'RECIPROCATING PISTON',
    icon:'ram',
    summary:'Drive your steel fist into enemies and send them reeling.',
    facts:'90–120 physical (75–90 exposed) · 4.0s cycle · heavy knockback',
    line:'Drive the hydraulic ram forward to deal 90–120 physical damage with an intact fist (scaling with forward speed and stroke velocity), or 75–90 with the exposed piston over a 4.0s cycle. Shatters fortifications and launches opposing combatants.'
   },
   {
    id:'ramFingerFlick',
    name:'FINGER FLICK',
    icon:'siegeWeapon',
    summary:'Flick nearby foes away with tremendous force.',
    facts:'80 damage · 44 against Guard · 45 stamina drain · 4.0s cycle',
    line:'Snap the gauntlet’s index finger forward for 80 physical damage and heavy knockback. A facing Guard reduces damage to 44 and loses 45 stamina. Requires an attached intact fist and shares the 4.0s cycle with Reciprocating Piston.',
    previewSkill:'ramFingerFlick'
   },
   {
    id:'ramShunt',
    name:'SHUNT',
    icon:'dash',
    summary:'Spend Drive Pressure to lurch forwards or backwards.',
    facts:'7.4 m/s added burst · 0.40s · 18 Pressure · 5.5s cooldown',
    sections:[
     {title:'Pressure Burst',text:'Adds a 7.4 m/s burst lasting 0.40s onto your existing movement for 18 Drive Pressure (5.5s cooldown). Burst strength scales down with wheel or Drive damage (down to 50% when heavily damaged), helps overcome uphill stalls where slope traversal remains permitted, and empowers Reciprocating Piston impacts.'},
     {title:'Direction & Controls',text:'Tap Space quickly or press Guard (G / Right Click) to Shunt forward; hold Reverse (S) to Shunt backward. On touch controls, tap SHUNT while holding the Left Stick forward or back.'}
    ],
    line:'Spends 18 Drive Pressure to add a 7.4 m/s burst lasting 0.40s onto your existing movement (5.5s cooldown). Scaled by wheel and Drive condition (down to 50% when heavily damaged), Shunt helps overcome uphill stalls where traversal remains physically permitted and boosts Piston impact. Quick-tap Space, press G / Right Click, or tap SHUNT on mobile; hold Reverse to Shunt backward.'
   },
   {
    id:'carriageElevation',
    name:'CARRIAGE ELEVATION',
    icon:'rise',
    summary:'Raise and tilt your fist to strike enemies at different heights.',
    facts:'Up to 1.37 m lift · 50° elevated pitch',
    line:'Use Pitch (E / C) to tilt the upper ram upward (up to 20° at ground height, or 50° when raised) or hold Space + E / C to hydraulically lift and lower the saddle (up to 1.37 m). The carriage holds your angle until adjusted or blocked by obstacles.'
   },
   {
    id:'rammingCharge',
    name:'RAMMING CHARGE',
    icon:'sprint',
    summary:'Build momentum to deliver more powerful punches and collisions.',
    facts:'Up to 12 m/s peak · needs 25+ Pressure to start',
    line:'Hold Sprint while driving forward to build speed up to 12 m/s (vs. 6.3 m/s Siege Blades cruise or 5.3 m/s base), amplifying Piston damage, shove distance, and structure breaches. Ordinary reverse travels at 3.7 m/s in Siege Blades (3.1 m/s base) unless Beat to the Punch is primed.'
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
  facts:'250 hull · 100 rotor · 10.1 m/s air (9.0 base) · 18-bolt repeater',
  attacks:[
   {
    id:'repeatingCrossbow',
    name:'REPEATING CROSSBOW',
    icon:'repeater',
    summary:'Rain bolts upon enemies while maneuvering through the air.',
    facts:'18-bolt hopper · 7 bolts/s · 2 bolts/s reload · 4–2 dmg',
    line:'Fires rapid bolts at 7 bolts/s (4 close to 2 far damage, 8 Guard stamina drain) while recharging 2 bolts/s. Tracks along your reticle within ±50° horizontal traverse and ±65° vertical pitch.'
   },
   {
    id:'rotorBladeDash',
    name:'ROTOR-BLADE DASH',
    icon:'flightDash',
    summary:'Turn your spinning blades upon foes with a high-speed aerial strike.',
    facts:'18 m/s strike · 8–30 physical · 42 Prowess/s · intact rotor',
    line:'Commits an 18 m/s slashing flight run (taking off if grounded), pitching the counter-rotating sword blades toward your aim for 8–30 physical damage and 16 Guard stamina drain while spending Prowess (unless fueled by Do Not Stop My Ascension!).'
   },
   {
    id:'verticalAscension',
    name:'VERTICAL ASCENSION',
    icon:'rise',
    summary:'Spend flight charge to climb and hover. Recover charge as you descend.',
    facts:'100 flight charge · 15/s climb · 8/s hover · +5/s descent recharge',
    line:'Spins the rotor to climb (15/s drain) or sustain level hover (8/s drain) from a 100-point battery; descending recovers flight charge (+5/s). Standard air speed is 10.1 m/s in Siege Blades (9.0 m/s base).'
   }
  ],
  controls:{
   desktop:'[W/A/S/D] Pitch & yaw · [Space] Rise · [Shift / C] Descend · [Left Click / X] Repeater · [E] Rotor Dash · [U / B] Skill · [R] Ultimate · [T] Eject',
   touch:'Left Stick: Steer · RISE / DESCEND: Altitude · FIRE: Repeater · DASH: Rotor Strike · SKILL: Skill · LEAVE: Eject'
  }
 }
]);
const DRAG_OON_MACHINE = Object.freeze({
  id: 'dragOon',
  name: 'DRAG-OON',
  mark: 'FLAME',
  icon: 'desolationSpray',
  experimental: true,
  subtitle: 'LEFT THE STOVE ON, ON PURPOSE.',
  overview: 'Heavy eight-wheeled armored fortress with twin four-nozzle flame cannons and four shielded crew casting stations.',
  preview: 'Heavy eight-wheeled armored fortress with twin four-nozzle flame cannons and four shielded crew casting stations.',
  line: `An armored mobile furnace built around twin low-mounted four-nozzle flame cannons and eight independently steered wheels.

Allied Spellblades can climb inside to cast spells from shielded apertures, infusing DRAG-OON's flame, steam, and leaps with their elements.`,
  facts: '2200 hull · 8-wheel pivot · 100 fuel · 4 crew apertures',
  attacks: [
    {
      id: 'desolationSpray',
      name: 'DESOLATION SPRAY',
      icon: 'desolationSpray',
      summary: 'Spew continuous flame across twin four-nozzle cannons.',
      facts: '4 nozzles · ~11.5 fuel/s · crew elemental infusions',
      line: 'Hold Attack to spew wide sustained flames from twin low-mounted articulated cannons. Seated casters infuse the stream with longer reach, chilled drag, lingering gale plumes, rapid lightning ignition, or molten steel.',
    },
    {
      id: 'firesTheLimit',
      name: "FUEL'S THE LIMIT",
      icon: 'fuelsTheLimit',
      summary: 'Ignite fuel beneath your hull to propel yourself through the air and crash down upon foes.',
      facts: '26 fuel · 12s cooldown · underside blast + landing slam',
      line: 'Blast skyward off your underside ignition shutters without harming hull or crew, steer across the arc, and slam down upon enemies.',
    },
    {
      id: 'steamTheTeam',
      name: 'STEAM THE TEAM',
      icon: 'steamTheTeam',
      summary: 'Vent superheated steam around your hull to blast foes and douse flames.',
      facts: '12.5 m ring · 25s cooldown · heat-scaled blast + douse',
      line: 'Release pressurized steam in an expanding 360° ring whose knockback and damage rise with furnace heat while cooling the boiler and snuffing exposed fires.',
    },
    {
      id: 'burningBrotherhood',
      name: 'BURNING BROTHERHOOD',
      icon: 'burningBrotherhood',
      summary: 'Seat allied Spellblades at casting apertures to infuse your fire and steam.',
      facts: '4 aperture stations · rear bay entry · live elemental buffs',
      line: 'Up to four allies can board unoccupied stations via the rear bay to cast safely from enclosed ports while infusing every attack.',
    },
    {
      id: 'allAbort',
      name: 'ALL ABORT!',
      icon: 'allAbort',
      summary: 'Critical furnace rupture detonates outward and violently ejects surviving crew.',
      facts: 'Heat & fuel scaled blast · evacuate before core collapse',
      line: 'When hull integrity reaches zero, internal pressure ruptures outward and blasts surviving crew clear of the wreck. Evacuate early to avoid internal burn trauma.',
    },
    {
      id: 'sheathedInSteel',
      name: 'SHEATHED IN STEEL',
      icon: 'shield',
      summary: 'Heavy enclosed plating dampens direct blows and sheds lingering burns.',
      facts: 'Enclosed fortress · DoT hull immunity · allied steel wards',
      line: 'Riveted furnace steel shrugs off lingering flames while hardening the cabin against siege strikes. Allied Sheathe in Steel wards reinforce the frame further.',
    },
  ],
  controls: {
    desktop: '[W/A/S/D] Pivot & Drive · [Left Click / Hold F] Desolation Spray · [Space] Fuel’s the Limit · [Right Click / G] Steam the Team · [U] Skill · [R] Rite of Ascension · [Z] Camera · [T] Board / Evacuate · [Q] Passenger Cast',
    touch: 'Left Stick: Pivot & Drive · SPRAY: Desolation Spray · LEAP: Fuel’s the Limit · STEAM: Steam the Team · SKILL: Skill · ULT: Rite · MOUNT / LEAVE: Board or Evacuate · CAST (Pax): Aperture Spell',
  },
});

const EXPLANATIONS={
 razeThePasture:'Hold Skill to flood fuel into an expanding ground ring, then release to ignite after a brief delay. Tight releases burn for over 14 seconds; wide holds deliver heavy initial blast damage for a shorter burn.',
 flightLikeHell:'Engage while airborne to tilt both twin cannons straight down, hovering softly while scorching everything beneath you. Inflicts reversible max health loss and suppresses overlapping enemy field hazards until landing safely. With Full Gale active and an opted-in crew carrying full Spells & Chivalry, ignite Rite of Ascension to unite the prowess of your crew to ascend upon an inferno, guide DRAG-OON toward its final destination, and unleash a catastrophic explosion.',
 campFire:'Settle the chassis and seal every hatch, venting excess heat while periodically mending nearby allies. Sealed armor halves Steel repair costs and blocks enemy boarding, while external passenger casts pause until reopened.',
 brimmingWithPotential:'Push furnace pressure past normal limits to amplify flame and steam damage up to +65% while drawing heavier heat and risking internal burn trauma to crew above 110 heat.',
 boltToTheOccasion:'Prime independent heavy aiming while Deployed, then fire Bolt II on a second Skill press (or Right Click). You may keep firing Bolt I in between (after a 0.2s safety catch). Cancelling before Bolt II spends no cooldown; firing starts a 24s cooldown.',
 coldHowTouching:'Give Bolt I projectiles proximity frost detonation on near misses until you fire Bolt II. Adds no homing or bonus damage; enters a 24s cooldown once Bolt II ends the effect.',
 lookAroundAndFindOut:'Sustain A Sharp Turn as a continuous 360° sweep. Fire to stop and settle the bow, unleashing only the bolts currently loaded, or press Skill again to cancel. Bolt II coupling stays locked during rotation, and the 24s cooldown begins when the action finishes.',
 beatToThePunch:'Overload the ram engine to unlock backwards charging up to 11.5 m/s and prime an automatic strike. Automatically punches when an enemy enters reach, when the hull takes a total of 35 damage while primed, or when the engine becomes too unstable. Cooldown: 24 seconds, plus 1.5 seconds for every second spent reverse charging.',
 longArmToTheJaw:'Launch the armored fist downrange at 23 m/s (125 close to 55 far physical damage) while the exposed hydraulic piston keeps punching. Drive beside the grounded fist with clear sightlines and press Skill to retrieve it (24s cooldown); if lost into an abyss, return to your deployment site and dismount for locked 24s restoration at its previous HP. If the hull is destroyed while the fist is attached (including if shattered on the fatal blow), it attempts to aim within ±15° yaw and -22° to +21° pitch at a reachable enemy—prioritizing the attacker responsible—or launches along its default trajectory if no clear target exists (full damage if intact; 85 base damage if shattered). Already detached or missing fists cannot fire.',
 hellpingHand:'Unfold your armored fist into an articulated hand for grabbing foes, carrying allies, braced aiming, or hand-assisted hops.',
 fireAwayRightHere:'Spin the rotor up and fire bolts at up to 7/s, spending 1.5 flight charge per bolt instead of magazine ammo. Release Fire to hover cleanly without hover drain (climbing still uses charge). Ends when charge runs out, the rotor slows, or the rotor is destroyed—emptying the normal magazine—with its 24s cooldown starting on activation.',
 narrowToOne:'Scan with Skill to mark the exposed foe nearest your aim, then fire a bolt to lock onto that target while looking elsewhere. The repeating crossbow tracks within ±50° horizontal traverse and ±65° vertical pitch and pauses if cover or facing Guards block a shot. Land and press Skill to pick another target. The 24-second cooldown begins when the lock ends.',
 doNotStopMyAscension:'Until you fire a repeating crossbow bolt, every rotor Dash uses flight charge at the Rise rate instead of spending personal Prowess (24s cooldown starts on activation). While active—with an intact rotor, positive flight charge, and full Spells & Chivalry—hold Dash + Ultimate for 1 second to commit the once-per-machine Valkyrie Dive.'
};
const SKILL_SECTIONS={
 razeThePasture:[
  {title:'Fuel Ring & Ignition Tradeoff',text:'Hold Skill to flood an expanding zone ahead of the cannon mount; release to trigger delayed ignition. Narrow rings sustain flames past 14 seconds, whereas broad rings detonate immediately for heavier blast damage and shorter burn time.'},
 ],
 flightLikeHell:[
  {title:'Concentrated Inferno & Suppression',text:'Engage while airborne to tilt both twin cannons straight down, hovering softly while scorching everything beneath you with reversible max health loss and stifling overlapping enemy hazards.'},
  {title:'Rite of Ascension',text:'Unite the prowess of your crew to ascend upon an inferno. Guide DRAG-OON toward its final destination and unleash a catastrophic explosion. Requires Flight Like Hell, Full Gale infusion, and every seated crewmate opting in with full Spells & Chivalry Prowess.'}
 ],
 campFire:[
  {title:'Fortified Sanctuary',text:'Lowers suspension onto blocking hearth flames and locks every hatch. Halves allied Steel repair cost, vents heat smoothly, and gradually restores nearby allies while halting enemy boarding.'},
 ],
 brimmingWithPotential:[
  {title:'Overpressure Curve',text:'Push internal pressure into the 100–220 overpressure band for up to +65% flame and steam power. Above 115 heat, overheated boiler fumes sear seated crew until heat vents back down.'},
 ],
 longArmToTheJaw:[
  {title:'Detached Strike & Exposed Piston',text:'Launches the armored fist downrange at 23 m/s (125 close to 55 far damage across 12–36 m). While detached, the carriage’s exposed piston keeps working for ordinary punches.'},
  {title:'Retrieval & Abyss Recovery',text:'Drive alongside the grounded fist with unobstructed sightlines and press Skill to retrieve it (24s cooldown). If lost into an abyss, return to your deployment site and dismount for a locked 24s restoration at its previous HP.'},
  {title:'Final Discharge on Destruction',text:'If the hull is destroyed while the fist is attached (including if shattered by the fatal blow), it attempts to aim within ±15° yaw and -22° to +21° pitch at a reachable enemy—prioritizing the attacker responsible—or fires along its default trajectory if no suitable target exists (full damage if intact; 85 base damage if shattered). Already detached or missing fists do not fire.'}
 ],
 hellpingHand:[
  {title:'Seize & Crush',text:'Press Skill near an enemy to grab and crush them over 4 seconds. A facing Guard resists an individual grab attempt by spending 50 Guard Stamina, breaking Guard once depleted.'},
  {title:'Allied Transportation',text:'An ally beside the braced open palm can press Interact to board, attack freely while carried, and press Interact again to step out onto clear ground.'},
  {title:'Hand-Assisted Vault',text:'Hold forward or reverse (steering slightly if desired) and press Skill to push off the planted palm for an aimed hop (3.65 m forward / 2.65 m back).'},
  {title:'Stationary Bracing & Aiming',text:'While parked with the open palm braced against the ground, steer sideways (A / D) to pivot the carriage cleanly around the planted hand and re-aim.'},
  {title:'Cooldown & Restrictions',text:'Requires an intact, attached fist and functional Drive. Pressing Skill neutrally when no grab target is in reach closes the hand and starts a 24s cooldown after release.'}
 ],
 beatToThePunch:[
  {title:'Reverse Engine Overload',text:'Unlocks high-speed backwards Pressure charging (up to 11.5 m/s) and arms the fist to strike.'},
  {title:'Triggers & Cooldown',text:'Automatically punches when an enemy enters reach, when the hull takes a total of 35 damage while primed, or when the engine becomes too unstable. Cooldown: 24 seconds, plus 1.5 seconds for every second spent reverse charging.'}
 ],
 narrowToOne:[
  {title:'Soft Mark & Hard Lock',text:'Press Skill to scan and mark the exposed foe nearest your aim; fire a bolt to lock onto that target and keep shooting while looking freely elsewhere.'},
  {title:'Independent Gimbal Arc',text:'The repeating crossbow tracks autonomously within ±50° horizontal traverse and ±65° vertical pitch, pausing whenever cover or facing Guards block a shot.'},
  {title:'Retargeting & Cooldown',text:'Land and settle to press Skill for a new target. The 24-second cooldown begins when the lock ends.'}
 ],
 doNotStopMyAscension:[
  {title:'Charge-Fueled Rotor Dashes',text:'Until you fire a repeating crossbow bolt, every rotor Dash consumes flight charge at the Rise rate instead of spending personal Prowess (24s cooldown begins on activation).'},
  {title:'Valkyrie Dive',text:'While active—with an intact rotor, positive flight charge, and full Spells & Chivalry Ultimate readiness—hold Dash + Ultimate for 1 second to commit a devastating once-per-machine Valkyrie Dive.'}
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
 razeThePasture:'Hold to soak an expanding target area with fuel, trading burn duration against initial ignition blast.',
 flightLikeHell:'Tilt cannons downward in midair to hover-scorch foes with reversible max health loss and stifle enemy fields.',
 campFire:'Seal all hatches and settle in place, venting heat, cutting repair cost, and steadily restoring allies.',
 brimmingWithPotential:'Run the furnace into redline overpressure for amplified flame and steam output at heavy thermal risk.',
};
function formatSkills(machineId, selected) {
  return SIEGE_SKILL_OPTIONS[machineId].map(id => ({
    id, name: SIEGE_SKILL_NAMES[id], summary: SKILL_SUMMARIES[id] ?? EXPLANATIONS[id], line: EXPLANATIONS[id],
    ...(SKILL_SECTIONS[id] ? { sections: SKILL_SECTIONS[id] } : {}),
    ...(id === 'boltToTheOccasion' ? { icon: 'boltToTheOccasion' } : id === 'lookAroundAndFindOut' ? { icon: 'siegeSweep' } : {}),
    ...(machineId === 'fightFlight' ? { icon: id === 'fireAwayRightHere' ? 'fireAway' : id } : {}),
    ...(machineId === 'dragOon' ? { icon: id } : {}),
    equipped: selected[machineId] === id,
  }));
}
export function dragOonArmoryEntry(choice) {
  const selected = normalizeSiegeLoadout(choice);
  return { ...DRAG_OON_MACHINE, skills: formatSkills('dragOon', selected) };
}
export function siegeArmoryView(choice, { experimental = false } = {}) {
  const selected = normalizeSiegeLoadout(choice);
  const base = MACHINES.map(machine => ({ ...machine, skills: formatSkills(machine.id, selected) }));
  return experimental ? [...base, dragOonArmoryEntry(selected)] : base;
}
