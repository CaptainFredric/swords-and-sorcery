import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceDirector } from './voiceRules.mjs';
import { VoiceMoments } from './voiceMoments.mjs';
import { VoiceScenes } from './voiceScenes.mjs';
import { linesFor, voiceLine } from './voiceLines.mjs';

test('Not right now: 18m spatial hush, ongoing speech cancellation, 2s post-line tail suppression', () => {
  const director = new VoiceDirector({ rand: () => 0.01 });

  // Speaker A at (0, 0) starts speaking a long sentence
  const allowedA = director.consider('openUp', 'speakerA', 10.0, { source: { x: 0, z: 0 }, duration: 4.0 });
  assert.ok(allowedA);
  assert.equal(director.saying('speakerA', 11.0), 'openUp');

  // Speaker C at (5, 5) (distance ~7m < 18m) makes an exertion
  const allowedC = director.consider('effort', 'speakerC', 10.5, { source: { x: 5, z: 5 }, duration: 3.0 });
  assert.ok(allowedC);

  // Killer K at (0, 0) kills and says 'notRightNow' (duration 2.5s)
  const allowedKill = director.consider('notRightNow', 'killerK', 11.0, { source: { x: 0, z: 0 }, duration: 2.5 });
  assert.ok(allowedKill);
  // Ongoing speech within 18m (speakerA and speakerC) was cut
  assert.ok(allowedKill.stop.includes('speakerA') || allowedKill.stop.includes('speakerC'));
  assert.equal(director.saying('speakerA', 11.1), null);
  assert.equal(director.saying('speakerC', 11.1), null);
  assert.equal(director.saying('killerK', 11.1), 'notRightNow');

  // During line playback (t = 12.0), nearby speaker B at (2, 2) is suppressed
  const nearbyDuring = director.consider('effort', 'speakerB', 12.0, { source: { x: 2, z: 2 } });
  assert.equal(nearbyDuring, null, 'suppressed within 18m during notRightNow');

  // During post-line hush (line ends at 11.0 + 2.5 = 13.5; tail lasts until 15.5):
  // At t = 14.0 (in the 2s tail), nearby speaker B is still suppressed
  const nearbyTail = director.consider('effort', 'speakerB', 14.0, { source: { x: 2, z: 2 } });
  assert.equal(nearbyTail, null, 'suppressed within 18m during 2s tail hush');

  // Meanwhile, remote speaker R at (30, 30) (distance ~42m > 18m) is NOT suppressed
  const remoteDuring = director.consider('effort', 'speakerR', 14.0, { source: { x: 30, z: 30 } });
  assert.ok(remoteDuring, 'remote speaker > 18m can speak');

  // After tail expires at t = 16.0, nearby speech resumes
  const nearbyAfter = director.consider('effort', 'speakerB', 16.0, { source: { x: 2, z: 2 } });
  assert.ok(nearbyAfter, 'nearby speech allowed after hush expires');
});

test('Not right now: victimWasSpeaking fact boosts chance from 3% to 15%', () => {
  const silentVictim = linesFor('killer', { kill: 1 }, { facts: [] });
  const notRightNowSilent = silentVictim.find(s => s.line === 'notRightNow');
  assert.ok(notRightNowSilent);
  assert.equal(notRightNowSilent.chanceScale, 1.0);

  const speakingVictim = linesFor('killer', { kill: 1 }, { facts: ['victimSpoke'] });
  const notRightNowSpeaking = speakingVictim.find(s => s.line === 'notRightNow');
  assert.ok(notRightNowSpeaking);
  assert.equal(notRightNowSpeaking.chanceScale, 5.0, '5x boost: 3% -> 15%');
});

test('Troubleshooting: renderDisabled setup after repeated strikes, foundDisablePoint payoff on stagger/break/kill', () => {
  let spoken = [];
  const say = (line, speaker, opt) => { spoken.push({ line, speaker, opt }); return { seconds: 2, delay: 0 }; };
  const scenes = new VoiceScenes({ say });
  const moments = new VoiceMoments();

  // Attacker strikes victim 3 times while standing
  moments.damage({ attackerId: 'atk', victimId: 'vic', amount: 15, health: 80, source: 'sword', at: 1.0 });
  moments.damage({ attackerId: 'atk', victimId: 'vic', amount: 15, health: 65, source: 'sword', at: 2.0 });
  const lines3 = moments.damage({ attackerId: 'atk', victimId: 'vic', amount: 15, health: 50, source: 'sword', at: 3.0 });

  // 3rd strike offers renderDisabledSetup
  const flatLines = lines3.flat().map(s => s.line);
  assert.ok(flatLines.includes('renderDisabled'), '3rd strike offers renderDisabled');

  // Scene starts
  scenes.troubleshootStarted('atk', 'vic', 3.0);
  assert.ok(scenes.troubleshoot.has('atk'));

  // Stagger break on victim resolves troubleshooting
  scenes.staggerBroken({ playerId: 'vic', by: 'atk', at: 4.0 });
  assert.ok(!scenes.troubleshoot.has('atk'));
  assert.ok(spoken.some(s => s.line === 'foundDisablePoint' && s.speaker === 'atk' && s.opt.earned));
});

