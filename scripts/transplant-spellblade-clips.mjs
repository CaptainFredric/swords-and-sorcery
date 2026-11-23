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
//   node scripts/transplant-spellblade-clips.mjs --first-person <file.glb> --sha <sha256> [--apply]
//     (a whole first-person model: same joints, sockets, clips and rest pose required)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

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
if (arg('--restage-sword-arm')) {
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
