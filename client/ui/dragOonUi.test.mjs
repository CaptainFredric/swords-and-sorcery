import test from 'node:test';
import assert from 'node:assert/strict';
import { dragOonHudView, dragOonDeckView } from './dragOonHudView.mjs';
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

  // Rite of Ascension HUD states & armory copy
  const riteDrag = {
    ...makeDragOonSnapshot({ skill: { id: 'flightLikeHell', phase: 'idle', readyAt: 0 } }),
    riteCommitments: { p1: true, pax1: true, pax2: true },
    riteStatus: { eligible: true, reason: null, skillOk: true, galeOk: true, committedCount: 3, participantCount: 3 },
  };
  const riteReadyHud = dragOonHudView(
    { id: 'p1', alive: true, team: 'ATTACKERS', operatingDragOonId: 'drag-oon-1', ultimate: 'chivalry', prowess: 100, position: { x: 0, y: 0, z: 0 } },
    { machines: [riteDrag], dragOon: riteDrag },
    10
  );
  assert.match(riteReadyHud.status, /RITE READY \(3\/3\)/);
  const flhSkill = dragEntry.skills.find(s => s.id === 'flightLikeHell');
  assert.match(flhSkill.sections?.find(sec => sec.title === 'Rite of Ascension')?.text ?? '', /Unite the prowess of your crew to ascend upon an inferno/);
  assert.match(flhSkill.line, /unite the prowess of your crew to ascend upon an inferno/i);
});

test('dragOonDeckView computes hatched fuel penalty, 64/36 heat split, 5-seat Crew Diamond, and Rite reuse', () => {
  const op = { id: 'op1', name: 'Perry', alive: true, team: 'ATTACKERS', operatingDragOonId: 'drag-oon-1', ultimate: 'chivalry', prowess: 100 };
  const pax1 = { id: 'pax1', name: 'Rowan', alive: true, team: 'ATTACKERS', aboardDragOonId: 'drag-oon-1', dragOonStation: 0, spell: 'gale', ultimate: 'chivalry', prowess: 100 };
  const pax2 = { id: 'pax2', name: 'Bram', alive: true, team: 'ATTACKERS', aboardDragOonId: 'drag-oon-1', dragOonStation: 1, spell: 'steel', ultimate: 'chivalry', prowess: 100 };
  const d = makeDragOonSnapshot({
    heat: 140,
    fuel: 60,
    fuelMax: 100,
    effectiveFuelMax: 80,
    passengers: ['pax1', 'pax2', null, null],
    infusions: { tiers: { gale: 2, steel: 1 }, counts: { gale: 2, steel: 1 } },
    skill: { id: 'flightLikeHell', phase: 'idle', readyAt: 10 },
    flightLikeHell: null,
    riteCommitments: { op1: true, pax1: true },
    riteStatus: { eligible: false, committedCount: 2, participantCount: 3 },
  });
  const snap = { machines: [d], players: [op, pax1, pax2] };
  const deck = dragOonDeckView(op, snap, 12);

  assert.equal(deck.role, 'operator');
  assert.equal(Math.round(deck.fuel.fillPct), 60);
  assert.equal(Math.round(deck.fuel.emptyAvailPct), 20);
  assert.equal(Math.round(deck.fuel.disabledPct), 20);
  assert.equal(deck.fuel.overheated, true);

  assert.equal(deck.heat.normalShare, 64);
  assert.equal(deck.heat.overShare, 36);
  assert.equal(deck.heat.normalFillPct, 64);
  assert.ok(deck.heat.overFillPct > 11 && deck.heat.overFillPct < 13);
  assert.ok(deck.heat.crewDangerTickPct > 68 && deck.heat.crewDangerTickPct < 69);
  assert.equal(deck.heat.danger, true);

  assert.equal(deck.seats.OP.committed, true);
  assert.equal(deck.seats.L1.element, 'gale');
  assert.equal(deck.seats.L1.committed, true);
  assert.equal(deck.seats.R1.element, 'steel');
  assert.equal(deck.seats.R1.takingTrauma, true);
  assert.equal(deck.seats.L2.occupied, false);
  assert.equal(deck.riteRelevant, true);
  assert.equal(deck.abilities.spray.icon, 'desolationSpray');
  assert.equal(deck.abilities.skill.icon, 'flightLikeHell');

  const paxDeck = dragOonDeckView(pax1, snap, 12, { touch: true });
  assert.equal(paxDeck.role, 'passenger');
  assert.equal(paxDeck.passenger.stationLabel, 'L1');
  assert.equal(paxDeck.passenger.apertureOpen, true);
  assert.equal(paxDeck.passenger.castKey, 'CAST');
  assert.equal(paxDeck.passenger.leaveKey, 'LEAVE');
});
