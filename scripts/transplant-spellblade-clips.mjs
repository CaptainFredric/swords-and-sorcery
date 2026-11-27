#!/usr/bin/env node
// Animation-only transfer of NAMED clips from a donor Spellblade GLB onto the
// production one. Geometry, skins, materials, textures, the cloth joints and
// every clip not named stay byte-for-byte; a named clip that already exists is
// replaced in place, a new one is appended. Channels bind by bone NAME and the
// donor's rest pose must match the production rest pose on every bone it keys.
// The rebuilt BIN keeps only data something still references.
//
// Usage:
//   node scripts/transplant-spellblade-clips.mjs --donor <file.glb> --sha <sha256> \
//     --clips A,B,C [--dir client/assets/characters/spellblade] [--apply]
//     [--edit Clip:trim=0.15:settle=0.6,Other:settle=1.0]
//       trim: drop the clip's first seconds; settle: from that time, ease every bone into
//       the production Idle's first frame by the clip's end (no blade left in the floor);
//       lag: the share of that settle the sword arm waits for the body to rise first;
//       via: pass through that production clip's first frame half-way (e.g. via=Guard)
//   node scripts/transplant-spellblade-clips.mjs --restage-sword-arm Idle --clips A,B [--apply]
//     (the sword arm of production clips re-keyed from another production clip; the rest untouched)
//   node scripts/transplant-spellblade-clips.mjs --seat-prop WhiteFlagProp --clip Death_WhiteFlag_Idle_Loop --time 0.3 [--apply]
//     (a prop rigid to one hand moved, in that hand's frame, so its shaft runs through the curled fingers)
//   node scripts/transplant-spellblade-clips.mjs --reweight-overruns [--apply]
//     (limb-bound vertices lying past the next joint handed on to it: the core's thigh tubes)
//   node scripts/transplant-spellblade-clips.mjs --turn-pauldrons <share> [--apply]   (0 in the shipped model since the playtest of 11-26)
//     (each pauldron turned that share of the way about its shoulder joint onto the arm's line)
//   node scripts/transplant-spellblade-clips.mjs --add-json-meshes tools/blender/characters/spellblade/upper-arm/rerebrace.json [--apply]
//     (meshes made in Blender, each rigid on one bone, in the gauntlet's material)
//   node scripts/transplant-spellblade-clips.mjs --blend-waist [--apply]
//     (the breastplate's waist blended pelvis -> spine -> chest over 27 cm instead of changing hands in 10)
//   node scripts/transplant-spellblade-clips.mjs --blend-collar [--apply]
//     (the collar's column, the helmet's chin, blended chest -> neck -> head so it goes with the helmet)
//   node scripts/transplant-spellblade-clips.mjs --mirror-back [--apply]
//     (the breastplate's front reflected to make his back: replaces the Backplate's geometry)
//   node scripts/transplant-spellblade-clips.mjs --add-backplate [--apply]
//     (a steel backplate made from the core's own back, on its bones: the cuirass had no back)
//   node scripts/transplant-spellblade-clips.mjs --fill-core [--apply]
//     (the chainmail core's torso widened to fill the open-sided cuirass, and the core made dark matte mail)
//   node scripts/transplant-spellblade-clips.mjs --drop-bells [--apply]
//     (the gauntlets' hollow upper-arm flares taken out, with their own material and textures)
//   node scripts/transplant-spellblade-clips.mjs --rebind-strays [--apply]
//     (torso vertices bound to a limb among neighbours that are not given their neighbours' weights)
//   node scripts/transplant-spellblade-clips.mjs --add-couters [--apply]
//     (a faceted couter over each elbow joint, rigid on the elbow bone, in the gauntlet's own steel and bronze)
//   node scripts/transplant-spellblade-clips.mjs --first-person <file.glb> --sha <sha256> [--apply]
//     (a whole first-person model: same joints, sockets, clips and rest pose required)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { loadGlb, localPose, worldMatrices, apply as applyMatrix, multiply } from './lib/glbPose.mjs';

const MAGIC = 0x46546c67, JSON_TYPE = 0x4e4f534a, BIN_TYPE = 0x004e4942;
const align = (n) => (n + 3) & ~3;
const SWORD_ARM = /^(clavicle|upper_arm|forearm|hand|elbow|finger_\w+|thumb_\d)\.R$|^(socket_sword|HeroSword)$/;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };

function glb(file) {
  const raw = readFileSync(file);
  if (raw.readUInt32LE(0) !== MAGIC || raw.readUInt32LE(4) !== 2 || raw.readUInt32LE(8) !== raw.length) throw Error('Invalid GLB: ' + file);
  let doc = null, bin = null, at = 12;
  while (at < raw.length) {
    const n = raw.readUInt32LE(at), type = raw.readUInt32LE(at + 4), data = raw.subarray(at + 8, at + 8 + n);
    if (type === JSON_TYPE) doc = JSON.parse(data.toString('utf8').trim());
    if (type === BIN_TYPE) bin = data;
    at += 8 + n;
  }
  if (!doc || !bin || doc.buffers?.length !== 1 || doc.buffers[0].uri) throw Error('Expected one embedded BIN chunk in ' + file);
  return { doc, bin, raw };
}
function chunk(type, data, pad) {
  const out = Buffer.alloc(8 + align(data.length), pad);
  out.writeUInt32LE(align(data.length), 0); out.writeUInt32LE(type, 4); data.copy(out, 8);
  return out;
}
function encode(doc, bin) {
  const j = chunk(JSON_TYPE, Buffer.from(JSON.stringify(doc)), 0x20), b = chunk(BIN_TYPE, bin, 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(MAGIC, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + j.length + b.length, 8);
  return Buffer.concat([header, j, b]);
}
const byName = (doc) => {
  const map = new Map();
  doc.nodes.forEach((n, i) => { if (n.name) map.set(n.name, map.has(n.name) ? null : i); });
  return map;
};
const near = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= 1e-5);
function restMatches(a, b) {
  for (const [key, def] of [['translation', [0, 0, 0]], ['rotation', [0, 0, 0, 1]], ['scale', [1, 1, 1]]]) {
    if (!near(a[key] ?? def, b[key] ?? def)) return key;
  }
  return null;
}

