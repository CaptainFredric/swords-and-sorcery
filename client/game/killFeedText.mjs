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
 if(source==='fight-flight-repeater')return text([
   `${k} tranquilized ${v} permanently`,
   `${k} pin-cushioned ${v}`,
 ],event,'sword');
 if(source==='fight-flight-rotor')return text(event.killContext==='rotorDash'?[
   `${k} took ${v} out for a spin`,
   `${v} touched ${apostrophe(k)} rotor-blades`,
 ]:[
   `${v} touched ${apostrophe(k)} rotor-blades`,
   `${k} took ${v} out for a spin`,
 ],event,'sword');
 if(source==='bibye-siege')return text([
   `${v} stuck around for ${k}`,
   `${k} gave ${v} a bad name`,
   `${k} got through ${v}`,
   `${v} bolted away from ${k}`,
 ],event,'sword');
 if(source==='bibye-conditioning'||source==='bibye-shockwave')return text([
   `${k} chilled out ${v}`,
   `${k} made ${v} calm down`,
   `${v} was caught by ${apostrophe(k)} first bolt`,
 ],event,'frost');
 // These become live once the authoritative A Sharp Turn damage source is
 // introduced; do not falsely claim that an ordinary bolt was a blade sweep.
 if(source==='bibye-sharp-turn'||source==='bibye-blade-sweep')return text([
   `${v} thought the blades were for decoration`,
   `That took a sharp turn for ${v}, didn't it, ${k}?`,
   `${v} admired ${apostrophe(k)} ballista a little too closely`,
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
   `${k} taught ${v} not to stand in the way of a battering ram`,
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
 if(isVortex(source))return {text:`${k} is hotter than ${v}`,kind:'fire',streak:'vortex'};
 if(source==='fireball')return text([
   `${k} incinerated ${v}`,`${k} roasted ${v}`,
 ],event,'fire');
 if(source==='burn')return {text:`${k} burned ${v} down`,kind:'fire'};
 if(source==='frostfire')return text([
   `${k} shattered ${v}`,`${k} chilled out ${v}`,
 ],event,'frost');
 if(source==='gale')return {text:`${k} blew ${v} away`,kind:'gale'};
 if(source==='abyss')return text([
   `${k} sent ${v} into the abyss`,
   `${v} attained a grounded perspective, courtesy of ${k}`,
 ],event,'abyss');
 if(source==='gauntlet')return {text:`${k} laid ${v} low with a gauntlet`,kind:'sword'};
 if(source==='line_of_conduct')return {text:`${k} conducted ${v} out of the battle`,kind:'fire'};
 if(source==='sword')return text(mode==='RENOWN_TRIALS'?[
   `${k} slew ${v}`,
   `${k} ren-OWNED ${v}`,
   `${v} bowed down out of sudden respect for ${k}`,
 ]:[
   `${k} slew ${v}`,
   `${v} bowed down out of sudden respect for ${k}`,
   `${v} misremembered how sharp ${apostrophe(k)} blades were`,
   `${v} was defeated by ${apostrophe(k)} not-so-secret weapon`,
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
export function vortexStreakFeed(killerName,victims=[]){
 return {text:`${killerName} is hotter than ${[...new Set(victims)].join(', ')}`,kind:'fire'};
}
