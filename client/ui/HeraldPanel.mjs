// The Castleward Herald: a notice pinned to the front door's banner, read where it hangs. It opens like a sheet drawn
// out from its place (and folds back the same way), a little quicker closing than opening; it takes the focus while it
// is open, and gives it back to whatever opened it. Not the herald's call that challengers await (the herald-toast):
// that is an alert, this is the notice board.

import { HERALD_NOTICES, heraldDate } from './heraldNotices.mjs';

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// how long the sheet takes folding back (menu.css: herald-out), before it is put away
export const HERALD_CLOSE_MS = 180;

/** The Herald's sheet as markup: the latest notice, the recent changes, and the maker's note if there is one. */
export function heraldMarkup(notices = HERALD_NOTICES, { year = new Date().getFullYear() } = {}) {
  const latest = notices.latest
    ? `<article class="herald-latest"><h3>${escape(notices.latest.title)}</h3>${notices.latest.text.map((p) => `<p>${escape(p)}</p>`).join('')}</article>`
    : '';
  const entries = notices.changes ?? [];
  const list = (items) => `<ul>${items.map((change) => `<li><time datetime="${escape(change.date)}">${escape(heraldDate(change.date, { year }))}</time><span>${escape(change.text)}</span></li>`).join('')}</ul>`;
  const changes = entries.length
    ? `<section class="herald-changes" aria-label="Recent changes"><h4>RECENT DISPATCHES</h4>${list(entries.slice(0, 5))}${entries.length > 5 ? `<details class="herald-archive"><summary>Older dispatches</summary>${list(entries.slice(5))}</details>` : ''}</section>`
    : '';
  const note = notices.note ? `<aside class="herald-note"><p>${escape(notices.note)}</p></aside>` : '';
  return latest + changes + note;
}

export class HeraldPanel {
  constructor({ root, openers = [], notices = HERALD_NOTICES } = {}) {
    this.root = root;
    this.openers = [...openers];
    this.notices = notices;
    this.opener = null;
    this.closing = null;
    this.body = root?.querySelector('[data-herald-body]');
    root?.querySelector('[data-herald-close]')?.addEventListener('click', () => this.close());
    for (const button of this.openers) button.addEventListener('click', () => (this.isOpen ? this.close() : this.open(button)));
  }

  get isOpen() {
    return Boolean(this.root) && !this.root.classList.contains('hidden') && !this.root.classList.contains('closing');
  }

  open(opener = null) {
    if (!this.root || this.isOpen) return;
    clearTimeout(this.closing);
    this.closing = null;
    this.opener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    if (this.body && !this.body.childElementCount) this.body.innerHTML = heraldMarkup(this.notices);
    this.root.classList.remove('hidden', 'closing');
    for (const button of this.openers) button.setAttribute('aria-expanded', 'true');
    this.root.querySelector('[data-herald-close]')?.focus({ preventScroll: true });
  }

  /** Folded away; focus back to what opened it (restore: false when the banner itself is going: nothing to return to). */
  close({ restore = true } = {}) {
    if (!this.isOpen) return;
    for (const button of this.openers) button.setAttribute('aria-expanded', 'false');
    this.root.classList.add('closing');
    const opener = this.opener;
    this.opener = null;
    this.closing = setTimeout(() => {
      this.root.classList.add('hidden');
      this.root.classList.remove('closing');
      this.closing = null;
    }, globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : HERALD_CLOSE_MS);
    if (restore && opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true });
  }
}
