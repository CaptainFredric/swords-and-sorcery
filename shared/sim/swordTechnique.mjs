// Authored contact sampling for Castleward's production Sword Techniques.
// The room adapter owns eligibility, terrain-aware movement, defenses, damage and replication.
import { BLADE, aimFrame, occluded, segmentDistance, sweepBlade } from '../src/blade.mjs';
import { MOVEMENT } from '../src/movement.mjs';

const MAX_SAMPLE_TRAVEL = .035;
const difference = (a, b) => ({ x: a.x-b.x, y: a.y-b.y, z: a.z-b.z });
const length = v => Math.hypot(v.x, v.y, v.z);
const lerp = (a,b,t) => ({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});

function placeBlade(frame, transform) {
  const { position, yaw } = transform;
  const { right, forward } = aimFrame(yaw);
  // Samples are in character space: +X to the right, +Y up and −Z forward.
  const place = ({x,y,z}) => ({
    x:position.x + x*right.x - z*forward.x,
    y:position.y + y,
    z:position.z + x*right.z - z*forward.z,
  });
  return { base:place(frame.base), tip:place(frame.tip) };
}

function bladeAt(track, time) {
  const next = track.findIndex(frame => frame.time > time);
  if(next < 0) return track.at(-1);
  if(next === 0) return track[0];
  const a=track[next-1], b=track[next], blend=(time-a.time)/(b.time-a.time);
  return {base:lerp(a.base,b.base,blend),tip:lerp(a.tip,b.tip,blend)};
}

function contactAt(blade, bodies, world) {
  const delta=difference(blade.tip,blade.base), reach=length(delta);
  if(reach<1e-6)return null;
  const direction={x:delta.x/reach,y:delta.y/reach,z:delta.z/reach};
  return sweepBlade(blade.base,direction,direction,bodies,world.solids??[],{
    blade:{...BLADE,from:0,to:reach},
    ground:world.floors,
  });
}

// Preserve intervening authored frames even when one 30 Hz server update crosses
// 20 degrees of a Whirl. Four 120 Hz temporal substeps are 5 degrees apiece;
// additional subdivisions cap blade tip travel at 0.035 m. Never sample by render FPS.
export function sweepTechniqueTrack(track, from, to, transformAt, bodiesAt, world, hitIds) {
  const cuts=[from,...track.map(frame=>frame.time).filter(time=>from<time&&time<to),to];
  const contacts=[];
  let before=placeBlade(bladeAt(track,from),transformAt(from));
  for(let i=1;i<cuts.length;i+=1){
    const start=cuts[i-1],end=cuts[i];
    const after=placeBlade(bladeAt(track,end),transformAt(end));
    const steps=Math.max(1,Math.ceil((end-start)*120),Math.ceil(Math.max(
      length(difference(after.base,before.base)),length(difference(after.tip,before.tip)),
    )/MAX_SAMPLE_TRAVEL));
    for(let j=1;j<=steps;j+=1){
      const at=start+(end-start)*j/steps;
      const transform=transformAt(at);
      const blade=placeBlade(bladeAt(track,at),transform);
      if(occluded(transform.eye,blade.base,world.solids??[]))continue;
      const met=contactAt(blade,bodiesAt(at).filter(body=>!hitIds.has(body.id)),world);
      if(!met)continue;
      contacts.push({...met,at});
      if(met.kind!=='body')return contacts;
      hitIds.add(met.id);
    }
    before=after;
  }
  return contacts;
}

export function beginSwordTechnique(player, contract, nowSec) {
  if(!contract || !player.alive || player.swordTechnique || nowSec<(player.swordTechniqueReadyAt??0) ||
     nowSec<(player.staggerUntil??0) || player.ultimateState || player.attackActive || player.attackSweep || player.pendingSpell ||
     player.guarding || player.operatingBallistaId || player.operatingRamId || player.operatingFightFlightId) return null;
  if(!player.grounded){
    if(contract.kind==='riposte') {
      if(nowSec<(player.dashReadyAt??0))return null;
      // Consume the ordinary Dash clock without a second instantaneous Dash.
      player.dashReadyAt=nowSec+MOVEMENT.dashCooldown;
    } else if(contract.kind==='whirl'&&player.spell!=='gale')return null;
  }
  player.swordTechniqueHeld=true;
  return player.swordTechnique={
    id:contract.id,contract,startedAt:nowSec,initialStartedAt:nowSec,
    phase:'startup',sampledTo:contract.activeFrom,
    revolutions:1,hitIds:new Set(),intercepted:false,
  };
}