/** Drop accessors and bufferViews nothing references, and repack the BIN. */
function compact(doc, bin) {
  const usedAcc = new Set();
  for (const m of doc.meshes ?? []) for (const p of m.primitives) {
    Object.values(p.attributes).forEach((i) => usedAcc.add(i));
    if (p.indices !== undefined) usedAcc.add(p.indices);
    for (const t of p.targets ?? []) Object.values(t).forEach((i) => usedAcc.add(i));
  }
  for (const s of doc.skins ?? []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
  for (const a of doc.animations ?? []) for (const s of a.samplers) { usedAcc.add(s.input); usedAcc.add(s.output); }
  const accMap = new Map(), accessors = [];
  doc.accessors.forEach((a, i) => { if (usedAcc.has(i)) accMap.set(i, accessors.push(a) - 1); });
  const usedView = new Set();
  for (const a of accessors) {
    if (a.sparse) throw Error('Sparse accessors are not supported');
    if (a.bufferView !== undefined) usedView.add(a.bufferView);
  }
  for (const img of doc.images ?? []) if (img.bufferView !== undefined) usedView.add(img.bufferView);
  const viewMap = new Map(), views = [], blobs = [];
  let length = 0;
  doc.bufferViews.forEach((v, i) => {
    if (!usedView.has(i)) return;
    const data = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    viewMap.set(i, views.push({ ...v, byteOffset: length }) - 1);
    blobs.push(data, Buffer.alloc(align(data.length) - data.length));
    length += align(data.length);
  });
  for (const a of accessors) if (a.bufferView !== undefined) a.bufferView = viewMap.get(a.bufferView);
  for (const img of doc.images ?? []) if (img.bufferView !== undefined) img.bufferView = viewMap.get(img.bufferView);
  const re = (i) => accMap.get(i);
  for (const m of doc.meshes ?? []) for (const p of m.primitives) {
    for (const k of Object.keys(p.attributes)) p.attributes[k] = re(p.attributes[k]);
    if (p.indices !== undefined) p.indices = re(p.indices);
    for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = re(t[k]);
  }
  for (const s of doc.skins ?? []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = re(s.inverseBindMatrices);
  for (const a of doc.animations ?? []) for (const s of a.samplers) { s.input = re(s.input); s.output = re(s.output); }
  doc.accessors = accessors; doc.bufferViews = views;
  const out = Buffer.concat(blobs);
  doc.buffers[0].byteLength = out.length;
  return out;
}

function transplantClips(baseFile, donorFile, expected, names, edits = {}, fillFrom = 'Idle') {
  const base = glb(baseFile), donor = glb(donorFile);
  if (sha(donor.raw) !== expected) throw Error('Unexpected donor GLB (sha256 ' + sha(donor.raw) + '): ' + donorFile);
  const target = structuredClone(base.doc), source = donor.doc;
  const to = byName(target), from = byName(source);
  const picked = names.map((n) => {
    const a = (source.animations ?? []).find((x) => x.name === n);
    if (!a) throw Error('Donor has no clip ' + n);
    return a;
  });
  // the extra data goes after the production BIN, then compaction repacks it all
  let bin = Buffer.from(base.bin.subarray(0, target.buffers[0].byteLength));
  const pad = align(bin.length) - bin.length;
  const blobs = [bin, Buffer.alloc(pad)];
  let length = bin.length + pad;
  const views = new Map(), accessors = new Map();
  const copyView = (id) => {
    if (views.has(id)) return views.get(id);
    const v = source.bufferViews[id], data = donor.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    const index = target.bufferViews.push({ ...structuredClone(v), buffer: 0, byteOffset: length }) - 1;
    blobs.push(data, Buffer.alloc(align(data.length) - data.length)); length += align(data.length);
    views.set(id, index); return index;
  };
  const copyAccessor = (id) => {
    if (accessors.has(id)) return accessors.get(id);
    const a = structuredClone(source.accessors[id]);
    if (a.sparse || a.bufferView === undefined) throw Error('Unsupported animation accessor');
    a.bufferView = copyView(a.bufferView);
    const index = target.accessors.push(a) - 1;
    accessors.set(id, index); return index;
  };
  // A bone no playing clip keys keeps whatever the last clip left on it (three.js
  // only restores a binding's rest value while some action still binds it). The
  // production clips key a full set; a donor clip keying fewer gets every missing
  // channel of that set as a constant rest key, which is what its author saw.
  const template = target.animations.find((x) => x.name === fillFrom);
  if (!template) throw Error('No template clip ' + fillFrom);
  const fullSet = template.channels.map((c) => [c.target.node, c.target.path]);
  const addConstant = (values, count, type) => {
    const data = Buffer.from(new Float32Array(values).buffer);
    const view = target.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length }) - 1;
    blobs.push(data, Buffer.alloc(align(data.length) - data.length)); length += align(data.length);
    return target.accessors.push({ bufferView: view, componentType: 5126, count, type,
      ...(type === 'SCALAR' ? { min: [Math.min(...values)], max: [Math.max(...values)] } : {}) }) - 1;
  };
  const restOf = (node, path) => {
    const n = target.nodes[node];
    return path === 'rotation' ? n.rotation ?? [0, 0, 0, 1] : path === 'scale' ? n.scale ?? [1, 1, 1] : n.translation ?? [0, 0, 0];
  };
  const floats = (doc, data, id) => {
    const acc = doc.accessors[id], v = doc.bufferViews[acc.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type];
    if (acc.componentType !== 5126 || !n) throw Error('Only float SCALAR/VEC3/VEC4 animation data can be edited');
    const off = (v.byteOffset ?? 0) + (acc.byteOffset ?? 0), stride = v.byteStride ?? n * 4;
    return Array.from({ length: acc.count }, (_, i) => Array.from({ length: n }, (_, c) => data.readFloatLE(off + i * stride + c * 4)));
  };
  const addFloats = (rows, type) => {
    const flat = rows.flat();
    return type === 'SCALAR' ? addConstant(flat, rows.length, 'SCALAR') : addConstant(flat, rows.length, type);
  };
  const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const slerp = (a, b, t) => {
    let d = a.reduce((s, x, i) => s + x * b[i], 0); const bb = d < 0 ? b.map((x) => -x) : b; d = Math.abs(d);
    if (d > 0.9995) { const r = lerp(a, bb, t), l = Math.hypot(...r); return r.map((x) => x / l); }
    const th = Math.acos(d), s = Math.sin(th);
    return a.map((x, i) => x * Math.sin((1 - t) * th) / s + bb[i] * Math.sin(t * th) / s);
  };
  const sample = (times, values, t, rot) => {
    if (t <= times[0]) return values[0];
    const last = times.length - 1;
    if (t >= times[last]) return values[last];
    let i = 0; while (i < last - 1 && t > times[i + 1]) i++;
    const u = (t - times[i]) / (times[i + 1] - times[i]);
    return rot ? slerp(values[i], values[i + 1], u) : lerp(values[i], values[i + 1], u);
  };
  // the production Idle's first frame, per bone and path: where an edited clip settles
  const firstFrame = (clipName, node, path) => {
    const clip = target.animations.find((x) => x.name === clipName);
    if (!clip) throw Error('No production clip ' + clipName);
    for (const c of clip.channels) {
      if (c.target.node !== node || c.target.path !== path) continue;
      return floats(target, base.bin, clip.samplers[c.sampler].output)[0];
    }
    return restOf(node, path);
  };
  const idleValue = (node, path) => firstFrame(fillFrom, node, path);
  const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
  /** Rebuild one channel's keys: drop time before `trim`, then ease into Idle from `settle` to the end. */
  const editChannel = (times, values, node, path, duration, edit) => {
    const rot = path === 'rotation', t0 = edit.trim ?? 0;
    const grid = new Set(times.filter((t) => t >= t0).map((t) => +t.toFixed(5)));
    grid.add(t0); grid.add(duration);
    if (edit.settle !== undefined) for (let t = edit.settle; t < duration; t += 1 / 30) grid.add(+t.toFixed(5));
    const keys = [...grid].sort((x, y) => x - y);
    const goal = idleValue(node, path);
    const out = keys.map((t) => {
      let v = sample(times, values, t, rot);
      if (edit.settle !== undefined && t > edit.settle) {
        // lag: the sword arm waits that share of the settle while the body rises first,
        // so a blade held low is not swung through the floor on the way to Idle
        const span = duration - edit.settle, lag = edit.lag ?? 0;
        const arm = SWORD_ARM.test(target.nodes[node].name ?? '');
        const w = arm ? smooth((t - edit.settle - lag * span) / ((1 - lag) * span))
          : smooth((t - edit.settle) / ((1 - lag) * span || span));
        const mix = rot ? slerp : lerp;
        if (edit.via) {
          // through another production pose first (e.g. Guard: the blade comes up, not through the floor)
          const mid = firstFrame(edit.via, node, path);
          v = w < 0.5 ? mix(v, mid, smooth(w * 2)) : mix(mid, goal, smooth(w * 2 - 1));
        } else v = mix(v, goal, w);
      }
      return v;
    });
    // consecutive rotation keys stay in one hemisphere (the Castleward contract checks it)
    if (rot) for (let i = 1; i < out.length; i++) {
      if (out[i].reduce((d, x, c) => d + x * out[i - 1][c], 0) < 0) out[i] = out[i].map((x) => -x);
    }
    // drop keys linear interpolation already reproduces (0.1 mm / ~0.01 degree)
    const tol = 1e-4;
    const keep = [0];
    // (every key skipped since the last kept one must still be reproduced, not only the newest)
    for (let i = 1; i < keys.length - 1; i++) {
      const a = keep[keep.length - 1];
      for (let k = a + 1; k <= i; k++) {
        const u = (keys[k] - keys[a]) / (keys[i + 1] - keys[a]);
        const guess = rot ? slerp(out[a], out[i + 1], u) : lerp(out[a], out[i + 1], u);
        if (guess.some((x, c) => Math.abs(x - out[k][c]) > tol)) { keep.push(i); break; }
      }
    }
    keep.push(keys.length - 1);
    return { times: keep.map((i) => +(keys[i] - t0).toFixed(5)), values: keep.map((i) => out[i]) };
  };
  // the donor's key-time accessors must carry min/max (glTF requires it; some exporters leave it out)
  const inputRange = (id) => {
    const acc = source.accessors[id];
    if (acc.min && acc.max) return [acc.min[0], acc.max[0]];
    const t = floats(source, donor.bin, id).map((r) => r[0]);
    return [Math.min(...t), Math.max(...t)];
  };
  const report = [];
  for (const a of picked) {
    const edit = edits[a.name];
    if (edit && new Set(a.channels.map((c) => c.sampler)).size !== a.channels.length) throw Error(a.name + ': shared samplers cannot be edited per bone');
    const samplers = a.samplers.map((s) => {
      const input = copyAccessor(s.input), [lo, hi] = inputRange(s.input);
      target.accessors[input].min = [lo]; target.accessors[input].max = [hi];
      return { ...structuredClone(s), input, output: copyAccessor(s.output) };
    });
    const channels = a.channels.map((c) => {
      const name = source.nodes[c.target.node]?.name, node = to.get(name);
      if (from.get(name) === null || !Number.isInteger(node)) throw Error('Cannot safely bind ' + name + ' for ' + a.name);
      const bad = restMatches(source.nodes[c.target.node], target.nodes[node]);
      if (bad) throw Error(`${a.name}: ${name} ${bad} differs at rest between donor and production`);
      return { ...structuredClone(c), target: { ...c.target, node } };
    });
    const keyed = new Set(channels.map((c) => c.target.node + '/' + c.target.path));
    const clipDuration = Math.max(...a.samplers.map((s) => inputRange(s.input)[1]));
    let filled = 0;
    for (const [node, path] of fullSet) {
      if (keyed.has(node + '/' + path)) continue;
      const input = addConstant([0, clipDuration], 2, 'SCALAR');
      let output;
      if (path === 'weights') {
        // morph weights (the book's pages): SCALAR, one value per target per key, at rest
        const mesh = target.meshes[target.nodes[node].mesh];
        const count = mesh.primitives[0].targets?.length ?? 0;
        const rest = mesh.weights ?? new Array(count).fill(0);
        output = addConstant([...rest, ...rest], 2 * count, 'SCALAR');
      } else {
        const rest = restOf(node, path);
        output = addConstant([...rest, ...rest], 2, rest.length === 4 ? 'VEC4' : 'VEC3');
      }
      channels.push({ sampler: samplers.push({ input, output, interpolation: 'LINEAR' }) - 1, target: { node, path } });
      filled++;
    }
    let duration = clipDuration;
    if (edit) {
      // re-key every channel (the donor's and the rest-filled) from decoded data
      channels.forEach((c, i) => {
        if (c.target.path === 'weights') {
          // page flutter keeps its values; only its span follows a trim
          if (i >= a.channels.length && edit.trim) samplers[c.sampler].input = addFloats([[0], [clipDuration - edit.trim]], 'SCALAR');
          return;
        }
        let times, values;
        if (i < a.channels.length) {
          const s = a.samplers[a.channels[i].sampler];
          if ((s.interpolation ?? 'LINEAR') !== 'LINEAR') throw Error(a.name + ': only LINEAR keys can be edited');
          times = floats(source, donor.bin, s.input).map((r) => r[0]);
          values = floats(source, donor.bin, s.output);
        } else {
          const rest = restOf(c.target.node, c.target.path);
          times = [0, clipDuration]; values = [rest, rest];
        }
        const keyed = editChannel(times, values, c.target.node, c.target.path, clipDuration, edit);
        const type = keyed.values[0].length === 4 ? 'VEC4' : 'VEC3';
        samplers[c.sampler] = { interpolation: 'LINEAR', input: addFloats(keyed.times.map((t) => [t]), 'SCALAR'), output: addFloats(keyed.values, type) };
      });
      duration = clipDuration - (edit.trim ?? 0);
    }
    const clip = { ...structuredClone(a), samplers, channels };
    const at = target.animations.findIndex((x) => x.name === a.name);
    if (at >= 0) target.animations[at] = clip; else target.animations.push(clip);
    report.push({ clip: a.name, replaced: at >= 0, channels: channels.length, restFilled: filled, duration: +duration.toFixed(3), ...(edit ? { edit } : {}) });
  }
  bin = compact(target, Buffer.concat(blobs));
  const data = encode(target, bin);
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: target.animations.map((a) => a.name), report };
}

/**
 * Re-stage the sword arm of production clips from another production clip (e.g. Idle): every channel of the right
 * arm, its fingers, the sword socket and the sword is re-keyed at the clip's own key times from the template, at the
 * same time (looped on the template's length). The rest of each clip (body, legs, spell hand) is untouched. For clips
 * whose sword is only carried, where the authored carry drives the blade into the floor or through the boots.
 */
