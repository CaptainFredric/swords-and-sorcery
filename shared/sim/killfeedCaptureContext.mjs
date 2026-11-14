// Server-only evidence for a particularly unwise pursuit away from a live
// capture circle. A death alone never proves that the knight abandoned one.
import {areAllies} from '../src/teams.mjs';

export function trackCircleChase(room,player,{id,position,radius,verticalBelow=.6,verticalAbove=1.8},nowSec,{eligible=true}={}){
 if(!player?.alive||!eligible)return;
 const key=`${room.mode}:${id}`;
 const dx=player.position.x-position.x,dz=player.position.z-position.z;
 const inside=dx*dx+dz*dz<=radius*radius &&
   player.position.y>=position.y-verticalBelow &&
   player.position.y<=position.y+verticalAbove;
 const slots=player.killfeedInsideCircles??={};
 const prior=slots[key];
 slots[key]=inside;
 if(inside && player.killfeedCircleChase?.key===key)player.killfeedCircleChase=null;
 if(prior!==true||inside)return;
 // The player just LEFT the point. Only a real outward chase toward a
 // low-health ENEMY (not a retreat, objective rotation, or enemy already
 // inside the capture circle) qualifies for the subsequent epitaph.
 const speed=Math.hypot(player.velocity?.x??0,player.velocity?.z??0);
 if(speed<.45)return;
 for(const enemy of room.players.values()){
   if(!enemy.alive||enemy.id===player.id||areAllies(room,enemy.id,player.id)||
     enemy.team===player.team||enemy.health>(enemy.maxHealth??100)*.35)continue;
   const ex=enemy.position.x-player.position.x,ez=enemy.position.z-player.position.z;
   const distance=Math.hypot(ex,ez)||1;
   const fromCenter=Math.hypot(enemy.position.x-position.x,enemy.position.z-position.z);
   const toward=((player.velocity?.x??0)*ex+(player.velocity?.z??0)*ez)/(speed*distance);
   if(distance<=10&&fromCenter>radius&&toward>.35){
     player.killfeedCircleChase={key,at:nowSec,enemyId:enemy.id};
     return;
   }
 }
}
