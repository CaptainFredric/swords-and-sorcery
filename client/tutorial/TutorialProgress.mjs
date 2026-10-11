export const TUTORIAL_1_VERSION = 1;
export const TUTORIAL_PROGRESS_KEY = 'ss-tutorial-1';

const STATUS = new Set(['unseen', 'skipped', 'completed']);
const DESTINATION_PARAMS = new Set(['room', 'invite', 'solo', 'tutorial', 'mode', 'world', 'inspect', 'inspection', 'autotest', 'debug']);

function browserStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

function readProgress(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) ?? 'null');
    return value?.version === TUTORIAL_1_VERSION && STATUS.has(value.status) ? value.status : 'unseen';
  } catch { return 'unseen'; }
}

/** Explicit destinations take precedence over an optional first visit offer. */
export function tutorialEntryBypassesOffer({ params, roomId, invite, deepLink, autoTest, debug, manualSolo } = {}) {
  if (roomId || invite || deepLink || autoTest || debug || manualSolo) return true;
  if (!params) return false;
  const entries = typeof params.entries === 'function' ? [...params.entries()] : Object.entries(params);
  return entries.some(([key]) => DESTINATION_PARAMS.has(key.toLowerCase()) || /^(?:test|debug|autotest|inspect)/i.test(key));
}

/** Only the first visit choice and final outcome are saved; checkpoints belong to the session. */
export class TutorialProgress {
  constructor({ storage = browserStorage(), key = TUTORIAL_PROGRESS_KEY } = {}) {
    this.storage = storage;
    this.key = key;
    this.status = readProgress(storage, key);
  }

  get snapshot() { return Object.freeze({ version: TUTORIAL_1_VERSION, status: this.status }); }

  shouldOfferFirstRun(entry = {}) {
    return this.status === 'unseen' && !tutorialEntryBypassesOffer(entry);
  }

  recordSkipped() { return this.#record('skipped'); }
  recordCompleted() { return this.#record('completed'); }

  #record(status) {
    // Another tab may already have completed the lesson. A replay skip preserves that result.
    const savedStatus = readProgress(this.storage, this.key);
    this.status = [this.status, savedStatus, status].includes('completed') ? 'completed' : status;
    try { this.storage?.setItem(this.key, JSON.stringify(this.snapshot)); } catch { /* Keep the choice for this visit. */ }
    return this.snapshot;
  }
}
