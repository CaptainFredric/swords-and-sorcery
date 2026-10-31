// Terminal Valkyrie Dive: deliberate Dash+ready-Chivalry held commitment.
// Actual moving machine, one expenditure per lifecycle, one outcome at real impact.
// Both input state and destruction are authoritative; no client damage or teleports.
import {PROWESS} from '../src/prowess.mjs';
import {segmentAabbHit} from '../src/collision.mjs';
import {areAllies} from '../src/teams.mjs';
import {applyDamage,killPlayer} from './combat.mjs';
export const TERMINAL=Object.freeze({holdSec:1,timeout:5,maxSpeed:25,
  gravity:18,burnPerSec:10,explosionRadius:8,explosionDamage:105,
  fireDuration:7,fireRadius:4,fireTickDamage:4,fireInterval:.55});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ready=(m,p)=>Boolean(m&&!m.terminalDive&&!m.terminalDiveSpent&&m.rotorHP>0&&
  p?.alive&&p.ultimate==='chivalry'&&!p.ultimateState&&(p.prowess??0)>=PROWESS.full);
const operator=(room,m,p)=>Boolean(m&&m.mode!=='DESTROYED'&&m.health>0&&
  p?.alive&&room.players.get(p.id)===p&&m.operatorId===p.id&&p.operatingFightFlightId===m.id);
