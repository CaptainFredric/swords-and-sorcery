// Column axes form an orthonormal frame. Size stays in that local frame.
export function boxLocal(box, point) {
 const d=point.map((v,i)=>v-box.center[i]);
 return box.axes.map(axis=>axis.reduce((n,v,i)=>n+v*d[i],0));
}
export function boxWorld(box, point, vector=false) {
 return [0,1,2].map(i=>(vector?0:box.center[i])+box.axes.reduce((n,axis,j)=>n+axis[i]*point[j],0));
}
export function orientedBoxHit(start,end,box,grow=0) {
 const a=boxLocal(box,start), b=boxLocal(box,end), d=b.map((v,i)=>v-a[i]);
 let near=0,far=1,normal=[0,0,0];
 for(let i=0;i<3;i++){
  const half=box.size[i]/2+grow;
  if(Math.abs(d[i])<1e-12){if(Math.abs(a[i])>half)return null;continue;}
  let t0=(-half-a[i])/d[i],t1=(half-a[i])/d[i];
  const sign=-Math.sign(d[i]);if(t0>t1)[t0,t1]=[t1,t0];
  if(t0>near){near=t0;normal=[0,0,0];normal[i]=sign;}
  far=Math.min(far,t1);if(near>far)return null;
 }
 return {t:near,point:start.map((v,i)=>v+(end[i]-v)*near),normal:boxWorld(box,normal,true),box};
}
export function boxNearest(box,point) {
 return boxWorld(box,boxLocal(box,point).map((v,i)=>Math.max(-box.size[i]/2,Math.min(box.size[i]/2,v))));
}
// An axis-aligned solid's own face axes are the world axes: test those first in plain arithmetic. It is the same
// separating-axis test the general path makes on them (same tolerance), without building closures and arrays for
// each of the many world solids a carriage is checked against every sub-step.
// Boxes whose bounding spheres do not meet are disjoint, and the separating-axis test reports disjoint boxes as
// separated: the same answer, from one distance (for rotated boxes, such as other machines' volumes).
export function spheresApart(a,b){
 const ra=Math.hypot(a.size[0],a.size[1],a.size[2])/2,rb=Math.hypot(b.size[0],b.size[1],b.size[2])/2;
 const dx=b.center[0]-a.center[0],dy=b.center[1]-a.center[1],dz=b.center[2]-a.center[2],r=ra+rb;
 return dx*dx+dy*dy+dz*dz>r*r;
}
export function alignedSeparated(a,b){
 if(b.axes)return spheresApart(a,b);
 const A=a.axes,sa=a.size,sb=b.size;
 for(let k=0;k<3;k++){
  const reach=(Math.abs(A[0][k])*sa[0]+Math.abs(A[1][k])*sa[1]+Math.abs(A[2][k])*sa[2]+sb[k])/2;
  if(Math.abs(b.center[k]-a.center[k])>=reach-.002)return true;
 }
 return false;
}
