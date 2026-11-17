// The rhythm meter: a training aid for the Practice Yard (a setting, off by default; never in a match). A strip from
// just before a cut's contact to where its next cut would begin anyway: the window a press for that cut counts in,
// the beat inside it, a cursor running from your latest contact, and a dot for each of your last presses, where it
// fell, coloured by how it was judged (on the beat, in time, early, late), with the last one written out in ms.

import { CADENCE } from '../../shared/src/combatFrameData.mjs';

const SPAN = Object.freeze({ from: -0.08, to: CADENCE.close + 0.1 });
const WORDS = Object.freeze({ perfect: 'On the beat', good: 'In time', early: 'Early', late: 'Late' });
const at = (t) => `${(100 * (Math.max(SPAN.from, Math.min(SPAN.to, t)) - SPAN.from) / (SPAN.to - SPAN.from)).toFixed(2)}%`;

export class RhythmMeter {
  constructor(parent) {
    const root = document.createElement('div');
    root.className = 'rhythm-meter';
    root.hidden = true;
    root.innerHTML = `<div class="rhythm-label">Rhythm <span class="rhythm-last"></span></div>
      <div class="rhythm-track"><i class="rhythm-window"></i><i class="rhythm-beat"></i><i class="rhythm-contact"></i>
      <i class="rhythm-cursor"></i><div class="rhythm-dots"></div></div>`;
    parent?.appendChild(root);
    this.root = root;
    const place = (cls, a, b) => { const el = root.querySelector(cls); el.style.left = at(a); if (b !== undefined) el.style.width = `calc(${at(b)} - ${at(a)})`; };
    place('.rhythm-window', CADENCE.open, CADENCE.close);
    place('.rhythm-beat', CADENCE.beat - CADENCE.perfect, CADENCE.beat + CADENCE.perfect);
    place('.rhythm-contact', 0);
    this.cursor = root.querySelector('.rhythm-cursor');
    this.dots = root.querySelector('.rhythm-dots');
    this.last = root.querySelector('.rhythm-last');
  }

  /** A press for the next cut, judged: { grade, offset } (offset: seconds from the beat). */
  press({ grade, offset }) {
    if (!WORDS[grade] || !Number.isFinite(offset)) return;
    const dot = document.createElement('i');
    dot.className = `rhythm-dot ${grade}`;
    dot.style.left = at(CADENCE.beat + offset);
    this.dots.appendChild(dot);
    while (this.dots.children.length > 6) this.dots.firstElementChild.remove();
    [...this.dots.children].forEach((d, i, all) => { d.style.opacity = String(0.3 + 0.7 * (i + 1) / all.length); });
    const ms = Math.round(offset * 1000);
    this.last.textContent = `${WORDS[grade]} ${ms >= 0 ? '+' : '−'}${Math.abs(ms)} ms`;
    this.last.className = `rhythm-last ${grade}`;
  }

  /** Each frame: shown or not, and how long since your latest contact (seconds, or null between chains). */
  update(visible, sinceContact) {
    if (this.root.hidden === visible) this.root.hidden = !visible;
    if (!visible) return;
    const live = Number.isFinite(sinceContact) && sinceContact <= SPAN.to;
    this.cursor.style.opacity = live ? '1' : '0';
    if (live) this.cursor.style.left = at(sinceContact);
  }

  dispose() { this.root.remove(); }
}
