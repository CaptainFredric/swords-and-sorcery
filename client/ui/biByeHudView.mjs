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
  let status = b.mode === 'DEPLOYING' ? 'Deploying outriggers' : b.mode === 'RETRACTING' ? 'Packing outriggers'
    : b.state === 'FIRING' ? 'Volley committed' : b.state === 'SPENT' ? 'Recoil recovery'
      : b.state === 'RELOADING' ? `Reloading · ${Math.max(0, (b.reloadEndsAt ?? now) - now).toFixed(1)}s`
        : b.smallBoltReady ? (b.mode === 'DEPLOYED' ? 'Both bolts ready' : 'Shot I ready')
          : `Shot I recocking · ${Math.max(0, (b.smallBoltReadyAt ?? now) - now).toFixed(1)}s`;
  const faults = [!condition.canDrive ? "IMMOBILIZED" : condition.failedWheels ? "DRIVE IMPAIRED" : "", !condition.canDeploy ? "SUPPORTS DISABLED" : condition.failedStabilizers ? "SUPPORT DAMAGED" : ""].filter(Boolean);
  if (faults.length) status += " · " + faults.join(" · ");
  const deployment = condition.canDeploy ? `[${key('deploy')}] ${b.mode === 'DEPLOYED' ? 'Pack' : 'Deploy'} · ` : "";
  const controls = touch ? `${view === 'sight' ? 'SIGHT' : 'SIEGE VIEW'} · ATTACK to fire`
    : `[${key('attack')}] Fire · ${deployment}[${key('siegeView')}] View · [${key('interact')}] Leave`;
  return { title: `BI-BYE-LLISTA · ${b.health}/${b.maxHealth} · ${b.mode === 'MOBILE' ? 'MOBILE' : 'SIEGE'}`, status, controls };
}
