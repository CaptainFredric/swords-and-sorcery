import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHost } from './LocalHost.mjs';
import { GameLink } from './GameLink.mjs';

function yard() {
  let wall = 100;
  const host = new LocalHost({ now: () => wall, every: () => 1, cancel: () => {}, later: fn => fn() });
  host.startInspectionPractice('Inspector', 'castleward');
  host.arenaReady(true);
  const advance = seconds => { wall += seconds; host.tick(); };
  advance(0.1);
  return { host, advance };
}

test('inspection freeze stops simulation, projectiles and cooldown time; resume excludes elapsed wall time', () => {
  const { host, advance } = yard();
  host.cast({ x: 0, y: 0, z: -1 });
  for (let i = 0; i < 11; i++) advance(1 / 30);
  assert.ok(host.latestSnapshot.projectiles.length);
  assert.equal(host.setInspectionFrozen(true), true);
  const before = structuredClone(host.latestSnapshot);
  const time = host.serverNow();
  advance(25);
  host.cast({ x: 1, y: 0, z: 0 });
  assert.equal(host.serverNow(), time);
  assert.deepEqual(host.latestSnapshot, before);
  host.setInspectionFrozen(false);
  assert.equal(host.serverNow(), time);
  advance(1 / 30);
  assert.ok(Math.abs(host.serverNow() - time - 1 / 30) < 1e-9);
  assert.equal(host.latestSnapshot.tick, before.tick + 1);
});

test('single step advances exactly one authoritative tick and stays frozen', () => {
  const { host, advance } = yard();
  host.setInspectionFrozen(true);
  const time = host.serverNow();
  const tick = host.latestSnapshot.tick;
  advance(10);
  assert.equal(host.stepInspection(), true);
  assert.equal(host.inspectionFrozen, true);
  assert.equal(host.latestSnapshot.tick, tick + 1);
  assert.ok(Math.abs(host.serverNow() - time - 1 / 30) < 1e-9);
  advance(5);
  assert.equal(host.latestSnapshot.tick, tick + 1);
  host.leaveRoom();
  assert.equal(host.inspectionFrozen, false);
  assert.equal(host.stepInspection(), false);
});

test('ordinary local Practice and Bot Duel cannot be frozen', () => {
  const { host } = yard();
  for (const mode of ['PRACTICE', 'BOT_DUEL']) {
    host.startSolo(mode, 'Ordinary');
    host.arenaReady(true);
    host.tick();
    assert.equal(host.setInspectionFrozen(true), false);
    assert.equal(host.stepInspection(), false);
  }
});

test('inspection is explicitly local even online and freeze never sends a remote command', () => {
  const remote = { on() {}, calls: [], startSolo(...args) { this.calls.push(args); } };
  const local = new LocalHost({ every: () => 1, cancel: () => {}, later: fn => fn() });
  const link = new GameLink({ remote, local });
  link.status = 'online';
  assert.equal(link.setInspectionFrozen(true), false);
  link.startInspectionPractice('Inspector', 'ruined-keep');
  link.arenaReady(true);
  local.tick();
  assert.equal(link.playingLocally, true);
  assert.equal(link.inspectionAvailable, true);
  assert.equal(link.setInspectionFrozen(true), true);
  assert.equal(remote.calls.length, 0);
  link.leaveRoom();
  assert.equal(link.inspectionAvailable, false);
  assert.equal(link.stepInspection(), false);
  link.startSolo('PRACTICE', 'Ordinary');
  assert.equal(remote.calls.length, 0, 'ordinary solo stays local after leaving Inspection');
  assert.equal(link.playingLocally, true);
  assert.equal(link.inspectionAvailable, false, 'ordinary Practice still cannot be frozen');
});


test('frozen input cannot change the pose, and resume clears held actions and movement', () => {
  const { host, advance } = yard();
  host.guard(true);
  host.input({ seq: 1, forward: 1, right: 0, jump: false, sprint: false, yaw: 0, pitch: 0 });
  advance(1 / 30);
  assert.equal(host.player.guarding, true);
  host.setInspectionFrozen(true);
  host.guard(false);
  host.input({ seq: 2, forward: -1, yaw: 2, pitch: 1 });
  assert.equal(host.player.guarding, true);
  assert.equal(host.player.yaw, 0);
  host.setInspectionFrozen(false);
  assert.equal(host.player.guarding, false);
  assert.equal(host.player.input.forward, 0);
  assert.equal(host.player.attackHeld, false);
});

test('successive freezes preserve phase and a newly cast spell starts on the resumed clock', () => {
  const { host, advance } = yard();
  const start = host.serverNow();
  host.setInspectionFrozen(true);
  advance(40);
  host.stepInspection();
  host.setInspectionFrozen(false);
  advance(1 / 30);
  host.setInspectionFrozen(true);
  advance(40);
  host.stepInspection();
  host.setInspectionFrozen(false);
  assert.ok(Math.abs(host.serverNow() - start - 0.1) < 1e-9);
  host.cast({ x: 0, y: 0, z: -1 });
  assert.ok(Math.abs(host.player.castEndsAt - host.serverNow() - 0.3) < 1e-9);
});

test('Play Frames advances one tick per inspection beat, stops immediately and preserves frozen time', () => {
  const { host, advance } = yard();
  assert.equal(typeof host.playInspectionFrames, 'function');
  assert.equal(host.playInspectionFrames(true), false, 'freeze first');
  host.setInspectionFrozen(true);
  const time = host.serverNow();
  const tick = host.latestSnapshot.tick;
  assert.equal(host.playInspectionFrames(true), true);
  advance(0.19);
  assert.equal(host.latestSnapshot.tick, tick);
  advance(0.04); // polling can arrive a little after the scheduled beat
  assert.equal(host.latestSnapshot.tick, tick + 1);
  advance(0.17); // preserve cadence instead of adding the polling delay each time
  assert.equal(host.latestSnapshot.tick, tick + 2);
  assert.equal(host.inspectionFrozen, true);
  host.playInspectionFrames(false);
  advance(10);
  assert.equal(host.latestSnapshot.tick, tick + 2);
  assert.ok(Math.abs(host.serverNow() - time - 2 / 30) < 1e-9);
});

test('continuous stepping never catches up a background stall and clears on resume or leave', () => {
  const { host, advance } = yard();
  host.setInspectionFrozen(true);
  host.playInspectionFrames(true);
  const tick = host.latestSnapshot.tick;
  advance(12);
  assert.equal(host.latestSnapshot.tick, tick + 1, 'one visible step, no backlog');
  host.setInspectionFrozen(false);
  assert.equal(host.inspectionFramesPlaying, false);
  host.setInspectionFrozen(true);
  host.playInspectionFrames(true);
  host.leaveRoom();
  assert.equal(host.inspectionFramesPlaying, false);
  assert.equal(host.playInspectionFrames(true), false);
});
