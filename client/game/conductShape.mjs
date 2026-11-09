// Engine-independent conductor spine. No authoritative endpoints are altered.
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const jitter=(n,t)=>.5*Math.sin(n*9.17+t*31)+.3*Math.sin(n*17.9-t*19)+.2*Math.cos(n*27.3+t*13);
const cross=(a,b)=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const normal=v=>{const m=Math.hypot(v.x,v.y,v.z)||1;return {x:v.x/m,y:v.y/m,z:v.z/m};};
export function conductBoltSamples(origin,end,{time=0,jitter:amount=.14}={}){
  const d={x:end.x-origin.x,y:end.y-origin.y,z:end.z-origin.z};
  const length=Math.hypot(d.x,d.y,d.z);
  if(length<.0001)return [{...origin},{...end}];
  const axis=normal(d);
  let side=normal(cross({x:0,y:1,z:0},axis));
  if(Math.hypot(side.x,side.y,side.z)<.02)side={x:1,y:0,z:0};
  const up=normal(cross(axis,side));
  const count=clamp(Math.ceil(length/1.8),7,100);
  const points=[{...origin}];
  for(let i=1;i<count;i++){
    const t=i/count,edge=Math.sin(Math.PI*t);
    const a=amount*edge*jitter(i,time),b=amount*.72*edge*jitter(i+31,time);
    points.push({x:origin.x+d.x*t+side.x*a+up.x*b,
      y:origin.y+d.y*t+side.y*a+up.y*b,z:origin.z+d.z*t+side.z*a+up.z*b});
  }
  points.push({...end});return points;
}

// The authoritative wire remains dangerous for one second. These cosmetic
// phases preserve that full world-space path; only intensity and width change.
export const CONDUCT_VISUAL=Object.freeze({
  travelSec:.16,impactFadeSec:.32,wireEndSec:1,
});
export function conductVisualPhase(seconds){
  const t=Number.isFinite(seconds)?Math.max(0,seconds):0;
  const growth=clamp(t/CONDUCT_VISUAL.travelSec,0,1);
  const impact=t<=.14?1:clamp((CONDUCT_VISUAL.impactFadeSec-t)/.18,0,1);
  const residual=clamp((t-CONDUCT_VISUAL.travelSec)/.07,0,1)*
    clamp((CONDUCT_VISUAL.wireEndSec-t)/.20,0,1);
  return {growth,impact,residual};
}
