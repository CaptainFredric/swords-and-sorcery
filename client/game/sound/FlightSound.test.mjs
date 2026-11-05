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
    'targetPreview', 'targetLock', 'boltRelease', 'impactPlayer', 'impactGuard', 'impactParry', 'impactBrace',
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

const dashMachine = () => ({
  id: 'flight-sound-1', operatorId: 'pilot', mode: 'AIRBORNE', grounded: false, rotorHP: 80, rotorEnergy: 85, offensiveRun: true,
  velocity: { x: 12, y: 0, z: -2 }, position: { x: 0, y: 3, z: 0 }, lastShotAt: -Infinity
});

test('flight Dash has sharp wind onset, lower follow-through and light release, with no vocal sample', () => {
  const onset = flightRecipe('offensiveRun', () => 0.5), release = flightRecipe('offensiveRelease', () => 0.5);
  assert.ok(onset.layers.length >= 3);
  assert.ok(onset.layers.some(l => l.type === 'noise' && l.filter === 'highpass' && l.freq > 1000));
  assert.ok(onset.layers.some(l => l.type === 'noise' && l.decay > 0.4));
  assert.ok(release.layers.some(l => l.type === 'noise' && l.filter === 'highpass'));
  assert.ok([...onset.layers, ...release.layers].every(l => ['tone', 'noise'].includes(l.type)));
  const samples = flightLoopSamples('offensive', 1000, 0.4, () => 0.63);
  assert.equal(samples.length, 400);
  assert.ok(samples.some(v => Math.abs(v) > 0.01));
  assert.ok(samples.every(Number.isFinite));
});

test('confirmed offensive run onset and end play just once each per server event', () => {
  const played = [];
  const engine = {
    running: true, muted: false,
    buffer: samples => ({ samples }),
    playBuffer: () => ({ place() {}, stop() {} }),
    play: (recipe, options) => { played.push({ tag: recipe.tag, options }); return { stop() {} }; },
  };
  const sound = new FlightSound(engine), m = dashMachine();
  sound.update(m, { active: true, listener: m.position, yaw: 0, now: 2 });
  const start = { type: 'fightFlightOffensiveRun', machineId: m.id, operatorId: 'pilot', at: 2, action: 'started' };
  const end = { ...start, at: 2.5, action: 'ended' };
  sound.event(start, m, 2.02); sound.event(start, m, 2.02);
  sound.event(end, m, 2.5); sound.event(end, m, 2.5);
  assert.deepEqual(played.map(p => p.tag), ['offensiveRun', 'offensiveRelease']);
  assert.ok(played.every(p => p.options.gain > 0));
  sound.dispose();
});

test('wrong machine and stale server events never play stray wind sound', () => {
  const played = [];
  const engine = { running: true, muted: false, buffer: () => ({}), playBuffer: () => ({ place() {}, stop() {} }),
    play: (recipe) => { played.push(recipe.tag); return { stop() {} }; } };
  const sound = new FlightSound(engine), m = dashMachine(); m.offensiveRun = false;
  sound.update(m, { active: true, listener: m.position, yaw: 0, now: 10 });
  sound.event({ type: 'fightFlightOffensiveRun', machineId: 'foreign', at: 10, action: 'started' }, m, 10);
  sound.event({ type: 'fightFlightOffensiveRun', machineId: m.id, at: 8, action: 'started' }, m, 10);
  assert.deepEqual(played, []);
  sound.dispose();
});

test('actual Dash key release gets a single whoosh tail even without an ended server event', () => {
  const played = [];
  const engine = { running: true, muted: false, buffer: () => ({}),
    playBuffer: () => ({ place() {}, stop() {} }),
    play: recipe => { played.push(recipe.tag); return { stop() {} }; } };
  const sound = new FlightSound(engine), m = dashMachine();
  sound.update(m, { active: true, listener: m.position, yaw: 0, now: 1 });
  sound.update({ ...m, offensiveRun: false }, { active: true, listener: m.position, yaw: 0, now: 1.35 });
  sound.update({ ...m, offensiveRun: false }, { active: true, listener: m.position, yaw: 0, now: 1.4 });
  sound.event({ type: 'fightFlightOffensiveRun', machineId: m.id, action: 'ended', at: 1.35 }, m, 1.44);
  assert.deepEqual(played, ['offensiveRun', 'offensiveRelease'], 'no double whoosh from late network events');
  sound.dispose();
});