function restageSwordArm(baseFile, templateName, names) {
  const base = glb(baseFile), doc = structuredClone(base.doc);
  const read = (id) => {
    const acc = doc.accessors[id], v = doc.bufferViews[acc.bufferView], n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[acc.type];
    if (acc.componentType !== 5126 || !n) throw Error('Only float animation data can be re-staged');
    const off = (v.byteOffset ?? 0) + (acc.byteOffset ?? 0), stride = v.byteStride ?? n * 4;
    return Array.from({ length: acc.count }, (_, i) => Array.from({ length: n }, (_, c) => base.bin.readFloatLE(off + i * stride + c * 4)));
  };
  const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  const slerp = (a, b, t) => {
    let d = a.reduce((s, x, i) => s + x * b[i], 0); const bb = d < 0 ? b.map((x) => -x) : b; d = Math.abs(d);
    if (d > 0.9995) { const r = lerp(a, bb, t), l = Math.hypot(...r); return r.map((x) => x / l); }
    const th = Math.acos(d), s = Math.sin(th);
    return a.map((x, i) => x * Math.sin((1 - t) * th) / s + bb[i] * Math.sin(t * th) / s);
  };
  const template = doc.animations.find((a) => a.name === templateName);
  if (!template) throw Error('No template clip ' + templateName);
  const tracks = new Map();
  let span = 0;
  for (const c of template.channels) {
    const s = template.samplers[c.sampler], times = read(s.input).map((r) => r[0]);
    span = Math.max(span, times.at(-1));
    tracks.set(c.target.node + '/' + c.target.path, { times, values: read(s.output) });
  }
  const at = (track, t, rot) => {
    const { times, values } = track; t = ((t % span) + span) % span;
    if (t <= times[0]) return values[0];
    if (t >= times.at(-1)) return values.at(-1);
    let i = 0; while (i < times.length - 2 && t > times[i + 1]) i++;
    const u = (t - times[i]) / (times[i + 1] - times[i]);
    return rot ? slerp(values[i], values[i + 1], u) : lerp(values[i], values[i + 1], u);
  };
  const blobs = [base.bin.subarray(0, doc.buffers[0].byteLength)];
  let length = doc.buffers[0].byteLength;
  const pad = align(length) - length; blobs.push(Buffer.alloc(pad)); length += pad;
  const add = (rows, type) => {
    const flat = rows.flat(), data = Buffer.from(new Float32Array(flat).buffer);
    const view = doc.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length }) - 1;
    blobs.push(data, Buffer.alloc(align(data.length) - data.length)); length += align(data.length);
    return doc.accessors.push({ bufferView: view, componentType: 5126, count: rows.length, type,
      ...(type === 'SCALAR' ? { min: [Math.min(...flat)], max: [Math.max(...flat)] } : {}) }) - 1;
  };
  const report = [];
  for (const name of names) {
    const clip = doc.animations.find((a) => a.name === name);
    if (!clip) throw Error('No production clip ' + name);
    let restaged = 0;
    for (const c of clip.channels) {
      const bone = doc.nodes[c.target.node]?.name ?? '';
      if (!SWORD_ARM.test(bone) || c.target.path === 'weights') continue;
      const track = tracks.get(c.target.node + '/' + c.target.path);
      if (!track) continue;
      const s = clip.samplers[c.sampler], times = read(s.input).map((r) => r[0]);
      // a dense enough grid to carry the template's own motion (30 Hz across the clip)
      const grid = [...new Set([...times, ...Array.from({ length: Math.ceil(times.at(-1) * 30) + 1 }, (_, k) => Math.min(times.at(-1), k / 30))])].sort((a, b) => a - b);
      const rot = c.target.path === 'rotation';
      const values = grid.map((t) => at(track, t, rot));
      if (rot) for (let i = 1; i < values.length; i++) if (values[i].reduce((d, x, k) => d + x * values[i - 1][k], 0) < 0) values[i] = values[i].map((x) => -x);
      // only the keys linear interpolation cannot reproduce (0.1 mm / ~0.01 degree), every skipped key checked
      const keep = [0];
      for (let i = 1; i < grid.length - 1; i++) {
        const a = keep.at(-1);
        for (let k = a + 1; k <= i; k++) {
          const u = (grid[k] - grid[a]) / (grid[i + 1] - grid[a]);
          const guess = rot ? slerp(values[a], values[i + 1], u) : lerp(values[a], values[i + 1], u);
          if (guess.some((x, q) => Math.abs(x - values[k][q]) > 1e-4)) { keep.push(i); break; }
        }
      }
      if (grid.length > 1) keep.push(grid.length - 1);
      c.sampler = clip.samplers.push({ interpolation: 'LINEAR', input: add(keep.map((i) => [grid[i]]), 'SCALAR'),
        output: add(keep.map((i) => values[i]), values[0].length === 4 ? 'VEC4' : 'VEC3') }) - 1;
      restaged++;
    }
    // samplers no channel uses any more are dropped, then everything unreferenced is compacted away
    const used = new Set(clip.channels.map((c) => c.sampler)), remap = new Map();
    clip.samplers = clip.samplers.filter((_, i) => used.has(i) && remap.set(i, remap.size));
    for (const c of clip.channels) c.sampler = remap.get(c.sampler);
    report.push({ clip: name, restaged, from: templateName });
  }
  const bin = compact(doc, Buffer.concat(blobs));
  const data = encode(doc, bin);
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report };
}

/**
 * Seat a prop rigidly skinned to one hand (the white flag on hand.L) in that hand's fist: in the named clip at the
 * named time, the prop's shaft (its lowest half-metre) is moved, as one rigid shift in the hand's own frame, so that
 * it passes through the middle of the curled fingers, the fist closed --grip-at (0.12 m) up from its butt. Every clip then holds it there, since it moves only with the hand.
 */
