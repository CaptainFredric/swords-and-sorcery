import { PROWESS } from '../../shared/src/prowess.mjs';
import { ultimateFor, vortexTune } from '../../shared/src/ultimates.mjs';
import { keyLabel } from '../settings/settingsRegistry.mjs';

// What the ultimate's tile and button show, from a knight's snapshot: its state, how full the meter is (0..1), and the
// words for the tile. Pure, so it is tested.
//   charging: the meter filling (its share); ready: full, the key will start it; bracing: its startup; active: running
//   (the seconds left); locked: interrupted a moment ago, or just ended (the seconds until it can be tried again).
// While it runs: `left` (seconds), `charge` (the share of its stretch left), and for a Blazing Vortex its `emphasis`
// ('balanced', 'blade' or 'fire': what the knight has steered it to, as the host has it) with a word for it (`word`).
// practice: in the Practice Yard the key readies the ultimate itself, so the tile says READY whenever it would work.
const EMPHASIS_WORDS = Object.freeze({ balanced: 'VORTEX', blade: 'BLADE', fire: 'FIRE' });

export function ultimateView(local, serverNow, { practice = false } = {}) {
  const ultimate = ultimateFor(local?.ultimate);
  const charge = Math.max(0, Math.min(1, (local?.prowess ?? 0) / PROWESS.full));
  const state = local?.ultimateState;
  if (state?.phase === 'active' && serverNow < state.until) {
    const left = state.until - serverNow;
    const emphasis = state.id === 'vortex' ? vortexTune(state.emphasis).kind : null;
    return {
      state: 'active', charge: Math.max(0, Math.min(1, left / ultimate.activeSec)), label: left.toFixed(1), left, ultimate,
      ...(emphasis ? { emphasis, word: EMPHASIS_WORDS[emphasis] } : {}),
    };
  }
  // (its startup: a Sunder is braced into; a Vortex has no brace, it is lit)
  if (state?.phase === 'startup') return { state: 'bracing', charge: 1, label: state.id === 'chivalry' ? 'PREPARE' : ultimate.hop ? 'IGNITE' : 'BRACE', ultimate };
  const locked = Math.max(local?.ultimateLockedUntil ?? -Infinity, local?.recoverUntil ?? -Infinity) - serverNow;
  if (locked > 0.01) return { state: 'locked', charge, label: locked.toFixed(1), ultimate };
  if (charge >= 1 || practice) return { state: 'ready', charge: 1, label: 'READY', ultimate };
  return { state: 'charging', charge, label: `${Math.floor(charge * 100)}%`, ultimate };
}

// how a held button reads in the hint: the mouse's buttons as a player says them, any other key as its key chip does
const HELD_WORDS = Object.freeze({ Mouse0: 'LEFT CLICK', Mouse2: 'RIGHT CLICK', Mouse1: 'MIDDLE CLICK' });

/**
 * The line under a Vortex's name as it is lit: how it is steered. Hold the attack for the fire, the guard for the
 * blade: said by the buttons the player has (their own bindings; on a touch screen, the buttons' names).
 */
export function vortexHint({ touch = false, bindings = {} } = {}) {
  const word = (action, fallback) => {
    const code = touch ? null : bindings[action]?.[0];
    return code ? HELD_WORDS[code] ?? keyLabel(code).toUpperCase() : fallback;
  };
  return `${word('attack', 'ATTACK')} — FIRE   ·   ${word('guard', 'GUARD')} — BLADE`;
}
