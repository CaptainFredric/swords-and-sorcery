// Fight-and-Flight: server-authoritative Gate A locomotion. One actual machine per lifecycle.
// Coordinates are in world metres, Y up; the rider's feet share the machine origin.
// Flight charge (power supply) and spinning rotor energy remain separate.
import {resolvePlayerWorld,surfaceHeightAt,segmentAabbHit} from '../src/collision.mjs';
import {getBiByeSolids} from './biByeLlista.mjs';
import {soFistSolids} from './soFistGeometry.mjs';
import {endFightFlightSkill,fightFlightHoverSupport} from './fightFlightSkill.mjs';
import {VALKYRIE_RUN} from './fightFlightRun.mjs';
import {flightRepeaterAim,FLIGHT_REPEATER} from '../src/flightRepeaterAim.mjs';

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
    rotorPowered:false,rotorBrakeHeld:false,rotorTargetRPM:0,rotorRPM:0,
    rotorSpinupAcceleration:90,rotorSpindownAcceleration:65,rotorLiftAuthority:0,
    jumpWasHeld:false,hopStartedAt:null,hopRequested:false,verticalIntent:'IDLE',rotorLiftSuppressedUntil:0,
    ammo:FLIGHT_REPEATER.capacity,ammoDebt:0,nextShotAt:0,ammoProduction:0,firingOperatorId:null,shotSeq:0,lastShotAt:-Infinity,crossbowYaw:heading,crossbowPitch:0,
    skill:{phase:'idle',readyAt:0,activeUntil:0},offensiveRun:false,
    terminalDiveSpent:false,terminalDive:null,terminalPrep:null,flightUltimateHeld:false,flightUltimateDownAt:null,flightUltimateChordAttempted:false,lastImpactAt:-Infinity,
    flightDashHeld:false,flightDashStartedAt:null,runPitch:0,ejectHoldStartedAt:null,emergencyBrakeActive:false,
    builtAt:0,takeoffAt:-Infinity,landingAt:-Infinity,retired:false};
}
export function fightFlightExit(room,m,player){
  if(!m||m.mode==='DESTROYED')return null;
  const world=room.world,solids=extraSolids(room,m);
  if(m.terminalDive&&!m.terminalDive.resolved)return null;
  const floor=ground(world,m.x,m.z,m.y);
  const airborne=!m.grounded;
  if(!airborne&&(floor==null||Math.abs(m.y-floor)>.25))return null;
  const forward=[-Math.sin(m.heading),-Math.cos(m.heading)],right=[Math.cos(m.heading),-Math.sin(m.heading)];
  for(const [back,side] of [[2.2,0],[2.1,-1.6],[2.1,1.6],[0,-2.4],[0,2.4],[2.8,-2],[2.8,2]]){
    const x=m.x-forward[0]*back+right[0]*side,z=m.z-forward[1]*back+right[1]*side;
    const landing=ground(world,x,z,m.y);
    const y=airborne?m.y+.25:landing;
    if(!airborne&&(landing==null||Math.abs(y-m.y)>1))continue;
    if(airborne&&landing!=null&&y<landing+.25)continue;
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
  m.jumpWasHeld=false;m.hopStartedAt=null;m.hopRequested=false;m.verticalIntent='IDLE';
  player.flightInputAt=null;player.ejectionFallExempt=false;
  player.operatingFightFlightId=m.id;
  player.position=fightFlightOperator(m);player.velocity={x:0,y:0,z:0};
  player.guarding=false;player.guardHeld=false;player.guardButton=false;
  player.attackHeld=false;player.attackButton=false;player.attackActive=false;
  player.input={...player.input,forward:0,right:0,jump:false,flightRise:false,flightLower:false,sprint:false,crouch:false,attack:false,guard:false,yaw:m.heading,pitch:0};
  room.events.push({type:'fightFlightMounted',machineId:m.id,playerId:player.id,at:now});
  return true;
}
export function dismountFightFlight(room,m,player,{force=false,at=0,exit=null}={}){
  if(!m||!player||m.operatorId!==player.id||(!force&&m.terminalDive))return false;
  const airborne=!m.grounded;
  const safe=exit??fightFlightExit(room,m,player);
  if(!safe&&!force)return false;
  // Forced removal is reserved for death/disconnect/destruction: no airborne teleport.
  // The machine retains its cooldown and actual ammunition debt when the rider leaves.
  endFightFlightSkill(room,m,at,'interrupted');
  m.operatorId=null;m.firingOperatorId=null;m.flightDashHeld=false;m.flightUltimateHeld=false;m.terminalPrep=null;m.flightUltimateChordAttempted=false;m.offensiveRun=false;
  m.ejectHoldStartedAt=null;m.emergencyBrakeActive=false;player.operatingFightFlightId=null;
  m.jumpWasHeld=false;m.hopStartedAt=null;m.hopRequested=false;m.verticalIntent='IDLE';player.flightInputAt=null;
  if(safe)player.position={...safe};
  else player.position={x:m.x,y:m.y,z:m.z};
  if(airborne&&safe&&!force){
    const right={x:Math.cos(m.heading),z:-Math.sin(m.heading)};
    const side=(safe.x-m.x)*right.x+(safe.z-m.z)*right.z;
    const outward=side>=0?1:-1;
    player.velocity={x:(m.velocity.x??0)+right.x*outward*1.3,
      y:Math.max(-18,(m.velocity.y??0)+.8),z:(m.velocity.z??0)+right.z*outward*1.3};
    player.grounded=false;
    // Landing-only bookkeeping; enemy and environmental damage remain live.
    player.ejectionFallExempt=true;
  }else{
    player.velocity={x:0,y:0,z:0};player.grounded=true;
    player.ejectionFallExempt=false;
  }
  player.input={...player.input,forward:0,right:0,jump:false,flightRise:false,flightLower:false,sprint:false,crouch:false,attack:false,guard:false};
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
  const crossbow=flightRepeaterAim(m,{yaw,pitch:input.pitch,siegeTarget:input.siegeTarget});
  m.crossbowYaw=crossbow.yaw;m.crossbowPitch=crossbow.pitch;
  m.crossbowAimLimited=Boolean(crossbow.limited);
  m.crossbowReachableAim=crossbow.reachableAimPoint??null;
  const intact=m.rotorHP>0&&m.health>0;
  if(op&&!m.grounded&&op.guarding){op.guarding=false;op.guardHeld=false;op.guardButton=false;op.guardAuto=false;}
  // Held movement must come from a recent authoritative input packet. A lost
  // mobile pointer, focus or connection cannot leave a stale ascent running.
  // Direct simulation callers (bots and unit tests) have no packet timestamp.
  const live=Boolean(op&&!m.terminalDive&&
    (!Number.isFinite(op.flightInputAt)||now-op.flightInputAt<=.5));
  const legacyJump=Boolean(live&&input.jump);
  const rise=Boolean(live&&(input.flightRise||legacyJump));
  const descend=Boolean(live&&(input.flightLower||input.crouch));
  const explicitHop=Boolean(live&&m.hopRequested);
  m.hopRequested=false; // one server-validated impulse, not a latched held state
  if(m.ejectHoldStartedAt!=null&&now-m.ejectHoldStartedAt>=.35){
    m.emergencyBrakeActive=true;m.rotorPowered=false;
  }
  // Discrete Hop uses ballistic gravity; only a held Rise can spin up sustained
  // lift. Desktop Space preserves tap-to-hop, hold (>230 ms)-to-rise behavior.
  const legacyPress=legacyJump&&!m.jumpWasHeld;
  const canLaunch=intact&&!m.emergencyBrakeActive&&m.flightCharge>2;
  if(m.grounded){
    m.mode='GROUNDED';m.crouched=descend&&!rise&&!explicitHop;
    if(descend){m.rotorPowered=false;m.hopStartedAt=null;}
    if(canLaunch&&!descend&&(explicitHop||legacyPress||input.flightRise)){
      m.grounded=false;m.mode='TAKEOFF';m.takeoffAt=now;m.crouched=false;
      m.velocity.y=Math.max(m.velocity.y,3.2);
      if(legacyPress&&!input.flightRise&&!explicitHop){
        m.hopStartedAt=now;
        m.rotorPowered=true; // release inside the short-hop window cuts the motor
      }else{
        m.hopStartedAt=null;
        m.rotorPowered=Boolean(input.flightRise&&!explicitHop);
      }
    }
  }else{
    m.crouched=false;
    m.mode=intact&&now-(m.takeoffAt??-Infinity)<1.1?'TAKEOFF':intact?'AIRBORNE':'FALLING';
  }
  if(m.hopStartedAt!=null){
    if(!legacyJump&&now-m.hopStartedAt<.23){
      m.rotorPowered=false;m.hopStartedAt=null;
    }else if(now-m.hopStartedAt>=.23)m.hopStartedAt=null;
  }
  const sustainedRise=Boolean(input.flightRise||(legacyJump&&m.hopStartedAt==null));
  if(live&&sustainedRise&&!m.grounded&&!m.emergencyBrakeActive&&intact&&m.flightCharge>0)m.rotorPowered=true;
  // A Rise release keeps the spinning rotor for neutral hover. Its *vertical*
  // command is nevertheless released immediately: no positive target velocity.
  m.verticalIntent=descend?'LOWER':live&&sustainedRise?'RISE':m.hopStartedAt!=null||explicitHop?'HOP':'HOVER';
  m.jumpWasHeld=legacyJump;
  const spinning=intact&&m.flightCharge>0&&m.rotorPowered;
  m.rotorBrakeHeld=Boolean(descend&&m.grounded);
  const maxOmega=Math.PI*15;
  const desiredOmega=spinning&&!m.rotorBrakeHeld?maxOmega:0;
  const acceleration=desiredOmega>m.rotorAngularVelocity?m.rotorSpinupAcceleration:m.rotorSpindownAcceleration;
  m.rotorAngularVelocity=cap(m.rotorAngularVelocity+cap(desiredOmega-m.rotorAngularVelocity,-acceleration*dt,acceleration*dt),0,maxOmega);
  if(!intact)m.rotorAngularVelocity=0;
  m.rotorTargetRPM=desiredOmega*60/(2*Math.PI);
  m.rotorRPM=m.rotorAngularVelocity*60/(2*Math.PI);
  m.lastRotorDelta=m.rotorAngularVelocity*dt;
  m.rotorAngle=(m.rotorAngle+m.lastRotorDelta)%(Math.PI*2);
  if(spinning)m.rotorEnergy=cap(m.rotorEnergy+dt*7,0,100);
  else m.rotorEnergy=cap(m.rotorEnergy-dt*5,0,100);
  m.rotorLiftAuthority=intact&&m.flightCharge>0?
    cap(m.rotorAngularVelocity/maxOmega,0,1)*cap(m.rotorEnergy/35,0,1)*(now<(m.rotorLiftSuppressedUntil??0)?.45:1):0;
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
    const lift=m.rotorLiftAuthority;
    if(intact&&m.flightCharge>0&&lift>.15){
      // Bounded velocity servo, counteracting ascent and descent momentum.
      const targetVelocity=m.verticalIntent==='RISE'?3.7:descend?-3.4:0;
      const correction=cap((targetVelocity-m.velocity.y)*6,-9,9)*lift;
      const ay=(lift-1)*FIGHT_FLIGHT.gravity+correction;
      m.velocity.y=cap(m.velocity.y+ay*dt,-12,5.4);
      // Power assistance is only steady-altitude compensation. Ascending
      // still spends the normal powered-climb charge; suppression is a choice.
      const climbing=m.verticalIntent==='RISE';
      const support=fightFlightHoverSupport(m,now,{climbing,descending:descend});
      const cost=support?0:climbing?FIGHT_FLIGHT.climbCost:descend?2:FIGHT_FLIGHT.hoverCost;
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
