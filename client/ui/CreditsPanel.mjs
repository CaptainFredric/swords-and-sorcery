import { CREDITS, LIBRARY_GROUPS, VOICE_LIBRARY, librarySections, libraryStatus, statusLabel } from './voiceLibrary.mjs';
import { entryMatches, highlight, searchShelves, searchTerms, sortArchiveEntries } from './creditsSearch.mjs';

export function entryGroupKey(entry) {
  if (entry.family) return entry.family;
  const match = entry.line.match(/^([a-zA-Z]+)V\d+$/);
  if (match) return match[1];
  return entry.line;
}

export function groupShelfEntries(entries) {
  const groups = [];
  const seen = new Set();
  for (const entry of entries) {
    const key = entryGroupKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    const variations = entries.filter((e) => entryGroupKey(e) === key);
    groups.push({
      key,
      primary: variations[0],
      variations,
    });
  }
  return groups;
}

// The credits, and the Spellblade's voice library (voiceLibrary.mjs): who made him, then every line he has or will
// have (each section folding away) and the sounds he makes in a fight, each with a button per take to hear it as the
// game plays it (dry, as your own knight is heard). Search belongs to the archive below the creator attribution;
// each section with a matching recording unfolds.

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class CreditsPanel {
  constructor({ root, voice = null }) {
    this.root = root;
    this.voice = voice;
    this.body = root.querySelector('[data-credits-body]');
    this.attribution = root.querySelector('[data-credits-attribution]');
    this.library = root.querySelector('[data-credits-library]');
    // which sections are unfolded (kept while the panel is drawn again as the voice loads, and while searching)
    this.unfolded = new Set();
    this.unfoldedVariations = new Set();
    this.query = '';
    this.search = root.querySelector('[data-credits-search]');
    this.count = root.querySelector('[data-credits-count]');
    this.sort = root.querySelector('[data-credits-sort]');
    this.sortOrder = 'sections';
    this.sort?.addEventListener('change', () => {
      this.sortOrder = this.sort.value;
      this.#render();
    });
    this.search?.addEventListener('input', () => {
      this.query = this.search.value;
      this.#render();
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
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab' || !this.isOpen) return;
      const folded = [...root.querySelectorAll('details:not([open])')];
      const controls = [...root.querySelectorAll('button:not(:disabled), input, select, summary, a[href]')].filter((el) =>
        el.getClientRects().length && folded.every((detail) => !detail.contains(el) || detail.firstElementChild === el));
      const next = event.shiftKey ? controls.at(-1) : controls[0];
      const edge = event.shiftKey ? controls[0] : controls.at(-1);
      if (next && (document.activeElement === edge || !root.contains(document.activeElement))) {
        event.preventDefault();
        next.focus();
      }
    });
    root.querySelector('[data-credits-done]')?.addEventListener('click', () => this.close());
    this.body.addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-toggle-variation]');
      if (toggle) {
        event.preventDefault();
        const id = toggle.dataset.toggleVariation;
        const drawer = this.body.querySelector(`[data-drawer-variation="${id}"]`);
        const arrow = toggle.querySelector('.voice-variation-arrow');
        const opening = !this.unfoldedVariations.has(id);
        if (opening) {
          this.unfoldedVariations.add(id);
          drawer?.classList.remove('hidden');
          arrow?.classList.add('open');
          toggle.setAttribute('aria-expanded', 'true');
        } else {
          this.unfoldedVariations.delete(id);
          drawer?.classList.add('hidden');
          arrow?.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        }
        return;
      }
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
    // (whatever opened it, the Settings' foot or the front door's: given the focus back when it closes)
    if (!this.isOpen) this.opener = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
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
    const opener = this.opener;
    this.opener = null;
    if (opener?.isConnected && opener.offsetParent !== null && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
  }

  #takes(line) {
    return this.voice?.takes?.get(line)?.length ?? 0;
  }

  #render() {
    const terms = searchTerms(this.query);
    const mark = (text) => highlight(text, terms);
    const creditLines = CREDITS.lines;
    const credits = `
      <div class="credits-card">
        <h3 class="credits-title">${escape(CREDITS.title)}</h3>
        ${creditLines.map((line) => `<p class="credits-line"><small>${escape(line.role)}</small><b>${escape(line.name)}</b></p>`).join('')}
      </div>`;
    // which lines have a recording is the voice bank's to say (from the takes' manifest); until it has it, they load
    const recorded = this.voice?.recorded ?? null;
    const isRecorded = (line) => (recorded?.get(line) ?? 0) > 0;
    const row = (group) => {
      if (group.variations.length === 1) {
        const entry = group.primary;
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
      }

      const primary = group.primary;
      const status = libraryStatus(primary, isRecorded(primary.line));
      const hasSearchMatch = terms.length > 0 && group.variations.some((v) => v !== primary && entryMatches(v, terms, statusOf(v)));
      const isExpanded = this.unfoldedVariations.has(group.key) || hasSearchMatch;

      const buttons = group.variations.map((v, i) => {
        const takes = v.parts ? Math.min(1, this.#takes(v.line)) : this.#takes(v.line);
        if (takes) {
          return `<button type="button" class="voice-play" data-play-line="${v.line}" data-take="0" aria-label="Play ${escape(v.title)}, variation ${i + 1}">&#9654; ${i + 1}</button>`;
        }
        const vStatus = libraryStatus(v, isRecorded(v.line));
        return vStatus === 'unrecorded' && recorded ? '' : '<span class="voice-loading">…</span>';
      }).join('');

      const drawerItems = group.variations.map((v, i) => {
        const vTakes = v.parts ? Math.min(1, this.#takes(v.line)) : this.#takes(v.line);
        const vStatus = libraryStatus(v, isRecorded(v.line));
        const vPlay = vTakes
          ? `<button type="button" class="voice-play" data-play-line="${v.line}" data-take="0" aria-label="Play ${escape(v.title)}, variation ${i + 1}">&#9654; ${i + 1}</button>`
          : (vStatus === 'unrecorded' && recorded ? '' : '<span class="voice-loading">LOADING</span>');
        const showTitle = v.title !== primary.title;
        const showNote = v.note && v.note !== primary.note;
        const showWhen = v.when && v.when !== primary.when;
        return `
          <div class="voice-variation-item">
            <div class="voice-variation-content">
              <div class="voice-variation-item-head">
                <span class="voice-variation-tag">Variation ${i + 1}</span>
                ${showTitle ? `<b class="voice-variation-title">${mark(v.title)}</b>` : ''}
              </div>
              ${v.words.startsWith('(') ? `<i class="voice-direction">${mark(v.words)}</i>` : `<q>${mark(v.words)}</q>`}
              ${showWhen ? `<p class="voice-when">${mark(v.when)}</p>` : ''}
              ${showNote ? `<p class="voice-note">${mark(v.note)}</p>` : ''}
            </div>
            ${vPlay ? `<div class="voice-variation-play-wrap">${vPlay}</div>` : ''}
          </div>`;
      }).join('');

      return `
        <article class="voice-entry voice-entry-grouped voice-${recorded ? status : 'live'}" data-line-group="${escape(group.key)}">
          <header>
            <div class="voice-title-wrap">
              <b>${mark(primary.title)}</b>
              <button type="button" class="voice-variation-toggle" data-toggle-variation="${escape(group.key)}" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-controls="drawer-${escape(group.key)}" aria-label="${isExpanded ? `Hide ${group.variations.length} variations` : `Show ${group.variations.length} variations`}">
                <span class="voice-variation-count">${group.variations.length} variations</span>
                <span class="voice-variation-arrow${isExpanded ? ' open' : ''}" aria-hidden="true">&#9662;</span>
              </button>
            </div>
            <span class="voice-status">${mark(recorded ? statusLabel(primary, isRecorded(primary.line)) : '')}</span>
          </header>
          ${primary.words.startsWith('(') ? `<i class="voice-direction">${mark(primary.words)}</i>` : `<q>${mark(primary.words)}</q>`}
          <p class="voice-when">${mark(primary.when)}</p>
          <p class="voice-note">${mark(primary.note)}</p>
          ${buttons ? `<div class="voice-takes">${buttons}</div>` : ''}
          <div id="drawer-${escape(group.key)}" class="voice-variations-drawer${isExpanded ? '' : ' hidden'}" data-drawer-variation="${escape(group.key)}">
            ${drawerItems}
          </div>
        </article>`;
    };
    // each group under its title, each of its sections folding away (with how many lines it holds); searching, only
    // what was found, each section with a match unfolded (and how many of its lines matched).
    // Unrecorded placeholders are omitted from the credits display once what is recorded is known.
    const statusOf = (entry) => (recorded ? statusLabel(entry, isRecorded(entry.line)) : '');
    const baseShelves = librarySections(isRecorded, { includeUnrecorded: !recorded });
    const shelves = searchShelves(baseShelves, terms, statusOf);
    const groups = LIBRARY_GROUPS.map((group) => {
      const mine = shelves.filter((shelf) => shelf.group === group.id);
      if (!mine.length) return '';
      const sections = mine.map((shelf) => {
        const shelfGroups = groupShelfEntries(shelf.entries);
        return `
          <details class="credits-section" data-section="${escape(shelf.section)}"${terms.length || this.unfolded.has(shelf.section) ? ' open' : ''}>
            <summary><span>${mark(shelf.section)}</span><small>${terms.length ? `${shelf.entries.length} / ${shelf.total}` : shelf.entries.length}</small></summary>
            ${shelfGroups.map(row).join('')}
          </details>`;
      }).join('');
      return `<h3 class="setting-group">${escape(group.title)}</h3>${sections}`;
    }).join('');
    const found = shelves.reduce((sum, shelf) => sum + shelf.entries.length, 0);
    const totalLines = baseShelves.reduce((sum, shelf) => sum + shelf.entries.length, 0);
    const empty = terms.length && !found
      ? `<p class="setting-empty credits-empty">No voice lines match \u201c${escape(this.query.trim())}\u201d.</p>` : '';
    const focused = typeof document !== 'undefined' ? document.activeElement : null;
    const line = focused?.dataset?.playLine;
    const take = focused?.dataset?.take;
    const section = focused?.tagName === 'SUMMARY' ? focused.closest('[data-section]')?.dataset.section : null;
    const toggleVariation = focused?.dataset?.toggleVariation;
    this.attribution.innerHTML = credits;
    const sorted = this.sortOrder === 'sections' ? groups
      : groupShelfEntries(sortArchiveEntries(shelves.flatMap(shelf => shelf.entries), this.sortOrder, this.voice?.archiveAddedOn)).map(row).join('');
    this.library.innerHTML = `${sorted}${empty}`;
    // Preserve keyboard position if asynchronously loaded recordings redraw their controls.
    const replacement = line
      ? [...this.library.querySelectorAll('[data-play-line]')].find((el) => el.dataset.playLine === line && el.dataset.take === take)
      : section ? [...this.library.querySelectorAll('[data-section]')].find((el) => el.dataset.section === section)?.querySelector('summary')
      : toggleVariation ? [...this.library.querySelectorAll('[data-toggle-variation]')].find((el) => el.dataset.toggleVariation === toggleVariation) : null;
    replacement?.focus({ preventScroll: true });
    if (this.count) this.count.textContent = terms.length ? `${found} of ${totalLines} lines` : '';
  }

  // (the voice may still be loading the first time: it is asked again a moment later)
  #play(button, line, take, tries = 0) {
    if (!this.isOpen || !button.isConnected) return;
    if (this.voice?.preview?.(line, take)) {
      button.classList.add('playing');
      setTimeout(() => button.classList.remove('playing'), 400);
      return;
    }
    if (tries < 6) setTimeout(() => this.#play(button, line, take, tries + 1), 250);
  }
}
