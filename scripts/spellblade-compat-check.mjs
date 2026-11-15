// Argon's next Spellblade against the canonical one, before any binary is swapped: the things the game depends on.
//   node scripts/spellblade-compat-check.mjs [candidate.glb] [--fp] [--json out.json]
// With no candidate it prints the canonical fingerprint. With one it lists every difference that would break the game:
//   skeleton   joint names, order and parents (the composition, the sidecars and the siege poses bind by name)
//   binds      each joint's inverse bind matrix (to 1e-4) — a changed bind silently re-poses every sidecar clip
//   materials  names the runtime finds (mutable VisorGlow / SorceryAccent, the game-light calibration)
//   sockets    socket_sword / socket_sorcery: parent and local transform (the blade's contact trajectories hang off it)
//   sword      where the skinned HeroSword's point is in its joint's frame (every blade audit measures from it)
//   clips      every clip the game names (manifest.json), its duration; root never animated, pelvis travel returning
//              to where it began (the server owns world movement: authored pelvis motion is weight transfer only)
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadGlb, localPose, worldMatrices, apply } from './lib/glbPose.mjs';
import { readAccessor, swordPoint } from './lib/glbSkin.mjs';

const args = process.argv.slice(2);
const fp = args.includes('--fp');
const jsonAt = args.indexOf('--json');
const json = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
const candidatePath = args.find((a) => a.endsWith('.glb'));
const dir = new URL('../client/assets/characters/spellblade/', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(`${dir}manifest.json`, 'utf8'));
const canonicalPath = `${dir}${fp ? 'spellblade-fp.glb' : 'spellblade.glb'}`;

export function fingerprint(path) {
  const model = loadGlb(path);
  const { gltf } = model;
  const skin = gltf.skins?.[0];
  const ibm = skin ? readAccessor(model, skin.inverseBindMatrices).data : new Float32Array();
  const joints = (skin?.joints ?? []).map((node, k) => ({
    name: gltf.nodes[node].name,
    parent: model.parent[node] >= 0 ? gltf.nodes[model.parent[node]].name : null,
    ibm: Array.from(ibm.subarray(k * 16, k * 16 + 16)).map((v) => +v.toFixed(4)),
  }));
  const sockets = Object.fromEntries(['socket_sword', 'socket_sorcery'].map((name) => {
    const i = model.byName.get(name);
    const n = i == null ? null : gltf.nodes[i];
    return [name, n && { parent: gltf.nodes[model.parent[i]]?.name ?? null, t: (n.translation ?? [0, 0, 0]).map((v) => +v.toFixed(4)), r: (n.rotation ?? [0, 0, 0, 1]).map((v) => +v.toFixed(4)) }];
  }));
  const sword = swordPoint(model);
  const root = model.byName.get('root'), pelvis = model.byName.get('pelvis');
  const clips = [...model.clips.values()].map((clip) => {
    const animatesRoot = clip.channels.some((c) => c.node === root);
    let pelvisNet = null;
    if (pelvis != null) {
      const at = (t) => apply(worldMatrices(model, localPose(model, [{ clip: clip.name, time: t, weight: 1 }]))[pelvis], [0, 0, 0]);
      const a = at(0), b = at(clip.duration);
      pelvisNet = +Math.hypot(b[0] - a[0], b[2] - a[2]).toFixed(3);
    }
    return { name: clip.name, duration: +clip.duration.toFixed(4), animatesRoot, pelvisNet };
  });
  return {
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    joints,
    materials: (gltf.materials ?? []).map((m) => m.name).sort(),
    meshes: (gltf.meshes ?? []).map((m) => m.name).sort(),
    sockets,
    sword: sword && { joint: gltf.nodes[sword.joint].name, tip: sword.tip.map((v) => +v.toFixed(4)) },
    clips,
  };
}

