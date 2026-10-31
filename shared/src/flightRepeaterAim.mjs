// Shared, authoritative v2.7 crossbow: GLB joints 50 -> 51 -> 12 -> 38.
// All positions are in metres. Crossbow local +Z fires forward; the authored
// model first pitches with the flight run, then rotates with the machine heading.
export const FLIGHT_REPEATER=Object.freeze({capacity:18,production:2,fireRate:7,speed:64,
  lifespan:2.4,falloff:22,closeDamage:4,farDamage:2,guardStamina:8,guardArc:100,
  maxTraverse:Math.PI*50/180,maxPitch:Math.PI*65/180,minPitch:-Math.PI*65/180,radius:.065});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
const rootPitch=m=>Number.isFinite(m?.runPitch)?m.runPitch:0;
function localYaw(m,yaw){
  return clamp(angle(yaw-(m?.heading??0)),-FLIGHT_REPEATER.maxTraverse,FLIGHT_REPEATER.maxTraverse);
}
export function inverseTransform(m,wx,wy,wz){
  const c=Math.cos(m?.heading??0),s=Math.sin(m?.heading??0);
  const x=-wx*c+wz*s,rz=-wx*s-wz*c;
  const pitch=rootPitch(m),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const y=wy*cp+rz*sp,z=-wy*sp+rz*cp;
  return {x,y,z};
}
export function solveConvergence(m,target){
  const relTarget={x:target.x-(m?.x??0),y:target.y-(m?.y??0),z:target.z-(m?.z??0)};
  const loc=inverseTransform(m,relTarget.x,relTarget.y,relTarget.z);
  // GLB node 50 pivot, not the old v2.6 body pivot.
  const px=.565,py=1.290,pz=.365;
  let rel=Math.atan2(loc.x-px,loc.z-pz);
  let p=Math.atan2(loc.y-py,Math.hypot(loc.x-px,loc.z-pz));
  // Fixed-point convergence uses the *moving* muzzle. At very short range
  // physical stops may make the camera ray unreachable; that is reported below.
  for(let iter=0;iter<8;iter++){
    const along=.470*Math.cos(p)-.003*Math.sin(p);
    const mx=px+along*Math.sin(rel);
    const my=py+.003*Math.cos(p)+.470*Math.sin(p);
    const mz=pz+along*Math.cos(rel);
    const vx=loc.x-mx,vy=loc.y-my,vz=loc.z-mz;
    rel=Math.atan2(vx,vz);
    p=Math.atan2(vy,Math.hypot(vx,vz));
  }
  rel=clamp(rel,-FLIGHT_REPEATER.maxTraverse,FLIGHT_REPEATER.maxTraverse);
  p=clamp(p,FLIGHT_REPEATER.minPitch,FLIGHT_REPEATER.maxPitch);
  return {yaw:(m?.heading??0)+rel,pitch:p};
}
/** Aim in joint-local coordinates. When input.siegeTarget is supplied, the
 * crossbow converges onto that 3D world target across all ranges; otherwise,
 * joint angles directly follow requested yaw and pitch within mechanical stops. */
export function flightRepeaterAim(m,input={}){
  if(input?.siegeTarget&&['x','y','z'].every(k=>Number.isFinite(input.siegeTarget[k]))){
    const aim=solveConvergence(m,input.siegeTarget);
    const pitch=m?.terminalDive?Math.min(aim.pitch,-Math.min(.34,Math.max(.18,rootPitch(m)*.55))):aim.pitch;
    const firing={yaw:aim.yaw,pitch};
    // Report the physical path from the authoritative v2.7 muzzle, including
    // when the real joints cannot converge on an out-of-arc camera target.
    const muzzle=flightMuzzle(m,firing),direction=flightDirection(m,firing);
    const towards={x:input.siegeTarget.x-muzzle.x,y:input.siegeTarget.y-muzzle.y,z:input.siegeTarget.z-muzzle.z};
    const projection=Math.max(0,towards.x*direction.x+towards.y*direction.y+towards.z*direction.z);
    const reachableAimPoint={x:muzzle.x+projection*direction.x,y:muzzle.y+projection*direction.y,z:muzzle.z+projection*direction.z};
    const missDistance=Math.hypot(input.siegeTarget.x-reachableAimPoint.x,input.siegeTarget.y-reachableAimPoint.y,input.siegeTarget.z-reachableAimPoint.z);
    return {...firing,limited:missDistance>.08,missDistance,reachableAimPoint};
  }
  const facing=m?.heading??0,requestedYaw=Number.isFinite(input.yaw)?input.yaw:facing;
  const yaw=facing+localYaw(m,requestedYaw);
  const wanted=Number.isFinite(input.pitch)?input.pitch:0;
  const pitch=clamp(wanted+rootPitch(m),FLIGHT_REPEATER.minPitch,FLIGHT_REPEATER.maxPitch);
  return {yaw,pitch:m?.terminalDive?Math.min(pitch,-Math.min(.34,Math.max(.18,rootPitch(m)*.55))):pitch};
}
function transform(m,x,y,z){
  const pitch=rootPitch(m),cp=Math.cos(pitch),sp=Math.sin(pitch);
  const ry=y*cp-z*sp,rz=y*sp+z*cp;
  const c=Math.cos(m?.heading??0),s=Math.sin(m?.heading??0);
  return {x:-(x*c+rz*s),y:ry,z:x*s-rz*c};
}
/** Position of the GLB muzzle after crossbow yaw, pitch and root run pitch. */
export function flightMuzzle(m,{yaw=m?.heading??0,pitch=0}={}){
  const rel=localYaw(m,yaw),p=clamp(pitch,FLIGHT_REPEATER.minPitch,FLIGHT_REPEATER.maxPitch);
  // Exported parent chain (all metres):
  // 50 YawGimbal [.565,1.195,.365] -> 51 PitchCradle [0,.095,0]
  // -> 12 Body [0,-.045,.025] -> 38 muzzle [0,.048,.445].
  // 50 applies Ry(rel); 51 applies Rx(-p). Body + muzzle yield
  // [0,+.003,+.470] relative to cradle. Never rotate only Crossbow_Body.
  const along=.470*Math.cos(p)-.003*Math.sin(p);
  const offset=transform(m,.565+along*Math.sin(rel),
    1.290+.003*Math.cos(p)+.470*Math.sin(p),.365+along*Math.cos(rel));
  return {x:(m?.x??0)+offset.x,y:(m?.y??0)+offset.y,z:(m?.z??0)+offset.z};
}
/** Unit launch vector from the SAME articulated transform as flightMuzzle. */
export function flightDirection(m,{yaw=m?.heading??0,pitch=0}={}){
  const rel=localYaw(m,yaw),p=clamp(pitch,FLIGHT_REPEATER.minPitch,FLIGHT_REPEATER.maxPitch);
  return transform(m,Math.sin(rel)*Math.cos(p),Math.sin(p),Math.cos(rel)*Math.cos(p));
}
