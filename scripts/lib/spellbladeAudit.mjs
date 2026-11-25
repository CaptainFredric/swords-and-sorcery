// The Spellblade's armour, audited the way a player sees it: every key clip posed offline on the shipped model (the
// same sampler as the client, glbPose.mjs), its plates skinned, and two faults looked for that a still in the Armory
// can miss and a playtest finds:
//   tears: an edge of a rigid plate pulled long, because its vertices follow different bones (the breastplate's
//          armpit vertices that went up with the arm; the greaves' seam at the knee);
//   holes: lines of sight that pass clean through the body (the open-sided cuirass under a raised arm, before the
//          core filled it).
// Cloth (the tabards, the cape) is never counted as torn (the client moves it itself) but does count as cover; the
// props (the sword, the flag) are left out.
import { loadGlb, localPose, worldMatrices, multiply, apply } from './glbPose.mjs';
import { readAccessor } from './glbSkin.mjs';

export const AUDIT_CLIPS = Object.freeze(['Idle', 'Run', 'Guard', 'Cast', 'Slash_1', 'Slash_2', 'Slash_3', 'GuardCut_1', 'GuardCut_2', 'GuardCut_3', 'Sunder_Strike', 'Overhead_Raise_Test']);
export const RIGID_MESHES = /^(Boot|Breastplate|Gauntlet|Greave|Helmet|Pauldron|Visor|InnerSkeletonCore)/;
// an edge is torn when it grows by this much (metres) in some frame
export const TEAR = 0.06;
const FRAMES = 10;

// what can block a line of sight: everything worn, the cloth too (not the sword, the palm's rune or the flag)
export const COVER_MESHES = /^(Boot|Breastplate|Gauntlet|Greave|Helmet|Pauldron|Visor|InnerSkeletonCore|Tabard|Crest)/;

function meshParts(model) {
  const { gltf } = model;
  const parts = [];
  for (const node of gltf.nodes) {
    if (node.mesh == null || node.skin == null) continue;
    const mesh = gltf.meshes[node.mesh];
    if (!COVER_MESHES.test(mesh.name)) continue;
    for (const prim of mesh.primitives) {
      const pos = readAccessor(model, prim.attributes.POSITION).data;
      const joints = readAccessor(model, prim.attributes.JOINTS_0).data;
      const weights = readAccessor(model, prim.attributes.WEIGHTS_0).data;
      const index = readAccessor(model, prim.indices).data;
      const seen = new Set(), edges = [];
      for (let t = 0; t < index.length; t += 3) {
        for (const [a, b] of [[index[t], index[t + 1]], [index[t + 1], index[t + 2]], [index[t + 2], index[t]]]) {
          const key = a < b ? a * 1e7 + b : b * 1e7 + a;
          if (seen.has(key)) continue;
          seen.add(key);
          const rest = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
          if (rest > 1e-5) edges.push(a, b, rest);
        }
      }
      parts.push({ mesh: mesh.name, rigid: RIGID_MESHES.test(mesh.name), pos, joints, weights, index, edges });
    }
  }
  return parts;
}

function skin(part, palette) {
  const { pos, joints, weights } = part, n = pos.length / 3, out = new Float32Array(n * 3);
  for (let v = 0; v < n; v += 1) {
    const q = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 4; k += 1) {
      const w = weights[v * 4 + k];
      if (!w) continue;
      const r = apply(palette[joints[v * 4 + k]], q);
      x += r[0] * w; y += r[1] * w; z += r[2] * w;
    }
    out[v * 3] = x; out[v * 3 + 1] = y; out[v * 3 + 2] = z;
  }
  return out;
}

// Möller–Trumbore, both faces: the distance along the ray, or Infinity (a hair of slack at the edges, so a line
// running exactly along a seam between two triangles is not counted as passing between them)
const EDGE = 1e-4;
function hit(o, d, p, a, b, c) {
  const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
  const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
  const hx = d[1] * e2z - d[2] * e2y, hy = d[2] * e2x - d[0] * e2z, hz = d[0] * e2y - d[1] * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-12) return Infinity;
  const f = 1 / det, sx = o[0] - p[a], sy = o[1] - p[a + 1], sz = o[2] - p[a + 2];
  const u = f * (sx * hx + sy * hy + sz * hz);
  if (u < -EDGE || u > 1 + EDGE) return Infinity;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = f * (d[0] * qx + d[1] * qy + d[2] * qz);
  if (v < -EDGE || u + v > 1 + EDGE) return Infinity;
  const t = f * (e2x * qx + e2y * qy + e2z * qz);
  return t > 0 ? t : Infinity;
}

/**
 * Audit a Spellblade GLB. Returns { tears: { "<mesh> <boneA>~<boneB>": { edges, worstCm, clip, time } }, holes: [{ clip,
 * time, rays, through, share }] } — tears grouped by the bones either end of the torn edge, holes as lines of sight
 * through the trunk (between the hips and the shoulders) that touch nothing.
 */
