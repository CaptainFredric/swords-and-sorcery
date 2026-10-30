import {createSiegeSkill,primeSiegeSkill,commitSiegeSkill,endSiegeSkill,skillOperator,skillEvent,SIEGE_SKILLS} from './siegeSkills.mjs';
import { biByeCondition, biByeConstrainAim } from './biByeComponents.mjs';

// Gameplay does not depend on an asynchronously loaded visual asset. The current
// authored asset can load late without changing aim, ammunition or release clocks.
export const BI_BYE_WEAPONS = Object.freeze({
  upperRecock: 2.5, independentWindup: .2, upperRelease: .45,
  heavyDelay: .2, recovery: 2.2, heavyReload: 4.5,
  turnRate: Math.PI * 2 / 3, latchDuration: .6, releaseDuration: .6,
});
export const wrapBiByeAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const approach=(a,b,amount)=>a+clamp(wrapBiByeAngle(b-a),-amount,amount);
const event=(room,b,type,at,extra={})=>room.events?.push({type,ballistaId:b.id,at,...extra});
const ready=(b,now)=>now+1e-8>=b.smallBoltReadyAt&&b.mobileShotPendingAt==null&&b.combinedUpperPendingAt==null;
const supported=b=>b.mode==='DEPLOYED'&&b.deploymentSupported!==false&&biByeCondition(b).canSiege;
const busy=b=>['ALIGNING','ENGAGING','COUPLED','FIRING','RELEASING'].includes(b.coupling);

export function biByeWeaponState(heading) {
  return {skill:createSiegeSkill('boltToTheOccasion'),heavySkill:null,mainSkillUntil:0,mainYaw:heading,mainPitch:0,upperYaw:heading,upperPitch:0,
    pendingIndependent:null,weaponFocus:'UPPER',focusRevision:0,coupling:'INDEPENDENT',couplingProgress:0,
    couplingStartedAt:null,couplingEndsAt:null,couplingReleaseFrom:1,pendingVolley:null,upperReleasedAt:null,upperReadyAnnouncedAt:null,
    heavyDelayTrippedAt:null,mainReleasedAt:null,upperFiredAt:null,upperShotKind:null,combinedUpperPendingAt:null,combinedUpperAim:null,combinedOperatorId:null};
}

