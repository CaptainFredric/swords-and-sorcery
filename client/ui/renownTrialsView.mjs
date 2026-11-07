// Pure UI projection of the server-owned Renown Trial. A recorded verdict is
// presented only as the ceremony unfolds, never previewed during active combat.
const ACTIVE = new Set(['WAVE_ACTIVE', 'WAVE_OVERTIME']);
const fixedClock = (seconds) => {
  const value = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
};
const cueCopy = Object.freeze({
  SWORD_RAISE: { label: 'THE SWORD RISES', note: 'The solemn ritual begins.' },
  KNIGHTING: { label: 'HONOR ACKNOWLEDGED', note: 'The greatsword dips to confer Renown.' },
  REWARD_COIN: { label: 'RENOWN CONFERRED', note: 'The tiny tray dispenses its reward.' },
  SOLEMN_JUDGMENT: { label: 'THE RIGHTFUL RENOWNER CONSIDERS', note: 'The mechanism considers your lateness.' },
  NO_REWARD: { label: 'NO REWARD', note: 'You are permitted to continue.' },
  CONSOLATION_COIN: { label: 'ONE COIN', note: 'An ordinary harmless consolation coin slides from the dispenser.' },
  CONSOLATION_REACTION: { label: 'PRIZE OF DISTINCTION', note: 'One coin. No additional Renown.' },
  SWORD_EXECUTION: { label: 'JUDGMENT DESCENDS', note: 'The greatsword falls. The Spellblade does not rise.' },
  SWORD_RESET: { label: 'THE SWORD RETURNS', note: 'The monument calmly resumes its ceremonial position.' },
  LATE_COIN: { label: 'A COIN, TOO LATE', note: 'Clink.' },
  SWORD_EVADED: { label: 'THE SWORD MISSES', note: 'The knight steps beyond its reach.' },
  I_HAVE_SURPASSED_JUDGEMENT: {
    label: 'A MOMENT OF TRIUMPH',
    note: 'The statue remains utterly impassive.',
    line: 'AHAHAHA! I have surpassed judgement',
  },
  RECEIVE_COMPENSATION: {
    label: 'FORMAL COMPENSATION',
    note: 'The victorious knight returns and bows.',
    line: 'I shall receive your compensation',
  },
  COIN_RETALIATION: {
    label: 'COMPENSATION DELIVERED',
    note: 'A very ordinary-looking coin strikes with extraordinary force. The knight collapses.',
  },
});
export function renownTrialsView(snapshot, serverNow) {
  const trial = snapshot?.mode === 'RENOWN_TRIALS' ? snapshot.renownTrial : null;
  if (!trial) return { visible: false };
  const ledgerTotal = (trial.ledger ?? []).reduce((sum, row) => sum + (row.reward ?? 0), 0);
  if (ACTIVE.has(trial.phase)) {
    const overtime = trial.phase === 'WAVE_OVERTIME';
    const elapsed = trial.startedAt === null ? 0 : Math.max(0, serverNow - trial.startedAt);
    return {
      visible: true, ceremony: false, overtime,
      header: `RENOWN TRIALS · WAVE ${trial.waveIndex}/${trial.maxWaves}`,
      title: `${trial.remaining} / ${trial.totalEnemies} RIVALS REMAIN`,
      clock: overtime ? `OVERTIME +${fixedClock(trial.overtimeSec)}` : fixedClock(trial.timeLeftSec),
      details: overtime
        ? `JUDGMENT RISK: ${Math.round((trial.executionChance ?? 0) * 100)}% · FIGHT ON`
        : `TARGET ${fixedClock(trial.deadlineSec)} · BASE REWARD ${trial.potentialReward}`,
      footer: `RUN LEDGER ${ledgerTotal} · UNSETTLED`,
      stage: 'COMBAT', line: '',
    };
  }
  if (trial.phase === 'JUDGMENT' && trial.ceremony) {
    const { cue, kind } = trial.ceremony;
    const content = cueCopy[cue] ?? { label: 'THE JUDGMENT', note: 'A solemn determination is in progress.' };
    const resolved = ['REWARD_COIN', 'NO_REWARD', 'CONSOLATION_COIN',
      'CONSOLATION_REACTION', 'SWORD_EXECUTION', 'LATE_COIN', 'COIN_RETALIATION'].includes(cue);
    const accounting = trial.verdict === 'AWARD'
      ? `WAVE AWARD ${trial.waveReward} · UNSETTLED`
      : 'NO WAVE RENOWN AWARDED';
    const cleared = Number.isFinite(trial.clearTimeSec)
      ? ` · CLEARED IN ${fixedClock(trial.clearTimeSec)} / ${fixedClock(trial.deadlineSec)}` : '';
    const footer = resolved ? accounting + cleared : 'THE VERDICT IS BEING DELIVERED';
    const spokenLine = cue === 'CONSOLATION_REACTION'
      ? (trial.waveIndex % 2 === 0 ? 'Priceless. I would never purchase this.' : "It's worth more in spirit.")
      : content.line ?? '';
    return {
      visible: true, ceremony: true, overtime: false,
      header: `THE RIGHTFUL RENOWNER · WAVE ${trial.waveIndex}`,
      title: content.label, details: content.note,
      clock: '', footer, stage: cue ?? 'SOLEMN_JUDGMENT',
      line: spokenLine,
      // The real authored GLB and clips have not been verified. Treat this as
      // a temporary ceremonial representation, not an animation implementation.
      placeholder: true, kind,
    };
  }
  if (trial.phase === 'PREPARING' || trial.phase === 'TRANSITION') {
    return {
      visible: true, ceremony: false, overtime: false,
      header: 'RENOWN TRIALS',
      title: trial.phase === 'PREPARING' ? 'PREPARE TO PROVE YOUR WORTH' : `WAVE ${trial.waveIndex} CLEARED`,
      details: trial.phase === 'PREPARING'
        ? 'The trial begins shortly.' : `Next wave: ${trial.waveIndex + 1}`,
      clock: '', footer: `RUN LEDGER ${ledgerTotal} · UNSETTLED`,
      stage: 'TRANSITION', line: '',
    };
  }
  return {
    visible: true, ceremony: false, overtime: false,
    header: 'RENOWN TRIALS', title: trial.termination === 'completed' ? 'TRIAL COMPLETED' : 'THE RUN HAS ENDED',
    clock: '', details: `Last wave: ${trial.waveIndex}`,
    footer: `RUN LEDGER ${ledgerTotal} · NOT SETTLED TO PROFILE`,
    stage: 'DONE', line: '',
  };
}
