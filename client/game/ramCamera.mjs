import {SO_FIST_STATION} from '../../shared/sim/soFistGeometry.mjs';

// Smooth carriage translation separately from the look offset. Filtering the
// completed orbit while rotating its orientation immediately makes the reticle
// swing away from the subject during a fine thumb correction or reversal.
export function ramCameraFollow(previous,anchor,target,dt){
 const blend=1-Math.exp(-Math.max(0,dt)*18);
 const next=anchor.map((v,i)=>previous?previous[i]+(v-previous[i])*blend:v);
 return {anchor:next,position:target.map((v,i)=>v+next[i]-anchor[i])};
}

// A true orbit keeps the carriage centered through both horizontal and vertical
// look. Positive pitch looks upward, matching the ordinary player camera.
export function ramCameraOrbit(anchor,yaw,pitch){
 const elevation=Math.max(-1.15,Math.min(.75,pitch-.28)),distance=6.2,c=Math.cos(elevation);
 return {position:[anchor[0]+Math.sin(yaw)*c*distance,anchor[1]-Math.sin(elevation)*distance,anchor[2]+Math.cos(yaw)*c*distance],yaw,pitch:elevation};
}

// The raised trunnion crosses the centered sightline. Move to the shoulder
// on the rear deck as the hydraulics engage, without borrowing their rotation.
export function ramSightPoint(machine){
 const base=SO_FIST_STATION.sight;
 const amount=Math.min(1,Math.max(0,(machine.ramLiftY??0)/.5,(machine.ramElevPitch??0)/.27));
 const shoulder=amount*amount*(3-2*amount);
 return [base[0]+1.42*shoulder,base[1]+.18*shoulder,base[2]];
}
