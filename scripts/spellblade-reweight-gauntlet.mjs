// Rigid gauntlet plates for a Spellblade GLB: the skin-weight fix for the sword arm that crumples into a jagged mass.
//
// The defect (measured: scripts/spellblade-arm-strain.mjs, seen in Castleward: scripts/spellblade-pose-gallery-browser.mjs):
// the gauntlet's hard plates are weighted with soft forearm→hand gradients. The clips bend the sword hand 63-129° from
// its bind pose (Idle 63°, Slash_1 75°, Slash_3 81°, Walk 129°; Guard also twists it 142°), and every plate with a
// gradient shears along it: edges stretch to 5-9x their length and fold to a fifth, the cuff tears into a sliver over
// the hilt and the vambrace opens.
//
// The fix, per connected piece of Gauntlet.L/.R (the mesh, the skeleton and every animation byte stay as they are):
//   - a plate held almost wholly by the forearm (hand share ≤ HAND_LOW) is the forearm's alone (the vambrace, its band);
//   - a plate held mostly by the hand (≥ HAND_HIGH) is the hand's alone (the back of the hand, the knuckle plates);
//   - a plate between them (the wrist cuff, the wrist band) takes ONE share for all its vertices, the piece's own mean:
//     it turns as one plate between the forearm and the fist instead of shearing along its gradient;
//   - a piece with finger or thumb influence keeps it, its forearm share given to the hand (the palm, the lames);
//   - the elbow pieces (elbow cop, upper arm) are left alone: the elbow cops are designed for them.
// Only WEIGHTS_0 (and JOINTS_0 where a slot changes bone) of the two gauntlets change, in place, so the file keeps its
// layout and every other byte.
//
// Why the wrist plates are uniform (measured over all 90 clips, scripts/spellblade-audit/plate-folds.mjs):
//   --wrist uniform (default): no edge past 1.08x; a plate can still fold where a clip twists the wrist beyond any
//                              forearm (Walk, Run, Guard: §3 of the Argon request), but it never tears;
//   --wrist rigid:             0.92-1.08x, but hand.R pivots on the grip ~15 cm past the wrist, so the fist visibly
//                              comes away from the vambrace in Guard and Brake_Stop;
//   --wrist graded:            a smooth ramp still has to span that gap: up to 4.8x in Walk.
//
//   node scripts/spellblade-reweight-gauntlet.mjs <in.glb> <out.glb> [--sides R,L] [--wrist uniform|rigid|graded] [--report]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const HAND_LOW = 0.12;
export const HAND_HIGH = 0.6;

