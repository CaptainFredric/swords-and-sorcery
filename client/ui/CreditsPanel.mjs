import { CREDITS, LIBRARY_GROUPS, VOICE_LIBRARY, librarySections, libraryStatus, statusLabel } from './voiceLibrary.mjs';
import { creditMatches, highlight, searchShelves, searchTerms } from './creditsSearch.mjs';

// The credits, and the Spellblade's voice library (voiceLibrary.mjs): who made him, then every line he has or will
// have (each section folding away) and the sounds he makes in a fight, each with a button per take to hear it as the
// game plays it (dry, as your own knight is heard). Opened from a quiet button in the settings' footer. A search
// above it all (creditsSearch.mjs) narrows it to what is asked for, every section with a match unfolded.

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class CreditsPanel {
  constructor({ root, voice = null }) {
    this.root = root;
    this.voice = voice;
    this.body = root.querySelector('[data-credits-body]');
    // which sections are unfolded (kept while the panel is drawn again as the voice loads, and while searching)
    this.unfolded = new Set();
    this.query = '';
    this.search = root.querySelector('[data-credits-search]');
    this.count = root.querySelector('[data-credits-count]');
    this.search?.addEventListener('input', () => {
      this.query = this.search.value;
      this.#render();
      this.body.scrollTop = 0;
    });
    // Escape clears a search before it closes the Credits
    this.search?.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.search.value) return;
      event.preventDefault();
      event.stopPropagation();
      this.search.value = '';
      this.query = '';
      this.#render();
    });
    root.querySelector('[data-credits-done]')?.addEventListener('click', () => this.close());
    this.body.addEventListener('click', (event) => {
      const play = event.target.closest('[data-play-line]');
      if (play) this.#play(play, play.dataset.playLine, Number(play.dataset.take));
    });
    this.body.addEventListener('toggle', (event) => {
      const section = event.target.dataset?.section;
      // (a search unfolds what it finds: that is not the player's own unfolding, kept for when it is cleared)
      if (!section || searchTerms(this.query).length) return;
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
    const terms = searchTerms(this.query);
    const mark = (text) => highlight(text, terms);
    const creditLines = CREDITS.lines.filter((line) => creditMatches(line, terms));
    const credits = !terms.length || creditLines.length ? `
      <div class="credits-card">
        <h3 class="credits-title">${escape(CREDITS.title)}</h3>
        ${creditLines.map((line) => `<p class="credits-line"><small>${mark(line.role)}</small><b>${mark(line.name)}</b></p>`).join('')}
      </div>` : '';
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
          <header><b>${mark(entry.title)}</b><span class="voice-status">${mark(recorded ? statusLabel(entry, isRecorded(entry.line)) : '')}</span></header>
          ${entry.words.startsWith('(') ? `<i class="voice-direction">${mark(entry.words)}</i>` : `<q>${mark(entry.words)}</q>`}
          <p class="voice-when">${mark(entry.when)}</p>
          <p class="voice-note">${mark(entry.note)}</p>
          ${buttons ? `<div class="voice-takes">${buttons}</div>` : ''}
        </article>`;
    };
    // each group under its title, each of its sections folding away (with how many lines it holds); searching, only
    // what was found, each section with a match unfolded (and how many of its lines matched)
    const statusOf = (entry) => (recorded ? statusLabel(entry, isRecorded(entry.line)) : '');
    const shelves = searchShelves(librarySections(isRecorded), terms, statusOf);
    const groups = LIBRARY_GROUPS.map((group) => {
      const mine = shelves.filter((shelf) => shelf.group === group.id);
      if (!mine.length) return '';
      const sections = mine.map((shelf) => `
        <details class="credits-section" data-section="${escape(shelf.section)}"${terms.length || this.unfolded.has(shelf.section) ? ' open' : ''}>
          <summary><span>${mark(shelf.section)}</span><small>${terms.length ? `${shelf.entries.length} / ${shelf.total}` : shelf.entries.length}</small></summary>
          ${shelf.entries.map(row).join('')}
        </details>`).join('');
      return `<h3 class="setting-group">${escape(group.title)}</h3>${sections}`;
    }).join('');
    const found = shelves.reduce((sum, shelf) => sum + shelf.entries.length, 0);
    const empty = terms.length && !found && !creditLines.length
      ? `<p class="setting-empty credits-empty">Nothing in the Credits matches \u201c${escape(this.query.trim())}\u201d.</p>` : '';
    this.body.innerHTML = `${credits}${groups}${empty}`;
    if (this.count) this.count.textContent = terms.length ? `${found} of ${VOICE_LIBRARY.length} lines` : '';
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
