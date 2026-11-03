// Flight to the Valkyrie — offensive flight RUN only.
// Machine locomotion is authoritative; the expenditure belongs to the Spellblade.
import {PROWESS} from '../src/prowess.mjs';
import {activeUltimate} from '../src/ultimates.mjs';
import {tryDash} from './combat.mjs';
import {flightSupportAt} from './flightSupport.mjs';
export const VALKYRIE_RUN=Object.freeze({
  drainPerSec:42,practiceRefillPerSec:70,speed:18,
  // A committed attack, then a heavier, acceleration-limited turn than ordinary flight.
  commitmentSec:.36,minTravel:10,turnRate:1.65,turnAcceleration:5.4,
  acceleration:5.5,pitch:.18,visualTrim:1.0,pitchLimit:.85,pitchRate:1.45,
  clearance:1.1,chargeGraceSec:.30,chivalryDashImpulse:8,
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function requestFlightDash(room,m,p,held,now){
 if(!m||m.mode==='DESTROYED'||m.terminalDive||m.health<=0||!p?.alive||room.players.get(p.id)!==p||
   m.operatorId!==p.id||p.operatingFightFlightId!==m.id)return false;
 const before=m.flightDashHeld===true;
 if(!held&&!before)return true; // duplicate release cannot extend a minimum launch
 m.flightDashHeld=Boolean(held);
 if(!held){
   m.runStopRequested=Boolean(m.offensiveRun);m.runReleaseElapsed=0;
   if(m.offensiveRun&&(m.runTravel??0)>=VALKYRIE_RUN.minTravel){m.runAnimationEndedAt=now;m.offensiveRun=false;m.runStopRequested=false;}
   m.runReleasedAt=now;m.flightDashStartedAt=null;
   if(!m.offensiveRun)m.practiceDashRefilling=false;
   return true;
 }
 if(before)return true;
 m.flightDashStartedAt=now;
 m.runCommitHeading=Number.isFinite(p.input?.yaw)?p.input.yaw:m.heading;
 const aimPitch=clamp(Number.isFinite(p.input?.pitch)?p.input.pitch:0,
   -VALKYRIE_RUN.pitchLimit,VALKYRIE_RUN.pitchLimit);
 // Level launches make a shallow attacking descent; upward intent stays upward.
 m.runCommitPitch=aimPitch>0?aimPitch:Math.min(-VALKYRIE_RUN.pitch,aimPitch);
 m.runStartAt=null;m.runElapsed=0;m.runTravel=0;m.runLastPosition=null;
 m.runStopRequested=false;m.runReleasedAt=null;m.runTurnSpeed=0;
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
 const p=m.operatorId?room.players.get(m.operatorId):null;
 const fresh=Boolean(!Number.isFinite(p?.flightInputAt)||now-p.flightInputAt<=.5);
 if(m.flightDashHeld&&!fresh){m.flightDashHeld=false;m.runStopRequested=false;}

 // These phases are governed by simulated motion ticks, not a stalled browser's
 // wall clock. A 500ms render stall must not erase a 360ms physical commitment.
 if(m.offensiveRun&&m.runStopRequested)m.runReleaseElapsed=(m.runReleaseElapsed??0)+dt;
 const finishing=Boolean(m.offensiveRun&&m.runStopRequested&&
   (m.runTravel??0)<VALKYRIE_RUN.minTravel&&(m.runReleaseElapsed??0)<1.25);
 const valid=Boolean(!m.terminalDive&&!m.emergencyBrakeActive&&p?.alive&&
   p.operatingFightFlightId===m.id&&m.health>0&&m.rotorHP>0&&!m.grounded&&
   (finishing||(m.flightDashHeld&&fresh)));
 const activeChivalry=Boolean(p&&activeUltimate(p,now)?.id==='chivalry');
 // A forthcoming terminal preparation gets first claim on a full meter.
 const preparing=Boolean(m.terminalPrep?.phase==='holding');
 const grace=Boolean(p?.ultimate==='chivalry'&&!p.ultimateState&&(p.prowess??0)>=PROWESS.full&&now-(m.flightDashStartedAt??now)<VALKYRIE_RUN.chargeGraceSec);
 const practice=room.mode==='PRACTICE'&&p?.actorKind==='human'&&!room.localTutorial;
 let running=valid&&!activeChivalry&&!preparing&&!grace;
 // Training meters cycle without dropping the held propulsion state. This
 // exception is evaluated from the room and actual human owner every tick.
 if(running&&!practice&&!(m.flightCharge>0))running=false;
 if(!running||(!practice&&!(p.prowess>0))){
   if(m.offensiveRun)m.runAnimationEndedAt=now;
   if(m.offensiveRun)room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,action:'ended',at:now});
   m.offensiveRun=false;
   if(!valid||(!practice&&(!(m.flightCharge>0)||!(p?.prowess>0))))m.flightDashHeld=false;
   m.runStopRequested=false;m.runTurnSpeed=0;m.runStartAt=null;m.runElapsed=0;
 }else{
   if(!m.offensiveRun){
     m.runAnimationStartedAt=now;m.offensiveRun=true;
     m.runStartAt=now;m.runElapsed=0;m.runReleaseElapsed=0;
     m.runLaunchStartY=m.y;m.runLaunchMinVy=0;m.runLaunchDrop=0;m.runLaunchDistance=0;
     m.runLastPosition={x:m.x,y:m.y,z:m.z};
     room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,operatorId:p.id,action:'started',at:now});}
   m.runElapsed=(m.runElapsed??0)+dt;
   if(practice&&m.practiceDashRefilling){
     p.prowess=clamp((p.prowess??0)+VALKYRIE_RUN.practiceRefillPerSec*dt,0,PROWESS.full);
     if(p.prowess>=PROWESS.full){m.practiceDashRefilling=false;room.events.push({type:'fightFlightPracticeDash',machineId:m.id,operatorId:p.id,action:'refilled',at:now});}
   }else{
     p.prowess=clamp((p.prowess??0)-VALKYRIE_RUN.drainPerSec*dt,0,PROWESS.full);
     if(p.prowess<=0){
       if(practice){m.practiceDashRefilling=true;room.events.push({type:'fightFlightPracticeDash',machineId:m.id,operatorId:p.id,action:'refilling',at:now});}
       else{m.runAnimationEndedAt=now;m.offensiveRun=false;m.flightDashHeld=false;room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,action:'ended',at:now});}
     }
   }
 }
 // Physical trajectory and visual chassis attitude are derived from the SAME
 // signed flight pitch. Negative aim pitches the nose and thrust DOWN.
 // The initial vector is captured at the press; aim cannot retarget it until
 // the commitment expires. Practice refills never restart this phase.
 if(m.terminalDive)return; // irreversible Dive owns its own physics
 const committed=Boolean(m.offensiveRun&&(m.runElapsed??0)<=VALKYRIE_RUN.commitmentSec);
 const livePitch=clamp(Number.isFinite(p?.input?.pitch)?p.input.pitch:0,
   -VALKYRIE_RUN.pitchLimit,VALKYRIE_RUN.pitchLimit);
 let target=m.offensiveRun?(committed?m.runCommitPitch:livePitch):0;
 if(m.offensiveRun&&target<0){
   // Do not drive the rotor into an unavoidable ground strike. The chassis
   // still pitches and descends whenever there is actual vertical clearance.
   const floor=flightSupportAt(room.world,m.x,m.z,m.y+.35);
   if(floor!=null){
     const clearance=m.y-floor;
     const available=clamp((clearance-VALKYRIE_RUN.clearance)/2.5,0,1);
     target=Math.max(target,-VALKYRIE_RUN.pitchLimit*available);
   }
 }
 const approach=(value,goal,rate)=>value+clamp(goal-value,-rate*dt,rate*dt);
 m.runTrim=approach(m.runTrim??0,m.offensiveRun?VALKYRIE_RUN.visualTrim*(1-clamp((m.runFlightPitch??0)/.5,0,1)):0,VALKYRIE_RUN.pitchRate);
 m.runFlightPitch=approach(m.runFlightPitch??0,target,
   target>m.runFlightPitch?VALKYRIE_RUN.pitchRate*1.8:VALKYRIE_RUN.pitchRate);
 m.runPitch=clamp(m.runTrim-m.runFlightPitch,-.85,1.20);

}

export function practiceFlightRun(room,m){
 const p=m?.operatorId?room.players.get(m.operatorId):null;
 return Boolean(room.mode==='PRACTICE'&&!room.localTutorial&&p?.actorKind==='human'&&p.alive&&
   p.operatingFightFlightId===m?.id&&m.offensiveRun&&(m.flightDashHeld||m.runStopRequested)&&!m.grounded&&m.health>0&&m.rotorHP>0&&!m.terminalDive&&!m.emergencyBrakeActive);
}
