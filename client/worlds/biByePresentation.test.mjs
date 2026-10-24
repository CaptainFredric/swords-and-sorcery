import test from 'node:test';
import assert from 'node:assert/strict';
import { biByeUpperAnimation, biByeClutchAnimation, biByeDelayAnimation, biByeTrackOwner, biByeAnimation, biByeWheelSteering, biByeWheelTravel } from './biByePresentation.mjs';

test('spent state retains the firing recovery until its authored completion event', () => {
  const b = { mode: 'DEPLOYED', state: 'SPENT', firedAt: 10, mainReleasedAt:10.65, reloadStartedAt: 12.2 };
  assert.equal(biByeAnimation(b, 10.8).name, '21_BiBye_Delayed_Shot2_Release_And_Recoil');
  assert.equal(biByeAnimation(b, 12.19).name, '21_BiBye_Delayed_Shot2_Release_And_Recoil');
  assert.equal(biByeAnimation({ ...b, state: 'RELOADING' }, 12.2).time, 0);
  assert.equal(biByeAnimation({ ...b, state: 'RELOADING' }, 15.2).time, 3);
});
test('late snapshots and repeated volleys seek their own authoritative action clock', () => {
  const b={mode:'DEPLOYED',state:'SPENT',firedAt:11,mainReleasedAt:11.65};
  assert.equal(biByeAnimation(b,11.85).time.toFixed(1),'0.2');
  assert.equal(biByeAnimation({...b,firedAt:20,mainReleasedAt:20.65},20.75).time.toFixed(1),'0.1');
});
test('mobile recock uses the upper layer and actual discharge deadline',()=>{
 const b={mode:'MOBILE',state:'LOADED',upperFiredAt:4,upperShotKind:'independent',smallBoltReadyAt:6.7};
 assert.equal(biByeAnimation(b,4.3).name,'06_BiBye_Travel_Ready');
 assert.equal(biByeUpperAnimation(b,4.3).name,'09_BiBye_Mobile_Shot1_Fire_Upper');
 assert.equal(biByeUpperAnimation(b,5).name,'10_BiBye_Mobile_Shot1_Reload_Upper');
 assert.equal(biByeUpperAnimation(b,6.7).name,'01_BiBye_LoadedIdle_Upper');
});
test('destroyed animation reaches its stable terminal pose', () => {
  assert.deepEqual(biByeAnimation({ mode: 'DESTROYED', destroyedAt: 2 }, 10), { name: '12_BiBye_Damaged_Destroyed', time: 1.8 });
});
test('wheel steering gives inner and outer wheels different angles with correct countersteer', () => {
  const right = biByeWheelSteering(1);
  assert.ok(right[1] < right[0] && right[0] < 0);
  assert.ok(right[5] > right[4] && right[4] > 0);
  assert.deepEqual(biByeWheelSteering(0), [0, 0, 0, 0, 0, 0]);
});
test('each wheel rolls from its own signed ground travel and holds when stationary', () => {
  const a = { x: 0, z: 0, heading: 0 };
  const straight = biByeWheelTravel(a, { ...a, z: -.55 }, biByeWheelSteering(0));
  for (const roll of straight) assert.ok(Math.abs(roll - 1) < 1e-8);
  for (const roll of biByeWheelTravel(a, a, biByeWheelSteering(1))) assert.equal(Math.abs(roll), 0);
  const turn = biByeWheelTravel(a, { x: .005, z: -.1, heading: -.025 }, biByeWheelSteering(1));
  assert.ok(turn[0] < turn[1]);
});

test('upper recoil and recock remain independent of the main reload action',()=>{
 const b={mode:'DEPLOYED',state:'RELOADING',reloadStartedAt:2.2,upperFiredAt:3,upperShotKind:'independent',smallBoltReadyAt:5.7};
 assert.equal(biByeAnimation(b,3.3).name,'19_BiBye_Main_Winch_Reload_Only');
 assert.equal(biByeUpperAnimation(b,3.3).name,'09_BiBye_Mobile_Shot1_Fire_Upper');
 assert.equal(biByeUpperAnimation(b,4).name,'10_BiBye_Mobile_Shot1_Reload_Upper');
 assert.equal(biByeUpperAnimation(b,5.7).name,'01_BiBye_LoadedIdle_Upper');
});

test('clutch layers seek engagement, partial cancellation and complete uncoupling',()=>{
 assert.equal(biByeClutchAnimation({coupling:'INDEPENDENT'},4).time,.6);
 assert.deepEqual(biByeClutchAnimation({coupling:'ENGAGING',couplingStartedAt:2},2.3),{name:'17_BiBye_Upper_Align_And_Couple_Clutch',time:2.3-2});
 assert.equal(biByeClutchAnimation({coupling:'RELEASING',couplingStartedAt:4,couplingReleaseFrom:.5},4).time,.3);
 assert.equal(biByeTrackOwner('Upper_Turret_Mount.quaternion'),'Aim');
 assert.equal(biByeTrackOwner('Coupling_Clutch_Collar.position'),'Clutch');
 assert.equal(biByeTrackOwner('Winch_Drum_And_Cranks.quaternion'),'Main');
 assert.equal(biByeTrackOwner('Wheel_FL_Damaged.scale'),'Components');
 assert.equal(biByeDelayAnimation({firedAt:2,upperShotKind:'coupled'},2.6).name,'20_BiBye_Coupled_Shot1_Trigger_And_Delay_Delay');
});

test('conditioning bolt stays in its authored rail pose throughout reload',()=>{
 for(const prop of ['position','quaternion','scale'])assert.equal(biByeTrackOwner(`Upper_Conditioning_Bolt.${prop}`),'Aim');
});

test('a damage pulse affects only the struck part and expires without replaying late snapshots',async()=>{
 const {biByeDamageFlash:flash}=await import('./biByePresentation.mjs');
 assert.equal(typeof flash,'function');
 const b={lastHitAt:10,components:{Wheel_FL:{lastHitAt:11},Stabilizer_FR:{lastHitAt:12}}};
 assert.ok(flash(b,'Wheel_FL',11.03)>.4);assert.equal(flash(b,'hull',11.03),0);assert.equal(flash(b,'Stabilizer_FR',11.03),0);
 assert.equal(flash(b,'Wheel_FL',11.5),0);assert.equal(flash({lastHitAt:null,components:{}},'hull',0),0);
 assert.ok(flash(b,'Stabilizer_FR',12.02)>0);assert.ok(flash(b,'hull',10.02)>0);
});
test('clear sight returns to the exact preceding view on the next tap',async()=>{
 const {biByeViewAction:change}=await import('./biByePresentation.mjs');
 assert.equal(typeof change,'function');
 for(const view of ['third','sight']){
  const zoom=change({view},'zoom');assert.equal(zoom.view,'clear');assert.equal(change(zoom,'tap').view,view);
  assert.equal(change(change(zoom,'zoom'),'tap').view,view);
 }
 assert.equal(change({view:'third'},'tap').view,'sight');
});
