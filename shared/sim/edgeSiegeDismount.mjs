// Edge of Victory: authoritative VOLUNTARY machine abandonment.
// Never invoke the destruction/ejection paths to solve a rule of chivalry.
import { edgeInside, edgeFootprintInside, edgeRadiusAt } from '../src/edgeBoundary.mjs';
import { MOVEMENT } from '../src/movement.mjs';
import { resolvePlayerWorld, surfaceHeightAt, segmentAabbHit } from '../src/collision.mjs';
import { dismountSoFistication, soFistExit } from './soFistication.mjs';
import { soFistSolids } from './soFistGeometry.mjs';
import { dismountBiByeLlista, getBiByeOperatorTransform, getBiByeSolids } from './biByeLlista.mjs';
import { dismountFightFlight, fightFlightExit, fightFlightEdgeVolumes, fightFlightSolids } from './fightFlight.mjs';

function legalExit(room, operator, point, requiredRadius=room.edgeOfVictory.radius) {
  const edge = room.edgeOfVictory;
  if (!point || !edgeInside(point,edge.center,Math.min(edge.radius,requiredRadius),MOVEMENT.playerRadius+.07)) return false;
  const ground = surfaceHeightAt(point.x,point.z,point.y+1.1,room.world);
  if(ground===null || Math.abs(ground-point.y)>.3)return false;
  const walls = room.world?.solids??[];
  const solids = [...walls,...getBiByeSolids(room.biByeLlista),
    ...soFistSolids(room.soFistication),...fightFlightSolids(room.fightFlight),
    ...[...room.players.values()].filter(p=>p.alive&&p.id!==operator.id)
      .map(p=>({center:[p.position.x,p.position.y+.9,p.position.z],size:[.94,1.8,.94]}))];
  const adjusted=resolvePlayerWorld(point,MOVEMENT.playerRadius,solids,1.8);
  if(Math.hypot(adjusted.x-point.x,adjusted.z-point.z)>.025)return false;
  // The operator station is inside its own chassis; exclude machine volumes
  // from the egress ray, but never allow crossing a castle wall.
  const old=operator.position;
  if(walls.some(b=>segmentAabbHit([old.x,old.y+.9,old.z],[point.x,point.y+.9,point.z],b))) return false;
  for(const t of [.25,.5,.75]){
    const x=old.x+(point.x-old.x)*t,z=old.z+(point.z-old.z)*t;
    const floor=surfaceHeightAt(x,z,old.y+1.2,room.world);
    if(floor===null || Math.abs(floor-old.y)>1.0)return false;
  }
  return true;
}

function ballistaExit(room,b,p,requiredRadius=room.edgeOfVictory.radius) {
  const f={x:-Math.sin(b.heading),z:-Math.cos(b.heading)};
  const side={x:Math.cos(b.heading),z:-Math.sin(b.heading)};
  const station=getBiByeOperatorTransform(b).position;
  // Behind, either flank, then inward-compatible side of the carriage.
  for (const [back,lateral] of [[3.3,0],[3,-1.8],[3,1.8],[1.6,-3.0],[1.6,3.0],
    [0,-3.2],[0,3.2],[-1.5,-3.0],[-1.5,3.0]]) {
    const x=b.x-f.x*back+side.x*lateral,z=b.z-f.z*back+side.z*lateral;
    const y=surfaceHeightAt(x,z,station.y+1.1,room.world);
    if(y===null||Math.abs(y-station.y)>1.0)continue;
    const exit={x,y,z};
    if(legalExit(room,p,exit,requiredRadius))return exit;
  }
  return null;
}

function announce(room,actor,machine,kind,nowSec){
  actor.edgeDismountAt=nowSec;
  actor.edgeDismountUntil=nowSec+.28;
  room.events.push({type:'edgeVoluntaryDismount',playerId:actor.id,machineId:machine.id,
    machineKind:kind,at:nowSec,until:actor.edgeDismountUntil});
}