function compare(canonical, candidate) {
  const problems = [];
  const notes = [];
  const names = (list) => list.map((j) => j.name).join(',');
  if (names(canonical.joints) !== names(candidate.joints)) problems.push(`skeleton: joint names/order differ (${canonical.joints.length} → ${candidate.joints.length})`);
  for (const j of canonical.joints) {
    const c = candidate.joints.find((x) => x.name === j.name);
    if (!c) { problems.push(`skeleton: ${j.name} missing`); continue; }
    if (c.parent !== j.parent) problems.push(`skeleton: ${j.name} parent ${j.parent} → ${c.parent}`);
    const d = Math.max(...j.ibm.map((v, i) => Math.abs(v - c.ibm[i])));
    if (d > 1e-3) problems.push(`binds: ${j.name} inverse bind moved (max element ${d.toFixed(4)})`);
  }
  for (const m of canonical.materials) if (!candidate.materials.includes(m)) problems.push(`materials: ${m} missing`);
  for (const m of candidate.materials) if (!canonical.materials.includes(m)) notes.push(`materials: new ${m}`);
  for (const [name, s] of Object.entries(canonical.sockets)) {
    const c = candidate.sockets[name];
    if (!s) continue;
    if (!c) { problems.push(`sockets: ${name} missing`); continue; }
    if (c.parent !== s.parent) problems.push(`sockets: ${name} parent ${s.parent} → ${c.parent}`);
    const d = Math.max(...s.t.map((v, i) => Math.abs(v - c.t[i])), ...s.r.map((v, i) => Math.abs(v - c.r[i])));
    if (d > 1e-3) problems.push(`sockets: ${name} local transform moved (${d.toFixed(4)})`);
  }
  if (canonical.sword && candidate.sword) {
    const d = Math.hypot(...canonical.sword.tip.map((v, i) => v - candidate.sword.tip[i]));
    if (canonical.sword.joint !== candidate.sword.joint) problems.push(`sword: skinned to ${candidate.sword.joint}, not ${canonical.sword.joint}`);
    if (d > 0.01) problems.push(`sword: its point moved ${d.toFixed(3)} m in ${canonical.sword.joint}'s frame (every contact trajectory is measured from it)`);
  }
  const wanted = fp ? manifest.firstPerson.clips : manifest.thirdPerson.clips;
  for (const name of wanted) {
    const a = canonical.clips.find((c) => c.name === name), b = candidate.clips.find((c) => c.name === name);
    if (!b) { problems.push(`clips: ${name} missing`); continue; }
    if (a && Math.abs(a.duration - b.duration) > 1e-3) notes.push(`clips: ${name} ${a.duration}s → ${b.duration}s (re-measure swordChainPresentation STRIKE_CLIPS / DISASTER_CLIPS if it is one of theirs)`);
    if (b.animatesRoot) problems.push(`clips: ${name} animates the root (the server owns world movement)`);
    if (b.pelvisNet > 0.02 && !/^(Sprint_To_Guard_Bridge|Brake_Stop|Slash_\d_to_\d|Guard_From_Cut|Idle_Mordhau_Swap_To_(Blade|Hilt)|Restless_.*|FAF_.*|Death)$/.test(name)) notes.push(`clips: ${name} ends ${b.pelvisNet} m from where its pelvis began`);
  }
  for (const c of candidate.clips) if (!wanted.includes(c.name)) notes.push(`clips: new ${c.name} (${c.duration}s) — not named by manifest.json`);
  return { problems, notes };
}

const canonical = fingerprint(canonicalPath);
if (!candidatePath) {
  console.log(`${fp ? 'first' : 'third'}-person canonical ${canonical.sha256}: ${canonical.joints.length} joints, ${canonical.materials.length} materials, ${canonical.clips.length} clips; sword skinned to ${canonical.sword?.joint} point ${canonical.sword?.tip}`);
  if (json) writeFileSync(json, JSON.stringify(canonical, null, 1));
} else {
  const candidate = fingerprint(candidatePath);
  const { problems, notes } = compare(canonical, candidate);
  console.log(`candidate ${candidate.sha256} against canonical ${canonical.sha256}`);
  for (const p of problems) console.log(`  BREAKS  ${p}`);
  for (const n of notes) console.log(`  note    ${n}`);
  console.log(problems.length ? `${problems.length} incompatibilities` : 'compatible');
  if (json) writeFileSync(json, JSON.stringify({ candidate, problems, notes }, null, 1));
  process.exitCode = problems.length ? 1 : 0;
}
