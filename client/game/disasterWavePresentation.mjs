// Visual-only flight sampling for the one authoritative All-Natural Disaster
// Windblade. Stay aligned with the shared simulation's 28 / 48 m/s speeds.
// Rendering does not change damage, range, or projectile collision.
export function windbladeSpeed(tiers={}) {
  return Number(tiers?.lightning??0)>0?48:28;
}

export function windbladeTrailSpan(dt,tiers={}) {
  const seconds=Number.isFinite(dt)?Math.max(0,Math.min(.05,dt)):0;
  // Do not paint an entire stale network interval as an infinite trail.
  return Math.min(2.5,windbladeSpeed(tiers)*seconds);
}

/**
 * Advance the single authoritative Windblade between packet arrivals. A
 * fixed 1/30 s ceiling left a visible stop/start step at ordinary network
 * rates, especially with 48 m/s Lightning. This bounded prediction follows
 * the SAME 3D direction and speed as collision; it cannot create hits.
 */
export function windbladePosition(wave,snapshotAt,now) {
  const point=wave?.position??{x:0,y:0,z:0};
  const dir=wave?.direction??{x:0,y:0,z:0};
  const elapsed=Number.isFinite(snapshotAt)&&Number.isFinite(now)
    ?Math.max(0,Math.min(.10,now-snapshotAt)):0;
  const distance=windbladeSpeed(wave?.tiers)*elapsed;
  return {
    x:point.x+(Number(dir.x)||0)*distance,
    y:point.y+(Number(dir.y)||0)*distance,
    z:point.z+(Number(dir.z)||0)*distance,
  };
}

/**
 * Windblade's horizontal, gently vaulted pressure-front coordinates in its
 * local plane (travel is +Z). One connected translucent volume, not a
 * vertical crescent or an opaque solid. Both the surface mesh and elemental
 * motes use these SAME samples, so Lightning and Frost ride the real wave.
 *
 * t: across the 2.5m span, u: distance behind the leading shock, side:
 * top (+1), bottom (-1), or central pressure core (0).
 */
export function windbladeSurfacePoint(t,u=0,side=0){
  // .9m physical half-width; Fire scales the whole sheet 1.5/.9.
  const x=(Math.max(0,Math.min(1,t))*2-1)*.9;
  const width=x/.9;
  const span=Math.sqrt(Math.max(0,1-width*width));
  const depth=Math.max(0,Math.min(1,u));
  const leading=.50*Math.pow(span,.88)-.12;
  const z=leading-depth*(.93+.18*span);
  const vault=(.035+.34*span*Math.sin(Math.PI*depth));
  // A clean, broad fingernail-like crescent: no sinusoidal wobble on the edge.
  return {x,y:side*vault,z};
}

/**
 * Mild local-camera response to a grounded Windblade detonation. The
 * travelling projectile must never kick harder than an actual ground slam.
 * Other players feel the same nearby impact; beyond 24m there is no shake.
 */
export function windbladeImpactKick(viewer,impact) {
  if(!viewer||!impact)return 0;
  const metres=Math.hypot(viewer.x-impact.x,(viewer.y??0)-(impact.y??0),viewer.z-impact.z);
  const near=Math.max(0,1-metres/24);
  return .11*near*near;
}

/**
 * Build a level, right-handed frame for the flying Gale pressure sheet.
 * Local +Z follows the aimed 3D velocity; local +X is strictly horizontal.
 * Unlike setFromUnitVectors(+Z, velocity), pitching cannot bank the blade or
 * rotate its broad sweep into a vertical cut. Previous right stabilizes the
 * otherwise undefined heading of a precisely vertical shot.
 */
export function windbladeLevelBasis(direction,previousRight=null){
  const raw={x:Number(direction?.x)||0,y:Number(direction?.y)||0,z:Number(direction?.z)||0};
  const magnitude=Math.hypot(raw.x,raw.y,raw.z)||1;
  const forward=magnitude>1e-8?{x:raw.x/magnitude,y:raw.y/magnitude,z:raw.z/magnitude}:{x:0,y:0,z:1};
  const horizontal=Math.hypot(forward.x,forward.z);
  const old=Math.hypot(previousRight?.x??0,previousRight?.z??0);
  // For every nonvertical trajectory, the broad axis is *exactly* level
  // and perpendicular to flight; no camera pitch or roll can tilt it.
  const right=horizontal>1e-8
    ?{x:forward.z/horizontal,y:0,z:-forward.x/horizontal}
    :old>1e-8
      ?{x:previousRight.x/old,y:0,z:previousRight.z/old}
      :{x:1,y:0,z:0};
  const up={
    x:forward.y*right.z-forward.z*right.y,
    y:forward.z*right.x-forward.x*right.z,
    z:forward.x*right.y-forward.y*right.x,
  };
  return {right,up,forward};
}
