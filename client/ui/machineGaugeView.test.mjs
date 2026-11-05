import test from 'node:test';
import assert from 'node:assert/strict';
import { machineGaugeView, machineGaugeNumber } from './machineGaugeView.mjs';

const ram = () => ({ id: 'ram-1', health: 1400, maxHealth: 1400, pressure: 72,
  ramElevPitch: Math.PI / 6, fistMounted: true, components: { Fist: { health: 500, maxHealth: 500 } } });
const operator = { id: 'pilot', alive: true, operatingRamId: 'ram-1' };
const view = b => machineGaugeView(operator, { soFistication: b });

test('ram gauge derives numerical fills, pressure and pitch from snapshot', () => {
  const b = ram();
  assert.deepEqual([view(b).health, view(b).maxHealth, view(b).percent], [1400, 1400, 100]);
  assert.deepEqual(view(b).pressure, { value: 72, max: 100, percent: 72 });
  assert.equal(Math.round(view(b).pitch), 30);
  b.health = 350; b.components.Fist.health = 175; b.pressure = 16;
  assert.equal(view(b).percent, 25);
  assert.equal(view(b).component.percent, 35);
  assert.equal(view(b).component.state, 'attached');
  assert.equal(view(b).pressure.percent, 16);
  assert.equal(machineGaugeNumber(30.01), '31');
});

test('fist launch, ground recovery, return and destruction never magically restore health', () => {
  const b = ram();
  b.components.Fist.health = 127;
  b.fistMounted = false;
  b.detachedFist = { state: 'flying' };
  assert.equal(view(b).component.state, 'detached');
  assert.equal(view(b).context, 'FIST IN FLIGHT');
  b.detachedFist.state = 'resting';
  assert.match(view(b).context, /COLLECT/);
  b.detachedFist.state = 'recovering';
  assert.match(view(b).context, /RECOVERING/);
  b.detachedFist.state = 'abyss';
  assert.match(view(b).context, /RETURN HOME/);
  b.detachedFist = null; b.fistMounted = true;
  assert.equal(view(b).component.state, 'attached');
  assert.equal(view(b).component.health, 127);
  b.components.Fist.health = 0; b.fistMounted = false;
  assert.equal(view(b).component.state, 'destroyed');
  assert.match(view(b).context, /DESTROYED/);
});

test('machine gauge is scoped to the mounted machine and its real cap', () => {
  const b = ram();
  assert.equal(machineGaugeView({ ...operator, operatingRamId: 'other' }, { soFistication: b }), null);
  assert.equal(machineGaugeView({ ...operator, alive: false }, { soFistication: b }), null);
  b.health = 0;
  assert.equal(view(b), null);
  const ballista = { id: 'bb', health: 317, maxHealth: 650, mode: 'MOBILE' };
  const bv = machineGaugeView({ alive: true, operatingBallistaId: 'bb' }, { bibyeBallista: ballista });
  assert.equal(bv.title, 'BI-BYE-LLISTA');
  assert.equal(bv.health, 317);
  assert.equal(bv.component, null);
  const flight = { id: 'ff', health: 180, maxHealth: 250, rotorHP: 44, maxRotorHP: 120 };
  const fv = machineGaugeView({ alive: true, operatingFightFlightId: 'ff' }, { fightFlight: flight });
  assert.equal(fv.component.maxHealth, 120);
  assert.equal(fv.component.percent, 44 / 120 * 100);
  flight.rotorHP = 0;
  assert.equal(machineGaugeView({ alive: true, operatingFightFlightId: 'ff' }, { fightFlight: flight }).context, 'ROTOR DESTROYED');
});
