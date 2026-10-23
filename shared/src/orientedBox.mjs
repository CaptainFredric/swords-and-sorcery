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
