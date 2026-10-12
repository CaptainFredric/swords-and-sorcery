import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { TutorialDirector } from './TutorialDirector.mjs';
import { TUTORIAL_BRANCHES, TUTORIAL_SEGMENTS } from './tutorialScript.mjs';
import { tutorialRecordingPlan } from './tutorialRecordings.mjs';
import { TutorialVoice } from './tutorialVoice.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, ROOT), 'utf8');
const manifest = JSON.parse(read('client/assets/tutorial-voice/manifest.json')).takes;
const sources = JSON.parse(read('tools/audio/tutorial-voice-sources.json')).takes;
const chains = JSON.parse(read('tools/audio/tutorial-voice-chains.json'));
const plan = tutorialRecordingPlan();

// The keys with no take yet (named in docs/tutorial-voice.md; captions only until they are recorded): none since
// 2026-10-12.
const NOT_RECORDED = [];

test('every recorded key of the plan has its take on disk, with its speaker, and nothing else is shipped', () => {
  const recorded = plan.filter(take => !NOT_RECORDED.includes(take.key));
  assert.deepEqual(Object.keys(manifest).sort(), recorded.map(take => take.key).sort());
  for (const take of recorded) {
    const entry = manifest[take.key];
    assert.equal(entry.file, take.fileBase, `${take.key}: the plan's own file name`);
    assert.equal(entry.speaker, take.speaker, `${take.key}: spoken by its own character`);
    for (const extension of ['m4a', 'mp3']) assert.ok(existsSync(new URL(`client/assets/tutorial-voice/${entry.file}.${extension}`, ROOT)), `${entry.file}.${extension}`);
    assert.ok(entry.seconds > 0.3 && entry.seconds < 12, `${take.key}: ${entry.seconds}s`);
    // (the recorder's padding is gone: each take begins within a breath of its first word)
    assert.ok(entry.onset >= 0 && entry.onset <= 0.2, `${take.key}: speech ${entry.onset}s in`);
  }
});

test('each raw take is accounted for once, and every exception or repair says why', () => {
  const keys = new Set(plan.map(take => take.key));
  const served = new Map();
  for (const take of sources) {
    assert.match(take.sha256, /^[0-9a-f]{64}$/, take.raw);
    assert.ok(chains.roles[take.speaker], take.raw);
    if (take.chain?.preset) assert.ok(chains.roles[take.speaker].presets[take.chain.preset], `${take.raw}: ${take.chain.preset}`);
    if (take.chain) assert.ok(take.chain.why, `${take.raw}: why its own treatment`);
    for (const fix of take.repairs ?? []) assert.ok(['mend', 'release'].includes(fix.kind) && fix.why, `${take.raw}: ${JSON.stringify(fix)}`);
    if (take.key) {
      assert.ok(keys.has(take.key), `${take.raw}: ${take.key} is in the plan`);
      // (a caption is the script's: a take carries words only where the script is catching up with it)
      if (take.status === 'intended') assert.ok(take.words && take.note, take.raw);
      else assert.equal(take.words, undefined, take.raw);
      // (a take set aside by the creator, or the same file supplied twice, is listed and never played)
      if (take.status === 'duplicate') assert.equal(sources.find(other => other.raw === take.sameAs)?.sha256, take.sha256, take.raw);
      if (take.status === 'dropped' || take.status === 'duplicate') assert.ok(take.note, take.raw);
      if (!['alternate', 'dropped', 'duplicate'].includes(take.status)) served.set(take.key, [...(served.get(take.key) ?? []), take.raw]);
    } else {
      assert.ok(['unplaced', 'general'].includes(take.status), take.raw);
      assert.ok(take.words && take.note, `${take.raw}: what it says and why it has no place`);
    }
  }
  for (const [key, raws] of served) assert.equal(raws.length, 1, `${key}: ${raws}`);
  assert.deepEqual([...keys].filter(key => !served.has(key)).sort(), [...NOT_RECORDED].sort());
});

