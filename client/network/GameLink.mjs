// Solo always uses the browser's shared authoritative simulation. Multiplayer uses the game server.
// The server connection stays available in the background for profiles and the next multiplayer match.
//
//   connecting  just asked
//   waking      no answer yet after a moment: probably asleep (a free server naps when nobody plays)
//   online      the server is there
//   offline     it could not be reached; retrying

import { GameSocket } from './GameSocket.mjs';
import { LocalHost } from './LocalHost.mjs';

export const LINK_TIMING = Object.freeze({
  wakeAfterMs: 2500,
  // a sleeping server takes up to about a minute to wake; past that it is down
  giveUpMs: 75000,
  retryMs: Object.freeze([5000, 10000, 20000, 30000]),
});

// What the front door makes of each state: whether online play is open, a line in the realm's own words (a free
// server naps when nobody plays, so the heralds must ride out and rouse it), a plain note under it, and the longer
// explanation for anyone who hovers.
export function linkStatusView(status) {
  switch (status) {
    case 'online': return { online: true, title: '', note: '', detail: '', tone: 'online' };
    case 'waking': return {
      online: false, tone: 'waking',
      title: 'Heralds ride out to rally worthy Spellblades…',
      note: 'multiplayer waking · solo is ready',
      detail: 'The multiplayer server naps when nobody plays and takes up to a minute to wake. Practice and Bot Duel run in your browser meanwhile.',
    };
    case 'offline': return {
      online: false, tone: 'offline',
      title: 'No herald has returned yet.',
      note: 'multiplayer offline · solo still works',
      detail: 'The multiplayer server cannot be reached; it is tried again when you request an online match. Practice and Bot Duel run in your browser.',
    };
    case 'dormant':
    case 'unconnected': return {
      online: false, tone: 'dormant',
      title: '',
      note: 'multiplayer on demand',
      detail: 'Multiplayer connects when you start an online match or shared practice. Solo modes run locally in your browser.',
    };
    default: return { online: false, title: 'Sounding the horn…', note: 'reaching multiplayer', detail: '', tone: 'connecting' };
  }
}

// and when the server answers after all
export const LINK_RESTORED = Object.freeze({ title: 'WORTHY CHALLENGERS AWAIT YOU!', note: '(multiplayer now online)' });

const FORWARDED = ['playerId', 'token', 'roomCode', 'latestSnapshot', 'snapshotReceivedAt', 'pingMs'];
const PLAY = ['startMatch', 'ready', 'arenaReady', 'setInputSampler', 'practiceResetPlayer', 'practiceSpawnDummy', 'practiceRemoveDummy',
  'practiceSetDummyMode', 'practiceReadyUltimate', 'practicePerryAnswer', 'practicePerryDismiss', 'input', 'attack', 'guard', 'cast', 'castCurrentSpell', 'selectPreparedSlot', 'castPreparedSlot', 'castPreparedSpell', 'selectPreparedSpell', 'gauntlet', 'ultimate', 'dash', 'rematch', 'switchTeam', 'markTarget', 'vote',
  'ping', 'send'];
const ONLINE = ['createSharedPracticeRoom', 'createRoom', 'createBreakthroughRoom', 'quickPlay', 'joinRoom', 'seekDuel', 'cancelSeek', 'seekBotDuel', 'listRooms', 'createPublicRoom'];

export class GameLink {
  constructor({ remote = new GameSocket(), local = new LocalHost(), timing = LINK_TIMING, timers = globalThis } = {}) {
    this.remote = remote;
    this.local = local;
    this.timing = timing;
    this.timers = timers;
    this.handlers = new Map();
    this.status = 'dormant';
    this.hosting = 'remote';
    this.retries = 0;
    this.retryTimer = null;
    this.wakingTimer = null;
    this.connectPromise = null;
    this.pendingAction = null;
    // each host's messages reach the game only while that host is the one playing
    remote.on('*', ({ type, payload }) => this.#fromRemote(type, payload));
    local.on('*', ({ type, payload }) => { if (this.hosting === 'local') this.#emit(type, payload); });
    for (const key of FORWARDED) Object.defineProperty(this, key, { get: () => this.active[key], enumerable: true });
    for (const method of PLAY) this[method] = (...args) => this.active[method](...args);
    for (const method of ONLINE) this[method] = (...args) => this.#online(method, args);
  }

  get active() {
    return this.hosting === 'local' ? this.local : this.remote;
  }

  /** Whether this match is being played in the browser (no server). */
  get playingLocally() {
    return this.hosting === 'local';
  }

  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  #emit(type, payload) {
    for (const handler of this.handlers.get(type) ?? []) handler(payload);
  }

  #fromRemote(type, payload) {
    if (type === 'connection') this.#setStatus(payload.connected ? 'online' : 'offline');
    if (type === 'profile') {
      this.local.setProfileCloth(payload.profile?.equipped);
      this.local.setProfile(payload.profile, payload.token);
    }
    if (this.hosting === 'remote' || type === 'profile' || type === 'profileError') this.#emit(type, payload);
  }

  #setStatus(status) {
    if (status === this.status) return;
    const was = this.status;
    this.status = status;
    if (status === 'online') this.retries = 0;
    this.#emit('status', { status, was });
  }

