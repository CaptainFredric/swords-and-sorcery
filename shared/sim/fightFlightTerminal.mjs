// Terminal Valkyrie Dive: active Ascension + ready Chivalry + held Dash/Ultimate.
// Actual moving machine, one expenditure per lifecycle, one outcome at real impact.
// Both input state and destruction are authoritative; no client damage or teleports.
import {ascensionValkyrieReady} from '../src/flightTerminalPolicy.mjs';
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {areAllies} from '../src/teams.mjs';
import {beginSiegeWreck} from './siegeWreck.mjs';
import {endSiegeSteel} from './siegeSteel.mjs';
import {applyDamage,killPlayer} from './combat.mjs';
import {blastBiByeLlista} from './biByeLlista.mjs';
import {blastSoFistication} from './soFistication.mjs';
import {structureWorld,damageStructureSolid} from './structures.mjs';
export const TERMINAL=Object.freeze({holdSec:1,timeout:18,maxSpeed:31,
  gravity:18,burnPerSec:4,burnRampPerSec:1.7,chargeBurnPerSec:3.2,chargeBurnRamp:.65,
  explosionRadius:8,explosionDamage:105,
  fireDuration:7,fireRadius:4,fireTickDamage:4,fireInterval:.42,fireIntervalEnd:2.1,
  minBlastRadius:6,maxBlastRadius:13,minBlastDamage:75,maxBlastDamage:210,
  minFireRadius:3.5,maxFireRadius:7,minFireDuration:7,maxFireDuration:12,
  minFireTick:4,maxFireTick:9,blastFalloffPower:1.5});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ready=(m,p,now)=>ascensionValkyrieReady(m,p,now);
const healthFraction=(hp,max)=>clamp((Number.isFinite(hp)?hp:0)/max,0,1);
/** Condition is evaluated at IMPACT. Every extra second of rotor pursuit
 * trades continuing pressure for a weaker eventual area blast. */
export function terminalBlastProfile(m){
 const condition=clamp(
   .46*healthFraction(m?.health,m?.maxHealth||250)
   +.23*healthFraction(m?.rotorHP,100)
   +.105*healthFraction(m?.braceLHP,80)
   +.105*healthFraction(m?.braceRHP,80)
   +.10*healthFraction(m?.flightCharge,m?.maxFlightCharge||100),0,1);
 const lerp=(a,b)=>a+(b-a)*condition;
 return {
   condition,
   radius:lerp(TERMINAL.minBlastRadius,TERMINAL.maxBlastRadius),
   damage:lerp(TERMINAL.minBlastDamage,TERMINAL.maxBlastDamage),
   fireRadius:lerp(TERMINAL.minFireRadius,TERMINAL.maxFireRadius),
   fireDuration:lerp(TERMINAL.minFireDuration,TERMINAL.maxFireDuration),
   fireTickDamage:lerp(TERMINAL.minFireTick,TERMINAL.maxFireTick),
 };
}
export const terminalRadialDamage=(damage,distance,radius)=>
  radius>0?Math.max(0,Math.round(damage*Math.max(0,1-distance/radius)**TERMINAL.blastFalloffPower)):0;
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
 if(!both||!ready(m,p,now)){
  if(m.terminalPrep){m.terminalPrep=null;room.events.push({type:'fightFlightTerminalPrep',machineId:m.id,action:'cancelled',at:now});}
  return;
 }
 if(!m.terminalPrep){
  m.terminalPrep={phase:'holding',startedAt:Math.max(m.flightDashStartedAt??now,m.flightUltimateDownAt??now),until:now+TERMINAL.holdSec};
  m.flightUltimateChordAttempted=true;
  // The charged rotor stays powered through commitment; never reset velocity
  // or emit an ordinary Dash release in the pre-commit tick.
  m.rotorPowered=true;
  m.offensiveRun=false;
  room.events.push({type:'fightFlightTerminalPrep',machineId:m.id,operatorId:p.id,action:'started',until:m.terminalPrep.until,at:now});
 }
 if(now+1e-8<m.terminalPrep.until)return;
 // Validate again before irrevocably spending the actual ready Chivalry.
 if(!ready(m,p,now))return;
 commitTerminalDive(room,m,p,now);
}
function commitTerminalDive(room,m,p,now){
 if(!operator(room,m,p)||m.grounded||!ready(m,p,now))return false;
 p.prowess=0;
 m.terminalDiveSpent=true;
 const blastProfile=terminalBlastProfile(m);
 m.terminalDive={operatorId:p.id,startedAt:now,expiresAt:now+TERMINAL.timeout,
  blastProfile,
  heading:m.heading,impactAt:null,resolved:false,chargeAtCommit:m.flightCharge,
  // LocalHost may deliver fewer than 30 callbacks per wall-clock second in a
  // saturated browser. The dive's finite TIMEOUT must represent simulated
  // travel, not expire while its chassis has barely moved.
  simulatedSec:0,lastWallStepAt:now};
 m.flightUltimateHeld=false;m.flightDashHeld=false;m.offensiveRun=false;
 m.terminalPrep=null;m.mode='TERMINAL';m.runPitch=.34;m.runTurnSpeed=0;
 m.rotorPowered=true; // The blades still fight until the drive burns out.
 room.events.push({type:'fightFlightTerminalCommitted',machineId:m.id,operatorId:p.id,
   trajectory:{x:m.x,y:m.y,z:m.z,heading:m.heading,velocity:{...m.velocity}},
   expiresAt:m.terminalDive.expiresAt,blastProfile,at:now});
 return true;
}
/** A valid mobile Dagaz + halo gesture commits directly. The host still
 * checks the same full Ascension/Chivalry/rotor/charge/airborne requirements
 * as the held Dash+Ultimate chord. No client-provided power or radius accepted.
 */
