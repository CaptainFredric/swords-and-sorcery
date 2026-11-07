// Renown Trials: authoritative solo wave director. All numbers in TUNING are provisional
// playtest parameters, NOT creator-approved balance or permanent Renown economy rules.
// Never call the client to select or reroll the Rightful Renowner's judgment.
export const RENOWN_TRIAL_TUNING = Object.freeze({
  introSec: 1.5,
  interWaveSec: 2.5,
  maxWaves: 12, // provisional end point; later tuning may choose endless trials
  executionInitial: 0.08,
  executionScale: 0.82,
  executionTimeConstantSec: 30,
  nonfatalNoRewardShare: 0.70,
  ceremonySec: Object.freeze({
    timely: 3.2, none: 3.5, coin: 5.0,
    sword: 6.5, retaliation: 11.2,
  }),
});
export const RENOWN_TRIAL_PHASES = Object.freeze({
  PREPARING: 'PREPARING',
  WAVE_ACTIVE: 'WAVE_ACTIVE',
  WAVE_OVERTIME: 'WAVE_OVERTIME',
  WAVE_CLEARED: 'WAVE_CLEARED',
  AWARD_PENDING: 'AWARD_PENDING',
  JUDGMENT: 'JUDGMENT',
  TRANSITION: 'TRANSITION',
  COMPLETED: 'COMPLETED',
  TERMINATED: 'TERMINATED',
});
export const RENOWNER_VERDICTS = Object.freeze({
  AWARD: 'AWARD',
  NONE: 'NONE',
  COIN: 'COIN',
  EXECUTION: 'EXECUTION',
});
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function trialWavePlan(index) {
  if (!Number.isInteger(index) || index < 1) throw new RangeError('Wave index must be positive');
  const count = Math.min(4, 1 + Math.floor((index - 1) / 2));
  const skills = index <= 1 ? 'squire' : index <= 3 ? 'knight' : index <= 6 ? 'champion' : 'spellblade';
  const roleOrder = ['rival', 'melee', 'caster', 'rival'];
  const rivals = Array.from({ length: count }, (_, i) => ({
    role: roleOrder[(i + Math.floor((index - 1) / 3)) % roleOrder.length],
    skill: i === count - 1 && index >= 3 ? skills : index >= 5 ? 'champion' : skills,
    spell: i % 3 === 1 ? 'steel' : i % 3 === 2 ? 'frostfire' : 'fireball',
  }));
  // The deadline is a provisional pacing target, to be calibrated from observed
  // skilled clear times and real navigation; never a health/damage multiplier.
  const deadlineSec = 24 + (count * 20) + Math.min(12, (index - 1) * 2);
  const baseRenown = 6 + index * 4;
  return { index, difficulty: index, rivals, count, deadlineSec, baseRenown };
}

/** No RNG before the wave has actually been cleared. Probability rises smoothly
 * and strictly with elapsed overtime without clamping to certainty. */
export function overtimeVerdictWeights(seconds, tuning = RENOWN_TRIAL_TUNING) {
  const overtime = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const execution = tuning.executionInitial
    + tuning.executionScale * (1 - Math.exp(-overtime / tuning.executionTimeConstantSec));
  const nonfatal = 1 - execution;
  return {
    execution,
    none: nonfatal * tuning.nonfatalNoRewardShare,
    coin: nonfatal * (1 - tuning.nonfatalNoRewardShare),
  };
}

/** Exactly one uniform draw chooses among the 3 mutually exclusive outcomes.
 * Execution variant is also chosen by the location of that SAME draw. */
export function drawRenownerVerdict(seconds, random = Math.random, tuning = RENOWN_TRIAL_TUNING) {
  const weights = overtimeVerdictWeights(seconds, tuning);
  const roll = clamp(Number(random()), 0, 1 - Number.EPSILON);
  if (roll < weights.execution) return {
    verdict: RENOWNER_VERDICTS.EXECUTION,
    variant: roll < weights.execution / 2 ? 'sword' : 'retaliation',
  };
  if (roll < weights.execution + weights.none) return { verdict: RENOWNER_VERDICTS.NONE, variant: null };
  return { verdict: RENOWNER_VERDICTS.COIN, variant: null };
}

