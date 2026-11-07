// Fight-and-Flight: one continuous Dagaz, diagonal return, rising stem,
// then a reversible crossbar. No polygonal halo or independent touch hitbox.
// Waypoints follow the actual editable Flight buttons in game-layer space.
export const RITUAL_UNIT=240; // legacy stencil adapter only
export const RITUAL_TOLERANCE=39;
export const RITUAL_TIMEOUT_MS=45000;
export const RITUAL_HALO_STEPS=0; // kept for older diagnostics; the halo is gone
export const VALKYRIE_RUNE_ACTIONS=Object.freeze(['jump','ultimate','dash','siegeSkill','jump']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(p,q)=>Math.hypot(p.x-q[0],p.y-q[1]);
const round=v=>Math.round(v*100)/100;
const pathFor=points=>'M'+points.map(p=>p.map(round).join(' ')).join(' L');

const EXAMPLE_CENTERS=Object.freeze({
 jump:Object.freeze({x:201,y:143}),ultimate:Object.freeze({x:201,y:60}),
 dash:Object.freeze({x:105,y:143}),siegeSkill:Object.freeze({x:105,y:60}),
});

export function buildValkyrieRitualGeometry(centers,{width=240,height=240}={}){
 if(!VALKYRIE_RUNE_ACTIONS.every(action=>
   Number.isFinite(centers?.[action]?.x)&&Number.isFinite(centers?.[action]?.y)))return null;
 const rune=VALKYRIE_RUNE_ACTIONS.map(action=>[centers[action].x,centers[action].y]);
 const xs=rune.map(p=>p[0]),ys=rune.map(p=>p[1]);
 const cx=(Math.min(...xs)+Math.max(...xs))/2;
 const cy=(Math.min(...ys)+Math.max(...ys))/2;
 // The diagonal return aims specifically halfway from ASCENSION/CHARGE
 // (the Siege Skill button) to JUMP, rather than an arbitrary screen center.
 const betweenChargeAndJump=[
  (centers.siegeSkill.x+centers.jump.x)/2,
  (centers.siegeSkill.y+centers.jump.y)/2,
 ];
 const upper=Math.min(centers.ultimate.y,centers.siegeSkill.y);
 const verticalSeparation=Math.abs(centers.jump.y-centers.ultimate.y);
 const capY=clamp(upper-Math.max(24,verticalSeparation*.24),10,Math.max(10,height-12));
 const capCenter=[cx,capY];
 const halfWidth=Math.max(26,(Math.max(...xs)-Math.min(...xs))/2+10);
 const left=[clamp(cx-halfWidth,8,width-8),capY];
 const right=[clamp(cx+halfWidth,8,width-8),capY];
 // Trace from JUMP and finish on either end of a SINGLE crossbar:
 // right -> center -> left OR left -> center -> right. A reverse journey
 // retraces the same line; it does not introduce a halo.
 const stem=[betweenChargeAndJump,capCenter];
 const points=[...rune,...stem,right,capCenter,left];
 const reversePoints=[...rune,...stem,left,capCenter,right];
 const guidePath=pathFor([...rune,...stem])+' M'+left.map(round).join(' ')+' L'+right.map(round).join(' ');
 return {
  points,reversePoints,path:pathFor(points),reversePath:pathFor(reversePoints),
  guidePath,width,height,center:[cx,cy],
  runeEndIndex:4,stemEndIndex:6,crossbarStartIndex:6,crossbarEndIndex:9,
 };
}
const FIXTURE=buildValkyrieRitualGeometry(EXAMPLE_CENTERS);
export const VALKYRIE_RITUAL_POINTS=Object.freeze(FIXTURE.points.map(p=>Object.freeze(p)));
export const VALKYRIE_RITUAL_PATH=FIXTURE.path;

export const ritualStartNear=(p,points=VALKYRIE_RITUAL_POINTS,tolerance=RITUAL_TOLERANCE)=>
 Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Boolean(points?.length)&&
 distance(p,points[0])<=tolerance;
export const createValkyrieRitual=(pointerId,now,points=VALKYRIE_RITUAL_POINTS,reversePoints=null)=>({
 pointerId,startedAt:now,index:0,segmentProgress:0,completed:false,
 last:points[0],points,reversePoints,variant:null,
});
export const ritualFraction=g=>g?.points?.length>1?
 (g.index+g.segmentProgress)/(g.points.length-1):0;

/** Highlight real line length, including the return stroke along the crossbar. */
export function ritualDistanceFraction(g){
 if(!g?.points?.length||g.points.length<2)return 0;
 let total=0,passed=0;
 for(let i=0;i<g.points.length-1;i++){
  const a=g.points[i],b=g.points[i+1];
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  total+=length;
  if(i<g.index)passed+=length;
  else if(i===g.index)passed+=length*clamp(g.segmentProgress??0,0,1);
 }
 return total>0?clamp(passed/total,0,1):0;
}

// Checkpoints may not be skipped. The first horizontal motion selects the
// crossbar direction after the tip is reached; the opposite direction is
// equally valid. Completion is only an *armed* gesture: pointerup commits it.
export function advanceValkyrieRitual(g,p,now){
 if(!g||g.completed||!Number.isFinite(p?.x)||!Number.isFinite(p?.y)||
  !Number.isFinite(now)||now-g.startedAt>RITUAL_TIMEOUT_MS)return null;
 let {points,variant}=g;
 if(g.index===6&&!variant&&g.reversePoints){
  const delta=p.x-points[6][0];
  if(Math.abs(delta)>8){
   variant=delta<0?'left-first':'right-first';
   if(variant==='left-first')points=g.reversePoints;
  }
 }
 const a=points[g.index],b=points[g.index+1];
 if(!a||!b)return null;
 const dx=b[0]-a[0],dy=b[1]-a[1],lengthSq=dx*dx+dy*dy;
 if(lengthSq<1)return null;
 const t=clamp(((p.x-a[0])*dx+(p.y-a[1])*dy)/lengthSq,0,1);
 const deviation=Math.hypot(p.x-(a[0]+t*dx),p.y-(a[1]+t*dy));
 if(deviation>RITUAL_TOLERANCE*1.55||t+.13<g.segmentProgress)return null;
 let index=g.index,segmentProgress=Math.max(g.segmentProgress,t);
 if(t>=.94&&distance(p,b)<=RITUAL_TOLERANCE){index+=1;segmentProgress=0;}
 return {...g,points,variant,index,segmentProgress,
  completed:index===points.length-1,last:[p.x,p.y]};
}

// Used by older rotated-shell replay adapters; live input already shares
// the game-layer coordinate system with the editable buttons.
export function pointInRitualStencil(clientPoint,rect){
 if(!rect||!Number.isFinite(rect.width)||!Number.isFinite(rect.height)||
  rect.width<=0||rect.height<=0)return null;
 const px=(clientPoint.x-rect.left)/rect.width*RITUAL_UNIT;
 const py=(clientPoint.y-rect.top)/rect.height*RITUAL_UNIT;
 return Number.isFinite(px)&&Number.isFinite(py)?{x:px,y:py}:null;
}
