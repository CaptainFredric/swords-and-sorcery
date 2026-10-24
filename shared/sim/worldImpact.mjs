import {GAME,closingImpact} from '../src/combat.mjs';
import {STAGGER} from '../src/stagger.mjs';
import {applyDamage,staggerBy} from './combat.mjs';
// Existing weapons opt in explicitly. Merely walking into a wall never arms this.
export function armWorldImpact(player,by,source,now){player.worldImpact={by,source,until:now+1.5,anchor:{...player.position}};}
export function resolveWorldImpact(room,player,from,moved,now){
 const launch=player.worldImpact;if(!launch)return;
 if(now>launch.until||!player.alive){player.worldImpact=null;return;}
 if(launch.anchor&&Math.hypot(from.x-launch.anchor.x,from.y-launch.anchor.y,from.z-launch.anchor.z)>1){player.worldImpact=null;return;}
 launch.anchor={...moved.position};
 const travel=Math.hypot(moved.position.x-from.x,moved.position.z-from.z);
 if(!Number.isFinite(travel)||travel>Math.hypot(moved.velocity.x,moved.velocity.z)/20+1)return;
 const contact=(moved.worldContacts??[]).filter(c=>['stone','limestone','rock','metal','iron','timber','wood','plaster'].includes(c.material)&&c.externalSpeed>2).sort((a,b)=>b.externalSpeed-a.externalSpeed)[0];
 if(!contact)return;
 player.worldImpact=null;
 const severity=closingImpact(contact.externalSpeed),damage=GAME.swordDamage*severity;
 if(applyDamage(room,launch.by,player.id,damage,'wall-impact',now))staggerBy(room,player,STAGGER.gain.sword*severity,now,launch.by);
 room.events.push({type:'worldImpact',playerId:player.id,by:launch.by,source:launch.source,solidId:contact.id,severity,point:{...moved.position},at:now});
}
