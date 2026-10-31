import test from 'node:test';
import assert from 'node:assert/strict';
import { SoFistSound } from './SoFistSound.mjs';

function setup() {
  const heard = [], active = new Set();
  const engine = {
    running: true,
    muted: false,
    ctx: { sampleRate: 22050 },
    buffer: channels => ({ channels }),
    play(recipe, opts) {
      const h = { stop() { active.delete(h); }, place() {} };
      active.add(h);
      heard.push({ recipe, opts, h });
      return h;
    },
    playBuffer(buffer, opts) {
      const h = { stop() { active.delete(h); }, place() {} };
      active.add(h);
      heard.push({ buffer, opts, h });
      return h;
    },
  };
  return { engine, heard, active, audio: new SoFistSound(engine) };
}

const ram = {
  id: 'ram-1',
  operatorId: 'player-1',
  mode: 'MOBILE',
  state: 'LOADED',
  position: { x: 0, y: 0, z: 0 },
  heading: 0,
  speed: 0,
  strikeAt: null,
};
const opt = { active: true, playerId: 'player-1', listener: { x: 0, y: 1, z: 3 }, yaw: 0, now: 10 };

test('SoFistSound activates primed pressure jitter loop when skill is primed', () => {
  const { audio } = setup();
  audio.update({ ...ram, skill: { phase: 'primed', debt: 1 } }, opt);
  assert.ok(audio.sound.loops.has('pressure'), 'Pressure loop should be active when primed');

  // When unprimed
  audio.update({ ...ram, skill: { phase: 'idle' } }, opt);
  assert.ok(!audio.sound.loops.has('pressure'), 'Pressure loop should stop when idle');
});

test('SoFistSound plays steam release on piston strike release', () => {
  const { audio, heard } = setup();
  // Piston strike starts at now = 10, release is at age >= 0.68 (timing.release)
  audio.update({ ...ram, strikeAt: 10 }, { ...opt, now: 10.05 });
  // Strike reaches release phase (age = 0.75s)
  audio.update({ ...ram, strikeAt: 10 }, { ...opt, now: 10.75 });
  const steam = heard.find(h => h.recipe?.tag === 'steamRelease');
  assert.ok(steam, 'Piston release should emit steamRelease recipe');
});
