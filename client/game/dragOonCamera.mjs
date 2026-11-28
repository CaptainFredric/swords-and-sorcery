// Third-person and aperture camera solver for DRAG-OON.
// Keeps pillars/walls from bisecting the view, smooths rapid inward pulls and
// gradual outward obstruction recovery, and preserves landing-zone framing in flight.
import { clip } from './deathCam.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function sweptMinDist(reach, pivot, desired, margin = 0.36) {
  const dx = desired[0] - pivot[0];
  const dy = desired[1] - pivot[1];
  const dz = desired[2] - pivot[2];
  const targetDist = Math.hypot(dx, dy, dz);
  if (targetDist < 1e-4) return 0;

  // Probe center ray + small lateral/vertical shoulder rays so masonry pillars or
  // wall corners do not clip across the near frustum edge.
  const lenXZ = Math.hypot(dx, dz) || 1;
  const rx = -dz / lenXZ;
  const rz = dx / lenXZ;
  const probeOffsets = [
    [0, 0, 0],
    [rx * 0.28, 0, rz * 0.28],
    [-rx * 0.28, 0, -rz * 0.28],
    [0, 0.24, 0],
  ];

  let bestDist = targetDist;
  for (const [ox, oy, oz] of probeOffsets) {
    const p = [pivot[0] + ox * 0.5, pivot[1] + oy * 0.5, pivot[2] + oz * 0.5];
    const d = [desired[0] + ox, desired[1] + oy, desired[2] + oz];
    const clipped = clip(reach, p, d, margin);
    const dist = Math.hypot(clipped[0] - p[0], clipped[1] - p[1], clipped[2] - p[2]);
    if (dist < bestDist) bestDist = dist;
  }
  return bestDist;
}

/**
 * Compute desired camera target & smoothed collision distance for DRAG-OON.
 */
export function dragOonCameraTarget({
  reach,
  machine,
  view = 'third',
  role = 'operator',
  sightPose = null,
  paxPose = null,
  yaw = 0,
  pitch = 0,
  previousDist = null,
  dt = 1 / 60,
}) {
  const bx = machine?.x ?? 0;
  const by = machine?.y ?? 0;
  const bz = machine?.z ?? 0;
  const safeReach = reach ?? (() => 1);
  const hullCore = [bx, by + 1.55, bz];

  if (view === 'sight') {
    const p = sightPose?.position
      ? [sightPose.position.x, sightPose.position.y, sightPose.position.z]
      : [bx, by + 2.15, bz];
    return {
      position: clip(safeReach, hullCore, p, 0.18),
      dist: previousDist,
    };
  }

  const airborne = Boolean(!machine?.grounded || machine?.flightLikeHell?.active || machine?.rite?.active);
  const riteActive = Boolean(machine?.rite?.active);

  if (role === 'passenger') {
    const anchor = paxPose?.position
      ? [paxPose.position.x, paxPose.position.y + 0.18, paxPose.position.z]
      : [bx, by + 3.25, bz];
    const cp = Math.cos(clamp(pitch, -0.55, 0.65));
    const maxDist = 2.05;
    const desired = [
      anchor[0] + Math.sin(yaw) * cp * maxDist,
      anchor[1] + Math.sin(clamp(-pitch, -0.45, 0.55)) * maxDist + 0.32,
      anchor[2] + Math.cos(yaw) * cp * maxDist,
    ];
    // Clip both from hull core (so orbit never burrows back through DRAG-OON wall) and from embrasure anchor
    const hullCleared = clip(safeReach, hullCore, desired, 0.28);
    const safePt = clip(safeReach, anchor, hullCleared, 0.22);
    return { position: safePt, dist: null };
  }

  // Operator third-person view: widen during fast airborne/Rite trajectories and raise pivot
  // so downward landing zones stay clearly framed below the chassis.
  const velMag = Math.hypot(machine?.velocity?.x ?? 0, machine?.velocity?.y ?? 0, machine?.velocity?.z ?? 0);
  const pivot = [
    bx,
    by + (riteActive ? 3.25 : airborne ? 3.05 : 2.38),
    bz,
  ];
  const baseDist = riteActive
    ? 10.6 + Math.min(2.2, velMag * 0.08)
    : airborne
      ? 9.1 + Math.min(1.4, velMag * 0.06)
      : 8.1;

  const clampedPitch = clamp(pitch, -0.6, 0.85);
  const cp = Math.cos(clampedPitch);
  const liftOffset = riteActive ? 2.85 : airborne ? 2.35 : 1.35;
  const fullRay = [
    Math.sin(yaw) * cp,
    Math.sin(clamp(-pitch, -0.45, 0.85)) + liftOffset / baseDist,
    Math.cos(yaw) * cp,
  ];
  const rayLen = Math.hypot(fullRay[0], fullRay[1], fullRay[2]) || 1;
  const dir = [fullRay[0] / rayLen, fullRay[1] / rayLen, fullRay[2] / rayLen];
  const desired = [
    pivot[0] + dir[0] * baseDist,
    pivot[1] + dir[1] * baseDist,
    pivot[2] + dir[2] * baseDist,
  ];

  const freeDist = Math.max(1.85, sweptMinDist(safeReach, pivot, desired, 0.36));
  let smoothDist = freeDist;
  if (Number.isFinite(previousDist) && dt > 0) {
    // Fast inward compression when wall appears; smooth gentle outward recovery when clearing pillars
    const rate = freeDist < previousDist ? 22 : 5.5;
    const blend = 1 - Math.exp(-Math.max(0, dt) * rate);
    smoothDist = previousDist + (freeDist - previousDist) * blend;
  }

  return {
    position: [
      pivot[0] + dir[0] * smoothDist,
      pivot[1] + dir[1] * smoothDist,
      pivot[2] + dir[2] * smoothDist,
    ],
    dist: smoothDist,
  };
}
