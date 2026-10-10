import { TUTORIAL_BEATS } from './tutorialScript.mjs';

// Rehearsal/recording-ready state machine. Production combat cues will come from
// local Practice/Room events when the scripted rival encounter is implemented.
// It never alters health, hits, stamina, movement or the shared combat simulator.
export class TutorialDirector {
  constructor({ beats = TUTORIAL_BEATS, onChange = () => {} } = {}) {
    if (!Array.isArray(beats) || beats.length === 0) throw new Error('Tutorial needs beats');
    if (new Set(beats.map(beat => beat.id)).size !== beats.length ||
        beats.some(beat => !beat.id || !beat.advanceOn || (beat.kind !== 'stage' && !beat.line))) {
      throw new Error('Tutorial beats need unique IDs, cues and authored text');
    }
    this.beats = beats;
    this.onChange = onChange;
    this.reset();
  }

  get current() { return this.state === 'running' ? this.beats[this.index] : null; }
  get progress() { return { state: this.state, index: this.index, total: this.beats.length, current: this.current }; }

  start() {
    this.index = 0;
    this.state = 'running';
    this.onChange(this.progress);
    return this.current;
  }

  // Wrong inputs are ignored. In particular, a sword swing isn't a sword hit,
  // and lowering Guard isn't the same as suffering a scripted postscript hit.
  accept(cue) {
    if (!this.current || this.current.advanceOn !== cue) return false;
    this.index += 1;
    if (this.index === this.beats.length) this.state = 'complete';
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
    this.index = 0;
    this.state = 'idle';
    this.onChange(this.progress);
  }
}