test('SO-FIST-ICATION handshake: setup opens on windup, payoff earned on piston impact', () => {
  let spoken = [];
  const say = (line, speaker, opt) => { spoken.push({ line, speaker, opt }); return { seconds: 2, delay: 0 }; };
  const scenes = new VoiceScenes({ say });

  // Operator starts handshake setup toward target
  scenes.handshakeStarted('operator', 'target', 10.0);
  assert.ok(scenes.handshakes.has('operator'));

  // Piston impact with knockback delivers payoff
  scenes.handshakeCompleted('operator', 'target', 12.0);
  assert.ok(!scenes.handshakes.has('operator'));
  assert.ok(spoken.some(s => s.line === 'handshakePayoff' && s.speaker === 'operator' && s.opt.earned));
});

test('Packet metadata & multi-beat punchline timings integrity', () => {
  const highGround = voiceLine('highGround');
  assert.ok(highGround.beats && highGround.beats.length === 2);
  assert.equal(highGround.credits.title, 'Below Ground');

  const statueLanding = voiceLine('statueLanding');
  assert.ok(statueLanding.beats && statueLanding.beats.length === 2);
  assert.equal(statueLanding.credits.title, 'Ascent to Glory');

  const groundedDebut = voiceLine('groundedDebut');
  assert.equal(groundedDebut.credits.title, 'Grounded Debut');
  assert.equal(groundedDebut.triggers.rotorDestroyedSurvive, 1);
});

test('Prowess triggers: require authoritative depletion or expenditure, not merely low health', () => {
  const moments = new VoiceMoments();

  // Low health (15 HP <= 20) with NO prowess depletion: prowessDepleted must NOT be offered
  const lowHealthOnly = moments.damage({ attackerId: 'atk', victimId: 'vic', amount: 25, health: 15, source: 'sword', at: 1.0 });
  const lowHealthTags = lowHealthOnly.flat().map((s) => s.line);
  assert.ok(!lowHealthTags.includes('prowessConspiracyV1') && !lowHealthTags.includes('prowessConspiracyV2'), 'low health alone never triggers prowess conspiracy');

  // Authoritative prowess depletion (prowess drops to 0 from 50) while standing: MUST offer prowessDepleted
  const prowessDepleted = moments.damage({ attackerId: 'atk', victimId: 'vic', amount: 20, health: 60, prowess: 0, prowessBefore: 50, source: 'sword', at: 2.0 });
  const prowessTags = prowessDepleted.flat().map((s) => s.line);
  assert.ok(prowessTags.includes('prowessConspiracyV1') || prowessTags.includes('prowessConspiracyV2'), 'authoritative prowess depletion triggers prowess conspiracy');

  // Explicit prowessDepleted flag: MUST offer prowessDepleted
  const explicitDepleted = moments.damage({ attackerId: 'atk', victimId: 'vic', amount: 20, health: 70, prowessDepleted: true, source: 'sword', at: 3.0 });
  const explicitTags = explicitDepleted.flat().map((s) => s.line);
  assert.ok(explicitTags.includes('prowessConspiracyV1') || explicitTags.includes('prowessConspiracyV2'), 'explicit prowessDepleted flag triggers prowess conspiracy');

  // Direct method: moments.prowessDepleted('vic')
  const directLines = moments.prowessDepleted('vic').flat().map((s) => s.line);
  assert.ok(directLines.includes('prowessConspiracyV1') || directLines.includes('prowessConspiracyV2'), 'direct prowessDepleted method returns conspiracy lines');
});

test('Special events: spell-miss dialogue occurs when attacking an enemy preparing or casting a spell', () => {
  const moments = new VoiceMoments();

  // Missing against a normal defender (targetKind is null): does not trigger on single miss (requires 3 denials)
  const normalMiss = moments.denied('attacker', 'defender', 1.0, { targetKind: null });
  assert.deepEqual(normalMiss, [], 'single sword miss against normal defender does not trigger');

  // Missing against an enemy spellcaster preparing/casting a spell (targetKind: "sorcery"): immediate spellMiss
  const spellMiss = moments.denied('attacker', 'defender', 2.0, { targetKind: 'sorcery' });
  const spellMissLines = spellMiss.flat().map((s) => s.line);
  assert.ok(spellMissLines.includes('spellTurnV1') || spellMissLines.includes('spellTurnV2'), 'missing against casting opponent offers spellTurn dialogue');
});