export function setFlightUltimateHold(room,m,p,down,now){
 if(!operator(room,m,p))return {rejected:'Operate Fight-and-Flight first.'};
 const prior=Boolean(m.flightUltimateHeld),wasAt=m.flightUltimateDownAt??now;
 m.flightUltimateHeld=Boolean(down);
 if(down){if(!prior)m.flightUltimateDownAt=now;return {};}
 if(m.terminalPrep){m.terminalPrep=null;room.events.push({type:'fightFlightTerminalPrep',machineId:m.id,action:'cancelled',at:now});}
 const tap=!m.flightDashHeld&&prior&&now-wasAt<=.35&&!m.terminalDive;
 m.flightUltimateDownAt=null;
 return {tapUltimate:tap};
}
export function stepTerminalPreparation(room,m,now){
 if(!m||m.retired||m.mode==='DESTROYED'||m.terminalDive)return;
 const p=room.players.get(m.operatorId);
 const both=Boolean(operator(room,m,p)&&!m.grounded&&m.flightDashHeld&&m.flightUltimateHeld);
 if(!both||!ready(m,p)){
  if(m.terminalPrep){m.terminalPrep=null;room.events.push({type:'fightFlightTerminalPrep',machineId:m.id,action:'cancelled',at:now});}
  return;
 }
 if(!m.terminalPrep){
  m.terminalPrep={phase:'holding',startedAt:Math.max(m.flightDashStartedAt??now,m.flightUltimateDownAt??now),until:now+TERMINAL.holdSec};
  m.offensiveRun=false;
  room.events.push({type:'fightFlightTerminalPrep',machineId:m.id,operatorId:p.id,action:'started',until:m.terminalPrep.until,at:now});
 }
 if(now+1e-8<m.terminalPrep.until)return;
 // Validate again before irrevocably spending the actual ready Chivalry.
 if(!ready(m,p))return;
 p.prowess=0;
 m.terminalDiveSpent=true;
 m.terminalDive={operatorId:p.id,startedAt:now,expiresAt:now+TERMINAL.timeout,
  heading:m.heading,impactAt:null,resolved:false,chargeAtCommit:m.flightCharge};
 m.flightUltimateHeld=false;m.flightDashHeld=false;m.offensiveRun=false;
 m.terminalPrep=null;m.mode='TERMINAL';m.runPitch=.34;
 room.events.push({type:'fightFlightTerminalCommitted',machineId:m.id,operatorId:p.id,
   trajectory:{x:m.x,y:m.y,z:m.z,heading:m.heading,velocity:{...m.velocity}},
   expiresAt:m.terminalDive.expiresAt,at:now});
}
export function advanceTerminalFlight(room,m,dt,now){
 const dive=m?.terminalDive;if(!dive||dive.resolved)return;
 const t=Math.max(0,now-dive.startedAt);
 if(m.rotorHP>0){
   // Do not snap direction to a target. Increase forward momentum from the
   // heading at commitment; the player cannot arbitrarily steer this trajectory.
   const speed=Math.min(TERMINAL.maxSpeed,12+9*t);
   const fx=-Math.sin(dive.heading),fz=-Math.cos(dive.heading);
   m.velocity.x+=(fx*speed-m.velocity.x)*Math.min(1,dt*2.6);
   m.velocity.z+=(fz*speed-m.velocity.z)*Math.min(1,dt*2.6);
 }else{
   m.velocity.x*=Math.exp(-dt*.1);m.velocity.z*=Math.exp(-dt*.1);
 }
 m.velocity.y=Math.max(-25,m.velocity.y-TERMINAL.gravity*dt);
 m.runPitch=Math.min(1.03,(m.runPitch??.34)+dt*.65);
 m.health=Math.max(1,m.health-dt*(TERMINAL.burnPerSec+6*t));
 m.flightCharge=Math.max(0,m.flightCharge-4*dt);
 m.mode='TERMINAL';
}
function occluded(room,from,p){
 const end=[p.position.x,p.position.y+.9,p.position.z];
 return (room.world?.solids??[]).some(b=>{
   if(String(b.id??'').startsWith('fight-flight'))return false;
   const hit=segmentAabbHit([from.x,from.y+.6,from.z],end,b);
   return hit&&hit.t>.02&&hit.t<.98;
 });
}
export function resolveTerminalFlight(room,m,now){
 const d=m?.terminalDive;
 if(!d||d.resolved)return false;
 if(!m.grounded&&d.impactAt==null&&now<d.expiresAt)return false;
 d.resolved=true;d.resolvedAt=now;
 const point={x:m.x,y:m.y,z:m.z};
 const reason=d.impactAt!=null?'impact':m.grounded?'landing':'timeout';
 room.events.push({type:'fightFlightTerminalExplosion',machineId:m.id,operatorId:d.operatorId,
   point,radius:TERMINAL.explosionRadius,reason,at:now});
 for(const p of room.players.values()){
   if(!p.alive||p.id===d.operatorId||areAllies(room,d.operatorId,p.id))continue;
   const dy=clamp((p.position.y+.9)-point.y,-6,6);
   const dist=Math.hypot(p.position.x-point.x,dy,p.position.z-point.z);
   if(dist>TERMINAL.explosionRadius||occluded(room,point,p))continue;
   const raw=Math.max(0,Math.round(TERMINAL.explosionDamage*(1-dist/TERMINAL.explosionRadius)**1.3));
   if(raw>0)applyDamage(room,d.operatorId,p.id,raw,'fight-flight-terminal',now,null,{ultimate:true});
 }
 const pilot=room.players.get(d.operatorId);
 if(pilot?.alive)killPlayer(room,pilot.id,null,'fight-flight-terminal',now);
 else if(pilot?.terminalRespawnDeferredFor===m.id){
   pilot.respawnAt=now+(room.policy?.respawnSec??5);
   pilot.terminalRespawnDeferredFor=null;
 }
 m.health=0;m.mode='DESTROYED';m.operatorId=null;m.firingOperatorId=null;
 m.flightDashHeld=false;m.flightUltimateHeld=false;
 room.flightBurnZones??=[];
 room.flightBurnZones.push({id:m.id+'-burn',sourceId:d.operatorId,point,radius:TERMINAL.fireRadius,
   startedAt:now,expiresAt:now+TERMINAL.fireDuration,nextTickAt:now+TERMINAL.fireInterval});
 return true;
}
export function stepFlightBurnZones(room,now){
 room.flightBurnZones??=[];
 for(const zone of room.flightBurnZones){
   if(now+1e-8<zone.nextTickAt||now>=zone.expiresAt)continue;
   zone.nextTickAt=now+TERMINAL.fireInterval;
   for(const p of room.players.values()){
     if(!p.alive||areAllies(room,zone.sourceId,p.id))continue;
     if(Math.hypot(p.position.x-zone.point.x,p.position.z-zone.point.z)>zone.radius||
       Math.abs(p.position.y-zone.point.y)>1.5||occluded(room,zone.point,p))continue;
     applyDamage(room,zone.sourceId,p.id,TERMINAL.fireTickDamage,'fight-flight-burning-ground',now,null,{ultimate:true,ongoing:true});
   }
 }
 room.flightBurnZones=room.flightBurnZones.filter(z=>now<z.expiresAt);
}
