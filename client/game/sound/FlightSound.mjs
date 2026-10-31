import { ring, spatialize } from './soundRecipes.mjs';

const noise=(freq,decay,gain,at=0,filter='bandpass',q=.7)=>({type:'noise',filter,freq,q,attack:.002,decay,gain,at});
const thud=(freq,decay,gain,at=0,slideTo=null)=>({type:'tone',wave:'sine',freq,slideTo:slideTo??Math.max(28,freq*.46),attack:.003,decay,gain,at});
const ticks=(count,step,freq,gain)=>Array.from({length:count},(_,i)=>noise(freq,.02,gain*(1-i/(count*1.3)),i*step,'highpass'));

export function flightRecipe(kind, rand=Math.random){
  const wood=[noise(380,.18,.45),thud(120,.24,.55),{...ring(rand,190,{decay:.22,gain:.06,partials:3}),at:.015}];
  const metal=[noise(1850,.06,.28),thud(170,.12,.32),ring(rand,390,{decay:.38,gain:.12,partials:4})];

  const snapJitter = 1 + (rand() * 0.12 - 0.06);
  const boltRelease = [
    noise(1550 * snapJitter, .042, .32),
    thud(280 * snapJitter, .065, .28, 0, 95 * snapJitter),
    noise(2600 * snapJitter, .018, .18, .012, 'highpass'),
    ...ticks(2, .035, 1200 * snapJitter, .10)
  ];

  const recipes = {
    boltRelease,
    impactPlayer: [
      noise(340, .14, .36),
      thud(110, .18, .48, 0, 42),
      noise(850, .05, .22, .01)
    ],
    impactGuard: [
      noise(1600, .08, .42),
      thud(180, .16, .52, 0, 75),
      ring(rand, 560, { decay: .28, gain: .16, partials: 4 }),
      ...ticks(3, .03, 2100, .12)
    ],
    impactParry: [
      noise(2400, .05, .32),
      ring(rand, 1150, { decay: .45, gain: .24, partials: 5 }),
      ring(rand, 1720, { decay: .35, gain: .18, partials: 3 })
    ],
    impactBrace: [
      ...wood,
      noise(1400, .12, .32),
      ring(rand, 340, { decay: .32, gain: .14, partials: 3 })
    ],
    impactRotor: [
      noise(2200, .06, .38),
      thud(240, .09, .35),
      ring(rand, 880, { decay: .36, gain: .20, partials: 4 })
    ],
    impactWall: [
      noise(2300, .09, .42),
      noise(750, .16, .26),
      thud(90, .22, .45, 0, 35),
      ...ticks(4, .025, 2900, .14)
    ],
    impactGround: [
      noise(220, .22, .38),
      thud(85, .28, .52, 0, 32)
    ],
    impactSiege: [
      ...wood,
      ...metal,
      thud(78, .36, .65, 0, 30)
    ],
    takeoff: [
      noise(190, .45, .38),
      thud(75, .35, .45, 0, 110),
      noise(420, .32, .24, .08),
      ...ticks(4, .06, 950, .12)
    ],
    landingLight: [
      noise(260, .22, .24),
      thud(95, .20, .32)
    ],
    landingHeavy: [
      noise(240, .38, .52),
      thud(65, .45, .72, 0, 28),
      ...wood,
      ...ticks(5, .05, 1100, .16)
    ],
    rotorCollision: [
      noise(1950, .12, .55),
      thud(150, .25, .58),
      ring(rand, 620, { decay: .45, gain: .28, partials: 5 }),
      ...wood
    ],
    rotorFailure: [
      noise(1200, .35, .45),
      thud(60, .55, .72),
      ...ticks(6, .06, 1800, .22),
      ...wood
    ],
    braceDestroyed: [
      noise(650, .42, .55),
      thud(72, .48, .68),
      ...ticks(7, .05, 1400, .24)
    ],
    offensiveRun: [
      noise(520, .48, .35),
      thud(130, .38, .45, 0, 220),
      ring(rand, 480, { decay: .35, gain: .12, partials: 3 })
    ],
    valkyriePrep: [
      thud(55, .95, .62, 0, 95),
      noise(320, .85, .32),
      ring(rand, 220, { decay: .85, gain: .18, partials: 4 })
    ],
    valkyrieCommit: [
      noise(850, 1.2, .65),
      thud(45, 1.4, .85, 0, 25),
      noise(1900, .8, .45)
    ],
    valkyrieExplosion: [
      noise(180, 1.4, .88),
      thud(42, 1.6, .98, 0, 20),
      noise(1400, .75, .62),
      ...ticks(8, .07, 1200, .28),
      ring(rand, 130, { decay: 1.2, gain: .32, partials: 5 })
    ],
  };

  return { tag: kind, layers: recipes[kind] ?? wood, reverb: kind.startsWith('valkyrie') ? .45 : kind.startsWith('impact') ? .18 : .22 };
}