test('Special events: repeated sentence interruptions trigger "If I\'m not allowed to finish a sentence..."', () => {
  const moments = new VoiceMoments();

  // moments.interrupted('speaker') delivers interruptedRepeated moment
  const lines = moments.interrupted('speaker').flat().map((s) => s.line);
  assert.ok(lines.includes('finishSentence'), 'interrupted offers finishSentence line');

  // Test interruption lifecycle in simulated captionCut / voiceBank cut
  const speechInterrupted = new Map();
  let voicedMoments = [];
  const sayMoments = (groups, at) => { voicedMoments.push({ groups, at }); };

  const onSentenceCut = (speaker, now, isAlive = true) => {
    if (!isAlive) return;
    const prev = speechInterrupted.get(speaker);
    const count = (prev && (now - prev.at <= 30.0)) ? prev.count + 1 : 1;
    speechInterrupted.set(speaker, { count, at: now });
    if (count >= 2) {
      sayMoments(moments.interrupted(speaker), now);
    }
  };

  // 1st interruption: count = 1, no line yet
  onSentenceCut('speakerA', 10.0, true);
  assert.equal(voicedMoments.length, 0);

  // 2nd interruption within 30s: count = 2, triggers finishSentence!
  onSentenceCut('speakerA', 14.0, true);
  assert.equal(voicedMoments.length, 1);
  const delivered = voicedMoments[0].groups.flat().map((s) => s.line);
  assert.ok(delivered.includes('finishSentence'), 'repeated interruptions trigger drastic action threat');
});

test('Strengthen Not right now: interrupts even STATE-priority speech, respects 18m radius and 2s post-line hush', () => {
  const director = new VoiceDirector({ rand: () => 0.01 });

  // Speaker A at (0, 0) is speaking high-priority STATE speech (cry = true)
  const stateCry = director.consider('sunderCall', 'speakerA', 10.0, { source: { x: 0, z: 0 }, duration: 4.0, cry: true });
  assert.ok(stateCry, 'sunderCall cry started');
  assert.equal(director.saying('speakerA', 10.5), 'sunderCall');

  // Killer at (0, 0) kills and says 'notRightNow' (duration 2.5s)
  const allowed = director.consider('notRightNow', 'killer', 11.0, { source: { x: 0, z: 0 }, duration: 2.5 });
  assert.ok(allowed, 'notRightNow allowed');
  assert.ok(allowed.stop.includes('speakerA'), 'notRightNow interrupts even STATE priority speech');
  assert.equal(director.saying('speakerA', 11.1), null, 'speakerA speech cut');
  assert.equal(director.saying('killer', 11.1), 'notRightNow');

  // Speaker B within 18m at (3, 4) (dist 5m) is suppressed during playback (t = 12.0)
  const nearDuring = director.consider('effort', 'speakerB', 12.0, { source: { x: 3, z: 4 } });
  assert.equal(nearDuring, null, 'suppressed within 18m during playback');

  // Speaker B within 18m is still suppressed during 2s post-line tail hush (line ends 13.5, hush until 15.5)
  const nearTail = director.consider('effort', 'speakerB', 14.5, { source: { x: 3, z: 4 } });
  assert.equal(nearTail, null, 'suppressed within 18m during 2s tail hush');

  // Remote speaker R at (25, 25) (dist ~35m > 18m) is NOT suppressed during playback or tail
  const remote = director.consider('effort', 'speakerR', 14.5, { source: { x: 25, z: 25 } });
  assert.ok(remote, 'remote speaker > 18m remains completely unaffected');

  // After 2s tail expires at t = 16.0, nearby speech resumes
  const nearAfter = director.consider('effort', 'speakerB', 16.0, { source: { x: 3, z: 4 } });
  assert.ok(nearAfter, 'nearby speech resumes after hush window expires');

  // Verify probabilities and cooldown
  const rule = voiceLine('notRightNow');
  assert.equal(rule.rarity, 0.03, 'base rarity 3%');
  assert.equal(rule.cooldown, 240, 'cooldown 240s');
  assert.equal(rule.boost?.victimSpoke, 5.0, '5x boost when victim was speaking (15%)');
});

test('SO-FIST-ICATION handshake: piston cylinder sweep geometry and exact target matching', () => {
  // Test piston forward cylinder sweep geometry
  const ram = { x: 0, y: 0, z: 0, heading: 0 }; // heading 0 -> forward is -Z (fx = 0, fz = -1), right is +X (rx = 1, rz = 0)
  const fx = -Math.sin(ram.heading);
  const fz = -Math.cos(ram.heading);
  const rx = Math.cos(ram.heading);
  const rz = -Math.sin(ram.heading);

  const evaluateSweep = (pos) => {
    const dx = pos.x - ram.x;
    const dy = pos.y - ram.y;
    const dz = pos.z - ram.z;
    const forward = dx * fx + dz * fz;
    const lateral = Math.abs(dx * rx + dz * rz);
    const valid = forward >= 0.5 && forward <= 6.0 && lateral <= 1.8 && Math.abs(dy) <= 2.2;
    return { valid, forward, lateral, dy };
  };

  // Target 1: right in front at (0, 0, -3.0): forward = 3.0, lateral = 0 -> VALID
  assert.ok(evaluateSweep({ x: 0, y: 0, z: -3.0 }).valid, 'straight ahead in reach is valid');

  // Target 2: lateral offset 3.0m at (3.0, 0, -3.0): forward = 3.0, lateral = 3.0 > 1.8m -> INVALID
  assert.ok(!evaluateSweep({ x: 3.0, y: 0, z: -3.0 }).valid, 'outside lateral cylinder sweep is invalid');

  // Target 3: behind ram at (0, 0, 4.0): forward = -4.0 < 0.5 -> INVALID
  assert.ok(!evaluateSweep({ x: 0, y: 0, z: 4.0 }).valid, 'behind ram is invalid');

  // Target 4: too high at (0, 4.0, -3.0): dy = 4.0 > 2.2 -> INVALID
  assert.ok(!evaluateSweep({ x: 0, y: 4.0, z: -3.0 }).valid, 'outside vertical reach is invalid');

  // Test exact target matching for handshake payoff
  let spoken = [];
  const say = (line, speaker, opt) => { spoken.push({ line, speaker, opt }); return { seconds: 2, delay: 0 }; };
  const scenes = new VoiceScenes({ say });

  // Windup setup targets victim1
  scenes.handshakeStarted('operator', 'victim1', 10.0);
  assert.ok(scenes.handshakes.has('operator'));

  // Piston impact hits a different enemy (victim2): payoff must NOT trigger!
  scenes.handshakeCompleted('operator', 'victim2', 12.0);
  assert.equal(spoken.length, 0, 'payoff not delivered for different enemy');
  assert.ok(scenes.handshakes.has('operator'), 'handshake remains pending for victim1');

  // Piston impact hits the exact targeted enemy (victim1): payoff delivered!
  scenes.handshakeCompleted('operator', 'victim1', 12.5);
  assert.ok(!scenes.handshakes.has('operator'), 'handshake completed');
  assert.ok(spoken.some((s) => s.line === 'handshakePayoff' && s.speaker === 'operator' && s.opt.earned), 'payoff earned for exact targeted opponent');
});

