// Skinned extents for the Node glTF sampler (glbPose.mjs): where a mesh's vertices are in a pose, without three.js.
// Used to check a clip against the floor on the model it will actually be played on.
import { apply, multiply, worldMatrices } from './glbPose.mjs';

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/** Any accessor as floats (integers as they are, normalized ones scaled). */
export function readAccessor(model, index) {
  const { gltf, bin } = model;
  const a = gltf.accessors[index], view = gltf.bufferViews[a.bufferView];
  const n = COMPONENTS[a.type], size = BYTES[a.componentType];
  const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = view.byteStride ?? n * size;
  const out = new Float32Array(a.count * n);
  for (let k = 0; k < a.count; k += 1) for (let c = 0; c < n; c += 1) {
    const p = offset + k * stride + c * size;
    let v = a.componentType === 5126 ? bin.readFloatLE(p) : a.componentType === 5123 ? bin.readUInt16LE(p)
      : a.componentType === 5121 ? bin.readUInt8(p) : a.componentType === 5125 ? bin.readUInt32LE(p) : 0;
    if (a.normalized) v /= a.componentType === 5121 ? 255 : 65535;
    out[k * n + c] = v;
  }
  return { data: out, n, count: a.count };
}

/** The model's skinned meshes by name: [{ pos, joints, weights }] per primitive. */
export function skinnedMeshes(model) {
  const { gltf } = model;
  const meshes = new Map();
  for (const node of gltf.nodes) {
    if (node.mesh == null) continue;
    const mesh = gltf.meshes[node.mesh];
    meshes.set(mesh.name, mesh.primitives.filter((p) => p.attributes.JOINTS_0 != null).map((p) => ({
      pos: readAccessor(model, p.attributes.POSITION), joints: readAccessor(model, p.attributes.JOINTS_0), weights: readAccessor(model, p.attributes.WEIGHTS_0),
    })));
  }
  return meshes;
}

/** The lowest and highest point (world y) of the named meshes in a local pose (one entry per node of `model`). */
export function skinnedHeights(model, meshes, pose, names) {
  const skin = model.gltf.skins[0];
  const ibm = (model.inverseBind ??= readAccessor(model, skin.inverseBindMatrices).data);
  const world = worldMatrices(model, pose);
  const palette = skin.joints.map((node, k) => multiply(world[node], Array.from(ibm.subarray(k * 16, k * 16 + 16))));
  const out = {};
  for (const name of names) {
    let lo = Infinity, hi = -Infinity;
    for (const part of meshes.get(name) ?? []) for (let v = 0; v < part.pos.count; v += 1) {
      const p = [part.pos.data[v * 3], part.pos.data[v * 3 + 1], part.pos.data[v * 3 + 2]];
      let y = 0;
      for (let c = 0; c < 4; c += 1) { const w = part.weights.data[v * 4 + c]; if (w) y += apply(palette[part.joints.data[v * 4 + c]], p)[1] * w; }
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    out[name] = [lo, hi];
  }
  return out;
}
