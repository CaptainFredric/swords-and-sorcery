import { attackMotion } from './spellbladePose.mjs';

function euler(rx = 0, ry = 0, rz = 0) {
  return { rx, ry, rz };
}

export function resolveRemoteSpellbladePose({
  state,
  player,
  serverNow,
  localTime,
}) {
  const velocity = player?.velocity ?? { x: 0, y: 0, z: 0 };
  const speed = Math.min(1, Math.hypot(velocity.x ?? 0, velocity.z ?? 0) / 7.5);
  const breath = Math.sin(localTime * 2.4);

  const pose = {
    visual: { y: breath * 0.008, ...euler() },
    torso: euler(0, 0, breath * 0.008),
    head: euler(),
    leftUpperArm: euler(0, 0, 0.08),
    rightUpperArm: euler(0, 0, -0.08),
    leftForearm: euler(),
    rightForearm: euler(),
    leftThigh: euler(),
    rightThigh: euler(),
    leftShin: euler(),
    rightShin: euler(),
    sword: euler(0.06, 0, -2.42),
    tabardX: -0.03 - speed * 0.05,
    magicScale: 1 + breath * 0.08,
  };

  if (state === 'run' || state === 'sprint') {
    // the fallback rig sprints as a longer, faster, more leaned-in run
    const sprint = state === 'sprint' ? 1 : 0;
    const phase = localTime * (9.4 + 2.4 * sprint);
    const step = Math.sin(phase) * speed * (1 + 0.25 * sprint);
    const lift = Math.abs(Math.cos(phase)) * speed;
    pose.visual.y += lift * (0.025 + 0.012 * sprint);
    pose.visual.rx = 0.06 * speed + 0.12 * sprint;
    pose.torso.rz = step * 0.045;
    pose.leftThigh.rx = step * 0.68;
    pose.rightThigh.rx = -step * 0.68;
    pose.leftShin.rx = Math.max(0, -step) * 0.55;
    pose.rightShin.rx = Math.max(0, step) * 0.55;
    pose.leftUpperArm.rx = -step * 0.34;
    pose.rightUpperArm.rx = step * 0.26;
    pose.tabardX = -0.14 - speed * 0.08;
  } else if (state === 'air') {
    pose.visual.rx = 0.04;
    pose.leftThigh.rx = 0.28;
    pose.rightThigh.rx = 0.16;
    pose.leftShin.rx = -0.55;
    pose.rightShin.rx = -0.42;
    pose.leftUpperArm.rx = 0.18;
    pose.rightUpperArm.rx = 0.1;
    pose.tabardX = -0.2;
  } else if (state === 'guard') {
    pose.torso.ry = 0.14;
    pose.head.ry = -0.08;
    pose.rightUpperArm.rx = -0.5;
    pose.rightUpperArm.rz = -0.62;
    pose.rightForearm.rx = -1.02;
    pose.rightForearm.rz = -0.12;
    pose.leftUpperArm.rx = -0.62;
    pose.leftUpperArm.rz = 0.32;
    pose.leftForearm.rx = -0.38;
    pose.sword.rx = -0.38;
    pose.sword.ry = -0.18;
    pose.sword.rz = -0.72;
    pose.tabardX = -0.06;
  } else if (state === 'attack') {
    const motion = attackMotion(player, serverNow);
    const swing = motion.swing;
    if (motion.strike === 0) {
      pose.torso.ry = -0.22 + swing * 0.46;
      pose.rightUpperArm.rx = -0.34;
      pose.rightUpperArm.rz = -0.58 + swing * 1.42;
      pose.rightForearm.rx = -0.42;
      pose.sword.rz = -2.12 + swing * 1.58;
    } else if (motion.strike === 1) {
      pose.torso.ry = 0.24 - swing * 0.48;
      pose.rightUpperArm.rx = -0.26;
      pose.rightUpperArm.rz = 0.48 - swing * 1.38;
      pose.rightForearm.rx = -0.34;
      pose.sword.rz = -1.72 - swing * 1.05;
    } else {
      pose.torso.rx = -0.08 + swing * 0.18;
      pose.rightUpperArm.rx = -1.35 + swing * 0.78;
      pose.rightUpperArm.rz = -0.16;
      pose.rightForearm.rx = -0.7;
      pose.sword.rx = -0.65 + swing * 1.12;
      pose.sword.rz = -1.12;
    }
    pose.leftUpperArm.rx = -0.18;
    pose.tabardX = -0.1 - swing * 0.08;
  } else if (state === 'cast') {
    pose.torso.ry = -0.18;
    pose.head.ry = -0.12;
    pose.leftUpperArm.rx = -1.28;
    pose.leftUpperArm.rz = 0.14;
    pose.leftForearm.rx = -0.22;
    pose.leftForearm.rz = -0.08;
    pose.rightUpperArm.rx = 0.1;
    pose.magicScale = 1.65 + Math.sin(localTime * 32) * 0.18;
    pose.tabardX = -0.1;
  } else if (state === 'dash') {
    pose.visual.rx = -0.25;
    pose.torso.rx = -0.12;
    pose.head.rx = 0.12;
    pose.leftUpperArm.rx = 0.7;
    pose.rightUpperArm.rx = 0.62;
    pose.leftThigh.rx = -0.16;
    pose.rightThigh.rx = 0.34;
    pose.leftShin.rx = -0.18;
    pose.rightShin.rx = -0.48;
    pose.tabardX = -0.34;
  } else if (state === 'stagger') {
    const jolt = Math.sin(((player?.staggerUntil ?? serverNow) - serverNow) * 24);
    pose.visual.rz = 0.16 * jolt;
    pose.torso.rx = 0.12;
    pose.head.rz = -0.12 * jolt;
    pose.leftUpperArm.rz = 0.72;
    pose.rightUpperArm.rz = -0.72;
    pose.sword.rz = -2.7;
  } else if (state === 'dead') {
    pose.visual.y = -0.32;
    pose.visual.rx = 0.08;
    pose.visual.rz = 1.34;
    pose.leftUpperArm.rz = 0.72;
    pose.rightUpperArm.rz = -0.55;
    pose.sword.rz = -2.9;
    pose.tabardX = -0.28;
    pose.magicScale = 0.55;
  }

  return pose;
}
