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
 if(p){p.restlessCarrying=null;p.speedScale=1;}
 l.position=p?.position?{...p.position}:{...l.position};
 l.state='available';l.holderId=null;l.wall=null;
 room.events.push({type:'restlessLadderDropped',ladderId:l.id,at:now});
}
// Shared by client prediction and the authoritative server. Stable identities
// prevent O(nodes^2) bot graph recomputation on every 30 Hz simulation tick.
const ladderBase=new WeakMap();
const ladderVariants=new WeakMap();
export function withRestlessLadders(world,state){
 if(!state||world.id!=='restless-day')return world;
 const base=ladderBase.get(world)??world;
 const placed=(state.ladders??[]).filter(l=>l.state==='deployed'&&Number.isInteger(l.wall));
 if(!placed.length)return base;
 const key=placed.map(l=>`${l.id}:${l.wall}:${l.position.x.toFixed(2)}`).sort().join('|');
 let variants=ladderVariants.get(base);
 if(!variants)ladderVariants.set(base,variants=new Map());
 if(variants.has(key))return variants.get(key);
 const ramps=[...(base.ramps??[])],solids=[...(base.solids??[])];
 const nodes=[...(base.navigation?.nodes??[])];
 for(const l of placed){
   const w=walls[l.wall],z0=w.baseZ,z1=w.z-(l.wall===0?1.8:1.9);
   ramps.push({id:'siege-ladder-'+l.id,axis:'z',minX:l.position.x-1.3,
      maxX:l.position.x+1.3,minZ:z0,maxZ:z1,startY:0,endY:w.height});
   // Thin continuous side rails give real carried equipment a collision
   // silhouette without turning its climbable centre into a solid barrier.
   for(const side of [-1,1])for(let i=0;i<6;i++){
     const t=(i+.5)/6,length=z1-z0;
     solids.push({id:`siege-ladder-${l.id}-${side}-${i}`,
       center:[l.position.x+side*1.39,w.height*t-.29,z0+length*t],
       size:[.22,.34,length/6+.04],material:'iron'});
   }
   for(const t of [0,.25,.5,.75,1]){
     nodes.push({id:`rd-ladder-${l.id}-${t}`,x:l.position.x,
       y:w.height*t,z:z0+(z1-z0)*t});
   }
 }
 const result={...base,ramps,solids,
   navigation:{...base.navigation,nodes}}; 
 ladderBase.set(result,base);
 if(variants.size>16)variants.delete(variants.keys().next().value);
 variants.set(key,result);
 return result;
}

/** A 5.4 m forged ladder projects beyond the knight's shoulders and cannot
 * be dragged through the stone. Check the entire swept beam at body radius. */
export function restlessCarryClear(world,position,yaw){
 if(!world||!position||!Number.isFinite(yaw))return false;
 const dx=-Math.sin(yaw),dz=-Math.cos(yaw);
 const radius=.32;
 for(let t=-1.9;t<=3.5;t+=.45){
   const x=position.x+dx*t,z=position.z+dz*t,y=position.y+1.45;
   for(const b of world.solids??[]){
     if(!b?.center||!b?.size)continue;
     const [cx,cy,cz]=b.center,[sx,sy,sz]=b.size;
     // Use a conservative beam cross-section; the operator's own movement
     // collider is handled separately by the standard movement system.
     if(Math.abs(y-cy)<=sy/2+radius&&
        Math.abs(x-cx)<=sx/2+radius&&Math.abs(z-cz)<=sz/2+radius)
       return false;
   }
 }
 return true;
}
/** Post-step position correction only for occupied ladder carriers. Returns
 * true when the proposed step is blocked by the physical carried beam. */