export function timelyWaveReward(plan, completedSec) {
  const elapsed = clamp(completedSec, 0, plan.deadlineSec);
  const speedRatio = (plan.deadlineSec - elapsed) / plan.deadlineSec;
  return plan.baseRenown + Math.floor(plan.baseRenown * speedRatio * 0.75);
}

function trialEnemies(room, state) {
  return [...room.players.values()].filter((p) => p.actorKind === 'bot'
    && p.trialRunId === state.runId && p.trialWave === state.waveIndex);
}
function trialPlayer(room, state) { return room.players.get(state.playerId); }
function stopRun(room, state, nowSec, reason) {
  if (state.phase === RENOWN_TRIAL_PHASES.TERMINATED || state.phase === RENOWN_TRIAL_PHASES.COMPLETED) return;
  state.phase = reason === 'completed' ? RENOWN_TRIAL_PHASES.COMPLETED : RENOWN_TRIAL_PHASES.TERMINATED;
  state.endedAt = nowSec;
  state.termination = reason;
  if (reason === 'executed') {
    const player = trialPlayer(room, state);
    if (player) {
      player.health = 0; player.alive = false; player.respawnAt = Infinity;
      player.attackHeld = false; player.guarding = false;
    }
  }
  room.events.push({ type: 'renownTrialEnded', runId: state.runId, waveIndex: state.waveIndex, reason, at: nowSec });
  room.finish(reason === 'completed' ? state.playerId : null, nowSec, 'renown-trial-' + reason);
}
function beginWave(room, state, nowSec) {
  const player = trialPlayer(room, state);
  if (!player?.alive) { stopRun(room, state, nowSec, 'defeated'); return; }
  for (const [id, p] of room.players) {
    if (p.actorKind === 'bot' && p.trialRunId) room.players.delete(id);
  }
  // Remove leftover attacks so an earlier wave cannot strike a newly spawned opponent.
  room.projectiles.clear();
  room.ruptures = [];
  const index = state.waveIndex + 1;
  const plan = trialWavePlan(index);
  state.waveIndex = index;
  state.wave = {
    ...plan, startedAt: nowSec, deadlineAt: nowSec + plan.deadlineSec,
    endedAt: null, elapsedSec: null, overtimeSec: 0, reward: 0,
    verdict: null, variant: null, remaining: plan.count, defeated: 0,
    enemyIds: [],
  };
  for (let i = 0; i < plan.count; i += 1) {
    const spec = plan.rivals[i];
    const id = `trial-${state.runId}-w${index}-${i}`;
    const bot = room.addServerActor({
      id, name: `Trial Rival ${i + 1}`, actorKind: 'bot',
      spell: spec.spell,
    }, nowSec);
    bot.trialRunId = state.runId;
    bot.trialWave = index;
    bot.botSkill = spec.skill;
    bot.botProfile = spec.role;
    bot.rivalIndex = i;
    state.wave.enemyIds.push(id);
  }
  state.phase = RENOWN_TRIAL_PHASES.WAVE_ACTIVE;
  state.ceremony = null;
  state.transitionAt = null;
  room.events.push({ type: 'renownTrialWaveStarted', runId: state.runId,
    waveIndex: index, deadlineAt: state.wave.deadlineAt, rivals: plan.count, at: nowSec });
}
function ceremonyCue(state, nowSec) {
  if (!state.ceremony) return null;
  const t = Math.max(0, nowSec - state.ceremony.startedAt);
  const kind = state.ceremony.kind;
  if (kind === 'retaliation') {
    if (t < 1.8) return 'SWORD_RAISE';
    if (t < 3.0) return 'SWORD_EVADED';
    if (t < 5.2) return 'I_HAVE_SURPASSED_JUDGEMENT';
    if (t < 7.0) return 'SWORD_RESET';
    if (t < 9.3) return 'RECEIVE_COMPENSATION';
    return 'COIN_RETALIATION';
  }
  if (kind === 'sword') return t < 1.7 ? 'SWORD_RAISE' : t < 3.0 ? 'SWORD_EXECUTION'
    : t < 4.8 ? 'SWORD_RESET' : 'LATE_COIN';
  if (kind === 'timely') return t < 1.1 ? 'SWORD_RAISE' : t < 2.3 ? 'KNIGHTING' : 'REWARD_COIN';
  if (kind === 'coin') return t < 2.1 ? 'SOLEMN_JUDGMENT' : t < 3.1 ? 'CONSOLATION_COIN' : 'CONSOLATION_REACTION';
  return 'NO_REWARD';
}
function beginJudgment(room, state, nowSec) {
  const wave = state.wave;
  let kind = 'timely';
  if (wave.verdict === RENOWNER_VERDICTS.NONE) kind = 'none';
  else if (wave.verdict === RENOWNER_VERDICTS.COIN) kind = 'coin';
  else if (wave.verdict === RENOWNER_VERDICTS.EXECUTION) kind = wave.variant;
  const ceremonyId = `${state.runId}:w${state.waveIndex}`;
  state.ceremony = {
    id: ceremonyId, kind, startedAt: nowSec,
    endsAt: nowSec + RENOWN_TRIAL_TUNING.ceremonySec[kind],
  };
  state.phase = RENOWN_TRIAL_PHASES.JUDGMENT;
  room.events.push({ type: 'renownTrialCeremonyStarted',
    runId: state.runId, waveIndex: state.waveIndex, ceremonyId,
    verdict: wave.verdict, variant: wave.variant, at: nowSec });
}
function finishWave(room, state, nowSec, random) {
  const wave = state.wave;
  if (wave.endedAt !== null) return; // exactly-once settlement and verdict
  wave.endedAt = nowSec;
  wave.elapsedSec = Math.max(0, nowSec - wave.startedAt);
  wave.overtimeSec = Math.max(0, wave.elapsedSec - wave.deadlineSec);
  state.phase = RENOWN_TRIAL_PHASES.WAVE_CLEARED;
  if (wave.overtimeSec > 0) {
    const judgment = drawRenownerVerdict(wave.overtimeSec, random);
    wave.verdict = judgment.verdict;
    wave.variant = judgment.variant;
  } else {
    wave.verdict = RENOWNER_VERDICTS.AWARD;
    wave.reward = timelyWaveReward(wave, wave.elapsedSec);
  }
  const ledgerId = `${state.runId}:w${state.waveIndex}`;
  if (!state.ledger.some((r) => r.id === ledgerId)) {
    state.ledger.push({
      id: ledgerId, wave: state.waveIndex, reward: wave.reward,
      verdict: wave.verdict, elapsedSec: wave.elapsedSec,
      // Until a separate transactionally idempotent profile settlement exists,
      // run-local prestige is NOT an account balance and must be labeled as such.
      status: 'UNSETTLED',
    });
  }
  state.phase = RENOWN_TRIAL_PHASES.AWARD_PENDING;
  room.events.push({ type: 'renownTrialWaveCleared', runId: state.runId,
    waveIndex: state.waveIndex, elapsedSec: wave.elapsedSec,
    overtimeSec: wave.overtimeSec, award: wave.reward, at: nowSec });
  beginJudgment(room, state, nowSec);
}

