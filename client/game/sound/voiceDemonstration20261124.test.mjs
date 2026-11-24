import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VoiceDirector, VOICE_LINES } from './voiceRules.mjs';
import { VoiceMoments } from './voiceMoments.mjs';
import { VoiceScenes, SCENES } from './voiceScenes.mjs';
import { voiceLine, partText } from './voiceLines.mjs';
import { captionPlan, subtitleFor } from '../../ui/voiceLibrary.mjs';

const manifest = JSON.parse(readFileSync(new URL('../../assets/voice/manifest.json', import.meta.url), 'utf8'));

// A simulated game audio/HUD harness modeling Castleward's live presentation runtime
function createGameplayVoiceHarness() {
  const director = new VoiceDirector({ rand: () => 0.05 });
  const hud = {
    subtitles: [],
    activeSubtitles: new Map(),
    subtitle({ text, speaker, seconds, delay = 0, name = null, cues = [] }) {
      const entry = { text, speaker, seconds, delay, name, cues, at: clock };
      this.subtitles.push(entry);
      this.activeSubtitles.set(speaker, entry);
    },
    removeSubtitle(speaker) {
      this.activeSubtitles.delete(speaker);
    },
  };

  const audio = {
    played: [],
    playing: new Map(),
    play(line, takeIndex, speaker, { delay = 0, duration = 1.0, part = null } = {}) {
      const entry = { line, takeIndex, speaker, delay, duration, part, startedAt: clock + delay };
      this.played.push(entry);
      const handle = {
        entry,
        stop: () => {
          this.playing.delete(speaker);
          hud.removeSubtitle(speaker);
        },
      };
      this.playing.set(speaker, handle);
      return handle;
    },
  };

  let clock = 100.0;

  const scenes = new VoiceScenes({
    say: (line, speaker, options = {}) => {
      return speak(line, speaker, options);
    },
  });

  const moments = new VoiceMoments();

  function speak(line, speaker, options = {}) {
    const rule = VOICE_LINES[line];
    if (!rule) return false;
    const part = options.part ?? (rule.parts ? 0 : null);
    const takes = manifest.lines[line] ?? [];
    const takeIndex = part !== null ? part : 0;
    const takeData = takes[takeIndex] ?? { file: `${line}-1`, seconds: 1.5 };
    const duration = takeData.seconds;

    const allowed = director.consider(line, speaker, clock, {
      duration,
      part: options.part,
      earned: options.earned,
      disruptedSpeaker: options.disruptedSpeaker,
    });
    if (!allowed) return false;

    // Cut any interrupted speakers
    if (allowed.stop) {
      for (const stoppedId of allowed.stop) {
        const handle = audio.playing.get(stoppedId);
        if (handle) handle.stop();
      }
    }

    // Play audio
    audio.play(line, takeIndex, speaker, { delay: options.delay ?? 0, duration, part });

    // Show subtitle
    const plan = captionPlan(line, { part, beats: takeData.beats });
    if (plan) {
      hud.subtitle({
        text: plan.text,
        speaker,
        seconds: duration,
        delay: options.delay ?? 0,
        cues: plan.cues,
      });
    }

    return { seconds: duration, delay: options.delay ?? 0 };
  }

  return {
    director,
    hud,
    audio,
    scenes,
    moments,
    speak,
    getClock: () => clock,
    advance: (dt) => {
      clock += dt;
      // Step scenes
      scenes.step(clock, [
        { id: 'playerA', alive: true },
        { id: 'playerB', alive: true },
        { id: 'playerC', alive: true },
      ]);
      // Expire finished audio
      for (const [spk, handle] of [...audio.playing]) {
        if (clock >= handle.entry.startedAt + handle.entry.duration) {
          audio.playing.delete(spk);
          hud.removeSubtitle(spk);
        }
      }
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Demonstration 1: "Wait a minute. Ha! I stabbed you!"
// ------------------------------------------------------------------------------------------------

test('Demonstration: Wait a minute / Ha! I stabbed you! live combat flow', () => {
  const g = createGameplayVoiceHarness();

  // 1. In duel engagement, Player A initiates setup
  g.scenes.waitStabbedStarted('playerA', 'playerB', 'waitIStabbedYouV1', g.getClock(), 0.58);
  g.speak('waitIStabbedYouV1', 'playerA', { part: 0, opening: true });

  assert.equal(g.audio.played.length, 1);
  assert.equal(g.audio.played[0].line, 'waitIStabbedYouV1');
  assert.equal(g.audio.played[0].part, 0);
  assert.equal(g.hud.subtitles.length, 1);
  assert.equal(g.hud.subtitles[0].text, 'Wait a minute.');
  assert.ok(!g.hud.subtitles[0].text.includes('stabbed'), 'punchline is not in setup subtitle');

  // Advance clock past setup delivery ("Wait a minute." finishes at 0.58s)
  g.advance(0.65);

  // 2. Non-qualifying events: Miss, Parry, Block, Spell damage must NOT trigger payoff
  g.scenes.damage({ type: 'damage', victimId: 'playerB', attackerId: 'playerA', source: 'sword', blocked: true, amount: 15, at: g.getClock() });
  assert.equal(g.audio.played.length, 1, 'blocked strike did not earn payoff');

  g.scenes.damage({ type: 'damage', victimId: 'playerB', attackerId: 'playerA', source: 'sword', parried: true, amount: 0, at: g.getClock() });
  assert.equal(g.audio.played.length, 1, 'parry did not earn payoff');

  g.scenes.damage({ type: 'damage', victimId: 'playerB', attackerId: 'playerA', source: 'fireball', amount: 30, at: g.getClock() });
  assert.equal(g.audio.played.length, 1, 'fireball damage did not earn payoff');

  // Hitting an unrelated knight (playerC) must NOT trigger payoff
  g.scenes.damage({ type: 'damage', victimId: 'playerC', attackerId: 'playerA', source: 'sword', amount: 25, at: g.getClock() });
  assert.equal(g.audio.played.length, 1, 'hitting bystander did not earn payoff');

  // 3. Qualifying event: Damaging sword contact on Player B earns payoff!
  g.scenes.damage({ type: 'damage', victimId: 'playerB', attackerId: 'playerA', source: 'sword', amount: 28, at: g.getClock() });
  assert.equal(g.audio.played.length, 2, 'earned payoff played');
  assert.equal(g.audio.played[1].line, 'waitIStabbedYouV1');
  assert.equal(g.audio.played[1].part, 1);
  assert.equal(g.hud.subtitles.length, 2);
  assert.equal(g.hud.subtitles[1].text, 'Ha! I stabbed you!');
});

test('Demonstration: Wait a minute (Take 2 variant) with Riposte payoff', () => {
  const g = createGameplayVoiceHarness();

  // Variant 2 setup
  g.scenes.waitStabbedStarted('playerA', 'playerB', 'waitIStabbedYouV2', g.getClock(), 0.55);
  g.speak('waitIStabbedYouV2', 'playerA', { part: 0, opening: true });

  assert.equal(g.audio.played[0].line, 'waitIStabbedYouV2');
  assert.equal(g.audio.played[0].part, 0);
  assert.equal(g.hud.subtitles[0].text, 'Wait a minute.');

  g.advance(0.60);

  // Riposte damage earns payoff and preserves Take 2 variant
  g.scenes.damage({ type: 'damage', victimId: 'playerB', attackerId: 'playerA', source: 'riposte', amount: 35, at: g.getClock() });
  assert.equal(g.audio.played.length, 2);
  assert.equal(g.audio.played[1].line, 'waitIStabbedYouV2', 'paired take variant preserved');
  assert.equal(g.audio.played[1].part, 1);
  assert.equal(g.hud.subtitles[1].text, 'Ha! I stabbed you!');
});

// ------------------------------------------------------------------------------------------------
// Demonstration 2: "Would you like to die over there or over here? Here it is!"
// ------------------------------------------------------------------------------------------------

test('Demonstration: Die over there or over here live pursuit and kill flow', () => {
  const g = createGameplayVoiceHarness();

  // 1. Player A opens scene on fleeing Player B
  g.scenes.dieOverThereStarted('playerA', 'playerB', g.getClock(), 2.8);
  g.speak('dieOverThereOrHere', 'playerA', { part: 0, opening: true });

  assert.equal(g.audio.played.length, 1);
  assert.equal(g.audio.played[0].line, 'dieOverThereOrHere');
  assert.equal(g.audio.played[0].part, 0);
  assert.equal(g.hud.subtitles.length, 1);
  assert.equal(g.hud.subtitles[0].text, 'Would you like to die over there or over here?');
  assert.ok(!g.hud.subtitles[0].text.includes('Here it is'), 'punchline is not spoiled during setup');

  g.advance(3.0);

  // 2. Unrelated kill of Player C must NOT earn payoff
  g.scenes.death({ type: 'death', victimId: 'playerC', killerId: 'playerA', at: g.getClock() });
  assert.equal(g.audio.played.length, 1, 'unrelated kill did not earn punchline');

  // 3. Felling the actual pursued target Player B earns "Here it is!"
  g.scenes.death({ type: 'death', victimId: 'playerB', killerId: 'playerA', at: g.getClock() });
  assert.equal(g.audio.played.length, 2, 'target defeat earned punchline');
  assert.equal(g.audio.played[1].line, 'dieOverThereOrHere');
  assert.equal(g.audio.played[1].part, 1);
  assert.equal(g.hud.subtitles.length, 2);
  assert.equal(g.hud.subtitles[1].text, 'Here it is!');
});

// ------------------------------------------------------------------------------------------------
// Demonstration 3: Gale Silent Treatment Interruption
// ------------------------------------------------------------------------------------------------

test('Demonstration: Gale displacement interrupts speaking opponent and clears subtitle', () => {
  const g = createGameplayVoiceHarness();

  // 1. Player B starts delivering ordinary spoken banter
  const spoke = g.speak('openUp', 'playerB', { duration: 3.5 });
  assert.ok(spoke, 'player B started speaking');
  assert.equal(g.hud.activeSubtitles.has('playerB'), true);
  assert.equal(g.audio.playing.has('playerB'), true);

  // 2. Player A casts Gale and displaces Player B while speaking
  g.advance(0.8);
  const galeEvent = {
    playerId: 'playerA',
    affected: [{ id: 'playerB', guarded: false, pressure: 0.9 }],
    at: g.getClock(),
  };

  const groups = g.moments.galeCaught(galeEvent, {
    speakingCheck: (id) => g.director.saying(id, g.getClock()) !== null,
  });

  const casterGroup = groups.find((grp) => grp.some((s) => s.speaker === 'playerA'));
  assert.ok(casterGroup, 'galeCaught returned candidate group for caster');
  const silentSay = casterGroup.find((s) => s.line === 'silentTreatment');
  assert.ok(silentSay, 'silentTreatment moment selected for displaced speaker');
  assert.equal(silentSay.disruptedSpeaker, 'playerB');

  // 3. Player A delivers "This wind shall administer the silent treatment."
  const result = g.speak('silentTreatment', 'playerA', silentSay);
  assert.ok(result, 'silentTreatment spoken');

  // Verify Player B was abruptly interrupted and their subtitle cleared
  assert.equal(g.audio.playing.has('playerB'), false, 'player B audio stopped');
  assert.equal(g.hud.activeSubtitles.has('playerB'), false, 'player B subtitle removed');

  // Verify Player A is now speaking with active subtitle
  assert.equal(g.audio.playing.has('playerA'), true, 'player A audio playing');
  assert.equal(g.hud.activeSubtitles.get('playerA')?.text, 'This wind shall administer the silent treatment.');
});

test('Demonstration: Gale displacement does NOT silence high priority death cry', () => {
  const g = createGameplayVoiceHarness();

  // Player B is uttering high priority death cry
  g.speak('knightFallen', 'playerB', { duration: 3.0 });
  assert.ok(g.audio.playing.has('playerB'));

  // Player A hits with Gale
  const galeLine = g.speak('silentTreatment', 'playerA', {
    disruptedSpeaker: 'playerB',
    duration: 3.0,
  });

  // State-level death announcement is preserved
  assert.equal(g.audio.playing.has('playerB'), true, 'death cry preserved against Gale interruption');
});
