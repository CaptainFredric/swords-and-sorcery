import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPredictSeparation, separationTickKey } from './separationCadence.mjs';
import { separateLocal } from '../../shared/src/separation.mjs';

const world={floors:[{id:'support',center:[0,-.1,0],size:[20,.2,20],y:0}],ramps:[],solids:[]};
test('high frame rates do not accumulate separation against the same server tick',()=>{
  const snapshot={roomCode:'ABCD2',matchStartedAt:4,tick:56};
  const position={x:0,y:0,z:0}, opponent=[{id:'other',x:.35,y:0,z:0}];
  let key=null;
  for(let frame=0;frame<8;frame++){
    if(shouldPredictSeparation(key,snapshot)){
      separateLocal(position,opponent,world);
      key=separationTickKey(snapshot);
    }
  }
  assert.ok(Math.abs(position.x+.2)<1e-9,
    'one server tick predicts half the overlap, not repeated 120-Hz pushes');
  // When the server has moved the opponent by its other half, separation
  // should not repeat even in the following authoritative tick.
  snapshot.tick=57;opponent[0].x=.55;
  assert.equal(shouldPredictSeparation(key,snapshot),true);
  separateLocal(position,opponent,world);
  assert.ok(Math.abs(position.x+.2)<1e-9);
});

test('separation keys reset on a new match or room, never on an extra render',()=>{
  const old={roomCode:'ABCD2',matchStartedAt:4,tick:1};
  const stamp=separationTickKey(old);
  assert.equal(shouldPredictSeparation(stamp,old),false);
  assert.equal(shouldPredictSeparation(stamp,{...old,tick:2}),true);
  assert.equal(shouldPredictSeparation(stamp,{...old,matchStartedAt:25}),true);
  assert.equal(shouldPredictSeparation(stamp,{...old,roomCode:'QWER2'}),true);
});
