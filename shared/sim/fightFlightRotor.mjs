// Actual rotor blade crossings. Angular substeps detect an entire blade passage at 30Hz,
// not a fixed hit aura. An episode ends only when the blade physically leaves a body.
import {postureOf} from '../src/body.mjs';
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
