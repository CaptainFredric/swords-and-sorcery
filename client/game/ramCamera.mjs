// Smooth carriage translation separately from the look offset. Filtering the
// completed orbit while rotating its orientation immediately makes the reticle
// swing away from the subject during a fine thumb correction or reversal.
export function ramCameraFollow(previous,anchor,target,dt){
 const blend=1-Math.exp(-Math.max(0,dt)*18);
 const next=anchor.map((v,i)=>previous?previous[i]+(v-previous[i])*blend:v);
 return {anchor:next,position:target.map((v,i)=>v+next[i]-anchor[i])};
}