function seatHeldProp(baseFile, meshName, clipName, time, gripAt = 0.12) {
  const base = glb(baseFile), doc = structuredClone(base.doc);
  const model = loadGlb(baseFile), skin = doc.skins[0];
  const node = doc.nodes.find((n) => n.mesh !== undefined && doc.meshes[n.mesh].name === meshName);
  if (!node) throw Error('No mesh ' + meshName);
  const prim = doc.meshes[node.mesh].primitives[0];
  const acc = doc.accessors[prim.attributes.POSITION], view = doc.bufferViews[acc.bufferView];
  const off = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0), stride = view.byteStride ?? 12;
  const jAcc = doc.accessors[prim.attributes.JOINTS_0], wAcc = doc.accessors[prim.attributes.WEIGHTS_0];
  const readAny = (a, i, c) => { const v = doc.bufferViews[a.bufferView], o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), size = { 5121: 1, 5123: 2, 5126: 4 }[a.componentType];
    const at = o + i * (v.byteStride ?? size * 4) + c * size;
    const x = a.componentType === 5126 ? base.bin.readFloatLE(at) : a.componentType === 5123 ? base.bin.readUInt16LE(at) : base.bin.readUInt8(at);
    return a.normalized ? x / (a.componentType === 5121 ? 255 : 65535) : x; };
  const joints = new Set();
  for (let i = 0; i < acc.count; i++) for (let c = 0; c < 4; c++) if (readAny(wAcc, i, c) > 0) joints.add(readAny(jAcc, i, c));
  if (joints.size !== 1) throw Error(meshName + ' is not rigid to one joint');
  const k = [...joints][0], hand = skin.joints[k], handName = doc.nodes[hand].name, side = handName.slice(-2);
  const ibm = Array.from({ length: 16 }, (_, c) => { const a = doc.accessors[skin.inverseBindMatrices], v = doc.bufferViews[a.bufferView];
    return base.bin.readFloatLE((v.byteOffset ?? 0) + (a.byteOffset ?? 0) + (k * 16 + c) * 4); });
  const world = worldMatrices(model, localPose(model, [{ clip: clipName, time, weight: 1 }]));
  const pal = multiply(world[hand], ibm);
  const bindPos = Array.from({ length: acc.count }, (_, i) => [0, 1, 2].map((c) => base.bin.readFloatLE(off + i * stride + c * 4)));
  const posed = bindPos.map((p) => applyMatrix(pal, p));
  // the shaft: its butt is the lowest ring of vertices; its direction is that ring's normal, turned toward the rest
  // of the prop (a cross-section of a pole, whatever the cloth it carries does further up)
  const low = Math.min(...posed.map((p) => p[1]));
  const ring = posed.filter((p) => p[1] <= low + 0.03);
  if (ring.length < 3) throw Error(meshName + ': no butt ring to find its shaft by');
  const p0 = [0, 1, 2].map((c) => ring.reduce((t, p) => t + p[c], 0) / ring.length);
  const sub = (a, b) => a.map((x, i) => x - b[i]), cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const a = ring.reduce((m, p) => (Math.hypot(...sub(p, p0)) > Math.hypot(...sub(m, p0)) ? p : m));
  const b = ring.reduce((m, p) => (Math.hypot(...cross(sub(a, p0), sub(p, p0))) > Math.hypot(...cross(sub(a, p0), sub(m, p0))) ? p : m));
  let n = cross(sub(a, p0), sub(b, p0)); const nl = Math.hypot(...n); n = n.map((x) => x / nl);
  const centre = [0, 1, 2].map((c) => posed.reduce((t, p) => t + p[c], 0) / posed.length);
  const dir = n.reduce((t, x, i) => t + x * (centre[i] - p0[i]), 0) < 0 ? n.map((x) => -x) : n;
  // the fist's hollow: the middle of the curled fingers' middle joints and the thumb's
  const at = (n) => applyMatrix(world[model.byName.get(n)], [0, 0, 0]);
  const pts = ['finger_index_2', 'finger_middle_2', 'finger_ring_2', 'thumb_2'].map((n) => at(n + side));
  const grip = [0, 1, 2].map((c) => pts.reduce((t, p) => t + p[c], 0) / pts.length);
  // the fist closes a hand's width up the shaft from its butt (gripAt metres), the shaft through its hollow
  const held = p0.map((x, i) => x + dir[i] * gripAt), delta = grip.map((x, i) => x - held[i]);
  // the same shift in the bind space the vertices are stored in (the palette's linear part, inverted)
  const m = [[pal[0], pal[4], pal[8]], [pal[1], pal[5], pal[9]], [pal[2], pal[6], pal[10]]];
  const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const inv = [
    [(m[1][1] * m[2][2] - m[1][2] * m[2][1]) / det, (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / det, (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det],
    [(m[1][2] * m[2][0] - m[1][0] * m[2][2]) / det, (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det, (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / det],
    [(m[1][0] * m[2][1] - m[1][1] * m[2][0]) / det, (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / det, (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / det]];
  const dBind = inv.map((row) => row.reduce((t, x, i) => t + x * delta[i], 0));
  const bin = Buffer.from(base.bin);
  const moved = bindPos.map((p) => p.map((x, i) => x + dBind[i]));
  moved.forEach((p, i) => p.forEach((x, c) => bin.writeFloatLE(x, off + i * stride + c * 4)));
  acc.min = [0, 1, 2].map((c) => Math.min(...moved.map((p) => p[c]))); acc.max = [0, 1, 2].map((c) => Math.max(...moved.map((p) => p[c])));
  const data = encode(doc, bin.subarray(0, doc.buffers[0].byteLength));
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name),
    report: [{ mesh: meshName, hand: handName, clip: clipName, time, shiftCm: +(Math.hypot(...delta) * 100).toFixed(1) }] };
}

// Vertices bound to a limb that lie past the joint at its end (measured along the limb from its joint to the next):
// carried rigidly by the limb, they swing out through the next segment's armour whenever the joint bends. The chainmail
// core's thigh tubes ran 20 cm past the knees: the "hollow tube" sticking out of a bent knee. A soft piece (the core)
// is blended across the joint over `band` either side; a plate would be handed to the next segment outright past
// `margin` (the gauntlets' sleeves are not: theirs only look past the elbow along the upper arm, and handing them on
// tore them). Only the named meshes' JOINTS_0/WEIGHTS_0 bytes change.
const REWEIGHTS = Object.freeze([
  { mesh: 'InnerSkeletonCore', limb: 'thigh.L', next: 'shin.L', soft: true },
  { mesh: 'InnerSkeletonCore', limb: 'thigh.R', next: 'shin.R', soft: true },
  { mesh: 'InnerSkeletonCore', limb: 'upper_arm.L', next: 'forearm.L', soft: true },
  { mesh: 'InnerSkeletonCore', limb: 'upper_arm.R', next: 'forearm.R', soft: true },
]);
function reweightOverruns(baseFile, { band = 0.04, margin = 0.02 } = {}) {
  const base = glb(baseFile), doc = structuredClone(base.doc), skin = doc.skins[0];
  const bin = Buffer.from(base.bin);
  const view = (index) => { const a = doc.accessors[index], v = doc.bufferViews[a.bufferView], size = { 5121: 1, 5123: 2, 5126: 4 }[a.componentType];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    return { a, o: (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride: v.byteStride ?? size * n, size }; };
  const get = (x, i, c) => { const at = x.o + i * x.stride + c * x.size; const v = x.a.componentType === 5126 ? bin.readFloatLE(at) : x.a.componentType === 5123 ? bin.readUInt16LE(at) : bin.readUInt8(at);
    return x.a.normalized ? v / (x.a.componentType === 5121 ? 255 : 65535) : v; };
  const set = (x, i, c, value) => { const at = x.o + i * x.stride + c * x.size;
    if (x.a.componentType === 5126) bin.writeFloatLE(value, at);
    else if (x.a.componentType === 5123) bin.writeUInt16LE(x.a.normalized ? Math.round(value * 65535) : value, at);
    else bin.writeUInt8(x.a.normalized ? Math.round(value * 255) : value, at); };
  // the joints where the skin was bound (each inverse bind matrix's translation, inverted)
  const ibm = view(skin.inverseBindMatrices);
  const bound = (name) => { const k = skin.joints.findIndex((j) => doc.nodes[j].name === name); if (k < 0) throw Error('No joint ' + name);
    const m = Array.from({ length: 16 }, (_, c) => bin.readFloatLE(ibm.o + k * 64 + c * 4));
    return { k, at: [0, 1, 2].map((r) => -(m[r * 4] * m[12] + m[r * 4 + 1] * m[13] + m[r * 4 + 2] * m[14])) }; };
  const report = [];
  for (const spec of REWEIGHTS) {
    const mesh = doc.meshes.find((m) => m.name === spec.mesh);
    if (!mesh) throw Error('No mesh ' + spec.mesh);
    const limb = bound(spec.limb), next = bound(spec.next);
    // the limb runs from its own joint to the next; for a forearm or shin, past where it starts is beyond the joint
    const axis = next.at.map((x, i) => x - limb.at[i]), length = Math.hypot(...axis), u = axis.map((x) => x / length);
    let moved = 0, most = 0;
    for (const prim of mesh.primitives) {
      const P = view(prim.attributes.POSITION), J = view(prim.attributes.JOINTS_0), W = view(prim.attributes.WEIGHTS_0);
      for (let i = 0; i < P.a.count; i += 1) {
        const slots = [0, 1, 2, 3].map((c) => ({ j: get(J, i, c), w: get(W, i, c) }));
        const own = slots.reduce((t, s) => t + (s.j === limb.k ? s.w : 0), 0);
        if (own < 0.5) continue;
        const p = [0, 1, 2].map((c) => bin.readFloatLE(P.o + i * P.stride + c * 4));
        const past = p.reduce((t, x, c) => t + (x - limb.at[c]) * u[c], 0) - length;
        const share = spec.soft ? Math.max(0, Math.min(1, (past + band) / (2 * band))) : past > margin ? 1 : 0;
        if (share <= 0) continue;
        // the limb's weight handed (all, or the blend's share of it) to the next segment
        const give = own * share;
        const keep = slots.map((s) => (s.j === limb.k ? { j: s.j, w: s.w * (1 - share) } : s)).filter((s) => s.w > 1e-4 && s.j !== next.k);
        const already = slots.reduce((t, s) => t + (s.j === next.k ? s.w : 0), 0);
        const out = [...keep, { j: next.k, w: already + give }].sort((a, b) => b.w - a.w).slice(0, 4);
        const sum = out.reduce((t, s) => t + s.w, 0);
        for (let c = 0; c < 4; c += 1) { const s = out[c]; set(J, i, c, s ? s.j : 0); set(W, i, c, s ? s.w / sum : 0); }
        moved += 1; most = Math.max(most, past);
      }
    }
    report.push({ mesh: spec.mesh, from: spec.limb, to: spec.next, vertices: moved, furthestCm: +(most * 100).toFixed(1) });
  }
  const data = encode(doc, bin.subarray(0, doc.buffers[0].byteLength));
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report };
}

// Strays: torso vertices bound wholly to an arm's bone among neighbours bound to the chest. The breastplate has eight
// (six right, two left) on its flanks at armpit height bound to the upper arm: an arm raised overhead dragged each up
// with it, slivers half a metre long from the cuirass to the arm. And a strip down each side of the chest under the
// shoulder (51 right, 42 left) is bound to the pauldron, which turns most of the way with a raised arm: the cuirass's
// side tore 20 cm open against the chest beside it. A cuirass stays with the chest while the pauldron lifts over it.
// Each is given its neighbours' weights instead (repeated, so a stray beside a stray takes them second-hand).
const STRAYS = Object.freeze([
  { mesh: 'Breastplate', limbs: /^(upper_arm|forearm|hand|pauldron)\.[LR]$/ },
  // (and the collar's top ring, 72 vertices up inside the helmet bound wholly to the head among chest-bound neighbours:
  // a head tipped forward drew them out of the collar into a dark open "maw" under the helmet's jaw, edges 15 cm long)
  { mesh: 'Breastplate', limbs: /^head$/ },
]);
function rebindStrays(baseFile) {
  const base = glb(baseFile), doc = structuredClone(base.doc), skin = doc.skins[0];
  const bin = Buffer.from(base.bin);
  const view = (index) => { const a = doc.accessors[index], v = doc.bufferViews[a.bufferView], size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    return { a, o: (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride: v.byteStride ?? size * n, size }; };
  const get = (x, i, c) => { const at = x.o + i * x.stride + c * x.size;
    const v = x.a.componentType === 5126 ? bin.readFloatLE(at) : x.a.componentType === 5125 ? bin.readUInt32LE(at) : x.a.componentType === 5123 ? bin.readUInt16LE(at) : bin.readUInt8(at);
    return x.a.normalized ? v / (x.a.componentType === 5121 ? 255 : 65535) : v; };
  const set = (x, i, c, value) => { const at = x.o + i * x.stride + c * x.size;
    if (x.a.componentType === 5126) bin.writeFloatLE(value, at);
    else if (x.a.componentType === 5123) bin.writeUInt16LE(x.a.normalized ? Math.round(value * 65535) : value, at);
    else bin.writeUInt8(x.a.normalized ? Math.round(value * 255) : value, at); };
  const names = skin.joints.map((j) => doc.nodes[j].name);
  const report = [];
  for (const spec of STRAYS) {
    const mesh = doc.meshes.find((m) => m.name === spec.mesh);
    if (!mesh) throw Error('No mesh ' + spec.mesh);
    let fixed = 0;
    for (const prim of mesh.primitives) {
      const J = view(prim.attributes.JOINTS_0), W = view(prim.attributes.WEIGHTS_0), I = view(prim.indices);
      const slots = (i) => [0, 1, 2, 3].map((c) => ({ j: get(J, i, c), w: get(W, i, c) })).filter((s) => s.w > 0);
      const limbShare = (i) => slots(i).reduce((t, s) => t + (spec.limbs.test(names[s.j]) ? s.w : 0), 0);
      const near = new Map();
      for (let t = 0; t < I.a.count; t += 3) {
        const tri = [get(I, t, 0), get(I, t + 1, 0), get(I, t + 2, 0)];
        for (const a of tri) for (const b of tri) if (a !== b) (near.get(a) ?? near.set(a, new Set()).get(a)).add(b);
      }
      let strays = [...near.keys()].filter((i) => limbShare(i) > 0.5);
      for (let pass = 0; pass < 64 && strays.length; pass += 1) {
        const left = [];
        for (const i of strays) {
          const from = [...near.get(i)].filter((u) => limbShare(u) <= 0.5);
          if (!from.length) { left.push(i); continue; }
          const sum = new Map();
          for (const u of from) for (const s of slots(u)) sum.set(s.j, (sum.get(s.j) ?? 0) + s.w / from.length);
          const out = [...sum].map(([j, w]) => ({ j, w })).sort((a, b) => b.w - a.w).slice(0, 4);
          const total = out.reduce((t, s) => t + s.w, 0);
          for (let c = 0; c < 4; c += 1) { set(J, i, c, out[c] ? out[c].j : 0); set(W, i, c, out[c] ? out[c].w / total : 0); }
          fixed += 1;
        }
        strays = left;
      }
      if (strays.length) throw Error(`${spec.mesh}: ${strays.length} strays with no bound neighbour`);
    }
    report.push({ mesh: spec.mesh, vertices: fixed });
  }
  const data = encode(doc, bin.subarray(0, doc.buffers[0].byteLength));
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report };
}

// The bells: each gauntlet's second part (its own material, SpellbladeLeftGauntlet2: 1,225 vertices right, 1,128 left)
// is a wide hollow flare on the upper arm, set to one side of the bone. At rest it lies buried inside the other plates
// and adds nothing; with the arm raised (the sword arm in Slash_3, the GuardCuts, the Chivalry guard) its open mouth
// faces out, a ragged dark ring where the upper arm should be. The gauntlet's first part already carries the upper
// arm's banded plates, so the bells are taken out, and their material and its three textures with them.
const BELLS = Object.freeze({ meshes: ['Gauntlet.L', 'Gauntlet.R'], material: 'SpellbladeLeftGauntlet2' });
function dropBells(baseFile, spec = BELLS) {
  const base = glb(baseFile), doc = structuredClone(base.doc);
  const material = doc.materials.findIndex((m) => m.name === spec.material);
  if (material < 0) throw Error('No material ' + spec.material);
  const report = [];
  for (const name of spec.meshes) {
    const mesh = doc.meshes.find((m) => m.name === name);
    if (!mesh) throw Error('No mesh ' + name);
    const keep = mesh.primitives.filter((p) => p.material !== material);
    if (keep.length === mesh.primitives.length) throw Error(`${name} has no ${spec.material} part`);
    if (!keep.length) throw Error(`${name} would be left empty`);
    report.push({ mesh: name, removedVertices: mesh.primitives.filter((p) => p.material === material).reduce((t, p) => t + doc.accessors[p.attributes.POSITION].count, 0) });
    mesh.primitives = keep;
  }
  // the material, then whatever textures and images only it used, renumbered out
  const usesMaterial = doc.meshes.some((m) => m.primitives.some((p) => p.material === material));
  if (!usesMaterial) {
    const textureRefs = (node, visit) => {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (/Texture$/.test(key) && value && typeof value.index === 'number') visit(value);
        else textureRefs(value, visit);
      }
    };
    const gone = doc.materials[material];
    doc.materials.splice(material, 1);
    for (const m of doc.meshes) for (const p of m.primitives) if (p.material > material) p.material -= 1;
    const dropped = new Set(); textureRefs(gone, (ref) => dropped.add(ref.index));
    const stillUsed = new Set(); for (const m of doc.materials) textureRefs(m, (ref) => stillUsed.add(ref.index));
    const removeTextures = [...dropped].filter((t) => !stillUsed.has(t)).sort((a, b) => b - a);
    const removeImages = new Set(removeTextures.map((t) => doc.textures[t].source));
    for (const t of removeTextures) doc.textures.splice(t, 1);
    for (const m of doc.materials) textureRefs(m, (ref) => { ref.index -= removeTextures.filter((t) => t < ref.index).length; });
    for (const t of doc.textures) if (removeImages.has(t.source)) removeImages.delete(t.source);
    const images = [...removeImages].sort((a, b) => b - a);
    for (const i of images) doc.images.splice(i, 1);
    for (const t of doc.textures) t.source -= images.filter((i) => i < t.source).length;
    report.push({ material: spec.material, textures: removeTextures.length, images: images.length });
  }
  const bin = compact(doc, base.bin);
  const data = encode(doc, bin);
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report };
}

// The chainmail core under the cuirass: the breastplate is open down each side, and the core's torso tube (on the spine
// and chest) is narrower than it, so with an arm raised the armhole looked straight through the body to the ground
// behind, round the edge of a flat grey slab of core. The torso tube is widened to fill the cuirass from inside (it
// stays hidden at rest), and the core is made matte and dark, so what shows in the armhole, and at the knees and
// elbows, reads as mail in shadow, not as a grey panel.
const CORE_FILL = Object.freeze({ mesh: 'InnerSkeletonCore', material: 'InnerChainmailCore', bones: ['spine', 'chest'], widen: [1.45, 1.25], shade: 0.25, metallic: 0.05, roughness: 1 });
function fillCore(baseFile, spec = CORE_FILL) {
  const base = glb(baseFile), doc = structuredClone(base.doc), skin = doc.skins[0], bin = Buffer.from(base.bin);
  const mesh = doc.meshes.find((m) => m.name === spec.mesh);
  if (!mesh) throw Error('No mesh ' + spec.mesh);
  const names = skin.joints.map((j) => doc.nodes[j].name);
  const view = (index) => { const a = doc.accessors[index], v = doc.bufferViews[a.bufferView];
    const n = { VEC3: 3, VEC4: 4 }[a.type], size = { 5121: 1, 5123: 2, 5126: 4 }[a.componentType];
    return { a, o: (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride: v.byteStride ?? size * n, size }; };
  const get = (x, i, c) => { const at = x.o + i * x.stride + c * x.size;
    return x.a.componentType === 5126 ? bin.readFloatLE(at) : x.a.componentType === 5123 ? bin.readUInt16LE(at) : bin.readUInt8(at); };
  const report = [];
  for (const prim of mesh.primitives) {
    const P = view(prim.attributes.POSITION), J = view(prim.attributes.JOINTS_0), W = view(prim.attributes.WEIGHTS_0);
    const torso = [];
    for (let i = 0; i < P.a.count; i += 1) {
      const w = [0, 1, 2, 3].map((c) => get(W, i, c));
      if (spec.bones.includes(names[get(J, i, w.indexOf(Math.max(...w)))])) torso.push(i);
    }
    if (!torso.length) continue;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const i of torso) for (let c = 0; c < 3; c += 1) { const x = get(P, i, c); lo[c] = Math.min(lo[c], x); hi[c] = Math.max(hi[c], x); }
    const centre = [(lo[0] + hi[0]) / 2, 0, (lo[2] + hi[2]) / 2];
    for (const i of torso) for (const [c, k] of [[0, spec.widen[0]], [2, spec.widen[1]]]) {
      bin.writeFloatLE(centre[c] + (get(P, i, c) - centre[c]) * k, P.o + i * P.stride + c * 4);
    }
    // (the accessor's bounds follow)
    const min = [0, 1, 2].map((c) => Math.min(...Array.from({ length: P.a.count }, (_, i) => get(P, i, c))));
    const max = [0, 1, 2].map((c) => Math.max(...Array.from({ length: P.a.count }, (_, i) => get(P, i, c))));
    P.a.min = min; P.a.max = max;
    report.push({ mesh: spec.mesh, widened: torso.length });
  }
  const material = doc.materials.find((m) => m.name === spec.material);
  if (!material) throw Error('No material ' + spec.material);
  const pbr = material.pbrMetallicRoughness ?? (material.pbrMetallicRoughness = {});
  const was = pbr.baseColorFactor ?? [1, 1, 1, 1];
  pbr.baseColorFactor = [...was.slice(0, 3).map((x) => +(x * spec.shade).toFixed(4)), was[3]];
  pbr.metallicFactor = spec.metallic; pbr.roughnessFactor = spec.roughness;
  report.push({ material: spec.material, baseColor: pbr.baseColorFactor });
  const data = encode(doc, bin.subarray(0, doc.buffers[0].byteLength));
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report };
}

