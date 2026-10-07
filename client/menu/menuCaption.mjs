// The front door's subtitle: what the Spellblade says out on his round, written out as he says it (Settings, Audio,
// Subtitles), the way the arena's HUD does it (client/ui/HUD.mjs subtitle): shown `delay` seconds from now, a beat's
// words in place of the last as he reaches each (never before), gone a breath after he is done, or at once when he is
// cut short. It sits in the part of the screen clear of the banner, where the round's fights are framed.

export class MenuCaption {
  constructor(container, { document: doc = globalThis.document } = {}) {
    this.enabled = true;
    this.timers = [];
    this.element = doc?.createElement?.('div') ?? null;
    if (!this.element) return;
    this.element.className = 'subtitle menu-caption';
    this.element.setAttribute?.('role', 'status');
    this.element.setAttribute?.('aria-live', 'polite');
    this.words = doc.createElement('span');
    this.element.append?.(this.words);
    container?.append?.(this.element);
  }

  /** Subtitles on or off (off: anything showing goes). */
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) this.cut();
  }

  /** { text, delay, seconds, cues: [{ at, text }] } (cues: seconds after the text first shows). */
  show({ text, delay = 0, seconds = 2, cues = [] } = {}) {
    if (!this.element || !this.enabled || !text) return;
    this.cut();
    const later = (seconds, fn) => this.timers.push(setTimeout(fn, Math.max(0, seconds) * 1000));
    later(delay, () => {
      this.words.textContent = text;
      this.element.classList.add('show');
    });
    for (const cue of cues) later(delay + cue.at, () => { this.words.textContent = cue.text; });
    later(delay + seconds + 0.9, () => this.element.classList.remove('show'));
  }

  /** Cut short: whatever is showing fades now, and nothing still to come is shown. */
  cut() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.element?.classList.remove('show');
  }

  dispose() {
    this.cut();
    this.element?.remove?.();
  }
}
