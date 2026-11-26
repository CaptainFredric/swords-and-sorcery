import test from 'node:test';
import assert from 'node:assert/strict';
import {siegeArmoryView} from './siegeArmoryView.mjs';

test('Each machine has compact preview and expandable Story of Siege without cutting the authored full Flight description',()=>{
 const machines=siegeArmoryView();
 assert.equal(machines.length,3);
 for(const machine of machines) {
   assert.ok(machine.preview.length>25);
   assert.ok(machine.preview.length<150);
   assert.ok(machine.line.length>=machine.preview.length);
   assert.ok(machine.facts.length>12);
 }
 const flight=machines.find(m=>m.id==='fightFlight');
 assert.match(flight.line,/Why choose to Fight or Flee/);
 assert.match(flight.line,/It is simply doom/);
 assert.match(flight.line,/nigh-unreachable/);
});

test('creator-era siege stories are restored verbatim in Armory and Practice source',()=>{
 const [ballista,ram]=siegeArmoryView();
 assert.equal(ballista.preview,
  'A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.');
 assert.equal(ballista.line,ballista.preview+'\n\nThe first shot lowers the target\'s defense.');
 assert.equal(ram.preview,
  'This hulking, unsubtle contraption has the strength of a stubborn Spellblade and the durability of many more.');
 assert.equal(ram.line,
  ram.preview+' The sword is mightier than the pen, but siege engineers have devised a more sophisticated form of persuasion: an armored fist, delivered at a speed that cannot be ignored.\n\nWill not leave a scratch.');
});

test('All Siege Skills and Built-In Abilities provide reconciled summaries, functional sections, and accurate mechanics',()=>{
 const machines=siegeArmoryView();
 const ram=machines.find(m=>m.id==='soFist');
 const biBye=machines.find(m=>m.id==='biBye');
 const flight=machines.find(m=>m.id==='fightFlight');
 const ramSkills=Object.fromEntries(ram.skills.map(s=>[s.id,s]));
 const biByeSkills=Object.fromEntries(biBye.skills.map(s=>[s.id,s]));
 const flightSkills=Object.fromEntries(flight.skills.map(s=>[s.id,s]));

 // Retained SO-FIST-ICATION Skill summaries
 assert.equal(ramSkills.longArmToTheJaw.summary,'Launch your fist at distant foes and retrieve it. Deliver one last aimed punch upon destruction.');
 assert.equal(ramSkills.hellpingHand.summary,'Unfold your fist to crush foes, carry allies or vault by pushing off the ground.');
 assert.equal(ramSkills.beatToThePunch.summary,'Overload your engine to charge backwards and punch approaching foes automatically. Damage or instability may trigger the punch prematurely.');

 // Reconciled Bi-Bye & Flight Skill summaries
 assert.equal(biByeSkills.coldHowTouching.summary,'Give Bolt I a frost detonation on near misses until Bolt II is fired.');
 assert.equal(biByeSkills.lookAroundAndFindOut.summary,'Sustain a sweeping rotation. Stop and unleash your loaded bolts when opportunity strikes.');
 assert.equal(flightSkills.fireAwayRightHere.summary,'Rain bolts using flight charge instead of ammunition. Cease fire to conserve power while hovering.');
 assert.equal(flightSkills.doNotStopMyAscension.summary,'Fuel rotor Dashes with flight charge until you fire. With Spells & Chivalry, commit to a Valkyrie Dive.');

 // Sectioned complex skills vs simple skills, hull destruction discharge, and zero "electrify"
 assert.equal(ramSkills.hellpingHand.sections.length,5);
 assert.match(ramSkills.longArmToTheJaw.line,/hull is destroyed.*attached|physically mounted/i);
 assert.equal(biByeSkills.coldHowTouching.sections,undefined);
 assert.doesNotMatch(biByeSkills.coldHowTouching.summary+biByeSkills.coldHowTouching.line,/electrify/i);

 // Audited built-in abilities, exact requested summaries, and natural language without dev terms
 const ramAbilities=Object.fromEntries(ram.attacks.map(a=>[a.id,a]));
 const biByeAbilities=Object.fromEntries(biBye.attacks.map(a=>[a.id,a]));
 const flightAbilities=Object.fromEntries(flight.attacks.map(a=>[a.id,a]));
 assert.equal(ramAbilities.reciprocatingPiston.summary,'Drive your steel fist into enemies and send them reeling.');
 assert.equal(ramAbilities.ramFingerFlick.summary,'Flick nearby foes away with tremendous force.');
 assert.equal(ramAbilities.ramShunt.summary,'Spend Drive Pressure to lurch forwards or backwards.');
 assert.equal(ramAbilities.carriageElevation.summary,'Raise and tilt your fist to strike enemies at different heights.');
 assert.equal(ramAbilities.rammingCharge.summary,'Build momentum to deliver more powerful punches and collisions.');
 assert.equal(biByeAbilities.boltI.summary,'Chill enemies and weaken their Guard with bursting frost bolts.');
 assert.equal(biByeAbilities.boltII.summary,'Skewer enemies with a heavy bolt and send others reeling with its impact.');
 assert.equal(biByeAbilities.aSharpTurn.summary,'Lower your bow and sweep nearby enemies aside with a full rotation.');
 assert.equal(biByeAbilities.outriggerAnchor.summary,'Anchor the carriage to aim and fire your heavy launcher.');
 assert.equal(flightAbilities.repeatingCrossbow.summary,'Rain bolts upon enemies while maneuvering through the air.');
 assert.equal(flightAbilities.rotorBladeDash.summary,'Turn your spinning blades upon foes with a high-speed aerial strike.');
 assert.equal(flightAbilities.verticalAscension.summary,'Spend flight charge to climb and hover. Recover charge as you descend.');

 // Mechanical accuracy & clean player-facing language checks
 assert.match(ramSkills.beatToThePunch.line,/total of 35 damage while primed/);
 assert.match(ramSkills.beatToThePunch.line,/plus 1\.5 seconds for every second spent reverse charging/);
 assert.match(ramSkills.longArmToTheJaw.line,/default trajectory/i);
 assert.match(ramAbilities.ramShunt.line,/scaled by wheel and Drive|existing movement/i);
 assert.match(ramSkills.hellpingHand.sections[0].text,/50 Guard Stamina/);
 assert.match(flightSkills.narrowToOne.line,/The 24-second cooldown begins when the lock ends\./);
 for(const m of machines){
  for(const atk of m.attacks){
   assert.doesNotMatch(atk.summary+atk.line,/Argon|real |genuine |truly /i);
   assert.ok(atk.id&&atk.name&&atk.icon&&atk.summary&&atk.facts&&atk.line,atk.name);
   assert.ok(atk.summary.length>20&&atk.summary.length<130,atk.id);
  }
  for(const s of m.skills){
   assert.doesNotMatch(s.summary+s.line,/Argon|real bolt|genuine|truly /i);
   assert.ok(s.summary&&s.summary.length>25&&s.summary.length<150,s.id);
   assert.ok(s.line&&s.line.length>=s.summary.length,s.id);
  }
 }
});
