import test from 'node:test';
import assert from 'node:assert/strict';
import { dragOonHudView } from './dragOonHudView.mjs';
import { machineGaugeView } from './machineGaugeView.mjs';
import { mountedSiegeSkillTile } from './mountedSiegeSkillTile.mjs';
import { siegePickerCards, siegePickerStatus, siegePickerMarkup } from './SiegeMachinePicker.mjs';
import { siegeArmoryView } from '../menu/siegeArmoryView.mjs';
import { practiceSiegeCopy } from '../menu/practiceSiegeStory.mjs';
import { fleetRenderKind } from '../worlds/fleetRenderKind.mjs';
import { privateRoomPreview } from '../menu/privateRoomRules.mjs';

function makeDragOonSnapshot(overrides = {}) {
  return {
    id: 'drag-oon-1',
    kind: 'dragoon',
    class: 'drag-oon',
    type: 'drag-oon',
    team: 'ATTACKERS',
    x: 0,
    y: 0,
    z: 0,
    health: 1850,
    maxHealth: 2200,
    fuel: 72,
    fuelMax: 100,
    effectiveFuelMax: 84,
    heat: 128,
    overheatPenalty: 16,
    operatorId: 'op1',
    passengers: ['pax1', null, null, null],
    passengerCapacity: 4,
    leapReadyAt: 10,
    steamReadyAt: 22,
    skill: { id: 'flightLikeHell', phase: 'active', readyAt: 30 },
    infusions: { tiers: { fire: 2, steel: 1 } },
    campFire: { sealed: false, active: false },
    flightLikeHell: { active: true },
    ...overrides,
  };
}

test('dragOonHudView covers approach, operator, and passenger aperture states', () => {
  const d = makeDragOonSnapshot();
  const baseSnap = { machines: [d], dragOon: d };

  const approach = dragOonHudView(
    { id: 'ally', alive: true, team: 'ATTACKERS', position: { x: 1.5, y: 0, z: 1.5 } },
    baseSnap,
    12,
  );
  assert.equal(approach.title, 'DRAG-OON');
  assert.match(approach.status, /Board Crew Aperture/);

  const operator = dragOonHudView(
    { id: 'op1', alive: true, team: 'ATTACKERS', operatingDragOonId: 'drag-oon-1', position: { x: 0, y: 1, z: 0 } },
    baseSnap,
    12,
  );
  assert.match(operator.title, /DRAG-OON/);
  assert.match(operator.status, /FUEL 72\/84/);
  assert.match(operator.status, /OVERPRESSURE DANGER/);
  assert.match(operator.status, /INFUSED: FIRE II · STEEL I/);

  const passenger = dragOonHudView(
    { id: 'pax1', alive: true, team: 'ATTACKERS', aboardDragOonId: 'drag-oon-1', dragOonStation: 0, position: { x: -1, y: 1, z: -0.7 } },
    { machines: [makeDragOonSnapshot({ campFire: { sealed: true, active: true } })] },
    12,
  );
  assert.equal(passenger.title, 'DRAG-OON · CREW STATION #1');
  assert.match(passenger.status, /HATCHES SEALED · EXTERNAL CASTS LOCKED/);
  assert.match(passenger.controls, /Cast from Aperture/);
});

test('machineGaugeView and mountedSiegeSkillTile report DRAG-OON furnace heat, fuel cap, and all four Skills', () => {
  const d = makeDragOonSnapshot();
  const snap = { machines: [d], dragOon: d };
  const local = { id: 'op1', alive: true, operatingDragOonId: 'drag-oon-1' };

  const gauge = machineGaugeView(local, snap, 12);
  assert.equal(gauge.kind, 'dragoon');
  assert.equal(gauge.component.label, 'FUEL (CAP 84)');
  assert.equal(gauge.pressure.label, 'FURNACE HEAT');
  assert.equal(gauge.pressure.overheated, true);

  for (const [skillId, expectedLabel] of [
    ['razeThePasture', 'RAZE PASTURE'],
    ['flightLikeHell', 'FLIGHT HELL'],
    ['campFire', 'CAMP FIRE'],
    ['brimmingWithPotential', 'OVERPRESSURE'],
  ]) {
    const s = makeDragOonSnapshot({ skill: { id: skillId, phase: 'idle', readyAt: 10 }, flightLikeHell: null });
    const tile = mountedSiegeSkillTile(local, { machines: [s] }, 12);
    assert.equal(tile.name, expectedLabel);
    assert.equal(tile.state, 'READY');
  }
});

test('SiegeMachinePicker, Workshop, Practice, Private rules, and fleetRenderKind keep DRAG-OON experimental-gated', () => {
  // Canonical defaults remain strictly 3 machines
  assert.equal(siegePickerCards().length, 3);
  assert.equal(siegeArmoryView().length, 3);
  assert.match(siegePickerStatus(null), /1–3/);

  // Experimental mode surfaces DRAG-OON in picker, workshop view, Practice copy, Private preview, and renderer routing
  assert.equal(siegePickerCards({ experimentalDragOon: true }).length, 4);
  assert.match(siegePickerStatus(null, { experimentalDragOon: true }), /1–4/);
  assert.match(siegePickerMarkup({ experimentalDragOon: true }), /DRAG-OON \[EXP\]/);

  const expView = siegeArmoryView({ dragOon: 'flightLikeHell' }, { experimental: true });
  assert.equal(expView.length, 4);
  const dragEntry = expView.find((m) => m.id === 'dragOon');
  assert.ok(dragEntry?.experimental);
  const leap = dragEntry.attacks.find((a) => a.id === 'firesTheLimit');
  assert.equal(leap.name, "FUEL'S THE LIMIT");
  assert.equal(
    leap.summary,
    'Ignite fuel beneath your hull to propel yourself through the air and crash down upon foes.',
  );
  assert.equal(dragEntry.skills.find((s) => s.id === 'flightLikeHell')?.equipped, true);

  const pracCopy = practiceSiegeCopy('drag-oon');
  assert.equal(pracCopy?.name, 'DRAG-OON');
  assert.equal(practiceSiegeCopy('unknown'), null);

  assert.equal(fleetRenderKind({ kind: 'dragoon' }), 'dragoon');
  assert.equal(fleetRenderKind({ class: 'drag-oon' }), 'dragoon');

  const priv = privateRoomPreview('SIEGE_BLADES', {
    worldId: 'high-grounds',
    teamSize: '1',
    format: 'MATCH',
    matchRounds: '3',
    experimentalDragOon: true,
  });
  assert.equal(priv.ok, true);
  assert.equal(priv.settings.siegeBladesSettings.experimentalDragOon, true);
  assert.match(priv.summary, /DRAG-OON EXP/);
});
