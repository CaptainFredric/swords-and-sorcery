// One-shot, source-authenticated Fight-and-Flight dash camera accent.
// Presentation only: the held run owns a smooth temporary third-person boom.
// Only a real authoritative offensiveRun edge starts the pulse.
const ATTACK=.12,PLATEAU=.12,RECOVER=.63;
const clamp01=n=>Math.min(1,Math.max(0,n));
const ease=t=>{const s=clamp01(t);return s*s*(3-2*s);};
export function flightDashEnvelope(age){
  if(!Number.isFinite(age)||age<0)return 0;
  if(age<ATTACK)return ease(age/ATTACK);
  if(age<ATTACK+PLATEAU)return 1;
  if(age<ATTACK+PLATEAU+RECOVER)return 1-ease((age-ATTACK-PLATEAU)/RECOVER);
  return 0;
}
export const FLIGHT_DASH_VIEW=Object.freeze({fovDegrees:7.5,thirdPersonPullback:1.35,duration:ATTACK+PLATEAU+RECOVER});
/** Shared reticle-driven third-person boom for held Dash AND Valkyrie.
 * The aircraft may lag behind the reticle as its steering wears out; never
 * force the camera to stare at the fuselage and hide an up/down aim command. */
export function flightDashChasePose(machine,look,distance){
 const yaw=look.yaw,pitch=look.pitch;
 return {
   position:{
     x:machine.x+Math.sin(yaw)*distance,
     y:machine.y+3.05-Math.sin(pitch)*distance,
     z:machine.z+Math.cos(yaw)*distance,
   },
   yaw,pitch,
 };
}

export class FlightDashPresentation{
  constructor(){this.reset();}
  reset(){this.machine=null;this.wasRunning=false;this.startedAt=Infinity;this.elapsed=Infinity;this.release=1;this.strength=0;this.thirdBlend=0;}
  update(dt,m,{eligible=false,cameraMotion=1}={}){
    const terminal=Boolean(m?.terminalDive&&!m.terminalDive.resolved);
    const valid=Boolean(eligible&&m?.id&&m?.operatorId&&
      (m.health>0||terminal)&&(m.rotorHP>0||terminal));
    if(!valid){this.reset();return {started:false,strength:0,fov:0,pullback:0,thirdBlend:0};}
    if(this.machine!==m.id){this.reset();this.machine=m.id;}
    // The irreversible Valkyrie shares the ordinary Dash chase-camera
    // language, even when launched from the ground or after rotor burnout.
    const running=Boolean(m.offensiveRun||terminal);
    const started=running&&!this.wasRunning;
    if(started){this.elapsed=0;this.release=1;}
    if(this.wasRunning&&!running)this.release=1;
    const step=Math.min(.1,Math.max(0,Number.isFinite(dt)?dt:0));
    if(Number.isFinite(this.elapsed))this.elapsed+=step;
    if(!running)this.release*=Math.exp(-step*11);
    this.strength=flightDashEnvelope(this.elapsed)*this.release;
    this.thirdBlend+=((running?1:0)-this.thirdBlend)*(1-Math.exp(-step*(running?13:11)));
    this.wasRunning=running;
    const scaled=this.strength*clamp01(cameraMotion);
    return {started,strength:scaled,fov:scaled*FLIGHT_DASH_VIEW.fovDegrees+(terminal?2.5:0),
      pullback:this.thirdBlend*(FLIGHT_DASH_VIEW.thirdPersonPullback+(terminal?.95:0)),
      thirdBlend:this.thirdBlend};
  }
}
