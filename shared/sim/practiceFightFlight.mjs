// Practice-only construction and lifecycle; no rewards, no competitive spawn.
import {createFightFlight,dismountFightFlight,fightFlightExit} from './fightFlight.mjs';
import {resolvePlayerWorld,surfaceHeightAt} from '../src/collision.mjs';
import {getBiByeSolids} from './biByeLlista.mjs';
import {soFistSolids} from './soFistGeometry.mjs';
const clear=(room,p,ignoreId)=> {
  const solids=[...(room.world.solids??[]),...getBiByeSolids(room.biByeLlista),...soFistSolids(room.soFistication)];
  const q=resolvePlayerWorld(p,.9,solids,2.65);
  return Math.hypot(q.x-p.x,q.z-p.z)<.015 &&
    ![...room.players.values()].some(a=>a.alive&&a.id!==ignoreId&&Math.hypot(a.position.x-p.x,a.position.z-p.z)<2);
};
export function practiceFightFlight(room,player,action,now){
  if(room.mode!=='PRACTICE'||room.state!=='PLAYING'||!player?.alive||player.actorKind!=='human'||room.players.get(player.id)!==player)
    return {rejected:'Fight-and-Flight can be built by a living Spellblade in Practice.'};
  const old=room.fightFlight;
  if(action==='build'&&old)return {rejected:'Rebuild or dismantle the existing apparatus.'};
  if(action!=='build'&&!old)return {rejected:'Build Fight-and-Flight first.'};
  if(old?.operatorId&&old.operatorId!==player.id)return {rejected:'Another operator is flying this apparatus.'};
  let exit=null,body=null;
  if(old?.operatorId){
    exit=fightFlightExit(room,old,player);
    if(!exit)return {rejected:'Land on supported open ground before rebuilding or dismantling.'};
  }
  if(action!=='dismantle'){
    const heading=old?.heading??player.yaw??0;
    const anchor=old??{x:player.position.x,y:player.position.y,z:player.position.z};
    const distances=old?[0,1.5,2.5,4]:[4.5,5.5,6.5];
    for(const d of distances){
      for(const side of [0,-2,2,-3,3]){
        const x=old?anchor.x+Math.cos(heading)*side:anchor.x-Math.sin(heading)*d+Math.cos(heading)*side;
        const z=old?anchor.z-Math.sin(heading)*side:anchor.z-Math.cos(heading)*d-Math.sin(heading)*side;
        const y=surfaceHeightAt(x,z,anchor.y+1.4,room.world);
        if(y===null||Math.abs(y-anchor.y)>1.4)continue;
        const p={x,y,z};if(!clear(room,p,old?.operatorId))continue;
        const temp=createFightFlight({...p,heading});
        // A mountable machine must have room to dismount again.
        if(!fightFlightExit(room,temp,player))continue;
        body=temp;break;
      }
      if(body)break;
    }
    if(!body)return {rejected:'No clear and supported construction site. Move into open ground.'};
  }
  if(old?.operatorId)dismountFightFlight(room,old,player,{force:true,exit,at:now});
  if(old){old.retired=true;old.mode='DESTROYED';old.operatorId=null;}
  room.fightFlightRevision=(room.fightFlightRevision??0)+1;
  if(action==='dismantle'){
    old.retired=true;old.mode='DESTROYED';old.operatorId=null;room.fightFlight=null;
    room.events.push({type:'fightFlightDismantled',machineId:old.id,at:now});
    return {};
  }
  body.id='fight-flight-'+room.code+'-'+room.fightFlightRevision;body.lifecycleId=body.id;
  body.team=player.team;body.builtAt=now;room.fightFlight=body;
  room.events.push({type:'fightFlightConstructed',machineId:body.id,rebuild:Boolean(old),point:{x:body.x,y:body.y,z:body.z},at:now});
  return {};
}