// The upper arm (tools/blender/characters/spellblade/upper-arm): the supplied pauldrons were modelled for an arm hanging
// straight down (each one's middle 15 cm below its shoulder joint, directly under it), while the rig's arms slant 30-40
// degrees out of them; the upper arm itself had nothing but the hollow bell #557 took out, so a raised sword arm's
// forearm hung in the air from the Armory's camera. Designed in Blender against renders of the game's own poses
// (lab.py, with the game's pauldron rule): each pauldron turned three quarters of the way about its shoulder joint toward the arm's line
// (rigid on its own bone, so it moves exactly as before, only sitting truer), and a plated rerebrace tube along each
// upper arm, rigid on it, from under the pauldron into the couter (rerebrace.json, written by export.py). The game's
// pauldron follow is raised to match (pauldronFollow.mjs).
function turnPauldrons(baseFile, share = 0.5) {
  const base = glb(baseFile), doc = structuredClone(base.doc), skin = doc.skins[0];
  const bin = Buffer.from(base.bin);
  const ibm = (() => { const a = doc.accessors[skin.inverseBindMatrices], v = doc.bufferViews[a.bufferView]; return (v.byteOffset ?? 0) + (a.byteOffset ?? 0); })();
  const bound = (name) => { const k = skin.joints.findIndex((j) => doc.nodes[j].name === name); if (k < 0) throw Error('No joint ' + name);
    const m = Array.from({ length: 16 }, (_, c) => bin.readFloatLE(ibm + k * 64 + c * 4));
    return [0, 1, 2].map((r) => -(m[r * 4] * m[12] + m[r * 4 + 1] * m[13] + m[r * 4 + 2] * m[14])); };
  const vec3 = (index) => { const a = doc.accessors[index], v = doc.bufferViews[a.bufferView];
    return { a, o: (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride: v.byteStride ?? 12 }; };
  const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const report = [];
  for (const side of ['L', 'R']) {
    const mesh = doc.meshes.find((m) => m.name === `Pauldron.${side}`);
    if (!mesh) throw Error('No mesh Pauldron.' + side);
    const joint = bound(`upper_arm.${side}`), elbow = bound(`forearm.${side}`);
    let sum = [0, 0, 0], n = 0;
    for (const prim of mesh.primitives) { const P = vec3(prim.attributes.POSITION);
      for (let i = 0; i < P.a.count; i += 1) { for (let c = 0; c < 3; c += 1) sum[c] += bin.readFloatLE(P.o + i * P.stride + c * 4); n += 1; } }
    const from = unit(sum.map((x, c) => x / n - joint[c])), to = unit(elbow.map((x, c) => x - joint[c]));
    // the shortest turn from the pauldron's middle onto the arm's line, `share` of the way, about the shoulder joint
    const axis = unit([from[1] * to[2] - from[2] * to[1], from[2] * to[0] - from[0] * to[2], from[0] * to[1] - from[1] * to[0]]);
    const angle = Math.acos(Math.max(-1, Math.min(1, from.reduce((t, x, c) => t + x * to[c], 0)))) * share;
    const [x, y, z] = axis, cs = Math.cos(angle), sn = Math.sin(angle), t = 1 - cs;
    const R = [[t * x * x + cs, t * x * y - sn * z, t * x * z + sn * y], [t * x * y + sn * z, t * y * y + cs, t * y * z - sn * x], [t * x * z - sn * y, t * y * z + sn * x, t * z * z + cs]];
    const turn = (v) => [0, 1, 2].map((r) => R[r][0] * v[0] + R[r][1] * v[1] + R[r][2] * v[2]);
    for (const prim of mesh.primitives) {
      for (const [key, about] of [['POSITION', joint], ['NORMAL', null]]) {
        if (prim.attributes[key] === undefined) continue;
        const A = vec3(prim.attributes[key]);
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < A.a.count; i += 1) {
          const v = [0, 1, 2].map((c) => bin.readFloatLE(A.o + i * A.stride + c * 4));
          const w = about ? turn(v.map((q, c) => q - about[c])).map((q, c) => q + about[c]) : turn(v);
          w.forEach((q, c) => { bin.writeFloatLE(q, A.o + i * A.stride + c * 4); lo[c] = Math.min(lo[c], q); hi[c] = Math.max(hi[c], q); });
        }
        if (key === 'POSITION') { A.a.min = lo; A.a.max = hi; }
      }
    }
    report.push({ mesh: `Pauldron.${side}`, turnedDeg: +((angle * 180) / Math.PI).toFixed(1) });
  }
  const data = encode(doc, bin.subarray(0, doc.buffers[0].byteLength));
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report };
}

// Meshes made elsewhere (in Blender: rerebrace.json), each rigid on one bone, drawn with the gauntlet's material.
function addJsonMeshes(baseFile, file, material = 'SpellbladeLeftGauntlet1') {
  const base = glb(baseFile), doc = structuredClone(base.doc), skin = doc.skins[0];
  const parts = Object.values(JSON.parse(readFileSync(file, 'utf8')));
  const mat = doc.materials.findIndex((m) => m.name === material);
  if (mat < 0) throw Error('No material ' + material);
  const rig = doc.nodes.findIndex((n) => n.name === 'SpellbladeRig');
  let bin = Buffer.from(base.bin.subarray(0, doc.buffers[0].byteLength));
  const append = (data, target) => {
    bin = Buffer.concat([bin, Buffer.alloc(align(bin.length) - bin.length)]);
    doc.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: data.length, target });
    bin = Buffer.concat([bin, data]);
    return doc.bufferViews.length - 1;
  };
  const accessor = (arr, componentType, type, count, extra = {}) =>
    doc.accessors.push({ bufferView: append(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), extra.target), componentType, count, type, ...(extra.min ? { min: extra.min, max: extra.max } : {}) }) - 1;
  const report = [];
  for (const part of parts) {
    if (doc.meshes.some((m) => m.name === part.name)) throw Error('The model already has ' + part.name);
    const k = skin.joints.findIndex((j) => doc.nodes[j].name === part.bone);
    if (k < 0) throw Error('No joint ' + part.bone);
    const count = part.position.length / 3;
    const min = [0, 1, 2].map((c) => Math.min(...part.position.filter((_, i) => i % 3 === c)));
    const max = [0, 1, 2].map((c) => Math.max(...part.position.filter((_, i) => i % 3 === c)));
    const joints = new Uint8Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      // (per-vertex bones when the part has them: [[bone, weight], ...], else all on its one bone)
      const own = part.weights?.[i]?.length ? part.weights[i] : [[part.bone, 1]];
      const total = own.reduce((t, [, w]) => t + w, 0);
      own.slice(0, 4).forEach(([bone, w], c) => {
        const j = skin.joints.findIndex((n) => doc.nodes[n].name === bone);
        if (j < 0) throw Error('No joint ' + bone);
        joints[i * 4 + c] = j; weights[i * 4 + c] = w / total;
      });
    }
    const primitive = {
      attributes: {
        POSITION: accessor(new Float32Array(part.position), 5126, 'VEC3', count, { min, max, target: 34962 }),
        NORMAL: accessor(new Float32Array(part.normal), 5126, 'VEC3', count, { target: 34962 }),
        TEXCOORD_0: accessor(new Float32Array(part.uv), 5126, 'VEC2', count, { target: 34962 }),
        JOINTS_0: accessor(joints, 5121, 'VEC4', count, { target: 34962 }),
        WEIGHTS_0: accessor(weights, 5126, 'VEC4', count, { target: 34962 }),
      },
      indices: accessor(new Uint16Array(part.index), 5123, 'SCALAR', part.index.length, { target: 34963 }),
      material: mat,
    };
    doc.meshes.push({ name: part.name, primitives: [primitive] });
    doc.nodes.push({ name: part.name, mesh: doc.meshes.length - 1, skin: 0 });
    doc.nodes[rig].children.push(doc.nodes.length - 1);
    report.push({ mesh: part.name, bone: part.bone, vertices: count, triangles: part.index.length / 3 });
  }
  bin = Buffer.concat([bin, Buffer.alloc(align(bin.length) - bin.length)]);
  doc.buffers[0].byteLength = bin.length;
  const data = encode(doc, bin);
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report };
}