export function reweightGauntlets(bytes, { sides = ['R', 'L'], wrist = 'uniform' } = {}) {
  const out = Buffer.from(bytes);
  const jsonLength = out.readUInt32LE(12);
  const gltf = JSON.parse(out.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const skin = gltf.skins[0];
  const jointName = skin.joints.map((n) => gltf.nodes[n].name);
  const slot = (name) => jointName.indexOf(name);
  // a joint's bind position: the translation of its inverse bind matrix's inverse
  const ibmView = gltf.bufferViews[gltf.accessors[skin.inverseBindMatrices].bufferView];
  const ibmBase = binStart + (ibmView.byteOffset ?? 0) + (gltf.accessors[skin.inverseBindMatrices].byteOffset ?? 0);
  const bindPosition = (k) => {
    const m = Array.from({ length: 16 }, (_, i) => out.readFloatLE(ibmBase + (k * 16 + i) * 4)); // column-major
    // inverse of an affine [A | t]: position = -A^-1 t
    const a = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]], t = [m[12], m[13], m[14]];
    const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
    const inv = [a[4] * a[8] - a[5] * a[7], a[2] * a[7] - a[1] * a[8], a[1] * a[5] - a[2] * a[4],
      a[5] * a[6] - a[3] * a[8], a[0] * a[8] - a[2] * a[6], a[2] * a[3] - a[0] * a[5],
      a[3] * a[7] - a[4] * a[6], a[1] * a[6] - a[0] * a[7], a[0] * a[4] - a[1] * a[3]].map((x) => x / det);
    return [0, 1, 2].map((r) => -(inv[r * 3] * t[0] + inv[r * 3 + 1] * t[1] + inv[r * 3 + 2] * t[2]));
  };
  const report = [];
  for (const side of sides) {
    const mesh = gltf.meshes.find((m) => m.name === `Gauntlet.${side}`);
    if (!mesh) throw new Error(`no Gauntlet.${side}`);
    const forearm = slot(`forearm.${side}`), hand = slot(`hand.${side}`);
    const fingers = new Set(jointName.map((n, i) => (n.endsWith(`.${side}`) && /^(finger|thumb)_/.test(n) ? i : -1)).filter((i) => i >= 0));
    const elbowish = new Set([slot(`elbow.${side}`), slot(`upper_arm.${side}`), slot(`clavicle.${side}`)]);
    for (const prim of mesh.primitives) {
      const view = (k) => { const a = gltf.accessors[prim.attributes[k] ?? prim[k]]; const v = gltf.bufferViews[a.bufferView]; return { a, base: binStart + (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride: v.byteStride }; };
      const P = view('POSITION'), J = view('JOINTS_0'), W = view('WEIGHTS_0');
      if (W.a.componentType !== 5126 || J.a.componentType !== 5123 || W.stride || J.stride) throw new Error('expected packed float weights and ushort joints');
      const ia = gltf.accessors[prim.indices], iv = gltf.bufferViews[ia.bufferView], ibase = binStart + (iv.byteOffset ?? 0) + (ia.byteOffset ?? 0);
      const n = P.a.count;
      const readIndex = (k) => (ia.componentType === 5125 ? out.readUInt32LE(ibase + k * 4) : ia.componentType === 5123 ? out.readUInt16LE(ibase + k * 2) : out.readUInt8(ibase + k));
      const pos = (v, c) => out.readFloatLE(P.base + v * 12 + c * 4);
      const jt = (v, c) => out.readUInt16LE(J.base + v * 8 + c * 2);
      const wt = (v, c) => out.readFloatLE(W.base + v * 16 + c * 4);
      // pieces: connected by triangles, and welded where split vertices share a position
      const parent = Array.from({ length: n }, (_, i) => i);
      const find = (x) => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
      const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
      for (let k = 0; k < ia.count; k += 3) { join(readIndex(k), readIndex(k + 1)); join(readIndex(k + 1), readIndex(k + 2)); }
      const at = new Map();
      for (let v = 0; v < n; v += 1) { const key = `${pos(v, 0).toFixed(5)},${pos(v, 1).toFixed(5)},${pos(v, 2).toFixed(5)}`; if (at.has(key)) join(v, at.get(key)); else at.set(key, v); }
      const pieces = new Map();
      for (let v = 0; v < n; v += 1) { const r = find(v); if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(v); }
      const write = (v, entries) => {
        const sum = entries.reduce((s, [, w]) => s + w, 0);
        const four = [...entries.map(([j, w]) => [j, w / sum]), [0, 0], [0, 0], [0, 0], [0, 0]].slice(0, 4);
        four.forEach(([j, w], c) => { out.writeUInt16LE(w ? j : 0, J.base + v * 8 + c * 2); out.writeFloatLE(w, W.base + v * 16 + c * 4); });
      };
      // the forearm's axis at bind (mesh space is the skin's bind space here: the gauntlets' nodes carry no transform)
      const elbowAt = bindPosition(forearm), wristAt = bindPosition(hand);
      const len = Math.hypot(wristAt[0] - elbowAt[0], wristAt[1] - elbowAt[1], wristAt[2] - elbowAt[2]);
      const axis = [0, 1, 2].map((i) => (wristAt[i] - elbowAt[i]) / len);
      const wristPieces = [];
      for (const verts of pieces.values()) {
        let f = 0, h = 0, fing = 0, elb = 0, other = 0;
        for (const v of verts) for (let c = 0; c < 4; c += 1) {
          const j = jt(v, c), w = wt(v, c);
          if (!w) continue;
          if (j === forearm) f += w; else if (j === hand) h += w; else if (fingers.has(j)) fing += w; else if (elbowish.has(j)) elb += w; else other += w;
        }
        const total = f + h + fing + elb + other;
        if (elb > 0.02 * total || other > 0.02 * total || f + h === 0) continue; // elbow pieces, and anything not forearm/hand
        let rule;
        if (fing > 0.02 * total) {
          rule = 'fingers kept, forearm share to the hand';
          for (const v of verts) {
            const m = new Map();
            for (let c = 0; c < 4; c += 1) { const j = jt(v, c), w = wt(v, c); if (!w) continue; const to = j === forearm ? hand : j; m.set(to, (m.get(to) ?? 0) + w); }
            write(v, [...m].sort((a, b) => b[1] - a[1]));
          }
        } else {
          const share = h / (f + h);
          if (share <= HAND_LOW) { rule = 'forearm'; for (const v of verts) write(v, [[forearm, 1]]); }
          else if (share >= HAND_HIGH) { rule = 'hand'; for (const v of verts) write(v, [[hand, 1]]); }
          else if (wrist === 'uniform') { rule = `one plate, hand ${share.toFixed(2)}`; for (const v of verts) write(v, [[forearm, 1 - share], [hand, share]]); }
          else if (wrist === 'rigid') { rule = `wrist plate, rigid to the ${share < 0.5 ? 'forearm' : 'hand'} (hand share was ${share.toFixed(2)})`; for (const v of verts) write(v, [[share < 0.5 ? forearm : hand, 1]]); }
          else { rule = `wrist bridge, graded along the arm (hand share was ${share.toFixed(2)})`; wristPieces.push(verts); }
        }
        report.push({ mesh: mesh.name, vertices: verts.length, before: { forearm: +(f / total).toFixed(2), hand: +(h / total).toFixed(2), fingers: +(fing / total).toFixed(2) }, rule });
      }
      // The wrist bridge (wrist: 'graded'): the cuff and the wrist band share one smooth ramp along the forearm's axis,
      // forearm at the vambrace's end to hand at the fist. The hand joint sits on the grip, ~15 cm past the wrist, so a
      // bent wrist swings the fist round the grip and opens a gap the bridge must span: spread over the bridge's whole
      // length the stretch is even, not torn into a few edges as the old steep, patchy gradients tore it.
      if (wristPieces.length) {
        const along = (v) => ((pos(v, 0) - elbowAt[0]) * axis[0] + (pos(v, 1) - elbowAt[1]) * axis[1] + (pos(v, 2) - elbowAt[2]) * axis[2]);
        const all = wristPieces.flat();
        const a0 = Math.min(...all.map(along)), a1 = Math.max(...all.map(along));
        for (const v of all) {
          const x = Math.min(1, Math.max(0, (along(v) - a0) / (a1 - a0)));
          const s = x * x * (3 - 2 * x);
          write(v, s <= 1e-4 ? [[forearm, 1]] : s >= 1 - 1e-4 ? [[hand, 1]] : [[forearm, 1 - s], [hand, s]]);
        }
        report.push({ mesh: mesh.name, vertices: all.length, rule: `wrist bridge ramp over ${((a1 - a0) * 100).toFixed(1)} cm of the forearm's axis` });
      }
    }
  }
  return { bytes: out, report };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const [input, output] = args.filter((a) => !a.startsWith('--'));
  const sidesAt = args.indexOf('--sides');
  const sides = sidesAt >= 0 ? args[sidesAt + 1].split(',') : ['R', 'L'];
  const source = readFileSync(input);
  const wristAt = args.indexOf('--wrist');
  const { bytes, report } = reweightGauntlets(source, { sides, wrist: wristAt >= 0 ? args[wristAt + 1] : 'uniform' });
  writeFileSync(output, bytes);
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  console.log(`${input} ${sha(source).slice(0, 12)} -> ${output} ${sha(bytes).slice(0, 12)} (${bytes.length} bytes, unchanged length: ${bytes.length === source.length})`);
  if (args.includes('--report')) for (const r of report) console.log(r.before ? `  ${r.mesh} ${String(r.vertices).padStart(5)} v  forearm ${r.before.forearm} hand ${r.before.hand} fingers ${r.before.fingers}  ->  ${r.rule}` : `  ${r.mesh} ${r.vertices} v  ${r.rule}`);
}
