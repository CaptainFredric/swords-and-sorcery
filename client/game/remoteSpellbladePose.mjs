import { attackMotion } from './spellbladePose.mjs';

function euler(x = 0, y = 0, z = 0) {
  return { x, y, z };
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

  if (state === 'run') {
    const phase = localTime * 9.4;
    const step = Math.sin(phase) * speed;
    const lift = Math.abs(Math.cos(phase)) * speed;
    pose.visual.y += lift * 0.025;
    pose.visual.x = 0.06 * speed;
    pose.torso.z = step * 0.045;
    pose.leftThigh.x = step * 0.68;
    pose.rightThigh.x = -step * 0.68;
    pose.leftShin.x = Math.max(0, -step) * 0.55;
    pose.rightShin.x = Math.max(0, step) * 0.55;
    pose.leftUpperArm.x = -step * 0.34;
    pose.rightUpperArm.x = step * 0.26;
    pose.tabardX = -0.14 - speed * 0.08;
  } else if (state === 'air') {
    pose.visual.x = 0.04;
    pose.leftThigh.x = 0.28;
    pose.rightThigh.x = 0.16;
    pose.leftShin.x = -0.55;
    pose.rightShin.x = -0.42;
    pose.leftUpperArm.x = 0.18;
    pose.rightUpperArm.x = 0.1;
    pose.tabardX = -0.2;
  } else if (state === 'guard') {
    pose.torso.y = 0.14;
    pose.head.y = -0.08;
    pose.rightUpperArm.x = -0.5;
    pose.rightUpperArm.z = -0.62;
    pose.rightForearm.x = -1.02;
    pose.rightForearm.z = -0.12;
    pose.leftUpperArm.x = -0.62;
    pose.leftUpperArm.z = 0.32;
    pose.leftForearm.x = -0.38;
    pose.sword.x = -0.38;
    pose.sword.y = -0.18;
    pose.sword.z = -0.72;
    pose.tabardX = -0.06;
  } else if (state === 'attack') {
    const motion = attackMotion(player, serverNow);
    const swing = motion.swing;
    if (motion.strike === 0) {
      pose.torso.y = -0.22 + swing * 0.46;
      pose.rightUpperArm.x = -0.34;
      pose.rightUpperArm.z = -0.58 + swing * 1.42;
      pose.rightForearm.x = -0.42;
      pose.sword.z = -2.12 + swing * 1.58;
    } else if (motion.strike === 1) {
      pose.torso.y = 0.24 - swing * 0.48;
      pose.rightUpperArm.x = -0.26;
      pose.rightUpperArm.z = 0.48 - swing * 1.38;
      pose.rightForearm.x = -0.34;
      pose.sword.z = -1.72 - swing * 1.05;
    } else {
      pose.torso.x = -0.08 + swing * 0.18;
      pose.rightUpperArm.x = -1.35 + swing * 0.78;
      pose.rightUpperArm.z = -0.16;
      pose.rightForearm.x = -0.7;
      pose.sword.x = -0.65 + swing * 1.12;
      pose.sword.z = -1.12;
    }
    pose.leftUpperArm.x = -0.18;
    pose.tabardX = -0.1 - swing * 0.08;
  } else if (state === 'cast') {
    pose.torso.y = -0.18;
    pose.head.y = -0.12;
    pose.leftUpperArm.x = -1.28;
    pose.leftUpperArm.z = 0.14;
    pose.leftForearm.x = -0.22;
    pose.leftForearm.z = -0.08;
    pose.rightUpperArm.x = 0.1;
    pose.magicScale = 1.65 + Math.sin(localTime * 32) * 0.18;
    pose.tabardX = -0.1;
  } else if (state === 'dash') {
    pose.visual.x = -0.25;
    pose.torso.x = -0.12;
    pose.head.x = 0.12;
    pose.leftUpperArm.x = 0.7;
    pose.rightUpperArm.x = 0.62;
    pose.leftThigh.x = -0.16;
    pose.rightThigh.x = 0.34;
    pose.leftShin.x = -0.18;
    pose.rightShin.x = -0.48;
    pose.tabardX = -0.34;
  } else if (state === 'stagger') {
    const jolt = Math.sin(((player?.staggerUntil ?? serverNow) - serverNow) * 24);
    pose.visual.z = 0.16 * jolt;
    pose.torso.x = 0.12;
    pose.head.z = -0.12 * jolt;
    pose.leftUpperArm.z = 0.72;
    pose.rightUpperArm.z = -0.72;
    pose.sword.z = -2.7;
  } else if (state === 'dead') {
    pose.visual.y = -0.32;
    pose.visual.x = 0.08;
    pose.visual.z = 1.34;
    pose.leftUpperArm.z = 0.72;
    pose.rightUpperArm.z = -0.55;
    pose.sword.z = -2.9;
    pose.tabardX = -0.28;
    pose.magicScale = 0.55;
  }

  return pose;
}
