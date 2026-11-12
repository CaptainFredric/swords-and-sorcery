// Deterministic, engine-independent cracked-ice pattern. This is presentation
// only: the server's field position, radius, duration and collision are unchanged.
// A gently irregular circular boundary is subdivided into Voronoi ice plates;
// their small gaps become dark fractures instead of a ring of upright cones.

const TAU=Math.PI*2;
const clip=(poly,nx,nz,limit)=>{
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const va=a.x*nx+a.z*nz-limit,vb=b.x*nx+b.z*nz-limit;
    const insideA=va<=1e-8,insideB=vb<=1e-8;
    if(insideA)out.push(a);
    if(insideA!==insideB){
      const t=va/(va-vb);
      out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
    }
  }
  return out;
};
export function frostPatternHash(value){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
}
function randomizer(seed){
  let s=seed>>>0;
  return ()=>{
    s=(s+0x6D2B79F5)>>>0;
    let t=Math.imul(s^(s>>>15),1|s);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
const area=poly=>Math.abs(poly.reduce((sum,p,i)=>{
  const q=poly[(i+1)%poly.length];
  return sum+p.x*q.z-q.x*p.z;
},0))*.5;
export function crackedFrostPattern(radius,seed='frost',plateCount=84){
  if(!Number.isFinite(radius)||radius<=0)return {outline:[],plates:[]};
  const count=Math.max(12,Math.min(110,Math.round(plateCount)));
  const rng=randomizer(frostPatternHash(seed));
  const outline=Array.from({length:64},(_,i)=>{
    const a=TAU*i/64,r=radius*(.965+.03*rng());
    return {x:Math.cos(a)*r,z:Math.sin(a)*r};
  });
  const sites=Array.from({length:count},(_,i)=>{
    const angle=i*2.399963229728653+(.5-rng())*.42;
    const r=radius*Math.sqrt((i+.55)/(count+.8))*(.94+(.5-rng())*.09);
    return {x:Math.cos(angle)*r,z:Math.sin(angle)*r};
  });
  const plates=[];
  for(let i=0;i<count;i++){
    const here=sites[i];
    let poly=outline;
    for(let j=0;j<count&&poly.length>=3;j++){
      if(i===j)continue;
      const other=sites[j],nx=other.x-here.x,nz=other.z-here.z;
      const limit=(other.x*other.x+other.z*other.z-here.x*here.x-here.z*here.z)/2;
      poly=clip(poly,nx,nz,limit);
    }
    if(poly.length<3||area(poly)<.002)continue;
    const center={x:poly.reduce((sum,p)=>sum+p.x,0)/poly.length,
      z:poly.reduce((sum,p)=>sum+p.z,0)/poly.length};
    // Inward offset each cell, preserving the original polygon's shape.
    // The blue backing visible between panels is the branching crack.
    const gap=.025+.028*rng();
    const vertices=poly.map(p=>{
      const dx=p.x-center.x,dz=p.z-center.z,d=Math.hypot(dx,dz)||1;
      const k=Math.max(0.78,1-gap/d);
      return {x:center.x+dx*k,z:center.z+dz*k};
    });
    const r=Math.hypot(center.x,center.z)/radius;
    plates.push({center,vertices,radial:r,tint:Math.floor(rng()*5),
      rim:r>.7&&rng()<.26});
  }
  plates.sort((a,b)=>a.radial-b.radial);
  return {outline,plates};
}
