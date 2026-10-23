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
// Independently evaluate the actual exported parent chain, in model coordinates.
function rotate([x, y, z], yaw, pitch = 0) {
  const py = y * Math.cos(pitch) - z * Math.sin(pitch);
  const pz = y * Math.sin(pitch) + z * Math.cos(pitch);
  return [x * Math.cos(yaw) + pz * Math.sin(yaw), py, -x * Math.sin(yaw) + pz * Math.cos(yaw)];
}
function locator(ballista, name) {
  let point = [0, 0, 0];
  for (let index = byName.get(name); index !== undefined; index = parents.get(index)) {
    const node = gltf.nodes[index];
    const mobile = ballista.mode === BI_BYE_MODES.MOBILE;
    if (node.name === 'Traverse_Mount' && !mobile) point = rotate(point, ballista.yaw - ballista.heading);
    if (node.name === 'Elevation_Cradle' && !mobile) point = rotate(point, 0, -ballista.pitch);
    if (node.name === 'Upper_Turret_Mount' && mobile) point = rotate(point, ballista.yaw - ballista.heading, -ballista.pitch);
    point = point.map((value, axis) => value + (node.translation?.[axis] ?? 0));
  }
  point = rotate(point, ballista.heading + Math.PI);
  return point.map((value, axis) => value + [ballista.x, ballista.y, ballista.z][axis]);
}

test('v3.2 asset identity and mechanical contract', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'c595a2bc41db7d8c5783c0795cb24276529f72932c8ecb70f72599c099937b6a');
  assert.equal(gltf.nodes.length, 39);
  assert.equal(gltf.meshes.length, 29);
  assert.equal(gltf.animations.length, 12);
  for (const name of ['mounted_camera_tpv', 'mounted_camera_sight', 'small_bolt_muzzle', 'main_bolt_muzzle']) assert.ok(byName.has(name), name);
});

test('authoritative muzzle geometry matches the exported v3.2 hierarchy throughout the aiming envelope', () => {
  for (const mode of [BI_BYE_MODES.MOBILE, BI_BYE_MODES.DEPLOYED]) {
    for (let heading = -Math.PI; heading < Math.PI; heading += Math.PI / 4) {
      for (const traverse of [-Math.PI / (mode === BI_BYE_MODES.MOBILE ? 5 : 4), 0, Math.PI / (mode === BI_BYE_MODES.MOBILE ? 5 : 4)]) {
        for (const pitch of [-0.15, 0, 0.35]) {
          const ballista = { x: 7, y: 2, z: -11, heading, yaw: heading + traverse, pitch, mode };
          for (const [kind, name] of [['conditioning', 'small_bolt_muzzle'], ...mode === BI_BYE_MODES.DEPLOYED ? [['siege', 'main_bolt_muzzle']] : []]) {
            const actual = Object.values(getBiByeMuzzlePosition(ballista, kind));
            const expected = locator(ballista, name);
            assert.ok(Math.hypot(...actual.map((value, axis) => value - expected[axis])) < 1e-8,
              `${mode} ${kind} heading ${heading}, traverse ${traverse}, pitch ${pitch}: ${actual} != ${expected}`);
          }
        }
      }
    }
  }
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

test('an ordinary Fireball directly collides with and damages the carriage', () => {
  const room = new RoomManager().createSoloRoom('PRACTICE', 0, 'castleward');
  const p = room.addPlayer({ id: 'caster', token: 'caster', name: 'Caster' }, 0);
  room.armAutoStart(0);
  p.position = { x: 6.4, y: 0, z: -14.6 };
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