export function beginRenownTrial(room, nowSec) {
  const player = [...room.players.values()].find((p) => p.actorKind === 'human');
  if (!player) throw new Error('A Renown Trial needs one Spellblade');
  room.renownTrial = {
    runId: `${room.code}:${room.tickNumber}:${Math.floor(nowSec * 1000)}`,
    playerId: player.id,
    phase: RENOWN_TRIAL_PHASES.PREPARING,
    waveIndex: 0, wave: null, ledger: [], ceremony: null,
    transitionAt: nowSec + RENOWN_TRIAL_TUNING.introSec,
    endedAt: null, termination: null,
  };
  room.events.push({ type: 'renownTrialPreparing', runId: room.renownTrial.runId, at: nowSec });
  return room.renownTrial;
}

export function renownTrialCombatOpen(room) {
  return room.renownTrial
    && (room.renownTrial.phase === RENOWN_TRIAL_PHASES.WAVE_ACTIVE
      || room.renownTrial.phase === RENOWN_TRIAL_PHASES.WAVE_OVERTIME);
}

export function stepRenownTrial(room, nowSec, random = Math.random) {
  const state = room.renownTrial;
  if (!state || room.state !== 'PLAYING') return;
  const player = trialPlayer(room, state);
  if (!player || !player.alive) { stopRun(room, state, nowSec, 'defeated'); return; }
  if (state.phase === RENOWN_TRIAL_PHASES.PREPARING || state.phase === RENOWN_TRIAL_PHASES.TRANSITION) {
    if (nowSec >= state.transitionAt) beginWave(room, state, nowSec);
    return;
  }
  if (state.phase === RENOWN_TRIAL_PHASES.WAVE_ACTIVE || state.phase === RENOWN_TRIAL_PHASES.WAVE_OVERTIME) {
    const enemies = trialEnemies(room, state);
    state.wave.remaining = enemies.filter((p) => p.alive).length;
    state.wave.defeated = state.wave.count - state.wave.remaining;
    if (state.wave.remaining === 0) { finishWave(room, state, nowSec, random); return; }
    if (nowSec > state.wave.deadlineAt) {
      state.wave.overtimeSec = nowSec - state.wave.deadlineAt;
      if (state.phase !== RENOWN_TRIAL_PHASES.WAVE_OVERTIME) {
        state.phase = RENOWN_TRIAL_PHASES.WAVE_OVERTIME;
        room.events.push({ type: 'renownTrialOvertimeStarted', waveIndex: state.waveIndex, at: nowSec });
      }
    }
    return;
  }
  if (state.phase === RENOWN_TRIAL_PHASES.JUDGMENT && nowSec >= state.ceremony.endsAt) {
    if (state.wave.verdict === RENOWNER_VERDICTS.EXECUTION) {
      stopRun(room, state, nowSec, 'executed');
    } else if (state.waveIndex >= RENOWN_TRIAL_TUNING.maxWaves) {
      stopRun(room, state, nowSec, 'completed');
    } else {
      state.phase = RENOWN_TRIAL_PHASES.TRANSITION;
      state.transitionAt = nowSec + RENOWN_TRIAL_TUNING.interWaveSec;
      room.events.push({ type: 'renownTrialTransition', nextWave: state.waveIndex + 1, at: nowSec });
    }
  }
}

