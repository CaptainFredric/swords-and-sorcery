// Actual rotor blade crossings. Angular substeps detect an entire blade passage at 30Hz,
// not a fixed hit aura. An episode ends only when the blade physically leaves a body.
import {postureOf} from '../src/body.mjs';
import {segmentAabbHit} from '../src/collision.mjs';
import {orientedBoxHit} from '../src/orientedBox.mjs';
import {areAllies} from '../src/teams.mjs';
import {GAME} from '../src/combat.mjs';
import {steelStrength} from '../src/steel.mjs';
import {applyDamage,breakGuard,staggerBy} from './combat.mjs';
import {damageFightFlight} from './fightFlightComponents.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TAU=Math.PI*2;
export const ROTOR_CONTACT=Object.freeze({inner:.12,outer:1.32,bladeHalfHeight:.11,
  bladeWidth:.14,angularStep:.075,baseDamage:8,peakDamage:30,guardDrain:16,guardEnergy:20,
  parryRotorDamage:8,parryCharge:3.5,parryStagger:5});
function distanceToBlade(body,m,phase,blade,part){
  const x=body.x-m.x,z=body.z-m.z;
  const radialX=Math.cos(phase+blade*Math.PI),radialZ=Math.sin(phase+blade*Math.PI);
  const projected=clamp(x*radialX+z*radialZ,ROTOR_CONTACT.inner,ROTOR_CONTACT.outer);
  const cross=x-radialX*projected,depth=z-radialZ*projected;
  const d=Math.hypot(cross,depth);
  return {distance:d,r:projected,contact:{x:m.x+radialX*projected,y:m.y+2.18,z:m.z+radialZ*projected}};
}
// Pure geometric predicate used by collision regression tests and the host.
export function rotorBladeContact(m,body,phase,blade=0){
  const c=distanceToBlade(body,m,phase,blade);
  const radius=(body.radius??.45)+ROTOR_CONTACT.bladeWidth;
  const y=m.y+2.18,pBottom=body.y,pTop=body.y+(body.height??1.8);
  if(y+ROTOR_CONTACT.bladeHalfHeight<pBottom||y-ROTOR_CONTACT.bladeHalfHeight>pTop||c.distance>radius)return null;
  return {...c,quality:clamp((radius-c.distance)/(radius*.8),0,1)};
}
function defended(victim,point,m){
  if(!victim.guarding||victim.guardStamina<=0)return false;
  // The attack originates at the spinning hub, not at the moving contact point
  // (which can be coincident with the victim's center).
  const dx=m.x-victim.position.x,dz=m.z-victim.position.z;
  const dist=Math.hypot(dx,dz);if(dist<.04)return false;
  const dot=(-Math.sin(victim.yaw)*dx-Math.cos(victim.yaw)*dz)/dist;
  // Physical frontal torso only. Exposed legs, rear and high shoulder remain vulnerable.
  const height=postureOf(victim).height;
  return dot>=Math.cos(115*Math.PI/360)&&point.y>=victim.position.y+height*.5&&point.y<=victim.position.y+height*1.02;
}
function hit(room,m,p,part,contact,now,phase){
  if(!p.alive||m.rotorHP<=0)return;
  const t=contact.r/ROTOR_CONTACT.outer;
  const rpm=clamp(Math.abs(m.rotorAngularVelocity)/(Math.PI*15),0,1);
  const available=clamp(m.rotorEnergy/100,0,1);
  const quality=contact.quality;
  // Proper clean hits reach 8–30. Slow blades and near-edge grazes deliver
  // much less, and tangential glances can have zero meaningful HP damage.
  const clean=clamp(quality*t,0,1);
  const damage=Math.max(0,Math.round((ROTOR_CONTACT.baseDamage+22*clean)*rpm*Math.sqrt(available)*Math.min(1,quality*1.6)));
  let result='graze',appliedDamage=0;
  const blocked=defended(p,contact.contact,m);
  if(blocked){
    const time=(now-(p.guardStartedAt??-Infinity))*1000;
    const parry=time>=0&&time<=GAME.parryWindowMs;
    if(parry){
      // Eight base rotor damage before the rotor's finite component Steel.
      const outcome=damageFightFlight(room,m,ROTOR_CONTACT.parryRotorDamage,p.id,
        'fight-flight-rotor-parry',now,{componentId:'rotor',point:contact.contact,steelMinimum:1});
      m.flightCharge=clamp(m.flightCharge-ROTOR_CONTACT.parryCharge,0,m.maxFlightCharge);
      m.rotorEnergy=clamp(m.rotorEnergy-28,0,100);
      m.rotorAngularVelocity*=.55;
      staggerBy(room,p,ROTOR_CONTACT.parryStagger,now,m.operatorId);
      result='parry';
      room.events.push({type:'fightFlightRotorParried',machineId:m.id,defenderId:p.id,
        point:contact.contact,rotorDamage:outcome?.damage??0,at:now});
    }else{
      p.guardStamina=Math.max(0,p.guardStamina-ROTOR_CONTACT.guardDrain);
      p.lastGuardDrainAt=now;
      if(p.guardStamina<=0)breakGuard(p,GAME.guardBreakStaggerMs/1000,now);
      m.rotorEnergy=clamp(m.rotorEnergy-ROTOR_CONTACT.guardEnergy,0,100);
      m.rotorAngularVelocity*=.86;
      result='guard';
    }
  }else if(damage>0){
    const success=applyDamage(room,m.operatorId,p.id,damage,'fight-flight-rotor',now);
    if(success)appliedDamage=damage;
    m.rotorEnergy=clamp(m.rotorEnergy-(5+damage*.38),0,100);
    m.rotorAngularVelocity*=.94;
    result='hit';
  }else{
    m.rotorEnergy=clamp(m.rotorEnergy-1,0,100);
  }
  room.events.push({type:'fightFlightRotorContact',machineId:m.id,blade:part,victimId:p.id,
    point:contact.contact,contactQuality:quality,damage:appliedDamage,result,at:now});
}
export function stepFightFlightRotor(room,m,dt,now){
  if(!m||m.retired||m.rotorHP<=0||m.mode==='DESTROYED'||!(dt>0)){
    if(m)m.rotorEpisodes={};return;
  }
  const angularTravel=m.lastRotorDelta??m.rotorAngularVelocity*dt;
  if(Math.abs(angularTravel)<.0001)return;
  const samples=Math.max(1,Math.ceil(Math.abs(angularTravel)/ROTOR_CONTACT.angularStep));
  const before=m.rotorAngleBefore??(m.rotorAngle-angularTravel);
  const x0=m.rotorPositionBefore?.x??m.x,y0=m.rotorPositionBefore?.y??m.y,z0=m.rotorPositionBefore?.z??m.z;
  const episodes=m.rotorEpisodes??={};
  for(let k=1;k<=samples;k++){
    const frac=k/samples,theta=before+angularTravel*frac;
    const pose={x:x0+(m.x-x0)*frac,y:y0+(m.y-y0)*frac,z:z0+(m.z-z0)*frac};
    // Blade edges collide with real masonry before the chassis body hits it.
    // Keep world-contact episodes independent of defender contacts, so continuous
    // overlap cannot drain the rotor every rendered frame.
    const worldSolids=room.world?.solids??[];
    for(let blade=0;blade<2;blade++){
      const heading=theta+blade*Math.PI;
      const dx=Math.cos(heading),dz=Math.sin(heading);
      const from=[pose.x+dx*ROTOR_CONTACT.inner,pose.y+2.18,pose.z+dz*ROTOR_CONTACT.inner];
      const to=[pose.x+dx*ROTOR_CONTACT.outer,pose.y+2.18,pose.z+dz*ROTOR_CONTACT.outer];
      for(let index=0;index<worldSolids.length;index++){
        const solid=worldSolids[index];if(!solid)continue;
        const center=solid.center??[0,0,0],size=solid.size??[0,0,0];
        if(Math.abs(center[0]-pose.x)>ROTOR_CONTACT.outer+size[0]/2+.2||
          Math.abs(center[2]-pose.z)>ROTOR_CONTACT.outer+size[2]/2+.2||
          Math.abs(center[1]-(pose.y+2.18))>size[1]/2+.2)continue;
        const key='world:'+String(solid.id??index)+':'+blade;
        const intersection=(solid.axes?orientedBoxHit(from,to,solid,.09):segmentAabbHit(from,to,solid));
        if(intersection&&!episodes[key]){
          episodes[key]=true;
          const beforeEnergy=m.rotorEnergy;
          m.rotorEnergy=clamp(m.rotorEnergy-18,0,100);
          m.rotorAngularVelocity*=.72;
          // Only a substantial strike at high speed damages rotor integrity.
          if(beforeEnergy>65&&Math.abs(m.rotorAngularVelocity)>24)
            damageFightFlight(room,m,7,null,'fight-flight-rotor-masonry',now,{componentId:'rotor',
              point:{x:intersection.point[0],y:intersection.point[1],z:intersection.point[2]},steelMinimum:1});
          room.events.push({type:'fightFlightRotorWorldImpact',machineId:m.id,solidId:solid.id??null,
            blade,point:{x:intersection.point[0],y:intersection.point[1],z:intersection.point[2]},at:now});
        }else if(!intersection)episodes[key]=false;
      }
    }
    for(const p of room.players.values()){
      if(!p.alive||p.id===m.operatorId||areAllies(room,m.operatorId,p.id))continue;
      const current=p.position,vel=p.velocity??{};
      const position={x:current.x-(vel.x??0)*dt*(1-frac),
        y:current.y-(vel.y??0)*dt*(1-frac),z:current.z-(vel.z??0)*dt*(1-frac)};
      const body={...position,height:postureOf(p).height,radius:.45};
      for(let blade=0;blade<2;blade++){
        const key=p.id+':'+blade;
        const contact=rotorBladeContact(pose,body,theta,blade);
        if(contact&&!episodes[key]){
          episodes[key]=true;
          hit(room,m,p,blade,contact,now,theta);
        }else if(!contact)episodes[key]=false;
        if(m.rotorHP<=0)break;
      }
      if(m.rotorHP<=0)break;
    }
    if(m.rotorHP<=0)break;
  }
}
