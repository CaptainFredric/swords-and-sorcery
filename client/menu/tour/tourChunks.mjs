// Pure helpers for the tour's props (tourProps.mjs), kept apart from three.js so they can be tested on their own.

// The pieces a knight falls into: each a part of him a smith would make whole (the helm, the cuirass, the hips, each
// pauldron, upper arm, forearm and gauntlet, thigh, greave and boot, the cape, the tabard), whatever bones move it
export function chunkOf(boneName) {
  const name = String(boneName).replace(/[.\s_]/g, '').toLowerCase();
  const side = /l$/.test(name) ? 'L' : /r$/.test(name) ? 'R' : '';
  if (name.startsWith('cape')) return 'cape';
  if (name.startsWith('tabard')) return 'tabard';
  if (name === 'head' || name === 'neck') return 'helm';
  if (name === 'chest' || name === 'spine' || name.startsWith('clavicle')) return 'cuirass';
  if (name.startsWith('pauldron')) return `pauldron${side}`;
  if (name.startsWith('upperarm')) return `arm${side}`;
  if (name.startsWith('forearm') || name.startsWith('hand') || name.startsWith('socket')) return name.startsWith('socketsword') ? 'forearmR' : `forearm${side || 'R'}`;
  if (name.startsWith('thigh')) return `thigh${side}`;
  if (name.startsWith('shin')) return `greave${side}`;
  if (name.startsWith('foot')) return `boot${side}`;
  return 'hips';
}

// a triangle (corners with a = how far along the cut's axis) split at `cut`: [the triangles below it, those above]
export function splitAt(corners, cut) {
  const mixCorner = (a, b, t) => ({
    p: a.p.map((x, k) => x + (b.p[k] - x) * t),
    uv: a.uv && a.uv.map((x, k) => x + (b.uv[k] - x) * t),
    c: a.c && a.c.map((x, k) => x + (b.c[k] - x) * t),
    a: a.a + (b.a - a.a) * t,
  });
  const side = (below) => {
    const out = [];
    for (let i = 0; i < 3; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 3];
      const inA = below ? a.a <= cut : a.a > cut;
      const inB = below ? b.a <= cut : b.a > cut;
      if (inA) out.push(a);
      if (inA !== inB) out.push(mixCorner(a, b, (cut - a.a) / (b.a - a.a)));
    }
    const fan = [];
    for (let i = 1; i + 1 < out.length; i += 1) fan.push([out[0], out[i], out[i + 1]]);
    return fan;
  };
  return [side(true), side(false)];
}
