import {siegeSkillLabel} from './siegeSkillView.mjs';
import {biByeCombatView, biByeSweepCooldownView} from './biByeControlView.mjs';
import { biByeCondition } from '../../shared/sim/biByeComponents.mjs';
import { keyLabel, registry } from '../settings/settingsRegistry.mjs';
import { BI_BYE_LLISTA_CONFIG } from '../../shared/sim/biByeLlista.mjs';
import { BI_BYE_WEAPONS } from '../../shared/sim/biByeWeapons.mjs';

export function biByeDesktopInstruments(b, now = 0, { bindings = registry.defaultBindings(), view = 'third' } = {}) {
  if (!b || b.mode === 'DESTROYED') return null;
  const key = action => bindings[action]?.[0] ? keyLabel(bindings[action][0]) : '—';
  const condition = biByeCondition(b);
  const combat = biByeCombatView(b, now);
  const sweep = biByeSweepCooldownView(b, now);
  const uprooted = Number.isFinite(b.outriggersDislodgedUntil) && now < b.outriggersDislodgedUntil;
  const upperReady = Math.max(0, (b.smallBoltReadyAt ?? now) - now);
  const reloadLeft = b.mainBoltLoaded === false ? Math.max(0, (b.reloadEndsAt ?? now) - now) : 0;
  const deployLabel = b.mode === 'DEPLOYING' ? 'DEPLOYING'
    : b.mode === 'DEPLOYED' ? 'RETRACT'
    : b.mode === 'RETRACTING' ? 'RETRACTING'
    : 'DEPLOY';
  const deployState = uprooted ? 'UPROOTED'
    : !condition.canDeploy ? 'DISABLED'
    : (b.mode === 'DEPLOYING' || b.mode === 'RETRACTING') ? 'BUSY'
    : 'READY';
  const focusCode = bindings.ballistaFocus?.[0] ?? bindings.siegeWeapon?.[0];
  const focusKey = focusCode ? keyLabel(focusCode) : '—';
  const viewMode = view === 'clear' ? 'CLEAR' : view === 'sight' ? 'SIGHT' : 'VIEW';
  return {
    primary: {
      key: 'LMB',
      label: combat.primary.label,
      remaining: b.sweep ? sweep.remaining : upperReady,
      total: b.sweep ? sweep.total : BI_BYE_WEAPONS.upperRecock,
      busy: Boolean(b.sweep),
    },
    secondary: {
      key: b.skill?.id === 'boltToTheOccasion' ? 'RMB' : focusKey,
      label: b.skill?.id === 'boltToTheOccasion'
        ? (b.mainBoltLoaded !== false ? (sweep.remaining > .01 ? 'II LOCKED' : 'BOLT II') : 'RELOAD')
        : (b.mode === 'DEPLOYED' ? `${b.weaponFocus === 'MAIN' ? 'UPPER' : 'MAIN'} FOCUS` : 'BOLT II'),
      remaining: Math.max(reloadLeft, sweep.remaining),
      total: reloadLeft > sweep.remaining ? BI_BYE_WEAPONS.heavyReload : sweep.total,
      focusKey,
      focusAvailable: b.mode === 'DEPLOYED',
      focusTarget: b.weaponFocus === 'MAIN' ? 'UPPER' : 'MAIN',
    },
    deploy: {
      key: key('deploy'),
      label: deployLabel,
      state: deployState,
      disabled: !condition.canDeploy || uprooted || b.mode === 'DEPLOYING' || b.mode === 'RETRACTING',
    },
    view: {
      key: key('siegeView'),
      label: viewMode,
    },
  };
}

