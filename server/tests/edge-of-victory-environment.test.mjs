// Edge of Victory's ground, traced against the Ruined Keep's collision at every contraction stage: one connected
// floor inside each ring, a way back in for every knight the ring overtakes (never a step outward, which the
// boundary forbids), and a final circle with room to duel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorld, WORLD_IDS } from '../../shared/worlds/registry.mjs';
import { EDGE_CONFIG, edgeConstrainActor, edgeInside } from '../../shared/sim/edgeOfVictory.mjs';
import { MOVEMENT } from '../../shared/src/movement.mjs';
import { auditEdgeStages, edgeInwardTraps } from '../../scripts/world-audit.mjs';

const keep = getWorld(WORLD_IDS.RUINED_KEEP);

test('every ring is one connected floor, and every knight it overtakes has a way in that never steps outward', () => {
  for (const stage of auditEdgeStages(keep, EDGE_CONFIG)) {
    assert.equal(stage.regions.length, 1, `ring ${stage.radius} m is split: ${stage.regions}`);
  }
  for (const stage of edgeInwardTraps(keep, EDGE_CONFIG)) {
    assert.equal(stage.traps, 0, `ring ${stage.radius} m traps knights at ${JSON.stringify(stage.examples)}`);
  }
});

test('the last circle is a duelling floor: room for a sword fight at its heart', () => {
  const last = auditEdgeStages(keep, EDGE_CONFIG).at(-1);
  assert.ok(last.swordRoom >= 18, `only ${last.swordRoom} m2 with three metres clear`);
  assert.ok(last.maxClearRadius >= 5, `largest clear circle ${last.maxClearRadius} m`);
});

test('knights caught where the 11 m ring used to trap them are brought back in by the real boundary', () => {
  // the authoritative correction a knight outside the ring receives each tick (edgeConstrainActor), on the real keep
  const { center } = EDGE_CONFIG;
  const radius = 11;
  for (const start of [{ x: 7.5, y: 0, z: 7.8 }, { x: -11.75, y: 0, z: -3.55 }, { x: -12.2, y: 0, z: -3.2 }]) {
    const actor = { id: 'k', alive: true, grounded: true, position: { ...start }, velocity: { x: 0, y: 0, z: 0 }, input: { forward: 0, right: 0, yaw: 0 } };
    const room = { state: 'PLAYING', edgeOfVictory: { center, radius, config: EDGE_CONFIG }, players: new Map([[actor.id, actor]]), events: [], world: keep };
    let ticks = 0;
    while (!edgeInside(actor.position, center, radius, MOVEMENT.playerRadius) && ticks < 30 * 10) {
      edgeConstrainActor(room, actor, { ...actor.position }, ticks / 30, keep);
      ticks += 1;
    }
    assert.ok(edgeInside(actor.position, center, radius, MOVEMENT.playerRadius),
      `knight from ${JSON.stringify(start)} held at ${JSON.stringify(actor.position)}, ${Math.hypot(actor.position.x - center.x, actor.position.z - center.z).toFixed(2)} m out`);
  }
});
