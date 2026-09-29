import { CLOTH } from '../../shared/src/cosmetics.mjs';
import { renownView, rewardText } from './renownView.mjs';

export class RenownController {
  constructor({ socket, scene, document: doc = document, storage = localStorage }) {
    this.socket = socket;
    this.scene = scene;
    this.doc = doc;
    this.storage = storage;
    this.profile = null;
    this.preview = 'crimson';
    this.pending = false;
    this.error = '';
    this.inArmory = false;
    this.section = 'kit';
    for (const section of ['kit', 'heraldry']) {
      doc.querySelector(`#armory-${section}-tab`).addEventListener('click', () => this.selectSection(section));
    }
    // Cache is presentation only. Only server messages authorise purchases or equipment.
    try { this.profile = JSON.parse(storage.getItem('ss-profile-cache')); } catch {}
    this.preview = this.profile?.equipped ?? 'crimson';
    scene()?.setCloth(this.preview);
    this.cards = doc.querySelector('#armory-cloths');
    for (const item of Object.values(CLOTH)) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'cloth-card';
      button.dataset.cloth = item.id;
      button.style.setProperty('--cloth-color', item.color);
      button.textContent = item.name;
      button.setAttribute('role', 'radio');
      button.addEventListener('click', () => { this.preview = item.id; this.error = ''; this.render(); scene()?.setCloth(item.id); });
      this.cards.appendChild(button);
    }
    this.action = doc.querySelector('#cloth-action');
    this.action.addEventListener('click', () => {
      const view = renownView(this.profile, this.preview, this.online());
      if (view.disabled || this.pending) return;
      this.pending = true;
      this.error = '';
      this.render();
      socket.remote.send({ type: view.action === 'purchase' ? 'purchaseCloth' : 'equipCloth', cloth: view.item.id });
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.pending = false;
        this.error = 'Confirmation delayed. Reconnect or retry; repeat requests are safe.';
        this.render();
      }, 8000);
    });
    socket.on('profile', ({ profile }) => {
      this.profile = profile;
      this.pending = false;
      this.error = '';
      clearTimeout(this.timer);
      try { storage.setItem('ss-profile-cache', JSON.stringify(profile)); } catch {}
      if (!this.inArmory || this.section === 'kit') scene()?.setCloth(profile.equipped);
      this.render();
    });
    socket.on('profileError', ({ message }) => {
      this.pending = false;
      clearTimeout(this.timer);
      this.error = message;
      this.render();
    });
    socket.on('status', () => { if (!this.online()) this.pending = false; this.render(); });
    socket.on('snapshot', (snapshot) => { this.snapshot = snapshot; this.renderReward(); });
    this.render();
  }
  selectSection(section) {
    this.section = section;
    for (const id of ['kit', 'heraldry']) {
      this.doc.querySelector(`#armory-${id}`).classList.toggle('hidden', id !== section);
      this.doc.querySelector(`#armory-${id}-tab`).setAttribute('aria-pressed', String(id === section));
    }
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
    this.doc.querySelector('#renown-reward').textContent = rewardText(this.profile, this.snapshot, this.socket.playingLocally);
  }
  render() {
    const view = renownView(this.profile, this.preview, this.online());
    this.doc.querySelector('#renown-balance').textContent = this.profile ? `${this.profile.balance} RENOWN` : 'CONNECTING PROFILE…';
    for (const button of this.cards.children) {
      const id = button.dataset.cloth;
      const item = CLOTH[id];
      button.setAttribute('aria-checked', String(id === view.item.id));
      button.textContent = `${item.name} · ${this.profile?.equipped === id ? 'Equipped' : this.profile?.owned?.includes(id) ? 'Owned' : `${item.price} Renown`}`;
    }
    this.action.textContent = this.pending ? 'CONFIRMING…' : view.label;
    this.action.disabled = view.disabled || this.pending;
    this.doc.querySelector('#cloth-description').textContent = `${view.item.name} · Front and back tabard dye. Preview changes appearance here until you equip it.`;
    this.doc.querySelector('#renown-status').textContent = this.error || (!this.online()
      ? 'Connect to the game server to earn and spend Renown. Saved appearance is available for preview.'
      : 'Earn 20 for completing a qualifying match, plus 10 for victory. Practice and offline play award no Renown.');
    this.renderReward();
  }
}
