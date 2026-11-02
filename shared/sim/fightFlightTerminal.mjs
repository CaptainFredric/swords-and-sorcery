// Terminal Valkyrie Dive: deliberate Dash+ready-Chivalry held commitment.
// Actual moving machine, one expenditure per lifecycle, one outcome at real impact.
// Both input state and destruction are authoritative; no client damage or teleports.
import {PROWESS} from '../src/prowess.mjs';
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {areAllies} from '../src/teams.mjs';
import {beginSiegeWreck} from './siegeWreck.mjs';
import {applyDamage,killPlayer} from './combat.mjs';
import {blastBiByeLlista} from './biByeLlista.mjs';
import {blastSoFistication} from './soFistication.mjs';
import {structureWorld,damageStructureSolid} from './structures.mjs';
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
 if(down){if(!prior){m.flightUltimateDownAt=now;m.flightUltimateChordAttempted=false;}return {};}
 const wasPreparing=Boolean(m.terminalPrep);
 if(wasPreparing){m.terminalPrep=null;room.events.push({type:'fightFlightTerminalPrep',machineId:m.id,action:'cancelled',at:now});}
 // Once an attempted Dash+Ultimate chord has begun, cancelling Dash first
 // must NEVER turn the later Ultimate release into an accidental activation.
 const tap=!wasPreparing&&!m.flightUltimateChordAttempted&&!m.flightDashHeld&&prior&&!m.terminalDive;
 m.flightUltimateDownAt=null;m.flightUltimateChordAttempted=false;
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
  m.flightUltimateChordAttempted=true;
  m.offensiveRun=false;
  room.events.push({type:'fightFlightTerminalPrep',machineId:m.id,operatorId:p.id,action:'started',until:m.terminalPrep.until,at:now});
 }
 if(now+1e-8<m.terminalPrep.until)return;
 // Validate again before irrevocably spending the actual ready Chivalry.
 if(!ready(m,p))return;
 p.prowess=0;
 m.terminalDiveSpent=true;
 m.terminalDive={operatorId:p.id,startedAt:now,expiresAt:now+TERMINAL.timeout,
  heading:m.heading,impactAt:null,resolved:false,chargeAtCommit:m.flightCharge,
  // LocalHost may deliver fewer than 30 callbacks per wall-clock second in a
  // saturated browser. The dive's finite TIMEOUT must represent simulated
  // travel, not expire while its chassis has barely moved.
  simulatedSec:0,lastWallStepAt:now};
 m.flightUltimateHeld=false;m.flightDashHeld=false;m.offensiveRun=false;
 m.terminalPrep=null;m.mode='TERMINAL';m.runPitch=.34;
 room.events.push({type:'fightFlightTerminalCommitted',machineId:m.id,operatorId:p.id,
   trajectory:{x:m.x,y:m.y,z:m.z,heading:m.heading,velocity:{...m.velocity}},
   expiresAt:m.terminalDive.expiresAt,at:now});
}
export function terminalFlightSteps(dive,now,dt){
 // Preserve real 30 Hz physics under a throttled solo/browser host without
 // an unbounded catch-up loop. Other room actors still advance normally.
 const elapsed=Math.max(dt,now-(dive.lastWallStepAt??dive.startedAt));
 dive.lastWallStepAt=now;
 return Math.max(1,Math.min(45,Math.ceil(Math.min(1.5,elapsed)/dt)));
}
export function advanceTerminalFlight(room,m,dt,now){
 const dive=m?.terminalDive;if(!dive||dive.resolved)return;
 dive.simulatedSec=(dive.simulatedSec??0)+dt;
 const t=dive.simulatedSec;
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
 m.health=m.health>0?Math.max(1,m.health-dt*(TERMINAL.burnPerSec+6*t)):0;
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
 // Finish on real collision, after five simulated flight seconds, or an
 // independent long wall-clock failsafe if the entire room becomes unresponsive.
 // The wall failsafe is intentionally not the normal detonation mechanism.
 if(!m.grounded&&d.impactAt==null&&(d.simulatedSec??0)<TERMINAL.timeout&&now<d.expiresAt+30)return false;
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
 // Use established per-component blast allocations for both siege engines;
 // destructible masonry is damaged at its actual nearest exposed surface.
 const blast={point,radius:TERMINAL.explosionRadius,damage:TERMINAL.explosionDamage};
 if(room.biByeLlista)blastBiByeLlista(room,room.biByeLlista,blast,d.operatorId,'fight-flight-terminal',now,room.world?.solids??[]);
 if(room.soFistication)blastSoFistication(room,room.soFistication,blast,d.operatorId,'fight-flight-terminal',now);
 const usedStructures=new Set();
 for(const solid of structureWorld(room.world,room.structures).solids??[]){
   const id=String(solid.structureId??solid.id??'');
   if(!id||usedStructures.has(id)||!Array.isArray(solid.center)||!Array.isArray(solid.size))continue;
   const delta=solid.center.map((v,i)=>Math.max(0,Math.abs(v-[point.x,point.y,point.z][i])-solid.size[i]/2));
   const distance=Math.hypot(...delta);
   if(distance>=TERMINAL.explosionRadius)continue;
   const cover=(room.world?.solids??[]).some(other=>other.id!==solid.id&&
     segmentAabbHit([point.x,point.y+.6,point.z],solid.center,other)?.t<.98);
   if(cover)continue;
   const amount=TERMINAL.explosionDamage*(1-distance/TERMINAL.explosionRadius)**1.3;
   if(damageStructureSolid(room,solid,amount,d.operatorId,'fight-flight-terminal',now,{point}))usedStructures.add(id);
 }
 const pilot=room.players.get(d.operatorId);
 if(pilot?.alive){
   // An intentional sacrifice must not award a stray prior knockback attacker
   // a defeat for the dive's own explosion.
   pilot.lastKnockbackAt=-Infinity;pilot.lastAttackerId=null;
   killPlayer(room,pilot.id,null,'fight-flight-terminal',now);
 }
 else if(pilot?.terminalRespawnDeferredFor===m.id){
   pilot.respawnAt=now+(room.policy?.respawnSec??5);
   pilot.terminalRespawnDeferredFor=null;
 }
 beginSiegeWreck(room,m,'fight-flight',now,{attackerId:d.operatorId,source:'fight-flight-terminal',point});
 m.health=0;m.mode='DESTROYED';m.operatorId=null;m.firingOperatorId=null;
 m.flightDashHeld=false;m.flightUltimateHeld=false;
 room.flightBurnZones??=[];
 // The explosion follows the actual 3D impact; its *ground* fire settles onto
 // supported terrain, rather than hovering at the chassis altitude after a wall hit.
 const floor=surfaceHeightAt(point.x,point.z,point.y+1,room.world);
 // A detonation over an abyss or far above any surface has no burning GROUND.
 // Never create a hovering damage zone at its airborne explosion coordinates.
 if(floor!=null&&point.y-floor<=TERMINAL.explosionRadius){
   const firePoint={x:point.x,y:floor,z:point.z};
   room.flightBurnZones.push({id:m.id+'-burn',sourceId:d.operatorId,point:firePoint,radius:TERMINAL.fireRadius,
     startedAt:now,expiresAt:now+TERMINAL.fireDuration,nextTickAt:now+TERMINAL.fireInterval});
 }
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
