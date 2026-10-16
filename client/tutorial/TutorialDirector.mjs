import * as script from './tutorialScript.mjs';
const { TUTORIAL_CHAPTERS, TUTORIAL_BRANCHES, TUTORIAL_SEGMENTS, tutorialRouteBeats } = script;

// a recorded line's own pause after it (completeSpoken), and the room an aside leaves before its place (seconds)
const OPTIONAL_PAUSE_SEC = .35;
const ROOM_MARGIN_SEC = 1;

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
    this.reactions = new Map();
    beats.forEach((beat, index) => {
      if (beat.reactionFor && !this.reactions.has(beat.reactionFor)) this.reactions.set(beat.reactionFor, index);
    });
    this.completedReactions = new Set(); this.pendingReaction = null; this.reactionResume = null;
    this.onChange = onChange;
    this.runId = 0;
    this.index = 0;
    this.state = 'idle';
    this.facts = new Set();
    this.enteredAt = null;
    this.optionalAt = null;
    this.optionalActive = false;
    this.lastTickAt = null;
    this.audioCue = null; this.pendingCompletion = null;
    // An aside is had in the story's room: the seconds before its next place can come (the session's measure of
    // the ground still to cover), and each line's own length (its recording's, when known).
    this.optionalRoom = () => Infinity;
    this.lineSeconds = () => null;
    // and a main line fitted before a moment (fitsBefore: the session's measure of the seconds until it comes)
    this.mainRoom = () => Infinity;
    this.cutUnits = new Set();
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
    this.audioCue = null; this.pendingCompletion = null;
    this.completedReactions.clear(); this.pendingReaction = null; this.reactionResume = null; this.cutUnits?.clear();
    this.onChange(this.progress);
    return this.current;
  }

  // Keep this token with the audio handle. A late completion from an old run or
  // previous line cannot advance the current dialogue after skip/restart.
  get cue() {
    return !this.pendingCompletion && !this.optionalActive && this.current?.kind === 'dialogue'
      ? Object.freeze({ ...this.current, runId: this.runId }) : null;
  }

  get optionalCue() {
    return this.state === 'running' && this.optionalActive && this.branchQueue.length
      ? Object.freeze({ ...this.branchQueue[0], runId: this.runId }) : null;
  }

  completeOptionalDialogue(cue) {
    if (!cue || cue.runId !== this.runId || cue.id !== this.optionalCue?.id) return false;
    return this.completeSpoken(cue, true);
  }

  beginAudio(cue) {
    const active = cue?.branch ? this.optionalCue : this.cue;
    if (!active || cue?.runId !== this.runId || active.id !== cue.id) return false;
    this.audioCue = { id: cue.id, runId: cue.runId };
    return true;
  }

  stopAudio(cue) {
    if (this.audioCue?.id !== cue.id || this.audioCue.runId !== cue.runId) return;
    this.audioCue = null;
    this.enteredAt = this.optionalAt = this.lastTickAt;
  }

  completeSpoken(cue, optional) {
    if (this.pendingCompletion) return false;
    const recorded = this.audioCue?.id === cue.id && this.audioCue.runId === cue.runId;
    const pause = cue.pauseAfterSec ?? (recorded ? .35 : 0);
    this.audioCue = null;
    if (pause > 0) {
      this.pendingCompletion = { cue, optional, at: (this.lastTickAt ?? 0) + pause };
    } else if (optional) this.finishOptional();
    else this.accept('continue');
    return true;
  }

  finishOptional() {
    const finished = this.branchQueue.shift();
    const connectedReply = finished?.replyGroup && finished.replyGroup === this.branchQueue[0]?.replyGroup;
    const sameExchange = connectedReply || finished?.exchange && finished.exchange === this.branchQueue[0]?.exchange;
    this.optionalAt = null;
    // Urgent event feedback waits for this take's real end, then pauses the
    // remaining aside rather than cutting or dropping its recordings.
    if (!connectedReply && (this.pendingReaction || this.current?.reactionFor)) {
      this.optionalActive = false;
      this.beginReaction();
      this.enteredAt = this.lastTickAt;
    } else if (this.branchQueue.length && !sameExchange) {
      const nextBranch = this.branchQueue[0];
      const isUrgent = nextBranch?.dialogueType === 'reaction' || nextBranch?.dialogueType === 'retry';
      if (!isUrgent && (this.placeBound || !this.optionalFits())) {
        // Between two of the aside's exchanges: a place's lines are due (or the next exchange would not be over before
        // its place comes). The rest waits, every recording kept, for the next stretch with room for it.
        this.optionalActive = false;
        this.enteredAt = this.lastTickAt;
      }
    } else if (!this.branchQueue.length) {
      this.optionalActive = false;
      this.enteredAt = this.lastTickAt;
    }
    this.onChange(this.progress);
  }

  completeDialogue(cue) {
    if (this.optionalActive || !cue || cue.runId !== this.runId || cue.id !== this.current?.id
      || this.current.kind !== 'dialogue') return false;
    return this.completeSpoken(cue, false);
  }

  // Wrong inputs are ignored. In particular, a sword swing isn't a sword hit,
  // and lowering Guard isn't the same as suffering a scripted postscript hit.
  accept(cue) {
    if (!this.current || this.current.advanceOn !== cue) return false;
    // a live beat is taken only as its state holds, and only while nothing is being said
    if (this.current.live && (this.optionalActive || this.audioCue || this.pendingCompletion)) return false;
    const previous = this.current, chapter = previous.chapter;
    this.index += 1;
    if (previous.reactionFor && this.beats[this.index]?.reactionFor !== previous.reactionFor) {
      this.completedReactions.add(previous.reactionFor);
      if (this.reactionResume !== null) this.index = this.reactionResume;
      this.reactionResume = null;
    }
    // A reaction performed ahead of its ordinary route position never plays twice.
    while (this.completedReactions.has(this.beats[this.index]?.reactionFor) || this.skips(this.beats[this.index]) || this.cut(this.beats[this.index])) this.index += 1;
    if (!this.optionalActive) this.beginReaction();
    this.enteredAt = null;
    if (chapter === this.prototypeStop && this.beats[this.index]?.chapter !== chapter) this.state = 'prototype-ended';
    else if (this.index === this.beats.length) this.state = 'complete';
    if (this.state !== 'running' || this.current?.chapter === 'ending') {
      this.branchQueue = []; this.optionalActive = false; this.optionalAt = null;
    } else if (this.branchQueue.length && this.canPresentOptional()) this.optionalActive = true;
    this.onChange(this.progress);
    if (this.current && !this.current.live && this.facts.has(this.current.advanceOn)) this.accept(this.current.advanceOn);
    return true;
  }

  // Remember authentic actions through intervening captions, never through a retry.
  fact(cue) {
    if (this.state !== 'running') return false;
    this.facts.add(cue);
    this.dropStale(cue);
    if (this.reactions.has(cue) && !this.completedReactions.has(cue)) this.pendingReaction = cue;
    const canSkipCurrent = (this.skips(this.current, cue) || this.skips(this.current))
      && !this.audioCue && !this.pendingCompletion;
    const accepted = this.accept(cue) || (canSkipCurrent && this.accept(this.current.advanceOn));
    if (this.pendingReaction && this.current?.kind !== 'dialogue' && !this.audioCue && !this.pendingCompletion) {
      this.optionalActive = false; this.optionalAt = null;
      this.beginReaction(); this.enteredAt = null; this.onChange(this.progress);
    }
    return accepted;
  }

  // An aside overtaken by events (its `until` has happened) is dropped where it has not begun: an exchange under way
  // is heard to its end, never cut.
  dropStale(cue) {
    const head = (this.optionalActive && this.optionalAt !== null) ? this.branchQueue[0] : null;
    const playing = line => head && (line === head || head.exchange && line.exchange === head.exchange
      || head.replyGroup && line.replyGroup === head.replyGroup);
    const kept = this.branchQueue.filter(line => line.until !== cue || playing(line));
    if (kept.length === this.branchQueue.length) return;
    this.branchQueue = kept;
    if (!kept.length) this.optionalActive = false;
  }

  // A line fitted before a moment (fitsBefore) that would not be over by then is not begun, nor the rest of its unit
  // (a question goes with its answer). The second of a pair whose first was said is always finished. A unit cut is
  // remembered as the fact `${unit}-cut` (a later line can be had only if it was not).
  cut(beat) {
    if (!beat?.fitsBefore || beat.kind !== 'dialogue' || this.skips(beat)) return false;
    if (beat.unit && this.cutUnits.has(beat.unit)) return true;
    if (beat.unit && this.beats[this.index - 1]?.unit === beat.unit) return false;
    let need = 0;
    for (let i = this.index; i < this.beats.length; i += 1) {
      const line = this.beats[i];
      if (i > this.index && (!beat.unit || line.unit !== beat.unit)) break;
      need += (this.lineSeconds(line) ?? line.rehearsalSec ?? 3) + (line.pauseAfterSec ?? OPTIONAL_PAUSE_SEC);
    }
    if (this.mainRoom(beat.fitsBefore) >= need) return false;
    if (beat.unit) { this.cutUnits.add(beat.unit); this.facts.add(`${beat.unit}-cut`); }
    return true;
  }

  // A beat made obsolete by what has happened (skipWhen: one fact or several): by any fact so far, or by this one.
  skips(beat, cue = null) {
    const when = beat?.skipWhen;
    if (!when) return false;
    return [].concat(when).some(fact => cue === null ? this.facts.has(fact) : fact === cue);
  }

  // reactionFor is authored on a contiguous main-route response. The next clean
  // boundary visits it first, then returns to the remaining lesson. Existing
  // stable keys and the normal audio completion path are used throughout.
  beginReaction() {
    const event = this.pendingReaction;
    if (!event || this.state !== 'running') return;
    this.pendingReaction = null;
    if (this.current?.reactionFor === event || this.completedReactions.has(event)) return;
    this.reactionResume = this.index;
    this.index = this.reactions.get(event);
  }

  // This clock controls caption rehearsal only. Combat remains event driven.
  // A decoded take calls completeDialogue with its actual ended token instead.
  tick(now) {
    if (!this.current || !Number.isFinite(now)) return;
    this.lastTickAt = now;
    if (this.pendingCompletion) {
      if (now < this.pendingCompletion.at) return;
      const pending = this.pendingCompletion; this.pendingCompletion = null;
      if (pending.cue.runId !== this.runId) return;
      if (pending.optional) this.finishOptional(); else this.accept('continue');
      return;
    }
    if (this.audioCue) return; // A real source's ended event owns duration.
    // An aside kept waiting (for room, or for a place's lines to be over) begins once the main route is only waiting
    // on the player and there is room for its next exchange.
    if (!this.optionalActive && this.branchQueue.length && this.current.kind !== 'dialogue' && this.canPresentOptional()) {
      this.optionalActive = true; this.optionalAt = now;
      this.onChange(this.progress);
    }
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
    // Authored quiet travel belongs to a beat, so removing its segment leaves no timer behind.
    else if (this.current.kind === 'stage' && Number.isFinite(this.current.advanceAfterSec)
      && now - this.enteredAt >= this.current.advanceAfterSec) this.accept(this.current.advanceOn);
    else if (this.current.presentation === 'title' && now - this.enteredAt >= (this.current.rehearsalSec ?? 2.5)) this.accept(this.current.advanceOn);
    if (this.optionalCue) {
      this.optionalAt ??= now;
    } else this.optionalAt = null;
  }

  /**
   * The line a Back would return to: the one before this, when going back to it is only reading it again (the same
   * conversation, both lines waiting on Continue, nothing happening between them), or null.
   */
  previousLine() {
    const current = this.current;
    const waits = beat => beat?.kind === 'dialogue' && beat.presentation !== 'reactive' && beat.advanceOn === 'continue';
    if (!waits(current) || this.optionalActive || this.reactionResume !== null) return null;
    for (let i = this.index - 1; i >= 0; i -= 1) {
      const beat = this.beats[i];
      if (beat.segment !== current.segment || !waits(beat)) return null;
      // (a line that was passed over is not gone back to)
      if (this.skips(beat) || beat.unit && this.cutUnits.has(beat.unit)) continue;
      return i;
    }
    return null;
  }

  /** Back one line in a conversation (previousLine): it is current again, said again, and Continue goes on from it. */
  back() {
    const index = this.previousLine();
    if (index === null) return false;
    this.index = index;
    this.audioCue = null; this.pendingCompletion = null; this.enteredAt = null;
    this.onChange(this.progress);
    return true;
  }

  resumeAt(id) {
    const index = this.beats.findIndex(beat => beat.id === id);
    if (index < 0) throw new Error(`Unknown tutorial checkpoint: ${id}`);
    this.runId += 1; this.index = index; this.state = 'running';
    this.facts.clear(); this.branchQueue = []; this.enteredAt = null; this.optionalAt = null;
    this.optionalActive = false; this.lastTickAt = null;
    this.audioCue = null; this.pendingCompletion = null;
    this.completedReactions.clear(); this.pendingReaction = null; this.reactionResume = null; this.cutUnits?.clear();
    this.onChange(this.progress);
  }

  offerBranch(id) {
    if (this.state !== 'running' || this.current?.chapter === 'ending' || this.branchesSeen.has(id) || !this.branches[id]?.length) return false;
    this.branchesSeen.add(id);
    const beats = this.branches[id];
    const isUrgent = beats[0]?.dialogueType === 'reaction' || beats[0]?.dialogueType === 'retry';
    if (isUrgent) {
      if (this.optionalActive) {
        // Keep the currently playing line and its exchange together, but insert urgent branch right after it
        const head = this.branchQueue[0];
        let insertIndex = 1;
        while (insertIndex < this.branchQueue.length) {
          const item = this.branchQueue[insertIndex];
          const together = item === head || (item.exchange && item.exchange === head.exchange) || (item.replyGroup && item.replyGroup === head.replyGroup);
          if (!together) break;
          insertIndex += 1;
        }
        this.branchQueue.splice(insertIndex, 0, ...beats);
      } else {
        this.branchQueue.unshift(...beats);
      }
    } else {
      this.branchQueue.push(...beats);
    }
    // A pending reply cannot replace a main line halfway through its take.
    // Prompts and factual stage gates are already safe gaps in the dialogue.
    if (this.current.kind !== 'dialogue' && this.canPresentOptional()) this.optionalActive = true;
    this.onChange(this.progress);
    return true;
  }

  canPresentOptional() {
    const beat = this.current;
    if (!beat || beat.reactionFor || beat.chapter === 'ending' || beat.presentation === 'title') return false;
    if (beat.kind === 'dialogue' && beat.presentation !== 'reactive') return false;
    const nextBranch = this.branchQueue[0];
    const isUrgent = nextBranch?.dialogueType === 'reaction' || nextBranch?.dialogueType === 'retry';
    if (isUrgent) return true;
    return !this.placeBound && this.optionalFits();
  }

  /**
   * Whether the main route is in a place's lines: the dialogue that follows a stage beat marked `place` (Rival over the
   * sheepfold wall, the Spellblade at the bridge...), up to its next stage or prompt. Those lines belong to where they
   * are said: no aside begins in them, and one under way gives them the floor at its next pause.
   */
  get placeBound() {
    const beat = this.current;
    if (!beat || beat.kind !== 'dialogue' || beat.reactionFor) return false;
    for (let i = this.index - 1; i >= 0; i -= 1) {
      const before = this.beats[i];
      if (before.kind !== 'dialogue') return Boolean(before.place);
    }
    return false;
  }

  /** The aside's next exchange (lines that belong together: one exchange, or one reply), in seconds. */
  optionalExchangeSec() {
    const [first] = this.branchQueue;
    if (!first) return 0;
    let total = 0;
    for (const line of this.branchQueue) {
      const together = line === first || line.exchange && line.exchange === first.exchange || line.replyGroup && line.replyGroup === first.replyGroup;
      if (!together) break;
      total += (this.lineSeconds(line) ?? line.rehearsalSec ?? 3) + (line.pauseAfterSec ?? OPTIONAL_PAUSE_SEC);
    }
    return total;
  }

  /** Whether the aside's next exchange is over before the story's next place can come. */
  optionalFits() {
    return !this.branchQueue.length || this.optionalRoom() >= this.optionalExchangeSec() + ROOM_MARGIN_SEC;
  }

  skip() {
    if (this.state !== 'running') return false;
    this.state = 'skipped';
    this.audioCue = null; this.pendingCompletion = null;
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
    this.audioCue = null; this.pendingCompletion = null;
    this.completedReactions.clear(); this.pendingReaction = null; this.reactionResume = null; this.cutUnits?.clear();
    this.onChange(this.progress);
  }
}
