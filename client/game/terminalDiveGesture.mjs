// Terminal Dive's Dagaz + halo is a standalone geometric stencil. No action
// depends on where Jump, Dash, Ascend or Chivalry buttons were customized.
export const RITUAL_UNIT=240;
export const VALKYRIE_RITUAL_POINTS=Object.freeze([
  Object.freeze([201,127]),  // jump: lower-right, begin the rune
  Object.freeze([201,45]),   // Chivalry, straight up
  Object.freeze([112,143]),  // diagonal down to Dash
  Object.freeze([92,47]),    // up to Ascend (virtual upper-left corner)
  Object.freeze([201,127]),  // diagonal back to jump: Dagaz complete
  Object.freeze([169,15]),   // rise through the gap above buttons
  Object.freeze([102,8]),    // halo crest crossing above Chivalry
  Object.freeze([39,30]),    // halo curves left past Ascend
]);
export const VALKYRIE_RITUAL_PATH='M201 127 L201 45 L112 143 L92 47 L201 127 L169 15 L102 8 L39 30';
export const RITUAL_TOLERANCE=23;
const distance=(p,q)=>Math.hypot(p.x-q[0],p.y-q[1]);
export const ritualStartNear=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&
  distance(p,VALKYRIE_RITUAL_POINTS[0])<=RITUAL_TOLERANCE;
export const createValkyrieRitual=(pointerId,now)=>({
  pointerId,startedAt:now,index:0,segmentProgress:0,completed:false,
  last:VALKYRIE_RITUAL_POINTS[0],
});
export const ritualFraction=g=>(g.index+g.segmentProgress)/(VALKYRIE_RITUAL_POINTS.length-1);
/** Advance ordered checkpoints only. Tracking a single pointer prevents
 * accidental multi-touch completion; touching any real button is irrelevant.
 * Intermediate points follow the current segment within a human thumb's
 * spatial tolerance. Backtracking or leaving the stencil cancels cleanly.
 */
export function advanceValkyrieRitual(g,p,now){
 if(!g||g.completed||!Number.isFinite(p?.x)||!Number.isFinite(p?.y)||
   !Number.isFinite(now)||now-g.startedAt>6500)return null;
 const a=VALKYRIE_RITUAL_POINTS[g.index],b=VALKYRIE_RITUAL_POINTS[g.index+1];
 if(!b)return null;
 const dx=b[0]-a[0],dy=b[1]-a[1],lengthSq=dx*dx+dy*dy;
 const t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/lengthSq));
 const deviation=Math.hypot(p.x-(a[0]+t*dx),p.y-(a[1]+t*dy));
 // The slight corner overshoot is allowed; skipping a checkpoint is not.
 if(deviation>RITUAL_TOLERANCE*1.7 || t+0.13<g.segmentProgress)return null;
 let index=g.index,segmentProgress=Math.max(g.segmentProgress,t);
 // Require the thumb to reach the actual end of the segment. A merely
 // nearby intermediate point must not auto-advance and skip the next turn.
 if(t>=.94&&distance(p,b)<=RITUAL_TOLERANCE){
   index+=1;segmentProgress=0;
 }
 return {...g,index,segmentProgress,completed:index===VALKYRIE_RITUAL_POINTS.length-1,last:[p.x,p.y]};
}
export function pointInRitualStencil(clientPoint,rect){
 if(!rect||!Number.isFinite(rect.width)||!Number.isFinite(rect.height)||
   rect.width<=0||rect.height<=0)return null;
 const px=(clientPoint.x-rect.left)/rect.width*RITUAL_UNIT;
 const py=(clientPoint.y-rect.top)/rect.height*RITUAL_UNIT;
 return Number.isFinite(px)&&Number.isFinite(py)?{x:px,y:py}:null;
}