  /** Reach the server on demand, waiting for readiness; deduplicates multiple in-flight attempts. */
  async ensureConnected() {
    if (this.status === 'online' && (this.remote.ws ? this.remote.ws.readyState === WebSocket.OPEN : true)) {
      return true;
    }
    if (this.connectPromise) return this.connectPromise;

    this.#setStatus('connecting');
    this.timers.clearTimeout(this.wakingTimer);
    this.wakingTimer = this.timers.setTimeout(() => {
      if (this.status === 'connecting') this.#setStatus('waking');
    }, this.timing.wakeAfterMs);

    this.connectPromise = (async () => {
      try {
        await this.remote.connect({ resume: true, timeoutMs: this.timing.giveUpMs });
        this.#connected();
        return true;
      } catch {
        this.#setStatus('offline');
        return false;
      } finally {
        this.timers.clearTimeout(this.wakingTimer);
        this.wakingTimer = null;
        this.connectPromise = null;
      }
    })();
    return this.connectPromise;
  }

  async connect() {
    return this.ensureConnected();
  }

  #connected() {
    this.#setStatus('online');
    // every connection carries what the player brings (the Armory's spell): heard like a reconnect
    if (this.hosting === 'remote') this.#emit('connection', { connected: true });
    else this.remote.loadout(this.local.spell, this.local.ultimateId, this.local.preparedSpells, this.local.siegeLoadout);
  }

  /** Try the server again now (the Retry button). */
  retryNow() {
    if (this.status === 'online') return Promise.resolve(true);
    this.retries = 0;
    this.timers.clearTimeout(this.retryTimer);
    return this.ensureConnected();
  }

  disconnect() {
    this.pendingAction = null;
    this.connectPromise = null;
    this.timers.clearTimeout(this.wakingTimer);
    this.timers.clearTimeout(this.retryTimer);
    this.wakingTimer = null;
    this.retryTimer = null;
    this.remote.close?.({ clearSession: true });
    this.#setStatus('dormant');
    this.hosting = 'remote';
  }

  /** Solo has its own host regardless of the multiplayer connection's availability. */
  startSolo(mode, name, worldId, botSkill, team = null, teamSize = null) {
    if (this.hosting === 'remote' && this.remote.roomCode) this.remote.leaveRoom();
    this.disconnect();
    this.hosting = 'local';
    this.local.startSolo(mode, name, worldId, botSkill, false, team, teamSize);
  }

  /** An explicitly local yard for pose and effect inspection, even when online. */
  startInspectionPractice(name, worldId) {
    if (this.hosting === 'remote' && this.remote.roomCode) this.remote.leaveRoom();
    this.disconnect();
    this.hosting = 'local';
    this.local.startInspectionPractice(name, worldId);
  }

  startTutorial(name) {
    if (this.hosting === 'remote' && this.remote.roomCode) this.remote.leaveRoom();
    this.disconnect();
    this.hosting = 'local';
    this.local.startTutorial(name);
  }

  get inspectionActorId() { return this.inspectionAvailable ? this.local.inspectionActorId : null; }
  setInspectionActor(id) { return this.inspectionAvailable && this.local.setInspectionActor(id); }
  releaseInspectionInput() { return this.inspectionAvailable && this.local.releaseInspectionInput(); }

  get inspectionAvailable() { return this.playingLocally && this.local.inspectionEnabled; }
  get inspectionFrozen() { return this.inspectionAvailable && this.local.inspectionFrozen; }
  setInspectionFrozen(frozen) { return this.inspectionAvailable && this.local.setInspectionFrozen(frozen); }
  get inspectionFreezeMode() { return this.inspectionAvailable ? this.local.inspectionFreezeMode : 'none'; }
  setInspectionFreezeMode(mode) { return this.inspectionAvailable && this.local.setInspectionFreezeMode(mode); }
  get inspectionFreezeProjectiles() { return this.inspectionAvailable ? this.local.inspectionFreezeProjectiles : false; }
  setInspectionFreezeProjectiles(freeze) { return this.inspectionAvailable && this.local.setInspectionFreezeProjectiles(freeze); }
  get inspectionFramesPlaying() { return this.inspectionAvailable && this.local.inspectionFramesPlaying; }
  playInspectionFrames(playing) { return this.inspectionAvailable && this.local.playInspectionFrames(playing); }
  stepInspection() { return this.inspectionAvailable && this.local.stepInspection(); }
  stageInspectionActor(options) { return this.inspectionAvailable && this.local.stageInspectionActor(options); }
  siegeOperate() { return this.playingLocally ? this.local.siegeOperate() : this.send({ type: 'siegeOperate' }); }
  bibyeOperate() { return this.playingLocally ? this.local.bibyeOperate() : this.send({ type: 'bibyeOperate' }); }
  bibyeFire(weapon = 'MAIN') { return this.playingLocally ? this.local.bibyeFire(weapon) : this.send({ type: 'bibyeFire', weapon }); }
  bibyeToggleDeploy() { return this.playingLocally ? this.local.bibyeToggleDeploy() : this.send({ type: 'bibyeToggleDeploy' }); }
  bibyeWeaponFocus(focus) { return this.playingLocally ? this.local.bibyeWeaponFocus(focus) : this.send({ type: 'bibyeWeaponFocus', focus }); }
  practiceSiege(action, machine) { return this.playingLocally ? this.local.practiceSiege(action, machine) : this.send({ type: 'practiceSiege', action, machine }); }

  // Online actions wake and connect to the server on demand, executing the requested command once ready.
  async #online(method, args) {
    if (method === 'cancelSeek') {
      if (this.pendingAction?.method === 'seekDuel') {
        this.pendingAction = null;
      }
      if (this.status === 'online') {
        this.remote.cancelSeek();
      }
      return;
    }

    if (this.status === 'online') {
      if (this.hosting === 'local') this.local.leaveRoom();
      this.hosting = 'remote';
      this.remote[method](...args);
      return;
    }

    // Deduplicate rapid identical calls while connection is in-flight
    if (this.pendingAction && this.pendingAction.method === method && JSON.stringify(this.pendingAction.args) === JSON.stringify(args)) {
      return;
    }
    this.pendingAction = { method, args };

    const connected = await this.ensureConnected();
    const action = this.pendingAction;
    this.pendingAction = null;

    if (!connected) {
      if (action?.method === method) {
        if (method === 'seekDuel') {
          this.#emit('notice', { text: 'No challengers yet: a Reanimated Armor steps in (multiplayer offline)' });
          this.hosting = 'local';
          this.local.startSolo('BOT_DUEL', args[0]);
          return;
        }
        if (method === 'createSharedPracticeRoom') {
          this.#emit('notice', { text: 'Shared Practice requires a connection to the multiplayer server. Solo Practice remains available.' });
          return;
        }
        this.#emit('notice', { text: 'The multiplayer server cannot be reached. Solo play is ready.' });
      }
      return;
    }

    if (action && action.method === method) {
      if (this.hosting === 'local') this.local.leaveRoom();
      this.hosting = 'remote';
      this.remote[method](...args);
    }
  }

  leaveRoom() {
    const wasRemote = this.hosting === 'remote';
    this.active.leaveRoom();
    if (wasRemote) {
      this.disconnect();
    } else {
      this.hosting = 'local';
    }
  }

  loadout(spell, ultimate, preparedSpells, siegeLoadout) {
    this.local.loadout(spell, ultimate, preparedSpells, siegeLoadout);
    this.remote.loadout(spell, ultimate, preparedSpells, siegeLoadout);
  }

  serverNow() {
    return this.active.serverNow();
  }

  close() {
    this.disconnect();
    this.local.close();
  }
}