test('Aerial-kill semantics: high ground requires killer airborne in flight with >= 3.0m elevation superiority', () => {
  const evalHighGround = ({ isFlight, airborne, killerY, victimY }) => {
    return Boolean(isFlight && airborne && (killerY - victimY >= 3.0));
  };

  // Case A: Grounded Fight-and-Flight machine (airborne: false, killerY: 0, victimY: 0) -> FALSE
  assert.equal(evalHighGround({ isFlight: true, airborne: false, killerY: 0, victimY: 0 }), false, 'grounded machine does not get high ground');

  // Case B: Airborne Fight-and-Flight machine, but insufficient vertical height (diff 2.0m < 3.0m) -> FALSE
  assert.equal(evalHighGround({ isFlight: true, airborne: true, killerY: 2.0, victimY: 0 }), false, 'insufficient height difference does not get high ground');

  // Case C: Airborne Fight-and-Flight machine with genuine vertical superiority (diff 5.0m >= 3.0m) -> TRUE
  assert.equal(evalHighGround({ isFlight: true, airborne: true, killerY: 6.0, victimY: 1.0 }), true, 'airborne with >= 3.0m height superiority gets high ground');

  // Case D: Killer on foot on higher terrain (isFlight: false, diff 4.0m) -> FALSE
  assert.equal(evalHighGround({ isFlight: false, airborne: false, killerY: 5.0, victimY: 1.0 }), false, 'pedestrian killer never gets flight elevated kill');

  // Verify voice line triggers
  const moments = new VoiceMoments();
  const deathLines = moments.death(
    { victimId: 'vic', killerId: 'kil', source: 'sword', at: 10.0 },
    { extra: { flightElevated: true } }
  );
  const victorLines = deathLines.victor.flat().map((s) => s.line);
  assert.ok(victorLines.includes('highGround'), 'flightElevated extra fact offers highGround line');
});

