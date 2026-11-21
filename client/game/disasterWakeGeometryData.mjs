// Pure, Node-testable vertex math for the browser's crossed 3D wake.
const minus=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const length=v=>Math.hypot(v.x,v.y,v.z);
const normalize=v=>{const d=length(v)||1;return {x:v.x/d,y:v.y/d,z:v.z/d};};
export function wakeRibbonVertices(points,radius,axis=0){
 const coords=[],faces=[];
 if(!Array.isArray(points)||points.length<2)return {coords,faces};
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],d=minus(b,a);
  if(length(d)<1e-6)continue;
  const tangent=normalize(d);
  let side=cross(tangent,{x:0,y:1,z:0});
  if(length(side)<1e-6)side=cross(tangent,{x:0,y:0,z:1});
  side=normalize(side);
  if(axis===1)side=normalize(cross(tangent,side));
  const offset=coords.length/3;
  for(const [p,sign] of [[a,1],[a,-1],[b,1],[b,-1]])
   coords.push(p.x+side.x*radius*sign,p.y+side.y*radius*sign,p.z+side.z*radius*sign);
  faces.push(offset,offset+1,offset+2,offset+1,offset+3,offset+2);
 }
 return {coords,faces};
}