test('Dash sound sequence: onset whoosh, sustained light propeller flutter with ducked rotor, and smooth release fade', () => {
  const played = [];
  const stopped = [];
  const placed = [];
  const engine = {
    running: true, muted: false,
    buffer: (samples) => ({ samples }),
    playBuffer: (buf, opts) => {
      const h = {
        stop: (fade) => stopped.push({ loop: opts, fade }),
        place: (p) => placed.push(p),
      };
      return h;
    },
    play: (recipe, opts) => {
      played.push({ tag: recipe.tag, opts });
      return { stop() {} };
    },
  };
  const sound = new FlightSound(engine);
  const m = dashMachine();
  m.offensiveRun = false;
  m.flightDashHeld = false;

  // 1. Airborne idling: rotor loop active at standard gain
  sound.update(m, { active: true, listener: m.position, yaw: 0, now: 1.0 });
  assert.ok(sound.loops.has('rotor'), 'rotor loop active');
  assert.equal(sound.loops.has('offensive'), false, 'offensive loop not yet active');

  // 2. Dash begins: triggers exactly one offensiveRun whoosh, ducks ordinary rotor loop, starts offensive flutter loop
  m.offensiveRun = true;
  m.flightDashHeld = true;
  sound.update(m, { active: true, listener: m.position, yaw: 0, now: 1.1 });
  assert.equal(played.filter((p) => p.tag === 'offensiveRun').length, 1, 'one initial whoosh on start');
  assert.ok(sound.loops.has('offensive'), 'sustained offensive loop started');

  // 3. Continuous Dash hold across Practice meter refill: prowess depletes and refills while Dash button held
  // Sim temporarily clears offensiveRun during empty prowess tick...
  m.offensiveRun = false;
  sound.update(m, { active: true, listener: m.position, yaw: 0, now: 1.4 });

  // ...then prowess refills while flightDashHeld remains continuously true
  m.offensiveRun = true;
  sound.update(m, { active: true, listener: m.position, yaw: 0, now: 1.5 });

  // Should NOT trigger a second start whoosh because Dash was held continuously:
  assert.equal(played.filter((p) => p.tag === 'offensiveRun').length, 1, 'no repeated start whoosh during continuous hold / meter refill');

  // 4. Dash released: triggers offensiveRelease whoosh and smooth release fade on offensive loop
  m.offensiveRun = false;
  m.flightDashHeld = false;
  sound.update(m, { active: true, listener: m.position, yaw: 0, now: 2.0 });
  assert.equal(played.filter((p) => p.tag === 'offensiveRelease').length, 1, 'release whoosh played');
  assert.ok(stopped.some((s) => s.fade >= 0.25), 'smooth release fade applied to offensive loop');

  // 5. Dismount: stops all flight loops cleanly
  sound.update({ ...m, operatorId: null }, { active: false, listener: m.position, yaw: 0, now: 2.5 });
  assert.equal(sound.loops.size, 0, 'all loops stopped on dismount');
});

test('Narrow to One acquisition makes one crisp mechanical click, not a bolt discharge',()=>{
 const {audio,heard}=setup();
 audio.update(machine,opt);
 const event={type:'fightFlightTargetLock',machineId:machine.id,operatorId:'pilot',targetId:'enemy',at:1};
 audio.event(event,machine,1);
 audio.event(event,machine,1);
 const clicks=heard.filter(x=>x.recipe?.tag==='targetLock');
 assert.equal(clicks.length,1,'server lock event is deduplicated');
 assert.equal(heard.some(x=>x.recipe?.tag==='boltRelease'),false);
 assert.ok(clicks[0].recipe.layers.some(x=>x.type==='noise'&&x.decay<.03));
 assert.ok(clicks[0].recipe.layers.some(x=>x.type==='tone'));
});

test('Narrow target preview ticks quietly and hard-locks with a separate click on first bolt',()=>{
 const {audio,heard}=setup();
 audio.update(machine,opt);
 const preview={type:'fightFlightTargetPreview',machineId:machine.id,operatorId:'pilot',targetId:'enemy',at:1};
 audio.event(preview,machine,1);
 audio.event(preview,machine,1);
 assert.equal(heard.filter(x=>x.recipe?.tag==='targetPreview').length,1,'preview deduplicates');
 assert.equal(heard.filter(x=>x.recipe?.tag==='targetLock').length,0,'preview cannot announce hard lock');
 const hard={type:'fightFlightTargetLock',machineId:machine.id,operatorId:'pilot',targetId:'enemy',at:1.1};
 audio.event(hard,machine,1.1);
 assert.equal(heard.filter(x=>x.recipe?.tag==='targetLock').length,1,'real fired lock sounds distinct');
 assert.ok(flightRecipe('targetPreview',()=>.5).length<flightRecipe('targetLock',()=>.5).length);
});
