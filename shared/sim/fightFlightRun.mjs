// Flight to the Valkyrie — offensive flight RUN only.
// Machine locomotion is authoritative; the expenditure belongs to the Spellblade.
import {PROWESS} from '../src/prowess.mjs';
import {activeUltimate} from '../src/ultimates.mjs';
import {tryDash} from './combat.mjs';
export const VALKYRIE_RUN=Object.freeze({drainPerSec:42,practiceRefillPerSec:70,speed:18,turnRate:.85,
  acceleration:5.5,pitch:.34,pitchLimit:.85,pitchRate:1.1,chargeGraceSec:.30,chivalryDashImpulse:8});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function requestFlightDash(room,m,p,held,now){
 if(!m||m.mode==='DESTROYED'||m.terminalDive||m.health<=0||!p?.alive||room.players.get(p.id)!==p||
   m.operatorId!==p.id||p.operatingFightFlightId!==m.id)return false;
 const before=m.flightDashHeld===true;
 m.flightDashHeld=Boolean(held);
 if(!held){m.offensiveRun=false;m.flightDashStartedAt=null;m.practiceDashRefilling=false;return true;}
 if(before)return true;
 m.flightDashStartedAt=now;
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
 const valid=Boolean(!m.terminalDive&&!m.emergencyBrakeActive&&p?.alive&&p.operatingFightFlightId===m.id&&m.health>0&&m.rotorHP>0&&!m.grounded&&m.flightDashHeld&&(!Number.isFinite(p.flightInputAt)||now-p.flightInputAt<=.5));
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
   if(m.offensiveRun)room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,action:'ended',at:now});
   m.offensiveRun=false;
 }else{
   if(!m.offensiveRun){m.offensiveRun=true;room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,operatorId:p.id,action:'started',at:now});}
   if(practice&&m.practiceDashRefilling){
     p.prowess=clamp((p.prowess??0)+VALKYRIE_RUN.practiceRefillPerSec*dt,0,PROWESS.full);
     if(p.prowess>=PROWESS.full){m.practiceDashRefilling=false;room.events.push({type:'fightFlightPracticeDash',machineId:m.id,operatorId:p.id,action:'refilled',at:now});}
   }else{
     p.prowess=clamp((p.prowess??0)-VALKYRIE_RUN.drainPerSec*dt,0,PROWESS.full);
     if(p.prowess<=0){
       if(practice){m.practiceDashRefilling=true;room.events.push({type:'fightFlightPracticeDash',machineId:m.id,operatorId:p.id,action:'refilling',at:now});}
       else{m.offensiveRun=false;room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,action:'ended',at:now});}
     }
   }
 }
 // The authored offensive posture leans .34 radians forward in level flight.
 // Steering rotates that complete posture; thrust uses the same attitude with
 // this neutral trim removed, keeping a level crosshair a level flight path.
 if(m.terminalDive)return; // committed Dive owns its irreversible attitude
 const pitch=Number.isFinite(p?.input?.pitch)?p.input.pitch:0;
 const approach=(value,target)=>value+clamp(target-value,-VALKYRIE_RUN.pitchRate*dt,VALKYRIE_RUN.pitchRate*dt);
 m.runTrim=approach(m.runTrim??0,m.offensiveRun?VALKYRIE_RUN.pitch:0);
 m.runFlightPitch=approach(m.runFlightPitch??0,m.offensiveRun?clamp(pitch,-VALKYRIE_RUN.pitchLimit,VALKYRIE_RUN.pitchLimit):0);
 m.runPitch=m.runTrim-m.runFlightPitch;

}

export function practiceFlightRun(room,m){
 const p=m?.operatorId?room.players.get(m.operatorId):null;
 return Boolean(room.mode==='PRACTICE'&&!room.localTutorial&&p?.actorKind==='human'&&p.alive&&
   p.operatingFightFlightId===m?.id&&m.offensiveRun&&m.flightDashHeld&&!m.grounded&&m.health>0&&m.rotorHP>0&&!m.terminalDive&&!m.emergencyBrakeActive);
}