export function flightLoopSamples(kind, rate=22050, seconds=2, rand=Math.random){
  const result = new Float32Array(Math.floor(rate * seconds));
  let low = 0;
  for (let i = 0; i < result.length; i++) {
    const t = i / rate, white = rand() * 2 - 1;
    low = 0.94 * low + 0.06 * white;
    const seam = Math.min(1, i / (rate * 0.02), (result.length - 1 - i) / (rate * 0.02));
    if (kind === 'rotor') {
      const phase = (t * 14) % 1;
      const wash = Math.exp(-phase * 16) * Math.sin(2 * Math.PI * 58 * t);
      const gear = Math.sin(2 * Math.PI * 440 * t) * 0.04 * (white * 0.5 + 0.5);
      result[i] = seam * (low * 0.22 + wash * 0.26 + gear);
    } else if (kind === 'walk') {
      const phase = (t * 4.2) % 1;
      const foot = Math.exp(-phase * 22) * Math.sin(2 * Math.PI * 95 * t) * 0.18;
      result[i] = seam * (low * 0.24 + foot);
    } else if (kind === 'offensive') {
      const hum = Math.sin(2 * Math.PI * 260 * t) * 0.16 + Math.sin(2 * Math.PI * 520 * t) * 0.08;
      result[i] = seam * (low * 0.42 + hum);
    }
  }
  return result;
}

export class FlightSound {
  constructor(engine) {
    this.engine = engine;
    this.loops = new Map();
    this.ones = [];
    this.seen = new Set();
    this.buffers = new Map();
    this.active = false;
    this.last = null;
    this.lastTime = 0;
    this.wasGrounded = true;
    this.lastVelY = 0;
  }

