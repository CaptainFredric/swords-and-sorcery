import { tutorialPrompt } from './TutorialSession.mjs';

export const TUTORIAL_SPEAKER_LABELS = Object.freeze({ narrator: 'NARRATOR', spellblade: 'YOU', rival: 'RIVAL', instruction: 'INSTRUCTION' });

function isTitle(beat) { return beat?.kind === 'title' || beat?.mechanic === 'title' || beat?.presentation === 'title'; }
function isBlocking(beat) {
  return beat?.presentation !== 'reactive' && beat?.kind === 'dialogue' && !isTitle(beat);
}

// Conversational rehearsal waits for Continue. Gameplay captions leave the arena controls available.
export class TutorialView {
  constructor(root, { context = () => ({}), onContinue = () => {}, onOptionalContinue = () => {}, onRestart = () => {}, onSkip = () => {}, onPractice = () => {}, onLeave = () => {} } = {}) {
    this.root = root;
    this.context = context;
    const select = selector => root.querySelector(selector);
    this.chapter = select('[data-tutorial-chapter]');
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
    this.continue.addEventListener('click', onContinue);
    this.optionalContinue.addEventListener('click', onOptionalContinue);
    this.practice.addEventListener('click', onPractice);
    select('[data-tutorial-restart]').addEventListener('click', onRestart);
    this.skip.addEventListener('click', onSkip);
    select('[data-tutorial-leave]').addEventListener('click', onLeave);
    this.keydown = event => {
      if (root.hidden || this.continue.hidden || event.repeat || event.code !== 'Enter' ||
          event.target?.closest?.('button, summary, input, select, textarea, [contenteditable="true"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onContinue();
    };
    document.addEventListener('keydown', this.keydown, true);
  }

  show(progress, interrupted = false) {
    const ended = progress.state !== 'running';
    const completed = ['complete', 'completed'].includes(progress.state);
    const beat = progress.current;
    const title = !ended && isTitle(beat);
    const blocking = !ended && isBlocking(beat);
    const context = this.context();
    const optional = ended ? null : progress.optional;
    const reactive = !ended && !blocking && !title;
    this.root.hidden = false;
    this.root.classList.toggle('tutorial-end', ended);
    this.root.classList.toggle('tutorial-reactive', reactive);
    this.root.classList.toggle('tutorial-blocking', blocking);
    this.root.classList.toggle('tutorial-title', title);
    this.root.classList.toggle('tutorial-touch', !!context.touch);
    this.chapter.textContent = ended ? completed ? 'TUTORIAL 1 COMPLETE' : 'TUTORIAL PAUSED' : progress.chapter?.title ?? 'GREENER PASTURES';
    const objective = progress.segment?.objective;
    this.objective.hidden = ended || title || !objective;
    this.objectiveText.textContent = objective?.text ?? objective ?? '';
    this.speaker.textContent = ended || title ? '' : TUTORIAL_SPEAKER_LABELS[beat?.speaker] ?? '';
    this.speaker.hidden = !this.speaker.textContent || reactive && !!optional;
    this.line.textContent = ended
      ? completed ? 'Greener Pastures complete. Return to Solo to play again or enter a match.'
        : interrupted ? 'The lesson was interrupted. Restart the tutorial or return to Solo.'
        : 'Tutorial skipped. Return to Solo or continue in Practice.'
      : beat?.line ?? '';
    // An optional gameplay reply may occupy the caption while the mechanic prompt stays visible.
    this.line.hidden = title || reactive && !!optional;
    this.brand.hidden = !title;
    this.prompt.textContent = ended ? '' : [progress.prompt ?? tutorialPrompt(beat, context),progress.rivalHint].filter(Boolean).join(' ');
    this.prompt.hidden = !this.prompt.textContent;
    this.optional.hidden = !optional;
    this.optionalLine.textContent = optional ? `${TUTORIAL_SPEAKER_LABELS[optional.speaker] ?? ''}: ${optional.line}` : '';
    this.optionalContinue.hidden = !optional || optional.presentation !== 'blocking';
    this.continue.hidden = !blocking;
    this.continue.textContent = context.touch ? 'CONTINUE' : 'CONTINUE · ENTER';
    this.practice.hidden = !ended || completed || interrupted;
    this.skip.hidden = ended;
    if (ended) this.options.open = true;
    else if (this.ended) this.options.open = false;
    if (this.lastBeat !== beat?.id || this.ended !== ended) { this.blocked.textContent = ''; this.blocked.hidden = true; }
    this.ended = ended;
    this.lastBeat = beat?.id;
  }

  denied(action) {
    const labels = { look: 'Looking', move: 'Walking', sprint: 'Sprint', attack: 'Attack', guard: 'Guard', spell: 'Fireball', cast: 'Fireball', castCurrentSpell: 'Fireball', dash: 'Dash', jump: 'Jump', crouch: 'Crouch' };
    this.blocked.textContent = action === 'rival-fall' ? 'Rival fell at the crossing. Restoring the nearby checkpoint.'
      : ['jump', 'crouch'].includes(action) ? `${labels[action]} is deferred during this lesson.`
      : action === 'ultimate' || action?.startsWith('selectPrepared') || action?.startsWith('castPrepared')
        ? 'This ability belongs to a later tutorial.' : `${labels[action] ?? 'This action'} becomes available later in the tutorial.`;
    this.blocked.hidden = false;
  }

  hide() { this.root.hidden = true; this.options.open = false; }
  destroy() { document.removeEventListener('keydown', this.keydown, { capture: true }); this.hide(); }
}
