import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getBiByeMuzzlePosition, BI_BYE_MODES, createBiByeLlista, mountBiByeLlista, stepBiByeLlista, fireBiByeMobile } from '../../shared/sim/biByeLlista.mjs';
import { resetPracticePlayer } from '../../shared/sim/practice.mjs';
import { RoomManager } from '../../shared/sim/RoomManager.mjs';
import { applyRoomCommand } from '../../shared/sim/wire.mjs';
import { stepRoom } from '../../shared/sim/combat.mjs';

const bytes = readFileSync(new URL('../../client/assets/props/bibye-ballista/bi-bye-llista-v3.2.glb', import.meta.url));
const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
const byName = new Map(gltf.nodes.map((node, index) => [node.name, index]));
const parents = new Map(gltf.nodes.flatMap((node, parent) => (node.children ?? []).map(child => [child, parent])));
test('v3.2 asset identity and mechanical contract', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'c595a2bc41db7d8c5783c0795cb24276529f72932c8ecb70f72599c099937b6a');
  assert.equal(gltf.nodes.length, 39);
  assert.equal(gltf.meshes.length, 29);
  assert.equal(gltf.animations.length, 12);
  for (const name of ['mounted_camera_tpv', 'mounted_camera_sight', 'small_bolt_muzzle', 'main_bolt_muzzle']) assert.ok(byName.has(name), name);
});

test('a moving ballista stops at an unmounted living player', () => {
  const ballista = createBiByeLlista({ x: 0, z: 0, baseYaw: 0 });
  const operator = { id: 'driver', alive: true, position: { x: 0, y: 0, z: 2.4 }, input: { forward: 1, yaw: 0, pitch: 0 } };
  mountBiByeLlista(ballista, operator);
  const target = { id: 'target', alive: true, position: { x: 0, y: 0, z: -4 } };
  const world = { floors: [{ center: [0, 0, 0], size: [50, 0, 50], y: 0 }], solids: [] };
  const room = { players: new Map([[operator.id, operator], [target.id, target]]), world };
  for (let i = 0; i < 60; i++) stepBiByeLlista(room, ballista, 1 / 30, i / 30);
  assert.ok(ballista.z > -2, `carriage passed through target: ${ballista.z}`);
});

test('mounted operators cannot cast personal spells or trigger personal combat abilities', () => {
  const room = new RoomManager().createSoloRoom('PRACTICE', 0, 'castleward');
  const p = room.addPlayer({ id: 'operator', token: 'operator', name: 'Operator' }, 0);
  room.armAutoStart(0);
  p.position = { x: room.biByeLlista.x, y: 0, z: room.biByeLlista.z };
  mountBiByeLlista(room.biByeLlista, p);
  const before = { spellReadyAt: p.spellReadyAt, dashReadyAt: p.dashReadyAt, prowess: p.prowess };
  for (const command of [{ type: 'cast' }, { type: 'dash' }, { type: 'gauntlet' }, { type: 'ultimate' }, { type: 'guard', down: true }]) applyRoomCommand(room, p, command, 1);
  assert.deepEqual({ spellReadyAt: p.spellReadyAt, dashReadyAt: p.dashReadyAt, prowess: p.prowess }, before);
  assert.equal(p.guarding, false);
  assert.equal(p.pendingSpell, null);
});

test('an ordinary Fireball directly collides with the visible cockpit backrest', () => {
  const room = new RoomManager().createSoloRoom('PRACTICE', 0, 'castleward');
  const p = room.addPlayer({ id: 'caster', token: 'caster', name: 'Caster' }, 0);
  room.armAutoStart(0);
  // Account for the ordinary casting hand offset while aiming at the narrow backrest.
  p.position = { x: 6, y: 0, z: -15.02 };
  p.spawnProtectionUntil = 0;
  applyRoomCommand(room, p, { type: 'cast', direction: { x: 1, y: 0, z: 0 } }, 1);
  for (let i = 0; i < 60; i++) stepRoom(room, 1 / 30, 1 + i / 30);
  assert.ok(room.biByeLlista.health < 650, `Fireball passed through machine: ${room.biByeLlista.health}`);
});

test('Practice reset cancels an unlaunched shot and clears the previous firing clock', () => {
  const room = new RoomManager().createSoloRoom('PRACTICE', 0, 'castleward');
  const p = room.addPlayer({ id: 'driver', token: 'driver', name: 'Driver' }, 0);
  room.armAutoStart(0);
  p.position = { x: room.biByeLlista.x, y: 0, z: room.biByeLlista.z };
  mountBiByeLlista(room.biByeLlista, p);
  fireBiByeMobile(room, room.biByeLlista, 1);
  resetPracticePlayer(room, p.id, 1.05);
  stepBiByeLlista(room, room.biByeLlista, 1 / 30, 1.3);
  assert.equal(room.bibyeProjectiles.size, 0);
  assert.equal(room.biByeLlista.mobileFiredAt, null);
});

test('mounting discards the previous walking intent and starts with the machine aim', () => {
  const ballista = createBiByeLlista({ x: 0, z: 0, baseYaw: -.8 });
  const p = { id: 'driver', alive: true, position: { x: 0, y: 0, z: 2.5 },
    input: { forward: 1, sprint: true, yaw: 2, pitch: .9 }, guarding: true, guardHeld: true };
  mountBiByeLlista(ballista, p);
  const room = { players: new Map([[p.id, p]]), world: { solids: [] } };
  stepBiByeLlista(room, ballista, 1 / 30, .1);
  assert.equal(ballista.x, 0);
  assert.equal(ballista.z, 0);
  assert.equal(ballista.yaw, -.8);
  assert.equal(ballista.pitch, 0);
  assert.equal(p.guarding, false);
});

test('a mobile shot at the traverse limit follows the rendered legal turret angle while turning', () => {
  const ballista = createBiByeLlista({ x: 0, z: 0, baseYaw: 0 });
  const p = { id: 'driver', alive: true, position: { x: 0, y: 0, z: 2.5 } };
  mountBiByeLlista(ballista, p);
  ballista.yaw = Math.PI / 5;
  p.input = { forward: 1, right: 1, yaw: Math.PI / 5, pitch: 0 };
  const room = { players: new Map([[p.id, p]]), events: [], bibyeProjectiles: new Map(), world: { solids: [] } };
  fireBiByeMobile(room, ballista, 0);
  for (let i = 0; i < 10 && room.bibyeProjectiles.size === 0; i++) stepBiByeLlista(room, ballista, 1 / 30, i / 30);
  const shot = [...room.bibyeProjectiles.values()][0];
  assert.ok(Math.abs(Math.atan2(-shot.velocity.x, -shot.velocity.z) - ballista.yaw) < 1e-8);
});
