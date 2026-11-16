// Castleward's kill feed describes the actual finishing blow. All source and
// special-context tags come from the authoritative simulation, never a client
// guess about which machine happened to be in view when the knight fell.
const pick=(lines,event)=>{
  const id=`${event.source}:${event.killContext??''}:${event.killerId??''}:${event.victimId??''}:${Math.round((event.at??0)*30)}`;
  let hash=2166136261;
  for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);
  return lines[(hash>>>0)%lines.length];
};
const text=(words,event,kind)=>({text:pick(words,event),kind});
const apostrophe=name=>/s$/i.test(name)?name+"'":name+"'s";
const isVortex=source=>['vortex','ember','vortexFire','vortexBlaze'].includes(source);

/** Pure, deterministic single-death copy and existing HUD color family. */
export function killFeedDeath(event,killerName=null,victimName='someone',{mode=null}={}){
 const source=event?.source??'';
 const k=killerName,v=victimName||'someone';
 if(source==='fight-flight-terminal')return null; // one later Ascension summary, even on self-death
 if(!k||event.killerId===event.victimId){
   if(source==='abyss')return text([
     `${v} bought only a one-way ticket`,
     `${v} attained a grounded perspective on life`,
     `${v} remembered to play dead`,
   ],event,'abyss');
   return text([`${v} fell in battle`,`${v} thought that was a good idea`],event,'sword');
 }
 // The sword and ordinary spells become a demonstration of mastery while
 // Spells & Chivalry is genuinely active. Vehicle/other Ultimate finishers
 // retain their more physically distinctive weapon identities.
 const normalCombat=['sword','ram','gauntlet','fireball','burn','frostfire','gale',
   'coreflagration','line_of_conduct'].includes(source);
 if(event.killContext==='chivalry'&&normalCombat)
   return {text:`${k} mastered ${v}`,kind:'sword'};
 // The combat itself is the setup for these. Backlash only damages the knight
 // whose OWN melee strike was interrupted, not arbitrary lightning victims.
 if(source==='electrical_backlash'&&event.killContext==='shocking-conduct-interrupted')
   return {text:`${v} got struck instead...`,kind:'fire'};
 if(source==='hellping-crush')
   return {text:`${k} wouldn't become ${apostrophe(v)} friend`,kind:'sword'};
 if(source==='one_hit_of_wonders'&&event.killContext==='lightning-teleport-slam')
   return {text:`${v} forgot the element of surprise`,kind:'fire'};
 if(source==='one_hit_of_wonders'&&event.killContext==='nearly-full-disaster')
   return {text:`${k} was so cool that ${v} experienced aftershocks`,kind:'frost'};
 // All three are actual, independently identified SERVER contact phases.
 // Do not infer the form from the caster's current airborne position: a
 // grounded Full Gale cast can launch a Windblade, too.
 if(source==='one_hit_of_wonders'){
   if(event.killContext==='disaster-ground-slam')return text([
     `${k} brought ${v} down to earth`,
     `${v} was grounded by ${k}`,
     `${k} made ${v} part of the landscape`,
   ],event,'sword');
   if(event.killContext==='disaster-windblade')return text([
     `${v} discovered the air had an edge, courtesy of ${k}`,
     `${k} sent ${v} a cutting remark on the wind`,
     `${v} caught the sharp end of ${apostrophe(k)} forecast`,
   ],event,'gale');
   if(event.killContext==='disaster-terminal-fire')return text([
     `${k} saved one last explosion for ${v}`,
     `${v} caught the explosive end of ${apostrophe(k)} Windblade`,
   ],event,'fire');
   // Compatibility with historic replays whose death events lack a
   // contact subsource, rather than the generic "slew" sword fallback.
   return {text:`${v} was overwhelmed by ${apostrophe(k)} All-Natural Disaster`,kind:'gale'};
 }
 if(source==='one_hit_ground_fire')return {text:
   `${v} survived the impact, but not ${apostrophe(k)} aftermath`,kind:'fire'};
 if(source==='one_hit_vortex')return {text:
   `${v} got caught in ${apostrophe(k)} wind-up`,kind:'gale'};
 // Exceptional jokes are sampled, not permanent replacements for the finishing
 // weapon's identity. Never speculate about Guard, overkill or a losing streak:
 // the authoritative death event must explicitly prove each condition.
 const exceptional=[];
 if(event.extremeOverkill) exceptional.push(`Saint ${v} the Deceased`);
 if(event.sameKillerDeaths>=3) exceptional.push(`${v} doesn't want to play anymore`);
 if(event.sameKillerDeaths>=2) exceptional.push(
   `${v} is contemplating whether to continue`,
   `${v} should really stop holding back`);
 if(event.sameKillerDeaths>=3&&event.sameTeamAsViewer)
   exceptional.push(`${v} wants your team to lose`);
 if(event.guardWouldSave) exceptional.push(`${v} should've guarded`);
 // This is a narrowly proven tactical failure, not random kill commentary:
 // the player LEFT a live objective to chase a weak enemy and died.
 // It should actually be reported when earned, not lost in random selection.
 if(event.abandonedCaptureCircle)
   return {text:`${v} doesn't know how to stand in a circle`,kind:'sword'};
 const standout=exceptional.length?pick([...exceptional,null,null],event):null;
 if(standout)return {text:standout,kind:'sword'};
 // These are deliberately rare: otherwise the chronicler's self-awareness and
 // personal insults would drown out the mechanics of each weapon.
 const rare=[
   `${v}! You made it onto here!`,
   ...(!/^squire\b/i.test(v)?[`${v} is actually a squire in disguise`]:[]),
   `${v} is wondering why this message is being shown`,
   ...(mode==='RENOWN_TRIALS' ? [`${v} confused being bad with being remembered`] : []),
   ...(mode==='EDGE_OF_VICTORY' ? [`${v} will NOT be bouncing back`] : []),
   ...(!['RENOWN_TRIALS','EDGE_OF_VICTORY'].includes(mode)?[`${v} will take this personally`]:[]),
 ];
 const aside=source==='sword'&&!event.killContext?pick([...Array(70).fill(null),...rare],event):null;
 if(aside)return {text:aside,kind:'sword'};
 if(source==='fight-flight-repeater')return text([
   `${k} tranquilized ${v} permanently`,
   `${k} pin-cushioned ${v}`,
   ...(event.pelted?[`${v} was pelted and is now a pelt`]:[]),
 ],event,'sword');
 if(source==='fight-flight-rotor')return text(event.killContext==='rotorDash'?[
   `${k} took ${v} out for a spin`,
   `${v} touched ${apostrophe(k)} rotor-blades`,
 ]:[
   `${v} touched ${apostrophe(k)} rotor-blades`,
   `${k} took ${v} out for a spin`,
 ],event,'sword');
 if(source==='bibye-siege')return text([
   // The physical bolt gag is common; the musical allusion is a rare
   // extra, not a constant wink outside Castleward's fiction.
   `${v} stuck around for ${k}`,
   `${v} missed the point of ${apostrophe(k)} ballista`,
   `${v} stuck around for ${k}`,
   `${k} made a point of hitting ${v}`,
   `${v} stuck around for ${k}`,
   `${v} missed the point of ${apostrophe(k)} ballista`,
   `${k} gave ${v} a bad name`,
   `Why did ${apostrophe(k)} ballista bolt kill you, ${v}?`,
 ],event,'sword');
 if(source==='bibye-conditioning'||source==='bibye-shockwave')return text([
   `${k} chilled out ${v}`,
   `${k} made ${v} calm down`,
 ],event,'frost');
 // These become live once the authoritative A Sharp Turn damage source is
 // introduced; do not falsely claim that an ordinary bolt was a blade sweep.
 if(source==='bibye-sharp-turn'||source==='bibye-blade-sweep')return text([
   `${v} thought ${apostrophe(k)} ballista blades were for decoration`,
   `That took a sharp turn for ${v}, didn't it, ${k}?`,
   `${v} admired ${apostrophe(k)} ballista a little too closely`,
 ],event,'sword');
 if(source==='so-fist-flick')return text([
   `${k} showed ${v} the door`,
   `${k} barely lifted a finger to defeat ${v}`,
   `${k} gave ${v} the finger`,
 ],event,'sword');
 if(source==='so-fist')return text([
   `${v} thought ${k} was offering a handshake`,
   `${v} couldn't survive ${apostrophe(k)} handshake`,
   `${k} broke ${apostrophe(v)} jaw`,
   `${k} got ahold of ${v}`,
 ],event,'sword');
 if(source==='knock-on-steel')return text([
   `${k} ran through ${v}`,
   `${v} stood in the way of ${apostrophe(k)} battering ram`,
   `${k} was charged with assault and battery against ${v}`,
 ],event,'sword');
 if(source==='ram')return text([
   `${k} knocked down ${v}`,
   `${v} misremembered how sharp ${apostrophe(k)} blades were`,
 ],event,'sword');
 if(source==='coreflagration'){
   return event.killContext==='coreflagration-final'?text([
     `${k} was so nice ${v} exploded twice`,
     `${k} roasted ${v}, twice`,
     `${v} decided to stay in ${apostrophe(k)} explosion`,
     `${k} burned ${v} to the core`,
   ],event,'fire'):text([
     `${k} burned ${v} to the core`,
     `${k} roasted ${v}`,
   ],event,'fire');
 }
 if(source==='fight-flight-burning-ground')return text([
   `${v} decided to stay in ${apostrophe(k)} explosion`,
   `${k} burned ${v} down`,
 ],event,'fire');
 if(source==='rupture'||event.killContext==='sunder')return text([
   `${v} couldn't withstand ${k} anymore`,
   `${k} left ${v} nothing to stand on`,
   `${k} totally ruptured ${v}`,
   `${v} witnessed a staggering display from ${k}`,
 ],event,'sword');
 if(isVortex(source)){
   // A single Vortex death may carry its own physical joke. When another
   // opponent falls in the same uninterrupted sequence, the displayed line
   // evolves into the accumulating, name-by-name heat boast.
   const first=source==='vortex'?[
     `${v} thought standing close to ${k} was a good idea`,
     `${k} spun through ${v}`,
     `${k} is hotter than ${v}`,
   ]:[
     `${apostrophe(k)} blazing balls from the blade battered ${v}`,
     `${k} is hotter than ${v}`,
   ];
   return {...text(first,event,'fire'),streak:'vortex'};
 }
 if(source==='fireball')return text([
   `${k} incinerated ${v}`,`${k} roasted ${v}`,
 ],event,'fire');
 if(source==='burn')return {text:`${k} burned ${v} down`,kind:'fire'};
 if(source==='frostfire')return text([
   `${k} shattered ${v}`,`${k} chilled out ${v}`,
 ],event,'frost');
 if(source==='gale')return text([
   `${k} blew ${v} away`,
   `${v} became winded after ${apostrophe(k)} antics`,
   `${k} blew that way out of proportion`,
 ],event,'gale');
 if(source==='abyss')return text([
   `${k} sent ${v} into the abyss`,
   `${v} attained a grounded perspective, courtesy of ${k}`,
   `And ${v} ran off to kingdom come—don't come back`,
 ],event,'abyss');
 if(source==='gauntlet')return {text:`${k} laid ${v} low with a gauntlet`,kind:'sword'};
 if(source==='line_of_conduct')return text([
   `${k} conducted ${v} out of the battle`,
   `${v} had a fork stuck in the wrong place`,
   `${v} displayed shocking conduct`,
   ...(event.steeled?[`${v} believed their armor would insulate them`]:[]),
   `${v} couldn't get enough of ${apostrophe(k)} power`,
 ],event,'fire');
 if(source==='sword')return text(mode==='RENOWN_TRIALS'?[
   `${k} slew ${v}`,
   `${k} ren-OWNED ${v}`,
   `${v} bowed down out of sudden respect for ${k}`,
 ]:[
   `${k} slew ${v}`,
   `${v} bowed down out of sudden respect for ${k}`,
   `${v} misremembered how sharp ${apostrophe(k)} blades were`,
   `${k} caused ${v} to lay down arms`,
 ],event,'sword');
 return {text:`${k} slew ${v}`,kind:'sword'};
}
/** Terminal impact reports names once: individual death events still own all
 * scores, respawns, kill effects and voice work, but do not duplicate the feed. */
