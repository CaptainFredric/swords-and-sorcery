import test from 'node:test';
import assert from 'node:assert/strict';
import {movementIntentDuringRenderStall} from '../../client/game/renderStallSafety.mjs';
import {expireStaleMovementInputs,INPUT_LEASE_SEC} from '../src/staleInputs.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';

// End-to-end contract between the independent browser heartbeat and the
// authoritative fixed-tick input lease. A healthy WebGL frame may initiate W;
// the server must NOT continue that sprint blindly after rendered frames stop.
function roomFixture() {
 const player={id:'P',actorKind:'human',alive:true,input:{forward:0,right:0,yaw:0},lastInputSeq:0};
 return {player,room:{players:new Map([['P',player]])}};
}
function send(room,player,seq,t,nowMs,renderAtMs) {
 const wanted=movementIntentDuringRenderStall({
   forward:1,right:0,jump:false,sprint:true,yaw:0,pitch:0,attack:false,guard:false,
 },nowMs,renderAtMs);
 applyRoomCommand(room,player,{type:'input',seq,...wanted},t);
 return wanted;
}
test('render-stalled online heartbeat goes neutral instead of renewing blind sprint',()=>{
 const {room,player}=roomFixture();
 send(room,player,1,1,1000,990);
 assert.equal(player.input.forward,1);
 send(room,player,2,1.05,1050,990);
 assert.equal(player.input.forward,1);
 const frozen=send(room,player,3,1.3,1300,990);
 assert.equal(frozen.forward,0);
 assert.equal(player.input.forward,0,'fresh safety heartbeat must explicitly stop locomotion');
 assert.equal(player.lastMovementInputAt,1.3,'neutral packet counts as a fresh input');
 assert.equal(expireStaleMovementInputs(room,1.4),0,'lease is not needed if neutral packets arrive');
 assert.equal(player.input.forward,0);
 send(room,player,4,1.8,1800,990);
 assert.equal(player.input.forward,0);
 send(room,player,5,1.9,1900,1890);
 assert.equal(player.input.forward,1,'healthy rendering immediately resumes intended movement');
});
test('if both frames and timers stop, server lease still prevents infinite held W',()=>{
 const {room,player}=roomFixture();
 send(room,player,1,1,1000,990);
 assert.equal(expireStaleMovementInputs(room,1+INPUT_LEASE_SEC+.01),1);
 assert.equal(player.input.forward,0);
});
