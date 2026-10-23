import { BI_BYE_LLISTA_CONFIG as CONFIG } from '../../shared/sim/biByeLlista.mjs';

// Clip time follows the host clock. A late load, repeated volley, or tab suspension
// therefore shows the current mechanical state instead of restarting an animation.
export function biByeAnimation(b, now) {
  if (b.mode === 'DESTROYED') return { name: '12_BiBye_Damaged_Destroyed', time: Math.min(1.8, Math.max(0, now - (b.destroyedAt ?? now))) };
  if (b.state === 'RELOADING') return { name: '04_BiBye_Mechanical_Reload', time: Math.max(0, now - (b.reloadStartedAt ?? now)) };
  if (b.state === 'FIRING' || b.state === 'SPENT') {
    const elapsed = Math.max(0, now - (b.firedAt ?? now));
    if (elapsed < CONFIG.timing.recoilRecoveryDurationSec) return { name: '02_BiBye_TwoStage_Fire', time: elapsed };
    return { name: '03_BiBye_Spent_Recovery', time: 0 };
  }
  if (b.mobileFiredAt != null && now < b.smallBoltReadyAt) {
    const elapsed = Math.max(0, now - b.mobileFiredAt);
    if (elapsed < .85) return { name: '09_BiBye_Mobile_Shot1_Fire', time: elapsed };
    return { name: '10_BiBye_Mobile_Shot1_Reload', time: (elapsed - .85) * 2.2 / Math.max(.001, b.smallBoltReadyAt - b.mobileFiredAt - .85) };
  }
  return { name: b.mode === 'DEPLOYED' ? '01_BiBye_LoadedIdle' : '06_BiBye_Travel_Ready', time: 0 };
}

export { biByeWheelSteering, biByeWheelTravel } from '../../shared/sim/biByeComponents.mjs';