export function constrainRestlessCarry(state,from,world,yaw){
 if(!state?.restlessCarrying)return false;
 if(restlessCarryClear(world,state.position,yaw))return false;
 state.position={...from};
 state.velocity.x=0;state.velocity.z=0;
 state.sprinting=false;state.sprintBlend=0;
 return true;
}
function ladderReach(l,p){
 const foot=dist(l.position,p.position);
 if(l.state!=='deployed'||!Number.isInteger(l.wall))return foot;
 const w=walls[l.wall];
 const top=Math.hypot(p.position.x-l.position.x,p.position.y-w.height,p.position.z-w.z);
 return Math.min(foot,top);
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
   // A ladder placed through an empty gateway has no curtain to bear its weight.
   const curtain=(room.world.solids??[]).some(b=>String(b.id??'').startsWith(w.id+'-curtain')
     &&player.position.x>b.center[0]-b.size[0]/2+.8
     &&player.position.x<b.center[0]+b.size[0]/2-.8);
   if(!curtain)return {rejected:'Use an intact stone curtain, not the gate opening.'};
   const lipZ=w.z-(index===0?1.8:1.9);
   const lipObstruction=(room.world.solids??[]).some(box=>{
     if(!box.center||!box.size)return false;
     return Math.abs(player.position.x-box.center[0])<=box.size[0]/2+.55
       &&Math.abs(lipZ-box.center[2])<=box.size[2]/2+.55
       &&box.center[1]+box.size[1]/2>w.height+.3
       &&box.center[1]-box.size[1]/2<w.height+1.8;
   });
   if(lipObstruction)return {rejected:'The battlement lip must be clear of stonework.'};
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
   .sort((a,b)=>ladderReach(a,player)-ladderReach(b,player))[0];
 if(!near||ladderReach(near,player)>RESTLESS_DAY_RULES.interactRange)
   return {rejected:'Approach one of the two siege ladders.'};
 if(near.state==='deployed'&&near.wall!==null
   &&Math.abs(player.position.y-walls[near.wall].height)>.8
   &&ladderReach(near,player)>2.0)
   return {rejected:'Recover the deployed ladder at its base or battlement.'};
 if(!restlessCarryClear(room.world,player.position,player.yaw??0))
   return {rejected:'The ladder cannot be shouldered inside stonework.'};
 near.state='carrying';near.holderId=player.id;near.wall=null;
 player.attackHeld=false;player.attackActive=false;player.attackSweep=null;
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
function launchCoin(room,s,target,now){
 const r=s.renowner,origin={x:r.position.x,y:5.2,z:r.position.z};
 const aim={x:target.position.x-origin.x,y:target.position.y+1.1-origin.y,z:target.position.z-origin.z};
 const norm=Math.hypot(aim.x,aim.y,aim.z)||1,speed=16;
 const coin={id:`renown-${Math.floor(now*1000)}`,position:origin,
   velocity:{x:aim.x/norm*speed,y:aim.y/norm*speed,z:aim.z/norm*speed},bornAt:now};
 r.coinProjectiles.push(coin);
 room.events.push({type:'renownerCoinLaunched',projectile:{...coin},at:now});
}
function stepCoins(room,s,dt,now,damage){
 const coins=s.renowner.coinProjectiles??[];
 const remain=[];
 for(const coin of coins){
  if(now-coin.bornAt>2.6)continue;
  const from=coin.position;
  const to={x:from.x+coin.velocity.x*dt,y:from.y+coin.velocity.y*dt,z:from.z+coin.velocity.z*dt};
  const a=[from.x,from.y,from.z],b=[to.x,to.y,to.z];
  const solidHit=(room.world.solids??[]).filter(x=>x.id!=='renowner-body'&&x.id!=='renowner-podium')
    .map(box=>segmentAabbHit(a,b,box)).filter(Boolean).sort((x,y)=>x.t-y.t)[0]??null;
  const hits=[];
  for(const player of room.players.values()){
   if(!player.alive||player.team!==TEAMS.ATTACKERS)continue;
   const pos={x:player.position.x,y:player.position.y+1.0,z:player.position.z};
   const d={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};
   const v={x:pos.x-from.x,y:pos.y-from.y,z:pos.z-from.z};
   const u=clamp((v.x*d.x+v.y*d.y+v.z*d.z)/(d.x*d.x+d.y*d.y+d.z*d.z||1),0,1);
   if(Math.hypot(v.x-u*d.x,v.y-u*d.y,v.z-u*d.z)<.85)hits.push({player,t:u});
  }
  hits.sort((x,y)=>x.t-y.t);
  if(hits[0]&&(!solidHit||hits[0].t<=solidHit.t)){
   damage?.(room,null,hits[0].player.id,16,'renowner-coin',now);
   room.events.push({type:'renownerCoinHit',targetId:hits[0].player.id,at:now});
  }else if(solidHit){
   room.events.push({type:'renownerCoinImpact',point:solidHit.point,at:now});
  }else{
   coin.position=to;remain.push(coin);
  }
 }
 s.renowner.coinProjectiles=remain;
}
function stepStatue(room,s,dt,now,damage){
 const r=s.renowner;
 const targets=[...room.players.values()].filter(p=>p.alive&&p.team===TEAMS.ATTACKERS
    &&dist(p.position,r.position)<=RESTLESS_DAY_RULES.swordRange);
 if(r.attack){
   if(r.attack.type==='coin'&&now>=r.attack.contactAt&&!r.attack.fired){
     const target=room.players.get(r.attack.targetId);
     if(target?.alive)launchCoin(room,s,target,now);
     r.attack.fired=true;
   }
   if(r.attack.type!=='coin'&&now>=r.attack.contactAt&&now<=r.attack.contactAt+.25){
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
   r.attacksMade=(r.attacksMade??0)+1;
   r.attack={type:r.attacksMade%4===0?'coin':r.attacksMade%3===0?'sweep':'downstroke',
     startedAt:now,contactAt:now+1.05,targetId:target.id,fired:false,hit:[]};
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
       l.position={x:p.position.x,y:p.position.y+1.4,z:p.position.z};
      if(restlessCarryClear(room.world,p.position,p.yaw??0))l.heading=p.yaw??0;
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
 if(s.phase===0&&attackers.some(p=>p.position.z>-22&&p.position.y<7.1)){
   s.phase=1;room.events.push({type:'restlessCurtainBreached',wall:'outer',phase:1,at:now});
 }
 if(!s.lastLightAnnounced&&s.deadline-now<=60&&s.deadline>now){
   s.lastLightAnnounced=true;
   room.events.push({type:'restlessLastLight',at:now,
     subtitle:'Whether they win or they lose, I will rest just fine.'});
 }
 if(s.phase===1&&attackers.some(p=>p.position.z>24&&p.position.y<8.1)){
   s.phase=2;room.events.push({type:'restlessCurtainBreached',wall:'inner',phase:2,at:now});
 }
 // Two designated ladder-carrier bots use the same authoritative interaction as humans.
 for(const bot of attackers.filter(p=>p.actorKind==='bot'&&(p.rivalIndex??5)<2)){
   const held=s.ladders.find(l=>l.holderId===bot.id);
   if(held){if(wallForPlacement(bot)&&wallForPlacement(bot).index<=s.phase)interactRestlessLadder(room,bot,now);}
   else if(!bot.restlessCarrying){
     const l=s.ladders[bot.rivalIndex??0];
     if(l&&['available','deployed'].includes(l.state)
       &&(l.state!=='deployed'||l.wall<s.phase)
       &&ladderReach(l,bot)<2.7)interactRestlessLadder(room,bot,now);
   }
 }
 stepStatue(room,s,dt,now,damage);
 stepCoins(room,s,dt,now,damage);
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
function beforeStructureDamage(room,id,now){
 if(room.restlessDay&&now>=room.restlessDay.deadline){onTime(room,now);return false;}
 return true;
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
   if(s.phase===0)return i<3?{x:(i-1)*12,y:6,z:-23.4}
     :{x:(i===3?-7:7),y:7,z:22.8};
   if(s.phase===1)return {x:(i-2)*8,y:7,z:22.8};
   return {x:(i-2)*6,y:0,z:47};
 }
 const own=s.ladders.find(l=>l.holderId===actor.id);
 const wall=walls[Math.min(1,s.phase)];
 if(s.phase<2){
   if(own)return {x:actor.rivalIndex%2===0?-6:6,y:0,z:wall.baseZ};
   const deploy=s.ladders.find(l=>l.state==='deployed'&&l.wall===s.phase);
   if(deploy){
     const atFoot=Math.abs(actor.position.z-wall.baseZ)<3.2
       &&Math.abs(actor.position.x-deploy.position.x)<3.2;
     const ascending=atFoot||(actor.position.y>.6&&actor.position.z<wall.z+2);
     return ascending?{x:deploy.position.x,y:wall.height,z:wall.z+2.2}
       :{x:deploy.position.x,y:0,z:wall.baseZ};
   }
   const previous=s.ladders[(actor.rivalIndex??0)%2];
   if(i<2&&previous?.state==='deployed'&&previous.wall<s.phase)
     return {x:previous.position.x,y:walls[previous.wall].height,z:walls[previous.wall].z};
   const loose=s.ladders[(actor.rivalIndex??0)%2]?.state==='available'
     ?s.ladders[(actor.rivalIndex??0)%2]:s.ladders.find(l=>l.state==='available');
   if(loose)return {...loose.position};
   return {x:(i%2?6:-6),y:0,z:wall.baseZ};
 }
 return {x:0,y:0,z:55};
}
export const RESTLESS_DAY_HANDLER=Object.freeze({
 init:(room)=>{room.restlessDay=newState(room.world);},
 reset:(room,now)=>{room.restlessDay=newState(room.world);
   for(const p of room.players.values()){p.restlessAsleep=false;p.restlessCarrying=null;p.speedScale=1;}
   room.restlessDay.deadline=now+room.policy.matchSeconds;
   room.events.push({type:'restlessDaylightStarted',deadline:room.restlessDay.deadline,at:now,
     subtitle:"If I ever sleep, I'll surrender. Let this be a restless day."});},
 step:restlessnessStep,onTime,beforeStructureDamage,onStructureDamage,
 spawn:(room,player,spawns)=>spawns.filter(point=>point.team===player.team&&(
   player.team===TEAMS.DEFENDERS?point.phase===0:point.phase===(room.restlessDay?.phase??0))),
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
