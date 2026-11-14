import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIEGE_PREVIEW_LENGTH,SIEGE_PREVIEW_MACHINE,workshopPreviewPose,
  workshopPreviewShots,workshopPreviewTargets,workshopPreviewTargetPose,
  workshopPreviewDone,workshopPreviewImpacts,
} from './siegeWorkshopPreviewPlan.mjs';

const SKILLS=[
  'longArmToTheJaw','beatToThePunch','hellpingHand','ramFingerFlick',
  'coldHowTouching','boltToTheOccasion',
  'doNotStopMyAscension','narrowToOne','fireAwayRightHere',
];

test('every siege Skill and independently previewable Finger Flick has an exhibition',()=>{
  assert.deepEqual(Object.keys(SIEGE_PREVIEW_LENGTH).sort(),SKILLS.slice().sort());
  assert.deepEqual(Object.keys(SIEGE_PREVIEW_MACHINE).sort(),SKILLS.slice().sort());
  for(const skill of SKILLS){
    const p=workshopPreviewPose(skill,0);
    assert.equal(p.x,0);
    assert.equal(p.y,0);
    assert.ok(Math.abs(p.z)<1e-10);
    assert.ok(SIEGE_PREVIEW_LENGTH[skill]>3);
  }
  assert.equal(workshopPreviewDone('longArmToTheJaw',100),false,
    'the detached ram fist holds until stopped or replayed');
});

test('Long Arm extends and stays out; Beat to the Punch shudders, reverses, hits and resets',()=>{
  assert.equal(workshopPreviewPose('longArmToTheJaw',0).fist,0);
  assert.equal(workshopPreviewPose('longArmToTheJaw',1.5).fist,1);
  assert.equal(workshopPreviewPose('longArmToTheJaw',20).fist,1);
  assert.ok(workshopPreviewPose('beatToThePunch',.4).shudder>0);
  assert.ok(workshopPreviewPose('beatToThePunch',1.9).z< -2);
  assert.ok(workshopPreviewPose('beatToThePunch',2.7).fist>.9);
  assert.ok(workshopPreviewTargetPose('beatToThePunch',3.3,0).z>1);
  assert.ok(Math.abs(workshopPreviewPose('beatToThePunch',5.4).z)<.01);
});

test('Argon HELLping and Finger Flick are distinct actual visual sequences, not placeholder attacks',()=>{
 assert.equal(SIEGE_PREVIEW_MACHINE.hellpingHand,'soFist');
 assert.equal(SIEGE_PREVIEW_MACHINE.ramFingerFlick,'soFist');
 assert.equal(workshopPreviewTargets('hellpingHand').length,2);
 assert.equal(workshopPreviewTargets('ramFingerFlick').length,1);
 assert.equal(workshopPreviewDone('hellpingHand',12),false);
 assert.equal(workshopPreviewDone('hellpingHand',15.3),true);
 assert.equal(workshopPreviewDone('ramFingerFlick',4),true);
 assert.ok(workshopPreviewTargetPose('ramFingerFlick',1.2,0).fall>.9);
 assert.ok(workshopPreviewTargetPose('hellpingHand',5.5,0).fall>.9);
});
test('ballista frost burst is a near miss and mobile Bolt II demonstrably fires before Bolt I',()=>{
  const frost=workshopPreviewShots('coldHowTouching');
  assert.equal(frost.length,1);
  assert.equal(frost[0].kind,'frost');
  assert.equal(frost[0].nearMiss,true);
  const shots=workshopPreviewShots('boltToTheOccasion');
  assert.deepEqual(shots.map(s=>s.kind),['heavy','frost']);
  assert.ok(shots[0].at<shots[1].at);
  assert.ok(workshopPreviewPose('boltToTheOccasion',.8).z>0);
  assert.equal(workshopPreviewTargets('boltToTheOccasion').length,2);
});

test('Do Not Stop My Ascension loops, crashes into a trio and stays defeated; Narrow circles a guarding rival',()=>{
  const mid=workshopPreviewPose('doNotStopMyAscension',2.2);
  assert.ok(mid.y>1);
  assert.ok(mid.pitch>Math.PI*.2 && mid.pitch<Math.PI*2);
  const dive=workshopPreviewPose('doNotStopMyAscension',5.4);
  assert.ok(dive.z < -7, 'the machine dives into the formation after looping');
  assert.equal(workshopPreviewTargets('doNotStopMyAscension').length,3);
  for(let i=0;i<3;i++) {
    assert.equal(workshopPreviewTargetPose('doNotStopMyAscension',6.4,i).fall,1);
    assert.equal(workshopPreviewTargetPose('doNotStopMyAscension',200,i).fall,1);
  }
  assert.equal(workshopPreviewDone('doNotStopMyAscension',200),false,
    'the crash persists until the exhibition is closed or replayed');
  const circle=workshopPreviewPose('narrowToOne',2.5);
  assert.ok(Math.hypot(circle.x,circle.z)>1);
  assert.ok(workshopPreviewTargetPose('narrowToOne',2.1,0).guard);
  assert.ok(!workshopPreviewTargetPose('narrowToOne',5.3,0).guard);
  const shots=workshopPreviewShots('narrowToOne');
  assert.equal(shots.length,18);
  assert.ok(shots.some(shot=>shot.lowShot));
});

test('workshop impact presentation matches the actual authored skill sequences',()=>{
  assert.equal(workshopPreviewImpacts('longArmToTheJaw').length,0,
    'Long Arm holds its fist out rather than faking an unrelated impact');
  assert.equal(workshopPreviewImpacts('beatToThePunch')[0].type,'ram');
  assert.equal(workshopPreviewImpacts('coldHowTouching')[0].type,'frost');
  const ballista=workshopPreviewImpacts('boltToTheOccasion');
  assert.deepEqual(ballista.map(cue=>cue.type),['bolt','frost']);
  const shots=workshopPreviewShots('boltToTheOccasion');
  assert.ok(ballista[0].at>shots[0].at);
  assert.ok(ballista[1].at>shots[1].at);
  assert.equal(workshopPreviewImpacts('doNotStopMyAscension')[0].at,5.55);
  assert.equal(workshopPreviewImpacts('narrowToOne').length,1);
  assert.equal(workshopPreviewImpacts('fireAwayRightHere').length,3);
});

test('Fire Away sustains repeater over three separate target lanes then lands',()=>{
  const shots=workshopPreviewShots('fireAwayRightHere');
  assert.equal(shots.length,27);
  assert.deepEqual([...new Set(shots.map(s=>s.target))],[0,1,2]);
  assert.equal(workshopPreviewTargets('fireAwayRightHere').length,3);
  assert.ok(shots.at(-1).at-shots[0].at>3);
  assert.ok(workshopPreviewPose('fireAwayRightHere',1.3).y>4.5);
  assert.equal(workshopPreviewPose('fireAwayRightHere',2.5).y,0,
    'the machine lands before the repeater barrage starts');
  assert.ok(shots[0].at>2.5);
  assert.equal(workshopPreviewPose('fireAwayRightHere',8.2).y,0);
  for(let i=0;i<3;i++)assert.equal(workshopPreviewTargetPose('fireAwayRightHere',7.9,i).fall,1);
});
