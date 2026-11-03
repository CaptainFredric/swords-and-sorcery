import {chivalryParries} from '../src/ultimates.mjs';
import {postureOf} from '../src/body.mjs';
import {GAME} from '../src/combat.mjs';
import {orientedBoxHit} from '../src/orientedBox.mjs';

export function frostGuardFaces(victim, point, velocity, direct, arcDeg) {
 if(!victim.guarding||!(victim.guardStamina>0))return false;
 const dx=direct?-velocity.x:point.x-victim.position.x,dz=direct?-velocity.z:point.z-victim.position.z;
 const length=Math.hypot(dx,dz);if(length<1e-9)return false;
 return (-Math.sin(victim.yaw)*dx-Math.cos(victim.yaw)*dz)/length>=Math.cos(arcDeg*Math.PI/360)-1e-9;
}

// Melee uses a facing cone. A projectile parry also has to sweep through the
// raised Guard's frontal torso region, scaled with the ordinary crouched posture.
export function frostParryContact(victim, projectile, start, end, now, arcDeg) {
 const automatic=chivalryParries(victim,now,{x:-projectile.velocity.x,z:-projectile.velocity.z});
 const age=automatic?0:(now-victim.guardStartedAt)*1000;
 if(!(age>=0&&age<=GAME.parryWindowMs)||!frostGuardFaces(automatic?{...victim,guarding:true}:victim,start,projectile.velocity,true,arcDeg))return null;
 const s=Math.sin(victim.yaw),c=Math.cos(victim.yaw),height=postureOf(victim).height;
 return orientedBoxHit([start.x,start.y,start.z],[end.x,end.y,end.z],{
  center:[victim.position.x-s*.36,victim.position.y+height*.625,victim.position.z-c*.36],
  axes:[[c,0,-s],[0,1,0],[s,0,c]],size:[.76,height*.5,.25],
 },projectile.radius??0);
}
