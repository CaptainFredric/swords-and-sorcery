// Authoritative repeating crossbow fitted to the v2.6 left-side muzzle.
// Actual finite bolts: never a damage aura or a client-authored damage command.
import {segmentAabbHit,surfaceHeightAt} from '../src/collision.mjs';
import {postureOf} from '../src/body.mjs';
import {areAllies} from '../src/teams.mjs';
import {structureWorld,damageStructureSolid} from './structures.mjs';
import {sweptSegmentCylinderHit,damageBiByeLlista} from './biByeLlista.mjs';
import {biByeFirstHit} from './biByeComponents.mjs';
import {soFistFirstHit} from './soFistGeometry.mjs';
import {damageSoFistication} from './soFistication.mjs';
import {frostGuardFaces,frostParryContact} from './biByeFrostGuard.mjs';
import {applyDamage,breakGuard} from './combat.mjs';
import {GAME} from '../src/combat.mjs';

export const FLIGHT_REPEATER=Object.freeze({capacity:14,production:2,fireRate:7,speed:64,
  lifespan:2.4,falloff:22,closeDamage:3,farDamage:2,guardStamina:8,guardArc:100,
  maxTraverse:Math.PI*25/180,maxPitch:Math.PI*20/180,minPitch:-Math.PI*20/180,radius:.065});
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
export function flightMuzzle(m,{yaw=m.heading,pitch=0}={}){
  // The exported crossbow body rotates at local [+0.65,+1.05,+0.22];
  // the named muzzle is [+0.0,+0.048,+0.585] relative to that pivot.
  const relative=clamp(angle(yaw-m.heading),-FLIGHT_REPEATER.maxTraverse,FLIGHT_REPEATER.maxTraverse);
  const elevation=clamp(pitch,FLIGHT_REPEATER.minPitch,FLIGHT_REPEATER.maxPitch);
  const lx=.65+Math.sin(relative)*Math.cos(elevation)*.585;
  const lz=.22+Math.cos(relative)*Math.cos(elevation)*.585;
  const c=Math.cos(m.heading),s=Math.sin(m.heading);
  return {x:m.x-lx*c-lz*s,y:m.y+1.098+Math.sin(elevation)*.585,z:m.z+lx*s-lz*c};
}
export function advanceFlightAmmo(m,dt){
  if(!(dt>0)||!m||m.mode==='DESTROYED')return;
  // Production first repays actual debt from previously delivered Skill bolts.
  // Keeping fractional progress avoids 30Hz tick-rate-dependent phantom reloads.
  m.ammoProduction=clamp((m.ammoProduction??0)+dt*FLIGHT_REPEATER.production,0,100);
  while(m.ammoProduction>=1-1e-9){
    if(m.ammoDebt>0)m.ammoDebt--;
    else if(m.ammo<FLIGHT_REPEATER.capacity)m.ammo++;
    else {m.ammoProduction=0;break;}
    m.ammoProduction=Math.max(0,m.ammoProduction-1);
  }
  m.ammo=clamp(m.ammo,0,FLIGHT_REPEATER.capacity);
}
function validOperator(room,m,p){return Boolean(m&&p?.alive&&room.players.get(p.id)===p&&m.health>0&&
  m.mode!=='DESTROYED'&&m.operatorId===p.id&&p.operatingFightFlightId===m.id);}