// Before the first release, no ammunition has left either weapon. After it,
// operator interruption cannot undo the mechanical delay catch.
function releaseClutch(b,now,from=1){
  b.coupling='RELEASING';b.couplingReleaseFrom=from;
  b.couplingStartedAt=now;b.couplingEndsAt=now+BI_BYE_WEAPONS.releaseDuration*from;
}
export function cancelBiByeCoupling(b,now=b.poseTime??0) {
  if(b.coupling==='FIRING'&&b.upperReleasedAt!=null)return false;
  if(b.trackingSince!=null){const from=clamp((now-b.trackingSince)/.6,0,1);b.trackingSince=null;if(!busy(b)){if(from>0)releaseClutch(b,now,from);return true;}}
  if(!busy(b)||b.coupling==='RELEASING')return true;
  const from=b.coupling==='ENGAGING'?clamp((now-b.couplingStartedAt)/BI_BYE_WEAPONS.latchDuration,0,1):b.coupling==='ALIGNING'?0:1;
  b.pendingVolley=null;b.couplingProgress=0;
  if(from>0)releaseClutch(b,now,from);
  else {b.coupling='INDEPENDENT';b.couplingStartedAt=null;b.couplingEndsAt=null;}
  b.shotIPendingAt=Infinity;b.shotIIPendingAt=Infinity;b.committedAim=null;
  if(b.state==='FIRING'){b.state='LOADED';b.upperFiredAt=null;b.upperShotKind=null;}
  return true;
}
export function setBiByeWeaponFocus(b,focus,now=0) {
  if(!b||b.mode!=='DEPLOYED'||!['MAIN','UPPER'].includes(focus))return false;
  if(focus===b.weaponFocus)return true;
  if(focus==='UPPER')cancelBiByeCoupling(b,now);
  b.pendingIndependent=null;b.weaponFocus=focus;b.focusRevision=(b.focusRevision??0)+1;
  b.yaw=focus==='UPPER'?b.upperYaw:b.mainYaw;
  b.pitch=focus==='UPPER'?b.upperPitch:b.mainPitch;
  return true;
}
// SKILL is a two-press command: first primes independent aim, second fires
// the loaded heavy bow. Ordinary ATTACK can still release Bolt I in between.
export function requestBiByeHeavySkill(room,b,p,now,targetAim,{combined=false}={}){
 if(!skillOperator(room,b,p,now)||!['MOBILE','DEPLOYED'].includes(b.mode)||!biByeCondition(b).canSiege)return 'The main launcher cannot release here.';
 const s=b.skill;
 if(s?.phase==='releasing')return 'Bolt II is already releasing.';
 if(s?.phase==='primed'){
  if(combined&&(!ready(b,now)||!b.operatorId))return 'BOTH requires a ready Bolt I.';
  if(!b.mainBoltLoaded||b.state!=='LOADED')return 'Load Bolt II first.';
  if(b.mobileShotPendingAt!=null||b.pendingIndependent)return 'II PREPARING — Bolt I has not released.';
  if(busy(b))return 'II PREPARING — finish releasing the clutch.';
  const lastI=Math.max(b.upperReleasedAt??-Infinity,s.boltIReleasedAt??-Infinity);
  const prepUntil=lastI+SIEGE_SKILLS.boltToTheOccasion.interShotPrep;
  if(now+1e-8<prepUntil)return 'II PREPARING — wait for the actual Bolt I release catch.';
  if(!commitSiegeSkill(b,now))return 'Bolt II is not primed.';
  // The lower launcher has already tracked the camera while primed. Capture
  // its physical angle; no additional artificial post-input windup is added.
  b.heavySkill={operatorId:p.id,aim:{yaw:b.mainYaw,pitch:b.mainPitch},releaseAt:now,combined};
  skillEvent(room,b,now,'releasing');return null;
 }
 if(!b.mainBoltLoaded||b.state!=='LOADED')return 'Load Bolt II first.';
 if(b.coupling==='FIRING')return 'Finish the coupled volley first.';
 if(!primeSiegeSkill(b,now))return 'Bolt to the Occasion is cooling down.';
 // Release an uncommitted clutch, but never start a coupled projectile.
 if(!cancelBiByeCoupling(b,now)){endSiegeSkill(b,now);return 'Finish the current mechanism first.';}
 b.pendingVolley=null;
 s.boltIReleasedAt=b.upperReleasedAt!=null&&b.upperReleasedAt<=now?b.upperReleasedAt:null;
 skillEvent(room,b,now,'primed');return null;
}
// A separate atomic server command, never two competing ordinary inputs.
export function requestBiByeCombinedSkill(room,b,p,now,targetAim){
 if(b?.skill?.phase!=='primed')return 'Prime Bolt to the Occasion first.';
 if(!ready(b,now))return 'BOTH requires Bolt I ready.';
 return requestBiByeHeavySkill(room,b,p,now,targetAim,{combined:true});
}
export function requestBiByeIndependent(room,b,now) {
  if(!b||b.mode==='DESTROYED'||!['MOBILE','DEPLOYED'].includes(b.mode)||b.heavySkill||!ready(b,now))return false;
  if(b.coupling==='RELEASING'&&(b.weaponFocus==='UPPER'||b.skill?.phase==='primed')){
    b.pendingIndependent??={operatorId:b.operatorId,yaw:b.upperYaw,pitch:b.upperPitch};return true;
  }
  if(busy(b))return false;
  b.committedMobileAim={yaw:b.upperYaw,pitch:b.upperPitch};
  b.mobileFiredAt=now;b.upperFiredAt=now;b.upperShotKind='independent';
  b.mobileShotPendingAt=now+BI_BYE_WEAPONS.independentWindup;b.mobileOperatorId=b.operatorId;
  event(room,b,'bibyeMobileFireTriggered',now,{operatorId:b.operatorId,aim:b.committedMobileAim});
  return true;
}
export function requestBiByeVolley(room,b,now) {
  if(b?.heavySkill||b?.skill?.phase==='primed')return false;
  if(!b||!supported(b)||b.state!=='LOADED'||!b.mainBoltLoaded||!ready(b,now)||busy(b))return false;
  if(b.trackingSince!=null&&now+1e-8>=b.trackingSince+BI_BYE_WEAPONS.latchDuration){
    b.trackingSince=null;b.upperReleasedAt=null;b.heavyDelayTrippedAt=null;
    b.committedAim={yaw:b.mainYaw,pitch:b.mainPitch,upperYaw:b.upperYaw,upperPitch:b.upperPitch};
    b.firingOperatorId=b.operatorId;b.state='FIRING';b.firedAt=now;b.mainReleasedAt=null;
    b.upperFiredAt=now;b.upperShotKind='coupled';b.shotIPendingAt=now+BI_BYE_WEAPONS.upperRelease;b.shotIIPendingAt=Infinity;
    b.coupling='FIRING';event(room,b,'bibyeVolleyInitiated',now,{operatorId:b.firingOperatorId,aim:b.committedAim});return true;
  }
  b.pendingVolley={yaw:b.mainYaw,pitch:b.mainPitch,operatorId:b.operatorId};
  b.coupling='ALIGNING';b.couplingProgress=0;b.couplingStartedAt=now;
  b.alignmentStartError=Math.max(.001,Math.abs(wrapBiByeAngle(b.upperYaw-b.mainYaw)),Math.abs(b.upperPitch-b.mainPitch));
  b.upperReleasedAt=null;b.heavyDelayTrippedAt=null;
  event(room,b,'bibyeAlignmentStarted',now);
  return true;
}
export function interruptBiByeSupport(b,now=b.poseTime??0) {
  if(b.coupling==='FIRING'&&b.upperReleasedAt!=null){
    b.shotIIPendingAt=Infinity;releaseClutch(b,now);
    b.state='LOADED';b.pendingVolley=null; // Heavy ammunition never discharged.
  }else cancelBiByeCoupling(b,now);
}

