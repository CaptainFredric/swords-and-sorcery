import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceRemotePlaybackClock, appendRemoteSample, remoteSamplePair } from './remoteSnapshots.mjs';

const actor=x=>({alive:true,position:{x,y:0,z:0},yaw:0});
test('interpolation follows server timestamps despite irregular packet arrivals', () => {
  let history=[];
  history=appendRemoteSample(history,actor(0),10,1000);
  history=appendRemoteSample(history,actor(1),10+1/30,1090); // delayed 90ms
  history=appendRemoteSample(history,actor(2),10+2/30,1100); // burst arrives 10ms later
  const pair=remoteSamplePair(history,10+1.5/30);
  assert.ok(Math.abs(pair.t-.5)<1e-8);
  assert.equal(pair.a.player.position.x,1);
  assert.equal(pair.b.player.position.x,2);
  assert.equal(remoteSamplePair(history,11).b.player.position.x,2);
  assert.equal(remoteSamplePair(history,9).a.player.position.x,0);
});
test('playback clock never goes backward on delayed packets, but resets for a restarted host', () => {
  let at=advanceRemotePlaybackClock(null,20,0);
  const initial=at;
  for(let i=0;i<20;i++) {
    const latest=i<6?20+i/30:20+6/30;
    const next=advanceRemotePlaybackClock(at,latest,1/60);
    assert.ok(next>=at);
    at=next;
  }
  assert.ok(at>initial);
  assert.ok(at<=20+6/30);
  assert.ok(advanceRemotePlaybackClock(at,2,1/60)<3);
});
test('respawn discards old corpse positions and outdated network snapshots are ignored', () => {
  const alive=actor(10);
  let history=appendRemoteSample([],actor(0),5,100);
  history=appendRemoteSample(history,{...actor(1),alive:false},5.03,133);
  assert.equal(history.length,1);
  history=appendRemoteSample(history,alive,5.06,166);
  assert.equal(history.length,1);
  history=appendRemoteSample(history,actor(-200),5.00,190);
  assert.equal(history.at(-1).player.position.x,10);
});

test('extended packet loss catches playback up rather than leaving opponents seconds behind', () => {
  let clock=advanceRemotePlaybackClock(null,10,0);
  clock=advanceRemotePlaybackClock(clock,12,1/60);
  assert.ok(clock>11.8 && clock<12,'old interpolated pose no longer lingers for seconds');
  let history=appendRemoteSample([],actor(0),10,1000);
  history=appendRemoteSample(history,actor(15),12,3000);
  assert.equal(history.length,1,'never interpolate a player through unobserved walls');
});

test('teleport discontinuity resets history but a legitimate fast Dash remains continuous', () => {
  let history=appendRemoteSample([],actor(0),5,1000);
  history=appendRemoteSample(history,actor(1),5+1/30,1033);
  assert.equal(history.length,2);
  history=appendRemoteSample(history,actor(31),5+2/30,1066);
  assert.equal(history.length,1,'large single-tick displacement must not draw a cross-map slide');
  history=appendRemoteSample(history,actor(33),5+3/30,1099);
  assert.equal(history.length,2,'a fast ~60m/s Dash interval remains a continuous path');
});