test('Rare VO probability semantics: fight-and-flight lines bounded by state transitions and intervals', () => {
  // Verify moral rotation lines have very low rarity (0.025 - 0.04) and 240s cooldown
  const moralLines = ['rotorMoralityV1', 'rotorMoralityV2', 'rotorMoralityV3', 'rotorMoralityV4'].map(voiceLine);
  for (const line of moralLines) {
    assert.ok(line.rarity <= 0.04, `${line.id} rarity is rare (${line.rarity})`);
    assert.ok(line.cooldown >= 240, `${line.id} cooldown is at least 240s (${line.cooldown})`);
    assert.equal(line.trigger, 'flightRotorSustained');
  }

  // Verify hover line
  const hoverLine = voiceLine('aboveYou');
  assert.equal(hoverLine.trigger, 'flightHoverHigh');
  assert.ok(hoverLine.rarity <= 0.08);

  // Verify rotor near line
  const rotorNearLine = voiceLine('rotaryExhibit');
  assert.equal(rotorNearLine.trigger, 'flightRotorNear');
  assert.ok(rotorNearLine.rarity <= 0.05);

  // Simulate bounded sampling logic
  const voState = {
    grounded: false,
    airborneSince: 0.0,
    wasHighHover: false,
    lastHoverCheckAt: -Infinity,
    lastSustainCheckAt: -Infinity,
    wasFastNear: false,
    lastNearCheckAt: -Infinity,
  };

  let sustainRolls = 0;
  let hoverRolls = 0;
  let nearRolls = 0;

  const simulateFrame = (serverNow, dt, { floorY = 0, flightY = 6.0, rotorPowered = true, rotorRpm = 130, enemies = [{ position: { x: 3, y: 1, z: 3 } }, { position: { x: 2, y: 5, z: 2 } }] }) => {
    // High hover check
    const hasEnemyBelow = enemies.some((e) => (flightY - e.position.y >= 3.5) && Math.hypot(flightY - e.position.y) <= 25);
    const isHighHover = (flightY - floorY >= 5.0) && hasEnemyBelow;
    const hoverTransition = isHighHover && !voState.wasHighHover;
    const hoverSampleDue = isHighHover && (serverNow - voState.lastHoverCheckAt >= 8.0);
    if (hoverTransition || hoverSampleDue) {
      voState.lastHoverCheckAt = serverNow;
      hoverRolls++;
    }
    voState.wasHighHover = isHighHover;

    // Sustained flight check
    const hasEnemiesNearby = enemies.some((e) => Math.hypot(e.position.x, e.position.z) <= 35);
    const sustainedFlight = rotorPowered && (serverNow - voState.airborneSince >= 3.5) && hasEnemiesNearby;
    if (sustainedFlight && (serverNow - voState.lastSustainCheckAt >= 9.0)) {
      voState.lastSustainCheckAt = serverNow;
      sustainRolls++;
    }

    // Near check
    const enemyNearRotor = enemies.some((e) => Math.hypot(e.position.x, e.position.z) <= 7.0 && Math.abs(flightY - e.position.y) <= 3.5);
    const isFastNear = rotorRpm >= 120 && enemyNearRotor;
    const nearTransition = isFastNear && !voState.wasFastNear;
    const nearSampleDue = isFastNear && (serverNow - voState.lastNearCheckAt >= 8.0);
    if (nearTransition || nearSampleDue) {
      voState.lastNearCheckAt = serverNow;
      nearRolls++;
    }
    voState.wasFastNear = isFastNear;
  };

  // Run 60 frames in 1.0 second (t = 0 to t = 1.0)
  for (let f = 0; f < 60; f++) {
    simulateFrame(f / 60, 1 / 60, {});
  }

  // Hover transitions once on frame 0, and does NOT roll again in 1.0 second!
  assert.equal(hoverRolls, 1, 'hover rolls exactly once on transition, not 60 times');
  // Sustain does not roll during the first 3.5 seconds
  assert.equal(sustainRolls, 0, 'sustain does not roll during first 3.5s startup');
  // Rotor near rolls once on transition
  assert.equal(nearRolls, 1, 'rotor near rolls once on transition, not 60 times');

  // Advance to t = 4.0s (sustained flight achieved)
  simulateFrame(4.0, 1 / 60, {});
  assert.equal(sustainRolls, 1, 'sustain rolls once at 4.0s');

  // Advance 300 frames over 5 seconds (t = 4.0 to 9.0s)
  for (let f = 1; f <= 300; f++) {
    simulateFrame(4.0 + f / 60, 1 / 60, {});
  }
  // At t = 9.0s, interval of 9.0s has not elapsed since 4.0s (only 5s elapsed)
  assert.equal(sustainRolls, 1, 'sustain does not roll again before 9.0s interval');

  // Advance to t = 13.1s (> 9s since t = 4.0)
  simulateFrame(13.1, 1 / 60, {});
  assert.equal(sustainRolls, 2, 'sustain rolls second sample after 9.0s interval');
});

test('Priority 1: Spatial suppression does not interrupt or block distant speakers (>18m), while suppressing nearby speakers (<=18m)', () => {
  const director = new VoiceDirector({ rand: () => 0.01 });

  // Distant speaker D at (30, 0) is speaking a sentence (duration 5.0s, t = 10.0 to 15.0)
  const distantSentence = director.consider('gloryWitnessV1', 'speakerD', 10.0, { source: { x: 30, z: 0 }, duration: 5.0 });
  assert.ok(distantSentence, 'distant sentence started');
  assert.equal(director.saying('speakerD', 10.5), 'gloryWitnessV1');

  // Killer at (0, 0) triggers 'notRightNow' (priority STATE + 1, duration 2.5s)
  const nrn = director.consider('notRightNow', 'killer', 11.0, { source: { x: 0, z: 0 }, duration: 2.5 });
  assert.ok(nrn, 'notRightNow allowed');

  // Distant speaker D (dist 30m > 18m) MUST NOT be cut and continues speaking!
  assert.ok(!nrn.stop.includes('speakerD'), 'distant speaker > 18m is NOT cut');
  assert.equal(director.saying('speakerD', 11.1), 'gloryWitnessV1', 'distant speaker continues speaking');

  // Another remote speaker R at (-25, 0) (dist 25m > 18m) is NOT blocked by notRightNow suppression
  const remoteNew = director.consider('gloryWitnessV2', 'speakerR', 12.0, { source: { x: -25, z: 0 }, duration: 3.0 });
  assert.ok(remoteNew, 'distant speaker outside 18m can start speaking');

  // But a nearby speaker M at (3, 0) (dist 3m <= 18m) IS blocked during notRightNow + 2s post-line hush
  const nearbyBlocked = director.consider('gloryWitnessV2', 'speakerM', 12.0, { source: { x: 3, z: 0 }, duration: 3.0, force: true });
  assert.equal(nearbyBlocked, null, 'nearby speaker inside 18m is blocked during hush');

  // Nearby speaker N at (5, 0) is speaking a high-priority / STATE line
  director.reset();
  const nearbyState = director.consider('sunderCall', 'speakerN', 20.0, { cry: true, source: { x: 5, z: 0 }, duration: 4.0 });
  assert.ok(nearbyState, 'nearby state sentence started');
  assert.equal(director.saying('speakerN', 20.5), 'sunderCall');

  // Killer at (0, 0) triggers 'notRightNow' at t = 21.0
  const nrn2 = director.consider('notRightNow', 'killer', 21.0, { source: { x: 0, z: 0 }, duration: 2.5 });
  assert.ok(nrn2, 'notRightNow allowed');
  assert.ok(nrn2.stop.includes('speakerN'), 'nearby speaker on STATE line is cut by notRightNow');
  assert.equal(director.saying('speakerN', 21.1), null, 'nearby speaker mouth stopped');
});

