const STATUS_DURATIONS_MS = Object.freeze({
  'CLANG!': 180,
  PARRY: 340,
  'GUARD BROKEN': 520,
  'SLAIN  +1': 620,
  'FIGHT!': 420,
  'RECONNECTING…': 500,
});

export function combatStatusDurationMs(text) {
  return STATUS_DURATIONS_MS[text] ?? 450;
}

// A brief action acknowledgement, not a second subtitle. Reduce lingering
// Ultimate/view/status messages without making 180ms contact cues unreadable.
export function compactCombatStatusDurationMs(text, overrideMs = null) {
  const base = Number.isFinite(overrideMs)
    ? Math.max(0,overrideMs) : combatStatusDurationMs(text);
  return base<=250 ? base : Math.round(base*.82);
}
