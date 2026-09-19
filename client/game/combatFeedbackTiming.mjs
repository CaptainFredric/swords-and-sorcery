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
