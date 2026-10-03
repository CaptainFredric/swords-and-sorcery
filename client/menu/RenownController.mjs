import { CLOTH } from '../../shared/src/cosmetics.mjs';
import { renownView, rewardText } from './renownView.mjs';

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
      button.addEventListener('click', () => { this.preview = item.id; this.error = ''; this.feedback = ''; this.render(); scene()?.setCloth(item.id); });
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
    socket.on('profile', ({ profile }) => {
      this.profile = profile;
      const operation = this.operation;
      const confirmed = operation && (operation.action === 'purchase' ? profile.owned.includes(operation.id) : profile.equipped === operation.id);
      if (confirmed) {
        const name = CLOTH[operation.id].name;
        this.feedback = operation.action === 'purchase' ? `${name} unlocked. Equip it when ready.` : `${name} equipped. Your next battle awaits.`;
        this.operation = null;
      }
      if (!operation || confirmed) { this.pending = false; clearTimeout(this.timer); }
      this.error = '';
      try { storage.setItem('ss-profile-cache', JSON.stringify(profile)); } catch {}
      if (!this.inArmory || this.section === 'kit') scene()?.setCloth(profile.equipped);
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
  }
  online() { return this.socket.status === 'online' && this.socket.remote.profileReady; }
  route(screen) {
    const entering = screen === 'ARMORY' && !this.inArmory;
    this.inArmory = screen === 'ARMORY';
    if (entering) { this.preview = this.profile?.equipped ?? 'crimson'; this.selectSection('kit'); this.render(); }
    if (!this.inArmory) this.scene()?.setCloth(this.profile?.equipped ?? 'crimson');
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
    this.doc.querySelector('#renown-status').textContent = this.error || (!this.online()
      ? 'Reconnect to earn and spend Renown. You can still preview your standards.'
      : this.feedback || 'Preview freely. Unlock and equip when ready.');
    this.renderReward();
  }
}
