import test from 'node:test';
import assert from 'node:assert/strict';
import { playerMovementWorld } from '../sim/playerMovementWorld.mjs';
import { resolvePlayerWorld } from './collision.mjs';

test('online and predicted foot solvers use the same siege chassis solids', () => {
  const base={solids:[],floors:[],ramps:[]};
  const flight={id:'test',x:0,y:0,z:0,mode:'GROUNDED'};
  const both=playerMovementWorld(base,{flight});
  assert.ok(both.solids.some(b=>b.id==='fight-flight-chassis-test'));
  const initial={x:0,y:0,z:0};
  const pushed=resolvePlayerWorld(initial,.45,both.solids);
  assert.ok(Math.hypot(pushed.x,pushed.z)>.5);
  assert.equal(base.solids.length,0,'do not mutate canonical world');
  assert.equal(playerMovementWorld(base).solids,base.solids);
});


test('wire-format ballista snapshot generates the same occupied solids as the server machine', async () => {
  const { Room } = await import('../sim/Room.mjs');
  const { serializeSnapshot } = await import('../sim/wire.mjs');
  const { createBiByeLlista } = await import('../sim/biByeLlista.mjs');
  const room=new Room('TEST3',{mode:'PRACTICE',worldId:'castleward'});
  room.biByeLlista=createBiByeLlista({x:0,y:0,z:0,id:'regression-ballista'});
  const snapshot=serializeSnapshot(room,1);
  const server=playerMovementWorld(room.world,{ballista:room.biByeLlista});
  const client=playerMovementWorld(room.world,{ballista:snapshot.bibyeBallista});
  assert.equal(server.solids.length,client.solids.length);
  const original=server.solids.slice(room.world.solids.length);
  const predicted=client.solids.slice(room.world.solids.length);
  for(let i=0;i<original.length;i++) {
    assert.deepEqual(predicted[i].center,original[i].center);
    assert.deepEqual(predicted[i].size,original[i].size);
  }
});
