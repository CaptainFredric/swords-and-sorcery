import { PROWESS } from '../src/prowess.mjs';
import { normalizeInfusions,emptyInfusions,ONE_HIT_PRESETS } from '../src/oneHitInfusions.mjs';
import { postureOf } from '../src/body.mjs';
import { activeUltimate } from '../src/ultimates.mjs';
import { beginAttack, endAttack, setGuard, castPreparedSpell, tryDash,tryUltimate,releaseOneHitCharge } from './combat.mjs';
import { wayToward } from './botNav.mjs';

export const KNIGHT_ULTIMATES = Object.freeze(['cycle','sunder','vortex','chivalry','one_hit_of_wonders']);
export const KNIGHT_BEHAVIORS = Object.freeze(['follow','stay']);
const CYCLE = Object.freeze(['sunder', 'vortex', 'chivalry']);
const PREPARED = Object.freeze(['fireball', 'frostfire', 'gale']);
const REFILL_SEC = 3;

/** Only this dummy's own lesson controls can update it. Ordinary combat
 * still validates every real Ultimate and every actual infusion. */
export function setupUltimateKnight(actor,nowSec,previous=null){
  actor.name='The Ultimate Knight';
  actor.botProfile='rival';
  const choice=KNIGHT_ULTIMATES.includes(previous?.selection)?previous.selection:'cycle';
  const behavior=KNIGHT_BEHAVIORS.includes(previous?.behavior)?previous.behavior:'follow';
  const stages=normalizeInfusions(previous?.stages??emptyInfusions());
  actor.ultimate=actor.startingUltimate=choice==='cycle'?CYCLE[0]:choice;
  actor.spell=actor.startingSpell=PREPARED[0];
  actor.preparedSpells=[...PREPARED];
  actor.startingPreparedSpells=[...PREPARED];
  actor.prowess=PROWESS.full;
  actor.ultimateKnight={cycle:0,tracked:null,committed:null,refillAt:nowSec,
    demonstration:null,castSlot:-1,dashSlot:-1,spellIndex:0,navigation:{},
    nextSwordAt:nowSec+6,swordReleaseAt:null,
    selection:choice,behavior,stages,anchor:{...actor.position}};
  actor.practiceOneHit={enabled:true,stages:{...stages}};
}
/** Apply independent Ult selection, Stay/Follow, five infusion sliders or
 * presets. Untrusted network values cannot alter a non-Practice opponent. */
export function configureUltimateKnight(room,requesterId,message,nowSec){
  if(room?.mode!=='PRACTICE'||room.state!=='PLAYING')return false;
  const requester=room.players.get(requesterId);
  if(requester?.actorKind!=='human'||!requester.alive)return false;
  const actor=[...room.players.values()].find(p=>p.actorKind==='dummy'&&
    p.practiceMode==='ULTIMATE_KNIGHT');
  if(!actor?.ultimateKnight)return false;
  const demo=actor.ultimateKnight;
  if(message.selection!==undefined){
    if(!KNIGHT_ULTIMATES.includes(message.selection))return false;
    demo.selection=message.selection;
  }
  if(message.behavior!==undefined){
    if(!KNIGHT_BEHAVIORS.includes(message.behavior))return false;
    if(demo.behavior!==message.behavior&&message.behavior==='stay')
      demo.anchor={...actor.position};
    demo.behavior=message.behavior;
    actor.ai=null;
  }
  if(message.preset!==undefined){
    if(message.preset==='reset')demo.stages=emptyInfusions();
    else if(Object.hasOwn(ONE_HIT_PRESETS,message.preset))
      demo.stages=normalizeInfusions(ONE_HIT_PRESETS[message.preset]);
    else return false;
  }
  if(message.element!==undefined){
    if(!['fire','frost','gale','lightning','steel'].includes(message.element)||
       ![0,1,2].includes(message.tier))return false;
    demo.stages={...demo.stages,[message.element]:message.tier};
  }
  actor.practiceOneHit={enabled:true,stages:{...demo.stages}};
  // Do not interrupt a committed demonstration. The new chosen Ultimate
  // and infusions apply to the NEXT actual cast.
  if(!actor.ultimateState){
    actor.ultimate=demo.selection==='cycle'?CYCLE[demo.cycle]:demo.selection;
    actor.oneHitInfusions={...demo.stages};
    actor.prowess=PROWESS.full;
  }
  room.events.push({type:'practiceUltimateKnightConfigured',playerId:actor.id,
    selection:demo.selection,behavior:demo.behavior,stages:{...demo.stages},at:nowSec});
  return true;
}

