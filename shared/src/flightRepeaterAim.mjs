// Shared, authoritative fit of the v2.6 crossbow pivot and named muzzle.
// All positions are in metres. Crossbow local +Z fires forward; the authored
// model first pitches with the flight run, then rotates with the machine heading.
export const FLIGHT_REPEATER=Object.freeze({capacity:14,production:2,fireRate:7,speed:64,
  lifespan:2.4,falloff:22,closeDamage:4,farDamage:2,guardStamina:8,guardArc:100,
  maxTraverse:Math.PI*25/180,maxPitch:Math.PI*20/180,minPitch:-Math.PI*20/180,radius:.065});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
const rootPitch=m=>Number.isFinite(m.runPitch)?m.runPitch:0;
function localYaw(m,yaw){
  return clamp(angle(yaw-(m.heading??0)),-FLIGHT_REPEATER.maxTraverse,FLIGHT_REPEATER.maxTraverse);
}
/** Aim in joint-local coordinates. World pitch is compensated for real run tilt
 * only as far as the authored turret permits; a committed dive must aim down. */
export function flightRepeaterAim(m,input={}){
  const facing=m.heading??0,requestedYaw=Number.isFinite(input.yaw)?input.yaw:facing;
  const yaw=facing+localYaw(m,requestedYaw);
  const wanted=Number.isFinite(input.pitch)?input.pitch:0;
  const pitch=clamp(wanted+rootPitch(m),FLIGHT_REPEATER.minPitch,FLIGHT_REPEATER.maxPitch);
  return {yaw,pitch:m.terminalDive?Math.min(pitch,-Math.min(.34,Math.max(.18,rootPitch(m)*.55))):pitch};
}
function transform(m,x,y,z){
  const pitch=rootPitch(m),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const ry=y*cp-z*sp,rz=y*sp+z*cp;
  const c=Math.cos(m.heading??0),s=Math.sin(m.heading??0);
  return {x:-(x*c+rz*s),y:ry,z:x*s-rz*c};
}
/** Position of the GLB muzzle after crossbow yaw, pitch and root run pitch. */
export function flightMuzzle(m,{yaw=m.heading??0,pitch=0}={}){
  const rel=localYaw(m,yaw),p=clamp(pitch,FLIGHT_REPEATER.minPitch,FLIGHT_REPEATER.maxPitch);
  // Crossbow_Body pivot [+.65,+1.05,+.22]; muzzle [0,+.048,+.585].
  // Authored Euler YXZ applies crossbow-local pitch before traverse yaw.
  const along=-.048*Math.sin(p)+.585*Math.cos(p);
  const offset=transform(m,.65+along*Math.sin(rel),
    1.05+.048*Math.cos(p)+.585*Math.sin(p),.22+along*Math.cos(rel));
  return {x:m.x+offset.x,y:m.y+offset.y,z:m.z+offset.z};
}
/** Unit launch vector from the SAME articulated transform as flightMuzzle. */
export function flightDirection(m,{yaw=m.heading??0,pitch=0}={}){
  const rel=localYaw(m,yaw),p=clamp(pitch,FLIGHT_REPEATER.minPitch,FLIGHT_REPEATER.maxPitch);
  return transform(m,Math.sin(rel)*Math.cos(p),Math.sin(p),Math.cos(rel)*Math.cos(p));
}
