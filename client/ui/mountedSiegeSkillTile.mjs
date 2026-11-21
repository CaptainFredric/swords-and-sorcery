import {siegeSkillControlLabel} from './siegeSkillView.mjs';
import {biByeSkillIcon} from './biByeControlView.mjs';
import {SIEGE_SKILLS} from '../../shared/sim/siegeSkills.mjs';

const RAM=Object.freeze({
  hellpingHand:['hellpingHand','HELLPING HAND'],
  beatToThePunch:['beatToThePunch','BEAT TO PUNCH'],
  longArmToTheJaw:['longArmToTheJaw','LONG ARM'],
});
const BALLISTA=Object.freeze({
  boltToTheOccasion:'BOLT II',
  coldHowTouching:'COLD TOUCH',
  lookAroundAndFindOut:'LOOK AROUND',
});
const FLIGHT=Object.freeze({
  fireAwayRightHere:['fireAway','FIRE AWAY'],
  narrowToOne:['narrowToOne','NARROW'],
  doNotStopMyAscension:['doNotStopMyAscension','ASCEND'],
});

// Desktop's normal cooldown-tile contract, shared by every mounted machine.
// All displayed timing and phase comes from the authoritative snapshot.
export function mountedSiegeSkillTile(local,snapshot,now){
  if(!local?.alive)return null;
  const kind=local.operatingRamId?'ram':local.operatingBallistaId?'ballista':
    local.operatingFightFlightId?'flight':null;
  if(!kind)return null;
  const machine=kind==='ram'?snapshot?.soFistication:
    kind==='ballista'?snapshot?.bibyeBallista:snapshot?.fightFlight;
  if(!machine||machine.retired||machine.health<=0)return null;
  const skill=machine.skill??{};
  // The armed Flight loadout calls Fire Away `fireAwayRightHere`, whereas the
  // active runtime reports the historical `fireAwayImRightHere` contract ID.
  const id=kind==='flight'&&skill.id==='fireAwayImRightHere'
    ?'fireAwayRightHere':skill.id;
  const ram=RAM[id],flight=FLIGHT[id];
  const name=kind==='ram'?(ram?.[1]??'RAM SKILL'):
    kind==='flight'?(flight?.[1]??'FLIGHT SKILL'):
    BALLISTA[id]??'SIEGE SKILL';
  const icon=kind==='ram'?(ram?.[0]??'ram'):
    kind==='flight'?(flight?.[0]??'flightDash'):biByeSkillIcon(machine,now);
  const remaining=Math.max(0,(skill.readyAt??0)-now);
  const phase=skill.phase??'idle';
  const active=phase==='active'||phase==='primed'||phase==='releasing'||
    (id==='hellpingHand'&&Boolean(machine.hellping)&&
      !['release'].includes(machine.hellping.phase))||
    (id==='lookAroundAndFindOut'&&Boolean(machine.sweep?.kind==='skill'));
  const state=remaining>0&&!active?'COOLDOWN':
    id==='hellpingHand'&&machine.hellping?.phase==='vault'?'HOPPING':
    id==='hellpingHand'&&machine.hellping?.phase==='ledgePull'?'PULLING UP':
    id==='hellpingHand'&&machine.hellpingLedge?'LEDGE READY':
    id==='hellpingHand'&&machine.hellping?.phase==='open'?'PALM OPEN':
    id==='hellpingHand'&&machine.hellping?.phase==='grasp'?'CRUSHING':
    id==='hellpingHand'&&machine.hellping?.phase==='transport'?'CARRYING':
    phase==='primed'?'PRIMED':
    phase==='releasing'?'RELEASING':
    active?'ACTIVE':'READY';
  const total=SIEGE_SKILLS[id]?.cooldown??24;
  return {kind,name,icon,remaining,total,active,state,
    hint:siegeSkillControlLabel(machine,now)};
}
