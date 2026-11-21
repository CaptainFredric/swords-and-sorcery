// The Fight-and-Flight GLB pitches all of its children during Valkyrie.
// Its authored visor marker [0,1.555,+.215] is therefore NOT a safe world
// camera near a 90-degree dive: Rx(90deg) moves its eye to y=-0.215 relative
// to the machine feet. Gameplay and simulation continue, but the view winds
// up underground or inside the chassis. Stabilize the LOOK origin independently
// of the rotor's true pitched mesh and collision transform.
export const FLIGHT_VISOR = Object.freeze({
  height:1.555, forward:.215, minimumRelativeHeight:1.12,
  pitchBlendBegin:.10,pitchBlendFull:.55,maximumAuthoredDisplacement:1.8,
  // The model may lurch on a forward-to-reverse carriage transition. The
  // rider's head follows its own small authored bob, never the chassis mesh
  // far enough to be swallowed by protective braces or drive assemblies.
  maxAuthoredEyeTravel:.10,
});
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const clamp01=v=>Math.max(0,Math.min(1,v));
const smoothstep=t=>{const s=clamp01(t);return s*s*(3-2*s);};

/** World-space cockpit position. The actual machine/rotor still pitch fully;
 * the player's view never inherits the blade's near-ground transform.
 * Works during a failed/missing GLB load, a mount swap, and repeated Dashes.
 * 
 * authoredEye is the optional THREE node-derived world position; this helper
 * is deliberately free of WebGL/THREE for inexpensive deterministic tests.
 */
export function stableFlightCockpitEye(m,authoredEye=null,groundHeight=null){
  const x=finite(m?.x),y=finite(m?.y),z=finite(m?.z);
  const yaw=finite(m?.heading);
  const pitch=Math.abs(finite(m?.runPitch));
  const safe={
    x:x-Math.sin(yaw)*FLIGHT_VISOR.forward,
    y:y+FLIGHT_VISOR.height,
    z:z-Math.cos(yaw)*FLIGHT_VISOR.forward,
  };
  const source=authoredEye&&[authoredEye.x,authoredEye.y,authoredEye.z].every(Number.isFinite)
    ?authoredEye:null;
  const displacement=source?Math.hypot(source.x-safe.x,source.y-safe.y,source.z-safe.z):Infinity;
  const credible=source&&displacement<=FLIGHT_VISOR.maximumAuthoredDisplacement;
  const blend=smoothstep((pitch-FLIGHT_VISOR.pitchBlendBegin)/
    (FLIGHT_VISOR.pitchBlendFull-FLIGHT_VISOR.pitchBlendBegin));
  // Keep the physically animated camera *micro-motion*, not its full
  // model-relative lurch on direction reversal. Horizontal acceleration and
  // the normal cockpit bob are still applied separately by FlightCameraMotion.
  const retained=credible?(1-blend)*Math.min(1,
    FLIGHT_VISOR.maxAuthoredEyeTravel/Math.max(displacement,1e-6)):0;
  const point=credible?{
    x:safe.x+(source.x-safe.x)*retained,
    y:safe.y+(source.y-safe.y)*retained,
    z:safe.z+(source.z-safe.z)*retained,
  }:safe;
  const floor=Number.isFinite(groundHeight)?groundHeight:-Infinity;
  // Honor *both* operator head clearance and arena terrain. A grounded
  // Dash must never submerge the camera in the floor as its rotor pitches.
  point.y=Math.max(point.y,y+FLIGHT_VISOR.minimumRelativeHeight,floor+.88);
  return point;
}

/** If an animation or network snapshot momentarily supplies invalid camera
 * data, do not propagate NaN/Infinity into the Three.js view/projection.
 */
export function finiteFlightLook(yaw,pitch,fallbackYaw=0){
  return {
    yaw:finite(yaw,finite(fallbackYaw)),
    pitch:Math.max(-1.45,Math.min(1.45,finite(pitch))),
  };
}

/** For physical shot convergence, read the CURRENT authoritative carriage
 * position, not the preceding render frame's cockpit camera. Rapid forward
 * to reverse transitions otherwise send a target shifted behind the sight.
 * An actual third-person boom retains its already-clipped camera position. */
export function flightReticleOrigin(machine,previousCamera,{
  sight=true,thirdBlend=0,ground=null,
}={}){
  if(!machine||!sight||thirdBlend>=.002)return previousCamera;
  return stableFlightCockpitEye(machine,null,ground);
}