function reconcile(actor, nowSec) {
  const demo = actor.ultimateKnight;
  // Retain the real state object: combat may commit and kill the actor before our next step.
  const tracked = demo.tracked;
  if (tracked?.phase === 'active' && demo.committed !== tracked) {
    demo.committed = tracked;
    if(demo.selection==='cycle')demo.cycle=(demo.cycle+1)%CYCLE.length;
  }
  if (tracked && actor.ultimateState !== tracked) {
    if (demo.committed === tracked) demo.refillAt = Math.max(nowSec, actor.recoverUntil ?? nowSec) + REFILL_SEC;
    demo.tracked = null;
  }
  if (actor.ultimateState) demo.tracked = actor.ultimateState;
}

function targetFor(room, actor) {
  let target = null; let nearest = Infinity;
  for (const player of room.players.values()) {
    if (player.actorKind !== 'human' || !player.alive || !player.connected) continue;
    const distance = Math.hypot(player.position.x - actor.position.x, player.position.z - actor.position.z);
    if (distance < nearest) { target = player; nearest = distance; }
  }
  return target;
}

function demonstrateChivalry(room, actor, nowSec, world) {
  const demo = actor.ultimateKnight; const state = actor.ultimateState;
  if (demo.demonstration !== state) {
    demo.demonstration = state; demo.castSlot = -1; demo.dashSlot = -1; demo.spellIndex = 0;
  }
  const target = targetFor(room, actor);
  if (!target) {
    if (actor.attackHeld) endAttack(room, actor.id, nowSec);
    if (actor.guardHeld) setGuard(room, actor.id, false, nowSec);
    actor.input = { forward: 0, right: 0, jump: false, attack: false, guard: false, yaw: actor.yaw, pitch: actor.pitch };
    return;
  }
  const dx = target.position.x - actor.position.x; const dz = target.position.z - actor.position.z;
  const dy = target.position.y + postureOf(target).center - actor.position.y - postureOf(actor).eye + 0.1;
  const distance = Math.hypot(dx, dz); const length = Math.hypot(dx, dy, dz) || 1;
  const direction = { x: dx / length, y: dy / length, z: dz / length };
  actor.yaw = Math.atan2(-dx, -dz); actor.pitch = Math.asin(direction.y);
  const age = Math.max(0, nowSec - state.commitAt); const loop = Math.floor(age / 3); const phase = age % 3;
  const guard = phase < 0.8 || (phase >= 1.7 && phase < 2.3);
  const sword = distance < 3.3 && phase < 2.5;
  const way = wayToward(world, actor, target, demo.navigation, nowSec);
  const movementYaw = way ? Math.atan2(-(way.x - actor.position.x), -(way.z - actor.position.z)) : actor.yaw;
  const relative = movementYaw - actor.yaw;
  const forward = demo.behavior==='stay'?0:distance > 2.6 ? 0.55 : distance < 1.3 ? -0.3 : 0;
  actor.input = { forward: forward * Math.cos(relative), right: -forward * Math.sin(relative), jump: false,
    attack: sword, guard, yaw: actor.yaw, pitch: actor.pitch };
  if (guard !== actor.guardHeld || (guard && !actor.guarding)) setGuard(room, actor.id, guard, nowSec);
  if (sword && !actor.attackHeld) beginAttack(room, actor.id, nowSec);
  else if (!sword && actor.attackHeld) endAttack(room, actor.id, nowSec);
  const slot = phase >= 1.8 ? loop * 2 + 1 : phase >= 0.9 ? loop * 2 : -1;
  if (slot >= 0 && slot !== demo.castSlot) {
    demo.castSlot = slot;
    castPreparedSpell(room, actor.id, PREPARED[demo.spellIndex++ % PREPARED.length], direction, nowSec);
  }
  if (demo.behavior!=='stay' && phase >= 1.8 && demo.dashSlot !== loop) {
    demo.dashSlot = loop;
    tryDash(room, actor.id, { x: direction.x, z: direction.z }, nowSec);
  }
}

