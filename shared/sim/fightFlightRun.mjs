// Flight to the Valkyrie — offensive flight RUN only.
// Machine locomotion is authoritative; the expenditure belongs to the Spellblade.
import {PROWESS} from '../src/prowess.mjs';
import {activeUltimate} from '../src/ultimates.mjs';
import {tryDash} from './combat.mjs';
export const VALKYRIE_RUN=Object.freeze({drainPerSec:42,speed:18,turnRate:.85,
  acceleration:3.2,pitch:.34,chargeGraceSec:.30,chivalryDashImpulse:8});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function requestFlightDash(room,m,p,held,now){
 if(!m||m.mode==='DESTROYED'||m.terminalDive||m.health<=0||!p?.alive||room.players.get(p.id)!==p||
   m.operatorId!==p.id||p.operatingFightFlightId!==m.id)return false;
 const before=m.flightDashHeld===true;
 m.flightDashHeld=Boolean(held);
 if(!held){m.offensiveRun=false;m.flightDashStartedAt=null;return true;}
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
 const valid=Boolean(!m.terminalDive&&p?.alive&&p.operatingFightFlightId===m.id&&m.health>0&&m.rotorHP>0&&!m.grounded&&m.flightDashHeld);
 const activeChivalry=Boolean(p&&activeUltimate(p,now)?.id==='chivalry');
 // A forthcoming terminal preparation gets first claim on a full meter.
 const preparing=Boolean(m.terminalPrep?.phase==='holding');
 const grace=Boolean(p?.ultimate==='chivalry'&&!p.ultimateState&&(p.prowess??0)>=PROWESS.full&&now-(m.flightDashStartedAt??now)<VALKYRIE_RUN.chargeGraceSec);
 if(!valid||activeChivalry||preparing||grace||!(p.prowess>0)){
   if(m.offensiveRun){room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,action:'ended',at:now});}
   m.offensiveRun=false;
 }else{
   if(!m.offensiveRun){m.offensiveRun=true;room.events.push({type:'fightFlightOffensiveRun',machineId:m.id,operatorId:p.id,action:'started',at:now});}
   // Provisional full personal meter lasts 2.38 seconds. Never deduct
   // a Skill resource, machine flight charge, or an already active Ultimate.
   p.prowess=clamp(p.prowess-VALKYRIE_RUN.drainPerSec*dt,0,PROWESS.full);
   if(p.prowess<=0)m.offensiveRun=false;
 }
 const target=m.offensiveRun?VALKYRIE_RUN.pitch:0;
 m.runPitch=(m.runPitch??0)+(target-(m.runPitch??0))*(1-Math.exp(-dt*6));
}
