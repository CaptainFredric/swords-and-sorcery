import {ONE_HIT_REACH} from '../src/oneHitStatus.mjs';
import {RUPTURE} from '../src/rupture.mjs';
// Public, visibly active combat threats readable by a skilled knight.
// This reads the SAME projectile, Ultimate and ground-hazard positions a
// player can see, not opponents' queued buttons or hidden future actions.
export function activeHitboxThreat(room,actor,foe,nowSec){
  if(!actor?.alive||!foe?.alive)return null;
  const away=(at,kind)=>{
    const dx=actor.position.x-at.x,dz=actor.position.z-at.z;
    const mag=Math.hypot(dx,dz)||1;
    return {kind,x:dx/mag,z:dz/mag};
  };
  for(const wave of room?.oneHitWaves??[]){
    if(wave.ownerId!==foe.id||!wave.direction)continue;
    const d=wave.direction,flat=Math.hypot(d.x,d.z);
    if(flat<.05)continue;
    const ux=d.x/flat,uz=d.z/flat;
    const rx=actor.position.x-wave.position.x,rz=actor.position.z-wave.position.z;
    const along=rx*ux+rz*uz,off=rx*uz-rz*ux;
    const speed=(wave.tiers?.lightning??0)>=1?48:28;
    const width=(wave.tiers?.fire??0)>=1?ONE_HIT_REACH.waveFire:ONE_HIT_REACH.wave;
    if(along<0||along>speed*.65||Math.abs(off)>width+.55)continue;
    const height=wave.position.y+(along/flat)*d.y;
    if(Math.abs(actor.position.y+1-height)>2.2)continue;
    const side=Math.sign(off)||1;
    return {kind:'wave',x:uz*side,z:-ux*side};
  }
  // A visibly advancing Sunder fissure has a real narrow, moving contact
  // volume. Only its approaching head threatens NEW damage; the crack left
  // behind does not repeatedly injure somebody standing there.
  if(actor.grounded)for(const rupture of room?.ruptures??[]){
    if(rupture.ownerId!==foe.id||rupture.caught?.includes(actor.id))continue;
    const born=rupture.bornAt??nowSec;
    const reached=Math.min(RUPTURE.reach,Math.max(0,nowSec-born)*RUPTURE.speed);
    for(const fissure of rupture.fissures??[]){
      const dx=actor.position.x-rupture.origin.x;
      const dz=actor.position.z-rupture.origin.z;
      const along=dx*fissure.dir.x+dz*fissure.dir.z;
      const across=dx*fissure.dir.z-dz*fissure.dir.x;
      const width=along<=(fissure.core??fissure.length)?RUPTURE.width:RUPTURE.trailWidth;
      if(along<Math.max(0,reached-.15) || along>Math.min(fissure.length,reached+RUPTURE.speed*.6) ||
         Math.abs(across)>width+.38 ||
         Math.abs(actor.position.y-(fissure.level??rupture.origin.y))>RUPTURE.airborne+.2)continue;
      const side=Math.sign(across)||1;
      return {kind:'rupture',x:fissure.dir.z*side,z:-fissure.dir.x*side};
    }
  }
  const dx=actor.position.x-foe.position.x,dz=actor.position.z-foe.position.z;
  const d=Math.hypot(dx,dz);
  const state=foe.ultimateState;
  if(state?.id==='vortex'&&state.phase==='active'&&
     nowSec>=(foe.staggerUntil??-Infinity)&&d<3.35)
    return away(foe.position,'vortex');
  if(state?.id==='one_hit_of_wonders'&&state.phase==='startup'&&
    state.commitAt-nowSec<=.45&&state.commitAt-nowSec>=0&&
    d<((state.preparedTiers?.fire??0)>0?5.1:4))
    return away(foe.position,'disaster');
  for(const field of room?.oneHitFields??[]){
    if(field.ownerId!==foe.id||nowSec>=field.until)continue;
    const span=Math.hypot(actor.position.x-field.position.x,actor.position.z-field.position.z);
    if(span<field.radius+.2&&Math.abs(actor.position.y-field.position.y)<1.3)
      return away(field.position,'field');
  }
  return null;
}
