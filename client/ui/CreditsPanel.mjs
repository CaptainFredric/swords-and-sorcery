import { CREDITS, LIBRARY_GROUPS, MUSIC_LIBRARY, librarySections, libraryStatus, statusLabel } from './voiceLibrary.mjs';

// The credits, and the Spellblade's voice library (voiceLibrary.mjs): who made him, then every line he has or will
// have (each section folding away), the sounds he makes in a fight, and the music performed for him, each with a
// button per take to hear it as the game plays it (dry, as your own knight is heard). Opened from a quiet button in
// the settings' footer.

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class CreditsPanel {
  constructor({ root, voice = null, stingers = null }) {
    this.root = root;
    this.voice = voice;
    this.stingers = stingers;
    this.body = root.querySelector('[data-credits-body]');
    // which sections are unfolded (kept while the panel is drawn again as the voice loads)
    this.unfolded = new Set();
    root.querySelector('[data-credits-done]')?.addEventListener('click', () => this.close());
    this.body.addEventListener('click', (event) => {
      const play = event.target.closest('[data-play-line]');
      if (play) this.#play(play, play.dataset.playLine, Number(play.dataset.take));
      const music = event.target.closest('[data-play-stinger]');
      if (music && this.stingers?.play(music.dataset.playStinger, { preview: true })) {
        music.classList.add('playing');
        setTimeout(() => music.classList.remove('playing'), 400);
      }
    });
    this.body.addEventListener('toggle', (event) => {
      const section = event.target.dataset?.section;
      if (!section) return;
      if (event.target.open) this.unfolded.add(section);
      else this.unfolded.delete(section);
    }, true);
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open() {
    this.root.classList.remove('hidden');
    this.#render();
    // the voice may still be loading the first time it is opened: drawn again once it knows what is recorded, and
    // again once every take can be played
    this.voice?.listed?.then(() => { if (this.isOpen) this.#render(); });
    this.voice?.ready?.then(() => { if (this.isOpen) this.#render(); });
    this.root.querySelector('[data-credits-done]')?.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.voice?.stopPreview?.();
    this.root.classList.add('hidden');
  }

  #takes(line) {
    return this.voice?.takes?.get(line)?.length ?? 0;
  }

  #render() {
    const credits = `
      <div class="credits-card">
        <h3 class="credits-title">${escape(CREDITS.title)}</h3>
        ${CREDITS.lines.map((line) => `<p class="credits-line"><small>${escape(line.role)}</small><b>${escape(line.name)}</b></p>`).join('')}
      </div>`;
    // which lines have a recording is the voice bank's to say (from the takes' manifest); until it has it, they load
    const recorded = this.voice?.recorded ?? null;
    const isRecorded = (line) => (recorded?.get(line) ?? 0) > 0;
    const row = (entry) => {
      const status = libraryStatus(entry, isRecorded(entry.line));
      // (a line said in parts is heard as one: a single button plays its parts in order)
      const takes = entry.parts ? Math.min(1, this.#takes(entry.line)) : this.#takes(entry.line);
      const buttons = takes
        ? Array.from({ length: takes }, (_, i) => `<button type="button" class="voice-play" data-play-line="${entry.line}" data-take="${i}" aria-label="Play ${escape(entry.title)}${takes > 1 ? `, take ${i + 1}` : ''}">&#9654;${takes > 1 ? ` ${i + 1}` : ''}</button>`).join('')
        : status === 'unrecorded' && recorded ? '' : '<span class="voice-loading">LOADING</span>';
      return `
        <article class="voice-entry voice-${recorded ? status : 'live'}">
          <header><b>${escape(entry.title)}</b><span class="voice-status">${escape(recorded ? statusLabel(entry, isRecorded(entry.line)) : '')}</span></header>
          ${entry.words.startsWith('(') ? `<i class="voice-direction">${escape(entry.words)}</i>` : `<q>${escape(entry.words)}</q>`}
          <p class="voice-when">${escape(entry.when)}</p>
          <p class="voice-note">${escape(entry.note)}</p>
          ${buttons ? `<div class="voice-takes">${buttons}</div>` : ''}
        </article>`;
    };
    // each group under its title, each of its sections folding away (with how many lines it holds)
    const shelves = librarySections(isRecorded);
    const groups = LIBRARY_GROUPS.map((group) => {
      if (group.id === 'music') {
        this.stingers?.load?.();
        const music = MUSIC_LIBRARY.map((entry) => `
          <article class="voice-entry voice-live voice-music">
            <header><b>${escape(entry.title)}</b></header>
            <i class="voice-direction">${escape(entry.source)}</i>
            <p class="voice-when">${escape(entry.when)}</p>
            <p class="voice-note">${escape(entry.note)}</p>
            ${this.stingers ? `<div class="voice-takes"><button type="button" class="voice-play" data-play-stinger="${entry.stinger}" aria-label="Play ${escape(entry.title)}">&#9654;</button></div>` : ''}
          </article>`).join('');
        return `<h3 class="setting-group">${escape(group.title)}</h3>${music}`;
      }
      const sections = shelves.filter((shelf) => shelf.group === group.id).map((shelf) => `
        <details class="credits-section" data-section="${escape(shelf.section)}"${this.unfolded.has(shelf.section) ? ' open' : ''}>
          <summary><span>${escape(shelf.section)}</span><small>${shelf.entries.length}</small></summary>
          ${shelf.entries.map(row).join('')}
        </details>`).join('');
      return `<h3 class="setting-group">${escape(group.title)}</h3>${sections}`;
    }).join('');
    this.body.innerHTML = `${credits}${groups}`;
  }

  // (the voice may still be loading the first time: it is asked again a moment later)
  #play(button, line, take, tries = 0) {
    if (this.voice?.preview?.(line, take)) {
      button.classList.add('playing');
      setTimeout(() => button.classList.remove('playing'), 400);
      return;
    }
    if (tries < 6) setTimeout(() => this.#play(button, line, take, tries + 1), 250);
  }
}
