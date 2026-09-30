import { PROWESS } from '../../shared/src/prowess.mjs';
import { ultimateFor } from '../../shared/src/ultimates.mjs';

// What the ultimate's tile and button show, from a knight's snapshot: its state, how full the meter is (0..1), and the
// words for the tile. Pure, so it is tested.
//   charging: the meter filling (its share); ready: full, the key will start it; bracing: its startup; active: running
//   (the seconds left); locked: interrupted a moment ago (the seconds until it can be tried again).
export function ultimateView(local, serverNow) {
  const ultimate = ultimateFor(local?.ultimate);
  const charge = Math.max(0, Math.min(1, (local?.prowess ?? 0) / PROWESS.full));
  const state = local?.ultimateState;
  if (state?.phase === 'active' && serverNow < state.until) {
    const left = state.until - serverNow;
    return { state: 'active', charge: left / ultimate.activeSec, label: left.toFixed(1), ultimate };
  }
  if (state?.phase === 'startup') return { state: 'bracing', charge: 1, label: 'BRACE', ultimate };
  const locked = (local?.ultimateLockedUntil ?? -Infinity) - serverNow;
  if (locked > 0.01) return { state: 'locked', charge, label: locked.toFixed(1), ultimate };
  if (charge >= 1) return { state: 'ready', charge: 1, label: 'READY', ultimate };
  return { state: 'charging', charge, label: `${Math.floor(charge * 100)}%`, ultimate };
}