export function interruptSwordTechnique(player, nowSec) {
  const action=player?.swordTechnique;
  if(!action)return false;
  player.swordTechnique=null;
  player.swordTechniqueHeld=false;
  player.swordTechniqueReadyAt=Math.max(player.swordTechniqueReadyAt??0,nowSec+action.contract.cooldown);
  return true;
}

// Incoming candidates must be already eligible physical sword or projectile
// segments supplied by the host. An incoming swing's cone alone cannot parry.
export function techniqueInterception(action, incoming, transform, world, nowSec) {
  if(!action?.contract || (action.contract.kind==='riposte'&&action.intercepted))return null;
  const age=nowSec-action.startedAt, {braceFrom=0,braceUntil=0,track}=action.contract;
  if(action.contract.kind==='riposte'&&(age<braceFrom||age>=braceUntil))return null;
  // A Whirl blade is live from the first authored frame, before the owner is
  // advanced this tick. Never make interception depend on player iteration order.
  if(action.contract.kind==='whirl'&&(action.phase==='recovery'||age<0||age>=action.contract.activeUntil))return null;
  const blade=placeBlade(bladeAt(track,age),transform);
  if(occluded(transform.eye,blade.base,world.solids??[]))return null;
  const near=segmentDistance(incoming.base,incoming.tip,blade.base,blade.tip);
  if(near.distance>BLADE.radius+(incoming.radius??BLADE.radius))return null;
  const intercept=lerp(blade.base,blade.tip,near.t);
  if(contactAt({base:incoming.base,tip:lerp(incoming.base,incoming.tip,near.s)},[],world)||
     contactAt({base:blade.base,tip:intercept},[],world))return null;
  if(action.contract.kind==='riposte')action.intercepted=true;
  return intercept;
}

// Call at the authoritative simulation clock. Only the room adapter may turn
// contacts into damage, Guard, Steel, knockback or Stagger outcomes.
export function stepSwordTechnique(player, nowSec, { held, transformAt, bodiesAt, world }) {
  const action=player.swordTechnique;
  if(!action)return [];
  if(!player.alive || nowSec<(player.staggerUntil??0) || player.operatingBallistaId ||
     player.operatingRamId || player.operatingFightFlightId){
    interruptSwordTechnique(player,nowSec);
    return [];
  }
  const {kind,track,activeFrom,activeUntil,recovery,maxRevolutions=1,extraRevolutionCost}=action.contract;
  const contacts=[];
  while(action.phase!=='recovery'){
    const age=nowSec-action.startedAt;
    if(age<activeFrom){
      if(kind==='riposte'&&age>=action.contract.braceFrom&&age<action.contract.braceUntil)action.phase='brace';
      return contacts;
    }
    action.phase='active';
    const until=Math.min(age,activeUntil);
    if(until>action.sampledTo){
      contacts.push(...sweepTechniqueTrack(track,action.sampledTo,until,
        t=>transformAt(t+action.startedAt),t=>bodiesAt(t+action.startedAt),world,action.hitIds)
        .map(contact=>({...contact,at:contact.at+action.startedAt})));
      action.sampledTo=until;
    }
    const stopped=contacts.at(-1)?.kind==='solid'||contacts.at(-1)?.kind==='ground';
    if(!stopped&&age<activeUntil)return contacts;
    if(!stopped&&kind==='whirl'&&held&&action.revolutions<maxRevolutions&&
       extraRevolutionCost>0&&(player.prowess??0)>=extraRevolutionCost){
      player.prowess-=extraRevolutionCost;
      action.revolutions+=1;
      // Exactly once per victim per revolution, not once per entire five-spin skill.
      action.hitIds=new Set();
      action.startedAt+=activeUntil-activeFrom;
      action.sampledTo=activeFrom;
      continue;
    }
    action.phase='recovery';
    action.endsAt=(stopped?contacts.at(-1).at:action.startedAt+activeUntil)+recovery;
  }
  if(nowSec>=action.endsAt)interruptSwordTechnique(player,action.endsAt);
  return contacts;
}
