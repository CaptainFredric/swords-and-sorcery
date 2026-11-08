import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';
import { GAME_MODES } from '../../shared/src/modes.mjs';
import { serializeSnapshot } from '../../shared/sim/wire.mjs';
import { RENOWN_TRIAL_PHASES, RENOWNER_VERDICTS } from '../../shared/sim/renownTrials.mjs';
import { ProfileStore } from '../src/ProfileStore.mjs';
import { pendingTrialAward, commitTrialAward } from '../src/renownTrialSettlement.mjs';

function createCourtTrial(randomFn = () => 0.5) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'court-ceremony-'));
  const profileStore = new ProfileStore(dir);
  const { token } = profileStore.open();

  const manager = new RoomManager({ random: randomFn });
  const room = manager.createSoloRoom(GAME_MODES.RENOWN_TRIALS, 0, 'court-of-merit');
  room.rewardMatchId = crypto.randomUUID();
  const player = room.addPlayer({ id: 'player1', token, name: 'Court Knight', profileToken: token }, 0);
  player.profileToken = token;
  room.armAutoStart(0);
  room.tick(3.1);
  assert.equal(room.state, 'PLAYING');
  assert.equal(room.worldId, 'court-of-merit');
  room.tick(4.7);
  assert.equal(room.renownTrial.waveIndex, 1);

  const processEvents = () => {
    for (const event of room.events) {
      if (event.type === 'renownTrialWaveCleared') {
        const pending = pendingTrialAward(room, event);
        if (pending) {
          commitTrialAward(profileStore, pending);
        }
      }
    }
  };

  return { room, player, profileStore, processEvents, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('Authoritative ceremony: Timely ordinary coin payout', () => {
  const { room, player, profileStore, processEvents, cleanup } = createCourtTrial();
  try {
    assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.WAVE_ACTIVE);

    // Defeat wave 1 within deadline
    const enemyId = room.renownTrial.wave.enemyIds[0];
    const enemy = room.players.get(enemyId);
    enemy.alive = false;
    enemy.health = 0;
    enemy.respawnAt = Infinity;

    // Step into judgment
    room.tick(7.0);
    processEvents();
    assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.JUDGMENT);
    assert.equal(room.renownTrial.ceremony.kind, 'timely');
    assert.equal(room.renownTrial.wave.verdict, RENOWNER_VERDICTS.AWARD);
    assert.ok(room.renownTrial.wave.reward > 0);

    // Cue progression: SWORD_RAISE -> KNIGHTING -> REWARD_COIN
    const t0 = room.renownTrial.ceremony.startedAt;
    room.tick(t0 + 0.5);
    let snap = serializeSnapshot(room, t0 + 0.5, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'SWORD_RAISE');

    room.tick(t0 + 1.5);
    snap = serializeSnapshot(room, t0 + 1.5, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'KNIGHTING');

    room.tick(t0 + 2.5);
    snap = serializeSnapshot(room, t0 + 2.5, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'REWARD_COIN');

    // Verify wallet award settled
    room.tick(room.renownTrial.ceremony.endsAt + 0.5);
    assert.equal(room.renownTrial.ledger[0].status, 'SETTLED');
    assert.ok(profileStore.open(player.profileToken).profile.balance > 0, 'Durable wallet balance increased');
    assert.ok(player.alive, 'Player survives timely knighting and coin payout');
  } finally {
    cleanup();
  }
});

test('Authoritative ceremony: Fatal sword execution in overtime', () => {
  const { room, player, cleanup } = createCourtTrial();
  try {
    // Force overtime deadline
    room.renownTrial.wave.deadlineSec = 5.0;
    room.renownTrial.wave.deadlineAt = room.renownTrial.wave.startedAt + 5.0;

    const enemyId = room.renownTrial.wave.enemyIds[0];
    const enemy = room.players.get(enemyId);
    enemy.alive = false;
    enemy.health = 0;
    enemy.respawnAt = Infinity;

    // Step well past deadline into overtime judgment
    room.tick(35.0);
    assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.JUDGMENT);
    room.renownTrial.wave.verdict = RENOWNER_VERDICTS.EXECUTION;
    room.renownTrial.wave.variant = 'sword';
    room.renownTrial.ceremony.kind = 'sword';

    const t0 = room.renownTrial.ceremony.startedAt;
    room.tick(t0 + 0.8);
    let snap = serializeSnapshot(room, t0 + 0.8, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'SWORD_RAISE');

    room.tick(t0 + 2.0);
    snap = serializeSnapshot(room, t0 + 2.0, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'SWORD_EXECUTION');
    assert.ok(room.events.some(e => e.type === 'renownTrialExecutionImpact'), 'Execution impact event recorded');

    // Step ceremony to completion: player is eliminated
    room.tick(room.renownTrial.ceremony.endsAt + 0.5);
    assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.TERMINATED);
    assert.equal(room.renownTrial.termination, 'executed');
    assert.equal(player.alive, false, 'Player is eliminated by authoritative sword execution');
  } finally {
    cleanup();
  }
});

