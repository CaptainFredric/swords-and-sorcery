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
  const grounded=supported?(m.crouched?'CROUCHED':'GROUNDED'):m.mode==='FALLING'?'ROTOR LOST':m.mode==='LANDING'?'DESCENDING':'AIRBORNE';
  const controls=touch?'STICK MOVE · HOLD BOLT · RISE · LOWER · LAND TO LEAVE'
    :key(bindings,'jump','SPACE')+' '+(supported?'TAKE OFF':'ASCEND')+' · '+key(bindings,'crouch','C')+' '+(supported?'CROUCH':'DESCEND')+' · '+'RMB / '+key(bindings,'siegeWeapon','X')+' REPEATER · '+key(bindings,'interact','T')+' LEAVE ON GROUND · '+key(bindings,'siegeView','V')+' VIEW · '+key(bindings,'spell','Q')+' FIRE AWAY SKILL';
  const skill=m.skill??{},skillActive=skill.phase==='active'&&now<(skill.expiresAt??0);
  const skillLabel=skillActive?'FIRE AWAY '+Math.ceil(skill.expiresAt-now)+'s':now<(skill.readyAt??0)?'SKILL '+Math.ceil(skill.readyAt-now)+'s':'SKILL READY';
  return {title:'FIGHT-AND-FLIGHT · '+grounded,
    status:'ALT '+altitude.toFixed(1)+' m · CHARGE '+Math.ceil(charge)+'/'+(m.maxFlightCharge??100)+' · ROTOR '+Math.ceil(rotor)+'/100 · SPIN '+Math.ceil(energy)+'% · BOLTS '+(m.ammo??0)+'/14 · DEBT '+(m.ammoDebt??0)+' · '+skillLabel,
    controls,pressure:charge,pressureLabel:'FLIGHT CHARGE'};
}