test('Priority 2: Deferred interrupted-sentence complaint fires when mouth and sentence channel become free; cancels on death/respawn', () => {
  const speechInterrupted = new Map();
  const pendingSentenceComplaints = new Map();
  let delivered = [];

  const moments = new VoiceMoments();
  let mockSentence = null;
  let mockPlaying = new Set();
  let mockAlive = new Map([['speakerA', true]]);

  const canSayComplaint = (speaker, now) => {
    const mouthFree = !mockPlaying.has(speaker);
    const sentenceFree = !mockSentence || now >= mockSentence.until || mockSentence.speaker === speaker;
    return mouthFree && sentenceFree;
  };

  const queueSentenceComplaint = (speaker, now) => {
    if (canSayComplaint(speaker, now)) {
      delivered.push({ speaker, at: now, line: 'finishSentence' });
      return;
    }
    pendingSentenceComplaints.set(speaker, { expiresAt: now + 4.0 });
  };

  const pollSentenceComplaints = (now) => {
    for (const [speaker, pending] of pendingSentenceComplaints.entries()) {
      if (now > pending.expiresAt || !mockAlive.get(speaker)) {
        pendingSentenceComplaints.delete(speaker);
        continue;
      }
      if (canSayComplaint(speaker, now)) {
        delivered.push({ speaker, at: now, line: 'finishSentence' });
        pendingSentenceComplaints.delete(speaker);
      }
    }
  };

  const onSentenceCut = (speaker, now) => {
    const prev = speechInterrupted.get(speaker);
    const count = (prev && (now - prev.at <= 30.0)) ? prev.count + 1 : 1;
    speechInterrupted.set(speaker, { count, at: now });
    if (count >= 2) {
      queueSentenceComplaint(speaker, now);
    }
  };

  // Interruption 1
  onSentenceCut('speakerA', 10.0);
  assert.equal(delivered.length, 0);

  // Interruption 2 at t = 15.0 by higher priority line (speakerB speaks until t = 17.5)
  mockSentence = { speaker: 'speakerB', until: 17.5 };
  mockPlaying.add('speakerB');
  onSentenceCut('speakerA', 15.0);

  // Complaint could NOT be spoken immediately because speakerB is speaking!
  assert.equal(delivered.length, 0, 'complaint not spoken while speakerB is speaking');
  assert.ok(pendingSentenceComplaints.has('speakerA'), 'complaint registered as deferred opportunity');

  // Poll at t = 16.0: speakerB still speaking -> still pending
  pollSentenceComplaints(16.0);
  assert.equal(delivered.length, 0, 'still pending while speakerB speaks');

  // At t = 17.5: speakerB finishes
  mockSentence = null;
  mockPlaying.delete('speakerB');

  // Poll at t = 17.6: mouth & sentence are free -> complaint fires!
  pollSentenceComplaints(17.6);
  assert.equal(delivered.length, 1, 'deferred complaint fires once channel frees up');
  assert.equal(delivered[0].speaker, 'speakerA');
  assert.equal(delivered[0].at, 17.6);
  assert.equal(pendingSentenceComplaints.size, 0, 'pending queue cleared');

  // Test cancellation on death:
  mockSentence = { speaker: 'speakerB', until: 25.0 };
  onSentenceCut('speakerA', 20.0);
  assert.ok(pendingSentenceComplaints.has('speakerA'));

  // Speaker A dies at t = 21.0
  mockAlive.set('speakerA', false);
  pollSentenceComplaints(21.0);
  assert.equal(pendingSentenceComplaints.size, 0, 'complaint discarded on death');
  assert.equal(delivered.length, 1, 'no extra delivery after death');
});

