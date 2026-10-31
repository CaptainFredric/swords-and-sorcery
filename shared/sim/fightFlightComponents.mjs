// Fight-and-Flight component geometry, fitted to canonical v2.6 GLB node transforms.
// Local +Z points forward; world heading zero points -Z. No player-health redirection.
import {orientedBoxHit} from '../src/orientedBox.mjs';
import {steelMitigate,steelTakes,callSteel,STEEL} from '../src/steel.mjs';
import {dismountFightFlight} from './fightFlight.mjs';
import {applyDamage} from './combat.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const COMPONENTS={rotor:{hp:'rotorHP',max:100,steel:true},
  braceL:{hp:'braceLHP',max:80,steel:true},
  braceR:{hp:'braceRHP',max:80,steel:true},
  main:{hp:'health',max:250,steel:false}};
export const FIGHT_FLIGHT_COMPONENTS=Object.freeze(COMPONENTS);
const rot=m=>({s:Math.sin(m.heading??0),c:Math.cos(m.heading??0)});
function box(m,component,local,size,spin=0){
  const {s,c}=rot(m);
  // The renderer pitches the complete authored model about local +X
  // during offensive runs and terminal dives, before heading rotation.
  const pitch=Number.isFinite(m.runPitch)?m.runPitch:0,cp=Math.cos(pitch),sp=Math.sin(pitch);
  const ly=local[1]*cp-local[2]*sp,lz=local[1]*sp+local[2]*cp;
  const p={x:m.x-local[0]*c-lz*s,y:m.y+ly,z:m.z+local[0]*s-lz*c};
  const a=[[-c,0,s],[-s*sp,cp,-c*sp],[-s*cp,-sp,-c*cp]];
  if(spin){const sa=Math.sin(spin),ca=Math.cos(spin);
    const u=a[0],v=a[2];a[0]=u.map((x,i)=>x*ca+v[i]*sa);a[2]=v.map((x,i)=>x*ca-u[i]*sa);}
  return {id:'fight-flight-'+m.id+'-'+component,componentId:component,center:[p.x,p.y,p.z],axes:a,size};
}
export function fightFlightHitVolumes(m){
  if(!m||m.retired||m.mode==='DESTROYED')return [];
  const volumes=[];
  // GLB mesh bounds include oak/iron brace rather than a spherical protective field.
  if(m.braceLHP>0)volumes.push(box(m,'braceL',[.415,1.28,.05],[.51,.94,.64]));
  if(m.braceRHP>0)volumes.push(box(m,'braceR',[-.415,1.28,.05],[.51,.94,.64]));
  if(m.rotorHP>0){
    // Both sword blades swing on the hub centered at Y=2.18; broad bevel adds
    // at most 0.377m chord width. The hub itself also receives rotor damage.
    const phase=m.rotorAngle??0;
    volumes.push(box(m,'rotor',[0,2.18,0],[.48,.29,.34]));
    const centers=[.706,-.706];
    for(const x of centers){
      const cx=x*Math.cos(phase),cz=-x*Math.sin(phase);
      volumes.push(box(m,'rotor',[cx,2.18,cz],[1.228,.18,.754],phase));
    }
  }
  volumes.push(box(m,'main',[0,1.44,-.14],[1.18,1.22,1.06]));
  return volumes;
}
export function fightFlightFirstHit(m,start,end,grow=0){
  let first=null;
  for(const volume of fightFlightHitVolumes(m)){
    const h=orientedBoxHit(start,end,volume,grow);
    if(h&&(!first||h.t<first.t))first={...h,componentId:volume.componentId};
  }
  return first;
}
export function readyFightFlightSteel(m,now=0){
  m.componentSteel??={};
  for(const name of ['rotor','braceL','braceR']){
    if(!m.componentSteel[name])m.componentSteel[name]=callSteel(now);
  }
}
export function damageFightFlight(room,m,amount,attackerId,source,now,{componentId='main',point=null,steelMinimum=0}={}){
  if(!m||m.retired||m.mode==='DESTROYED'||!(amount>0))return false;
  const def=COMPONENTS[componentId];if(!def)return false;
  if(m[def.hp]<=0)return false;
  if(m.team&&attackerId&&room.players.get(attackerId)?.team===m.team)return false;
  let actual=amount,turned=0;
  if(def.steel){
    readyFightFlightSteel(m,m.builtAt??0);
    const state=m.componentSteel[componentId],mit=steelMitigate(state,amount,source,now,steelMinimum);
    actual=mit.amount;turned=mit.turned;
    // Real finite Steel: after contact it can fade and its window is not indefinitely restored.
    if(turned>0)m.componentSteel[componentId]=steelTakes(state,now);
  }
  actual=clamp(actual,0,m[def.hp]);
  m[def.hp]-=actual;
  const gone=m[def.hp]<=0;
  room.events?.push({type:'fightFlightComponentHit',machineId:m.id,component:componentId,point,
    attackerId,source,damage:actual,turned,health:m[def.hp],destroyed:gone,at:now});
  if(gone&&componentId==='rotor'){
    m.rotorHP=0;m.rotorEnergy=0;m.rotorAngularVelocity=0;
    m.offensiveRun=false;m.rotorDestroyedAt=now;
    if(!m.grounded)m.mode='FALLING';
    room.events?.push({type:'fightFlightRotorDestroyed',machineId:m.id,point,at:now});
  }
  if(gone&&componentId.startsWith('brace'))room.events?.push({type:'fightFlightBraceDestroyed',machineId:m.id,component:componentId,at:now,point});
  if(gone&&componentId==='main'){
    // An irreversibly committed terminal wreck still owes one explosion and
    // a bounded rider outcome. Route external chassis failure through that
    // outcome rather than bypassing it with ordinary vehicle destruction.
    if(m.terminalDive&&!m.terminalDive.resolved){
      m.terminalDive.impactAt=now;
      room.events?.push({type:'fightFlightTerminalStructuralFailure',machineId:m.id,at:now,point});
      return {damage:actual,turned,destroyed:true,component:componentId};
    }
    m.mode='DESTROYED';m.destroyedAt=now;m.firingOperatorId=null;m.offensiveRun=false;
    const pilot=m.operatorId?room.players.get(m.operatorId):null;
    if(pilot){
      // Separates rider from wreck before real damage; death/Steel and attribution
      // remain owned by Castleward's regular combat system.
      dismountFightFlight(room,m,pilot,{force:true,at:now});
      applyDamage(room,attackerId,pilot.id,35,'fight-flight-collapse',now);
    }
    room.events?.push({type:'fightFlightDestroyed',machineId:m.id,point,attackerId,at:now});
  }
  return {damage:actual,turned,destroyed:gone,component:componentId};
}