export function stepBiByeWeapons(room,b,dt,now,{shotI,shotII,coupledAim,targetAim}={}) {
  if(b.mode==='DESTROYED')return;
  const op=room.players?.get(b.operatorId),input=op?.alive?op.input??{}:{};
  if(b.mode!=='DEPLOYED'&&b.weaponFocus!=='UPPER'){
    b.weaponFocus='UPPER';b.focusRevision++;cancelBiByeCoupling(b,now);
  }
  if(b.skill?.phase==='primed'&&(!skillOperator(room,b,op,now)||!['MOBILE','DEPLOYED'].includes(b.mode)||!biByeCondition(b).canSiege)){
    endSiegeSkill(b,now);skillEvent(room,b,now,'cancelled');
  }
  if(b.heavySkill){
    const pending=b.heavySkill;
    if(!skillOperator(room,b,op,now)||!['MOBILE','DEPLOYED'].includes(b.mode)||!biByeCondition(b).canSiege||!b.mainBoltLoaded){b.heavySkill=null;endSiegeSkill(b);skillEvent(room,b,now,'cancelled');}
    else{
      const target=biByeConstrainAim(b,pending.aim);
      b.mainYaw=approach(b.mainYaw,target.yaw,BI_BYE_WEAPONS.turnRate*dt);b.mainPitch+=clamp(target.pitch-b.mainPitch,-BI_BYE_WEAPONS.turnRate*dt,BI_BYE_WEAPONS.turnRate*dt);
      if(now+1e-8>=pending.releaseAt&&Math.abs(wrapBiByeAngle(target.yaw-b.mainYaw))<.001&&Math.abs(target.pitch-b.mainPitch)<.001){
        b.firingOperatorId=pending.operatorId;shotII?.(room,b,{yaw:b.mainYaw,pitch:b.mainPitch},now);
        b.mainBoltLoaded=false;b.mainReleasedAt=now;b.firedAt=now;b.mainSkillUntil=now+BI_BYE_WEAPONS.recovery;b.state='SPENT';
        b.reloadStartedAt=now+BI_BYE_WEAPONS.recovery;b.reloadEndsAt=b.reloadStartedAt+BI_BYE_WEAPONS.heavyReload;
        // The second string is a follow-through of the ONE committed action.
        // Retain it through a rider change; no unrelated input can launch it.
        if(pending.combined){
          b.combinedUpperPendingAt=now+BI_BYE_WEAPONS.heavyDelay;
          b.combinedUpperAim={yaw:b.upperYaw,pitch:b.upperPitch};
          b.combinedOperatorId=pending.operatorId;
          b.upperFiredAt=now;b.upperShotKind='combined';
          event(room,b,'bibyeCombinedCommitted',now,{operatorId:pending.operatorId,upperReleaseAt:b.combinedUpperPendingAt});
        }
        b.heavySkill=null;endSiegeSkill(b);
        event(room,b,'bibyeFired',now,{operatorId:b.firingOperatorId,shot:'II_SKILL'});skillEvent(room,b,now,'released');
      }
    }
  }
  const primed=b.skill?.phase==='primed';
  const locked=busy(b)||Boolean(b.heavySkill);
  b.aimTarget=input.siegeTarget??null;
  const aim=(kind,current)=>targetAim?.(b,kind,{yaw:input.yaw??current.yaw,pitch:input.pitch??current.pitch},b.aimTarget)??biByeConstrainAim(b,{yaw:input.yaw??current.yaw,pitch:input.pitch??current.pitch},kind==='conditioning');
  if(primed&&op?.alive){
    // Both actual articulations track the same camera independently, including
    // while the chassis drives and turns. Keep the upper bow fixed while its
    // already committed Shot I is winding through a real release.
    const main=aim('siege',{yaw:b.mainYaw,pitch:b.mainPitch});
    b.mainYaw=approach(b.mainYaw,main.yaw,BI_BYE_WEAPONS.turnRate*dt);
    b.mainPitch+=clamp(main.pitch-b.mainPitch,-BI_BYE_WEAPONS.turnRate*dt,BI_BYE_WEAPONS.turnRate*dt);
    b.aimLimited=Boolean(main.limited);
    if(b.mobileShotPendingAt==null){
      const upper=aim('conditioning',{yaw:b.upperYaw,pitch:b.upperPitch});
      b.upperYaw=approach(b.upperYaw,upper.yaw,BI_BYE_WEAPONS.turnRate*dt);
      b.upperPitch+=clamp(upper.pitch-b.upperPitch,-BI_BYE_WEAPONS.turnRate*dt,BI_BYE_WEAPONS.turnRate*dt);
      b.aimLimited||=Boolean(upper.limited);
    }
  }else{
    if(b.mode==='MOBILE'&&!b.heavySkill&&now>=(b.mainSkillUntil??0)) {b.mainYaw=approach(b.mainYaw,b.heading,BI_BYE_WEAPONS.turnRate*dt);b.mainPitch+=clamp(-b.mainPitch,-BI_BYE_WEAPONS.turnRate*dt,BI_BYE_WEAPONS.turnRate*dt);}
    else if(!locked&&b.weaponFocus==='MAIN'&&op?.alive){
      const target=aim('siege',{yaw:b.mainYaw,pitch:b.mainPitch});b.mainYaw=target.yaw;b.mainPitch=target.pitch;b.aimLimited=Boolean(target.limited);
    }
    if(!locked&&b.mobileShotPendingAt==null&&b.weaponFocus==='UPPER'&&op?.alive){
      const target=aim('conditioning',{yaw:b.upperYaw,pitch:b.upperPitch});
      b.upperYaw=Math.abs(target.yaw-b.upperYaw)>Math.PI?b.upperYaw+wrapBiByeAngle(target.yaw-b.upperYaw):target.yaw;b.upperPitch=target.pitch;b.aimLimited=Boolean(target.limited);
    }
  }
  // Deployment seats the clutch in advance. While Main is selected both bows
  // follow the reticle; Fire only commits the already aligned mechanisms.
  if(op?.alive&&!primed&&!locked&&b.mobileShotPendingAt==null&&(b.mode==='DEPLOYING'||supported(b)&&b.weaponFocus==='MAIN'&&b.mainBoltLoaded&&ready(b,now))){
    b.trackingSince??=b.mode==='DEPLOYING'?b.modeTransitionStartedAt:now;
    const target=coupledAim?.(b)??{yaw:b.mainYaw,pitch:b.mainPitch};
    b.upperYaw=target.yaw;b.upperPitch=target.pitch;
  }
  if(['ALIGNING','ENGAGING','COUPLED'].includes(b.coupling)){
    const pending=b.pendingVolley;
    if(!pending||!supported(b)||!op?.alive||op.id!==pending.operatorId||!ready(b,now)||!b.mainBoltLoaded){cancelBiByeCoupling(b,now);}
    else {
      b.mainYaw=pending.yaw;b.mainPitch=pending.pitch;
      const target=coupledAim?.(b)??pending;
      b.upperYaw=approach(b.upperYaw,target.yaw,BI_BYE_WEAPONS.turnRate*dt);
      b.upperPitch+=clamp(target.pitch-b.upperPitch,-BI_BYE_WEAPONS.turnRate*dt,BI_BYE_WEAPONS.turnRate*dt);
      const error=Math.max(Math.abs(wrapBiByeAngle(b.upperYaw-target.yaw)),Math.abs(b.upperPitch-target.pitch));
      b.couplingProgress=1-clamp(error/b.alignmentStartError,0,1);
      if(error<.001&&b.coupling==='ALIGNING'){
        b.coupling='ENGAGING';b.couplingStartedAt=now;b.couplingEndsAt=now+BI_BYE_WEAPONS.latchDuration;
        event(room,b,'bibyeUpperAligned',now);
      }
      if(b.coupling==='ENGAGING'&&now+1e-8>=b.couplingEndsAt){
        b.coupling='COUPLED';event(room,b,'bibyeCouplingEngaged',now);
        b.committedAim={yaw:b.mainYaw,pitch:b.mainPitch,upperYaw:b.upperYaw,upperPitch:b.upperPitch};
        b.firingOperatorId=pending.operatorId;b.state='FIRING';b.firedAt=now;b.mainReleasedAt=null;
        b.upperFiredAt=now;b.upperShotKind='coupled';
        b.shotIPendingAt=now+BI_BYE_WEAPONS.upperRelease;b.shotIIPendingAt=Infinity;
        b.coupling='FIRING';event(room,b,'bibyeVolleyInitiated',now,{operatorId:b.firingOperatorId,aim:b.committedAim});
      }
    }
  }
  if(b.combinedUpperPendingAt!=null&&now+1e-8>=b.combinedUpperPendingAt){
    const releasedAt=b.combinedUpperPendingAt;
    shotI?.(room,b,b.combinedUpperAim,releasedAt,b.combinedOperatorId);
    b.combinedUpperPendingAt=null;b.combinedUpperAim=null;b.combinedOperatorId=null;
    b.upperReleasedAt=releasedAt;b.smallBoltReadyAt=releasedAt+BI_BYE_WEAPONS.upperRecock;
    event(room,b,'bibyeFired',releasedAt,{shot:'I_COMBINED'});
  }
  if(b.mobileShotPendingAt!=null&&now+1e-8>=b.mobileShotPendingAt){
    const releasedAt=b.mobileShotPendingAt;
    shotI?.(room,b,{yaw:b.upperYaw,pitch:b.upperPitch},releasedAt,b.mobileOperatorId);
    b.mobileShotPendingAt=null;b.upperReleasedAt=releasedAt;if(b.skill?.phase==='primed')b.skill.boltIReleasedAt=releasedAt;b.smallBoltReadyAt=releasedAt+BI_BYE_WEAPONS.upperRecock;
    event(room,b,'bibyeFired',releasedAt,{operatorId:b.mobileOperatorId,shot:'I_MOBILE'});
  }
  if(b.coupling==='FIRING'){
    if(b.upperReleasedAt==null&&(!supported(b)||!op?.alive||op.id!==b.firingOperatorId)){cancelBiByeCoupling(b,now);}
    else if(b.upperReleasedAt==null&&now+1e-8>=b.shotIPendingAt){
      const releasedAt=b.shotIPendingAt;
      shotI?.(room,b,b.committedAim,releasedAt,b.firingOperatorId);
      b.upperReleasedAt=releasedAt;b.upperFiredAt=b.firedAt;b.upperShotKind='coupled';
      b.smallBoltReadyAt=releasedAt+BI_BYE_WEAPONS.upperRecock;b.shotIPendingAt=Infinity;
      // The actual string release, never target impact, trips this catch.
      b.heavyDelayTrippedAt=releasedAt;b.shotIIPendingAt=releasedAt+BI_BYE_WEAPONS.heavyDelay;
      event(room,b,'bibyeFired',releasedAt,{operatorId:b.firingOperatorId,shot:'I'});
      event(room,b,'bibyeHeavyDelayTripped',releasedAt);
    }
    if(b.upperReleasedAt!=null&&!supported(b))interruptBiByeSupport(b,now);
    else if(b.upperReleasedAt!=null&&now+1e-8>=b.shotIIPendingAt){
      const releasedAt=b.shotIIPendingAt;
      shotII?.(room,b,b.committedAim,releasedAt);b.shotIIPendingAt=Infinity;
      b.mainReleasedAt=releasedAt;b.mainBoltLoaded=false;b.state='SPENT';b.reloadStartedAt=b.firedAt+BI_BYE_WEAPONS.recovery;
      b.reloadEndsAt=b.reloadStartedAt+BI_BYE_WEAPONS.heavyReload;
      releaseClutch(b,releasedAt);b.pendingVolley=null;
      event(room,b,'bibyeFired',releasedAt,{operatorId:b.firingOperatorId,shot:'II'});
    }
  }
  if(b.coupling==='RELEASING'&&now+1e-8>=b.couplingEndsAt){b.coupling='INDEPENDENT';b.couplingProgress=0;event(room,b,'bibyeCouplingReleased',now);}
  if(b.coupling==='INDEPENDENT'&&b.pendingIndependent){
    const pending=b.pendingIndependent;b.pendingIndependent=null;
    if(op?.alive&&op.id===pending.operatorId&&(b.weaponFocus==='UPPER'||b.skill?.phase==='primed')&&ready(b,now)){
      b.upperYaw=pending.yaw;b.upperPitch=pending.pitch;requestBiByeIndependent(room,b,now);
    }
  }
  if(b.state==='SPENT'&&now+1e-8>=b.reloadStartedAt){b.state='RELOADING';event(room,b,'bibyeReloadStarted',now,{durationSec:BI_BYE_WEAPONS.heavyReload});}
  if(b.state==='RELOADING'&&now+1e-8>=b.reloadEndsAt){b.state='LOADED';b.mainBoltLoaded=true;event(room,b,'bibyeReloadCompleted',now);}
  if(b.upperReleasedAt!=null&&now+1e-8>=b.smallBoltReadyAt&&b.upperReadyAnnouncedAt!==b.smallBoltReadyAt){
    b.upperReadyAnnouncedAt=b.smallBoltReadyAt;event(room,b,'bibyeUpperRecocked',b.smallBoltReadyAt);
  }
  b.yaw=b.weaponFocus==='MAIN'?b.mainYaw:b.upperYaw;b.pitch=b.weaponFocus==='MAIN'?b.mainPitch:b.upperPitch;
}
