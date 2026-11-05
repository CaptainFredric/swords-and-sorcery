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
