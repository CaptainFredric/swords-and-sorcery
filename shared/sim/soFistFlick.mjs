// SO-FIST-ICATION: one physically swept fingertip, not a second piston or an AoE.
// Positions were reconstructed from Argon's v26 GLB and checked against its
// fingertip contact manifest. The server owns contact, damage and displacement.
import {orientedBoxHit} from '../src/orientedBox.mjs';
import {postureOf} from '../src/body.mjs';
import {areAllies} from '../src/teams.mjs';
import {launchBody} from '../src/movement.mjs';
import {applyDamage,staggerBy,interruptHitActions,isInGuardCone} from './combat.mjs';
import {armWorldImpact} from './worldImpact.mjs';
import {SO_FIST_SCALE,soFistFrame} from './soFistGeometry.mjs';
import {soFistUpperPoint} from './soFistElevation.mjs';
import {biByeHitVolumes} from './biByeComponents.mjs';
import {damageBiByeLlista} from './biByeLlista.mjs';
import {fightFlightHitVolumes,damageFightFlight} from './fightFlightComponents.mjs';
import {applyBallistaImpact} from './siegeImpact.mjs';

export const FLICK = Object.freeze({
  damage:80, cycle:4, tipRadius:.165, activeFrom:.65, activeTo:.85,
  impulse:28, upwardImpulse:5, guardDamageFactor:.55,
  guardImpulseFactor:.35, guardDrain:45,
});
// Authored fingertip positions in model metres at neutral elevation, in the
// BattleRam_Root frame. 20 Hz animation keys; collision is swept at 120 Hz.
export const FLICK_TIP_TRACK=Object.freeze([
  Object.freeze({t:.65,p:[-.1217,.4805,.8056]}),
  Object.freeze({t:.70,p:[-.1609,.4168,1.2894]}),
  Object.freeze({t:.75,p:[-.1816,.6120,1.3562]}),
  Object.freeze({t:.80,p:[-.2414,.6231,1.3139]}),
  Object.freeze({t:.85,p:[-.3065,.6308,1.2430]}),
]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const identity=[[1,0,0],[0,1,0],[0,0,1]];
function tipLocal(t){
  for(let i=1;i<FLICK_TIP_TRACK.length;i++){
    const a=FLICK_TIP_TRACK[i-1],b=FLICK_TIP_TRACK[i];
    if(t>b.t+1e-9)continue;
    const u=clamp((t-a.t)/(b.t-a.t),0,1);
    return a.p.map((v,k)=>v+(b.p[k]-v)*u);
  }
  return [...FLICK_TIP_TRACK.at(-1).p];
}
export function flickTipWorld(b,t){
  const p=tipLocal(clamp(t,FLICK.activeFrom,FLICK.activeTo));
  return soFistUpperPoint(soFistFrame(b),b,p.map(n=>n*SO_FIST_SCALE));
}
export function canFlick(b,now){
  return Boolean(b&&!b.retired&&b.health>0&&b.fistMounted!==false&&
    (b.components?.Fist?.health??0)>0&&
    (b.components?.Drive?.health??0)>0&&
    (b.strikeAt==null||now-b.strikeAt>=FLICK.cycle)&&
    (b.flickAt==null||now-b.flickAt>=FLICK.cycle));
}
export function beginFlick(room,b,now){
  if(!canFlick(b,now))return false;
  b.flickAt=now;b.flickLastAge=0;b.flickContactUsed=false;
  b.flickOwnerId=b.operatorId;
  room.events.push({type:'soFistFlickStarted',machineId:b.id,at:now});
  return true;
}
function firstContact(room,b,from,to,now){
  let first=null;
  const consider=(hit,kind,target,box=null)=>{
    if(hit&&(!first||hit.t<first.hit.t))first={hit,kind,target,box};
  };
  for(const victim of room.players.values()){
    if(!victim.alive||victim.id===b.flickOwnerId||areAllies(room,b.flickOwnerId,victim.id))continue;
    const h=postureOf(victim).height;
    consider(orientedBoxHit(from,to,{
      center:[victim.position.x,victim.position.y+h/2,victim.position.z],
      size:[.9,h,.9],axes:identity,
    },FLICK.tipRadius),'player',victim);
  }
  for(const [machine,boxes,kind] of [
    [room.biByeLlista,biByeHitVolumes(room.biByeLlista,now),'ballista'],
    [room.fightFlight,fightFlightHitVolumes(room.fightFlight),'flight'],
  ]){
    if(!machine||machine.retired||machine.health<=0||b.team&&machine.team===b.team)continue;
    for(const box of boxes)consider(orientedBoxHit(from,to,box,FLICK.tipRadius),kind,machine,box);
  }
  // Obstacles stop the physical finger before it can reach a target.
  for(const solid of room.world?.solids??[]){
    if(!solid?.center||!solid?.size)continue;
    const box={...solid,axes:solid.axes??identity};
    consider(orientedBoxHit(from,to,box,FLICK.tipRadius),'wall',solid);
  }
  return first;
}
function impact(room,b,contact,now){
  if(contact.kind==='wall'){
    room.events.push({type:'soFistFlickBlocked',machineId:b.id,at:now});
    return;
  }
  const root=soFistFrame(b),forward=root.axes[2],by=b.flickOwnerId;
  const point=contact.hit.point;
  if(contact.kind==='player'){
    const v=contact.target;
    const guarded=Boolean(v.guarding&&isInGuardCone(v,{position:{x:b.x,y:b.y,z:b.z}},now));
    const damage=guarded?Math.round(FLICK.damage*FLICK.guardDamageFactor):FLICK.damage;
    if(guarded){
      v.guardStamina=Math.max(0,v.guardStamina-FLICK.guardDrain);
      v.lastGuardDrainAt=now;
      if(v.guardStamina<=0){v.guarding=false;room.events.push({type:'guardBreak',attackerId:by,defenderId:v.id,at:now});}
    }
    if(applyDamage(room,by,v.id,damage,'so-fist-flick',now,null)){
      const k=guarded?FLICK.guardImpulseFactor:1;
      launchBody(v,{x:forward[0]*FLICK.impulse*k,y:FLICK.upwardImpulse*k,z:forward[2]*FLICK.impulse*k},6);
      staggerBy(room,v,guarded?30:78,now,by);
      if(v.alive){armWorldImpact(v,by,'so-fist-flick',now);interruptHitActions(room,v,by,now,'so-fist-flick');}
    }
    room.events.push({type:'soFistFlickImpact',machineId:b.id,victimId:v.id,guarded,damage,point,at:now});
  }else if(contact.kind==='ballista'){
    damageBiByeLlista(room,contact.target,FLICK.damage,by,'so-fist-flick',now,{
      componentId:contact.box.componentId,point:{x:point[0],y:point[1],z:point[2]},
    });
    applyBallistaImpact(room,contact.target,now,{
      normal:{x:forward[0],z:forward[2]},speed:FLICK.impulse,
      point:{x:point[0],y:point[1],z:point[2]},
    });
    room.events.push({type:'soFistFlickMachineImpact',machineId:b.id,targetId:contact.target.id,kind:'ballista',at:now});
  }else if(contact.kind==='flight'){
    damageFightFlight(room,contact.target,FLICK.damage,by,'so-fist-flick',now,{
      componentId:contact.box.componentId,point:{x:point[0],y:point[1],z:point[2]},
    });
    room.events.push({type:'soFistFlickMachineImpact',machineId:b.id,targetId:contact.target.id,kind:'flight',at:now});
  }
}
export function stepFlick(room,b,dt,now){
  if(!b||b.flickAt==null||b.retired||b.health<=0)return;
  const prior=clamp(b.flickLastAge??0,0,FLICK.cycle),age=clamp(now-b.flickAt,0,FLICK.cycle);
  const lo=Math.max(prior,FLICK.activeFrom),hi=Math.min(age,FLICK.activeTo);
  if(!b.flickContactUsed&&hi>lo){
    // 120 Hz sub-arc checks preserve the finger's sharp curved whip at the 30 Hz
    // room tick; one target per committed flick.
    const steps=Math.ceil((hi-lo)*120);
    for(let i=0;i<steps;i++){
      const a=lo+(hi-lo)*i/steps,c=lo+(hi-lo)*(i+1)/steps;
      const hit=firstContact(room,b,flickTipWorld(b,a),flickTipWorld(b,c),now);
      if(!hit)continue;
      b.flickContactUsed=true;
      impact(room,b,hit,now);
      break;
    }
  }
  b.flickLastAge=age;
  if(age>=FLICK.cycle){
    room.events.push({type:'soFistFlickRecovered',machineId:b.id,at:now});
    b.flickAt=null;b.flickLastAge=0;
  }
}
