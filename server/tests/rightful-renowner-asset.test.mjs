import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { restlessRenownerBlade, restlessRenownerMouth, RENOWNER_SWORD_LENGTH, RESTLESS_RENOWNER_SCALE, RESTLESS_RENOWNER_SWORD_SCALE } from '../../shared/worlds/renownerGeometry.mjs';

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

test('both combat strikes follow a rigid sword with one fixed proportional scale', () => {
  const renowner = { position:{x:0,y:1.4,z:56}, yaw:Math.PI, attack:{type:'downstroke',contactAt:10} };
  const length = RENOWNER_SWORD_LENGTH * RESTLESS_RENOWNER_SCALE * RESTLESS_RENOWNER_SWORD_SCALE;
  for (const type of ['downstroke','sweep']) {
    renowner.attack.type=type;
    for (let t=9;t<=11;t+=.01) {
      const {a,b}=restlessRenownerBlade(renowner,t);
      assert.ok(Math.abs(Math.hypot(...b.map((v,i)=>v-a[i]))-length)<1e-9);
      assert.ok(b[1]>1.4, 'steel stays above the solid podium');
      assert.ok(Math.hypot(b[0],b[2]-56)<3.1, 'distant invisible reach must be removed');
    }
  }
  const left = restlessRenownerBlade(renowner, 10);
  const right = restlessRenownerBlade(renowner, 10.25);
  assert.ok(left.b[0] > 2 && right.b[0] < -2);
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
    if(kind==='coin') player.position={x:0,y:0,z:50.2};
    else {
      const segment=restlessRenownerBlade({...renowner,attack:{type:kind,contactAt:3.05}},3.05);
      player.position={x:segment.b[0],y:1.4,z:segment.b[2]};
    }
    const hits = [];
    const damage = (_room, _attacker, target, amount, source) => hits.push({target, amount, source});
    for (let i = 0; i < 65; i++) restlessnessStep(room, 1/30, 2 + i/30, {damage});
    assert.deepEqual(hits, [{target:player.id, amount, source:kind === 'coin' ? 'renowner-coin' : 'renowner-sword'}]);
  }
});

test('a distant opponent receives no phantom sword hit from the former stretched blade', async () => {
  const { Room } = await import('../../shared/sim/Room.mjs');
  const { restlessnessStep } = await import('../../shared/sim/restlessDayMode.mjs');
  const room=new Room('FAR',{mode:'RESTLESS_DAY',worldId:'restless-day'});
  const p=room.addPlayer({id:'p',token:'p',name:'Knight',team:'ATTACKERS'},0);
  room.startMatch(1);room.restlessDay.phase=2;
  room.restlessDay.renowner.nextAttackAt=2;
  p.position={x:0,y:0,z:50.2};
  const hits=[];
  for(let i=0;i<65;i++)restlessnessStep(room,1/30,2+i/30,{damage:(...args)=>hits.push(args)});
  assert.deepEqual(hits,[]);
});