/** This runs both after the ring advances and after machine physics.
 * Foot actors use edgeConstrainActor separately. Nothing here causes damage.
 */
export function edgeHandleMountedOperators(room,nowSec){
  const edge=room.edgeOfVictory;
  if(!edge || room.state!=='PLAYING')return;
  const {center,radius}=edge;
  // Exit BEFORE the last safe landing patch is consumed by the advancing
  // ring. Flight needs a longer horizon to descend through real terrain.
  const expectedAt=(seconds)=>edgeRadiusAt(Math.max(0,nowSec-edge.startedAt)+seconds,
    edge.config.stages);
  const nearRadius=expectedAt(1.2),flightRadius=expectedAt(3.0);
  const ram=room.soFistication;
  if(ram?.operatorId){
    const op=room.players.get(ram.operatorId);
    const conflict=Boolean(ram.edgeBlocked)||!edgeFootprintInside(soFistSolids(ram),center,nearRadius,.02);
    if(op?.alive && conflict){
      const exit=soFistExit(room,ram,op,[],p=>legalExit(room,op,p,nearRadius));
      if(exit){
        const speed=ram.speed,recoil=ram.recoilVelocity;
        if(dismountSoFistication(room,ram,op,{exit,at:nowSec})){
          // The unattended carriage has its own drag/recoil: don't invent
          // an invisible wall that stops an enormous already-moving ram.
          ram.speed=speed;ram.recoilVelocity=recoil;
          ram.edgeBlocked=false;
          announce(room,op,ram,'so-fist-ication',nowSec);
        }
      }else ram.edgeRestricted=true;
    }else if(!conflict)ram.edgeRestricted=false;
  }
  const ballista=room.biByeLlista;
  if(ballista?.operatorId){
    const op=room.players.get(ballista.operatorId);
    const conflict=Boolean(ballista.edgeBlocked)||!edgeFootprintInside(getBiByeSolids(ballista),center,nearRadius,.02);
    if(op?.alive && conflict){
      const exit=ballistaExit(room,ballista,op,nearRadius);
      if(exit){
        const speed=ballista.speed;
        if(dismountBiByeLlista(ballista,op,false,room.world,nowSec)){
          op.position={...exit};op.velocity={x:0,y:0,z:0};op.grounded=true;
          // Drive is released, while ordinary post-impact coast still runs.
          if(Math.abs(speed)>.15)ballista.externalVelocity={
            x:(ballista.externalVelocity?.x??0)-Math.sin(ballista.heading)*speed,
            z:(ballista.externalVelocity?.z??0)-Math.cos(ballista.heading)*speed,
          };
          ballista.edgeBlocked=false;
          announce(room,op,ballista,'bi-bye-llista',nowSec);
        }
      }else ballista.edgeRestricted=true;
    }else if(!conflict)ballista.edgeRestricted=false;
  }
  const flight=room.fightFlight;
  if(flight?.operatorId){
    const op=room.players.get(flight.operatorId);
    const conflict=Boolean(flight.edgeBlocked)||flight.edgeAutoLand||
      !edgeFootprintInside(fightFlightEdgeVolumes(flight),center,flightRadius,.02);
    if(op?.alive && conflict){
      if(flight.terminalDive && !flight.terminalDive.resolved){
        // In particular: never cancel Valkyrie by "helpfully" unmounting.
        flight.edgeAutoLand=false;
        return;
      }
      // An airborne pilot must physically descend to a supported landing.
      if(!flight.grounded){flight.edgeAutoLand=true;return;}
      const exit=fightFlightExit(room,flight,op,p=>legalExit(room,op,p,flightRadius));
      if(exit && dismountFightFlight(room,flight,op,{at:nowSec,exit})){
        flight.edgeAutoLand=false;flight.edgeBlocked=false;flight.edgeRestricted=false;
        announce(room,op,flight,'fight-and-flight',nowSec);
      }else {
        flight.edgeAutoLand=true;flight.edgeRestricted=true;
      }
    }else if(!conflict)flight.edgeRestricted=false;
  }
}
