import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPredictedPose, predictedPoseAt } from './predictedPoseHistory.mjs';

test('old authoritative snapshot is compared to matching predicted time, not current fast stride', () => {
  const poses=[];
  for(let i=0;i<20;i++){
    const at=20+i/60, x=(at-20)*7.5;
    recordPredictedPose(poses,at,{x,y:0,z:0});
  }
  const snapshotTime=20+10/60;
  const oldPosition=predictedPoseAt(poses,snapshotTime);
  assert.ok(Math.abs(oldPosition.x - 1.25) < 1e-7);
  assert.ok(Math.abs(poses.at(-1).position.x-oldPosition.x)>1,'normal packet delay is not a physics error');
  assert.equal(predictedPoseAt(poses,21),null,'never invent movement for time beyond history');
});

test('history bounds its memory and refuses stale epochs, jumps and impossible transforms', () => {
  const poses=[];
  for(let i=0;i<120;i++)recordPredictedPose(poses,i/60,{x:i/60,y:0,z:0});
  assert.ok(poses.length<55,'only recent predictions retained');
  assert.equal(predictedPoseAt(poses,0),null,'stale authoritative times are not compared to live prediction');
  recordPredictedPose(poses,0,{x:0,y:0,z:0});
  assert.equal(poses.length,1,'server restart resets history');
  recordPredictedPose(poses,0.01,{x:Infinity,y:0,z:0});
  assert.equal(poses.length,1,'invalid physics is not stored');
});

test('30 Hz snapshots between 60 Hz render frames compare against extrapolated same-time movement', () => {
  const poses=[];
  for(let i=0;i<3;i++) recordPredictedPose(poses,100+i/60,{x:i*.125,y:0,z:0});
  const snapshot=predictedPoseAt(poses,100+3/60);
  assert.ok(snapshot,'next server tick is within 1 render interval of prediction');
  assert.ok(Math.abs(snapshot.x-.375)<1e-7,'do not invent a .125 m drift from packet arrival');
  assert.equal(predictedPoseAt(poses,100+.2),null,'never extrapolate over real network stalls');
});

test('one prediction sample cannot extrapolate an unknown Dash or knockback trajectory', () => {
 const poses=[];
 recordPredictedPose(poses,5,{x:1,y:0,z:0});
 assert.equal(predictedPoseAt(poses,5.025),null);
});
