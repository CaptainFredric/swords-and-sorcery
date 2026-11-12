// Castleward: the Vortex blade only guards WHERE its real spinning sword is.
// No omnidirectional armour or invisible parry cylinder. Authoritative angle
// and angular speed originate in the same state as the sword's hitbox.
export const VORTEX_GUARD = Object.freeze({
  reach: 2.9,      // rival body can only reach the blade from sword range
  vertical: 1.35,  // sword at torso height, not an overhead shield
  halfArc: 0.39,   // narrow radial blade + incoming weapon breadth
  sampledSec: 1/30,
});

/** True only when an active, unstaggered spinning blade faces this attack. */
export function vortexBladeGuards(defender,attacker,nowSec,rules=VORTEX_GUARD){
  const s=defender?.ultimateState;
  if(!defender?.alive||s?.id!=='vortex'||s.phase!=='active'||
     nowSec<(defender.staggerUntil??-Infinity)||
     !Number.isFinite(s.angle)||!Number.isFinite(s.angleAt)||
     !(s.rate>0)||!(defender.guardStamina>0)||!attacker?.position)return false;
  const dx=attacker.position.x-defender.position.x;
  const dz=attacker.position.z-defender.position.z;
  const distance=Math.hypot(dx,dz);
  if(distance<.15||distance>rules.reach)return false;
  if(Math.abs((attacker.position.y??0)-(defender.position.y??0))>rules.vertical)return false;
  const aim=Math.atan2(-dx,-dz);
  // The same 30Hz sweep that cuts enemies also carries the defensive edge.
  // Cover the passage since the last server sample; do not grant every angle
  // traversed in a full revolution or while simulation is paused.
  const elapsed=Math.max(0,Math.min(rules.sampledSec,nowSec-s.angleAt));
  const end=s.angle+s.rate*elapsed;
  const center=end-s.rate*elapsed/2;
  const diff=Math.atan2(Math.sin(aim-center),Math.cos(aim-center));
  return Math.abs(diff)<=rules.halfArc+s.rate*elapsed/2;
}
