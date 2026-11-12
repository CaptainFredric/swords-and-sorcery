import { SWORD_TECHNIQUE_CONTRACTS } from '../src/swordTechniqueContracts.mjs';
import { beginSwordTechnique, stepSwordTechnique, interruptSwordTechnique } from './swordTechnique.mjs';
import { sampleTransform } from './history.mjs';
import { postureOf } from '../src/body.mjs';
import { areAllies } from '../src/teams.mjs';

// Shared by authoritative rooms and the local offline host. No separate player
// health, terrain, combat, or network model is introduced here.
export function requestSwordTechnique(room, playerId, down, nowSec) {
  const player=room.players.get(playerId);
  if(!player)return false;
  if(!down){player.swordTechniqueHeld=false;return true;}
  if(room.state!=='PLAYING'||player.swordTechnique||player.restlessCarrying||
     player.inspectionFrozen||nowSec<(player.staggerUntil??-Infinity)||
     nowSec<(player.oneHitFrozenUntil??-Infinity))return false;
  const contract=SWORD_TECHNIQUE_CONTRACTS[player.technique];
  const action=beginSwordTechnique(player,contract,nowSec);
  if(!action)return false;
  action.lungeYaw=player.yaw;
  player.spawnProtectionUntil=Math.min(player.spawnProtectionUntil,nowSec);
  room.events.push({type:'swordTechniqueStarted',playerId,id:contract.id,at:nowSec});
  return true;
}

// The normal sword sweep already uses sampleTransform and postureOf. Reuse
// those exact targets and the production sweepBlade body/solid solver.
export function stepLiveSwordTechnique(room, player, nowSec, world, onContact) {
  if(!player.swordTechnique)return;
  const action=player.swordTechnique;
  const eligible=[...room.players.values()].filter(other=>other.id!==player.id&&
    other.alive&&!areAllies(room,player.id,other.id)&&other.spawnProtectionUntil<=nowSec);
  const contacts=stepSwordTechnique(player,nowSec,{
    held:Boolean(player.swordTechniqueHeld),
    transformAt:at=>{
      const pose=sampleTransform(player,at);
      return {position:pose.position,yaw:pose.yaw,eye:{
        x:pose.position.x,y:pose.position.y+1.55,z:pose.position.z}};
    },
    bodiesAt:at=>eligible.map(other=>{
      const pose=sampleTransform(other,at);
      return {id:other.id,base:pose.position,top:postureOf(other).height};
    }),
    world,
  });
  for(const met of contacts){
    if(!player.alive || (player.swordTechnique!==action&&met.kind==='body'))break;
    onContact(action,met);
  }
  if(!player.swordTechnique&&action.phase==='recovery')
    room.events.push({type:'swordTechniqueEnded',playerId:player.id,id:action.id,at:nowSec});
}

export function techniqueView(player) {
  const a=player.swordTechnique;
  return a?{id:a.id,phase:a.phase,startedAt:a.startedAt,
    initialStartedAt:a.initialStartedAt,revolutions:a.revolutions,
    endsAt:a.endsAt??null}:null;
}
export { interruptSwordTechnique };