test('Authoritative ceremony: Fatal coin retaliation in overtime', () => {
  const { room, player, cleanup } = createCourtTrial();
  try {
    // Force overtime deadline
    room.renownTrial.wave.deadlineSec = 5.0;
    room.renownTrial.wave.deadlineAt = room.renownTrial.wave.startedAt + 5.0;

    const enemyId = room.renownTrial.wave.enemyIds[0];
    const enemy = room.players.get(enemyId);
    enemy.alive = false;
    enemy.health = 0;
    enemy.respawnAt = Infinity;

    room.tick(35.0);
    assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.JUDGMENT);
    room.renownTrial.wave.verdict = RENOWNER_VERDICTS.EXECUTION;
    room.renownTrial.wave.variant = 'retaliation';
    room.renownTrial.ceremony.kind = 'retaliation';

    const t0 = room.renownTrial.ceremony.startedAt;
    room.tick(t0 + 1.0);
    let snap = serializeSnapshot(room, t0 + 1.0, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'SWORD_RAISE');

    room.tick(t0 + 2.2);
    snap = serializeSnapshot(room, t0 + 2.2, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'SWORD_EVADED');

    room.tick(t0 + 4.0);
    snap = serializeSnapshot(room, t0 + 4.0, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'I_HAVE_SURPASSED_JUDGEMENT');

    room.tick(t0 + 6.0);
    snap = serializeSnapshot(room, t0 + 6.0, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'SWORD_RESET');

    room.tick(t0 + 8.0);
    snap = serializeSnapshot(room, t0 + 8.0, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'RECEIVE_COMPENSATION');

    room.tick(t0 + 9.5);
    snap = serializeSnapshot(room, t0 + 9.5, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'COIN_RETALIATION');

    // Step ceremony to completion: player is eliminated by lethal coin burst
    room.tick(room.renownTrial.ceremony.endsAt + 0.5);
    assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.TERMINATED);
    assert.equal(room.renownTrial.termination, 'executed');
    assert.equal(player.alive, false, 'Player is eliminated by lethal coin retaliation');
  } finally {
    cleanup();
  }
});

test('Authoritative ceremony: Solemn dismissal with no reward', () => {
  const { room, player, processEvents, cleanup } = createCourtTrial();
  try {
    // Force overtime deadline
    room.renownTrial.wave.deadlineSec = 5.0;
    room.renownTrial.wave.deadlineAt = room.renownTrial.wave.startedAt + 5.0;

    const enemyId = room.renownTrial.wave.enemyIds[0];
    const enemy = room.players.get(enemyId);
    enemy.alive = false;
    enemy.health = 0;
    enemy.respawnAt = Infinity;

    room.tick(35.0);
    processEvents();
    assert.equal(room.renownTrial.phase, RENOWN_TRIAL_PHASES.JUDGMENT);
    room.renownTrial.wave.verdict = RENOWNER_VERDICTS.NONE;
    room.renownTrial.ceremony.kind = 'none';

    const t0 = room.renownTrial.ceremony.startedAt;
    room.tick(t0 + 1.0);
    const snap = serializeSnapshot(room, t0 + 1.0, player.id);
    assert.equal(snap.renownTrial.ceremony.cue, 'NO_REWARD');
    assert.equal(room.renownTrial.wave.reward, 0);

    room.tick(room.renownTrial.ceremony.endsAt + 0.5);
    assert.equal(room.renownTrial.ledger[0].status, 'NOT_AWARDED');
    assert.ok(player.alive, 'Player remains alive after no-reward dismissal');
  } finally {
    cleanup();
  }
});
