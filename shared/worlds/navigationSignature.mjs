// Version the physical inputs to an optional offline graph. A stale graph is never trusted.
export function navigationSignature(world) {
  const shape = box => [box.id,box.center,box.size,box.y];
  const data=JSON.stringify({floors:(world.floors??[]).map(shape),solids:(world.solids??[]).map(shape),
    ramps:world.ramps??[],nodes:(world.navigation?.nodes??[]).map(p=>[p.id,p.x,p.y,p.z])});
  let hash=2166136261;
  for(let i=0;i<data.length;i++)hash=Math.imul(hash^data.charCodeAt(i),16777619);
  return `${data.length}:${(hash>>>0).toString(16)}`;
}
