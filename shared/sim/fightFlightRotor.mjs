// Actual rotor blade crossings. Angular substeps detect an entire blade passage at 30Hz,
// not a fixed hit aura. An episode ends only when the blade physically leaves a body.
import {chivalryParries} from '../src/ultimates.mjs';
import {flightTransform} from '../src/flightRepeaterAim.mjs';
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
// Same root pitch, heading and hub rotation as the authored GLB.
export function rotorBladeSegment(m,phase,blade=0){
  const theta=phase+blade*Math.PI;
  // Shaft [0,1.985,-.025] + hub [0,.2,0] in the v3.0 GLB.
  const hub=flightTransform(m,0,2.185,-.025);
  const axis=flightTransform(m,Math.cos(theta),0,-Math.sin(theta));
  const center={x:m.x+hub.x,y:m.y+hub.y,z:m.z+hub.z};
  const at=r=>[center.x+axis.x*r,center.y+axis.y*r,center.z+axis.z*r];
  return {center,axis,from:at(ROTOR_CONTACT.inner),to:at(ROTOR_CONTACT.outer)};
}
// Intersect blade height with the actual vertical body first, then find the
// closest horizontal point on that remaining segment. No unpitched hit aura.
export function rotorBladeContact(m,body,phase,blade=0){
  const {center,axis}=rotorBladeSegment(m,phase,blade);
  let lo=ROTOR_CONTACT.inner,hi=ROTOR_CONTACT.outer;
  const bottom=body.y-ROTOR_CONTACT.bladeHalfHeight;
  const top=body.y+(body.height??1.8)+ROTOR_CONTACT.bladeHalfHeight;
  if(Math.abs(axis.y)<1e-8){if(center.y<bottom||center.y>top)return null;}
  else{
    const a=(bottom-center.y)/axis.y,b=(top-center.y)/axis.y;
    lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));
    if(lo>hi)return null;
  }
  const denominator=axis.x*axis.x+axis.z*axis.z;
  const r=clamp(((body.x-center.x)*axis.x+(body.z-center.z)*axis.z)/Math.max(1e-9,denominator),lo,hi);
  const contact={x:center.x+axis.x*r,y:center.y+axis.y*r,z:center.z+axis.z*r};
  const distance=Math.hypot(body.x-contact.x,body.z-contact.z);
  const radius=(body.radius??.45)+ROTOR_CONTACT.bladeWidth;
  if(distance>radius)return null;
  return {distance,r,contact,quality:clamp((radius-distance)/(radius*.8),0,1)};
}
function defended(victim,point,m,automatic){
  if((!victim.guarding&&!automatic)||victim.guardStamina<=0)return false;
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
  const automatic=chivalryParries(p,now,{x:m.x-p.position.x,z:m.z-p.position.z});
  const blocked=defended(p,contact.contact,m,automatic);
  if(blocked){
    const time=(now-(p.guardStartedAt??-Infinity))*1000;
    const parry=automatic||time>=0&&time<=GAME.parryWindowMs;
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
  const pending=new Map();
  const resolve=entry=>{
    if(!entry?.episode.pending)return;
    entry.episode.pending=false;
    hit(room,m,entry.player,entry.blade,entry.episode.contact,now);
  };
  for(let k=1;k<=samples;k++){
    const frac=k/samples,theta=before+angularTravel*frac;
    const pose={x:x0+(m.x-x0)*frac,y:y0+(m.y-y0)*frac,z:z0+(m.z-z0)*frac,
      heading:m.heading,runPitch:m.runPitch??0};
    // Blade edges collide with real masonry before the chassis body hits it.
    // Keep world-contact episodes independent of defender contacts, so continuous
    // overlap cannot drain the rotor every rendered frame.
    const worldSolids=room.world?.solids??[];
    for(let blade=0;blade<2;blade++){
      const {center:hub,from,to}=rotorBladeSegment(pose,theta,blade);
      for(let index=0;index<worldSolids.length;index++){
        const solid=worldSolids[index];if(!solid)continue;
        const center=solid.center??[0,0,0],size=solid.size??[0,0,0];
        if(Math.abs(center[0]-hub.x)>ROTOR_CONTACT.outer+size[0]/2+.2||
          Math.abs(center[2]-hub.z)>ROTOR_CONTACT.outer+size[2]/2+.2||
          Math.abs(center[1]-hub.y)>size[1]/2+ROTOR_CONTACT.outer*Math.abs(Math.sin(pose.runPitch))+.2)continue;
        const key='world:'+String(solid.id??index)+':'+blade;
        const intersection=(solid.axes?orientedBoxHit(from,to,solid,.09):segmentAabbHit(from,to,solid));
        if(intersection&&!episodes[key]){
          episodes[key]=true;
          const beforeEnergy=m.rotorEnergy;
          m.rotorEnergy=clamp(m.rotorEnergy-28,0,100);
          m.rotorAngularVelocity*=.55;
          m.rotorLiftSuppressedUntil=Math.max(m.rotorLiftSuppressedUntil??0,now+.20);
          const travelSpeed=Math.hypot(m.velocity?.x??0,m.velocity?.y??0,m.velocity?.z??0);
          if(travelSpeed>3){m.velocity.x*=.72;m.velocity.z*=.72;}
          // Only high-energy translation contact, not ordinary blade RPM,
          // can cause component HP damage. One continuous contact is one episode.
          if(travelSpeed>12&&beforeEnergy>85&&Math.abs(m.rotorAngularVelocity)>24)
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
        if(contact){
          if(!episodes[key]){
            const episode={pending:true,contact};episodes[key]=episode;
            pending.set(key,{player:p,blade,episode});
          }else if(episodes[key].pending&&contact.quality>episodes[key].contact.quality){
            episodes[key].contact=contact;
          }
        }else{
          resolve(pending.get(key));episodes[key]=false;
        }
        if(m.rotorHP<=0)break;
      }
      if(m.rotorHP<=0)break;
    }
    if(m.rotorHP<=0)break;
  }
  // Resolve from points the blade actually visited in this tick. The first
  // boundary sample is usually a graze; it must not consume a clean crossing.
  // A retained episode still permits exactly one hit until physical separation.
  for(const entry of pending.values())resolve(entry);
}
