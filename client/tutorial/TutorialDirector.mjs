import * as script from './tutorialScript.mjs';
const { TUTORIAL_CHAPTERS, TUTORIAL_BRANCHES, TUTORIAL_SEGMENTS, tutorialRouteBeats } = script;

// Rehearsal/recording-ready state machine. The local session supplies genuine
// movement and combat facts from the ordinary simulator.
// It never alters health, hits, stamina, movement or the shared combat simulator.
export class TutorialDirector {
  constructor({ beats = null, segments = TUTORIAL_SEGMENTS, chapters = TUTORIAL_CHAPTERS,
    branches = TUTORIAL_BRANCHES, prototypeStop = null, onChange = () => {} } = {}) {
    beats ??= tutorialRouteBeats(segments);
    if (!Array.isArray(beats) || beats.length === 0) throw new Error('Tutorial needs beats');
    if (new Set(beats.map(beat => beat.id)).size !== beats.length ||
        beats.some(beat => !beat.id || !beat.advanceOn || (beat.kind !== 'stage' && !beat.line))) {
      throw new Error('Tutorial beats need unique IDs, cues and authored text');
    }
    if (prototypeStop && !beats.some(beat => beat.chapter === prototypeStop)) throw new Error('Unknown prototype chapter');
    if (prototypeStop && chapters.find(chapter => chapter.id === prototypeStop)?.implemented === false) throw new Error('Prototype stop must be implemented');
    this.segments = segments;
    this.chapters = chapters;
    this.branches = branches;
    this.prototypeStop = prototypeStop;
    this.branchesSeen = new Set();
    this.branchQueue = [];
    this.beats = beats;
    this.onChange = onChange;
    this.runId = 0;
    this.index = 0;
    this.state = 'idle';
    this.facts = new Set();
    this.enteredAt = null;
    this.optionalAt = null;
    this.optionalActive = false;
    this.lastTickAt = null;
  }

  get current() { return this.state === 'running' ? this.beats[this.index] : null; }
  get progress() {
    const finished = ['prototype-ended', 'complete'].includes(this.state);
    const beat = this.beats[Math.max(0, this.index - (finished ? 1 : 0))];
    return { chapter: this.chapters.find(chapter => chapter.id === beat?.chapter),
      state: this.state, index: this.index, total: this.beats.length,
      segment: this.segments.find(segment => segment.id === beat?.segment),
      current: this.current, optional: this.optionalCue };
  }

  start() {
    this.runId += 1;
    this.branchesSeen.clear();
    this.branchQueue = [];
    this.index = 0;
    this.state = 'running';
    this.facts.clear(); this.enteredAt = null; this.optionalAt = null;
    this.optionalActive = false; this.lastTickAt = null;
    this.onChange(this.progress);
    return this.current;
  }

  // Keep this token with the audio handle. A late completion from an old run or
  // previous line cannot advance the current dialogue after skip/restart.
  get cue() {
    return !this.optionalActive && this.current?.kind === 'dialogue'
      ? Object.freeze({ ...this.current, runId: this.runId }) : null;
  }

  get optionalCue() {
    return this.state === 'running' && this.optionalActive && this.branchQueue.length
      ? Object.freeze({ ...this.branchQueue[0], runId: this.runId }) : null;
  }

  completeOptionalDialogue(cue) {
    if (!cue || cue.runId !== this.runId || cue.id !== this.optionalCue?.id) return false;
    this.branchQueue.shift();
    this.optionalAt = null;
    if (!this.branchQueue.length) {
      this.optionalActive = false;
      this.enteredAt = this.lastTickAt;
    }
    this.onChange(this.progress);
    return true;
  }

  completeDialogue(cue) {
    if (this.optionalActive || !cue || cue.runId !== this.runId || cue.id !== this.current?.id
      || this.current.kind !== 'dialogue') return false;
    return this.accept('continue');
  }

  // Wrong inputs are ignored. In particular, a sword swing isn't a sword hit,
  // and lowering Guard isn't the same as suffering a scripted postscript hit.
  accept(cue) {
    if (!this.current || this.current.advanceOn !== cue) return false;
    const chapter = this.current.chapter;
    this.index += 1;
    this.enteredAt = null;
    if (chapter === this.prototypeStop && this.beats[this.index]?.chapter !== chapter) this.state = 'prototype-ended';
    else if (this.index === this.beats.length) this.state = 'complete';
    if (this.state !== 'running' || this.current?.chapter === 'ending') {
      this.branchQueue = []; this.optionalActive = false; this.optionalAt = null;
    } else if (this.branchQueue.length && this.canPresentOptional()) this.optionalActive = true;
    this.onChange(this.progress);
    if (this.current && this.facts.has(this.current.advanceOn)) this.accept(this.current.advanceOn);
    return true;
  }

  // Remember authentic actions through intervening captions, never through a retry.
  fact(cue) {
    if (this.state !== 'running') return false;
    this.facts.add(cue);
    return this.accept(cue);
  }

  // This clock controls caption rehearsal only. Combat remains event driven.
  // A decoded take calls completeDialogue with its actual ended token instead.
  tick(now) {
    if (!this.current || !Number.isFinite(now)) return;
    this.lastTickAt = now;
    // Reactions take the next clean caption boundary. Movement and factual
    // progression continue while a reaction is displayed, but the next spoken
    // main line gets its full reading time after the reaction ends.
    if (this.optionalCue) {
      this.optionalAt ??= now;
      if (now - this.optionalAt >= (this.optionalCue.rehearsalSec ?? 3)) this.completeOptionalDialogue(this.optionalCue);
      return;
    }
    this.enteredAt ??= now;
    const caption = this.progress.segment?.captionRehearsal;
    const rehearsal = Math.max(caption?.minSec ?? 0, (this.current.rehearsalSec ?? 3) * (caption?.scale ?? 1));
    if (this.current.presentation === 'reactive' && this.current.advanceOn === 'continue'
      && now - this.enteredAt >= rehearsal) this.completeDialogue(this.cue);
    else if (this.current.presentation === 'title' && now - this.enteredAt >= (this.current.rehearsalSec ?? 2.5)) this.accept(this.current.advanceOn);
    if (this.optionalCue) {
      this.optionalAt ??= now;
    } else this.optionalAt = null;
  }

  resumeAt(id) {
    const index = this.beats.findIndex(beat => beat.id === id);
    if (index < 0) throw new Error(`Unknown tutorial checkpoint: ${id}`);
    this.runId += 1; this.index = index; this.state = 'running';
    this.facts.clear(); this.branchQueue = []; this.enteredAt = null; this.optionalAt = null;
    this.optionalActive = false; this.lastTickAt = null;
    this.onChange(this.progress);
  }

  offerBranch(id) {
    if (this.state !== 'running' || this.current?.chapter === 'ending' || this.branchesSeen.has(id) || !this.branches[id]?.length) return false;
    this.branchesSeen.add(id);
    this.branchQueue.push(...this.branches[id]);
    // A pending reply cannot replace a main line halfway through its take.
    // Prompts and factual stage gates are already safe gaps in the dialogue.
    if (this.current.kind !== 'dialogue' && this.canPresentOptional()) this.optionalActive = true;
    this.onChange(this.progress);
    return true;
  }

  canPresentOptional() {
    const beat = this.current;
    return beat && beat.chapter !== 'ending' && beat.presentation !== 'title'
      && (beat.kind !== 'dialogue' || beat.presentation === 'reactive');
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
    this.facts.clear(); this.enteredAt = null; this.optionalAt = null;
    this.optionalActive = false; this.lastTickAt = null;
    this.onChange(this.progress);
  }
}