export function terminalAscensionFeed(pilotName,victims=[]){
 const names=[...new Set(victims.filter(Boolean))];
 return {text:names.length?`${pilotName} Ascended with ${names.join(', ')}`:
   `${pilotName} Ascended`,kind:'fire'};
}
// Real grouped casualties, collected by the client from authoritative death
// events with the same credited killer within the same brief impact window.
export function groupHeroFeed(victimName,contributorNames=[],event={}){
  const names=[...new Set(contributorNames.filter(Boolean))];
  if(names.length<2)return null;
  const proper=names.length===2?`${names[0]} and ${names[1]}`:
    `${names.slice(0,-1).join(', ')}, and ${names.at(-1)}`;
  return text([
    `${victimName} knows better than to mess with ${names.join(', ')}`,
    `${proper} didn't allow ${victimName} to be a hero...`,
    // Keep ordinary weapon-specific narrations in circulation.
    null,null,null,
  ],event,'sword');
}
export function groupCheatingFeed(killerName,victims=[],event={}){
  const names=[...new Set(victims.filter(Boolean))];
  if(names.length<2)return null;
  const subject=names.length===2?`${names[0]} and ${names[1]}`:
    `${names.slice(0,-1).join(', ')}, and ${names.at(-1)}`;
  return text([
    `${subject} think that ${killerName} must be cheating`,
    `${names[0]} is going to have a grave time along with ${names.slice(1).join(', ')}`,
  ],event,'sword');
}
export function graveTimeFeed(victimName,companions=[]){
  const others=[...new Set(companions.filter(name=>name&&name!==victimName))];
  if(!others.length)return null;
  return {text:`${victimName} is going to have a grave time along with ${others.join(', ')}`,kind:'sword'};
}
export function vortexStreakFeed(killerName,victims=[]){
 return {text:`${killerName} is hotter than ${[...new Set(victims)].join(', ')}`,kind:'fire'};
}
