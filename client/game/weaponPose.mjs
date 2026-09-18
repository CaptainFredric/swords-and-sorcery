import { attackMotion } from './spellbladePose.mjs';

function defaultHand() {
  return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
}

export function resolveWeaponPose({
  timeSec,
  movingAmount = 0,
  attackHeld = false,
  attackStartedAt = 0,
  guard = false,
  recoilUntil = 0,
  parryUntil = 0,
  castUntil = 0,
  dashUntil = 0,
}) {
  const idle = Math.sin(timeSec * 2.2) * 0.012;
  const stride = Math.sin(timeSec * 9.2);
  const bob = Math.abs(Math.cos(timeSec * 9.2)) * 0.018 * movingAmount;

  const group = {
    x: 0.48 + idle + stride * 0.012 * movingAmount,
    y: -0.43 + bob,
    z: -0.78,
    rx: -0.1,
    ry: -0.1,
    rz: -0.14 + stride * 0.018 * movingAmount,
  };
  const leftHand = { ...defaultHand(), x: -0.42, y: -0.56 + bob * 0.5, z: -0.64, rx: -0.28, ry: 0.16, rz: 0.18 };
  const rightHand = { ...defaultHand(), x: 0, y: 0, z: 0, rx: 0.04, ry: 0, rz: 0 };
  let magicScale = 0.72;
  let state = 'idle';
  let strike = null;

  if (guard) {
    state = 'guard';
    group.x = 0.1;
    group.y = -0.18;
    group.z = -0.61;
    group.rx = -0.3;
    group.ry = -0.82;
    group.rz = 0.56;
    leftHand.x = -0.08;
    leftHand.y = -0.16;
    leftHand.z = -0.58;
    leftHand.rx = -0.72;
    leftHand.ry = 0.34;
    leftHand.rz = -0.22;
    magicScale = 0.55;
  } else if (attackHeld) {
    state = 'attack';
    const motion = attackMotion({ attackStartedAt }, timeSec);
    strike = motion.strike;
    const swing = motion.swing;
    if (strike === 0) {
      group.x -= swing * 0.5;
      group.y += swing * 0.12;
      group.ry += swing * 0.34;
      group.rz -= swing * 1.18;
    } else if (strike === 1) {
      group.x += swing * 0.34;
      group.y += swing * 0.05;
      group.ry -= swing * 0.27;
      group.rz += swing * 1.16;
    } else {
      group.x -= swing * 0.1;
      group.y += swing * 0.4;
      group.rx -= swing * 1.22;
      group.rz -= swing * 0.32;
    }
    leftHand.y = -0.5;
    magicScale = 0.62;
  } else if (castUntil > timeSec) {
    state = 'cast';
    group.x = 0.64;
    group.y = -0.52;
    group.z = -0.68;
    group.rx = 0.12;
    group.ry = 0.22;
    group.rz = -0.42;
    leftHand.x = -0.18;
    leftHand.y = -0.08;
    leftHand.z = -0.58;
    leftHand.rx = -1.0;
    leftHand.ry = -0.18;
    leftHand.rz = 0.32;
    magicScale = 1.5 + Math.sin(timeSec * 34) * 0.12;
  } else if (dashUntil > timeSec) {
    state = 'dash';
    group.x = 0.56;
    group.y = -0.62;
    group.z = -0.62;
    group.rx = 0.22;
    group.ry = -0.3;
    group.rz = -0.5;
    leftHand.x = -0.48;
    leftHand.y = -0.68;
    leftHand.z = -0.5;
    leftHand.rx = 0.42;
    magicScale = 0.48;
  }

  if (recoilUntil > timeSec) {
    const t = Math.min(1, (recoilUntil - timeSec) / 0.23);
    group.z += 0.3 * t;
    group.x += 0.13 * t;
    group.rz += 0.95 * t;
    rightHand.rx += 0.22 * t;
  }

  if (parryUntil > timeSec) {
    const t = Math.min(1, (parryUntil - timeSec) / 0.3);
    group.z += 0.17 * t;
    group.ry -= 0.72 * t;
    group.rz += 0.18 * t;
    leftHand.y += 0.08 * t;
  }

  return { state, strike, group, leftHand, rightHand, magicScale };
}
