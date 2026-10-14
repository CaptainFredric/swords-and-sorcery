import { tutorialPrompt } from './TutorialSession.mjs';
import { tutorialCueForDevice } from './tutorialRecordings.mjs';

export const TUTORIAL_SPEAKER_LABELS = Object.freeze({ narrator: 'NARRATOR', spellblade: 'YOU', rival: 'RIVAL', instruction: 'INSTRUCTION' });

function isTitle(beat) { return beat?.kind === 'title' || beat?.mechanic === 'title' || beat?.presentation === 'title'; }
function isBlocking(beat) {
  return beat?.presentation !== 'reactive' && beat?.kind === 'dialogue' && !isTitle(beat);
}

// a tap that continues (on a touch screen, anywhere but on a control): a press let go about where it went down, soon
const TAP_SLOP_PX = 14;
const TAP_MAX_MS = 700;
// (the touch layer itself is the look area, the whole screen: its buttons, stick and spell fan are controls)
const NOT_A_TAP = 'button, summary, a, input, select, textarea, details[open], [data-tutorial-transcript], .touch-btn, .touch-stick, .touch-prepared-fan';

// Conversational rehearsal waits for Continue. Gameplay captions leave the arena controls available.
export class TutorialView {
  constructor(root, { context = () => ({}), onContinue = () => {}, onOptionalContinue = () => {}, onRestart = () => {}, onSkip = () => {}, onPractice = () => {}, onLeave = () => {},
    onBack = () => {}, canGoBack = () => false, onTranscript = () => {}, transcript = () => [], onPlayLine = () => {}, onBeginChapter = () => {} } = {}) {
    this.root = root;
    this.context = context;
    const select = selector => root.querySelector(selector);
    this.chapter = select('[data-tutorial-chapter]');
    this.caption = select('[data-tutorial-caption]');
    this.instruction = select('[data-tutorial-instruction]');
    this.mechanic = select('[data-tutorial-mechanic]');
    this.objective = select('[data-tutorial-objective]');
    this.objectiveText = select('[data-tutorial-objective-text]');
    this.speaker = select('[data-tutorial-speaker]');
    this.line = select('[data-tutorial-line]');
    this.prompt = select('[data-tutorial-prompt]');
    this.brand = select('[data-tutorial-title]');
    this.blocked = select('[data-tutorial-blocked]');
    this.optional = select('[data-tutorial-optional]');
    this.optionalLine = select('[data-tutorial-optional-line]');
    this.optionalContinue = select('[data-tutorial-optional-continue]');
    this.continue = select('[data-tutorial-continue]');
    this.practice = select('[data-tutorial-practice]');
    this.skip = select('[data-tutorial-skip]');
    this.options = select('[data-tutorial-options]');
    this.back = select('[data-tutorial-back]');
    this.transcriptOpen = select('[data-tutorial-transcript-open]');
    this.transcriptPanel = select('[data-tutorial-transcript]');
    this.transcriptList = select('[data-tutorial-transcript-list]');
    this.canGoBack = canGoBack;
    this.transcript = transcript;
    this.onTranscript = onTranscript;
    this.onPlayLine = onPlayLine;
    this.onBeginChapter = onBeginChapter;
    this.continue.addEventListener('click', onContinue);
    this.back?.addEventListener('click', () => onBack());
    this.transcriptOpen?.addEventListener('click', () => this.openTranscript());
    select('[data-tutorial-transcript-close]')?.addEventListener('click', () => this.closeTranscript());
    this.optionalContinue.addEventListener('click', onOptionalContinue);
    this.practice.addEventListener('click', onPractice);
    select('[data-tutorial-restart]').addEventListener('click', onRestart);
    this.skip.addEventListener('click', onSkip);
    select('[data-tutorial-leave]').addEventListener('click', onLeave);
    this.keydown = event => {
      if (this.openingHeld || root.hidden || this.continue.hidden || event.repeat || event.code !== 'Enter' ||
          event.target?.closest?.('button, summary, input, select, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onContinue();
    };
    document.addEventListener('keydown', this.keydown, true);
    // On a touch screen a conversation goes on with a tap anywhere (not only on Continue): anywhere, that is, but on a
    // control, the transcript or the options, and never a drag (a look, a stick) let go where it began
    this.tap = null;
    this.pointerdown = event => { this.tap = this.tapContinues(event) ? { id: event.pointerId, x: event.clientX, y: event.clientY, at: performance.now() } : null; };
    this.pointerup = event => {
      const tap = this.tap; this.tap = null;
      if (!tap || tap.id !== event.pointerId || !this.tapContinues(event)) return;
      if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > TAP_SLOP_PX || performance.now() - tap.at > TAP_MAX_MS) return;
      onContinue();
    };
    document.addEventListener('pointerdown', this.pointerdown, true);
    document.addEventListener('pointerup', this.pointerup, true);
    this.escape = event => { if (event.key === 'Escape' && this.transcriptShown) { event.preventDefault(); this.closeTranscript(); } };
    document.addEventListener('keydown', this.escape, true);
  }

  tapContinues(event) {
    return Boolean(this.context().touch) && !this.openingHeld && !this.root.hidden && !this.continue.hidden && !this.transcriptShown
      && !this.options.open && !event.target?.closest?.(NOT_A_TAP);
  }

  // --- the transcript: every line, chapter by chapter, each to be heard again; a chapter to begin again from ---------
  openTranscript() {
    if (!this.transcriptPanel || this.transcriptShown) return;
    this.transcriptShown = true;
    this.onTranscript(true);
    this.transcriptPanel.hidden = false;
    this.root.classList.toggle('tutorial-transcript-open', true);
    // (shown first: only a list on the screen can be scrolled to its current line)
    this.renderTranscript();
  }

  closeTranscript({ resume = true } = {}) {
    if (!this.transcriptShown) return;
    this.transcriptShown = false;
    this.transcriptPanel.hidden = true;
    this.root.classList.toggle('tutorial-transcript-open', false);
    if (resume) this.onTranscript(false);
  }

  renderTranscript() {
    const list = this.transcriptList, make = (tag, className, text) => {
      const element = document.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    };
    list.replaceChildren();
    let current = null;
    for (const chapter of this.transcript()) {
      const section = make('section', `tutorial-transcript-chapter${chapter.reached ? '' : ' not-reached'}`);
      const head = make('header');
      head.append(make('h3', '', chapter.title));
      const begin = make('button', 'tutorial-transcript-begin', 'Begin here');
      begin.type = 'button';
      begin.setAttribute('aria-label', `Begin the tutorial again from ${chapter.title}`);
      // (closed without resuming the line it paused: the chapter begins in its place)
      begin.addEventListener('click', () => { this.closeTranscript({ resume: false }); this.onBeginChapter(chapter.id); });
      head.append(begin);
      section.append(head);
      for (const line of chapter.lines) {
        const row = make('p', `tutorial-transcript-line${line.heard ? ' heard' : ''}${line.current ? ' current' : ''}${line.aside ? ' aside' : ''}`);
        const play = make('button', 'tutorial-transcript-play', '▶');
        play.type = 'button';
        play.setAttribute('aria-label', `Hear: ${line.line}`);
        play.disabled = !line.recordingKey;
        play.addEventListener('click', () => this.onPlayLine(line));
        row.append(play, make('b', '', TUTORIAL_SPEAKER_LABELS[line.speaker] ?? ''), make('span', '', line.line));
        section.append(row);
        if (line.current) current = row;
      }
      list.append(section);
    }
    // (opened on the line being had now)
    (current ?? [...list.querySelectorAll('.heard')].at(-1))?.scrollIntoView?.({ block: 'center' });
  }

  show(progress, interrupted = false) {
    const ended = progress.state !== 'running';
    const completed = ['complete', 'completed'].includes(progress.state);
    const beat = progress.current;
    const context = this.context();
    const presentedBeat = tutorialCueForDevice(beat, context);
    const title = !ended && isTitle(beat);
    const blocking = !ended && isBlocking(beat);
    const optional = ended ? null : progress.optional;
    const spoken = optional ?? (beat?.kind === 'dialogue' ? presentedBeat : null);
    const reactive = !ended && !blocking && !title;
    this.root.hidden = false;
    this.root.classList.toggle('tutorial-end', ended);
    this.root.classList.toggle('tutorial-reactive', reactive);
    this.root.classList.toggle('tutorial-blocking', blocking);
    this.root.classList.toggle('tutorial-title', title);
    this.root.classList.toggle('tutorial-touch', !!context.touch);
    this.chapter.textContent = ended ? completed ? 'TUTORIAL 1 COMPLETE' : 'TUTORIAL PAUSED' : progress.chapter?.title ?? 'GREENER PASTURES';
    // (a beat may bring its objective in before its segment does: the pursuit's, as the threat sinks in)
    const objective = beat?.objective ?? progress.segment?.objective;
    this.objective.hidden = ended || title || !objective;
    this.objective.classList.toggle('tutorial-objective-compact', Boolean(objective?.compact));
    this.objectiveText.textContent = objective?.text ?? objective ?? '';
    this.speaker.textContent = ended || title ? '' : TUTORIAL_SPEAKER_LABELS[spoken?.speaker] ?? '';
    this.speaker.hidden = !this.speaker.textContent;
    this.line.textContent = ended
      ? completed ? 'Greener Pastures complete. Return to Solo to play again or enter a match.'
        : interrupted ? 'The lesson was interrupted. Restart the tutorial or return to Solo.'
        : 'Tutorial skipped. Return to Solo or continue in Practice.'
      : spoken?.line ?? presentedBeat?.line ?? '';
    this.line.hidden = title || !ended && !spoken;
    this.brand.hidden = !title;
    // (a standing instruction stays up under the lines spoken meanwhile, when the beat has none of its own)
    const standing = !ended && beat?.kind !== 'prompt' ? progress.standing : null;
    this.prompt.textContent = ended ? '' : [progress.prompt ?? (tutorialPrompt(beat, context) || tutorialPrompt(standing, context)),progress.rivalHint].filter(Boolean).join(' ');
    this.prompt.hidden = !this.prompt.textContent;
    this.mechanic.textContent = !ended && beat?.kind === 'prompt' ? beat.line ?? '' : standing?.line ?? '';
    this.mechanic.hidden = !this.mechanic.textContent;
    // Every spoken take uses the same label and text. Instructions have their own panel.
    this.optional.hidden = true;
    this.optionalLine.textContent = '';
    this.optionalContinue.hidden = !optional || optional.presentation !== 'blocking';
    this.continue.hidden = !blocking;
    if (this.back) this.back.hidden = !blocking || !this.canGoBack();
    this.continue.textContent = context.touch ? 'CONTINUE' : 'CONTINUE · ENTER';
    this.practice.hidden = !ended || completed || interrupted;
    this.skip.hidden = ended;
    if (ended) this.options.open = true;
    else if (this.ended) this.options.open = false;
    if (this.lastBeat !== beat?.id || this.ended !== ended) { this.blocked.textContent = ''; this.blocked.hidden = true; }
    this.ended = ended;
    this.lastBeat = beat?.id;
    this.caption.hidden = !ended && !title && !spoken;
    this.updateInstruction();
  }

  updateInstruction() { this.instruction.hidden = this.prompt.hidden && this.mechanic.hidden && this.blocked.hidden; }

  denied(action) {
    const labels = { look: 'Looking', move: 'Walking', sprint: 'Sprint', attack: 'Attack', guard: 'Guard', spell: 'Fireball', cast: 'Fireball', castCurrentSpell: 'Fireball', dash: 'Dash', jump: 'Jump', crouch: 'Crouch' };
    this.blocked.textContent = action === 'rival-fall' ? 'Rival fell at the crossing. Restoring the nearby checkpoint.'
      : ['jump', 'crouch'].includes(action) ? `${labels[action]} is deferred during this lesson.`
      : action === 'ultimate' || action?.startsWith('selectPrepared') || action?.startsWith('castPrepared')
        ? 'This ability belongs to a later tutorial.' : `${labels[action] ?? 'This action'} becomes available later in the tutorial.`;
    this.blocked.hidden = false;
    this.updateInstruction();
    clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => { this.blocked.hidden = true; this.updateInstruction(); }, 2500);
    this.feedbackTimer.unref?.();
  }

  holdOpening() { this.openingHeld = true; this.root.classList.toggle('tutorial-opening-held',true); this.root.classList.toggle('tutorial-opening-reveal',false); }
  revealOpening() { this.openingHeld = false; this.root.classList.toggle('tutorial-opening-held',false); this.root.classList.toggle('tutorial-opening-reveal',true); }
  hide() { this.closeTranscript(); this.openingHeld = false; this.root.classList.toggle('tutorial-opening-held',false); this.root.classList.toggle('tutorial-opening-reveal',false); this.root.hidden = true; this.options.open = false; }
  destroy() {
    clearTimeout(this.feedbackTimer);
    document.removeEventListener('keydown', this.keydown, { capture: true });
    document.removeEventListener('keydown', this.escape, { capture: true });
    document.removeEventListener('pointerdown', this.pointerdown, { capture: true });
    document.removeEventListener('pointerup', this.pointerup, { capture: true });
    this.hide();
  }
}
