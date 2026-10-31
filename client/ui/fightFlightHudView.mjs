// Fight-and-Flight Gate A: authoritative resources, airborne posture and real control hints.
const key=(bindings,action,fallback)=>[...new Set((bindings?.[action]??[])
  .map(code=>code.replace(/^Key/,'').replace(/Left$|Right$/g,'').replace(/^Space$/,'SPACE')))].join('/')||fallback;
export function fightFlightHudView(player,snapshot,now,{bindings={},touch=false,view='third'}={}){
  const m=snapshot?.fightFlight;
  if(!player?.alive||!m||player.operatingFightFlightId!==m.id)return null;
  const charge=Math.max(0,Math.min(m.maxFlightCharge??100,m.flightCharge??0));
  const rotor=Math.max(0,Math.min(100,m.rotorHP??0));
  const energy=Math.max(0,Math.min(100,m.rotorEnergy??0));
  const altitude=Math.max(0,(m.position?.y??m.y??0));
  const supported=Boolean(m.grounded);
  const skill=m.skill??{},active=skill.phase==='active'&&now<(skill.activeUntil??0);
  const debt=Math.max(0,m.ammoDebt??0),reserve=Math.max(0,m.ammo??0);
  const readiness=active?'FIRE AWAY '+Math.max(0,(skill.activeUntil-now)).toFixed(1)+'s':now<(skill.readyAt??0)?'SKILL '+Math.ceil(skill.readyAt-now)+'s':'SKILL READY';
  const grounded=supported?(m.crouched?'CROUCHED':'GROUNDED'):m.mode==='FALLING'?'ROTOR LOST':m.mode==='LANDING'?'DESCENDING':'AIRBORNE';
  const controls=touch?'STICK MOVE · HOLD BOLT · FIRE AWAY · RISE · LOWER · LAND TO LEAVE'
    :key(bindings,'jump','SPACE')+' '+(supported?'TAKE OFF':'ASCEND')+' · '+key(bindings,'crouch','C')+' '+(supported?'CROUCH':'DESCEND')+' · '+'RMB / '+key(bindings,'siegeWeapon','X')+' REPEATER · '+key(bindings,'deploy','B')+' / '+key(bindings,'siegeSkill','U')+' SKILL · '+key(bindings,'interact','T')+' LEAVE ON GROUND · '+key(bindings,'siegeView','V')+' VIEW';
  return {title:'FIGHT-AND-FLIGHT · '+grounded,
    status:'ALT '+altitude.toFixed(1)+' m · CHARGE '+Math.ceil(charge)+'/'+(m.maxFlightCharge??100)+' · ROTOR '+Math.ceil(rotor)+'/100 · AMMO '+reserve+'/14 · DEBT '+debt+' · '+readiness,
    controls,pressure:charge,pressureLabel:'FLIGHT CHARGE'};
}
