import {siegeSkillLabel} from './siegeSkillView.mjs';
import { biByeCondition } from '../../shared/sim/biByeComponents.mjs';
import { keyLabel, registry } from '../settings/settingsRegistry.mjs';
import { BI_BYE_LLISTA_CONFIG } from '../../shared/sim/biByeLlista.mjs';

export function biByeHudView(local, snapshot, now, { bindings = registry.defaultBindings(), touch = false, view = 'third' } = {}) {
  const b = snapshot?.bibyeBallista;
  if (!local?.alive || !b || b.mode === 'DESTROYED') return null;
  const key = action => bindings[action]?.[0] ? keyLabel(bindings[action][0]) : 'UNBOUND';
  if (!local.operatingBallistaId) {
    if (b.operatorId || Math.hypot(b.position.x - local.position.x, b.position.z - local.position.z) > BI_BYE_LLISTA_CONFIG.emplacement.interactRadius) return null;
    return { title: 'BI-BYE-LLISTA', status: touch ? 'Tap MOUNT to operate' : `[${key('interact')}] Operate`, controls: '' };
  }
  const condition = biByeCondition(b);
  const upperReady = b.smallBoltReady ?? (now >= (b.smallBoltReadyAt ?? 0) && !b.upperPending);
  const upper = b.upperQueued ? 'Shot I queued' : upperReady ? 'Shot I ready' : b.upperPending ? 'Shot I releasing' : `Shot I ${Math.max(0,(b.smallBoltReadyAt??now)-now).toFixed(1)}s`;
  const heavy = b.mainBoltLoaded !== false ? 'II ready' : `II ${Math.max(0,(b.reloadEndsAt??now)-now).toFixed(1)}s`;
  const coupling = b.coupling === 'ALIGNING' ? `Aligning ${Math.round((b.couplingProgress??0)*100)}%`
    : b.coupling === 'ENGAGING' ? 'Engaging latch' : b.coupling === 'RELEASING' ? 'Releasing clutch' : b.coupling === 'FIRING' ? 'Volley committed' : '';
  let status = b.mode === 'DEPLOYING' ? 'Deploying outriggers' : b.mode === 'RETRACTING' ? 'Packing outriggers'
    : [upper,b.mode === 'DEPLOYED' || b.mainBoltLoaded === false ? heavy : '',coupling].filter(Boolean).join(' · ');
  if(b.deploymentReason&&now-(b.deploymentRejectedAt??-Infinity)<3)status=b.deploymentReason;
  const faults = [!condition.canDrive ? "IMMOBILIZED" : condition.failedWheels ? "DRIVE IMPAIRED" : "", !condition.canDeploy ? "SUPPORTS DISABLED" : condition.failedStabilizers ? "SUPPORT DAMAGED" : ""].filter(Boolean);
  if(b.aimLimited)status+=' · AIM LIMIT';
  if (faults.length) status += " · " + faults.join(" · ");
  const deployment = condition.canDeploy ? `[${key('deploy')}] ${b.mode === 'DEPLOYED' ? 'Pack' : 'Deploy'} · ` : "";
  const focus = b.mode === 'DEPLOYED' ? `[${key('siegeWeapon')}] ${b.weaponFocus === 'MAIN' ? 'Upper / cancel' : 'Main'} · ` : '';
  status+=' · '+siegeSkillLabel(b,now);
  const controls = touch ? `${view==='clear'?'ZOOM · VIEW to return':view==='sight'?'SIGHT · VIEW ↑ zoom':'SIEGE VIEW · VIEW ↑ zoom'} · ATTACK to fire · SKILL heavy`
    : `[${key('attack')}] Fire · [${key('siegeSkill')}] Heavy Skill · ${deployment}${focus}[${key('siegeView')}] View · [SHIFT+${key('siegeView')}] CLEAR · [${key('interact')}] Leave`;
  return { title: `BI-BYE-LLISTA · ${b.health}/${b.maxHealth} · ${b.mode === 'MOBILE' ? 'MOBILE · UPPER' : b.weaponFocus === 'UPPER' ? 'UPPER / INDEPENDENT' : 'MAIN / COUPLED'}`, status, controls };
}
