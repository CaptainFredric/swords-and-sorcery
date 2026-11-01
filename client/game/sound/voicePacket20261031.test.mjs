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
