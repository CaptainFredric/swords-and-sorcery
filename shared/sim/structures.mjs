import { modeCall } from './modeRuntime.mjs';
// Map contract: structures name existing solidIds, a material profile and owning team.
// Health belongs to the room. Failed collider IDs are removed from every world consumer.
export const STRUCTURE_PROFILES = Object.freeze({
  timber: Object.freeze({ health: 240, sword: .6, spell: .8, heavy: 1.4, upper: .5, piston: 220, exposed: 110, charge: 160 }),
  reinforcedTimber: Object.freeze({ health: 600, sword: .45, spell: .6, heavy: 1.8, upper: .35, piston: 240, exposed: 120, charge: 180 }),
  renowner:Object.freeze({health:1650,sword:.75,spell:1,heavy:1.35,upper:.65,piston:240,exposed:110,charge:160}),
});
const variants = new WeakMap();
const bases = new WeakMap();
const definitionCache=new WeakMap();
// Only furnished, movable-looking wooden cover becomes regenerating scenery.
// Foundations, stone architecture and named objectives are never silently
// converted to temporary destructibles.
export function structureDefinitions(world){
 if(!world)return [];
 const base=bases.get(world)??world;
 let result=definitionCache.get(base);
 if(result)return result;
 const authored=base.structures??[];
 const used=new Set(authored.flatMap(def=>def.solidIds??[]));
 const transient=(base.solids??[]).filter(s=>
   typeof s.id==='string'&&/^(?:cover-|canopy-cover-)/.test(s.id)&&
   s.material==='timber'&&s.kind!=='prop'&&
   !['cover-esplanade-mantlet','cover-esplanade-cart'].includes(s.id)&&
   !used.has(s.id)&&Array.isArray(s.size))
  .map(s=>({id:'reforming-'+s.id,name:'Enchanted '+s.id.replaceAll('-',' '),
    profile:'timber',solidIds:[s.id],rebuildAfterSec:18,transient:true}));
 result=[...authored,...transient];definitionCache.set(base,result);
 return result;
}
// Only an unoccupied physical footprint may regrow. A knight or siege engine
// standing in the gap holds the enchantment until the site is safe.
function occupied(room,solid){
 const [x,y,z]=solid.center,[sx,sy,sz]=solid.size;
 const inside=(px,py,pz,rx,ry,rz)=>
  Math.abs(px-x)<sx/2+rx&&Math.abs(py-y)<sy/2+ry&&Math.abs(pz-z)<sz/2+rz;
 for(const p of room.players?.values()??[])
  if(p.alive&&inside(p.position.x,p.position.y+.9,p.position.z,.55,1,.55))return true;
 for(const [b,r] of [[room.biByeLlista,3.3],[room.soFistication,4.0],[room.fightFlight,2.3]])
  if(b&&!b.retired&&b.health>0&&inside(b.x??b.position?.x??0,
    (b.y??b.position?.y??0)+1,b.z??b.position?.z??0,r,2,r))return true;
 return false;
}
export function stepStructureRestoration(room,now){
 if(room?.state!=='PLAYING'||!room.structures?.entities)return 0;
 const base=bases.get(room.world)??room.world;
 let restored=0;
 for(const def of structureDefinitions(base)){
  const span=def.rebuildAfterSec;
  const entry=room.structures.entities[def.id];
  if(!(Number.isFinite(span)&&span>0)||!entry||entry.health>0||
    !Number.isFinite(entry.destroyedAt)||now<entry.destroyedAt+span)continue;
  const blocked=def.solidIds.some(id=>{
   const solid=base.solids?.find(s=>s.id===id);
   return solid&&occupied(room,solid);
  });
  if(blocked)continue;
  entry.health=entry.maxHealth;entry.destroyedAt=null;entry.rebuiltAt=now;
  entry.lastHitAt=null;room.structures.revision++;restored++;
  const solid=base.solids?.find(o=>def.solidIds.includes(o.id));
  room.events.push({type:'structureRebuilt',structureId:def.id,name:def.name,
    point:solid?{x:solid.center[0],y:solid.center[1],z:solid.center[2]}:null,
    blueMagic:true,at:now});
 }
 if(restored)room.world=structureWorld(room.world,room.structures);
 return restored;
}

export function createStructureState(world, revision = 0) {
  return { revision, entities: Object.fromEntries(structureDefinitions(world).map(def => {
    const maxHealth = STRUCTURE_PROFILES[def.profile].health;
    return [def.id, { health: maxHealth, maxHealth, lastHitAt: null, destroyedAt: null }];
  })) };
}
export function structureWorld(world, state) {
  const base = bases.get(world) ?? world;
  if (!structureDefinitions(base).length || !state) return base;
  const failed = structureDefinitions(base).filter(def => state.entities?.[def.id]?.health <= 0);
  if (!failed.length) return base;
  const key = failed.map(def => def.id).join('|');
  let cache = variants.get(base);
  if (!cache) variants.set(base, cache = new Map());
  if (cache.has(key)) return cache.get(key);
  const ids = new Set(failed.flatMap(def => def.solidIds));
  const result = { ...base, solids: base.solids.filter(solid => !ids.has(solid.id)) };
  // A stable world identity preserves the navigation cache between failures.
  if (cache.size >= 32) cache.delete(cache.keys().next().value);
  cache.set(key, result); bases.set(result, base);
  return result;
}
export function structureForSolid(world, solid) {
  return structureDefinitions(world).find(def => def.solidIds.includes(typeof solid === 'string' ? solid : solid?.id));
}
export function damageStructure(room, id, amount, attackerId, source, now, { point = null, raw = false } = {}) {
  const def = structureDefinitions(room.world).find(s => s.id === id), state = room.structures?.entities[id];
  const attacker = room.players.get(attackerId);
  if (!def || !state || state.health <= 0 || room.state !== 'PLAYING' || !attacker || !Number.isFinite(amount) || amount <= 0) return false;
  if (def.team && attacker.team === def.team) return false;
  // Mode-local authoritative termination arbitration: no post-sundown
  // structure mutation, even if the call bypasses the ordinary room tick.
  if(modeCall(room,'beforeStructureDamage',id,now)===false)return false;
  const profile = STRUCTURE_PROFILES[def.profile];
  const scale = source === 'sword' ? profile.sword : source === 'bibye-siege' ? profile.heavy : source === 'bibye-conditioning' ? profile.upper : profile.spell;
  const damage = raw ? amount : amount * scale;
  const before = state.health;
  state.health = Math.max(0, Math.round((before - damage) * 100) / 100);
  state.lastHitAt = now;
  room.structures.revision++;
  if (state.health === 0) {
    state.destroyedAt = now;
    room.world = structureWorld(room.world, room.structures);
  }
  room.events.push({ type: 'structureDamaged', structureId: id, name: def.name, health: state.health, maxHealth: state.maxHealth,
    amount: before - state.health, attackerId, source, point, destroyed: state.health === 0, at: now });
  modeCall(room,'onStructureDamage',id,now);
  return true;
}
export function damageStructureSolid(room, solid, amount, attackerId, source, now, options) {
  const def = structureForSolid(room.world, solid);
  return def ? damageStructure(room, def.id, amount, attackerId, source, now, options) : false;
}