export function requestTerminalRitual(room,m,p,now){
 if(!operator(room,m,p)||m.grounded||!ready(m,p,now))return false;
 return commitTerminalDive(room,m,p,now);
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
 const t=dive.simulatedSec,pilot=room.players.get(dive.operatorId);
 const hasPilot=Boolean(pilot?.alive&&m.operatorId===pilot.id);
 const failure=clamp((t-4.5)/9,0,1);
 const charged=Boolean(m.rotorHP>0&&m.health>0&&m.flightCharge>0);
 const speed=Math.min(TERMINAL.maxSpeed,15+1.55*t);
 const fx=-Math.sin(m.heading),fz=-Math.cos(m.heading);
 const responsiveness=charged?2.55-failure*.9:1.3;
 m.velocity.x+=(fx*speed-m.velocity.x)*Math.min(1,dt*responsiveness);
 m.velocity.z+=(fz*speed-m.velocity.z)*Math.min(1,dt*responsiveness);
 // Positive look pitch ascends; trim decays while the overheated mechanism
 // loses lift. An exhausted engine falls rather than detonating in thin air.
 const pitch=hasPilot&&Number.isFinite(pilot.input?.pitch)?clamp(pilot.input.pitch,-.8,.65):0;
 const trim=pitch*3.8*(1-failure);
 const targetVy=charged?trim-.15-failure*13:-Math.min(25,5+2*t);
 m.velocity.y+=clamp(targetVy-m.velocity.y,-15,15)*Math.min(1,dt*(charged?2.1:2.7));
 m.velocity.y=Math.max(-25,m.velocity.y);
 m.runPitch=Math.min(1.14,.35+.043*t+.28*failure);
 m.health=Math.max(0,m.health-dt*(TERMINAL.burnPerSec+TERMINAL.burnRampPerSec*t));
 m.flightCharge=Math.max(0,m.flightCharge-dt*(TERMINAL.chargeBurnPerSec+TERMINAL.chargeBurnRamp*t));
 m.rotorPowered=charged&&m.health>0&&m.flightCharge>0;
 m.mode='TERMINAL';
}
function terminalOutsideWorld(m,world){
 if(!world)return false;
 if(Number.isFinite(world.abyssY)&&m.y<=world.abyssY)return true;
 // Map-wide bounds, not the support directly below the aircraft: bridging a
 // legitimate abyss must never count as leaving the arena.
 const floors=(world.floors??[]).filter(f=>Array.isArray(f?.center)&&Array.isArray(f?.size));
 if(!floors.length)return false;
 const minX=Math.min(...floors.map(f=>f.center[0]-f.size[0]/2))-32;
 const maxX=Math.max(...floors.map(f=>f.center[0]+f.size[0]/2))+32;
 const minZ=Math.min(...floors.map(f=>f.center[2]-f.size[2]/2))-32;
 const maxZ=Math.max(...floors.map(f=>f.center[2]+f.size[2]/2))+32;
 return m.x<minX||m.x>maxX||m.z<minZ||m.z>maxZ;
}
export const terminalFireInterval=age=>TERMINAL.fireInterval+
 (TERMINAL.fireIntervalEnd-TERMINAL.fireInterval)*clamp(age,0,1)**2;

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
 // Structural impact, landing or genuine departure from the authored map.
 // Neither a wall-clock fuse nor an arbitrary flight duration detonates midair.
 const outside=terminalOutsideWorld(m,room.world);
 if(!m.grounded&&d.impactAt==null&&!outside)return false;
 d.resolved=true;d.resolvedAt=now;
 const point={x:m.x,y:m.y,z:m.z};
 const reason=d.impactAt!=null?'impact':m.grounded?'landing':'out-of-bounds';
 const blastProfile=terminalBlastProfile(m);
 d.impactBlastProfile=blastProfile;
 const {radius,damage,fireRadius,fireDuration,fireTickDamage}=blastProfile;
 room.events.push({type:'fightFlightTerminalExplosion',machineId:m.id,operatorId:d.operatorId,
   point,radius,damage,condition:blastProfile.condition,fireDuration,fireRadius,reason,at:now});
 for(const p of room.players.values()){
   if(!p.alive||p.id===d.operatorId||areAllies(room,d.operatorId,p.id))continue;
   const dy=clamp((p.position.y+.9)-point.y,-6,6);
   const dist=Math.hypot(p.position.x-point.x,dy,p.position.z-point.z);
   if(dist>radius||occluded(room,point,p))continue;
   const raw=terminalRadialDamage(damage,dist,radius);
   if(raw>0)applyDamage(room,d.operatorId,p.id,raw,'fight-flight-terminal',now,null,{ultimate:true});
 }
 // Use established per-component blast allocations for both siege engines;
 // destructible masonry is damaged at its actual nearest exposed surface.
 const blast={point,radius,damage};
 if(room.biByeLlista)blastBiByeLlista(room,room.biByeLlista,blast,d.operatorId,'fight-flight-terminal',now,room.world?.solids??[]);
 if(room.soFistication)blastSoFistication(room,room.soFistication,blast,d.operatorId,'fight-flight-terminal',now);
 const usedStructures=new Set();
 for(const solid of structureWorld(room.world,room.structures).solids??[]){
   const id=String(solid.structureId??solid.id??'');
   if(!id||usedStructures.has(id)||!Array.isArray(solid.center)||!Array.isArray(solid.size))continue;
   const delta=solid.center.map((v,i)=>Math.max(0,Math.abs(v-[point.x,point.y,point.z][i])-solid.size[i]/2));
   const distance=Math.hypot(...delta);
   if(distance>=radius)continue;
   const cover=(room.world?.solids??[]).some(other=>other.id!==solid.id&&
     segmentAabbHit([point.x,point.y+.6,point.z],solid.center,other)?.t<.98);
   if(cover)continue;
   const amount=terminalRadialDamage(damage,distance,radius);
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
 endSiegeSteel(room,m,now);
 beginSiegeWreck(room,m,'fight-flight',now,{attackerId:d.operatorId,source:'fight-flight-terminal',point});
 m.health=0;m.mode='DESTROYED';m.operatorId=null;m.firingOperatorId=null;
 m.flightDashHeld=false;m.flightUltimateHeld=false;
 room.flightBurnZones??=[];
 // The explosion follows the actual 3D impact; its *ground* fire settles onto
 // supported terrain, rather than hovering at the chassis altitude after a wall hit.
 const floor=surfaceHeightAt(point.x,point.z,point.y+1,room.world);
 // A detonation over an abyss or far above any surface has no burning GROUND.
 // Never create a hovering damage zone at its airborne explosion coordinates.
 if(floor!=null&&point.y-floor<=radius){
   const firePoint={x:point.x,y:floor,z:point.z};
   room.flightBurnZones.push({id:m.id+'-burn',sourceId:d.operatorId,point:firePoint,radius:fireRadius,
     tickDamage:fireTickDamage,startedAt:now,expiresAt:now+fireDuration,nextTickAt:now+TERMINAL.fireInterval});
 }
 return true;
}
export function stepFlightBurnZones(room,now){
 room.flightBurnZones??=[];
 for(const zone of room.flightBurnZones){
   if(now+1e-8<zone.nextTickAt||now>=zone.expiresAt)continue;
   const lifetime=Math.max(.001,zone.expiresAt-zone.startedAt);
   const age=clamp((now-zone.startedAt)/lifetime,0,1);
   zone.nextTickAt=now+terminalFireInterval(age);
   for(const p of room.players.values()){
     if(!p.alive||areAllies(room,zone.sourceId,p.id))continue;
     const distance=Math.hypot(p.position.x-zone.point.x,p.position.z-zone.point.z);
     if(distance>zone.radius||Math.abs(p.position.y-zone.point.y)>1.5||occluded(room,zone.point,p))continue;
     const spatial=Math.max(0,1-distance/zone.radius);
     const temporal=Math.max(.35,1-.65*age);
     const amount=Math.max(1,Math.round((zone.tickDamage??TERMINAL.fireTickDamage)*spatial**.65*temporal));
     applyDamage(room,zone.sourceId,p.id,amount,'fight-flight-burning-ground',now,null,{ultimate:true,ongoing:true});
   }
 }
 room.flightBurnZones=room.flightBurnZones.filter(z=>now<z.expiresAt);
}
