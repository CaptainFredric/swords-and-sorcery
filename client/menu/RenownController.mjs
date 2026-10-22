import { CLOTH } from '../../shared/src/cosmetics.mjs';
import { DEFAULT_EMBLEM, EMBLEMS } from '../../shared/src/heraldry.mjs';
import { heraldryView, renownView, rewardText } from './renownView.mjs';
import { appUrl } from '../appUrl.mjs';

const SVG = 'http://www.w3.org/2000/svg';
// the Castleward trident, for its heraldry card
function tridentMark(doc) {
  if (typeof doc.createElementNS !== 'function') {
    const glyph = doc.createElement('span');
    glyph.textContent = 'Ψ';
    return glyph;
  }
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 34');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG, 'path');
  path.setAttribute('fill', '#e8cfa0');
  path.setAttribute('d', 'M11 9h2v25h-2zM12 1l3.5 6h-7zM4 11h2v6c0 2.2 2.4 3.6 6 3.6s6-1.4 6-3.6v-6h2v6c0 3.6-3.3 5.6-8 5.6s-8-2-8-5.6zM5 6l2.6 5H2.4zM19 6l2.6 5h-5.2z');
  svg.appendChild(path);
  return svg;
}

export class RenownController {
  constructor({ socket, scene, spell = () => null, document: doc = document, storage = localStorage }) {
    this.socket = socket;
    this.scene = scene;
    this.spell = spell;
    this.feedback = '';
    this.operation = null;
    this.cardLabels = new Map();
    this.doc = doc;
    this.storage = storage;
    this.profile = null;
    this.preview = 'crimson';
    this.pending = false;
    this.error = '';
    this.inArmory = false;
    this.section = 'kit';
    for (const section of ['kit', 'heraldry', 'challenges']) {
      doc.querySelector(`#armory-${section}-tab`)?.addEventListener('click', () => this.selectSection(section));
    }
    // Cache is presentation only. Only server messages authorise purchases or equipment.
    try {
      const cached = JSON.parse(storage.getItem('ss-profile-cache'));
      if (Number.isSafeInteger(cached?.balance) && cached.balance >= 0 && Array.isArray(cached.owned)
        && cached.owned.includes(cached.equipped) && Object.hasOwn(CLOTH, cached.equipped)) this.profile = cached;
    } catch {}
    this.preview = this.profile?.equipped ?? 'crimson';
    scene()?.setCloth(this.preview);
    this.emblemPreview = this.carriedEmblem();
    scene()?.setEmblem?.(this.emblemPreview);
    this.cards = doc.querySelector('#armory-cloths');
    for (const item of Object.values(CLOTH)) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'cloth-card';
      button.dataset.cloth = item.id;
      button.style.setProperty('--cloth-color', item.color);
      const swatch = doc.createElement('span');
      swatch.className = 'cloth-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const words = doc.createElement('span');
      const name = doc.createElement('strong');
      name.textContent = item.name;
      const status = doc.createElement('small');
      words.appendChild(name); words.appendChild(status);
      button.appendChild(swatch); button.appendChild(words);
      this.cardLabels.set(item.id, status);
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => { this.preview = item.id; this.error = ''; this.feedback = ''; this.render(); scene()?.setCloth(item.id); scene()?.showBanner?.(false); });
      button.addEventListener('keydown', (event) => {
        const ids = Object.keys(CLOTH), index = ids.indexOf(item.id);
        const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!delta && !['Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : (index + delta + ids.length) % ids.length;
        this.preview = ids[next]; this.error = ''; this.feedback = '';
        this.render(); scene()?.setCloth(this.preview); this.cards.children[next].focus();
      });
      this.cards.appendChild(button);
    }
    this.action = doc.querySelector('#cloth-action');
    this.action.addEventListener('click', () => {
      const view = renownView(this.profile, this.preview, this.online());
      if (view.disabled || this.pending) return;
      this.pending = true;
      this.operation = { action: view.action, id: view.item.id };
      this.feedback = '';
      this.error = '';
      this.render();
      socket.remote.send({ type: view.action === 'purchase' ? 'purchaseCloth' : 'equipCloth', cloth: view.item.id });
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.pending = false;
        this.operation = null;
        this.error = 'Confirmation delayed. Reconnect or retry; repeat requests are safe.';
        this.render();
      }, 8000);
    });
    // the heraldry: the trident and each earned emblem, previewed on his back banner (he turns to show it)
    this.emblemCards = doc.querySelector('#armory-emblems');
    this.emblemLabels = new Map();
    const previewEmblem = (id) => {
      this.emblemPreview = id; this.error = ''; this.feedback = '';
      this.render();
      const available = EMBLEMS[id].available;
      scene()?.setEmblem?.(available ? id : this.carriedEmblem());
      scene()?.showBanner?.(available);
    };
    for (const emblem of Object.values(EMBLEMS)) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'cloth-card emblem-card';
      button.dataset.emblem = emblem.id;
      const mark = doc.createElement('span');
      mark.className = 'emblem-mark';
      if (emblem.art) {
        const img = doc.createElement('img');
        img.src = appUrl(emblem.art); img.alt = ''; img.decoding = 'async';
        mark.appendChild(img);
      } else if (!emblem.available) {
        mark.className += ' pending';
        mark.textContent = 'ART PENDING';
      } else mark.appendChild(tridentMark(doc));
      const words = doc.createElement('span');
      const name = doc.createElement('strong');
      name.textContent = emblem.name;
      const status = doc.createElement('small');
      words.appendChild(name); words.appendChild(status);
      button.appendChild(mark); button.appendChild(words);
      this.emblemLabels.set(emblem.id, status);
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => previewEmblem(emblem.id));
      button.addEventListener('keydown', (event) => {
        const ids = Object.keys(EMBLEMS), index = ids.indexOf(emblem.id);
        const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (!delta) return;
        event.preventDefault();
        const next = (index + delta + ids.length) % ids.length;
        previewEmblem(ids[next]); this.emblemCards.children[next].focus();
      });
      this.emblemCards?.appendChild(button);
    }
    this.emblemAction = doc.querySelector('#emblem-action');
    this.emblemAction?.addEventListener('click', () => {
      const view = heraldryView(this.profile, this.emblemPreview, this.online());
      if (view.disabled || this.pending) return;
      this.pending = true;
      this.operation = { action: 'equipEmblem', id: view.emblem.id };
      this.feedback = ''; this.error = '';
      this.render();
      socket.remote.send({ type: 'equipEmblem', emblem: view.emblem.id });
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.pending = false;
        this.operation = null;
        this.error = 'Confirmation delayed. Reconnect or retry; repeat requests are safe.';
        this.render();
      }, 8000);
    });
    socket.on('profile', ({ profile }) => {
      this.profile = profile;
      const operation = this.operation;
      const confirmed = operation && (operation.action === 'purchase' ? profile.owned.includes(operation.id)
        : operation.action === 'equipEmblem' ? profile.emblem === operation.id : profile.equipped === operation.id);
      if (confirmed) {
        if (operation.action === 'equipEmblem') this.feedback = `${EMBLEMS[operation.id].name} carried on your back banner.`;
        else {
          const name = CLOTH[operation.id].name;
          this.feedback = operation.action === 'purchase' ? `${name} unlocked. Equip it when ready.` : `${name} equipped. Your next battle awaits.`;
        }
        this.operation = null;
      }
      if (!operation || confirmed) { this.pending = false; clearTimeout(this.timer); }
      this.error = '';
      try { storage.setItem('ss-profile-cache', JSON.stringify(profile)); } catch {}
      if (!this.inArmory || this.section === 'kit') { scene()?.setCloth(profile.equipped); scene()?.setEmblem?.(this.carriedEmblem()); }
      this.render();
    });
    socket.on('profileError', ({ message }) => {
      this.pending = false;
      this.operation = null;
      clearTimeout(this.timer);
      this.error = message;
      this.render();
    });
    socket.on('status', () => {
      if (!this.online()) { this.pending = false; this.operation = null; clearTimeout(this.timer); }
      this.render();
    });
    socket.on('snapshot', (snapshot) => { this.snapshot = snapshot; this.renderReward(); });
    this.render();
  }
  selectSection(section) {
    if (!['kit', 'heraldry', 'challenges'].includes(section)) return;
    const changed = this.section !== section;
    this.section = section;
    for (const id of ['kit', 'heraldry', 'challenges']) {
      this.doc.querySelector(`#armory-${id}`)?.classList.toggle('hidden', id !== section);
      this.doc.querySelector(`#armory-${id}-tab`)?.setAttribute('aria-pressed', String(id === section));
    }
    if (changed) {
      const scroll = this.doc.querySelector('#armory-menu .armory-scroll');
      if (scroll) scroll.scrollTop = 0;
    }
    this.scene()?.showSpell?.(section === 'kit' ? this.spell() : null);
    this.scene()?.setCloth(section === 'heraldry' ? this.preview : this.profile?.equipped ?? 'crimson');
    const available = EMBLEMS[this.emblemPreview]?.available;
    this.scene()?.setEmblem?.(section === 'heraldry' && available ? this.emblemPreview : this.carriedEmblem());
    if (section !== 'heraldry' || !available) this.scene()?.showBanner?.(false);
  }
  carriedEmblem() { return EMBLEMS[this.profile?.emblem] ? this.profile.emblem : DEFAULT_EMBLEM; }
  online() { return this.socket.status === 'online' && this.socket.remote.profileReady; }
  route(screen) {
    const entering = screen === 'ARMORY' && !this.inArmory;
    this.inArmory = screen === 'ARMORY';
    if (entering) { this.preview = this.profile?.equipped ?? 'crimson'; this.emblemPreview = this.carriedEmblem(); this.selectSection('kit'); this.render(); }
    if (!this.inArmory) {
      this.scene()?.setCloth(this.profile?.equipped ?? 'crimson');
      this.scene()?.setEmblem?.(this.carriedEmblem());
      this.scene()?.showBanner?.(false);
    }
  }
  renderReward() {
    const text = this.error && this.snapshot?.roomState === 'FINISHED' && this.profile?.lastReward?.matchId !== this.snapshot.rewardMatchId
      ? this.error : rewardText(this.profile, this.snapshot, this.socket.playingLocally);
    const node = this.doc.querySelector('#renown-reward');
    if (node.textContent !== text) node.textContent = text;
  }
  render() {
    const view = renownView(this.profile, this.preview, this.online());
    this.doc.querySelector('#renown-balance').textContent = this.profile ? String(view.balance) : '…';
    this.doc.querySelector('#renown-collection').textContent = view.collection;
    for (const button of this.cards.children) {
      const id = button.dataset.cloth, item = CLOTH[id];
      const status = this.profile?.equipped === id ? 'Equipped' : this.profile?.owned?.includes(id) ? 'Owned' : `${item.price} Renown`;
      button.setAttribute('aria-checked', String(id === view.item.id));
      button.setAttribute('aria-label', `${item.name} · ${status}`);
      button.tabIndex = id === view.item.id ? 0 : -1;
      this.cardLabels.get(id).textContent = status;
    }
    this.action.textContent = this.pending ? 'CONFIRMING…' : view.label;
    this.action.disabled = view.disabled || this.pending;
    this.doc.querySelector('#cloth-name').textContent = view.item.name;
    this.doc.querySelector('#cloth-description').textContent = view.item.description;
    this.doc.querySelector('#cloth-hint').textContent = view.hint;
    const progress = this.doc.querySelector('#cloth-progress');
    progress.value = view.progress;
    progress.hidden = view.owned;
    progress.setAttribute('aria-valuetext', `${Math.min(view.balance, view.item.price)} of ${view.item.price} Renown`);
    const heraldry = heraldryView(this.profile, this.emblemPreview, this.online());
    for (const button of this.emblemCards?.children ?? []) {
      const id = button.dataset.emblem;
      const status = heraldryView(this.profile, id, this.online()).status;
      button.setAttribute('aria-checked', String(id === heraldry.emblem.id));
      button.setAttribute('aria-label', `${EMBLEMS[id].name} · ${status}`);
      button.classList.toggle('locked', status === 'Locked');
      button.tabIndex = id === heraldry.emblem.id ? 0 : -1;
      this.emblemLabels.get(id).textContent = status;
    }
    if (this.emblemAction) {
      this.emblemAction.textContent = this.pending && this.operation?.action === 'equipEmblem' ? 'CONFIRMING…' : heraldry.label;
      this.emblemAction.disabled = heraldry.disabled || this.pending;
      this.doc.querySelector('#emblem-name').textContent = heraldry.emblem.name;
      this.doc.querySelector('#emblem-description').textContent = heraldry.emblem.description;
      this.doc.querySelector('#emblem-flavor').textContent = heraldry.emblem.flavor ? `“${heraldry.emblem.flavor}”` : '';
      this.doc.querySelector('#emblem-hint').textContent = heraldry.hint;
    }
    this.doc.querySelector('#renown-status').textContent = this.error || (!this.online()
      ? 'Reconnect to earn and spend Renown. You can still preview your standards.'
      : this.feedback || 'Preview freely. Unlock and equip when ready.');
    this.renderReward();
  }
}