test('each character\'s treatment is one named preset, its earlier ones kept to go back to', () => {
  for (const [role, { use, presets }] of Object.entries(chains.roles)) {
    assert.ok(presets[use], `${role} uses ${use}`);
    for (const [name, preset] of Object.entries(presets)) assert.ok(preset.about && Number.isFinite(preset.lufs), `${role}/${name}`);
  }
  // the creator's settings (2026-10-12)
  const rival = chains.roles.rival.presets[chains.roles.rival.use];
  assert.equal(rival.formants, 0.94);
  assert.equal(rival.pitch.semitones, -1.5);
  assert.equal(rival.helm.grit, 0, 'no grit for Rival');
  const knight = chains.roles.spellblade.presets[chains.roles.spellblade.use];
  assert.equal(knight.helm.amount, 1, 'the established helm');
  assert.equal(knight.pitch.engine, 'vocoder');
  assert.equal(chains.roles.narrator.presets[chains.roles.narrator.use].pitch, undefined, 'the narrator is not pitched');
});

// (an engine, a page and a clock, in miniature: a take plays until the test says it has ended)
function rig({ running = true, muted = false, takes = manifest } = {}) {
  const played = [];
  let clock = 0;
  const timers = [];
  const engine = { running, muted, ctx: { decodeAudioData: async data => ({ duration: data.seconds }) }, duck() {},
    playBuffer(buffer, options) {
      const take = { buffer, options, ended: null, stopped: false };
      played.push(take);
      return { source: { addEventListener: (type, listener) => { take.ended = listener; } }, stop: () => { take.stopped = true; } };
    } };
  const fetch = async url => {
    if (url.endsWith('manifest.json')) return { ok: true, json: async () => ({ takes }) };
    const file = Object.values(takes).find(take => url.includes(`${take.file}.m4a`));
    return file ? { ok: true, arrayBuffer: async () => ({ seconds: file.seconds }) } : { ok: false };
  };
  const context = { touch: false };
  const voice = new TutorialVoice({ engine, fetch, context: () => context, now: () => clock,
    setTimer: (fn, ms) => { const timer = { fn, at: clock + ms }; timers.push(timer); return timer; },
    clearTimer: timer => { const i = timers.indexOf(timer); if (i >= 0) timers.splice(i, 1); } });
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));
  const advance = async ms => {
    clock += ms;
    for (let due; (due = timers.filter(timer => timer.at <= clock).sort((a, b) => a.at - b.at)[0]);) {
      timers.splice(timers.indexOf(due), 1);
      due.fn();
      await settle();
    }
  };
  return { engine, voice, played, advance, settle, context };
}

function voicedDirector(voice, options = {}) {
  const director = new TutorialDirector({ ...options, onChange: () => voice.sync(director) });
  return director;
}

const lineOf = key => plan.find(take => take.key === key);

test('a take plays as its line is shown; its real end, then the director\'s pause, brings the next line and its take', async () => {
  const { voice, played, settle } = rig();
  await voice.load();
  const director = voicedDirector(voice);
  director.start();
  await settle();
  assert.equal(director.current.id, 'greeting');
  assert.equal(played.length, 1);
  assert.equal(played[0].options.bus, 'voice');
  assert.equal(played[0].buffer.duration, manifest['tutorial.greeting'].seconds);
  // (the caption clock does not move a voiced line on, however long it plays)
  director.tick(0); director.tick(60);
  assert.equal(director.current.id, 'greeting');
  played[0].ended();
  director.tick(60.2);
  assert.equal(director.current.id, 'greeting', 'the pause after a line, before the answer');
  director.tick(60.4);
  await settle();
  assert.equal(director.current.id, 'exemplary');
  assert.equal(played.length, 2);
  assert.equal(played[1].buffer.duration, manifest['tutorial.exemplary'].seconds);
});

test('Continue, restart and leaving silence the take, and its late end never moves anything', async () => {
  const { voice, played, settle } = rig();
  await voice.load();
  const director = voicedDirector(voice);
  director.start();
  await settle();
  director.tick(1);
  director.completeDialogue(director.cue);            // Continue, mid-line
  director.tick(1.4);
  await settle();
  assert.equal(played[0].stopped, true);
  assert.equal(director.current.id, 'exemplary');
  played[0].ended?.();
  director.tick(10);
  assert.equal(director.current.id, 'exemplary', 'the greeting\'s end, after it was cut, moves nothing');
  director.start();                                   // Restart
  await settle();
  assert.equal(played[1].stopped, true);
  assert.equal(director.current.id, 'greeting');
  voice.stop();                                       // Leave
  assert.equal(played[2].stopped, true);
  played[2].ended?.();
  director.tick(20);
  assert.equal(director.current.id, 'greeting');
});