// The breastplate's waist: rigid on the chest above 1.25 m and on the pelvis below 1.15 m, it changed hands within
// those 10 cm, so every turn of the trunk (a forehand winding up, a Sunder) folded the plate in and out right there.
// Blended instead over the whole waist, pelvis to spine to chest (Bernstein weights: a smooth curve through the spine's
// own joint), the same turn is spread over 27 cm and the plate bends a little rather than pinching.
const WAIST = Object.freeze({ mesh: 'Breastplate', from: 1.08, to: 1.35, bones: ['pelvis', 'spine', 'chest'] });
// The collar's column is the helmet's chin: the breastplate rises up the neck into the face plate under the visor's
// eye slit, and was bound to the chest while the rest of the helmet rides the head, so a head tipped forward (a cast,
// a Sunder) pulled the chin away from the brow into a stretched, open "maw". Blended chest -> neck -> head up the
// column (within `radius` of the neck), the chin goes with the helmet and the bend sits low in the collar, under the
// scarf.
const COLLAR = Object.freeze({ mesh: 'Breastplate', from: 1.48, to: 1.60, bones: ['chest', 'neck', 'head'], radius: 0.2 });
function blendWaist(baseFile, spec = WAIST) {
  // (any vertical blend of one mesh across three bones, lowest to highest: the waist, the collar)
  const base = glb(baseFile), doc = structuredClone(base.doc), skin = doc.skins[0], bin = Buffer.from(base.bin);
  const names = skin.joints.map((j) => doc.nodes[j].name);
  const k = (name) => { const i = names.indexOf(name); if (i < 0) throw Error('No joint ' + name); return i; };
  const [pelvis, spine, chest] = spec.bones.map(k);
  const neckAt = (() => { const a = doc.accessors[skin.inverseBindMatrices], v = doc.bufferViews[a.bufferView], o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + spine * 64;
    const m = Array.from({ length: 16 }, (_, c) => base.bin.readFloatLE(o + c * 4)); return [0, 1, 2].map((r) => -(m[r * 4] * m[12] + m[r * 4 + 1] * m[13] + m[r * 4 + 2] * m[14])); })();
  const view = (index) => { const a = doc.accessors[index], v = doc.bufferViews[a.bufferView], size = { 5121: 1, 5123: 2, 5126: 4 }[a.componentType];
    const n = { VEC3: 3, VEC4: 4 }[a.type]; return { a, o: (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride: v.byteStride ?? size * n, size }; };
  const get = (x, i, c) => { const at = x.o + i * x.stride + c * x.size;
    const val = x.a.componentType === 5126 ? bin.readFloatLE(at) : x.a.componentType === 5123 ? bin.readUInt16LE(at) : bin.readUInt8(at);
    return x.a.normalized ? val / (x.a.componentType === 5121 ? 255 : 65535) : val; };
  const set = (x, i, c, value) => { const at = x.o + i * x.stride + c * x.size;
    if (x.a.componentType === 5126) bin.writeFloatLE(value, at);
    else if (x.a.componentType === 5123) bin.writeUInt16LE(x.a.normalized ? Math.round(value * 65535) : value, at);
    else bin.writeUInt8(x.a.normalized ? Math.round(value * 255) : value, at); };
  const mesh = doc.meshes.find((m) => m.name === spec.mesh);
  if (!mesh) throw Error('No mesh ' + spec.mesh);
  let moved = 0;
  for (const prim of mesh.primitives) {
    const P = view(prim.attributes.POSITION), J = view(prim.attributes.JOINTS_0), W = view(prim.attributes.WEIGHTS_0);
    for (let i = 0; i < P.a.count; i += 1) {
      const y = get(P, i, 1);
      if (y < spec.from || (y > spec.to && !spec.radius)) continue;
      if (spec.radius && Math.hypot(get(P, i, 0) - neckAt[0], get(P, i, 2) - neckAt[2]) > spec.radius) continue;
      // only the trunk's own vertices (none that also follow a leg or an arm)
      const slots = [0, 1, 2, 3].map((c) => ({ j: get(J, i, c), w: get(W, i, c) })).filter((s) => s.w > 0);
      if (slots.some((s) => ![pelvis, spine, chest].includes(s.j))) continue;
      const t = Math.min(1, (y - spec.from) / (spec.to - spec.from));
      const out = [[pelvis, (1 - t) ** 2], [spine, 2 * t * (1 - t)], [chest, t ** 2]].sort((a, b) => b[1] - a[1]);
      for (let c = 0; c < 4; c += 1) { set(J, i, c, out[c] ? out[c][0] : 0); set(W, i, c, out[c] ? out[c][1] : 0); }
      moved += 1;
    }
  }
  const data = encode(doc, bin.subarray(0, doc.buffers[0].byteLength));
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report: [{ mesh: spec.mesh, blended: moved }] };
}

// A backplate: the supplied cuirass is a front and sides only, and behind it there was nothing but the dark chainmail
// core, so whenever the cape swung off his back (running, turning, the Armory's spin) it showed a black void from the
// collar to the belt (playtest: "a huge cavity there"). The plate is made from the core's own back (its torso faces
// turned to the back, between `from` and `to` metres up), set `offset` outside it, each vertex keeping the core's
// bones and weights so it moves exactly as the torso does, drawn in the plates' steel with a bronze band at `bands`.
const BACKPLATE = Object.freeze({ source: 'InnerSkeletonCore', name: 'Backplate', from: 1.04, to: 1.64, facing: -0.1, offset: 0.02,
  // (the cuirass's own steel, so the back matches the front; the bands in the gauntlets' bronze)
  material: 'Helmet Steel', steel: [0.4341, 0.3013], bandMaterial: 'SpellbladeLeftGauntlet1', bronze: [0.2311, 0.9848],
  bands: Object.freeze([[1.04, 1.1], [1.56, 1.64]]) });
function addBackplate(baseFile, spec = BACKPLATE) {
  const base = glb(baseFile), doc = structuredClone(base.doc), bin0 = base.bin;
  if (doc.meshes.some((m) => m.name === spec.name)) throw Error('The model already has ' + spec.name);
  const SIZE = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }, COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const read = (index) => { const a = doc.accessors[index], v = doc.bufferViews[a.bufferView], n = COUNT[a.type], size = SIZE[a.componentType];
    const o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? n * size;
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (_, c) => { const at = o + i * stride + c * size;
      const x = a.componentType === 5126 ? bin0.readFloatLE(at) : size === 4 ? bin0.readUInt32LE(at) : size === 2 ? bin0.readUInt16LE(at) : bin0.readUInt8(at);
      return a.normalized ? x / (size === 1 ? 255 : 65535) : x; })); };
  const core = doc.meshes.find((m) => m.name === spec.source);
  if (!core) throw Error('No mesh ' + spec.source);
  const prim = core.primitives[0];
  const P = read(prim.attributes.POSITION), J = read(prim.attributes.JOINTS_0), W = read(prim.attributes.WEIGHTS_0), I = read(prim.indices).map((x) => x[0]);
  const sub = (a, b) => a.map((x, i) => x - b[i]), unit = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // the core's own vertex normals (averaged over its faces, welded by position), to set the plate off along
  const key = (p) => p.map((x) => x.toFixed(4)).join(',');
  const normals = new Map();
  const faces = [];
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    let n = unit(cross(sub(P[b], P[a]), sub(P[c], P[a])));
    const centre = [0, 1, 2].map((k) => (P[a][k] + P[b][k] + P[c][k]) / 3);
    // (outward: away from the torso's own axis)
    if (n[0] * centre[0] + n[2] * (centre[2] + 0.02) < 0) n = n.map((x) => -x);
    faces.push({ a, b, c, n, centre });
    for (const v of [a, b, c]) { const k = key(P[v]); const acc = normals.get(k) ?? [0, 0, 0]; normals.set(k, acc.map((x, i) => x + n[i])); }
  }
  const parts = [{ banded: false }, { banded: true }].map((p) => ({ ...p, pos: [], nrm: [], uv: [], joints: [], weights: [], index: [] }));
  const bandAt = (y) => spec.bands.some(([lo, hi]) => y >= lo && y <= hi);
  for (const f of faces) {
    if (f.centre[1] < spec.from || f.centre[1] > spec.to || f.n[2] < spec.facing) continue;
    const part = parts[bandAt(f.centre[1]) ? 1 : 0];
    const texel = part.banded ? spec.bronze : spec.steel;
    const first = part.pos.length / 3;
    for (const v of [f.a, f.b, f.c]) {
      const out = unit(normals.get(key(P[v])));
      part.pos.push(...P[v].map((x, i) => x + out[i] * spec.offset));
      part.nrm.push(...f.n); part.uv.push(...texel); part.joints.push(...J[v]); part.weights.push(...W[v]);
    }
    part.index.push(first, first + 1, first + 2);
  }
  if (!parts[0].index.length) throw Error('No back faces found on ' + spec.source);
  const rig = doc.nodes.findIndex((n) => n.name === 'SpellbladeRig');
  let bin = Buffer.from(bin0.subarray(0, doc.buffers[0].byteLength));
  const append = (data, target) => { bin = Buffer.concat([bin, Buffer.alloc(align(bin.length) - bin.length)]);
    doc.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: data.length, target }); bin = Buffer.concat([bin, data]); return doc.bufferViews.length - 1; };
  const accessor = (arr, componentType, type, count, extra = {}) =>
    doc.accessors.push({ bufferView: append(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), extra.target ?? 34962), componentType, count, type, ...(extra.min ? { min: extra.min, max: extra.max } : {}) }) - 1;
  const primitives = parts.filter((p) => p.index.length).map((p) => {
    const material = doc.materials.findIndex((m) => m.name === (p.banded ? spec.bandMaterial : spec.material));
    if (material < 0) throw Error('No material for the backplate');
    const count = p.pos.length / 3;
    const min = [0, 1, 2].map((c) => Math.min(...p.pos.filter((_, i) => i % 3 === c))), max = [0, 1, 2].map((c) => Math.max(...p.pos.filter((_, i) => i % 3 === c)));
    return { attributes: {
      POSITION: accessor(new Float32Array(p.pos), 5126, 'VEC3', count, { min, max }),
      NORMAL: accessor(new Float32Array(p.nrm), 5126, 'VEC3', count),
      TEXCOORD_0: accessor(new Float32Array(p.uv), 5126, 'VEC2', count),
      JOINTS_0: accessor(new Uint8Array(p.joints), 5121, 'VEC4', count),
      WEIGHTS_0: accessor(new Float32Array(p.weights), 5126, 'VEC4', count),
    }, indices: accessor(new Uint16Array(p.index), 5123, 'SCALAR', p.index.length, { target: 34963 }), material };
  });
  doc.meshes.push({ name: spec.name, primitives });
  doc.nodes.push({ name: spec.name, mesh: doc.meshes.length - 1, skin: 0 });
  doc.nodes[rig].children.push(doc.nodes.length - 1);
  bin = Buffer.concat([bin, Buffer.alloc(align(bin.length) - bin.length)]);
  doc.buffers[0].byteLength = bin.length;
  const data = encode(doc, bin);
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report: [{ mesh: spec.name, triangles: parts.reduce((t, p) => t + p.index.length / 3, 0) }] };
}

