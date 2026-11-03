import {FLIGHT_REPEATER} from '../../shared/src/flightRepeaterAim.mjs';
import {SIEGE_SKILL_NAMES} from '../../shared/src/siegeLoadout.mjs';
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
  const skill=m.skill??{},variant=skill.id==='narrowToOne'?'narrowToOne':
    skill.id==='doNotStopMyAscension'?'doNotStopMyAscension':player.siegeLoadout?.fightFlight??'fireAwayRightHere';
  const skillName=SIEGE_SKILL_NAMES[variant]??SIEGE_SKILL_NAMES.fireAwayRightHere;
  const skillIcon=variant==='fireAwayRightHere'?'fireAway':variant;
  const active=skill.phase==='active'&&(skill.activeUntil==null||now<(skill.activeUntil??0));
  const skillState=variant==='narrowToOne'&&active?
    skill.trackingState==='noClearShot'?'NO CLEAR SHOT':
    skill.trackingState==='sightLost'?'SIGHT LOST':
    skill.trackingState==='locked'?'TARGET LOCKED':'ACQUIRING':
    variant==='doNotStopMyAscension'&&active?'CHARGE DASH':
    active?'FIRE AWAY '+Math.max(0,skill.activeUntil-now).toFixed(1)+'s':
    now<(skill.readyAt??0)?Math.ceil(skill.readyAt-now)+'s':'READY';
  const debt=Math.max(0,m.ammoDebt??0),reserve=Math.max(0,m.ammo??0);
  const readiness=skillName.toUpperCase()+' · '+skillState;
  const preparing=m.terminalPrep?.phase==='holding';
  const terminal=Boolean(m.terminalDive&&!m.terminalDive.resolved);
  const commitment=preparing?'VALKYRIE DIVE · HOLD DASH + ULTIMATE '+Math.max(0,(m.terminalPrep.until-now)).toFixed(1)+'s':terminal?'VALKYRIE DIVE · COMMITTED':' ';
  const grounded=terminal?'TERMINAL DESCENT':preparing?'VALKYRIE PREPARING':supported?(m.crouched?'CROUCHED':'GROUNDED'):m.mode==='FALLING'?'ROTOR LOST':m.mode==='LANDING'?'DESCENDING':'AIRBORNE';
  const controls=touch?'STICK MOVE · HOLD BOLT · '+skillName.toUpperCase()+' · RISE · LOWER · TAP EJECT · HOLD TO BRAKE'
    :key(bindings,'jump','SPACE')+' '+(supported?'TAKE OFF':'ASCEND')+' · '+key(bindings,'crouch','C')+' '+(supported?'CROUCH':'DESCEND')+' · '+'LMB REPEATER · RMB SWORD · '+key(bindings,'deploy','B')+' / '+key(bindings,'siegeSkill','U')+' SKILL · '+key(bindings,'interact','T')+' EJECT / HOLD BRAKE · '+key(bindings,'siegeView','V')+' VIEW';
  let warning = '';
  if (rotor <= 0) warning = 'ROTOR LOST · DESCENDING';
  else if (terminal) warning = 'VALKYRIE DIVE · COMMITTED';
  else if (preparing) warning = 'VALKYRIE PREPARING · ' + Math.max(0, (m.terminalPrep.until - now)).toFixed(1) + 's';
  else if (active&&variant==='narrowToOne'&&skill.trackingState==='noClearShot') warning = 'NO CLEAR SHOT · GUARD, COVER OR TRAVERSE';
  else if (active&&variant==='narrowToOne'&&skill.trackingState==='sightLost') warning = 'TARGET OUT OF SIGHT · FIRING ENDS LOCK';
  else if (!supported && charge < 15) warning = 'LOW FLIGHT CHARGE';
  else if (m.crossbowAimLimited) warning = 'AIM OUTSIDE CROSSBOW ARC · MUZZLE PATH DIFFERS';

  const hull = Math.max(0, Math.ceil(m.health ?? 250));
  const maxHull = m.maxHealth ?? 250;
  const playerHealth = Math.max(0, Math.min(100, Math.ceil(player.health ?? 100)));
  const playerGuard = Math.max(0, Math.min(100, Math.ceil(player.guardStamina ?? 100)));

  return {
    isFlight: true,
    title:'FIGHT-AND-FLIGHT · '+grounded,
    status:(preparing||terminal?commitment+' · ':'')+'ALT '+altitude.toFixed(1)+' m · CHARGE '+Math.ceil(charge)+'/'+(m.maxFlightCharge??100)+' · ROTOR '+Math.ceil(rotor)+'/100 · '+Math.round(m.rotorRPM??0)+' RPM · AMMO '+reserve+'/'+FLIGHT_REPEATER.capacity+' · DEBT '+debt+' · '+readiness,
    controls,pressure:charge,pressureLabel:'FLIGHT CHARGE',
    alt: altitude.toFixed(1),
    charge: Math.ceil(charge),
    maxCharge: m.maxFlightCharge ?? 100,
    rotor: Math.ceil(rotor),
    rotorRPM: Math.round(m.rotorRPM??0),
    rotorPowered: Boolean(m.rotorPowered),
    rotorBrakeHeld: Boolean(m.rotorBrakeHeld),
    ammo: reserve,
    debt,
    hull,
    maxHull,
    playerHealth,
    playerGuard,
    skillText: skillState,
    skillName,
    skillIcon,
    targetId: skill.targetId??null,
    skillActive: active,
    warning,
    touch,
  };
}
