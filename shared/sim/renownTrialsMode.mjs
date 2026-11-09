// Renown Trials consumer adapter for Restless Day's shared modeRuntime registry.
// This file does not import the registry, so it is safe to implement and test
// before the final two-parent #402 → #401 integration merge is authorized.
import {
  beginRenownTrial, stepRenownTrial, serializeRenownTrial,
} from './renownTrials.mjs';

export const RENOWN_TRIALS_HANDLER = Object.freeze({
  init: (room) => { room.renownTrial = null; },
  reset: (room, nowSec) => beginRenownTrial(room, nowSec),
  // Backward-compatible optional hook requested from the #402 maintainer.
  // The director MUST advance even while ordinary combat physics is suspended
  // for a ceremony or a wave transition.
  preStep: (room, nowSec) => stepRenownTrial(room, nowSec),
  onTime: () => true, // never use ordinary match clock to terminate a wave
  serialize: (room, nowSec) => serializeRenownTrial(room, nowSec),
});
