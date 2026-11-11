// Flight to the Valkyrie — offensive flight RUN only.
// Machine locomotion is authoritative; the expenditure belongs to the Spellblade.
import {PROWESS} from '../src/prowess.mjs';
import {activeUltimate} from '../src/ultimates.mjs';
import {tryDash} from './combat.mjs';
import {flightSupportAt} from './flightSupport.mjs';
import {fightFlightSkillActive,ASCENSION} from './fightFlightSkill.mjs';
import {ascensionValkyrieReady} from '../src/flightTerminalPolicy.mjs';
import {FIGHT_FLIGHT} from './fightFlight.mjs';
export const VALKYRIE_RUN=Object.freeze({
  drainPerSec:42,practiceRefillPerSec:70,speed:18,
  // A committed attack, then a heavier, acceleration-limited turn than ordinary flight.
  commitmentSec:.36,minTravel:10,turnRate:3.05,turnAcceleration:12,
  // A descending *physical* attack launch. The rotor plane gets a small
  // geometric lead to intersect the crosshair's near opponents, not a separate
  // cosmetic tilt that points a metre below its thrust trajectory.
  acceleration:7.4,pitch:.54,launchRotorLead:Math.PI/2,rotorAimLead:Math.PI/2,
  maxAttackPitch:Math.PI/2,pitchLimit:1.04,descentPitchLimit:1.14,pitchRate:5.5,
  clearance:1.1,groundLaunchClearance:1.75,groundTakeoffVelocity:6.4,
  spinupRPM:450,chargeGraceSec:.30,chivalryDashImpulse:8,
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Shared signed flight-pitch servo for normal Dash and terminal Valkyrie.
 * Its actual thrust vector and replicated, collision-bearing rotor attitude
 * follow the same smoothed reticle input, rather than disconnected animations.
 * Normal Dash prevents a low rotor strike; terminal flight may crash after takeoff. */
export function stepFlightPitchAttitude(m,dt,{
 target=0,requested=target,lead=VALKYRIE_RUN.rotorAimLead,
 engaged=true,ground=null,limitRotorToSupport=true,
 pitchRate=VALKYRIE_RUN.pitchRate,
}={}){
 const approach=(value,goal,rate)=>value+clamp(goal-value,-rate*dt,rate*dt);
 const correction=engaged&&limitRotorToSupport?
   clamp(Math.max(0,target-requested)*.49,0,.56):0;
 m.runTrim=approach(m.runTrim??0,engaged?lead+correction:0,pitchRate*1.3);
 m.runFlightPitch=approach(m.runFlightPitch??0,target,
   pitchRate*(target>(m.runFlightPitch??0)?1.8:1));
 let maxPitch=VALKYRIE_RUN.maxAttackPitch;
 if(limitRotorToSupport&&ground!=null){
   // GLB rotor hub y=2.185, swept blade radius=1.295 metres.
   const radius=Math.hypot(2.185,1.295),phase=Math.atan2(1.295,2.185);
   maxPitch=Math.min(maxPitch,Math.acos(clamp((.12-(m.y-ground))/radius,-1,1))-phase);
 }
 m.runPitch=clamp(m.runTrim-m.runFlightPitch,-.85,Math.max(0,maxPitch));
 return m.runFlightPitch;
}
export function requestFlightDash(room,m,p,held,now){
 if(!m||m.mode==='DESTROYED'||m.terminalDive||m.health<=0||!p?.alive||room.players.get(p.id)!==p||
   m.operatorId!==p.id||p.operatingFightFlightId!==m.id)return false;
 const before=m.flightDashHeld===true;
 if(!held&&!before)return true; // duplicate release cannot extend a minimum launch
 m.flightDashHeld=Boolean(held);
 if(!held){
   // Dash starts on keydown; a fast release still owes its committed travel.
   if(m.runGroundLaunchReady)m.runGroundReleased=true;
   m.runStopRequested=Boolean(m.offensiveRun);m.runReleaseElapsed=0;
   if(m.offensiveRun&&(m.runTravel??0)>=VALKYRIE_RUN.minTravel){m.runAnimationEndedAt=now;m.offensiveRun=false;m.runStopRequested=false;}
   m.runReleasedAt=now;m.flightDashStartedAt=null;
   if(!m.offensiveRun)m.practiceDashRefilling=false;
   return true;
 }
 if(before)return true;
 m.flightDashStartedAt=now;
 m.runCommitHeading=Number.isFinite(p.input?.yaw)?p.input.yaw:(Number.isFinite(m.heading)?m.heading:0);
 const aimPitch=clamp(Number.isFinite(p.input?.pitch)?p.input.pitch:0,
   -VALKYRIE_RUN.descentPitchLimit,VALKYRIE_RUN.pitchLimit);
 // Level launches physically dive; upward initial intent remains controllable.
 m.runCommitPitch=aimPitch>0?aimPitch:Math.min(-VALKYRIE_RUN.pitch,aimPitch);
 m.runStartAt=null;m.runElapsed=0;m.runTravel=0;m.runLastPosition=null;
 m.runStopRequested=false;m.runReleasedAt=null;m.runTurnSpeed=0;
 m.runGroundReleased=false;
 // Grounded Dash launches on the authoritative press, not at some later RPM.
 // The actual rotor spins up in flight and retains normal contact physics.
 const practice=room.mode==='PRACTICE'&&p.actorKind==='human'&&!room.localTutorial;
 const canDash=!m.emergencyBrakeActive&&m.rotorHP>0&&m.flightCharge>2&&
   (p.prowess>0||practice||fightFlightSkillActive(m,now,ASCENSION.id));
 m.runRotorWasPowered=Boolean(m.rotorPowered);
 if(canDash){
   m.rotorPowered=true;
   if(m.grounded){
     m.grounded=false;m.mode='TAKEOFF';m.takeoffAt=now;m.crouched=false;
     m.velocity.y=Math.max(m.velocity.y,VALKYRIE_RUN.groundTakeoffVelocity);
     m.runGroundPhase=null;m.runGroundLaunchReady=true;
     room.events.push({type:'fightFlightGroundDashTakeoff',machineId:m.id,
       operatorId:p.id,rotorRPM:m.rotorRPM,at:now});
   }
 }
 const ultimate=activeUltimate(p,now);
 if(ultimate?.id==='chivalry'&&!m.grounded){
   // Chivalry's ordinary midair dash still consumes its own normal cooldown,
   // NEVER an additional amount of personal Ultimate energy.
   const heading=m.heading;
   const dir={x:-Math.sin(heading),z:-Math.cos(heading)};
   if(tryDash(room,p.id,dir,now)){
     m.velocity.x+=dir.x*VALKYRIE_RUN.chivalryDashImpulse;
     m.velocity.z+=dir.z*VALKYRIE_RUN.chivalryDashImpulse;
     room.events.push({type:'fightFlightChivalryDash',machineId:m.id,operatorId:p.id,at:now});
   }
 }
 return true;
}
export function stepFlightRun(room,m,dt,now){
 if(!m||m.mode==='DESTROYED'||m.retired)return;
 // Terminal Valkyrie has its own authoritative propulsion and turn integrator.
 // Never run the ordinary Dash cancellation/reset path on a committed dive:
 // that used to erase its angular velocity EVERY room tick.
 if(m.terminalDive)return;
 const p=m.operatorId?room.players.get(m.operatorId):null;
 const fresh=Boolean(!Number.isFinite(p?.flightInputAt)||now-p.flightInputAt<=.5);
 if(m.flightDashHeld&&!fresh){
   m.flightDashHeld=false;m.runStopRequested=false;m.runGroundPhase=null;
 }
 if(m.runGroundPhase){
   if(!p?.alive||m.terminalDive||m.terminalPrep||m.emergencyBrakeActive||
     m.rotorHP<=0||m.health<=0||m.flightCharge<=0||
     p.operatingFightFlightId!==m.id){
     m.runGroundPhase=null;m.runGroundReleased=false;m.flightDashHeld=false;
   }else if(m.runGroundPhase==='SPINUP'&&m.grounded)return;
   else {
     // Walking off a ledge during ground spool must not leave SPINUP latched
     // in free fall. A now-airborne Dash engages without an altitude wait.
     m.runGroundPhase=null;
     m.runGroundLaunchReady=true;
     m.rotorPowered=true;
   }
 }

 // These phases are governed by simulated motion ticks, not a stalled browser's
 // wall clock. A 500ms render stall must not erase a 360ms physical commitment.
 if(m.offensiveRun&&m.runStopRequested)m.runReleaseElapsed=(m.runReleaseElapsed??0)+dt;
 const finishing=Boolean(m.offensiveRun&&m.runStopRequested&&
   (m.runTravel??0)<VALKYRIE_RUN.minTravel&&(m.runReleaseElapsed??0)<1.25);
 const launchReady=Boolean(m.runGroundLaunchReady);
 m.runGroundLaunchReady=false;
 const valid=Boolean(!m.terminalDive&&!m.emergencyBrakeActive&&p?.alive&&
   p.operatingFightFlightId===m.id&&m.health>0&&m.rotorHP>0&&!m.grounded&&
   (finishing||launchReady||(m.flightDashHeld&&fresh)));
 const activeChivalry=Boolean(p&&activeUltimate(p,now)?.id==='chivalry');
 // A forthcoming terminal preparation gets first claim on a full meter.
 const preparing=Boolean(m.terminalPrep?.phase==='holding');
 // Reserve Chivalry's full meter briefly for a deliberate Dash+Ultimate
 // chord, without withholding propulsion during the decision window.
 const practice=room.mode==='PRACTICE'&&p?.actorKind==='human'&&!room.localTutorial;
 const chordReserve=Boolean(ascensionValkyrieReady(m,p,now,{practice})&&
   m.flightDashStartedAt!=null&&now-m.flightDashStartedAt<VALKYRIE_RUN.chargeGraceSec);
 const ascension=fightFlightSkillActive(m,now,ASCENSION.id);
 let running=valid&&!activeChivalry&&!preparing;
 // Training meters cycle without dropping the held propulsion state. This
 // exception is evaluated from the room and actual human owner every tick.
 if(running&&(!practice||ascension)&&!(m.flightCharge>0))running=false;
 if(!running||(!practice&&!ascension&&!(p.prowess>0))){
   if(m.offensiveRun)m.runAnimationEndedAt=now;
   if(m.offensiveRun)room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,action:'ended',at:now});
   m.offensiveRun=false;
   if(!valid||(ascension&&!(m.flightCharge>0))||
     (!practice&&!ascension&&(!(m.flightCharge>0)||!(p?.prowess>0))))m.flightDashHeld=false;
   m.runStopRequested=false;m.runTurnSpeed=0;m.runStartAt=null;m.runElapsed=0;
  // Do not force the rotor to hover forever after a Dash that started cold.
  if(!m.runRotorWasPowered&&!p?.input?.flightRise&&!p?.input?.jump)
    m.rotorPowered=false;
 }else{
   if(!m.offensiveRun){
     m.runAnimationStartedAt=now;m.offensiveRun=true;
     m.runStartAt=now;m.runElapsed=0;m.runReleaseElapsed=0;
     m.runStopRequested=Boolean(m.runGroundReleased);m.runGroundReleased=false;
     m.runLaunchStartY=m.y;m.runLaunchMinVy=0;m.runLaunchDrop=0;m.runLaunchDistance=0;
     m.runLastPosition={x:m.x,y:m.y,z:m.z};
     room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,operatorId:p.id,action:'started',at:now});}
   m.runElapsed=(m.runElapsed??0)+dt;
   if(ascension){
     // Replace prowess with charge at the exact ordinary Rise rate; the
     // locomotion integrator must not bill a second run surcharge.
     m.practiceDashRefilling=false;
     m.flightCharge=clamp(m.flightCharge-FIGHT_FLIGHT.climbCost*dt,0,m.maxFlightCharge);
     if(m.flightCharge<=0){
       m.runAnimationEndedAt=now;m.offensiveRun=false;m.flightDashHeld=false;
       room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,action:'ended',at:now});
     }
   }else if(chordReserve){
     // Real momentum and steering continue; only prowess spend waits.
     m.practiceDashRefilling=false;
   }else if(practice){
     // Keep the old cyclic Practice dash pacing, but give it a MACHINE-LOCAL
     // training energy pool. The player's full personal Ultimate is reserved
     // for Chivalry/Valkyrie and never drains (or fights an automatic refill).
     m.practiceDashEnergy??=PROWESS.full;
     if(m.practiceDashRefilling){
       m.practiceDashEnergy=clamp(m.practiceDashEnergy+VALKYRIE_RUN.practiceRefillPerSec*dt,0,PROWESS.full);
       if(m.practiceDashEnergy>=PROWESS.full){
         m.practiceDashRefilling=false;
         room.events.push({type:'fightFlightPracticeDash',machineId:m.id,operatorId:p.id,action:'refilled',at:now});
       }
     }else{
       m.practiceDashEnergy=clamp(m.practiceDashEnergy-VALKYRIE_RUN.drainPerSec*dt,0,PROWESS.full);
       if(m.practiceDashEnergy<=0){
         m.practiceDashRefilling=true;
         room.events.push({type:'fightFlightPracticeDash',machineId:m.id,operatorId:p.id,action:'refilling',at:now});
       }
     }
   }else{
     p.prowess=clamp((p.prowess??0)-VALKYRIE_RUN.drainPerSec*dt,0,PROWESS.full);
     if(p.prowess<=0){
       m.runAnimationEndedAt=now;m.offensiveRun=false;m.flightDashHeld=false;
       room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,action:'ended',at:now});
     }
   }
 }
 // Physical trajectory and visual chassis attitude are derived from the SAME
 // signed flight pitch. Negative aim pitches the nose and thrust DOWN.
 // The initial vector is captured at the press; aim cannot retarget it until
 // the commitment expires. Practice refills never restart this phase.
 const committed=Boolean(m.offensiveRun&&(m.runElapsed??0)<=VALKYRIE_RUN.commitmentSec);
 const livePitch=clamp(Number.isFinite(p?.input?.pitch)?p.input.pitch:0,
   -VALKYRIE_RUN.descentPitchLimit,VALKYRIE_RUN.pitchLimit);
 const floor=flightSupportAt(room.world,m.x,m.z,m.y+.75);
 let target=m.offensiveRun?(committed?m.runCommitPitch:livePitch):0;
 if(m.offensiveRun&&target<0){
   // Do not drive the rotor into an unavoidable ground strike. The chassis
   // still pitches and descends whenever there is actual vertical clearance.
   if(floor!=null){
     const clearance=m.y-floor;
     const available=clamp((clearance-VALKYRIE_RUN.clearance)/2.5,0,1);
     target=Math.max(target,-VALKYRIE_RUN.descentPitchLimit*available);
   }
 }
 // Keep ordinary Dash's full rotor lean, physical pitch tracking and ground
 // clearance behavior unchanged; terminal Valkyrie now calls this same servo.
 stepFlightPitchAttitude(m,dt,{target,requested:committed?m.runCommitPitch:livePitch,
   lead:committed?VALKYRIE_RUN.launchRotorLead:VALKYRIE_RUN.rotorAimLead,
   engaged:m.offensiveRun,ground:floor});

}

export function practiceFlightRun(room,m){
 const p=m?.operatorId?room.players.get(m.operatorId):null;
 return Boolean(room.mode==='PRACTICE'&&!room.localTutorial&&p?.actorKind==='human'&&p.alive&&
   p.operatingFightFlightId===m?.id&&m.offensiveRun&&(m.flightDashHeld||m.runStopRequested)&&!m.grounded&&m.health>0&&m.rotorHP>0&&!m.terminalDive&&!m.emergencyBrakeActive);
}
