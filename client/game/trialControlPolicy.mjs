// Client-only presentation policy. Never decides server combat legality or
// the Renowner verdict. The server remains authoritative about every phase.
export function renownTrialControlsLocked(snapshot) {
  if (snapshot?.mode !== 'RENOWN_TRIALS' || snapshot?.roomState !== 'PLAYING') return false;
  const phase = snapshot.renownTrial?.phase;
  return Boolean(phase && phase !== 'WAVE_ACTIVE' && phase !== 'WAVE_OVERTIME');
}
