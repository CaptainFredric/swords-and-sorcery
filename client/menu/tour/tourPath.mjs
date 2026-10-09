// The Spellblade's round of Castleward, behind the front door: from his place on the north green, east along it into
// the meadow, south through the gateway onto the Tourney Field and round it, back out through the gateway, west
// across the green and home. A closed curve through hand-placed points (clear of every wall, well, stall and bale),
// measured along its length so a runner can be placed by distance. Pure: no three.js.
//
// Castleward world space: x east, z north (the keep is to the north), y up. Points are [x, z].

export const TOUR_POINTS = Object.freeze([
  [-1.0, 5.5],    // his place on the north green (the menu's stage)
  [2.0, 7.2],
  [7.5, 7.0],
  [10.8, 3.0],    // south of the meadow's brazier
  [14.5, 0.4],    // the meadow: the first rival waits here
  [15.4, -3.2],
  [13.9, -6.8],   // the gateway (between its posts at x 11.0 and 16.6)
  [13.3, -10.8],
  [12.9, -14.6],  // the Tourney Field: the second
  [15.8, -18.2],
  [19.6, -15.6],  // clear of the pavilion
  [20.6, -11.2],
  [15.2, -8.6],   // back out through the gateway
  [11.0, -4.6],
  [5.2, -4.2],
  [1.2, -4.6],    // the south of the green: the third
  [-3.4, -4.4],
  [-6.4, -1.2],
  [-5.6, 2.8],
  [-3.4, 4.8],
]);

// Catmull-Rom through four points (centripetal enough for these gentle turns when the points are evenly spread)
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map((i) => 0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}

/** The closed path: its length, and where along it (position, heading) any distance lies. */
export function buildTourPath(points = TOUR_POINTS, samplesPerSpan = 24) {
  const n = points.length;
  const samples = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let k = 0; k < samplesPerSpan; k += 1) samples.push(catmull(p0, p1, p2, p3, k / samplesPerSpan));
  }
  samples.push(samples[0]);
  const distances = [0];
  for (let i = 1; i < samples.length; i += 1) {
    distances.push(distances[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
  }
  const length = distances[distances.length - 1];
  // Interpolate the closed curve's heading as well as its position. Segment directions alone
  // introduce a small turn at every sample, including the circuit seam.
  const count = samples.length - 1;
  const tangents = samples.map((_, i) => {
    const before = samples[(i + count - 1) % count];
    const after = samples[(i + 1) % count];
    const dx = after[0] - before[0], dz = after[1] - before[1];
    const norm = Math.hypot(dx, dz) || 1;
    return [dx / norm, dz / norm];
  });

  // the point `distance` along the loop (wrapping), and the way the path runs there (unit [x, z])
  function at(distance) {
    const d = ((distance % length) + length) % length;
    let lo = 0;
    let hi = distances.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (distances[mid] <= d) lo = mid; else hi = mid;
    }
    const span = distances[hi] - distances[lo] || 1;
    const t = (d - distances[lo]) / span;
    const a = samples[lo];
    const b = samples[hi];
    const dx = tangents[lo][0] * (1 - t) + tangents[hi][0] * t;
    const dz = tangents[lo][1] * (1 - t) + tangents[hi][1] * t;
    const norm = Math.hypot(dx, dz) || 1;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dir: [dx / norm, dz / norm] };
  }

  // how far along the loop the path passes closest to a point
  function distanceNear([x, z]) {
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < samples.length; i += 1) {
      const gap = Math.hypot(samples[i][0] - x, samples[i][1] - z);
      if (gap < bestGap) { bestGap = gap; best = distances[i]; }
    }
    return best;
  }

  return { length, at, distanceNear, samples };
}

/** The yaw (about y) that turns a Spellblade (who faces -z in his own frame) to face the world direction [x, z]. */
export function yawFacing([x, z]) {
  return Math.atan2(-x, -z) || 0;
}
