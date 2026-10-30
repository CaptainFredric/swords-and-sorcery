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
  const controls=touch?'STICK MOVE · RISE · LOWER · VIEW · LAND TO LEAVE'
    :key(bindings,'jump','SPACE')+' '+(supported?'TAKE OFF':'ASCEND')+' · '+key(bindings,'crouch','C')+' '+(supported?'CROUCH':'DESCEND')+' · '+key(bindings,'interact','T')+' LEAVE ON GROUND · '+key(bindings,'siegeView','V')+' VIEW';
  return {title:'FIGHT-AND-FLIGHT · '+grounded,
    status:'ALT '+altitude.toFixed(1)+' m · CHARGE '+Math.ceil(charge)+'/'+(m.maxFlightCharge??100)+' · ROTOR '+Math.ceil(rotor)+'/100 · SPIN '+Math.ceil(energy)+'%',
    controls,pressure:charge,pressureLabel:'FLIGHT CHARGE'};
}