export function biByeHudView(local, snapshot, now, { bindings = registry.defaultBindings(), touch = false, view = 'third' } = {}) {
  const b = snapshot?.bibyeBallista;
  if (!local?.alive || !b || b.mode === 'DESTROYED') return null;
  const key = action => bindings[action]?.[0] ? keyLabel(bindings[action][0]) : 'UNBOUND';
  if (!local.operatingBallistaId) {
    // Mobile uses the actual nearby MOUNT control, not an obsolete text panel.
    if (touch) return null;
    const boardRadius=Number.isFinite(b.interactRadius)?b.interactRadius:BI_BYE_LLISTA_CONFIG.emplacement.interactRadius;
    if (b.operatorId || Math.hypot(b.position.x - local.position.x, b.position.z - local.position.z) > boardRadius) return null;
    return { title: 'BI-BYE-LLISTA', status: touch ? 'Tap MOUNT to operate' : `[${key('interact')}] Operate`, controls: '' };
  }
  const condition = biByeCondition(b);
  const upperReady = b.smallBoltReady ?? (now >= (b.smallBoltReadyAt ?? 0) && !b.upperPending);
  const upper = b.upperQueued ? 'Shot I queued' : upperReady ? 'Shot I ready' : b.upperPending ? 'Shot I releasing' : `Shot I ${Math.max(0,(b.smallBoltReadyAt??now)-now).toFixed(1)}s`;
  const sharedRecovery=Math.max(0,(b.sweepHeavyReadyAt??0)-now);
  const heavy = b.mainBoltLoaded !== false
    ? sharedRecovery>0 ? 'II locked' : 'II ready'
    : `II ${Math.max(0,(b.reloadEndsAt??now)-now).toFixed(1)}s`;
  const coupling = b.pendingCoupledFromUpper ? 'Main bow traversing'
    : b.coupling === 'ALIGNING' ? `Aligning ${Math.round((b.couplingProgress??0)*100)}%`
    : b.coupling === 'ENGAGING' ? 'Engaging latch' : b.coupling === 'RELEASING' ? 'Releasing clutch' : b.coupling === 'FIRING' ? 'Volley committed' : '';
  let status = b.mode === 'DEPLOYING' ? 'Deploying outriggers' : b.mode === 'RETRACTING' ? 'Packing outriggers'
    : [upper,b.mode === 'DEPLOYED' || b.mainBoltLoaded === false ? heavy : '',coupling].filter(Boolean).join(' · ');
  if(b.deploymentReason&&now-(b.deploymentRejectedAt??-Infinity)<3)status=b.deploymentReason;
  const uprooted=Number.isFinite(b.outriggersDislodgedUntil)&&
    now<b.outriggersDislodgedUntil;
  if(uprooted)status='OUTRIGGERS UPROOTED · '+
    (b.mode==='RETRACTING'?'FORCED RETRACTION':'MOBILE · STABILIZERS RECOVERING')+
    ' · '+status;
  const faults = [!condition.canDrive ? "IMMOBILIZED" : condition.failedWheels ? "DRIVE IMPAIRED" : "", !condition.canDeploy ? "SUPPORTS DISABLED" : condition.failedStabilizers ? "SUPPORT DAMAGED" : ""].filter(Boolean);
  if(b.sweep)status+=' · '+(b.sweep.phase==='settle'?'BOW SETTLING':b.sweep.kind==='skill'?'STATIONARY BOW SPIN':'A SHARP TURN');
  else if(sharedRecovery>0)status+=` · SWEEP / II ${sharedRecovery.toFixed(1)}s`;
   if(b.aimLimited)status+=' · AIM LIMIT';
  if (faults.length) status += " · " + faults.join(" · ");
  const deployment = condition.canDeploy&&!uprooted&&
    (b.mode==='MOBILE'||b.mode==='DEPLOYED')
    ? `[${key('deploy')}] ${b.mode === 'DEPLOYED' ? 'Retract' : 'Deploy'} · ` : "";
  const focusCode = bindings.ballistaFocus?.[0] ?? bindings.siegeWeapon?.[0];
  const focus = b.mode === 'DEPLOYED' ? `[${focusCode ? keyLabel(focusCode) : 'UNBOUND'}] ${b.weaponFocus === 'MAIN' ? 'Upper / cancel' : 'Main'} · ` : '';
  if(b.skill?.phase==='primed'&&b.mainBoltLoaded!==false&&upperReady&&!b.upperQueued&&!b.upperPending&&b.combinedUpperPendingAt==null&&b.coupling==='INDEPENDENT')status+=' · BOTH READY';
  if(b.combinedUpperPendingAt!=null)status+=' · BOLT I FOLLOW-THROUGH';
  if(!touch)status+=' · '+siegeSkillLabel(b,now);
  const tray=biByeCombatView(b,now);
  // Right-click's independent Bolt II belongs to Bolt to the Occasion's
  // primed mechanism. The third Skill cannot pretend RMB will work.
  const heavyHint=(b.skill?.id??'boltToTheOccasion')==='boltToTheOccasion'
    ? ' · RMB prime/fire II (hold both: BOTH)' : '';
  const fireHint=b.sweep?.kind==='single'?'LMB locked during sweep'
    : b.sweep?.kind==='skill'?
      (b.sweep.phase==='settle'?'LMB settling':'LMB stop & fire')
    : 'LMB '+(tray.primary.label==='BOLT I'?'Bolt I':tray.primary.label);
  const controls = touch ? `${view==='clear'?'ZOOM · VIEW to return':view==='sight'?'SIGHT · VIEW ↑ zoom':'SIEGE VIEW · VIEW ↑ zoom'} · ${tray.primary.label} · SWEEP · SKILL${tray.secondary?' · BOTH':''}`
    : `${fireHint} · [${key('siegeSweep')}] Sharp Turn${heavyHint} · [${key('siegeSkill')}] Skill · ${deployment}${focus}[${key('siegeView')}] View · [SHIFT+${key('siegeView')}] CLEAR · [${key('interact')}] Leave`;
  const station=b.mode === 'MOBILE' ? 'MOBILE · UPPER' : b.mode==='RETRACTING'?
    'RETRACTING · UPPER' : b.weaponFocus === 'UPPER' ? 'UPPER / INDEPENDENT' : 'MAIN / COUPLED';
  return { title: `BI-BYE-LLISTA · ${b.health}/${b.maxHealth} · ${touch?station.split(' / ')[0]:station}`, status, controls };
}
