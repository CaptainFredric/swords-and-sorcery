// Pure, Node-testable three-dimensional path frames for the Frost–Gale wake.
// The authoritative radius is provided by oneHitTrail; these are VFX ONLY.
const TAU=Math.PI*2,EPS=1e-7;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(a,k)=>({x:a.x*k,y:a.y*k,z:a.z*k});
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const norm=v=>{const k=Math.hypot(v.x,v.y,v.z)||1;return mul(v,1/k);};
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
const UP={x:0,y:1,z:0};
const unitTangent=(a,b)=>norm(sub(b,a));
export function wakePathFrames(points){
  if(!Array.isArray(points))return {frames:[],length:0};
  const kept=[];
  for(const point of points){
    if(!finite(point))continue;
    if(!kept.length||Math.hypot(...['x','y','z'].map(k=>point[k]-kept.at(-1)[k]))>EPS)
      kept.push({x:point.x,y:point.y,z:point.z});
  }
  if(kept.length<2)return {frames:[],length:0};
  let distance=0,previousSide=null;
  const frames=kept.map((point,i)=>{
    if(i)distance+=Math.hypot(...['x','y','z'].map(k=>point[k]-kept[i-1][k]));
    const tangent=unitTangent(kept[Math.max(0,i-1)],kept[Math.min(kept.length-1,i+1)]);
    // Parallel transport the radial frame across bends, rather than making
    // disconnected perpendicular cards that flip at vertical path segments.
    let side=previousSide?sub(previousSide,mul(tangent,dot(previousSide,tangent))):cross(tangent,UP);
    if(Math.hypot(side.x,side.y,side.z)<EPS)side=cross(tangent,{x:0,y:0,z:1});
    if(Math.hypot(side.x,side.y,side.z)<EPS)side=cross(tangent,{x:1,y:0,z:0});
    side=norm(side);previousSide=side;
    return {point,tangent,side,above:norm(cross(tangent,side)),distance};
  });
  return {frames,length:distance};
}
export function wakeSamplePath(path,progress){
  const frames=path?.frames??[];
  if(frames.length<2||!path.length)return null;
  const target=Math.min(1,Math.max(0,progress))*path.length;
  let i=1;
  while(i<frames.length-1&&frames[i].distance<target)i++;
  const a=frames[i-1],b=frames[i];
  const mix=Math.min(1,Math.max(0,(target-a.distance)/Math.max(EPS,b.distance-a.distance)));
  const point=add(mul(a.point,1-mix),mul(b.point,mix));
  const tangent=norm(add(mul(a.tangent,1-mix),mul(b.tangent,mix)));
  let side=add(mul(a.side,1-mix),mul(b.side,mix));
  side=norm(sub(side,mul(tangent,dot(side,tangent))));
  return {point,tangent,side,above:norm(cross(tangent,side))};
}
/** Triangle tube with a real circular section, not two intersecting planes.
 * U follows arc length (and shader airflow); V surrounds the circumference.
 * There is no collision geometry in this module.
 */
export function wakeTubeVertices(points,radius,sides=10){
  const coords=[],uvs=[],faces=[];
  const path=wakePathFrames(points),rings=path.frames;
  if(rings.length<2||!Number.isFinite(radius)||radius<=0)return {coords,uvs,faces};
  const n=Math.max(6,Math.min(20,Math.floor(sides)));
  for(const frame of rings){
    for(let j=0;j<=n;j++){
      const angle=TAU*j/n;
      const radial=add(mul(frame.side,Math.cos(angle)*radius),mul(frame.above,Math.sin(angle)*radius));
      const point=add(frame.point,radial);
      coords.push(point.x,point.y,point.z);
      uvs.push(frame.distance/path.length,j/n);
    }
  }
  for(let i=1;i<rings.length;i++)for(let j=0;j<n;j++){
    const a=(i-1)*(n+1)+j,b=i*(n+1)+j;
    faces.push(a,b,a+1,a+1,b,b+1);
  }
  return {coords,uvs,faces};
}
