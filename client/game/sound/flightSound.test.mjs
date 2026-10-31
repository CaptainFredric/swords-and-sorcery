import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightSound, flightRecipe, flightLoopSamples } from './FlightSound.mjs';

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
    }
  };
  return { engine, heard, active, audio: new FlightSound(engine) };
}

const machine = {
  id: 'flight-1',
  operatorId: 'pilot',
  mode: 'AIRBORNE',
  grounded: false,
  rotorHP: 100,
  rotorEnergy: 80,
  position: { x: 0, y: 5, z: 0 },
  velocity: { x: 0, y: 0, z: 0 }
};
const opt = { active: true, playerId: 'pilot', listener: { x: 0, y: 1, z: 0 }, yaw: 0, now: 1 };

test('repeater bolt release plays audible restrained mechanism', () => {
  const { audio, heard } = setup();
  audio.update(machine, opt);
  const event = { type: 'fightFlightBoltReleased', machineId: 'flight-1', at: 1, projectileId: 'p1' };
  audio.event(event, machine, 1);
  // Duplicate same-clock event ignored
  audio.event(event, machine, 1);
  assert.equal(heard.filter(x => x.recipe?.tag === 'boltRelease').length, 1);
});

test('distinct bolt impact outcomes trigger differentiated acoustic recipes', () => {
  const outcomes = [
    { hitKind: 'player', expectedTag: 'impactPlayer' },
    { hitKind: 'guard', expectedTag: 'impactGuard' },
    { hitKind: 'parry', expectedTag: 'impactParry' },
    { hitKind: 'wall', expectedTag: 'impactWall' },
    { hitKind: 'ground', expectedTag: 'impactGround' },
    { hitKind: 'ballista', expectedTag: 'impactSiege' },
    { hitKind: 'ram', expectedTag: 'impactSiege' },
  ];

  for (const { hitKind, expectedTag } of outcomes) {
    const { audio, heard } = setup();
    audio.update(machine, opt);
    audio.event({
      type: 'fightFlightBoltImpact',
      machineId: 'flight-1',
      projectileId: 'proj-' + hitKind,
      hitKind,
      point: { x: 0, y: 2, z: -5 },
      at: 1.5
    }, machine, 1.5);
    assert.equal(heard.filter(x => x.recipe?.tag === expectedTag).length, 1, `Failed for hitKind: ${hitKind}`);
  }
});

test('flight loops activate during airborne rotor operation and stop on pause or destruction', () => {
  const { audio, active } = setup();
  audio.update(machine, opt);
  assert.ok(audio.loops.has('rotor'), 'Airborne machine must have rotor sound loop active');

  // Pause / deactivate
  audio.update(machine, { ...opt, active: false });
  assert.equal(audio.loops.size, 0, 'Loops must stop when audio is inactive');

  // Destroyed machine
  audio.update({ ...machine, mode: 'DESTROYED', rotorHP: 0 }, opt);
  assert.equal(audio.loops.size, 0, 'Destroyed machine stops rotor loop');
});

test('terminal Valkyrie dive sequence produces prep, commit, and detonation sounds', () => {
  const { audio, heard } = setup();
  audio.update(machine, opt);

  audio.event({ type: 'fightFlightTerminalPrep', action: 'started', machineId: 'flight-1', at: 2 }, machine, 2);
  assert.equal(heard.filter(x => x.recipe?.tag === 'valkyriePrep').length, 1);

  audio.event({ type: 'fightFlightTerminalCommitted', machineId: 'flight-1', at: 3 }, machine, 3);
  assert.equal(heard.filter(x => x.recipe?.tag === 'valkyrieCommit').length, 1);

  audio.event({ type: 'fightFlightTerminalExplosion', machineId: 'flight-1', at: 4 }, machine, 4);
  assert.equal(heard.filter(x => x.recipe?.tag === 'valkyrieExplosion').length, 1);
});

test('all flight sound recipes and sample buffers produce valid finite waveforms', () => {
  const tags = [
    'boltRelease', 'impactPlayer', 'impactGuard', 'impactParry', 'impactBrace',
    'impactRotor', 'impactWall', 'impactGround', 'impactSiege', 'takeoff',
    'landingLight', 'landingHeavy', 'rotorCollision', 'rotorFailure',
    'braceDestroyed', 'offensiveRun', 'valkyriePrep', 'valkyrieCommit', 'valkyrieExplosion'
  ];

  for (const tag of tags) {
    const r = flightRecipe(tag, () => 0.5);
    assert.equal(r.tag, tag);
    assert.ok(r.layers.length > 0, `Recipe ${tag} must have layers`);
  }

  for (const loopKind of ['rotor', 'walk', 'offensive']) {
    const samples = flightLoopSamples(loopKind, 22050, 2, () => 0.5);
    assert.equal(samples.length, 44100);
    assert.ok(samples.every(Number.isFinite), `Loop ${loopKind} must be finite`);
    assert.ok(Math.max(...samples.map(Math.abs)) <= 1, `Loop ${loopKind} must not clip`);
  }
});
