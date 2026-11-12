// The Practice Yard's recast gate. Practice is for practising: a knight should not stand about waiting out Gale
// Garner's cooldown to try it again. So in the yard an ability keeps its real cooldown (it starts, counts down and
// shows exactly as in a match, so the knight learns it) and, beside it, a short recast gate: once that has passed,
// the ability can be used again even though the real cooldown is still running. A use through the gate leaves the
// running cooldown alone (it does not start again each time, which would teach nothing); only a use once the real
// cooldown has actually run out starts a fresh one. Outside the Practice Yard the gate is never set nor read: a match
// keeps its ordinary cooldowns exactly. Current tuning (provisional).

export const PRACTICE_RECAST = Object.freeze({
  gateSec: 0.3,
  // what the gate covers: the spell slot (every spell, and Sheathe in Steel) and, as a movement drill, the dash
  // (each with the field that holds its real cooldown)
  keys: Object.freeze({ spell: 'spellReadyAt', dash: 'dashReadyAt' }),
});

/** Whether `ability` ('spell', 'dash') may be used now: its real cooldown run out, or (in the yard) its gate open. */
export function recastReady(player, ability, nowSec, practice) {
  const field = PRACTICE_RECAST.keys[ability];
  if (!player || !field) return false;
  if (nowSec >= (player[field] ?? 0)) return true;
  return Boolean(practice) && nowSec >= (player.practiceGate?.[ability] ?? -Infinity);
}

/** Whether the yard's gate is what lets `ability` be used now (its real cooldown still running): for the HUD's mark. */
export function practiceOverride(player, ability, nowSec, practice) {
  const field = PRACTICE_RECAST.keys[ability];
  return Boolean(practice) && Boolean(field) && nowSec < (player?.[field] ?? 0) && nowSec >= (player?.practiceGate?.[ability] ?? -Infinity);
}

/**
 * Record a use of `ability` at `nowSec`: a fresh real cooldown of `cooldownSec` if the last had run out (always, in a
 * match), the running one left alone if the yard's gate let it through; and in the yard, the gate shut for a moment.
 * `readyAt`: the gate opens no sooner than this (a spell still gathering in the palm, say).
 */
export function recordUse(player, ability, nowSec, cooldownSec, practice, { readyAt = nowSec } = {}) {
  const field = PRACTICE_RECAST.keys[ability];
  if (!player || !field) return;
  if (!practice || nowSec >= (player[field] ?? 0)) player[field] = nowSec + cooldownSec;
  if (practice) player.practiceGate = { ...(player.practiceGate ?? {}), [ability]: Math.max(readyAt, nowSec + PRACTICE_RECAST.gateSec) };
}
