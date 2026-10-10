import { tutorialPrompt } from './TutorialSession.mjs';

export const TUTORIAL_SPEAKER_LABELS = Object.freeze({narrator:'NARRATOR',spellblade:'YOU',rival:'RIVAL',instruction:'INSTRUCTION'});

// Text rehearsal uses deliberate Continue, never guessed narration durations.
export class TutorialView {
  constructor(root, { context = () => ({}), onContinue, onOptionalContinue, onRestart, onSkip, onPractice, onLeave } = {}) {
    this.root = root; this.context = context; this.onContinue = onContinue;
    this.exchange = root.querySelector('[data-tutorial-exchange]');
    this.optional = root.querySelector('[data-tutorial-optional]');
    this.optionalLine = root.querySelector('[data-tutorial-optional-line]');
    root.querySelector('[data-tutorial-optional-continue]').addEventListener('click', onOptionalContinue);
    this.chapter = root.querySelector('[data-tutorial-chapter]');
    this.speaker = root.querySelector('[data-tutorial-speaker]');
    this.line = root.querySelector('[data-tutorial-line]');
    this.prompt = root.querySelector('[data-tutorial-prompt]');
    this.blocked = root.querySelector('[data-tutorial-blocked]');
    this.continue = root.querySelector('[data-tutorial-continue]');
    this.practice = root.querySelector('[data-tutorial-practice]');
    this.continue.addEventListener('click', onContinue);
    this.practice.addEventListener('click', onPractice);
    root.querySelector('[data-tutorial-restart]').addEventListener('click', onRestart);
    this.skip = root.querySelector('[data-tutorial-skip]');
    this.skip.addEventListener('click', onSkip);
    root.querySelector('[data-tutorial-leave]').addEventListener('click', onLeave);
    this.keydown = event => {
      if (root.hidden || this.continue.hidden || event.repeat || event.code !== 'Enter') return;
      event.preventDefault(); event.stopImmediatePropagation(); onContinue();
    };
    document.addEventListener('keydown', this.keydown, true);
  }
  show(progress, interrupted = false) {
    const ended = progress.state !== 'running';
    this.root.hidden = false;
    this.exchange.hidden = !ended;
    this.skip.hidden = ended;
    this.optional.hidden = !progress.optional;
    this.optionalLine.textContent = progress.optional ? `${TUTORIAL_SPEAKER_LABELS[progress.optional.speaker]}: ${progress.optional.line}` : '';
    this.root.classList.toggle('tutorial-end', ended);
    this.chapter.textContent = progress.chapter?.title ?? 'TUTORIAL PREVIEW';
    this.speaker.textContent = ended ? 'TUTORIAL IN DEVELOPMENT' : TUTORIAL_SPEAKER_LABELS[progress.current?.speaker] ?? '';
    this.line.textContent = ended
      ? interrupted ? 'The preview was interrupted. Restart the lesson or continue in Practice.'
        : progress.state === 'skipped' ? 'Guidance skipped. Continue in Practice or restart the lesson.'
        : 'Further instruction is still being prepared.'
      : progress.current?.line ?? progress.current?.direction ?? '';
    this.prompt.textContent = ended ? 'Guided instruction has ended for now. This is a partial tutorial.'
      : tutorialPrompt(progress.current, this.context());
    this.continue.hidden = ended || progress.current?.kind !== 'dialogue';
    this.continue.textContent = this.context().touch ? 'CONTINUE' : 'CONTINUE · ENTER';
    this.practice.hidden = !ended;
    this.blocked.textContent = '';
  }
  denied() { this.blocked.textContent = 'Sword, Guard, spells, Dash and Ultimate unlock in later chapters.'; }
  hide() { this.root.hidden = true; }
}
