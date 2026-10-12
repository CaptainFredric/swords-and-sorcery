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
export function playTutorialCue({ cue, buffer, engine, context = {}, onCaption = () => {}, onComplete = () => {} }) {
  cue = tutorialCueForDevice(cue, context);
  if (!cue?.recordingKey) return null;
  onCaption({ speaker: cue.speaker, text: cue.line, recordingKey: cue.recordingKey });
  if (!buffer || !engine.running) return null; // caption presentation is owned by the director
  const handle = engine.playBuffer(buffer, { bus: 'voice', gain: 1, reverb: 0 });
  if (!handle) return null;
  let stopped = false;
  handle.source.addEventListener('ended', () => { if (!stopped) onComplete(cue); }, { once: true });
  engine.duck?.(buffer.duration);
  return { stop() { stopped = true; handle.stop(0.08); } };
}