export function auditSpellblade(file, { clips = AUDIT_CLIPS, frames = FRAMES } = {}) {
  const model = loadGlb(file);
  const { gltf } = model, skinDef = gltf.skins[0];
  const names = skinDef.joints.map((j) => gltf.nodes[j].name);
  const ibm = readAccessor(model, skinDef.inverseBindMatrices).data;
  const parts = meshParts(model);
  const nodeOf = (name) => gltf.nodes.findIndex((n) => n.name === name);
  const tears = {}, holes = [];
  for (const clip of clips) {
    const c = model.clips.get(clip);
    if (!c) continue;
    for (let f = 0; f < frames; f += 1) {
      const time = (c.duration * f) / (frames - 1);
      const world = worldMatrices(model, localPose(model, [{ clip, time, weight: 1 }]));
      const palette = skinDef.joints.map((node, k) => multiply(world[node], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
      const posed = parts.map((part) => skin(part, palette));
      // tears
      parts.forEach((part, i) => {
        if (!part.rigid) return;
        const p = posed[i], { edges, joints, weights } = part;
        const owner = (v) => { let best = 0, w = -1; for (let k = 0; k < 4; k += 1) if (weights[v * 4 + k] > w) { w = weights[v * 4 + k]; best = joints[v * 4 + k]; } return names[best]; };
        for (let e = 0; e < edges.length; e += 3) {
          const a = edges[e], b = edges[e + 1];
          const grown = Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]) - edges[e + 2];
          if (grown < TEAR) continue;
          const key = `${part.mesh} ${[owner(a), owner(b)].sort().join('~')}`;
          const row = tears[key] ?? (tears[key] = { edges: 0, worstCm: 0, clip, time: 0 });
          row.edges += 1;
          if (grown * 100 > row.worstCm) Object.assign(row, { worstCm: +(grown * 100).toFixed(1), clip, time: +time.toFixed(2) });
        }
      });
      // holes: lines of sight across the trunk, from all round, level and tilted
      const at = (name) => { const m = world[nodeOf(name)]; return [m[12], m[13], m[14]]; };
      const hips = at('pelvis'), neck = at('neck');
      // (only triangles near the trunk can block a line across it: the rest are skipped)
      const tris = [];
      const lo = Math.min(hips[1], neck[1]) - 0.35, hi = Math.max(hips[1], neck[1]) + 0.35;
      const mid = [(hips[0] + neck[0]) / 2, (hips[2] + neck[2]) / 2];
      parts.forEach((part, i) => {
        const p = posed[i], index = part.index, near = [];
        for (let t = 0; t < index.length; t += 3) {
          const a = index[t] * 3;
          if (p[a + 1] < lo || p[a + 1] > hi || Math.hypot(p[a] - mid[0], p[a + 2] - mid[1]) > 0.75) continue;
          near.push(index[t], index[t + 1], index[t + 2]);
        }
        if (near.length) tris.push([p, near]);
      });
      let rays = 0, through = 0; const lines = [];
      for (let h = 1; h <= 6; h += 1) {
        const s = 0.15 + (0.75 * h) / 7;
        const centre = hips.map((x, k) => x + (neck[k] - x) * s);
        for (let a = 0; a < 16; a += 1) {
          for (const tilt of [-0.75, -0.35, 0, 0.35, 0.75]) {
            const yaw = (2 * Math.PI * a) / 16;
            const d = [Math.cos(yaw), tilt, Math.sin(yaw)], l = Math.hypot(...d);
            const dir = d.map((x) => x / l);
            const origin = centre.map((x, k) => x - dir[k] * 0.8);
            rays += 1;
            let touched = false;
            for (const [p, index] of tris) {
              for (let t = 0; t < index.length && !touched; t += 3) {
                if (hit(origin, dir, p, index[t] * 3, index[t + 1] * 3, index[t + 2] * 3) < 1.6) touched = true;
              }
              if (touched) break;
            }
            if (!touched) { through += 1; lines.push({ from: origin.map((x) => +x.toFixed(3)), dir: dir.map((x) => +x.toFixed(3)) }); }
          }
        }
      }
      if (through) holes.push({ clip, time: +time.toFixed(2), rays, through, share: +(through / rays).toFixed(3), lines });
    }
  }
  return { tears, holes };
}

// the limits the shipped model is held to (client/game/spellbladeModelAudit.test.mjs): each torn seam's edges and worst
// stretch, and how many lines of sight pass through the trunk in all, as recorded with --record
export const AUDIT_BASELINE = new URL('../../client/game/spellbladeModelAudit.baseline.json', import.meta.url);
export function auditBaseline({ tears, holes }) {
  return {
    tears: Object.fromEntries(Object.entries(tears).sort(([a], [b]) => a.localeCompare(b)).map(([k, r]) => [k, { edges: r.edges, worstCm: r.worstCm }])),
    throughTotal: holes.reduce((t, h) => t + h.through, 0),
  };
}
/** What got worse against a baseline: [] when nothing did. */
export function auditRegressions(now, baseline, { edgeSlack = 0.1, cmSlack = 3 } = {}) {
  const worse = [];
  const current = auditBaseline(now);
  for (const [key, row] of Object.entries(current.tears)) {
    const was = baseline.tears[key];
    if (!was) worse.push(`${key}: a new tear (${row.edges} edges, worst ${row.worstCm} cm)`);
    else if (row.edges > was.edges * (1 + edgeSlack) + 20 || row.worstCm > was.worstCm + cmSlack) worse.push(`${key}: ${row.edges} edges, worst ${row.worstCm} cm (was ${was.edges}, ${was.worstCm} cm)`);
  }
  if (current.throughTotal > baseline.throughTotal) worse.push(`lines of sight through the trunk: ${current.throughTotal} (was ${baseline.throughTotal})`);
  return worse;
}
