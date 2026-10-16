import { TUTORIAL_BEATS, TUTORIAL_BRANCHES } from './tutorialScript.mjs';

// Stable filenames and actor attribution for the creator's future recordings.
// These are requested recordings, not assertions that any audio exists.
function recordingTake(beat, { key = beat.recordingKey, text = beat.line, beatId = beat.id, device = null } = {}) {
  return {
    key, beatId, speaker: beat.speaker, text,
    sourceFile: `${key}.wav`, fileBase: `${beat.speaker}/${key}-1`,
    chapter: beat.chapter, segment: beat.segment,
    presentation: beat.presentation, optionalBranch: beat.branch ?? null,
    ...(device ? { device } : {}),
    ...(beat.optionalSegment ? { optionalSegment: beat.optionalSegment } : {}),
    ...(beat.rehearsalSec !== undefined ? { rehearsalSec: beat.rehearsalSec } : {}),
    ...(beat.pauseAfterSec !== undefined ? { pauseAfterSec: beat.pauseAfterSec } : {}),
    ...(beat.stageCue ? { stageCue: beat.stageCue } : {}),
    ...(beat.performanceCue ? { performanceCue: beat.performanceCue } : {}),
  };
}

export function tutorialCueForDevice(cue, { touch = false } = {}) {
  if (!cue || !touch || !cue.touchLine) return cue;
  return { ...cue, line: cue.touchLine, recordingKey: cue.touchRecordingKey ?? cue.recordingKey };
}

export function tutorialRecordingPlan(beats = [...TUTORIAL_BEATS, ...Object.values(TUTORIAL_BRANCHES).flat()]) {
  return beats.filter(beat => beat.recordingKey).flatMap(beat => {
    const base = recordingTake(beat, beat.touchLine ? { device: 'desktop' } : {});
    if (!beat.touchLine || !beat.touchRecordingKey) return [base];
    return [base, recordingTake(beat, { key: beat.touchRecordingKey, text: beat.touchLine, beatId: beat.touchBeatId ?? beat.id, device: 'touch' })];
  });
}

// The existing SoundEngine already routes the voice bus and honors sound settings.
// A future tutorial loader supplies a decoded take; do not add these keys to
// ordinary VoiceBank.say(), whose random combat rules require registered lines.
export function playTutorialCue({ cue, buffer, engine, director = null, onCaption = () => {}, onComplete = () => {} }) {
  if (!cue?.recordingKey) return null;
  if (director) {
    const active = cue.branch ? director.optionalCue : director.cue;
    if (!active || active.id !== cue.id || active.runId !== cue.runId) return null;
  }
  onCaption({ speaker: cue.speaker, text: cue.line, recordingKey: cue.recordingKey });
  if (!buffer || !engine.running) return null; // caption presentation is owned by the director
  const isNarrator = cue.speaker === 'narrator';
  // Lift tutorial voice volume for greater audibility; ease room boxiness/echo on narrator
  const gain = isNarrator ? 1.25 : 1.2;
  const shape = isNarrator ? (ctx => {
    if (!ctx?.createGain || !ctx?.createBiquadFilter) return null;
    const input = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const deecho = ctx.createBiquadFilter();
    deecho.type = 'peaking';
    deecho.frequency.value = 350;
    deecho.gain.value = -3.5;
    deecho.Q.value = 1.0;
    const air = ctx.createBiquadFilter();
    air.type = 'peaking';
    air.frequency.value = 3200;
    air.gain.value = 1.2;
    air.Q.value = 0.9;
    input.connect(hp).connect(deecho).connect(air);
    return { input, output: air, nodes: [input, hp, deecho, air] };
  }) : null;
  const handle = engine.playBuffer(buffer, { bus: 'voice', gain, reverb: 0, echo: null, ...(shape ? { shape } : {}) });
  if (!handle) return null;
  director?.beginAudio(cue);
  let stopped = false;
  handle.source.addEventListener('ended', () => {
    if (stopped) return;
    if (cue.branch) director?.completeOptionalDialogue(cue); else director?.completeDialogue(cue);
    onComplete(cue);
  }, { once: true });
  engine.duck?.(buffer.duration);
  return { stop() { stopped = true; director?.stopAudio(cue); handle.stop(0.08); } };
}
