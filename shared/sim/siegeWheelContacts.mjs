// The machines are heavy MOVING geometry, not vehicles that get jammed by a
// Spellblade's collision capsule. Only real moving wheels make this small,
// server-authored contact. Walls, terrain and OTHER machines still block the
// carriage through their existing collision solvers.
import {orientedBoxHit} from '../src/orientedBox.mjs';
import {postureOf} from '../src/body.mjs';
import {areAllies} from '../src/teams.mjs';
import {launchBody} from '../src/movement.mjs';
import {applyDamage,staggerBy,interruptHitActions,isInGuardCone} from './combat.mjs';

export const SIEGE_WHEEL_HAZARD=Object.freeze({
 ram:Object.freeze({
  minSpeed:2.4,damageBase:3,damagePerSpeed:1.2,maxDamage:18,
  shoveBase:4.4,shovePerSpeed:.32,stagger:17,cooldown:.9,guardDrain:13,
  source:'knock-on-steel',
 }),
 ballista:Object.freeze({
  minSpeed:1.8,damageBase:1,damagePerSpeed:.55,maxDamage:7,
  shoveBase:2.0,shovePerSpeed:.19,stagger:8,cooldown:1.15,guardDrain:7,
  source:'bibye-wheel',
 }),
});

const byId=boxes=>new Map(boxes.map(box=>[box.componentId,box]));
const midway=(a,b)=>({...b,center:b.center.map((v,i)=>(v+a.center[i])/2)});
const center=p=>[p.position.x,p.position.y+Math.min(1.8,postureOf(p).height)/2,p.position.z];

function nearbyWheel(wheel,previous,point){
 // Wheels are small OBBs in their TRUE raised/steered chassis frames.
 // Three samples per limited translation substep prevent a body slipping
 // between the two poses. No giant chassis-wide invisible damage aura.
 const extra=.43;
 return [previous,midway(previous,wheel),wheel].some(box=>
  orientedBoxHit(point,point,box,extra));
}

/**
 * Called only AFTER real carriage translation. The contacted Spellblade is
 * shoved sideways and slightly forward, never treated as a solid that forces
 * the machine to brake or reverse. The contact ledger prevents four/six
 * overlapping wheels from charging damage separately or every 30Hz tick.
 */
export function stepSiegeWheelContacts(room,machine,previous,dt,now,kind,wheels,oldWheels){
 const profile=SIEGE_WHEEL_HAZARD[kind];
 if(!profile||!machine?.operatorId||!Number.isFinite(dt)||dt<=0||
   machine.retired||machine.health<=0)return;
 const speed=Math.hypot(machine.x-previous.x,machine.z-previous.z)/dt;
 if(speed<profile.minSpeed)return;
 const prev=byId(oldWheels.filter(v=>v.componentId?.startsWith('Wheel_')));
 const current=wheels.filter(v=>v.componentId?.startsWith('Wheel_')&&
   (machine.components?.[v.componentId]?.health??1)>0);
 if(!current.length)return;
 machine.wheelContactAt??={};
 for(const victim of room.players.values()){
  if(!victim.alive||victim.id===machine.operatorId||
    victim.operatingRamId===machine.id||victim.operatingBallistaId===machine.id||
    areAllies(room,machine.operatorId,victim.id))continue;
  // The separate forward chassis/striker contact has already spent this
  // approach. Wheel rims must not deliver a second hit on the same victim.
  if(kind==='ram'&&machine.bodyEpisodes?.[victim.id])continue;
  if(now-(machine.wheelContactAt[victim.id]??-Infinity)<profile.cooldown)continue;
  const point=center(victim);
  const wheel=current.find(box=>nearbyWheel(box,prev.get(box.componentId)??box,point));
  if(!wheel)continue;
  const angle=Math.hypot(victim.position.x-wheel.center[0],victim.position.z-wheel.center[2]);
  const side=wheel.componentId.endsWith('L')?1:-1;
  // The direction from an actually touched wheel is the push-out normal.
  // If directly centered, its named side supplies a stable fallback.
  const nx=angle>.08?(victim.position.x-wheel.center[0])/angle:
    wheel.axes[0][0]*side;
  const nz=angle>.08?(victim.position.z-wheel.center[2])/angle:
    wheel.axes[0][2]*side;
  const along=Math.sign((machine.x-previous.x)*-Math.sin(machine.heading??0)+
    (machine.z-previous.z)*-Math.cos(machine.heading??0))||1;
  const fwd={x:-Math.sin(machine.heading??0)*along,z:-Math.cos(machine.heading??0)*along};
  const by=machine.operatorId;
  const guarded=Boolean(victim.guarding&&isInGuardCone(victim,
    {position:{x:wheel.center[0],y:wheel.center[1],z:wheel.center[2]}},now));
  let damage=Math.min(profile.maxDamage,
    Math.round(profile.damageBase+(speed-profile.minSpeed)*profile.damagePerSpeed));
  if(guarded){
   damage=Math.max(1,Math.round(damage*.55));
   victim.guardStamina=Math.max(0,(victim.guardStamina??0)-profile.guardDrain);
   victim.lastGuardDrainAt=now;
   if(victim.guardStamina<=0){
    victim.guarding=false;
    room.events.push({type:'guardBreak',attackerId:by,defenderId:victim.id,at:now});
   }
  }
  // One contact budget per Spellblade and machine, not per wheel.
  machine.wheelContactAt[victim.id]=now;
  const pointWorld={...victim.position};
  if(!applyDamage(room,by,victim.id,damage,profile.source,now,null))continue;
  const shove=profile.shoveBase+(speed-profile.minSpeed)*profile.shovePerSpeed;
  const factor=guarded?.55:1;
  launchBody(victim,{x:(nx*.83+fwd.x*.17)*shove*factor,
    y:kind==='ram'?1.05:.55,
    z:(nz*.83+fwd.z*.17)*shove*factor},3);
  staggerBy(room,victim,profile.stagger*(guarded?.55:1),now,by);
  if(victim.alive)interruptHitActions(room,victim,by,now,profile.source);
  room.events.push({type:'siegeWheelContact',machineId:machine.id,machineKind:kind,
    wheelId:wheel.componentId,victimId:victim.id,point:pointWorld,
    guarded,damage,at:now});
 }
}
