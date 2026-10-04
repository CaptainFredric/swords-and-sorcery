// Focused developer check using the production WeaponView, exported arms and ordinary animation composition.
import * as THREE from 'three';
import { WeaponView } from './WeaponView.mjs';
import { preloadSpellbladeAssets } from './SpellbladeAssets.mjs';
import { FIRST_PERSON_SWORD_ARM } from './swordArmIK.mjs';
import { COMBO_CONTACTS } from './fpSlash.mjs';
import { guardedComboPose } from './fpGuardedSlash.mjs';

const require = (condition, message) => { if (!condition) throw new Error(message); };
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));

export async function checkGuardedFirstPerson() {
  await preloadSpellbladeAssets();
  const weapon = new WeaponView(new THREE.PerspectiveCamera(78,16/9,.01,100));
  const deadline = performance.now()+4000;
  await new Promise((resolve,reject)=> {
    function ready() {
      if (weapon.visualKind==='production') resolve();
      else if(performance.now()>deadline) reject(new Error('First person asset failed to load'));
      else requestAnimationFrame(ready);
    }
    ready();
  });
  let samples=0, maxWristError=0, previous=null, maxStep=0, castStart=null, castTravel=0;
  const contacts=[];
  try {
    const player={alive:true,guarding:true,preparedSpells:['fireball','frostfire','gale'],ultimateState:{id:'chivalry',phase:'active',commitAt:10,until:19}};
    weapon.setCombatPolicy({concurrent:true},player,10); weapon.setGuard(true);
    for(let n=0;n<=432;n++) {
      const now=10+n/120;
      if(n===96) {weapon.swordChain.press(now);weapon.attackButton=true;}
      if(n===330) {weapon.swordChain.release();weapon.attackButton=false;}
      // The independent sorcery gesture shares neither the sword clock nor its target.
      if(n===190) {weapon.castStartedAt=now;weapon.castUntil=now+.36;weapon.castReleased=false;}
      const motion=weapon.update(now,1/120,{speed:n>300 ? 11:0,grounded:true,yaw:0,pitch:0});
      const api=weapon.productionInstance.animator.boneApi;
      const hand=api.position('hand.R');
      if(n===189) castStart=api.position('hand.L');
      if(n>=190 && n<=235) castTravel=Math.max(castTravel,distance(api.position('hand.L'),castStart));
      require(hand.every(Number.isFinite),'Nonfinite first person hand');
      if(previous) maxStep=Math.max(maxStep,distance(hand,previous));
      previous=hand;
      if(now>=10.8 && now<=12.88) {
        const error=distance(hand,guardedComboPose(now-10.8).arm.wrist);
        maxWristError=Math.max(maxWristError,error);
      }
      for(const contact of COMBO_CONTACTS) if(Math.abs(now-10.8-contact)<1e-6) {
        const blade=api.direction('socket_sword',FIRST_PERSON_SWORD_ARM.aim);
        require(blade[2]<-.45,'Exported blade leaves forward defensive space');
        contacts.push({time:contact,wrist:hand,blade});
      }
      require(weapon.guard,'Sword or cast lowered Guard');
      if(n>320) require(weapon.motion.carriage>0 && motion.fov>78,'Concurrent actions cancel Sprint carriage');
      samples++;
    }
    require(maxWristError<.035,`Guarded target exceeds the arm reach: ${maxWristError}`);
    require(maxStep<.08,`Exported hand snaps: ${maxStep}`);
    require(contacts.length===3,'All three actual contacts must be sampled');
    require(castTravel>.03,'Sorcery hand did not gather while the sword path continued');
    weapon.setGuard(false);
    for(let n=1;n<=30;n++) weapon.update(13.6+n/120,1/120);
    require(!weapon.guard && weapon.concurrentGuardBlend===0,'Deliberately lowered Guard keeps overriding the hand');
    return {samples,maxWristError,maxStep,castTravel,contacts,independentCast:true,guardRecovery:true,deliberateRelease:true};
  } finally {weapon.dispose();}
}