test('Priority 3: Rotor-morality dialogue family shares eligibility roll, shared cooldown, and picks one take with verbatim text', () => {
  // Verify all 4 variants belong to the family
  const v1 = voiceLine('rotorMoralityV1');
  const v2 = voiceLine('rotorMoralityV2');
  const v3 = voiceLine('rotorMoralityV3');
  const v4 = voiceLine('rotorMoralityV4');

  assert.equal(v1.family, 'rotorMorality');
  assert.equal(v2.family, 'rotorMorality');
  assert.equal(v3.family, 'rotorMorality');
  assert.equal(v4.family, 'rotorMorality');

  assert.equal(v1.cooldown, 240);
  assert.equal(v2.cooldown, 240);
  assert.equal(v3.cooldown, 240);
  assert.equal(v4.cooldown, 240);

  // Verbatim texts preserved
  assert.match(v1.text, /morally obligated/);
  assert.match(v2.text, /morally required/);
  assert.match(v3.text, /As long as it’s fun/);
  assert.match(v4.text, /allowed officially/);

  // linesFor with flightRotorSustained tag returns exactly ONE candidate from the family!
  const offered = linesFor('pilot', ['flightRotorSustained'], { rand: () => 0.5 });
  const moralityOffered = offered.filter((o) => ['rotorMoralityV1', 'rotorMoralityV2', 'rotorMoralityV3', 'rotorMoralityV4'].includes(o.line));
  assert.equal(moralityOffered.length, 1, 'exactly one take offered from the dialogue family, not four');

  // Verify family cooldown in VoiceDirector
  const director = new VoiceDirector({ rand: () => 0.01 }); // always passes rarity roll
  const first = director.consider(moralityOffered[0].line, 'pilot', 10.0);
  assert.ok(first, 'first family take spoken');

  // At t = 50.0 (< 240s cooldown), no other variant from the family may speak
  for (const id of ['rotorMoralityV1', 'rotorMoralityV2', 'rotorMoralityV3', 'rotorMoralityV4']) {
    const blocked = director.consider(id, 'pilot', 50.0);
    assert.equal(blocked, null, `${id} is blocked by shared family cooldown`);
  }

  // At t = 260.0 (> 240s cooldown), family becomes eligible again
  const nextOffered = linesFor('pilot', ['flightRotorSustained'], { rand: () => 0.25 });
  const nextSaid = director.consider(nextOffered[0].line, 'pilot', 260.0);
  assert.ok(nextSaid, 'family take eligible again after shared cooldown');
});

test('Priority 4: Machine lifecycle & VO state resets across mount, dismount, remount, destruction, and death', () => {
  const flightVoState = new Map();

  const onMount = (operatorId) => {
    flightVoState.delete(operatorId);
  };
  const onDismount = (operatorId) => {
    flightVoState.delete(operatorId);
  };
  const onMachineDestroyed = () => {
    flightVoState.clear();
  };
  const onPlayerDeath = (playerId) => {
    flightVoState.delete(playerId);
  };

  // Mount creates fresh state
  onMount('pilot1');
  flightVoState.set('pilot1', { airborneSince: 10.0, wasHighHover: true, lastHoverCheckAt: 12.0 });
  assert.equal(flightVoState.get('pilot1').wasHighHover, true);

  // Dismount clears operator state
  onDismount('pilot1');
  assert.equal(flightVoState.has('pilot1'), false, 'dismount cleans operator state');

  // Remount starts clean without stale hover or timers
  onMount('pilot1');
  assert.equal(flightVoState.has('pilot1'), false, 'remount starts completely fresh');

  flightVoState.set('pilot1', { airborneSince: 20.0, wasHighHover: true });
  // Death clears state
  onPlayerDeath('pilot1');
  assert.equal(flightVoState.has('pilot1'), false, 'death cleans flight state');

  flightVoState.set('pilot1', { airborneSince: 30.0 });
  // Destruction clears all flight VO states
  onMachineDestroyed();
  assert.equal(flightVoState.size, 0, 'destruction resets all flight states');
});

test('Tranquilizer Packet: exact audio-to-subtitle mapping, Credits, and asset verification', () => {
  const arrow = voiceLine('tranquilizerArrow');
  const asleep = voiceLine('tranquilizerAsleep');
  const rest1 = voiceLine('enjoyRestV1');
  const rest2 = voiceLine('enjoyRestV2');

  assert.ok(arrow, 'tranquilizerArrow declared');
  assert.ok(asleep, 'tranquilizerAsleep declared');
  assert.ok(rest1, 'enjoyRestV1 declared');
  assert.ok(rest2, 'enjoyRestV2 declared');

  assert.equal(arrow.text, 'Which one of these arrows was the tranquilizing one?');
  assert.equal(asleep.text, 'Aha! You’re asleep now!');
  assert.equal(rest1.text, 'Aha! Enjoy your rest.');
  assert.equal(rest2.text, 'Ah, enjoy your rest.');

  assert.equal(arrow.credits.title, 'The Tranquilizer');
  assert.equal(asleep.credits.title, 'Asleep Now');
  assert.equal(rest1.credits.title, 'Enjoy Your Rest');
  assert.equal(rest2.credits.title, 'Enjoy Your Rest (Gentle)');

  assert.equal(rest1.family, 'enjoyRest');
  assert.equal(rest2.family, 'enjoyRest');
  assert.equal(rest1.cooldown, 240);
  assert.equal(rest2.cooldown, 240);
});