/** Only expose the single stored verdict, never a speculative execution result.
 * The provisional ledger is intentionally kept separate from persistent Renown. */
export function serializeRenownTrial(room, nowSec) {
  const state = room.renownTrial;
  if (!state) return null;
  const wave = state.wave;
  const overtimeSec = wave ? Math.max(0, (wave.endedAt ?? nowSec) - wave.deadlineAt) : 0;
  const active = state.phase === RENOWN_TRIAL_PHASES.WAVE_ACTIVE || state.phase === RENOWN_TRIAL_PHASES.WAVE_OVERTIME;
  return {
    runId: state.runId, phase: state.phase, waveIndex: state.waveIndex,
    maxWaves: RENOWN_TRIAL_TUNING.maxWaves,
    remaining: wave?.remaining ?? 0, totalEnemies: wave?.count ?? 0,
    difficulty: wave?.difficulty ?? 0, startedAt: wave?.startedAt ?? null,
    deadlineAt: wave?.deadlineAt ?? null, deadlineSec: wave?.deadlineSec ?? null,
    timeLeftSec: active ? Math.max(0, wave.deadlineAt - nowSec) : 0,
    overtimeSec, executionChance: active && overtimeSec > 0 ? overtimeVerdictWeights(overtimeSec).execution : null,
    potentialReward: wave?.baseRenown ?? 0,
    waveReward: wave?.reward ?? 0,
    verdict: active ? null : wave?.verdict ?? null,
    variant: active ? null : wave?.variant ?? null,
    ceremony: state.ceremony ? {
      id: state.ceremony.id, kind: state.ceremony.kind,
      startedAt: state.ceremony.startedAt, endsAt: state.ceremony.endsAt,
      cue: ceremonyCue(state, nowSec),
    } : null,
    transitionAt: state.transitionAt, endedAt: state.endedAt,
    termination: state.termination,
    // One entry per completed wave; values are explicitly provisional and UNSETTLED.
    ledger: state.ledger.map((r) => ({ ...r })),
  };
}
