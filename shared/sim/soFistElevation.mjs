// SO-FIST-ICATION upper frame. All lengths are authoritative WORLD metres;
// renderers divide by SO_FIST_SCALE for authored GLB local transforms.
import {boxWorld} from '../src/orientedBox.mjs';
export const SO_FIST_LIFT=Object.freeze({
 scale:2.85, maxRise: .480*2.85, nominalRise:.440*2.85,
 // Argon's model clears the full 50-degree pitch envelope once the lift has
 // risen 0.220 authored metres; lower positions permit proportionally less.
 pitchClearanceRise:.220*2.85,
 lowPitch:20*Math.PI/180, maxPitch:50*Math.PI/180,
 riseRate:.70, lowerRate:.86, pitchRate:38*Math.PI/180,
 pivot:Object.freeze([0,.385*2.85,-.560*2.85]),
 recoveryRadius:3.5, pickupRadius:2.6, recoveryCooldown:24,
});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function soFistAllowedPitch(b){
 const lift=clamp(b?.ramLiftY??0,0,SO_FIST_LIFT.maxRise);
 return SO_FIST_LIFT.lowPitch+(SO_FIST_LIFT.maxPitch-SO_FIST_LIFT.lowPitch)*
   clamp(lift/SO_FIST_LIFT.pitchClearanceRise,0,1);
}
export function soFistUpperAxes(root,b){
 const t=clamp(b?.ramElevPitch??0,0,SO_FIST_LIFT.maxPitch),c=Math.cos(t),s=Math.sin(t);
 return [root.axes[0],
   root.axes[1].map((v,i)=>v*c-root.axes[2][i]*s),
   root.axes[1].map((v,i)=>v*s+root.axes[2][i]*c)];
}
export function soFistUpperPoint(root,b,local){
 const t=clamp(b?.ramElevPitch??0,0,SO_FIST_LIFT.maxPitch),c=Math.cos(t),s=Math.sin(t);
 const [px,py,pz]=SO_FIST_LIFT.pivot,[x,y,z]=local;
 const dy=y-py,dz=z-pz;
 return boxWorld(root,[x,py+(b?.ramLiftY??0)+dy*c+dz*s,pz-dy*s+dz*c]);
}
export function soFistUpperBox(root,b,center,size){
 return {center:soFistUpperPoint(root,b,center),axes:soFistUpperAxes(root,b),size};
}