function release(room,m,p,now){
  if(!validOperator(room,m,p)||m.ammo<1||now+1e-8<(m.nextShotAt??0))return false;
  // The ordinary sword and repeater cannot hit simultaneously. Chivalry is the
  // explicitly permitted exception when sword combat is integrated.
  if(p.attackActive)return false;
  const yaw=(m.heading??0)+clamp(angle((p.input?.yaw??m.heading)-m.heading),-FLIGHT_REPEATER.maxTraverse,FLIGHT_REPEATER.maxTraverse);
  const pitch=clamp(p.input?.pitch??0,FLIGHT_REPEATER.minPitch,FLIGHT_REPEATER.maxPitch);
  const cp=Math.cos(pitch),origin=flightMuzzle(m,{yaw,pitch});
  const unit={x:-Math.sin(yaw)*cp,y:Math.sin(pitch),z:-Math.cos(yaw)*cp};
  m.ammo--;
  const period=1/FLIGHT_REPEATER.fireRate,lastDue=m.nextShotAt??now;
  m.nextShotAt=(now-lastDue>period?now:lastDue)+period;
  m.lastShotAt=now;m.crossbowYaw=yaw;m.crossbowPitch=pitch;m.shotSeq=(m.shotSeq??0)+1;
  room.fightFlightProjectiles??=new Map();
  const id=m.id+'-quarrel-'+m.shotSeq;
  room.fightFlightProjectiles.set(id,{id,machineId:m.id,ownerId:p.id,position:origin,
    velocity:{x:unit.x*FLIGHT_REPEATER.speed,y:unit.y*FLIGHT_REPEATER.speed,z:unit.z*FLIGHT_REPEATER.speed},
    bornAt:now,dist:0,radius:FLIGHT_REPEATER.radius});
  room.events.push({type:'fightFlightBoltReleased',machineId:m.id,projectileId:id,operatorId:p.id,
    point:origin,ammo:m.ammo,at:now});
  return true;
}
export function requestFightFlightFire(room,m,p,down,now){
  if(!validOperator(room,m,p))return false;
  m.firingOperatorId=down?p.id:null;
  if(down)release(room,m,p,now);
  return true;
}
export function stepFightFlightWeapons(room,m,dt,now){
  if(!m||m.retired||m.mode==='DESTROYED')return;
  advanceFlightAmmo(m,dt);
  const p=room.players.get(m.operatorId);
  if(p&&m.firingOperatorId===p.id)release(room,m,p,now);
  else m.firingOperatorId=null;
}
export function stepFightFlightProjectiles(room,dt,now,world=room.world,{filterOwnerId=null}={}){
  const map=room.fightFlightProjectiles;if(!map?.size)return;
  const solids=structureWorld(world,room.structures).solids??[];
  for(const q of [...map.values()]){
    if(filterOwnerId!==null&&q.ownerId!==filterOwnerId){q.bornAt+=dt;continue;}
    if(now-q.bornAt>FLIGHT_REPEATER.lifespan){map.delete(q.id);continue;}
    const actualDt=Math.min(dt,Math.max(0,now-q.bornAt));
    if(actualDt<=0)continue;
    const a=q.position,b={x:a.x+q.velocity.x*actualDt,y:a.y+q.velocity.y*actualDt,z:a.z+q.velocity.z*actualDt};
    const delta=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z),hits=[];
    for(const solid of solids){
      if(String(solid.id??'').startsWith('fight-flight-'))continue;
      const h=segmentAabbHit([a.x,a.y,a.z],[b.x,b.y,b.z],solid);
      if(h)hits.push({t:h.t,kind:'wall',solid,point:{x:h.point[0],y:h.point[1],z:h.point[2]}});
    }
    const floor=surfaceHeightAt(b.x,b.z,a.y,world);
    if(floor!=null&&a.y>floor&&b.y<=floor){
      const t=clamp((a.y-floor)/(a.y-b.y),0,1);
      hits.push({t,kind:'ground',point:{x:a.x+(b.x-a.x)*t,y:floor,z:a.z+(b.z-a.z)*t}});
    }
    // Existing siege volumes use actual components, not a chassis-wide health redirect.
    const bh=room.biByeLlista?biByeFirstHit(room.biByeLlista,[a.x,a.y,a.z],[b.x,b.y,b.z],now):null;
    if(bh)hits.push({t:bh.t,kind:'ballista',hit:bh,point:{x:bh.point[0],y:bh.point[1],z:bh.point[2]}});
    const rh=soFistFirstHit(room.soFistication,[a.x,a.y,a.z],[b.x,b.y,b.z],now);
    if(rh)hits.push({t:rh.t,kind:'ram',hit:rh,point:{x:rh.point[0],y:rh.point[1],z:rh.point[2]}});
    for(const p of room.players.values()){
      if(!p.alive||p.id===q.ownerId||areAllies(room,q.ownerId,p.id))continue;
      const h=sweptSegmentCylinderHit(a,b,{x:p.position.x,y:p.position.y-q.radius,z:p.position.z,
        radius:.45+q.radius,height:postureOf(p).height+q.radius*2});
      if(h)hits.push({t:h.t,kind:'player',player:p,point:{x:a.x+(b.x-a.x)*h.t,y:a.y+(b.y-a.y)*h.t,z:a.z+(b.z-a.z)*h.t}});
    }
    hits.sort((x,y)=>x.t-y.t);
    const first=hits[0];
    if(first){
      const point=first.point,damage=q.dist+delta*first.t<=FLIGHT_REPEATER.falloff?FLIGHT_REPEATER.closeDamage:FLIGHT_REPEATER.farDamage;
      if(first.kind==='player'){
        const p=first.player;
        // A real frontal/vertical guard zone, not a spherical immunity bubble.
        const height=postureOf(p).height,dy=point.y-p.position.y;
        const frontal=frostGuardFaces(p,point,q.velocity,true,FLIGHT_REPEATER.guardArc);
        const dx=point.x-p.position.x,dz=point.z-p.position.z;
        const rightX=Math.cos(p.yaw),rightZ=-Math.sin(p.yaw);
        const lateral=Math.abs(dx*rightX+dz*rightZ);
        const defended=frontal&&dy>=height*.4&&dy<=height*.93&&lateral<=.43;
        const parried=defended&&Boolean(frostParryContact(p,q,a,b,now,FLIGHT_REPEATER.guardArc));
        if(defended){
          p.guardStamina=Math.max(0,p.guardStamina-FLIGHT_REPEATER.guardStamina);
          p.lastGuardDrainAt=now;
          if(p.guardStamina<=0)breakGuard(p,GAME.guardBreakStaggerMs/1000,now);
        }else applyDamage(room,q.ownerId,p.id,damage,'fight-flight-repeater',now);
        room.events.push({type:'fightFlightBoltImpact',machineId:q.machineId,projectileId:q.id,
          victimId:p.id,point,hitKind:parried?'parry':defended?'guard':'player',damage:defended?0:damage,at:now});
      }else{
        if(first.kind==='wall')damageStructureSolid(room,first.solid,damage,q.ownerId,'fight-flight-repeater',now,{point});
        if(first.kind==='ballista')damageBiByeLlista(room,room.biByeLlista,damage,q.ownerId,'fight-flight-repeater',now,{componentId:first.hit.box.componentId,point});
        if(first.kind==='ram')damageSoFistication(room,room.soFistication,damage,q.ownerId,'fight-flight-repeater',now,{componentId:first.hit.box.componentId,point});
        room.events.push({type:'fightFlightBoltImpact',machineId:q.machineId,projectileId:q.id,point,hitKind:first.kind,damage,at:now});
      }
      map.delete(q.id);
    }else{q.position=b;q.dist+=delta;}
  }
}
