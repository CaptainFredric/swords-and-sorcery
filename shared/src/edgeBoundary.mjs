/** Edge of Victory's geometry. All functions are pure and shared by browser prediction and authority. */
/** The ring denotes a knight's conviction; it never applies damage. */
export function edgeInside(point, center, radius, clearance = 0) {
  return Math.hypot(point.x - center.x, point.z - center.z) <= radius - clearance + 1e-6;
}

/** A convex disk contains the whole straight segment between any two legal points. */
export function edgeLimitPoint(point, center, radius, clearance = 0) {
  const limit = Math.max(0, radius - clearance);
  const dx = point.x - center.x, dz = point.z - center.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= limit || distance < 1e-9) return { ...point };
  return { ...point, x: center.x + dx * limit / distance, z: center.z + dz * limit / distance };
}

/** A real volume's four extreme horizontal corners; handles rotated OBBs and AABBs.
 * It is deliberately conservative for multi-piece siege machines, and never
 * replaces those machines' existing terrain/occupant collision solvers.
 */
/** Stops a *teleport trajectory* at the legal circle, unlike a radial
 * projection of the destination, which could change the spell's intended ray.
 * Null means no legal endpoint exists along the requested sweep.
 */
export function edgeClipTeleport(from,to,edge,clearance=0) {
  if(!edge)return {...to};
  const {center,radius}=edge,limit=Math.max(0,radius-clearance-.035);
  const inside=p=>edgeInside(p,center,limit,0);
  if(inside(to))return {...to};
  const dx=to.x-from.x,dz=to.z-from.z;
  const ox=from.x-center.x,oz=from.z-center.z;
  const a=dx*dx+dz*dz,b=2*(ox*dx+oz*dz),c=ox*ox+oz*oz-limit*limit;
  const discriminant=b*b-4*a*c;
  if(a<1e-10||discriminant<0)return null;
  const roots=[(-b-Math.sqrt(discriminant))/(2*a),(-b+Math.sqrt(discriminant))/(2*a)]
    .filter(t=>t>=0&&t<=1).sort((u,v)=>u-v);
  const t=roots.length ? (inside(from)?roots.at(-1):roots[0]) : null;
  if(t===null)return null;
  const fraction=Math.max(0,t-.025/Math.sqrt(a));
  const target={x:from.x+dx*fraction,y:from.y+(to.y-from.y)*fraction,
    z:from.z+dz*fraction};
  return inside(target)?target:null;
}

export function edgeFootprintOvershoot(volumes, center, radius, margin = 0) {
  if (!center || !Number.isFinite(radius)) return 0;
  let overflow = -Infinity;
  for (const box of volumes ?? []) {
    if (!box?.center || !box?.size) continue;
    const axes = box.axes ?? [[1,0,0],[0,1,0],[0,0,1]];
    const ex = axes.reduce((sum, axis, i) => sum + Math.abs(axis[0]) * box.size[i] / 2, 0);
    const ez = axes.reduce((sum, axis, i) => sum + Math.abs(axis[2]) * box.size[i] / 2, 0);
    for (const sx of [-1,1]) for (const sz of [-1,1]) {
      overflow = Math.max(overflow,Math.hypot(
        box.center[0]+sx*ex-center.x,box.center[2]+sz*ez-center.z)-radius+margin);
    }
  }
  return overflow;
}
export function edgeFootprintInside(volumes,center,radius,margin=0) {
  return edgeFootprintOvershoot(volumes,center,radius,margin) <= 1e-6;
}
/** No machine can advance farther outward through the boundary. If contraction
 * already overtook it, inward travel is still allowed so it can return.
 */
export function edgeMachineProgressAllowed(before,after,edge,margin=.02) {
  if (!edge) return true;
  const old = edgeFootprintOvershoot(before,edge.center,edge.radius,margin);
  const next = edgeFootprintOvershoot(after,edge.center,edge.radius,margin);
  return next <= Math.max(0,old)+1e-5;
}

export const DEFAULT_EDGE_STAGES = Object.freeze([
  Object.freeze({ second: 0, radius: 18 }),
  Object.freeze({ second: 75, radius: 15 }),
  Object.freeze({ second: 150, radius: 11 }),
  Object.freeze({ second: 225, radius: 8 }),
  Object.freeze({ second: 290, radius: 6.5 }),
]);

export function edgeRadiusAt(elapsed, stages = DEFAULT_EDGE_STAGES) {
  const t = Math.max(0, elapsed);
  if (!stages?.length) return Infinity;
  if (t <= stages[0].second) return stages[0].radius;
  for (let i = 1; i < stages.length; i++) {
    if (t > stages[i].second) continue;
    const a = stages[i-1], b = stages[i];
    const f = (t-a.second) / (b.second-a.second);
    return a.radius + (b.radius-a.radius)*f;
  }
  return stages.at(-1).radius;
}

/** Predict display AND foot controls against the same absolute match clock.
 * Client serverNow is a synchronized server clock; cap extrapolation to one
 * snapshot latency to avoid large correction after connection stalls.
 */
export function edgePresentedRadius(edge, serverNow, receivedAt = serverNow) {
  if (!edge) return null;
  if (!Array.isArray(edge.stages) || !Number.isFinite(edge.startedAt)) return edge.radius;
  const predictedTime = Math.min(serverNow, receivedAt + 0.15);
  return edgeRadiusAt(predictedTime - edge.startedAt, edge.stages);
}

export function edgeNextStage(elapsed, stages = DEFAULT_EDGE_STAGES) {
  return stages?.find((stage) => stage.second > Math.max(0,elapsed) + 1e-6)?.second ?? null;
}
