import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { restlessRenownerBlade, restlessRenownerMouth } from '../../shared/worlds/renownerGeometry.mjs';

test('the authored Renowner binary preserves its original joint and ceremony inventory', async () => {
  const bytes = await readFile(new URL('../../client/assets/props/rightful-renowner/Rightful_Renowner_GameReady_PBR.glb', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '2a9e73a7b5991757f851dd7e9148e7f91f5abc07283ae9792b50f9144b1983a2');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const model = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  assert.equal(model.nodes.length, 19);
  assert.equal(model.meshes.length, 18);
  assert.equal(model.textures.length, 4);
  assert.equal(model.animations.length, 6);
  const sword = model.nodes.findIndex(node => node.name === 'Renowner_Sword');
  assert.ok(model.nodes.find(node => node.name === 'Renowner_Wrist_R').children.includes(sword));
  const cycle = model.animations.find(clip => clip.name === '01_Knighting_And_Dispense_Cycle');
  for (const side of ['L', 'R']) {
    const wrist = model.nodes.findIndex(node => node.name === 'Renowner_Wrist_' + side);
    assert.ok(cycle.channels.some(({target}) => target.node === wrist && target.path === 'rotation'));
  }
  assert.equal(model.accessors[cycle.samplers[0].input].max[0], 6);
});

test('the Restless Day blade keeps its endpoints and committed moving sweep', () => {
  const renowner = { position:{x:0,y:1.4,z:56}, yaw:Math.PI, attack:{type:'downstroke',contactAt:10} };
  const strike = restlessRenownerBlade(renowner, 10);
  assert.ok(Math.abs(strike.b[0]) < 1e-10);
  assert.equal(strike.b[1], 1.15);
  assert.equal(strike.b[2], 50.2);
  renowner.attack.type = 'sweep';
  const left = restlessRenownerBlade(renowner, 10);
  const right = restlessRenownerBlade(renowner, 10.25);
  assert.ok(left.b[0] > 6 && right.b[0] < -6);
  assert.ok(restlessRenownerMouth(renowner).z < renowner.position.z);
});

test('authoritative statue contact and dispenser projectiles keep their existing damage', async () => {
  const { Room } = await import('../../shared/sim/Room.mjs');
  const { restlessnessStep } = await import('../../shared/sim/restlessDayMode.mjs');
  for (const [kind, prior, amount] of [['downstroke',0,40], ['sweep',2,32], ['coin',3,16]]) {
    const room = new Room('STATUE', { mode:'RESTLESS_DAY', worldId:'restless-day' });
    const player = room.addPlayer({ id:'p', token:'p', name:'Knight', team:'ATTACKERS' }, 0);
    room.startMatch(1);
    room.restlessDay.phase = 2;
    const renowner = room.restlessDay.renowner;
    renowner.nextAttackAt = 2;
    renowner.attacksMade = prior;
    player.position = { x:0, y:0, z:kind === 'sweep' ? 48.8 : 50.2 };
    const hits = [];
    const damage = (_room, _attacker, target, amount, source) => hits.push({target, amount, source});
    for (let i = 0; i < 65; i++) restlessnessStep(room, 1/30, 2 + i/30, {damage});
    assert.deepEqual(hits, [{target:player.id, amount, source:kind === 'coin' ? 'renowner-coin' : 'renowner-sword'}]);
  }
});
