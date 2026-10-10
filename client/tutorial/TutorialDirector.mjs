import { TUTORIAL_BEATS, TUTORIAL_CHAPTERS, TUTORIAL_BRANCHES } from './tutorialScript.mjs';

// Rehearsal/recording-ready state machine. Production combat cues will come from
// local Practice/Room events when the scripted rival encounter is implemented.
// It never alters health, hits, stamina, movement or the shared combat simulator.
export class TutorialDirector {
  constructor({ beats = TUTORIAL_BEATS, prototypeStop = null, onChange = () => {} } = {}) {
    if (!Array.isArray(beats) || beats.length === 0) throw new Error('Tutorial needs beats');
    if (new Set(beats.map(beat => beat.id)).size !== beats.length ||
        beats.some(beat => !beat.id || !beat.advanceOn || (beat.kind !== 'stage' && !beat.line))) {
      throw new Error('Tutorial beats need unique IDs, cues and authored text');
    }
    if (prototypeStop && !beats.some(beat => beat.chapter === prototypeStop)) throw new Error('Unknown prototype chapter');
    if (prototypeStop && TUTORIAL_CHAPTERS.find(chapter => chapter.id === prototypeStop)?.implemented === false) throw new Error('Prototype stop must be implemented');
    this.prototypeStop = prototypeStop;
    this.branchesSeen = new Set();
    this.branchQueue = [];
    this.beats = beats;
    this.onChange = onChange;
    this.runId = 0;
    this.index = 0;
    this.state = 'idle';
  }

  get current() { return this.state === 'running' ? this.beats[this.index] : null; }
  get progress() {
    const finished = ['prototype-ended', 'complete'].includes(this.state);
    const beat = this.beats[Math.max(0, this.index - (finished ? 1 : 0))];
    return { chapter: TUTORIAL_CHAPTERS.find(chapter => chapter.id === beat?.chapter),
      state: this.state, index: this.index, total: this.beats.length,
      current: this.current, optional: this.optionalCue };
  }

  start() {
    this.runId += 1;
    this.branchesSeen.clear();
    this.branchQueue = [];
    this.index = 0;
    this.state = 'running';
    this.onChange(this.progress);
    return this.current;
  }

  // Keep this token with the audio handle. A late completion from an old run or
  // previous line cannot advance the current dialogue after skip/restart.
  get cue() {
    return this.current?.kind === 'dialogue'
      ? Object.freeze({ ...this.current, runId: this.runId }) : null;
  }

  get optionalCue() {
    return this.state === 'running' && this.branchQueue.length
      ? Object.freeze({ ...this.branchQueue[0], runId: this.runId }) : null;
  }

  completeOptionalDialogue(cue) {
    if (!cue || cue.runId !== this.runId || cue.id !== this.optionalCue?.id) return false;
    this.branchQueue.shift();
    this.onChange(this.progress);
    return true;
  }

  completeDialogue(cue) {
    if (!cue || cue.runId !== this.runId || cue.id !== this.current?.id
      || this.current.kind !== 'dialogue') return false;
    return this.accept('continue');
  }

  // Wrong inputs are ignored. In particular, a sword swing isn't a sword hit,
  // and lowering Guard isn't the same as suffering a scripted postscript hit.
  accept(cue) {
    if (!this.current || this.current.advanceOn !== cue) return false;
    const chapter = this.current.chapter;
    this.index += 1;
    if (chapter === this.prototypeStop && this.beats[this.index]?.chapter !== chapter) this.state = 'prototype-ended';
    else if (this.index === this.beats.length) this.state = 'complete';
    this.onChange(this.progress);
    return true;
  }

  offerBranch(id) {
    if (this.state !== 'running' || this.branchesSeen.has(id) || !TUTORIAL_BRANCHES[id]) return false;
    this.branchesSeen.add(id);
    this.branchQueue.push(...TUTORIAL_BRANCHES[id]);
    this.onChange(this.progress);
    return true;
  }

  skip() {
    if (this.state !== 'running') return false;
    this.state = 'skipped';
    this.onChange(this.progress);
    return true;
  }

  reset() {
    this.runId += 1;
    this.branchesSeen.clear();
    this.branchQueue = [];
    this.index = 0;
    this.state = 'idle';
    this.onChange(this.progress);
  }
}
