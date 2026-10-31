import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../../shared/sim/RoomManager.mjs';
import {stepRoom} from '../../shared/sim/combat.mjs';
import {practiceSiegeCommand} from '../../shared/sim/practiceSiege.mjs';
import {mountBiByeLlista} from '../../shared/sim/biByeLlista.mjs';

test('Castleward Practice walks from genuine spawn into a newly-built ballista, installing chosen Cold Skill',()=>{
 const room=new RoomManager().createSoloRoom('PRACTICE',0,'castleward');
 room.state='PLAYING';
 const p=room.addPlayer({id:'walker',token:'walker',name:'Operator',siegeLoadout:{biBye:'coldHowTouching'}},0);
 assert.deepEqual(practiceSiegeCommand(room,p,'build','bi-bye-llista',1),{});
 const b=room.biByeLlista;assert.ok(b);
 const start={...p.position};
 const yaw=Math.atan2(-(b.x-p.position.x),-(b.z-p.position.z));
 p.yaw=yaw;p.input={...p.input,forward:1,right:0,sprint:false,crouch:false,jump:false,yaw,pitch:0};
 for(let i=0;i<240;i++)stepRoom(room,1/30,1+(i+1)/30,room.world);
 const remaining=Math.hypot(p.position.x-b.x,p.position.z-b.z);
 assert.ok(remaining<=b.interactRadius,'genuine movement could not reach mount: '+JSON.stringify({start,at:p.position,machine:{x:b.x,z:b.z,heading:b.heading},remaining,allowed:b.interactRadius}));
 assert.equal(mountBiByeLlista(b,p,10),true);
 assert.equal(b.skill.id,'coldHowTouching');
});