export function stepUltimateKnight(room, actor, nowSec, world = room.world, { random = Math.random } = {}) {
  if (room.mode !== 'PRACTICE' || room.state !== 'PLAYING' || actor.practiceMode !== 'ULTIMATE_KNIGHT') return;
  if (!actor.ultimateKnight) setupUltimateKnight(actor, nowSec);
  reconcile(actor, nowSec);
  if (!actor.alive) return;
  const demo = actor.ultimateKnight;
  if (!actor.ultimateState) {
    actor.ultimate=demo.selection==='cycle'?CYCLE[demo.cycle]:demo.selection;
    if(nowSec>=demo.refillAt)actor.prowess=PROWESS.full;
    if(actor.ultimate==='one_hit_of_wonders')
      actor.practiceOneHit={enabled:true,stages:{...demo.stages}};
  }
  // The Full Lightning tier must RELEASE its held teleport. An ordinary
  // player releases the button; the teaching opponent uses the same command.
  const state=actor.ultimateState;
  if(state?.id==='one_hit_of_wonders'&&state.phase==='startup'&&
     Number.isFinite(state.teleportHoldAt)&&!state.teleportReleased&&
     nowSec-state.teleportHoldAt>=.55)
    releaseOneHitCharge(room,actor.id,nowSec);
  if(demo.behavior==='stay'&&!actor.ultimateState&&
     actor.prowess>=PROWESS.full&&nowSec>=demo.refillAt)
    tryUltimate(room,actor.id,nowSec,{held:true});
  if (activeUltimate(actor, nowSec)?.id === 'chivalry') {
    demonstrateChivalry(room, actor, nowSec, world);
  } else {
    if (demo.demonstration) { demo.demonstration = null; actor.ai = null; }
    // This is a dedicated ULTIMATE drill, not an ordinary spellblade bot.
    // Do not invoke the generic controller: it autonomously casts spells,
    // sword-spams and selects tactics unrelated to the chosen Ultimate.
    const target=targetFor(room,actor);
    const distance=target?Math.hypot(target.position.x-actor.position.x,
      target.position.z-actor.position.z):Infinity;
    if(target){
      const dx=target.position.x-actor.position.x,dz=target.position.z-actor.position.z;
      const dy=target.position.y+postureOf(target).center-actor.position.y-postureOf(actor).eye;
      actor.yaw=Math.atan2(-dx,-dz);
      actor.pitch=Math.atan2(dy,Math.max(.01,distance));
      const route=demo.behavior==='follow'&&distance>2.6?
        wayToward(world,actor,target,demo.navigation,nowSec):null;
      const movementYaw=route?
        Math.atan2(-(route.x-actor.position.x),-(route.z-actor.position.z)):actor.yaw;
      const relative=movementYaw-actor.yaw;
      const advance=demo.behavior==='follow'&&distance>3 ? .65:0;
      actor.input={...actor.input,yaw:actor.yaw,pitch:actor.pitch,
        forward:advance*Math.cos(relative),right:-advance*Math.sin(relative),
        sprint:false,jump:false,guard:false,attack:false};
      if(demo.behavior==='follow'&&distance<16&&!actor.ultimateState&&
        actor.prowess>=PROWESS.full&&nowSec>=demo.refillAt)
        tryUltimate(room,actor.id,nowSec,{held:true});
    } else actor.input={...actor.input,forward:0,right:0,
      sprint:false,jump:false,guard:false,attack:false};
    // The occasional sword is permitted only against a reachable live body:
    // its physical hit can hurt, drain Guard, or trigger the caster's own
    // Shocking Conduct. Never swing at empty space simply to animate.
    if(demo.swordReleaseAt!=null&&nowSec>=demo.swordReleaseAt){
      endAttack(room,actor.id,nowSec);demo.swordReleaseAt=null;
    }
    if(target&&distance<2.55&&!actor.ultimateState&&
      target.spawnProtectionUntil<=nowSec&&
      nowSec>=(demo.nextSwordAt??Infinity)&&
      nowSec>=(actor.staggerUntil??-Infinity)&&!actor.attackActive){
      if(beginAttack(room,actor.id,nowSec)){
        demo.swordReleaseAt=nowSec+.3;
        demo.nextSwordAt=nowSec+7.5;
      }
    }
    if(demo.behavior==='stay'){
      // No opponent pursuit. However, real skills (especially Lightning's
      // teleport) and knockback can displace a stationary training opponent.
      // Once the Ultimate has finished, walk back to the chosen station
      // through normal navigation and at an ordinary walking speed.
      const post=demo.anchor??actor.position;
      const displaced=Math.hypot(post.x-actor.position.x,post.z-actor.position.z);
      if(!actor.ultimateState&&displaced>.7){
        const goal={position:post};
        const waypoint=wayToward(world,actor,goal,demo.navigation,nowSec)??post;
        const yaw=Math.atan2(-(waypoint.x-actor.position.x),-(waypoint.z-actor.position.z));
        actor.input={...actor.input,forward:.6,right:0,yaw,pitch:0,
          sprint:false,jump:false};
      }else{
        actor.input={...actor.input,forward:0,right:0,sprint:false,jump:false};
      }
    }
  }
  reconcile(actor, nowSec);
}
