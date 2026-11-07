// Restless Day's authoritative rules; shared with dedicated server and solo host.
// No exhaustion modifier, no overtime, no objective-capture fallback.
import { TEAMS } from '../src/teams.mjs';
import { segmentAabbHit } from '../src/collision.mjs';
export const RESTLESS_DAY_RULES=Object.freeze({
  matchSec:780,renownerHP:1650,ladderHP:190,replaceSec:18,carrySpeed:.65,
  interactRange:3.8,placementRange:5.6,swordRange:8.4,attackCooldown:4.2,
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const walls=[{id:'outer',z:-24,height:6,baseZ:-31},{id:'inner',z:22,height:7,baseZ:14}];
const ladderStart=(l)=>({x:l.position.x,y:0,z:l.wall===1?14:-31});
function newState(world){
 return {
   phase:0,elapsed:0,deadline:null,sundown:false,finish:null,
   renowner:{id:'rightful-renowner',position:{...world.restlessDay.renowner},yaw:Math.PI,
      attack:null,nextAttackAt:0,coinProjectiles:[]},
   ladders:world.restlessDay.ladders.map(l=>({
      id:l.id,state:'available',position:{x:l.x,y:0,z:l.z},wall:null,
      holderId:null,health:RESTLESS_DAY_RULES.ladderHP,respawnAt:null,replaces:0
   })),
 };
}
const aliveCarrier=(room,id)=>room.players.get(id)?.alive&&room.players.get(id)?.team===TEAMS.ATTACKERS;
function dropLadder(room,l,now){
 const p=room.players.get(l.holderId);
 if(p)p.restlessCarrying=null;
 l.position=p?.position?{...p.position}:{...l.position};
 l.state='available';l.holderId=null;l.wall=null;
 room.events.push({type:'restlessLadderDropped',ladderId:l.id,at:now});
}
export function withRestlessLadders(world,state){
 if(!state||world.id!=='restless-day')return world;
 // Replace, never accumulate dynamic geometry in repeated host/prediction updates.
 const ramps=(world.ramps??[]).filter(r=>!String(r.id).startsWith('siege-ladder-'));
 for(const l of state.ladders??[]){
   if(l.state!=='deployed'||!Number.isInteger(l.wall))continue;
   const w=walls[l.wall],z0=w.baseZ,z1=w.z;
   ramps.push({id:'siege-ladder-'+l.id,axis:'z',minX:l.position.x-1.3,
      maxX:l.position.x+1.3,minZ:Math.min(z0,z1),maxZ:Math.max(z0,z1),
      startY:l.wall===1?w.height:0,endY:l.wall===1?0:w.height});
 }
 return {...world,ramps};
}
function wallForPlacement(p){
 return walls.map((w,index)=>({index,w,d:Math.abs(p.position.z-w.baseZ)}))
   .filter(v=>v.d<=RESTLESS_DAY_RULES.placementRange&&Math.abs(p.position.x)<=20)
   .sort((a,b)=>a.d-b.d)[0]??null;
}
export function interactRestlessLadder(room,player,now){
 const s=room.restlessDay;
 if(!s||room.state!=='PLAYING'||!player.alive||player.team!==TEAMS.ATTACKERS
     ||player.operatingRamId||player.operatingBallistaId||player.operatingFightFlightId)
   return {rejected:'An attacking Spellblade on foot must handle the ladder.'};
 const held=s.ladders.find(l=>l.holderId===player.id);
 if(held){
   const placement=wallForPlacement(player);
   if(!placement||!(placement.index<=s.phase))
     return {rejected:'Carry the ladder to the foot of the active curtain wall.'};
   const {index,w}=placement;
   if(Math.abs(player.position.y)>.6)
     return {rejected:'Place the ladder from level, supported ground.'};
   const other=s.ladders.find(l=>l!==held&&l.state==='deployed'&&l.wall===index
     &&Math.abs(l.position.x-player.position.x)<2.8);
   if(other)return {rejected:'Give the other ladder clearance.'};
   held.position={x:clamp(player.position.x,-19,19),y:0,z:w.baseZ};
   held.state='deployed';held.wall=index;held.holderId=null;
   player.restlessCarrying=null;player.speedScale=1;
   room.events.push({type:'restlessLadderPlaced',ladderId:held.id,wall:w.id,at:now});
   return {};
 }
 const near=s.ladders.filter(l=>['available','deployed'].includes(l.state))
   .sort((a,b)=>dist(a.position,player.position)-dist(b.position,player.position))[0];
 if(!near||dist(near.position,player.position)>RESTLESS_DAY_RULES.interactRange)
   return {rejected:'Approach one of the two siege ladders.'};
 if(near.state==='deployed'&&near.wall!==null
   &&Math.abs(player.position.y-walls[near.wall].height)>.8
   &&dist(near.position,player.position)>2.0)
   return {rejected:'Recover the deployed ladder at its base or battlement.'};
 near.state='carrying';near.holderId=player.id;near.wall=null;
 player.restlessCarrying=near.id;player.speedScale=RESTLESS_DAY_RULES.carrySpeed;
 // A loaded carrier cannot sprint, dash, swing or cast as though unencumbered.
 player.sprinting=false;player.input={...player.input,sprint:false};
 room.events.push({type:'restlessLadderPicked',ladderId:near.id,playerId:player.id,at:now});
 return {};
}
export function damageRestlessLadder(room,id,amount,attackerId,now){
 const s=room.restlessDay,l=s?.ladders.find(x=>x.id===id);
 const attacker=room.players.get(attackerId);
 if(!l||l.state==='broken'||!attacker?.alive||attacker.team!==TEAMS.DEFENDERS
    ||!Number.isFinite(amount)||amount<=0)return false;
 l.health=Math.max(0,l.health-amount);
 if(l.health===0){
   if(l.holderId){const holder=room.players.get(l.holderId);if(holder){holder.restlessCarrying=null;holder.speedScale=1;}}
   l.state='broken';l.holderId=null;l.wall=null;l.respawnAt=now+RESTLESS_DAY_RULES.replaceSec;
 }
 room.events.push({type:'restlessLadderDamaged',ladderId:id,health:l.health,at:now});
 return true;
}
function strikeGeometry(s,t){
 // A physical line segment occupied by the travelling sword, not a radius AoE.
 const blade=s.renowner,arc=blade.attack;
 const turn=arc?.type==='sweep'?(clamp((t-arc.contactAt)/.25,0,1)-.5)*2.3:0;
 const theta=blade.yaw+turn;
 const length=arc?.type==='sweep'?7.8:5.8;
 return {a:[blade.position.x,arc?.type==='sweep'?2.4:4.0,blade.position.z],
 b:[blade.position.x+Math.sin(theta)*length,arc?.type==='sweep'?2.0:1.15,
    blade.position.z+Math.cos(theta)*length]};
}
function swordTouches(s,p,t){
 const {a,b}=strikeGeometry(s,t),center=[p.position.x,p.position.y+1.1,p.position.z];
 const v=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],u=[center[0]-a[0],center[1]-a[1],center[2]-a[2]];
 const k=clamp(u.reduce((n,x,i)=>n+x*v[i],0)/(v.reduce((n,x)=>n+x*x,0)||1),0,1);
 return Math.hypot(...center.map((x,i)=>x-a[i]-k*v[i]))<1.2;
}
function stepStatue(room,s,dt,now,damage){
 const r=s.renowner;
 const targets=[...room.players.values()].filter(p=>p.alive&&p.team===TEAMS.ATTACKERS
    &&dist(p.position,r.position)<=RESTLESS_DAY_RULES.swordRange);
 if(r.attack){
   if(now>=r.attack.contactAt&&now<=r.attack.contactAt+.25){
     for(const p of targets){
       if(r.attack.hit.includes(p.id)||!swordTouches(s,p,now))continue;
       const segment=strikeGeometry(s,now);
       const blocked=(room.world.solids??[]).some(box=>box.id!=='renowner-body'&&box.id!=='renowner-podium'
         &&segmentAabbHit(segment.a,[p.position.x,p.position.y+1.1,p.position.z],box));
       if(blocked)continue;
       r.attack.hit.push(p.id);
       damage?.(room,null,p.id,r.attack.type==='sweep'?32:40,'renowner-sword',now);
       room.events.push({type:'renownerSwordContact',targetId:p.id,attack:r.attack.type,at:now});
     }
   }
   if(now>r.attack.contactAt+.35){r.attack=null;r.nextAttackAt=now+RESTLESS_DAY_RULES.attackCooldown;}
 }else if(targets.length&&now>=r.nextAttackAt){
   const target=targets.sort((a,b)=>dist(a.position,r.position)-dist(b.position,r.position))[0];
   r.yaw=Math.atan2(target.position.x-r.position.x,target.position.z-r.position.z);
   r.attack={type:Math.floor(now/RESTLESS_DAY_RULES.attackCooldown)%3===0?'sweep':'downstroke',
     startedAt:now,contactAt:now+1.05,hit:[]};
   room.events.push({type:'renownerSwordWarn',attack:r.attack.type,yaw:r.yaw,at:now});
 }
}
export function restlessnessStep(room,dt,now,{damage}={}){
 if(room.state!=='PLAYING'||!room.restlessDay)return;
 const s=room.restlessDay;
 s.elapsed=Math.max(0,now-room.matchStartedAt);
 for(const l of s.ladders){
   if(l.state==='carrying'){
     if(!aliveCarrier(room,l.holderId))dropLadder(room,l,now);
     else{
       const p=room.players.get(l.holderId);
       l.position={...p.position};
       p.speedScale=RESTLESS_DAY_RULES.carrySpeed;
       p.sprinting=false;
     }
   }
   if(l.state==='broken'&&now>=l.respawnAt){
     const origin=room.world.restlessDay.ladders.find(x=>x.id===l.id);
     l.state='available';l.health=RESTLESS_DAY_RULES.ladderHP;l.respawnAt=null;l.replaces++;
     l.position=s.phase>=1?{x:origin.x,y:0,z:-4}:{x:origin.x,y:0,z:origin.z};
     room.events.push({type:'restlessLadderReplaced',ladderId:l.id,at:now});
   }
 }
 const attackers=[...room.players.values()].filter(p=>p.alive&&p.team===TEAMS.ATTACKERS);
 if(s.phase===0&&attackers.some(p=>p.position.z>-18&&p.position.y<1.2)){
   s.phase=1;room.events.push({type:'restlessCurtainBreached',wall:'outer',phase:1,at:now});
 }
 if(s.phase===1&&attackers.some(p=>p.position.z>29&&p.position.y<1.2)){
   s.phase=2;room.events.push({type:'restlessCurtainBreached',wall:'inner',phase:2,at:now});
 }
 stepStatue(room,s,dt,now,damage);
}
function onTime(room,now){
 const s=room.restlessDay;
 if(!s||room.state!=='PLAYING')return true;
 if(now>=s.deadline){
   s.sundown=true;s.finish='sleep';
   for(const p of room.players.values())if(p.team===TEAMS.ATTACKERS) {
     p.restlessAsleep=true;p.input={forward:0,right:0,sprint:false,jump:false};
   }
   room.events.push({type:'restlessSundown',at:s.deadline,subtitle:"I'm too tired for this."});
   room.finish(TEAMS.DEFENDERS,s.deadline,'sundown');
 }
 return true; // handled: never enter Breakthrough overtime logic
}
function onStructureDamage(room,id,now){
 if(id!=='rightful-renowner'||room.structures?.entities[id]?.health>0||
   room.state!=='PLAYING'||!room.restlessDay)return;
 if(now>=room.restlessDay.deadline){onTime(room,now);return;}
 room.restlessDay.finish='surrender';
 room.events.push({type:'renownerDestroyed',at:now});
 room.finish(TEAMS.ATTACKERS,now,'renowner-destroyed');
}
function botGoal(room,actor){
 const s=room.restlessDay;if(!s)return null;
 const i=actor.rivalIndex??0;
 if(actor.team===TEAMS.DEFENDERS){
   if(s.phase===0)return {x:(i-2)*6,y:6,z:-22};
   if(s.phase===1)return {x:(i-2)*5,y:7,z:23};
   return {x:(i-2)*4,y:0,z:49};
 }
 const own=s.ladders.find(l=>l.holderId===actor.id);
 const wall=walls[Math.min(1,s.phase)];
 if(s.phase<2){
   if(own)return {x:clamp(own.position.x,-19,19),y:0,z:wall.baseZ};
   const deploy=s.ladders.find(l=>l.state==='deployed'&&l.wall===s.phase);
   if(deploy){
     const z=actor.position.z<wall.z-3?wall.baseZ:wall.z+5;
     return {x:deploy.position.x,y:z===wall.baseZ?0:wall.height,z};
   }
   const loose=s.ladders.find(l=>l.state==='available');
   if(loose)return {...loose.position};
   return {x:(i%2?10:-10),y:0,z:wall.baseZ};
 }
 return {x:0,y:0,z:55};
}
export const RESTLESS_DAY_HANDLER=Object.freeze({
 init:(room)=>{room.restlessDay=newState(room.world);},
 reset:(room,now)=>{room.restlessDay=newState(room.world);
   room.restlessDay.deadline=now+room.policy.matchSeconds;
   room.events.push({type:'restlessDaylightStarted',deadline:room.restlessDay.deadline,at:now,
     subtitle:"If I ever sleep, I'll surrender. Let this be a restless day."});},
 step:restlessnessStep,onTime,onStructureDamage,
 spawn:(room,player,spawns)=>spawns.filter(s=>s.team===player.team&&(
   player.team===TEAMS.DEFENDERS?s.phase===0:s.phase<=(room.restlessDay?.phase??0))),
 botGoal,
 command:(room,player,message,now)=>message.type==='restlessLadder'
   ?interactRestlessLadder(room,player,now):null,
 serialize:(room,now)=>room.restlessDay?{
   phase:room.restlessDay.phase,deadline:room.restlessDay.deadline,
   daylightRemaining:Math.max(0,(room.restlessDay.deadline??now)-now),
   sundown:room.restlessDay.sundown,finish:room.restlessDay.finish,
   ladders:room.restlessDay.ladders.map(l=>({...l,position:{...l.position}})),
   renowner:{...room.restlessDay.renowner,
     health:room.structures?.entities['rightful-renowner']?.health??RESTLESS_DAY_RULES.renownerHP,
     maxHealth:RESTLESS_DAY_RULES.renownerHP,
     attack:room.restlessDay.renowner.attack?{...room.restlessDay.renowner.attack}:null},
 }:null,
});
