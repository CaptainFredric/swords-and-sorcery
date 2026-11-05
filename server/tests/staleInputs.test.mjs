import test from 'node:test';
import assert from 'node:assert/strict';
import { expireStaleMovementInputs, INPUT_LEASE_SEC } from '../src/staleInputs.mjs';
import {applyRoomCommand} from '../../shared/sim/wire.mjs';

function fixture() {
 const human={id:'human',actorKind:'human',operatingFlightId:null,alive:true,
   input:{forward:0,right:0,yaw:1.2,pitch:0,attack:true,guard:true},
   lastInputSeq:0};
 const bot={id:'bot',actorKind:'bot',input:{forward:1,right:.2,jump:false,sprint:true},lastMovementInputAt:0};
 return {human,bot,room:{players:new Map([['human',human],['bot',bot]])}};
}
test('several missed network movement heartbeats stop held run, Jump and machine drive', () => {
 const {room,human,bot}=fixture();
 applyRoomCommand(room,human,{type:'input',seq:9,forward:1,right:.5,jump:true,sprint:true,
   flightRise:true,ramRaise:true,yaw:1.2,attack:true,guard:true},1);
 assert.equal(human.lastMovementInputAt,1);
 assert.equal(expireStaleMovementInputs(room,1+INPUT_LEASE_SEC-.001),0);
 assert.equal(human.input.forward,1);
 assert.equal(expireStaleMovementInputs(room,1+INPUT_LEASE_SEC+.001),1);
 assert.equal(human.input.forward,0);
 assert.equal(human.input.right,0);
 assert.equal(human.input.jump,false);
 assert.equal(human.input.sprint,false);
 assert.equal(human.input.flightRise,false);
 assert.equal(human.input.ramRaise,false);
 assert.equal(human.input.attack,true,'do not modify separate combat action authority');
 assert.equal(human.input.guard,true);
 assert.equal(human.input.yaw,1.2,'preserve aim direction');
 assert.equal(human.lastInputSeq,9,'do not fabricate an acknowledged packet');
 assert.equal(bot.input.forward,1,'AI still steers its own body');
 assert.equal(expireStaleMovementInputs(room,10),0,'expiry happens once per stale interval');
 applyRoomCommand(room,human,{type:'input',seq:10,forward:-1,right:0,yaw:1.2},11);
 assert.equal(human.input.forward,-1,'fresh movement immediately resumes');
});

test('server timeout never changes a human who never supplied movement input',()=>{
 const {room,human}=fixture();
 assert.equal(expireStaleMovementInputs(room,500),0);
 assert.equal(human.input.forward,0);
});
