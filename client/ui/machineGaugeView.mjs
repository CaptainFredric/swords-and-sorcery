// Pure presentation of authoritative siege-machine health. Never owns damage, repair or recovery.
const positive = value => Number.isFinite(value) && value > 0;
const amount = (value, fallback = 0) => Number.isFinite(value) ? Math.max(0, value) : fallback;
const fraction = (health, maxHealth) => maxHealth > 0 ? Math.max(0, Math.min(100, 100 * health / maxHealth)) : 0;

export function machineGaugeView(local, snapshot) {
  if (!local?.alive || !snapshot) return null;
  let machine, kind, title;
  if (local.operatingRamId && snapshot.soFistication?.id === local.operatingRamId) {
    machine = snapshot.soFistication; kind = 'ram'; title = 'SO-FIST-ICATION';
  } else if (local.operatingBallistaId && snapshot.bibyeBallista?.id === local.operatingBallistaId) {
    machine = snapshot.bibyeBallista; kind = 'ballista'; title = 'BI-BYE-LLISTA';
  } else if (local.operatingFightFlightId && snapshot.fightFlight?.id === local.operatingFightFlightId) {
    machine = snapshot.fightFlight; kind = 'flight'; title = 'FIGHT-AND-FLIGHT';
  } else return null;
  const health = amount(machine.health);
  if (machine.retired || machine.mode === 'DESTROYED' || health <= 0) return null;
  const maxHealth = positive(machine.maxHealth) ? machine.maxHealth : Math.max(1, health);
  const view = {
    id: machine.id, kind, title,
    health, maxHealth, percent: fraction(health, maxHealth),
    component: null, pressure: null, pitch: null, context: '',
  };
  if (kind === 'ram') {
    const pressure = amount(machine.pressure);
    view.pressure = { value: pressure, max: 100, percent: fraction(pressure, 100) };
    view.pitch = Number.isFinite(machine.ramElevPitch) ? machine.ramElevPitch * 180 / Math.PI : 0;
    const fist = machine.components?.Fist;
    if (fist) {
      const fistHealth = amount(fist.health);
      const fistMax = positive(fist.maxHealth) ? fist.maxHealth : Math.max(1, fistHealth);
      const phase = machine.detachedFist?.state;
      const state = fistHealth <= 0 ? 'destroyed'
        : machine.fistMounted === false || (phase && phase !== 'attached') ? 'detached' : 'attached';
      const context = state === 'destroyed' ? 'FIST DESTROYED · PISTON ONLY'
        : state === 'attached' ? ''
        : phase === 'recovering' ? 'FIST RECOVERING'
        : phase === 'resting' ? 'FIST ON GROUND · COLLECT'
        : phase === 'abyss' ? 'FIST LOST · RETURN HOME'
        : 'FIST IN FLIGHT';
      view.component = { label: 'FIST', health: fistHealth, maxHealth: fistMax,
        percent: fraction(fistHealth, fistMax), state };
      view.context = context;
    }
  } else if (kind === 'flight' && Number.isFinite(machine.rotorHP)) {
    // Rotor HP is its own component pool; the flight simulation's configured cap
    // is 100, unless a future authoritative rotor maximum is transmitted.
    const maxRotor = positive(machine.maxRotorHP) ? machine.maxRotorHP : 100;
    const rotorHealth = amount(machine.rotorHP);
    view.component = { label: 'ROTOR', health: rotorHealth, maxHealth: maxRotor,
      percent: fraction(rotorHealth, maxRotor), state: rotorHealth <= 0 ? 'destroyed' : 'attached' };
    if (rotorHealth <= 0) view.context = 'ROTOR DESTROYED';
  }
  return view;
}

export function machineGaugeNumber(value) {
  return String(Math.ceil(amount(value)));
}
