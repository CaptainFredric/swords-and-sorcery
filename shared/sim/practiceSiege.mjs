import {createBiByeLlista,dismountBiByeLlista,getBiByeSolids} from './biByeLlista.mjs';
import {biByeTerrainContext,biByeTerrainPose,biByeTerrainClear,biByeDeploymentSupport} from './biByeTerrain.mjs';
import {surfaceHeightAt,resolvePlayerWorld,segmentAabbHit} from '../src/collision.mjs';

const actorBoxes=(room,ignore)=>[...room.players.values()].filter(p=>p.alive&&p.id!==ignore).map(p=>({id:'actor-'+p.id,center:[p.position.x,p.position.y+.9,p.position.z],size:[.9,1.8,.9]}));
// Pure validation. No fallback coordinates and no mutation before a complete plan exists.
export function practiceBiByeExit(room,b,player,extraSolids=[]){
 const forward=[-Math.sin(b.heading),-Math.cos(b.heading)],right=[Math.cos(b.heading),-Math.sin(b.heading)];
 const solids=[...(room.world.solids??[]),...getBiByeSolids(b),...extraSolids,...actorBoxes(room,player.id)];
 for(const [back,side]of [[3,0],[2.8,0],[3,-1.8],[3,1.8],[2,-2.8],[2,2.8],[0,-3.5],[0,3.5]]){
  const x=b.x-forward[0]*back+right[0]*side,z=b.z-forward[1]*back+right[1]*side;
  const y=surfaceHeightAt(x,z,b.y+1,room.world);if(y===null||Math.abs(y-b.y)>1)continue;
  const p={x,y,z},resolved=resolvePlayerWorld(p,.45,solids,1.8);
  if(Math.hypot(resolved.x-x,resolved.z-z)<.015)return p;
 }
 return null;
}
function candidate(room,player,x,z,heading,old){
 const y=surfaceHeightAt(x,z,player.position.y+1.5,room.world);if(y===null)return null;
 const b=createBiByeLlista({x,y,z,baseYaw:heading});
 const ctx=biByeTerrainContext(room.world,b,actorBoxes(room,old?.operatorId));
 const pose=biByeTerrainPose(b,ctx);if(!pose)return null;Object.assign(b,pose,{terrainInitialized:true});
 if(!biByeTerrainClear(b,ctx)||!biByeDeploymentSupport(b,room.world).ok)return null;
 if(!old){
  const eye=[player.position.x,player.position.y+1.35,player.position.z],target=[x,b.y+1.3,z];
  if((room.world.solids??[]).some(s=>segmentAabbHit(eye,target,s)))return null;
 }
 if(!practiceBiByeExit(room,b,player))return null;
 const exit=old?.operatorId?practiceBiByeExit(room,old,player,getBiByeSolids(b)):null;
 if(old?.operatorId&&!exit)return null;
 return {b,exit};
}
function placement(room,player,old){
 const heading=old?.heading??player.yaw??0;
 if(old){
  const same=candidate(room,player,old.x,old.z,heading,old);if(same)return same;
  for(const radius of [1.5,3,4.5])for(let n=0;n<8;n++){
   const angle=n*Math.PI/4,found=candidate(room,player,old.x+Math.cos(angle)*radius,old.z+Math.sin(angle)*radius,heading,old);if(found)return found;
  }
 }else{
  for(const distance of [6,5,7])for(const offset of [0,.25,-.25,.5,-.5,.8,-.8]){
   const angle=heading+offset,found=candidate(room,player,player.position.x-Math.sin(angle)*distance,player.position.z-Math.cos(angle)*distance,heading,null);if(found)return found;
  }
 }
 return null;
}
function retire(room,b,player,exit){
 if(b.operatorId){dismountBiByeLlista(b,player);player.attackHeld=false;player.guardHeld=false;player.attackButton=false;player.guardButton=false;player.guarding=false;if(exit){player.position={...exit};player.velocity={x:0,y:0,z:0};player.input={forward:0,right:0,jump:false,yaw:player.yaw,pitch:0};}}
 // Administrative retirement cancels even a delay already committed by Shot I.
 Object.assign(b,{retired:true,mode:'DESTROYED',operatorId:null,pendingVolley:null,pendingIndependent:null,mobileShotPendingAt:null,firingOperatorId:null,coupling:'INDEPENDENT',state:'SPENT',firedAt:-Infinity,mainReleasedAt:null,upperReleasedAt:null,reloadStartedAt:-Infinity,reloadEndsAt:-Infinity,speed:0,steer:0});
 for(const [id,p]of room.bibyeProjectiles??[])if(p.ballistaId===b.id)room.bibyeProjectiles.delete(id);
}
export function practiceBiByeCommand(room,player,action,now){
 if(room?.mode!=='PRACTICE'||room.state!=='PLAYING'||!player?.alive||player.actorKind!=='human'||room.players.get(player.id)!==player)return {rejected:'Siege tools are available to living players in Practice.'};
 const old=room.biByeLlista;
 if(action==='build'&&old)return {rejected:'A Bi-Bye-llista already exists. Rebuild or dismantle it.'};
 if(action!=='build'&&!old)return {rejected:'Build a Bi-Bye-llista first.'};
 if(old?.operatorId&&old.operatorId!==player.id)return {rejected:'Another Spellblade is operating this machine.'};
 let plan=null,exit=null;
 if(action==='dismantle'){
  if(old.operatorId){exit=practiceBiByeExit(room,old,player);if(!exit)return {rejected:'No safe place to dismount. Move the machine onto open ground.'};}
 }else{
  plan=placement(room,player,old);if(!plan)return {rejected:'No clear, supported ground with safe access. Try a more open area.'};exit=plan.exit;
 }
 // All validation has succeeded. Removal/replacement is a single synchronous commit.
 if(old)retire(room,old,player,exit);
 room.biByeRevision=(room.biByeRevision??0)+1;
 if(action==='dismantle'){
  room.biByeLlista=null;room.events.push({type:'bibyeDismantled',ballistaId:old.id,at:now});
 }else{
  const b=plan.b;Object.assign(b,{id:`bibye-${room.code}-${room.biByeRevision}`,builtAt:now,smallBoltReadyAt:now});
  room.biByeLlista=b;room.bibyeProjectiles??=new Map();
  room.events.push({type:'bibyeConstructed',ballistaId:b.id,rebuild:Boolean(old),point:{x:b.x,y:b.y,z:b.z},at:now});
 }
 return {};
}
