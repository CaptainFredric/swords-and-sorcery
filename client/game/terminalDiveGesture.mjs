// Fight-and-Flight's one-finger Dagaz rune and COMPLETE encircling halo.
// These checkpoints are projected from the live Flight buttons, not a second
// independently positioned touch control. All input remains server-authoritative.
export const RITUAL_UNIT=240; // legacy fixture scale; no longer a screen target
export const RITUAL_TOLERANCE=27;
export const RITUAL_HALO_STEPS=12;
export const VALKYRIE_RUNE_ACTIONS=Object.freeze(['jump','ultimate','dash','siegeSkill','jump']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(p,q)=>Math.hypot(p.x-q[0],p.y-q[1]);

// A reusable fixture for pure unit tests and preview fallbacks. Live code calls
// buildValkyrieRitualGeometry with actual DOM button centers each update.
const EXAMPLE_CENTERS=Object.freeze({
 jump:Object.freeze({x:201,y:143}),
 ultimate:Object.freeze({x:201,y:60}),
 dash:Object.freeze({x:105,y:143}),
 siegeSkill:Object.freeze({x:105,y:60}),
});
export function buildValkyrieRitualGeometry(centers,{width=240,height=240}={}){
 if(!VALKYRIE_RUNE_ACTIONS.every(action=>
    Number.isFinite(centers?.[action]?.x)&&Number.isFinite(centers?.[action]?.y)))return null;
 const rune=VALKYRIE_RUNE_ACTIONS.map(action=>[centers[action].x,centers[action].y]);
 const xs=rune.map(p=>p[0]),ys=rune.map(p=>p[1]);
 const cx=(Math.min(...xs)+Math.max(...xs))/2;
 const cy=(Math.min(...ys)+Math.max(...ys))/2;
 const rx=Math.min(Math.max(36,(Math.max(...xs)-Math.min(...xs))/2+27),
   Math.max(16,Math.min(cx-5,width-cx-5)));
 const ry=Math.min(Math.max(42,(Math.max(...ys)-Math.min(...ys))/2+29),
   Math.max(16,Math.min(cy-5,height-cy-5)));
 const jump=rune[0];
 const start=Math.atan2((jump[1]-cy)/ry,(jump[0]-cx)/rx);
 const halo=Array.from({length:RITUAL_HALO_STEPS+1},(_,index)=>{
  const angle=start+index*2*Math.PI/RITUAL_HALO_STEPS;
  return [cx+rx*Math.cos(angle),cy+ry*Math.sin(angle)];
 });
 const points=[...rune,...halo];
 // The final halo point equals the first: the path must actually CLOSE.
 const rounded=v=>Math.round(v*100)/100;
 const path='M'+points.map(p=>p.map(rounded).join(' ')).join(' L');
 return {points,path,width,height,center:[cx,cy],
  runeEndIndex:rune.length-1,haloStartIndex:rune.length,
  haloEndIndex:points.length-1};
}
export const VALKYRIE_RITUAL_POINTS=Object.freeze(
 buildValkyrieRitualGeometry(EXAMPLE_CENTERS).points.map(p=>Object.freeze(p)));
export const VALKYRIE_RITUAL_PATH=buildValkyrieRitualGeometry(EXAMPLE_CENTERS).path;

export const ritualStartNear=(p,points=VALKYRIE_RITUAL_POINTS,tolerance=RITUAL_TOLERANCE)=>
 Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Boolean(points?.length)&&
 distance(p,points[0])<=tolerance;
export const createValkyrieRitual=(pointerId,now,points=VALKYRIE_RITUAL_POINTS)=>({
 pointerId,startedAt:now,index:0,segmentProgress:0,completed:false,
 last:points[0],points,
});
export const ritualFraction=g=>g?.points?.length>1?
 (g.index+g.segmentProgress)/(g.points.length-1):0;

// A single captured pointer must traverse checkpoints in order. Sampling the
// actual path (not just its endpoints) prevents a single diagonal from
// completing the rune and forbids jumping across a halo arc.
export function advanceValkyrieRitual(g,p,now){
 if(!g||g.completed||!Number.isFinite(p?.x)||!Number.isFinite(p?.y)||
   !Number.isFinite(now)||now-g.startedAt>12000)return null;
 const points=g.points??VALKYRIE_RITUAL_POINTS;
 const a=points[g.index],b=points[g.index+1];
 if(!a||!b)return null;
 const dx=b[0]-a[0],dy=b[1]-a[1],lengthSq=dx*dx+dy*dy;
 if(lengthSq<1)return null;
 const t=clamp(((p.x-a[0])*dx+(p.y-a[1])*dy)/lengthSq,0,1);
 const deviation=Math.hypot(p.x-(a[0]+t*dx),p.y-(a[1]+t*dy));
 if(deviation>RITUAL_TOLERANCE*1.55||t+.13<g.segmentProgress)return null;
 let index=g.index,segmentProgress=Math.max(g.segmentProgress,t);
 if(t>=.94&&distance(p,b)<=RITUAL_TOLERANCE){index+=1;segmentProgress=0;}
 return {...g,index,segmentProgress,completed:index===points.length-1,last:[p.x,p.y]};
}

// Coordinate normalization for rotated shells, retained for older callers and
// used by tests. Live ritual points are in the same game-layer frame as buttons.
export function pointInRitualStencil(clientPoint,rect){
 if(!rect||!Number.isFinite(rect.width)||!Number.isFinite(rect.height)||
    rect.width<=0||rect.height<=0)return null;
 const px=(clientPoint.x-rect.left)/rect.width*RITUAL_UNIT;
 const py=(clientPoint.y-rect.top)/rect.height*RITUAL_UNIT;
 return Number.isFinite(px)&&Number.isFinite(py)?{x:px,y:py}:null;
}
