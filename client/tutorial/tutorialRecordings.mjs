import { TUTORIAL_BEATS, TUTORIAL_BRANCHES } from './tutorialScript.mjs';

// Stable filenames and actor attribution for the creator's future recordings.
// These are requested recordings, not assertions that any audio exists.
export function tutorialRecordingPlan(beats = [...TUTORIAL_BEATS, ...Object.values(TUTORIAL_BRANCHES).flat()]) {
  return beats.filter(beat => beat.recordingKey).map(beat => ({
    key: beat.recordingKey, beatId: beat.id, speaker: beat.speaker,
    text: beat.line, sourceFile: `${beat.recordingKey}.wav`,
    fileBase: `${beat.speaker}/${beat.recordingKey}-1`,
    chapter: beat.chapter, segment: beat.segment,
    presentation: beat.presentation, optionalBranch: beat.branch ?? null,
    ...(beat.optionalSegment ? { optionalSegment: beat.optionalSegment } : {}),
    ...(beat.rehearsalSec !== undefined ? { rehearsalSec: beat.rehearsalSec } : {}),
    ...(beat.stageCue ? { stageCue: beat.stageCue } : {}),
    ...(beat.performanceCue ? { performanceCue: beat.performanceCue } : {}),
  }));
}

// The existing SoundEngine already routes the voice bus and honors sound settings.
// A future tutorial loader supplies a decoded take; do not add these keys to
// ordinary VoiceBank.say(), whose random combat rules require registered lines.
export function playTutorialCue({ cue, buffer, engine, onCaption = () => {}, onComplete = () => {} }) {
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