// The back made from the front (playtest: "why didn't you nearly mirror from the front?"): the breastplate's
// front-facing faces over the chest (y between `from` and `to`, facing forward by at least `facing`) reflected through
// the torso's middle (z = the chest joint's), winding reversed, each vertex keeping its bones and weights and texture,
// so the back is the same shaped, trimmed and ridged plate. It replaces the Backplate mesh's geometry (#575's plate
// from the core) in place, or is added as Backplate.
// widen: [top, bottom, factor]: below `top` the plate is let out sideways toward `factor` at `bottom` (a back is
// protected whole; only the front tapers to the waist)
const MIRROR_BACK = Object.freeze({ source: 'Breastplate', name: 'Backplate', from: 1.12, to: 1.63, facing: 0.25, maxX: 0.24, push: 0.012,
  // Below `repaint.below`, the front's dark side panels (either side of its lighter plastron, which narrows in a V to
  // the belt) are painted in the plastron's steel: on the back the dark panels read as a taper. The plate's shape,
  // its gold trim and the plastron stay as they are. The scarf's pointed tail, which hung down the back like a bib,
  // is painted the same below `repaint.scarf`. Faces by colour: tools/blender/characters/spellblade/backplate/faces.json.
  repaint: Object.freeze({ below: 1.44, scarf: 1.46, plate: Object.freeze([0.1397, 0.5742]),
    faces: 'tools/blender/characters/spellblade/backplate/faces.json' }) });
function mirrorBack(baseFile, spec = MIRROR_BACK) {
  const base = glb(baseFile), doc = structuredClone(base.doc), bin0 = base.bin, skin = doc.skins[0];
  const SIZE = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }, COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const read = (index) => { const a = doc.accessors[index], v = doc.bufferViews[a.bufferView], n = COUNT[a.type], size = SIZE[a.componentType];
    const o = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? n * size;
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (_, c) => { const at = o + i * stride + c * size;
      const x = a.componentType === 5126 ? bin0.readFloatLE(at) : size === 4 ? bin0.readUInt32LE(at) : size === 2 ? bin0.readUInt16LE(at) : bin0.readUInt8(at);
      return a.normalized ? x / (size === 1 ? 255 : 65535) : x; })); };
  const ibm = read(skin.inverseBindMatrices);
  const chest = skin.joints.findIndex((j) => doc.nodes[j].name === 'chest'), m = ibm[chest];
  const cz = -(m[2] * m[12] + m[6] * m[13] + m[10] * m[14]);
  const src = doc.meshes.find((x) => x.name === spec.source);
  if (!src) throw Error('No mesh ' + spec.source);
  let bin = Buffer.from(bin0.subarray(0, doc.buffers[0].byteLength));
  const append = (data, target) => { bin = Buffer.concat([bin, Buffer.alloc(align(bin.length) - bin.length)]);
    doc.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: data.length, target }); bin = Buffer.concat([bin, data]); return doc.bufferViews.length - 1; };
  const accessor = (arr, componentType, type, count, extra = {}) =>
    doc.accessors.push({ bufferView: append(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), extra.target ?? 34962), componentType, count, type, ...(extra.min ? { min: extra.min, max: extra.max } : {}) }) - 1;
  const primitives = [];
  let triangles = 0;
  const classes = spec.repaint ? (() => { const f = JSON.parse(readFileSync(resolve(spec.repaint.faces), 'utf8')); return { dark: new Set(f.dark), red: new Set(f.red) }; })() : null;
  for (const [primIndex, prim] of src.primitives.entries()) {
    const P = read(prim.attributes.POSITION), N = read(prim.attributes.NORMAL), T = read(prim.attributes.TEXCOORD_0), J = read(prim.attributes.JOINTS_0), Wt = read(prim.attributes.WEIGHTS_0), I = read(prim.indices).map((x) => x[0]);
    const pos = [], nrm = [], uv = [], joints = [], weights = [], index = [], remap = new Map();
    for (let t = 0; t < I.length; t += 3) {
      const tri = [I[t], I[t + 1], I[t + 2]];
      const c = [0, 1, 2].map((k) => tri.reduce((acc, v) => acc + P[v][k], 0) / 3);
      const n = [0, 1, 2].map((k) => tri.reduce((acc, v) => acc + N[v][k], 0) / 3);
      if (c[1] < spec.from || c[1] > spec.to || Math.abs(c[0]) > spec.maxX || -n[2] < spec.facing || c[2] > cz) continue;
      const face = t / 3, re = spec.repaint;
      const paint = re && primIndex === 0 && ((c[1] < re.below && classes.dark.has(face)) || (c[1] < re.scarf && classes.red.has(face)));
      if (paint) {
        const first = pos.length / 3;
        for (const v of [tri[0], tri[2], tri[1]]) { pos.push(P[v][0], P[v][1], 2 * cz - P[v][2] + spec.push); nrm.push(N[v][0], N[v][1], -N[v][2]); uv.push(...re.plate); joints.push(...J[v]); weights.push(...Wt[v]); }
        index.push(first, first + 1, first + 2);
        continue;
      }
      const out = [];
      for (const v of tri) {
        if (!remap.has(v)) {
          remap.set(v, pos.length / 3);
          pos.push(P[v][0], P[v][1], 2 * cz - P[v][2] + spec.push);
          nrm.push(N[v][0], N[v][1], -N[v][2]); uv.push(...T[v]); joints.push(...J[v]); weights.push(...Wt[v]);
        }
        out.push(remap.get(v));
      }
      index.push(out[0], out[2], out[1]);
    }
    if (!index.length) continue;
    triangles += index.length / 3;
    const count = pos.length / 3;
    const min = [0, 1, 2].map((k) => Math.min(...pos.filter((_, i) => i % 3 === k))), max = [0, 1, 2].map((k) => Math.max(...pos.filter((_, i) => i % 3 === k)));
    primitives.push({ attributes: {
      POSITION: accessor(new Float32Array(pos), 5126, 'VEC3', count, { min, max }),
      NORMAL: accessor(new Float32Array(nrm), 5126, 'VEC3', count),
      TEXCOORD_0: accessor(new Float32Array(uv), 5126, 'VEC2', count),
      JOINTS_0: accessor(new Uint8Array(joints), 5121, 'VEC4', count),
      WEIGHTS_0: accessor(new Float32Array(weights), 5126, 'VEC4', count),
    }, indices: accessor(count > 65535 ? new Uint32Array(index) : new Uint16Array(index), count > 65535 ? 5125 : 5123, 'SCALAR', index.length, { target: 34963 }), material: prim.material });
  }
  if (!primitives.length) throw Error('No front faces found on ' + spec.source);
  const existing = doc.meshes.find((x) => x.name === spec.name);
  if (existing) existing.primitives = primitives;
  else {
    doc.meshes.push({ name: spec.name, primitives });
    doc.nodes.push({ name: spec.name, mesh: doc.meshes.length - 1, skin: 0 });
    doc.nodes[doc.nodes.findIndex((n) => n.name === 'SpellbladeRig')].children.push(doc.nodes.length - 1);
  }
  doc.buffers[0].byteLength = bin.length;
  const data = encode(doc, compact(doc, bin));
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report: [{ mesh: spec.name, triangles, mirrorZ: +cz.toFixed(3) }] };
}

