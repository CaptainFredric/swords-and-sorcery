export const DEFEAT_CHORUS=Object.freeze({windowSec:.7,meters:12,chance:.03,vortexChance:.08,cooldownSec:150,staggerSec:.15});
export function queueDefeatVoice(room,death,position,{vortex=false}={}){
 if(!['FFA','BREAKTHROUGH','DUEL'].includes(room.mode)||room.localTutorial)return false;
 (room.defeatVoices??=[]).push({death:{...death},position:{...position},vortex});return true;
}
export function stepDefeatVoices(room,now,rand=Math.random,config=DEFEAT_CHORUS){
 const pending=room.defeatVoices??=[];
 while(pending.length&&now+1e-9>=pending[0].death.at+config.windowSec){
  const first=pending.shift(),group=[first];
  for(let i=0;i<pending.length;){const p=pending[i];if(p.death.at-first.death.at<=config.windowSec&&group.every(e=>Math.hypot(e.position.x-p.position.x,e.position.y-p.position.y,e.position.z-p.position.z)<=config.meters)){group.push(p);pending.splice(i,1);}else i++;}
  const eligible=group.filter(e=>{const p=room.players.get(e.death.victimId);return p&&!p.alive&&p.respawnAt===e.death.respawnAt&&p.actorKind!=='dummy';});
  const selected=eligible.length>=2&&now>=(room.defeatChorusReadyAt??-Infinity)&&rand()<(group.some(e=>e.vortex)?config.vortexChance:config.chance);
  if(selected){room.defeatChorusSerial=(room.defeatChorusSerial??0)+1;room.defeatChorusReadyAt=now+config.cooldownSec;room.events.push({type:'defeatChorus',id:`${room.code}:${room.defeatChorusSerial}`,line:'defeat',at:now,speakers:eligible.map((e,i)=>({playerId:e.death.victimId,position:e.position,respawnAt:e.death.respawnAt,death:e.death,delay:config.staggerSec*i/Math.max(1,eligible.length-1)}))});}
  else for(const e of eligible)room.events.push({...e.death,type:'defeatVoice'});
 }
}
