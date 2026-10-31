// Fight-and-Flight: server-authoritative Gate A locomotion. One actual machine per lifecycle.
// Coordinates are in world metres, Y up; the rider's feet share the machine origin.
// Flight charge (power supply) and spinning rotor energy remain separate.
import {resolvePlayerWorld,surfaceHeightAt,segmentAabbHit} from '../src/collision.mjs';
import {getBiByeSolids} from './biByeLlista.mjs';
import {soFistSolids} from './soFistGeometry.mjs';
import {endFightFlightSkill,fightFlightHoverSupport} from './fightFlightSkill.mjs';
import {VALKYRIE_RUN} from './fightFlightRun.mjs';
import {flightRepeaterAim} from '../src/flightRepeaterAim.mjs';

export const FIGHT_FLIGHT = Object.freeze({
  radius:.88,height:2.65,crouchHeight:2.15,rotorRadius:1.32,
  chargeMax:100,energyMax:100,mainHP:250,rotorHP:100,braceHP:80,
  hoverCost:7,climbCost:14,descentRecharge:5,groundSpeed:3.3,sprintSpeed:5.2,
  airSpeed:9,airAcceleration:9,groundAcceleration:15,gravity:13.5,
});
const cap=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>Number.isFinite(v)?v:0;
const ground=(world,x,z,y)=>surfaceHeightAt(x,z,y+.7,world);
export const fightFlightOperator=m=>({x:m.x,y:m.y,z:m.z});
// Solid chassis, not a defensive bubble: rotor and braces require their own real hit geometry in Gate B.
export function fightFlightSolids(m){
  if(!m||m.retired||m.mode==='DESTROYED')return [];
  return [{id:'fight-flight-chassis-'+m.id,kind:'siege-chassis',
    center:[m.x,m.y+(m.crouched?1:1.15),m.z],size:[1.4,m.crouched?2:2.3,1.35]}];
}
const extraSolids=(room,m)=>[
  ...(room.world?.solids??[]),...getBiByeSolids(room.biByeLlista),...soFistSolids(room.soFistication),
];
function collisionFree(p,solids,height=FIGHT_FLIGHT.height,radius=FIGHT_FLIGHT.radius){
  const q=resolvePlayerWorld(p,radius,solids,height);
  return Math.hypot(q.x-p.x,q.z-p.z)<.012;
}
export function createFightFlight({x=0,y=0,z=0,heading=0,id=null,lifecycleId=null,team=null}={}){
  return {id:id??'fight-flight-1',lifecycleId:lifecycleId??id??'fight-flight-1',
    operatorId:null,team,x,y,z,heading,position:{x,y,z},velocity:{x:0,y:0,z:0},
    mode:'GROUNDED',crouched:false,grounded:true,health:250,maxHealth:250,
    rotorHP:100,braceLHP:80,braceRHP:80,rotorAngle:0,rotorAngularVelocity:0,rotorEpisodes:{},lastRotorDelta:0,
    rotorEnergy:100,flightCharge:100,maxFlightCharge:100,
    ammo:14,ammoDebt:0,nextShotAt:0,ammoProduction:0,firingOperatorId:null,shotSeq:0,lastShotAt:-Infinity,crossbowYaw:heading,crossbowPitch:0,
    skill:{phase:'idle',readyAt:0,activeUntil:0},offensiveRun:false,
    terminalDiveSpent:false,terminalDive:null,terminalPrep:null,flightUltimateHeld:false,flightUltimateDownAt:null,flightUltimateChordAttempted:false,lastImpactAt:-Infinity,
    flightDashHeld:false,flightDashStartedAt:null,runPitch:0,
    builtAt:0,takeoffAt:-Infinity,landingAt:-Infinity,retired:false};
}
export function fightFlightExit(room,m,player){
  if(!m||m.mode==='DESTROYED')return null;
  const world=room.world,solids=extraSolids(room,m);
  // No airborne dismount: keep occupancy intact until a genuine landing.
  const floor=ground(world,m.x,m.z,m.y);
  if(!['GROUNDED','LANDING'].includes(m.mode)||!m.grounded||floor==null||Math.abs(m.y-floor)>.25)return null;
  const forward=[-Math.sin(m.heading),-Math.cos(m.heading)],right=[Math.cos(m.heading),-Math.sin(m.heading)];
  for(const [back,side] of [[2.2,0],[2.1,-1.6],[2.1,1.6],[0,-2.4],[0,2.4],[2.8,-2],[2.8,2]]){
    const x=m.x-forward[0]*back+right[0]*side,z=m.z-forward[1]*back+right[1]*side;
    const y=ground(world,x,z,m.y);if(y==null||Math.abs(y-m.y)>1)continue;
    const point={x,y,z};
    if(!collisionFree(point,solids,1.8,.45))continue;
    if(solids.some(s=>segmentAabbHit([m.x,m.y+1,m.z],[x,y+1,z],s)))continue;
    if([...room.players.values()].some(p=>p.alive&&p.id!==player?.id&&Math.hypot(p.position.x-x,p.position.z-z)<1))continue;
    return point;
  }
  return null;
}
export function mountFightFlight(room,m,player,now=0){
  if(!m||m.retired||m.mode==='DESTROYED'||m.health<=0||!player?.alive)return false;
  if(player.operatingRamId||player.operatingBallistaId||player.operatingFightFlightId)return false;
  if(player.pendingSpell||player.gauntlet||player.ultimateState||player.attackActive)return false;
  if(m.operatorId&&m.operatorId!==player.id)return false;
  if(m.team&&m.team!==player.team)return false;
  if(Math.hypot(player.position.x-m.x,player.position.z-m.z)>2.5||Math.abs(player.position.y-m.y)>1.5)return false;
  if(!collisionFree({x:m.x,y:m.y,z:m.z},extraSolids(room,m)))return false;
  const sightSolids=extraSolids(room,m);
  if(sightSolids.some(s=>segmentAabbHit([player.position.x,player.position.y+1.25,player.position.z],[m.x,m.y+1.25,m.z],s)))return false;
  // Do not imprison the rider in machinery with no safe way to exit.
  if(!fightFlightExit(room,m,player))return false;
  m.operatorId=player.id;if(!m.team&&player.team)m.team=player.team;
  player.operatingFightFlightId=m.id;
  player.position=fightFlightOperator(m);player.velocity={x:0,y:0,z:0};
  player.guarding=false;player.guardHeld=false;player.guardButton=false;
  player.attackHeld=false;player.attackButton=false;player.attackActive=false;
  player.input={...player.input,forward:0,right:0,jump:false,sprint:false,crouch:false,attack:false,guard:false,yaw:m.heading,pitch:0};
  room.events.push({type:'fightFlightMounted',machineId:m.id,playerId:player.id,at:now});
  return true;
}
export function dismountFightFlight(room,m,player,{force=false,at=0,exit=null}={}){
  if(!m||!player||m.operatorId!==player.id)return false;
  const safe=exit??fightFlightExit(room,m,player);
  if(!safe&&!force)return false;
  // Forced removal is reserved for death/disconnect/destruction: no airborne teleport.
  // The machine retains its cooldown and actual ammunition debt when the rider leaves.
  endFightFlightSkill(room,m,at,'interrupted');
  m.operatorId=null;m.firingOperatorId=null;m.flightDashHeld=false;m.flightUltimateHeld=false;m.terminalPrep=null;m.flightUltimateChordAttempted=false;m.offensiveRun=false;player.operatingFightFlightId=null;
  if(safe)player.position={...safe};
  else player.position={x:m.x,y:m.y,z:m.z};
  player.velocity={x:0,y:0,z:0};
  player.input={...player.input,forward:0,right:0,jump:false,sprint:false,crouch:false,attack:false,guard:false};
  room.events.push({type:'fightFlightDismounted',machineId:m.id,playerId:player.id,at,forced:force});
  return true;
}
export function stepFightFlight(room,m,dt,now,world=room.world){
  if(!m||m.retired||m.mode==='DESTROYED')return;
  m.rotorAngleBefore=m.rotorAngle;
  m.rotorPositionBefore={x:m.x,y:m.y,z:m.z};
  const op=m.operatorId?room.players.get(m.operatorId):null;
  if(m.operatorId&&(!op||!op.alive)){if(op)dismountFightFlight(room,m,op,{force:true,at:now});else m.operatorId=null;}
  const input=op?.input??{};
  const yaw=m.terminalDive?m.terminalDive.heading:Number.isFinite(input.yaw)?input.yaw:m.heading;
  // Turn rate is limited while airborne, not an instantaneous lateral inversion.
  const delta=Math.atan2(Math.sin(yaw-m.heading),Math.cos(yaw-m.heading));
  if(!m.terminalDive)m.heading+=cap(delta,-(m.grounded?3.8:m.offensiveRun?VALKYRIE_RUN.turnRate:4.2)*dt,(m.grounded?3.8:m.offensiveRun?VALKYRIE_RUN.turnRate:4.2)*dt);
  // Crossbow's real pivot follows the reticle only inside the authored traverse corridor.
  const crossbow=flightRepeaterAim(m,{yaw,pitch:input.pitch});
  m.crossbowYaw=crossbow.yaw;m.crossbowPitch=crossbow.pitch;
  const intact=m.rotorHP>0&&m.health>0;
  if(op&&!m.grounded&&op.guarding){op.guarding=false;op.guardHeld=false;op.guardButton=false;op.guardAuto=false;}
  const jump=Boolean(op&&!m.terminalDive&&input.jump),descend=Boolean(op&&!m.terminalDive&&input.crouch);
  if(m.grounded){
    m.mode='GROUNDED';m.crouched=descend&&!jump;
    if(jump&&intact&&m.flightCharge>2){m.grounded=false;m.mode='TAKEOFF';m.takeoffAt=now;m.crouched=false;m.velocity.y=Math.max(m.velocity.y,2.8);}
  }else{m.crouched=false;m.mode=intact&&now-(m.takeoffAt??-Infinity)<1.1?'TAKEOFF':intact?'AIRBORNE':'FALLING';}
  const charge=m.flightCharge;
  const spinning=intact&&(op||!m.grounded)&&charge>0;
  // A real spool-up means a damaged or drained rotor cannot lift at full strength.
  const desiredOmega=spinning?Math.PI*15:0;
  const spool=1-Math.exp(-dt*(spinning?2.5:1.8));
  m.rotorAngularVelocity+=(desiredOmega-m.rotorAngularVelocity)*spool;
  m.lastRotorDelta=m.rotorAngularVelocity*dt;
  m.rotorAngle=(m.rotorAngle+m.lastRotorDelta)%(Math.PI*2);
  if(spinning)m.rotorEnergy=cap(m.rotorEnergy+dt*7,0,100);
  else m.rotorEnergy=cap(m.rotorEnergy-dt*5,0,100);
  const forward=cap(finite(input.forward),-1,1),right=cap(finite(input.right),-1,1);
  const speed=m.grounded?(input.sprint&&!m.crouched?FIGHT_FLIGHT.sprintSpeed:m.crouched?1.7:FIGHT_FLIGHT.groundSpeed):FIGHT_FLIGHT.airSpeed;
  const run=m.offensiveRun&&!m.grounded;
  const dx=run?-Math.sin(m.heading)*VALKYRIE_RUN.speed:(-Math.sin(m.heading)*forward+Math.cos(m.heading)*right)*speed;
  const dz=run?-Math.cos(m.heading)*VALKYRIE_RUN.speed:(-Math.cos(m.heading)*forward-Math.sin(m.heading)*right)*speed;
  const response=1-Math.exp(-dt*(m.grounded?FIGHT_FLIGHT.groundAcceleration:run?VALKYRIE_RUN.acceleration:1.25));
  if(!m.terminalDive){m.velocity.x+=(dx-m.velocity.x)*response;m.velocity.z+=(dz-m.velocity.z)*response;}
  if(m.terminalDive){
    // Already committed momentum and gravity, not the live rider's jump/aim.
    m.velocity.y=Math.max(-25,m.velocity.y);
    m.mode='TERMINAL';
  }else if(!m.grounded){
    const lift=cap(m.rotorAngularVelocity/(Math.PI*15),0,1)*cap(m.rotorEnergy/35,0,1);
    if(intact&&m.flightCharge>0&&lift>.15){
      // Hover offsets gravity; climbing adds bounded upward acceleration.
      const ay=lift*FIGHT_FLIGHT.gravity-FIGHT_FLIGHT.gravity+(jump?lift*5.6:descend?-7.0:0);
      m.velocity.y=cap(m.velocity.y+ay*dt,-12,5.4);
      // Power assistance is only steady-altitude compensation. Ascending
      // still spends the normal powered-climb charge; suppression is a choice.
      const support=fightFlightHoverSupport(m,now,{climbing:jump,descending:descend});
      const cost=support?0:jump?FIGHT_FLIGHT.climbCost:descend?2:FIGHT_FLIGHT.hoverCost;
      m.flightCharge=cap(m.flightCharge-dt*cost,0,m.maxFlightCharge);
      if(descend&&m.velocity.y<-.3)m.flightCharge=cap(m.flightCharge+dt*FIGHT_FLIGHT.descentRecharge,0,m.maxFlightCharge);
    }else m.velocity.y=cap(m.velocity.y-FIGHT_FLIGHT.gravity*dt,-18,5.4);
  }else{m.velocity.y=0;m.flightCharge=cap(m.flightCharge+dt*7,0,m.maxFlightCharge);}
  const solids=extraSolids(room,m);
  const steps=Math.max(1,Math.ceil(Math.hypot(m.velocity.x,m.velocity.y,m.velocity.z)*dt/.25));
  const h=m.crouched?FIGHT_FLIGHT.crouchHeight:FIGHT_FLIGHT.height;
  for(let i=0;i<steps;i++){
    const previous={x:m.x,y:m.y,z:m.z},step=dt/steps;
    const candidate={x:m.x+m.velocity.x*step,y:m.y+m.velocity.y*step,z:m.z+m.velocity.z*step};
    const floor=ground(world,candidate.x,candidate.z,Math.max(candidate.y,m.y));
    if(floor!==null&&candidate.y<=floor){
      if(m.terminalDive)m.terminalDive.impactAt=now;
      if(!m.grounded)m.landingAt=now;
      candidate.y=floor;m.velocity.y=0;m.grounded=true;m.mode='GROUNDED';
    }
    else if(floor===null||candidate.y>floor+.05){
      // Losing support at a cliff is a real transition to falling, not hovering at its rim.
      m.grounded=false;m.mode=intact&&now-(m.takeoffAt??-Infinity)<1.1?'TAKEOFF':intact?'AIRBORNE':'FALLING';
    }
    // Sample horizontal AND vertical extent. A ceiling contact kills upward
    // movement rather than phasing the 2.6m-high chassis into masonry.
    if(!collisionFree(candidate,solids,h)){
      if(m.terminalDive){
        // A terminal attack wedged against a genuine solid must resolve at the
        // contact, rather than silently hovering until a distant timeout.
        // A glancing obstruction is not sufficient; require either a real
        // high-energy strike or sustained physical resistance under thrust.
        m.terminalDive.blockedContactSec=(m.terminalDive.blockedContactSec??0)+step;
        if(Math.hypot(m.velocity.x,m.velocity.y,m.velocity.z)>4.5||m.terminalDive.blockedContactSec>=.24)
          m.terminalDive.impactAt=now;
      }
      if(collisionFree({x:previous.x,y:candidate.y,z:previous.z},solids,h)){candidate.x=previous.x;candidate.z=previous.z;m.velocity.x=0;m.velocity.z=0;}
      else{candidate.x=previous.x;candidate.y=previous.y;candidate.z=previous.z;m.velocity={x:0,y:0,z:0};}
      m.lastImpactAt=now;
    } else if(m.terminalDive) m.terminalDive.blockedContactSec=0;
    // Midair upward collision: capsule XY solver cannot stop ceilings;
    // inspect explicit AABBs at the current footprint.
    if(candidate.y>previous.y){
      for(const box of solids){
        if(!box.center||!box.size)continue;
        if(Math.abs(candidate.x-box.center[0])>FIGHT_FLIGHT.radius+box.size[0]/2||
           Math.abs(candidate.z-box.center[2])>FIGHT_FLIGHT.radius+box.size[2]/2)continue;
        const bottom=box.center[1]-box.size[1]/2;
        if(previous.y+h<=bottom+.05&&candidate.y+h>bottom){candidate.y=bottom-h-.02;m.velocity.y=Math.min(0,m.velocity.y);m.lastImpactAt=now;break;}
      }
    }
    m.x=candidate.x;m.y=candidate.y;m.z=candidate.z;
    if(m.grounded&&floor!==null&&m.y>floor+.05)m.grounded=false;
  }
  if(!m.grounded&&m.mode==='GROUNDED')m.mode='AIRBORNE';
  if(m.terminalDive)m.mode='TERMINAL';
  if(!m.grounded&&m.mode==='AIRBORNE'&&m.velocity.y<-.9)m.mode='LANDING';
  if(m.mode==='GROUNDED'&&now-m.landingAt<.55)m.mode='LANDING';
  m.position={x:m.x,y:m.y,z:m.z};
  if(op){op.position=fightFlightOperator(m);op.velocity={...m.velocity};op.yaw=yaw;op.pitch=finite(input.pitch);op.grounded=m.grounded;op.crouched=m.crouched;op.sprinting=Boolean(input.sprint&&m.grounded);op.sprintBlend=0;}
}