// A couter for each elbow: a faceted cop centred on the joint, rigid on the elbow bone (which the animator turns half
// as far as the forearm). The supplied gauntlets leave the joint open: the upper-arm plate ends in a wide bell to one
// side of the bone and the vambrace starts a hand's breadth down the forearm, with only a 5 cm neck between them, so
// a bent arm showed a hole. A ball about the joint's own centre stays over the joint at any bend. It is drawn with
// the gauntlet's own material, its faces sampling two flat texels of that atlas: a light plate steel (the vambrace's
// darkest steel read as a black ball in the game's light) and the vambrace's bronze band, so it lights as the plates
// beside it.
const COUTER = Object.freeze({
  material: 'SpellbladeLeftGauntlet1',
  steel: [0.5518, 0.7393],
  bronze: [0.2311, 0.9848],
  radius: 0.072,       // across the joint (the vambrace's top is 8.7 cm, its neck 5)
  length: 0.078,       // along the forearm, each way from the joint
  band: 11,            // degrees either side of the equator in bronze, standing proud by `lip`
  lip: 1.07,
  segments: 10,
  // each side's cop: the bone it rides, the joint it is centred on and the next one along, and its mesh's name
  part: (side) => ({ bone: `elbow.${side}`, centre: `forearm.${side}`, toward: `hand.${side}`, name: `Gauntlet.${side}.Couter` }),
});
function addCouters(baseFile, spec = COUTER) {
  const base = glb(baseFile), doc = structuredClone(base.doc), skin = doc.skins[0];
  if (doc.meshes.some((m) => m.name === spec.part('L').name || m.name === spec.part('R').name)) throw Error('The model already has ' + spec.part('L').name);
  const view = (index) => { const a = doc.accessors[index], v = doc.bufferViews[a.bufferView];
    return { a, o: (v.byteOffset ?? 0) + (a.byteOffset ?? 0) }; };
  const ibm = view(skin.inverseBindMatrices);
  const bound = (name) => { const k = skin.joints.findIndex((j) => doc.nodes[j].name === name); if (k < 0) throw Error('No joint ' + name);
    const m = Array.from({ length: 16 }, (_, c) => base.bin.readFloatLE(ibm.o + k * 64 + c * 4));
    return { k, at: [0, 1, 2].map((r) => -(m[r * 4] * m[12] + m[r * 4 + 1] * m[13] + m[r * 4 + 2] * m[14])) }; };
  const material = doc.materials.findIndex((m) => m.name === spec.material);
  if (material < 0) throw Error('No material ' + spec.material);
  const rig = doc.nodes.findIndex((n) => n.name === 'SpellbladeRig');
  const sub = (a, b) => a.map((x, i) => x - b[i]), unit = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let bin = Buffer.from(base.bin.subarray(0, doc.buffers[0].byteLength));
  const append = (data, target) => {
    bin = Buffer.concat([bin, Buffer.alloc(align(bin.length) - bin.length)]);
    doc.bufferViews.push({ buffer: 0, byteOffset: bin.length, byteLength: data.length, ...(target ? { target } : {}) });
    bin = Buffer.concat([bin, data]);
    return doc.bufferViews.length - 1;
  };
  const accessor = (data, componentType, type, count, extra = {}) =>
    doc.accessors.push({ bufferView: append(Buffer.from(data.buffer, data.byteOffset, data.byteLength), extra.target), componentType, count, type,
      ...(extra.min ? { min: extra.min, max: extra.max } : {}) }) - 1;
  const report = [];
  for (const side of ['L', 'R']) {
    const part = spec.part(side);
    const elbow = bound(part.bone), joint = bound(part.centre).at, hand = bound(part.toward).at;
    const along = unit(sub(hand, joint));
    const across = unit(cross(along, Math.abs(along[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), round = cross(along, across);
    // rings from the shoulder-side pole (-90°) to the hand-side pole (+90°), the band about the equator
    const lats = spec.band ? [-90, -62, -38, -spec.band, spec.band, 38, 62, 90] : [-90, -62, -38, -12, 12, 38, 62, 90];
    const point = (lat, k, lip = 1) => {
      const t = (lat * Math.PI) / 180, f = (2 * Math.PI * k) / spec.segments;
      const r = Math.cos(t) * spec.radius * lip, a = Math.sin(t) * spec.length;
      return [0, 1, 2].map((c) => joint[c] + along[c] * a + (across[c] * Math.cos(f) + round[c] * Math.sin(f)) * r);
    };
    const pos = [], nrm = [], uv = [], tri = [];
    const face = (pts, texel) => {
      const n = unit(cross(sub(pts[1], pts[0]), sub(pts[pts.length - 1], pts[0])));
      const centre = [0, 1, 2].map((c) => pts.reduce((s, p) => s + p[c], 0) / pts.length);
      const outward = n.reduce((s, x, c) => s + x * (centre[c] - joint[c]), 0) > 0 ? n : n.map((x) => -x);
      const first = pos.length / 3;
      for (const p of pts) { pos.push(...p); nrm.push(...outward); uv.push(...texel); }
      for (let i = 1; i + 1 < pts.length; i += 1) tri.push(first, first + i, first + i + 1);
    };
    for (let r = 0; r + 1 < lats.length; r += 1) {
      const banded = Boolean(spec.band) && lats[r] === -spec.band;
      const lip = banded ? spec.lip : 1;
      for (let k = 0; k < spec.segments; k += 1) {
        const a = point(lats[r], k, lip), b = point(lats[r], k + 1, lip), c = point(lats[r + 1], k + 1, lip), d = point(lats[r + 1], k, lip);
        const texel = banded ? spec.bronze : spec.steel;
        if (Math.abs(lats[r]) === 90) face([a, c, d], texel);
        else if (Math.abs(lats[r + 1]) === 90) face([a, b, c], texel);
        else face([a, b, c, d], texel);
      }
      // the band's lip: a step from the plate up to the bronze on either edge
      if (banded) for (const lat of [lats[r], lats[r + 1]]) for (let k = 0; k < spec.segments; k += 1) {
        face([point(lat, k), point(lat, k + 1), point(lat, k + 1, spec.lip), point(lat, k, spec.lip)], spec.bronze);
      }
    }
    const count = pos.length / 3;
    const P = new Float32Array(pos);
    const min = [0, 1, 2].map((c) => Math.min(...pos.filter((_, i) => i % 3 === c)));
    const max = [0, 1, 2].map((c) => Math.max(...pos.filter((_, i) => i % 3 === c)));
    const joints = new Uint8Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) { joints[i * 4] = elbow.k; weights[i * 4] = 1; }
    const primitive = {
      attributes: {
        POSITION: accessor(P, 5126, 'VEC3', count, { min, max, target: 34962 }),
        NORMAL: accessor(new Float32Array(nrm), 5126, 'VEC3', count, { target: 34962 }),
        TEXCOORD_0: accessor(new Float32Array(uv), 5126, 'VEC2', count, { target: 34962 }),
        JOINTS_0: accessor(joints, 5121, 'VEC4', count, { target: 34962 }),
        WEIGHTS_0: accessor(weights, 5126, 'VEC4', count, { target: 34962 }),
      },
      indices: accessor(new Uint16Array(tri), 5123, 'SCALAR', tri.length, { target: 34963 }),
      material,
    };
    const name = part.name;
    doc.meshes.push({ name, primitives: [primitive] });
    doc.nodes.push({ name, mesh: doc.meshes.length - 1, skin: 0 });
    doc.nodes[rig].children.push(doc.nodes.length - 1);
    report.push({ mesh: name, bone: part.bone, vertices: count, triangles: tri.length / 3 });
  }
  bin = Buffer.concat([bin, Buffer.alloc(align(bin.length) - bin.length)]);
  doc.buffers[0].byteLength = bin.length;
  const data = encode(doc, bin);
  return { data, before: sha(base.raw), after: sha(data), bytes: data.length, clips: doc.animations.map((a) => a.name), report };
}

function replaceFirstPerson(baseFile, donorFile, expected) {
  const base = glb(baseFile), donor = glb(donorFile);
  if (sha(donor.raw) !== expected) throw Error('Unexpected first-person GLB (sha256 ' + sha(donor.raw) + ')');
  const a = base.doc, b = donor.doc;
  const names = (d) => d.nodes.map((n) => n.name).join('|');
  if (names(a) !== names(b)) throw Error('First-person node list differs');
  if (JSON.stringify(a.skins[0].joints) !== JSON.stringify(b.skins[0].joints)) throw Error('First-person joints differ');
  a.nodes.forEach((n, i) => { const bad = restMatches(n, b.nodes[i]); if (bad) throw Error(`${n.name} ${bad} differs at rest`); });
  if (a.animations.map((x) => x.name).join('|') !== b.animations.map((x) => x.name).join('|')) throw Error('First-person clips differ');
  return { data: donor.raw, before: sha(base.raw), after: sha(donor.raw), bytes: donor.raw.length, clips: b.animations.map((x) => x.name) };
}

const dir = resolve(arg('--dir') || 'client/assets/characters/spellblade');
const apply = process.argv.includes('--apply');
const manifestFile = join(dir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
let key, file, result;
if (arg('--seat-prop')) {
  // --seat-prop WhiteFlagProp --clip Death_WhiteFlag_Idle_Loop --time 0.3: the hand-held prop seated in the fist
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = seatHeldProp(join(dir, file), arg('--seat-prop'), arg('--clip'), Number(arg('--time') ?? 0), Number(arg('--grip-at') ?? 0.12));
} else if (process.argv.includes('--add-couters')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = addCouters(join(dir, file));
} else if (arg('--turn-pauldrons')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = turnPauldrons(join(dir, file), Number(arg('--turn-pauldrons')));
} else if (arg('--add-json-meshes')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = addJsonMeshes(join(dir, file), resolve(arg('--add-json-meshes')));
} else if (process.argv.includes('--blend-waist')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = blendWaist(join(dir, file));
} else if (process.argv.includes('--blend-collar')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = blendWaist(join(dir, file), COLLAR);
} else if (process.argv.includes('--mirror-back')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = mirrorBack(join(dir, file));
} else if (process.argv.includes('--add-backplate')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = addBackplate(join(dir, file));
} else if (process.argv.includes('--fill-core')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = fillCore(join(dir, file));
} else if (process.argv.includes('--drop-bells')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = dropBells(join(dir, file));
} else if (process.argv.includes('--rebind-strays')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = rebindStrays(join(dir, file));
} else if (process.argv.includes('--reweight-overruns')) {
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = reweightOverruns(join(dir, file));
} else if (arg('--restage-sword-arm')) {
  // --restage-sword-arm Idle --clips A,B: the sword arm of production clips A and B, carried as in Idle
  key = 'thirdPerson'; file = 'spellblade.glb';
  result = restageSwordArm(join(dir, file), arg('--restage-sword-arm'), (arg('--clips') || '').split(',').filter(Boolean));
} else if (arg('--first-person')) {
  key = 'firstPerson'; file = 'spellblade-fp.glb';
  result = replaceFirstPerson(join(dir, file), resolve(arg('--first-person')), arg('--sha'));
} else {
  const donor = arg('--donor'), clips = (arg('--clips') || '').split(',').filter(Boolean);
  if (!donor || !clips.length) throw Error('Supply --donor <glb> --sha <sha256> --clips A,B');
  key = 'thirdPerson'; file = 'spellblade.glb';
  // --edit Clip:trim=0.15:settle=0.6,Other:settle=1  (seconds in the donor clip's own time)
  const edits = Object.fromEntries((arg('--edit') || '').split(',').filter(Boolean).map((spec) => {
    const [clip, ...parts] = spec.split(':');
    return [clip, Object.fromEntries(parts.map((p) => { const [k, v] = p.split('='); return [k, Number.isNaN(Number(v)) ? v : Number(v)]; }))];
  }));
  for (const clip of Object.keys(edits)) if (!clips.includes(clip)) throw Error('--edit names a clip not being transplanted: ' + clip);
  result = transplantClips(join(dir, file), resolve(donor), arg('--sha'), clips, edits);
}
const m = manifest[key];
if (m.sha256 !== result.before) throw Error('Manifest baseline mismatch; aborting: ' + file);
m.sha256 = result.after; m.bytes = result.bytes; m.clips = result.clips;
if (key === 'thirdPerson') {
  const revision = result.after.slice(0, 40);
  manifest.sourceRevision = revision;
  for (const entry of [manifest.thirdPerson, manifest.firstPerson]) {
    entry.url = entry.url.replace(/\?v=[^&]+/, '?v=' + revision);
    entry.gzipUrl = entry.gzipUrl.replace(/\?v=[^&]+/, '?v=' + revision);
  }
} else {
  const asset = result.after.slice(0, 40);
  m.url = m.url.replace(/asset=[^&]+/, 'asset=' + asset);
  m.gzipUrl = m.gzipUrl.replace(/asset=[^&]+/, 'asset=' + asset);
}
if (apply) {
  writeFileSync(join(dir, file), result.data);
  writeFileSync(join(dir, file + '.gz'), gzipSync(result.data, { level: 9 }));
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
}
console.log(JSON.stringify({ applied: apply, file, sha256: result.after, bytes: result.bytes, clips: result.clips.length, report: result.report }, null, 2));
