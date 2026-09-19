import { attackMotion } from './spellbladePose.mjs';

export const FIRST_PERSON_WEAPON_SCALE = 0.74;

function defaultHand() {
  return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
}

function transform(x, y, z, rx = 0, ry = 0, rz = 0) {
  return { x, y, z, rx, ry, rz };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function mixTransform(a, b, amount) {
  const t = smooth(amount);
  return transform(
    mix(a.x, b.x, t),
    mix(a.y, b.y, t),
    mix(a.z, b.z, t),
    mix(a.rx, b.rx, t),
    mix(a.ry, b.ry, t),
    mix(a.rz, b.rz, t),
  );
}

const ATTACK_POSES = Object.freeze([
  {
    windupGroup: transform(0.61, -0.45, -1.00, -0.12, 0.16, -0.18),
    cutGroup: transform(0.30, -0.34, -0.98, -0.10, -0.18, 0.08),
    windupSword: transform(0, -0.01, -0.18, -0.18, 0.26, -0.10),
    cutSword: transform(0, -0.01, -0.18, -0.22, -0.48, 0.16),
  },
  {
    windupGroup: transform(0.25, -0.40, -1.00, -0.10, -0.18, 0.12),
    cutGroup: transform(0.55, -0.36, -0.98, -0.12, 0.20, -0.14),
    windupSword: transform(0, -0.01, -0.18, -0.18, -0.28, 0.10),
    cutSword: transform(0, -0.01, -0.18, -0.20, 0.50, -0.16),
  },
  {
    windupGroup: transform(0.44, -0.18, -1.05, -0.16, -0.08, 0.02),
    cutGroup: transform(0.38, -0.40, -1.00, 0.12, -0.12, -0.06),
    windupSword: transform(0, -0.01, -0.18, -0.82, -0.08, 0.04),
    cutSword: transform(0, -0.01, -0.18, 0.36, -0.14, -0.06),
  },
]);

function attackPhase(local) {
  if (local < 0.22) return { name: 'windup', t: local / 0.22 };
  if (local < 0.62) return { name: 'cut', t: (local - 0.22) / 0.40 };
  return { name: 'recover', t: (local - 0.62) / 0.38 };
}

export function castVisualDuration(event, localId, serverNow) {
  if (event?.type !== 'fireballCast' || event.playerId !== localId || !Number.isFinite(serverNow)) return null;
  const castEndsAt = Number.isFinite(event.castEndsAt)
    ? event.castEndsAt
    : (Number.isFinite(event.at) ? event.at + 0.3 : null);
  if (castEndsAt === null) return null;
  const remaining = castEndsAt + 0.06 - serverNow;
  if (remaining <= 0) return null;
  return Math.min(0.36, remaining);
}

export function resolveWeaponPose({
  timeSec,
  movingAmount = 0,
  attackHeld = false,
  attackStartedAt = 0,
  guard = false,
  recoilUntil = 0,
  parryUntil = 0,
  castStartedAt = 0,
  castUntil = 0,
  dashUntil = 0,
}) {
  const idle = Math.sin(timeSec * 2.2) * 0.010;
  const stride = Math.sin(timeSec * 9.2);
  const bob = Math.abs(Math.cos(timeSec * 9.2)) * 0.014 * movingAmount;

  const baseGroup = transform(
    0.50 + idle + stride * 0.010 * movingAmount,
    -0.47 + bob,
    -0.94,
    -0.08,
    -0.10,
    -0.10 + stride * 0.014 * movingAmount,
  );
  const baseSword = transform(0, -0.01, -0.18, 0.34, -0.26, 0.02);
  const baseLeft = transform(-0.42, -0.58 + bob * 0.5, -0.82, -0.28, 0.16, 0.18);

  let group = { ...baseGroup };
  let sword = { ...baseSword };
  let leftHand = { ...baseLeft };
  const rightHand = { ...defaultHand(), rx: 0.04 };
  let magicScale = 0.68;
  let state = 'idle';
  let strike = null;
  let attackPhaseName = null;
  let castPhase = null;

  if (dashUntil > timeSec) {
    state = 'dash';
    group = transform(0.55, -0.64, -0.88, 0.18, -0.26, -0.42);
    sword = transform(0, -0.01, -0.18, 0.08, -0.12, -0.12);
    leftHand = transform(-0.46, -0.67, -0.74, 0.36, 0.10, 0.16);
    magicScale = 0.44;
  } else if (guard) {
    state = 'guard';
    group = transform(0.30, -0.34, -1.00, -0.08, -0.25, 0.10);
    sword = transform(0, -0.02, -0.16, -0.62, -0.18, 0.12);
    leftHand = transform(-0.24, -0.38, -0.90, -0.45, 0.20, -0.10);
    magicScale = 0.46;
  } else if (attackHeld) {
    state = 'attack';
    const motion = attackMotion({ attackStartedAt }, timeSec);
    strike = motion.strike;
    const phase = attackPhase(motion.local);
    attackPhaseName = phase.name;
    const poses = ATTACK_POSES[strike];

    if (phase.name === 'windup') {
      group = mixTransform(baseGroup, poses.windupGroup, phase.t);
      sword = mixTransform(baseSword, poses.windupSword, phase.t);
    } else if (phase.name === 'cut') {
      group = mixTransform(poses.windupGroup, poses.cutGroup, phase.t);
      sword = mixTransform(poses.windupSword, poses.cutSword, phase.t);
    } else {
      group = mixTransform(poses.cutGroup, baseGroup, phase.t);
      sword = mixTransform(poses.cutSword, baseSword, phase.t);
    }

    leftHand = transform(-0.42, -0.54, -0.84, -0.26, 0.14, 0.16);
    magicScale = 0.58;
  } else if (castUntil > timeSec) {
    state = 'cast';
    const inferredStart = castUntil - 0.36;
    const start = Number.isFinite(castStartedAt) && castStartedAt > 0 ? Math.min(castStartedAt, timeSec) : inferredStart;
    const duration = Math.max(0.001, castUntil - start);
    const progress = clamp01((timeSec - start) / duration);

    group = transform(0.60, -0.52, -1.00, 0.06, 0.18, -0.24);
    sword = transform(0, -0.01, -0.18, 0.06, 0.08, -0.10);

    if (progress < 0.35) {
      castPhase = 'gather';
      const t = progress / 0.35;
      leftHand = mixTransform(baseLeft, transform(-0.27, -0.28, -0.80, -0.62, -0.04, 0.22), t);
      magicScale = mix(0.70, 1.00, smooth(t));
    } else if (progress < 0.72) {
      castPhase = 'release';
      const t = (progress - 0.35) / 0.37;
      leftHand = mixTransform(
        transform(-0.27, -0.28, -0.80, -0.62, -0.04, 0.22),
        transform(-0.14, -0.12, -1.04, -0.92, -0.14, 0.18),
        t,
      );
      magicScale = mix(1.00, 1.24, smooth(t));
    } else {
      castPhase = 'recover';
      const t = (progress - 0.72) / 0.28;
      leftHand = mixTransform(
        transform(-0.14, -0.12, -1.04, -0.92, -0.14, 0.18),
        transform(-0.36, -0.46, -0.86, -0.34, 0.10, 0.16),
        t,
      );
      magicScale = mix(1.16, 0.76, smooth(t));
    }
  }

  if (recoilUntil > timeSec) {
    const t = Math.min(1, (recoilUntil - timeSec) / 0.23);
    group.z -= 0.08 * t;
    group.x += 0.12 * t;
    group.rz += 0.44 * t;
    sword.rx += 0.18 * t;
    rightHand.rx += 0.18 * t;
  }

  if (parryUntil > timeSec) {
    const t = Math.min(1, (parryUntil - timeSec) / 0.3);
    group.z -= 0.05 * t;
    group.ry -= 0.18 * t;
    sword.rx -= 0.20 * t;
    leftHand.y += 0.05 * t;
  }

  return {
    state,
    strike,
    attackPhase: attackPhaseName,
    castPhase,
    group,
    sword,
    leftHand,
    rightHand,
    magicScale,
  };
}