test('unheard (muted, or the sound not yet unlocked), nothing plays and the director paces lines as before', async () => {
  for (const options of [{ muted: true }, { running: false }]) {
    const { voice, played } = rig(options);
    await voice.load();
    const segments = TUTORIAL_SEGMENTS.filter(segment => segment.id === 'stamina');
    const director = voicedDirector(voice, { segments, beats: segments[0].beats.filter(beat => beat.kind === 'dialogue') });
    director.start();
    assert.equal(played.length, 0);
    const silent = new TutorialDirector({ segments, beats: segments[0].beats.filter(beat => beat.kind === 'dialogue') });
    silent.start();
    for (const t of [0, 0.5, 1, 1.5, 2, 2.5, 3]) { director.tick(t); silent.tick(t); }
    assert.equal(director.current.id, silent.current.id, 'the same pacing as a tutorial with no recordings');
  }
});

test('a touch screen hears the touch take of a line written for it', async () => {
  const { voice, played, context, settle } = rig();
  context.touch = true;
  await voice.load();
  const segments = TUTORIAL_SEGMENTS.filter(segment => segment.id === 'stamina');
  const director = voicedDirector(voice, { segments, beats: segments[0].beats.filter(beat => beat.kind === 'dialogue') });
  director.start();
  await settle();
  assert.equal(played[0].buffer.duration, manifest['tutorial.what-is-above'].seconds);
  assert.equal(voice.seconds(director.cue), manifest['tutorial.what-is-above'].seconds);
});

test('an optional exchange is voiced line by line, each with its own pause: "Then no." on the heels of "No."', async () => {
  const { voice, played, settle } = rig();
  await voice.load();
  const segments = TUTORIAL_SEGMENTS.filter(segment => segment.id === 'counterfire');
  const director = voicedDirector(voice, { segments, beats: [{ ...segments[0].beats[0], advanceOn: 'never' }],
    branches: TUTORIAL_BRANCHES });
  director.start();
  director.tick(0);
  director.offerBranch('permission-to-stop');
  await settle();
  const said = () => played.at(-1).buffer.duration;
  assert.equal(said(), manifest['tutorial.permission-stop'].seconds);
  played.at(-1).ended(); director.tick(0.35); await settle();
  assert.equal(said(), manifest['tutorial.no-longer-ruin'].seconds);
  played.at(-1).ended(); director.tick(0.7); await settle();
  assert.equal(said(), manifest['tutorial.permission-no'].seconds);
  played.at(-1).ended();
  director.tick(0.7 + lineOf('tutorial.permission-no').pauseAfterSec); await settle();
  assert.equal(director.optionalCue.id, 'then-no');
  assert.equal(said(), manifest['tutorial.then-no'].seconds);
});

test('a line shown before the list of takes arrives is voiced once it does', async () => {
  const { voice, played, settle } = rig();
  const director = voicedDirector(voice);
  director.start();
  assert.equal(played.length, 0);
  await settle(); await settle();
  assert.equal(played.length, 1);
  assert.equal(played[0].buffer.duration, manifest['tutorial.greeting'].seconds);
});

test('no one speaks over the arena gate: the first take waits for it to lift', async () => {
  const { voice, played, advance, settle } = rig();
  await voice.load();
  voice.quietFor(1.35);
  const director = voicedDirector(voice);
  director.start();
  await settle();
  assert.equal(played.length, 0);
  await advance(1349);
  assert.equal(played.length, 0);
  await advance(1);
  assert.equal(played.length, 1);
});

test('a take whose end is never heard is let go, and the director paces the line from there', async () => {
  const { voice, played, advance, settle } = rig();
  await voice.load();
  const director = voicedDirector(voice);
  director.start();
  await settle();
  assert.ok(director.audioCue);
  await advance((manifest['tutorial.greeting'].seconds + 1.5) * 1000);
  assert.equal(played[0].stopped, true);
  assert.equal(director.audioCue, null);
});

test('the game plays the takes: the tutorial voice follows the director, stops with the lesson and waits for the gate', () => {
  const main = read('client/main.mjs');
  assert.match(main, /tutorialVoice \?\?= new TutorialVoice\(\{ engine: sound, context: \(\) => \(\{ touch: touchUi \}\) \}\);/);
  assert.match(main, /tutorialView\.show\(progress\);\n\s+tutorialVoice\.sync\(tutorialSession\?\.director\);/);
  assert.match(main, /tutorialVoice\?\.stop\(\);\n\s+endingTutorial\?\.stop\(\);/);
  assert.match(main, /if \(tutorialSession\) tutorialVoice\?\.quietFor\(1\.35\);/);
});