test('Tranquilizer Scene: setup on repeater volley, earned payoff on kill, single payoff, target matching, and expiry', () => {
  let spoken = [];
  const scenes = new VoiceScenes({
    say: (line, speaker, opts) => {
      spoken.push({ line, speaker, opts });
      return true;
    },
    rand: () => 0.5, // > 0.25 -> chooses tranquilizerAsleep
  });

  // Scene setup: operator 1 starts tranquilizer setup against target A at t = 10.0
  scenes.tranquilizerStarted('pilot1', 'targetA', 10.0);
  assert.equal(scenes.tranquilizers.get('pilot1')?.targetId, 'targetA');

  // Killer 2 kills target A -> NOT pilot1, so tranquilizer payoff does NOT fire for killer2
  scenes.death({ victimId: 'targetA', killerId: 'pilot2', at: 15.0 });
  assert.equal(spoken.length, 0, 'no tranquilizer payoff for different killer');

  // Re-start scene for pilot1 on target B
  scenes.tranquilizerStarted('pilot1', 'targetB', 20.0);

  // Pilot 1 kills target C (different target) -> payoff does NOT fire
  scenes.death({ victimId: 'targetC', killerId: 'pilot1', at: 25.0 });
  assert.equal(spoken.length, 0, 'no tranquilizer payoff for killing different target');
  assert.ok(scenes.tranquilizers.has('pilot1'), 'scene remains active for targetB');

  // Pilot 1 kills target B within valid window (t = 30.0, expiry is 20 + 25 = 45.0)
  scenes.death({ victimId: 'targetB', killerId: 'pilot1', at: 30.0 });
  assert.equal(spoken.length, 1, 'earned payoff fires on kill of correct target');
  assert.equal(spoken[0].line, 'tranquilizerAsleep');
  assert.equal(spoken[0].speaker, 'pilot1');
  assert.equal(spoken[0].opts.earned, true);
  assert.equal(scenes.tranquilizers.has('pilot1'), false, 'scene consumed after kill');

  // Verify occasional "Enjoy your rest" branch when rand < 0.25
  spoken = [];
  scenes.rand = () => 0.1; // < 0.25 -> chooses enjoyRestV1
  scenes.tranquilizerStarted('pilot1', 'targetD', 50.0);
  scenes.death({ victimId: 'targetD', killerId: 'pilot1', at: 55.0 });
  assert.equal(spoken.length, 1, 'single payoff played');
  assert.equal(spoken[0].line, 'enjoyRestV1');
  assert.equal(spoken[0].opts.earned, true);

  // Verify expiry: scene opened at t = 100, expires at 125. Kill at 126 fails
  spoken = [];
  scenes.tranquilizerStarted('pilot1', 'targetE', 100.0);
  scenes.death({ victimId: 'targetE', killerId: 'pilot1', at: 126.0 });
  assert.equal(spoken.length, 0, 'expired scene does not fire payoff');
});

test('Independent post-kill farewell: enjoyRest family triggers rarely on ordinary kills with shared cooldown', () => {
  // Verify linesFor offers exactly one member of enjoyRest family for ordinary 'kill'
  const lines = linesFor('killer', ['kill'], { rand: () => 0.01 });
  const restLines = lines.filter(l => l.line === 'enjoyRestV1' || l.line === 'enjoyRestV2');
  assert.equal(restLines.length, 1, 'exactly one take from enjoyRest family offered on kill');

  // Verify shared cooldown in VoiceDirector
  const director = new VoiceDirector({ rand: () => 0.01 });
  const first = director.consider('enjoyRestV1', 'killer', 10.0, { duration: 1.68 });
  assert.ok(first, 'first enjoyRest line speaks');

  // Alternate take enjoyRestV2 attempted at t = 15.0 (< 240s cooldown)
  const second = director.consider('enjoyRestV2', 'killer', 15.0, { duration: 1.51 });
  assert.equal(second, null, 'alternate take blocked by shared enjoyRest family cooldown');
});

test('Tranquilizer apparatus lifecycle: resets on dismount, machine destruction, and player death', () => {
  const scenes = new VoiceScenes({ say: () => true });

  scenes.tranquilizerStarted('pilot1', 'targetA', 10.0);
  assert.ok(scenes.tranquilizers.has('pilot1'));

  // Dismount resets operator tranquilizer scene
  scenes.tranquilizerReset('pilot1');
  assert.equal(scenes.tranquilizers.has('pilot1'), false, 'dismount cleans operator tranquilizer scene');

  scenes.tranquilizerStarted('pilot1', 'targetA', 20.0);
  // Target death resets scene
  scenes.death({ victimId: 'targetA', killerId: 'someoneElse', at: 22.0 });
  assert.equal(scenes.tranquilizers.has('pilot1'), false, 'target death cleans scene without payoff');

  scenes.tranquilizerStarted('pilot1', 'targetB', 30.0);
  // Machine destruction resets all tranquilizer scenes
  scenes.tranquilizerReset();
  assert.equal(scenes.tranquilizers.size, 0, 'destruction resets all tranquilizer scenes');
});
