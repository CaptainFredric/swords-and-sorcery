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

export function biByeWheelSteering(steer) {
  if (Math.abs(steer) < .001) return [0, 0, 0, 0, 0, 0];
  // Preserve the authored 18 / 10 degree front/rear steering geometry, with
  // distinct inner and outer angles for the shared 4.25 m turning circle.
  const radius = CONFIG.mobility.minTurningRadius / Math.abs(steer);
  const side = Math.sign(steer);
  const angle = (degrees, x) => Math.atan(Math.tan(degrees * Math.PI / 180) * radius / (radius - side * x)) * side;
  return [-angle(18, -1.075), -angle(18, 1.075), 0, 0, angle(10, -1.075), angle(10, 1.075)];
}

export function biByeWheelTravel(previous, current, steering) {
  if (!previous || Math.hypot(current.x - previous.x, current.z - previous.z) > 3) return [0, 0, 0, 0, 0, 0];
  const point = (pose, x, z) => [pose.x - Math.cos(pose.heading) * x - Math.sin(pose.heading) * z,
    pose.z + Math.sin(pose.heading) * x - Math.cos(pose.heading) * z];
  return [[-1.075, 1.2], [1.075, 1.2], [-1.075, -.34], [1.075, -.34], [-1.075, -1.715], [1.075, -1.715]].map(([x, z], index) => {
    const a = point(previous, x, z), b = point(current, x, z);
    const yaw = current.heading + steering[index];
    return (-(b[0] - a[0]) * Math.sin(yaw) - (b[1] - a[1]) * Math.cos(yaw)) / CONFIG.mobility.wheelRadius;
  });
}