  #place(b) {
    return spatialize(this.options?.listener, this.options?.yaw ?? 0, b.position ?? { x: b.x, y: b.y, z: b.z });
  }

  #play(kind, b, gain = 1) {
    if (!this.active || !this.engine?.running) return;
    const place = this.#place(b);
    const handle = this.engine.play(flightRecipe(kind), { bus: 'sfx', pan: place.pan, gain: place.gain * gain });
    if (handle) this.ones.push(handle);
    if (this.ones.length > 24) this.ones.shift();
  }

  #loop(kind, wanted, b, gain, rate = 1) {
    if (!wanted) {
      this.loops.get(kind)?.stop(0.08);
      this.loops.delete(kind);
      return;
    }
    const place = this.#place(b);
    const options = { bus: 'sfx', pan: place.pan, gain: place.gain * gain, rate, loop: true, attack: 0.06 };
    if (!this.loops.has(kind)) {
      if (!this.buffers.has(kind)) this.buffers.set(kind, this.engine.buffer(flightLoopSamples(kind), 22050));
      const handle = this.engine.playBuffer(this.buffers.get(kind), options);
      if (handle) this.loops.set(kind, handle);
    } else {
      this.loops.get(kind).place({ gain: options.gain, pan: options.pan, rate });
    }
  }

  update(m, options) {
    const last = this.last;
    this.options = options;
    if (last && (last.operatorId !== m?.operatorId || last.id !== m?.id || options.now < this.lastTime)) {
      this.stop();
    }
    if (last && (last.id !== m?.id || options.now < this.lastTime)) {
      this.seen.clear();
    }
    this.lastTime = options.now;
    this.active = Boolean(options.active && m && this.engine?.running && !this.engine?.muted);
    if (!this.active) {
      this.stop();
      this.last = m;
      return;
    }

    const owned = Boolean(m.operatorId) && m.mode !== 'DESTROYED';
    const grounded = Boolean(m.grounded);
    const vy = m.velocity?.y ?? 0;
    const speed = Math.hypot(m.velocity?.x ?? 0, m.velocity?.z ?? 0);

    // Takeoff detection
    if (this.wasGrounded && !grounded && vy > 1) {
      this.#play('takeoff', m, 0.7);
    }
    // Landing detection
    if (!this.wasGrounded && grounded) {
      if (this.lastVelY < -3.5) {
        this.#play('landingHeavy', m, 0.85);
      } else {
        this.#play('landingLight', m, 0.5);
      }
    }
    this.wasGrounded = grounded;
    this.lastVelY = vy;

    // Continuous flight audio loops
    const rotorAlive = (m.rotorHP ?? 0) > 0;
    const rotorSpinning = rotorAlive && (owned || !grounded || (m.rotorEnergy ?? 0) > 10);
    const climbRateMod = Math.max(0.7, Math.min(1.4, 1 + vy * 0.06));
    const rotorGain = grounded ? 0.18 : 0.28 + Math.min(0.12, Math.max(0, vy * 0.03));
    this.#loop('rotor', rotorSpinning, m, rotorGain, climbRateMod);

    const walking = owned && grounded && speed > 0.35;
    this.#loop('walk', walking, m, 0.22, Math.max(0.6, Math.min(1.3, speed / 3)));

    const offensive = owned && Boolean(m.offensiveRun);
    this.#loop('offensive', offensive, m, 0.35, 1.15);

    this.last = { ...m };
  }

  event(event, m, now) {
    if (!m || !this.active) return;
    if (event.machineId && event.machineId !== m.id) return;
    if (Math.abs(now - event.at) > 1.2) return;

    const key = [event.type, event.machineId, event.at, event.component, event.projectileId, event.hitKind, event.action].join(':');
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 180) this.seen.delete(this.seen.values().next().value);

    let kind = null;
    const targetPoint = event.point ? { ...m, position: event.point } : m;

    if (event.type === 'fightFlightBoltReleased') {
      kind = 'boltRelease';
    } else if (event.type === 'fightFlightBoltImpact') {
      if (event.hitKind === 'parry') kind = 'impactParry';
      else if (event.hitKind === 'guard') kind = 'impactGuard';
      else if (event.hitKind === 'player') kind = 'impactPlayer';
      else if (event.hitKind === 'wall') kind = 'impactWall';
      else if (event.hitKind === 'ground') kind = 'impactGround';
      else if (event.hitKind === 'ballista' || event.hitKind === 'ram') kind = 'impactSiege';
      else kind = 'impactBrace';
    } else if (event.type === 'fightFlightComponentHit') {
      if (event.component === 'rotor') kind = 'impactRotor';
      else if (String(event.component).startsWith('brace')) kind = 'impactBrace';
      else kind = 'impactBrace';
    } else if (event.type === 'fightFlightRotorDestroyed') {
      kind = 'rotorFailure';
    } else if (event.type === 'fightFlightBraceDestroyed') {
      kind = 'braceDestroyed';
    } else if (event.type === 'fightFlightRotorWorldImpact' || event.type === 'fightFlightRotorContact') {
      kind = 'rotorCollision';
    } else if (event.type === 'fightFlightOffensiveRun' && event.action === 'started') {
      kind = 'offensiveRun';
    } else if (event.type === 'fightFlightTerminalPrep' && event.action === 'started') {
      kind = 'valkyriePrep';
    } else if (event.type === 'fightFlightTerminalCommitted') {
      kind = 'valkyrieCommit';
    } else if (event.type === 'fightFlightTerminalExplosion') {
      kind = 'valkyrieExplosion';
    }

    if (kind) {
      this.#play(kind, targetPoint, kind === 'valkyrieExplosion' ? 1 : kind.startsWith('valkyrie') ? 0.9 : 0.85);
    }
  }

  stop() {
    for (const h of this.loops.values()) h?.stop?.(0.08);
    this.loops.clear();
    for (const h of this.ones) h?.stop?.();
    this.ones.length = 0;
  }

  dispose() {
    this.stop();
    this.buffers.clear();
  }
}
