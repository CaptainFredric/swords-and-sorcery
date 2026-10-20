import * as THREE from 'three';
import { chunkOf, splitAt } from './tourChunks.mjs';

// What happens to the Spellblade's rivals on his round, made of their own armour: a knight charred black, a knight
// fallen apart into the pieces he was built from, a sword cut in two, a white flag, a knight frozen solid and melted
// down into slush (and the vessel it is drunk from). Everything here works on a live third-person Spellblade instance
// (createSpellbladeAsset) and leaves it restorable for the next round.

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const CHAR = new THREE.Color(0x17130f);
const EMBER = new THREE.Color(0xff5a1a);
// frozen solid: pale ice over the plate, a cold light in it, glassy; going soft: wet and grey
const ICE = new THREE.Color(0xd4efff);
const ICE_LIGHT = new THREE.Color(0x2f7fae);
const WET = new THREE.Color(0x8aa3b0);

/**
 * Give a rival his own materials (so tinting or charring him never touches anyone else), tinted: every armour colour
 * is multiplied by `tint`, and his visor glows `visor`. Returns a handle to set how burned he is and to restore him.
 */
export function dressRival(instance, { tint, visor }) {
  const clones = new Map();
  const base = new Map();
  instance.root.traverse((object) => {
    if (!object.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    const dressed = list.map((material) => {
      if (!material) return material;
      if (!clones.has(material)) {
        const copy = material.clone();
        // everything that glows (the visor, the helm's slits, the gauntlet's runes) glows in his colour, not ours
        const glows = copy.emissive && copy.emissive.getHex() !== 0;
        if (copy.name === 'VisorGlow' || /visor/i.test(copy.name)) {
          if (copy.emissive) copy.emissive.setHex(visor);
          if (copy.color) copy.color.setHex(visor);
        } else if (glows) {
          copy.emissive.setHex(visor);
          if (copy.color) copy.color.multiply(new THREE.Color(...tint));
        } else if (copy.color) {
          copy.color.multiply(new THREE.Color(...tint));
        }
        clones.set(material, copy);
        base.set(copy, {
          color: copy.color?.clone(), emissive: copy.emissive?.clone(), emissiveIntensity: copy.emissiveIntensity ?? 1,
          roughness: copy.roughness, metalness: copy.metalness,
        });
      }
      return clones.get(material);
    });
    object.material = Array.isArray(object.material) ? dressed : dressed[0];
  });
  return {
    materials: [...base.keys()],
    /** 0 untouched .. 1 burned to charcoal (glowing like embers on the way). */
    char(amount) {
      const glow = Math.sin(Math.PI * Math.min(1, amount * 1.4)) * (1 - amount * 0.6);
      for (const [material, original] of base) {
        if (material.color && original.color) material.color.copy(original.color).lerp(CHAR, Math.min(1, amount));
        if (material.emissive && original.emissive) {
          material.emissive.copy(original.emissive).lerp(EMBER, glow);
          material.emissiveIntensity = original.emissiveIntensity + glow * 0.8;
        }
      }
    },
    /**
     * 0 untouched .. 1 frozen solid: his plate under pale ice, a cold light in it, glassy. melt (0..1): the ice going
     * soft, wet and grey as it gives way. heat (0..1): fire on the ice, glowing through it for a moment.
     */
    frost(amount, melt = 0, heat = 0) {
      const a = Math.max(0, Math.min(1, amount));
      const m = Math.max(0, Math.min(1, melt));
      const hot = Math.max(0, Math.min(1, heat));
      for (const [material, original] of base) {
        if (material.color && original.color) material.color.copy(original.color).lerp(ICE, 0.82 * a).lerp(WET, 0.7 * m);
        if (material.emissive && original.emissive) {
          material.emissive.copy(original.emissive).lerp(ICE_LIGHT, 0.55 * a * (1 - m)).lerp(EMBER, 0.85 * hot);
          material.emissiveIntensity = original.emissiveIntensity + 0.35 * a * (1 - m) + 1.4 * hot;
        }
        if (Number.isFinite(original.roughness)) material.roughness = original.roughness + (0.1 - original.roughness) * a * (1 - 0.6 * m);
        if (Number.isFinite(original.metalness)) material.metalness = original.metalness + (0.08 - original.metalness) * a;
      }
    },
    restore() {
      for (const [material, original] of base) {
        if (original.color) material.color.copy(original.color);
        if (original.emissive) material.emissive.copy(original.emissive);
        material.emissiveIntensity = original.emissiveIntensity;
        if (Number.isFinite(original.roughness)) material.roughness = original.roughness;
        if (Number.isFinite(original.metalness)) material.metalness = original.metalness;
      }
    },
  };
}

// a skinned mesh's triangles as they stand right now, in world space, each labelled with the piece of him that moves it
// (chunkOf), and each vertex with its share in every piece (its skin weights, summed by piece)
function bakedTriangles(mesh) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  const color = geometry.attributes.color;
  const uv = geometry.attributes.uv;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const bones = mesh.skeleton?.bones ?? [];
  const boneChunk = bones.map((b) => chunkOf(b.name));
  mesh.updateMatrixWorld(true);
  const world = new Float32Array(position.count * 3);
  const shares = new Array(position.count);
  const top = new Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, _v); else _v.fromBufferAttribute(position, i);
    _v.applyMatrix4(mesh.matrixWorld);
    world[i * 3] = _v.x; world[i * 3 + 1] = _v.y; world[i * 3 + 2] = _v.z;
    const share = new Map();
    if (skinIndex && skinWeight) {
      for (let k = 0; k < 4; k += 1) {
        const w = skinWeight.getComponent(i, k);
        if (w <= 0) continue;
        const chunk = boneChunk[skinIndex.getComponent(i, k)] ?? 'hips';
        share.set(chunk, (share.get(chunk) ?? 0) + w);
      }
    }
    if (!share.size) share.set(chunkOf(''), 1);
    shares[i] = share;
    top[i] = [...share.entries()].sort((x, y) => y[1] - x[1])[0][0];
  }
  const triangles = [];
  for (let t = 0; t < count; t += 3) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k));
    // (the piece of him it belongs to: what most of its corners ride on)
    const votes = new Map();
    for (const id of ids) votes.set(top[id], (votes.get(top[id]) ?? 0) + 1);
    const chunk = [...votes.entries()].sort((x, y) => y[1] - x[1])[0][0];
    triangles.push({ ids, chunk });
  }
  return { triangles, world, color, uv, shares, top };
}

// tidy the pieces of one mesh: a triangle whose neighbours are mostly of another piece joins them (four times over), and
// any scrap left of a piece too small to fall on its own joins the piece it touches most
function tidyChunks(baked) {
  const key = (id) => `${Math.round(baked.world[id * 3] * 2000)},${Math.round(baked.world[id * 3 + 1] * 2000)},${Math.round(baked.world[id * 3 + 2] * 2000)}`;
  const edges = new Map();
  baked.triangles.forEach((triangle, t) => {
    const k = triangle.ids.map(key);
    for (const [a, b] of [[k[0], k[1]], [k[1], k[2]], [k[2], k[0]]]) {
      const e = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!edges.has(e)) edges.set(e, []);
      edges.get(e).push(t);
    }
  });
  const around = baked.triangles.map(() => []);
  for (const list of edges.values()) for (const t of list) for (const u of list) if (t !== u) around[t].push(u);
  for (let pass = 0; pass < 4; pass += 1) {
    const next = baked.triangles.map((triangle, t) => {
      const votes = new Map();
      for (const u of around[t]) votes.set(baked.triangles[u].chunk, (votes.get(baked.triangles[u].chunk) ?? 0) + 1);
      const [best, n] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [triangle.chunk, 0];
      return n >= 2 && best !== triangle.chunk ? best : triangle.chunk;
    });
    next.forEach((chunk, t) => { baked.triangles[t].chunk = chunk; });
  }
  // scraps: connected runs of one piece, under 24 triangles, join the piece they border most
  const seen = new Set();
  baked.triangles.forEach((triangle, t) => {
    if (seen.has(t)) return;
    const run = [t];
    seen.add(t);
    for (let i = 0; i < run.length; i += 1) {
      for (const u of around[run[i]]) if (!seen.has(u) && baked.triangles[u].chunk === triangle.chunk) { seen.add(u); run.push(u); }
    }
    if (run.length >= 24) return;
    const votes = new Map();
    for (const r of run) for (const u of around[r]) if (baked.triangles[u].chunk !== triangle.chunk) votes.set(baked.triangles[u].chunk, (votes.get(baked.triangles[u].chunk) ?? 0) + 1);
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best) for (const r of run) baked.triangles[r].chunk = best;
  });
  return around;
}

// The pieces' triangles, cut clean where two pieces meet: a triangle whose corners ride two pieces, both of which meet
// there, is split along the line where the two pieces' shares are equal (the middle of the joint's blend), each side to
// its own piece, so a plate comes away with a clean edge instead of the mesh's zig-zag of whole triangles. (Only where
// both really meet: a corner left riding a piece the tidying took away keeps to the triangle's piece.)
function cutAlongJoints(baked, around) {
  const corner = (id) => ({
    p: [baked.world[id * 3], baked.world[id * 3 + 1], baked.world[id * 3 + 2]],
    uv: baked.uv ? [baked.uv.getX(id), baked.uv.getY(id)] : null,
    c: baked.color ? [baked.color.getX(id), baked.color.getY(id), baked.color.getZ(id)] : null,
    a: 0,
  });
  const byChunk = new Map();
  const into = (chunk, triangles) => {
    if (!byChunk.has(chunk)) byChunk.set(chunk, []);
    byChunk.get(chunk).push(...triangles);
  };
  baked.triangles.forEach((triangle, t) => {
    const corners = triangle.ids.map(corner);
    const kinds = [...new Set(triangle.ids.map((id) => baked.top[id]))];
    if (kinds.length === 2 && kinds.includes(triangle.chunk)) {
      const meeting = new Set([triangle.chunk, ...around[t].map((u) => baked.triangles[u].chunk)]);
      const [a, b] = kinds;
      if (meeting.has(a) && meeting.has(b)) {
        triangle.ids.forEach((id, k) => {
          corners[k].a = (baked.shares[id].get(a) ?? 0) - (baked.shares[id].get(b) ?? 0);
        });
        const [toB, toA] = splitAt(corners, 0);
        into(a, toA);
        into(b, toB);
        return;
      }
    }
    into(triangle.chunk, [corners]);
  });
  return byChunk;
}


/** Tumbling pieces that fall, bounce once or twice on the ground (y = 0) and lie still. */
export class Debris {
  constructor(scene, { onLand = null } = {}) {
    this.scene = scene;
    this.onLand = onLand;
    this.pieces = [];
  }

  add(mesh, { velocity, spin, delay = 0 }) {
    this.scene.add(mesh);
    this.pieces.push({ mesh, velocity: velocity.clone(), spin: spin.clone(), delay, landed: 0, resting: false });
  }

  update(dt) {
    for (const piece of this.pieces) {
      if (piece.resting) continue;
      if (piece.delay > 0) { piece.delay -= dt; continue; }
      piece.velocity.y -= 9.8 * dt;
      piece.mesh.position.addScaledVector(piece.velocity, dt);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(piece.spin.x * dt, piece.spin.y * dt, piece.spin.z * dt));
      piece.mesh.quaternion.premultiply(q);
      _box.setFromObject(piece.mesh);
      if (_box.min.y < 0) {
        piece.mesh.position.y -= _box.min.y;
        const impact = -piece.velocity.y;
        if (impact > 0.8 && piece.landed < 2) this.onLand?.(piece.mesh.position, impact);
        piece.velocity.y = impact * 0.28;
        piece.velocity.x *= 0.55;
        piece.velocity.z *= 0.55;
        piece.spin.multiplyScalar(0.45);
        piece.landed += 1;
        if (piece.velocity.length() < 0.35 || piece.landed > 4) piece.resting = true;
      }
    }
    if (this.pieces.length > 1 && this.pieces.every((piece) => piece.resting) && this.pieces.some((piece) => !piece.merged)) this.#merge();
  }

  // once everything lies still, what lies there is merged into one mesh for each material: a heap of armour costs a
  // draw call or two instead of one for every plate (and as many again for their shadows). A piece may be a group of
  // meshes (a gauntlet of several materials): each of its meshes is merged with its own material's.
  #merge() {
    const groups = new Map();
    for (const piece of this.pieces) {
      piece.mesh.updateMatrixWorld(true);
      const retired = Boolean(piece.mesh.userData.tourRetired);
      piece.mesh.traverse((mesh) => {
        if (!mesh.isMesh) return;
        const { geometry, material } = mesh;
        const names = Object.keys(geometry.attributes).sort();
        const key = `${names.join(',')}:${retired}`;
        if (!groups.has(material)) groups.set(material, new Map());
        const shapes = groups.get(material);
        if (!shapes.has(key)) shapes.set(key, []);
        shapes.get(key).push({ mesh, retired, visible: piece.mesh.visible });
      });
    }
    for (const piece of this.pieces) this.scene.remove(piece.mesh);
    const merged = [];
    for (const [material, shapes] of groups) {
      for (const pieces of shapes.values()) {
        const names = Object.keys(pieces[0].mesh.geometry.attributes);
        const parts = Object.fromEntries(names.map((name) => [name, []]));
        for (const { mesh } of pieces) {
          const placed = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          placed.applyMatrix4(mesh.matrixWorld);
          for (const name of names) parts[name].push(placed.attributes[name].array);
          placed.dispose();
          mesh.geometry.dispose();
        }
        const geometry = new THREE.BufferGeometry();
        for (const name of names) {
          const data = new Float32Array(parts[name].reduce((sum, array) => sum + array.length, 0));
          let offset = 0;
          for (const array of parts[name]) { data.set(array, offset); offset += array.length; }
          geometry.setAttribute(name, new THREE.BufferAttribute(data, pieces[0].mesh.geometry.attributes[name]?.itemSize ?? 3));
        }
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.visible = pieces[0].visible;
        mesh.userData.tourRetired = pieces[0].retired;
        this.scene.add(mesh);
        merged.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), delay: 0, landed: 0, resting: true, merged: true });
      }
    }
    this.pieces = merged;
  }

  /** Take out the pieces `which(mesh)` says (gathered up: the ice in the slush, scooped with it). */
  remove(which) {
    this.pieces = this.pieces.filter((piece) => {
      if (!which(piece.mesh)) return true;
      this.scene.remove(piece.mesh);
      piece.mesh.traverse((mesh) => mesh.geometry?.dispose());
      return false;
    });
  }

  clear() {
    for (const piece of this.pieces) {
      this.scene.remove(piece.mesh);
      piece.mesh.traverse((mesh) => mesh.geometry?.dispose());
    }
    this.pieces = [];
  }
}

/**
 * The knight falls apart: every piece of his armour (chunkOf: the helm, the cuirass, a pauldron, a greave, the cape...)
 * drops where it was, pushed a little outward and set tumbling, and he himself is hidden. `random` makes it the same
 * every round.
 */
export function shatterKnight(instance, debris, random = Math.random) {
  const centre = new THREE.Vector3();
  instance.root.getWorldPosition(centre);
  // every mesh's triangles, by the piece of him they belong to (a gauntlet's plates, palm and grip, whatever meshes
  // and materials they are drawn with, fall together as one)
  const chunks = new Map();
  instance.root.traverse((object) => {
    if (!object.isMesh || !object.visible || !object.geometry?.attributes?.position) return;
    if (object.geometry.attributes.position.count < 12) return;   // the palm's sorcery shards just go out
    const baked = bakedTriangles(object);
    const byChunk = cutAlongJoints(baked, tidyChunks(baked));
    for (const [chunk, triangles] of byChunk) {
      if (!triangles.length) continue;
      if (!chunks.has(chunk)) chunks.set(chunk, []);
      chunks.get(chunk).push(pieceFromCorners(triangles, object.material));
    }
  });
  for (const parts of chunks.values()) {
    const piece = new THREE.Group();
    for (const part of parts) piece.position.add(part.position);
    piece.position.divideScalar(parts.length);
    for (const part of parts) { part.position.sub(piece.position); piece.add(part); }
    const out = piece.position.clone().sub(centre).setY(0);
    if (out.lengthSq() < 1e-4) out.set(random() - 0.5, 0, random() - 0.5);
    out.normalize().multiplyScalar(0.4 + random() * 0.9);
    // higher pieces drop a moment later, as a tower of plate would come down
    const delay = Math.max(0, piece.position.y - 0.4) * 0.12 * random();
    debris.add(piece, {
      velocity: new THREE.Vector3(out.x, 0.4 + random() * 1.1, out.z),
      spin: new THREE.Vector3((random() - 0.5) * 7, (random() - 0.5) * 5, (random() - 0.5) * 7),
      delay,
    });
  }
  instance.root.visible = false;
}

/**
 * A sword cut in two where it stands: the part from the point back to `at` (a fraction of the blade from the grip) is
 * thrown off to tumble as debris; the hilt and the stub stay in the knight's hand (a new mesh riding the socket).
 * The original sword is hidden. Returns the stub (to swap for something else later).
 */
export function cutSword(instance, debris, { aim, at = 0.42, throwDirection = new THREE.Vector3(0, 1, 0) } = {}) {
  const socket = instance.animator.bone('socket_sword');
  socket.updateMatrixWorld(true);
  const grip = new THREE.Vector3().setFromMatrixPosition(socket.matrixWorld);
  const axis = new THREE.Vector3(...aim).applyQuaternion(socket.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const swords = [];
  instance.root.traverse((object) => { if (object.isMesh && /^HeroSword/i.test(object.name)) swords.push(object); });
  // every triangle's corners as they stand, and how far along the blade from the grip each lies
  let reach = 0;
  const all = [];
  for (const mesh of swords) {
    const baked = bakedTriangles(mesh);
    const corner = (id) => {
      const p = [baked.world[id * 3], baked.world[id * 3 + 1], baked.world[id * 3 + 2]];
      return {
        p,
        uv: baked.uv ? [baked.uv.getX(id), baked.uv.getY(id)] : null,
        c: baked.color ? [baked.color.getX(id), baked.color.getY(id), baked.color.getZ(id)] : null,
        a: _v.set(...p).sub(grip).dot(axis),
      };
    };
    for (const triangle of baked.triangles) {
      const corners = triangle.ids.map(corner);
      for (const c of corners) reach = Math.max(reach, c.a);
      all.push({ mesh, corners });
    }
  }
  // cut clean across the blade: a triangle the cut crosses is split along it (the blade's few long triangles, kept or
  // thrown whole, left a stub of ragged slivers)
  const cut = reach * at;
  const kept = new Map();
  const thrown = new Map();
  const into = (map, mesh, triangles) => { if (!map.has(mesh)) map.set(mesh, []); map.get(mesh).push(...triangles); };
  for (const { mesh, corners } of all) {
    const [below, above] = splitAt(corners, cut);
    into(kept, mesh, below);
    into(thrown, mesh, above);
  }
  const stub = new THREE.Group();
  for (const [mesh, triangles] of kept) if (triangles.length) stub.add(pieceFromCorners(triangles, mesh.material));
  // the stub rides the hand from here on
  socket.attach(stub);
  for (const [mesh, triangles] of thrown) {
    if (!triangles.length) continue;
    debris.add(pieceFromCorners(triangles, mesh.material), {
      velocity: throwDirection.clone().multiplyScalar(2.2).add(new THREE.Vector3(0, 2.4, 0)),
      spin: new THREE.Vector3(9, 2, 6),
    });
  }
  for (const mesh of swords) mesh.visible = false;
  return stub;
}

// a static mesh from triangles given by their corners ({ p, uv, c }), centred on their middle (its world position)
function pieceFromCorners(triangles, material) {
  const positions = [];
  const uvs = triangles[0][0].uv ? [] : null;
  const colors = triangles[0][0].c ? [] : null;
  const centre = new THREE.Vector3();
  for (const triangle of triangles) {
    for (const corner of triangle) {
      positions.push(...corner.p);
      centre.x += corner.p[0]; centre.y += corner.p[1]; centre.z += corner.p[2];
      if (uvs) uvs.push(...corner.uv);
      if (colors) colors.push(...corner.c);
    }
  }
  centre.divideScalar(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= centre.x; positions[i + 1] -= centre.y; positions[i + 2] -= centre.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(centre);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The sword comes back whole (for the next round). */
export function mendSword(instance, stub) {
  stub?.parent?.remove(stub);
  stub?.traverse((object) => object.geometry?.dispose?.());
  instance.root.traverse((object) => { if (object.isMesh && /^HeroSword/i.test(object.name)) object.visible = true; });
}

/**
 * A white flag on a stick, held in a knight's sword hand (along the blade's line from the grip). update(time) lets it
 * wave. Remove it with dispose().
 */
export function whiteFlag(instance, { aim }) {
  const socket = instance.animator.bone('socket_sword');
  const flag = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.15, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 }));
  stick.position.y = 0.45;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42, 12, 6), new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.95, side: THREE.DoubleSide }));
  cloth.geometry.translate(0.31, 0, 0);
  cloth.position.set(0.012, 0.8, 0);
  cloth.castShadow = true;
  const rest = Float32Array.from(cloth.geometry.attributes.position.array);
  flag.add(stick, cloth);
  // the stick lies along the blade's line in the socket's frame
  flag.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...aim).normalize());
  socket.add(flag);
  return {
    group: flag,
    update(time) {
      const position = cloth.geometry.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        const x = rest[i * 3];
        const y = rest[i * 3 + 1];
        position.setZ(i, Math.sin(time * 9 - x * 9 + y * 2) * 0.07 * (x / 0.62));
        position.setY(i, y - (x / 0.62) * 0.05);
      }
      position.needsUpdate = true;
      cloth.geometry.computeVertexNormals();
    },
    dispose() {
      socket.remove(flag);
      flag.traverse((object) => { object.geometry?.dispose?.(); object.material?.dispose?.(); });
    },
  };
}

/**
 * Little stars circling a dizzy knight's head (the round is a cartoon, and so is he for a moment). Returns
 * { update(time, strength), dispose() }; they follow his head wherever it goes.
 */
export function dizzyStars(scene, instance) {
  const head = instance.animator.bone('head');
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 ? 0.024 : 0.06;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: false });
  geometry.center();
  const material = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0, depthWrite: false });
  const group = new THREE.Group();
  group.name = 'tour-dizzy-stars';
  const stars = [0, 1, 2, 3].map((i) => {
    const star = new THREE.Mesh(geometry, material);
    star.userData.phase = (i / 4) * Math.PI * 2;
    group.add(star);
    return star;
  });
  scene.add(group);
  return {
    update(time, strength = 1) {
      if (head) head.getWorldPosition(group.position);
      group.position.y += 0.34;
      material.opacity = 0.95 * Math.max(0, Math.min(1, strength));
      for (const star of stars) {
        const a = star.userData.phase + time * 5.2;
        star.position.set(Math.cos(a) * 0.26, Math.sin(a * 2) * 0.03, Math.sin(a) * 0.26);
        star.rotation.set(0.3, a * 1.7, 0);
      }
    },
    dispose() {
      scene.remove(group);
      geometry.dispose();
      material.dispose();
    },
  };
}

// ------------------------------------------------------------------------------------------------- the Slush

// where the ice crystals grow on a frozen knight: the bones they ride, how far out, and roughly which way they point
// (the bone's own frame); the helm and the shoulders first
const CRUST = Object.freeze([
  ['head', [0.09, 0.12, 0.02], [0.4, 1, 0]], ['head', [-0.1, 0.08, -0.04], [-0.5, 1, 0.2]],
  ['chest', [0.17, 0.18, 0.05], [1, 0.6, 0]], ['chest', [-0.18, 0.16, 0.06], [-1, 0.6, 0]], ['chest', [0.02, 0.08, -0.15], [0, 0.4, -1]],
  ['spine', [0.12, 0.02, -0.12], [0.6, 0.2, -1]], ['pelvis', [-0.14, 0.0, -0.08], [-1, -0.2, -0.4]],
  ['upper_arm.L', [0.0, 0.12, 0.05], [-0.3, 0.6, 1]], ['upper_arm.R', [0.0, 0.12, 0.05], [0.3, 0.6, 1]],
  ['forearm.L', [0.0, 0.1, 0.05], [-0.4, 0.2, 1]], ['forearm.R', [0.0, 0.12, -0.05], [0.4, 0.2, -1]],
  ['thigh.L', [0.04, 0.16, 0.06], [-0.6, 0.1, 1]], ['thigh.R', [-0.04, 0.2, 0.06], [0.6, 0.1, 1]],
  ['shin.L', [0.0, 0.16, 0.06], [-0.4, 0, 1]], ['shin.R', [0.0, 0.12, 0.06], [0.4, 0, 1]],
]);

function iceMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xe8f8ff, roughness: 0.06, metalness: 0.05, emissive: 0x1d5878, emissiveIntensity: 0.45, transparent: true, opacity: 0.86,
  });
}

/**
 * Ice crystals closing over a frozen knight, riding his bones (so they stand where he froze). grow(amount) brings them
 * out (each in its turn); shed(debris, random) lets them fall to the ground as the statue gives way (they lie in the
 * slush); dispose() takes away any still on him, and their material.
 */
export function iceCrust(instance, random = Math.random) {
  const material = iceMaterial();
  const crystals = [];
  for (const [index, [name, offset, point]] of CRUST.entries()) {
    const bone = instance.animator.bone(name);
    if (!bone) continue;
    const geometry = new THREE.OctahedronGeometry(0.055 + random() * 0.03, 0);
    geometry.scale(0.7, 2 + random() * 1.2, 0.7);
    const crystal = new THREE.Mesh(geometry, material);
    crystal.position.set(...offset);
    crystal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...point).normalize());
    crystal.scale.setScalar(1e-3);
    crystal.castShadow = true;
    crystal.userData.delay = (index / CRUST.length) * 0.45;
    bone.add(crystal);
    crystals.push(crystal);
  }
  return {
    crystals,
    material,
    grow(amount) {
      for (const crystal of crystals) {
        if (!crystal.parent?.isBone) continue;
        const u = Math.max(0, Math.min(1, (amount - crystal.userData.delay) / 0.55));
        crystal.scale.setScalar(Math.max(1e-3, u * u * (3 - 2 * u)));
      }
    },
    /** The crystals that fell, gathered up off the ground with the slush (none left lying). */
    collect(debris) {
      debris.remove((mesh) => mesh.material === material);
    },
    shed(debris, rand = Math.random) {
      for (const crystal of crystals) {
        if (!crystal.parent?.isBone) continue;
        crystal.updateMatrixWorld(true);
        const world = crystal.matrixWorld.clone();
        crystal.parent.remove(crystal);
        world.decompose(crystal.position, crystal.quaternion, crystal.scale);
        debris.add(crystal, {
          velocity: new THREE.Vector3((rand() - 0.5) * 0.9, 0.3 + rand() * 0.6, (rand() - 0.5) * 0.9),
          spin: new THREE.Vector3((rand() - 0.5) * 6, (rand() - 0.5) * 4, (rand() - 0.5) * 6),
          delay: rand() * 0.25,
        });
      }
    },
    dispose() {
      for (const crystal of crystals) {
        if (crystal.parent?.isBone) {
          crystal.parent.remove(crystal);
          crystal.geometry.dispose();
        }
      }
      material.dispose();
    },
  };
}

// a seeded wobble for the heap's surface
function lumpy(random) {
  const phases = Array.from({ length: 6 }, () => random() * Math.PI * 2);
  return (angle, height) => 1 + 0.09 * Math.sin(angle * 3 + phases[0]) + 0.06 * Math.sin(angle * 5 + phases[1]) + 0.05 * Math.sin(angle * 2 + height * 4 + phases[2]);
}

/**
 * The heap of slush a frozen knight melts down into, where he stood: a wet, lumpy mound with chunks of ice in it, in a
 * puddle; tinted a little by what he was (his armour's colour). grow(amount) brings it up as he comes down;
 * scoop(amount) takes a vesselful out of it; splash(point) leaves a small wet patch (the dregs, tipped out). dispose()
 * takes it all away.
 */
export function slushPile(scene, { at, tint = [1, 1, 1], random = Math.random } = {}) {
  const group = new THREE.Group();
  group.name = 'tour-slush';
  group.position.set(at.x, 0, at.z);
  const tone = new THREE.Color(...tint);
  const slush = new THREE.Color(0xe2ecf1).lerp(new THREE.Color(0xe2ecf1).multiply(tone), 0.55);
  const moundMaterial = new THREE.MeshStandardMaterial({ color: slush, roughness: 0.3, metalness: 0.02, emissive: 0x0d2230, emissiveIntensity: 0.25 });
  const puddleMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x56707e).lerp(new THREE.Color(0x56707e).multiply(tone), 0.4), roughness: 0.08, metalness: 0.1,
    transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const ice = iceMaterial();
  // the mound: a half sphere, lumped and flattened
  const geometry = new THREE.SphereGeometry(0.48, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const wobble = lumpy(random);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const k = wobble(Math.atan2(z, x), y);
    position.setXYZ(i, x * k, y * k, z * k);
  }
  geometry.computeVertexNormals();
  const mound = new THREE.Mesh(geometry, moundMaterial);
  mound.castShadow = true;
  mound.receiveShadow = true;
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), puddleMaterial);
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = 0.006;
  puddle.receiveShadow = true;
  const chunks = Array.from({ length: 8 }, (_, i) => {
    const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035 + random() * 0.045, 0), ice);
    const angle = i * 2.3 + random();
    const out = 0.12 + random() * 0.4;
    chunk.position.set(Math.cos(angle) * out, 0.05 + (0.52 - out) * 0.28, Math.sin(angle) * out);
    chunk.rotation.set(random() * 3, random() * 3, random() * 3);
    chunk.castShadow = true;
    return chunk;
  });
  const splashes = [];
  group.add(puddle, mound, ...chunks);
  scene.add(group);
  let grown = 0;
  let taken = 0;
  const shape = () => {
    const g = Math.max(0.001, grown);
    // (scooped: it goes down and in, a vesselful at a time, until there is nothing of it but a damp patch)
    const left = Math.max(0, 1 - taken);
    const spread = Math.sqrt(left);
    mound.visible = left > 0.01;
    mound.scale.set(Math.max(0.001, g * spread), Math.max(0.001, 0.44 * g * left * (0.75 + 0.25 * g)), Math.max(0.001, g * spread));
    puddle.scale.setScalar(Math.max(0.001, Math.min(1, grown * 1.3) * (1 - 0.45 * taken)));
    chunks.forEach((chunk, i) => { chunk.visible = grown > 0.35 + (i % 4) * 0.12 && taken < (i + 1) / chunks.length; });
  };
  shape();
  return {
    group,
    grow(amount) { grown = Math.max(0, Math.min(1, amount)); shape(); },
    /** How much of it has been scooped up (0..1: at 1, none of it is left). */
    scoop(amount) { taken = Math.max(0, Math.min(1, amount)); shape(); },
    splash(point) {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(0.22 + random() * 0.08, 18), puddleMaterial);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(point.x - at.x, 0.007, point.z - at.z);
      group.add(patch);
      splashes.push(patch);
    },
    dispose() {
      scene.remove(group);
      geometry.dispose();
      puddle.geometry.dispose();
      for (const chunk of chunks) chunk.geometry.dispose();
      for (const patch of splashes) patch.geometry.dispose();
      moundMaterial.dispose();
      puddleMaterial.dispose();
      ice.dispose();
    },
  };
}

// the two vessels: a brass tankard (with a handle; warm against his steel, so it reads in his hand) and a small
// wooden pail (iron hoops, a bail over the top); their height, their radius at the rim and at the foot, and how far
// out from the tankard's side the middle of its handle is (where his fist closes on it)
export const VESSELS = Object.freeze({
  cup: Object.freeze({ height: 0.21, rim: 0.09, foot: 0.08, handle: 0.06 }),
  pail: Object.freeze({ height: 0.22, rim: 0.12, foot: 0.092 }),
});

/**
 * A vessel in a knight's hand: `kind` 'cup' or 'pail'. Placed every frame (update: where its middle is, its
 * orientation, and how full it is of slush, 0..1, the slush tinted `tint`). dispose() takes it away.
 */
export function vesselProp(scene, { kind = 'cup', tint = [1, 1, 1] } = {}) {
  const size = VESSELS[kind] ?? VESSELS.cup;
  const group = new THREE.Group();
  group.name = `tour-vessel-${kind}`;
  const owned = [];
  const material = (options) => { const m = new THREE.MeshStandardMaterial(options); owned.push(m); return m; };
  const mesh = (geometry, mat) => { const m = new THREE.Mesh(geometry, mat); m.castShadow = true; group.add(m); return m; };
  const shell = kind === 'pail'
    ? material({ color: 0x7a5534, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide })
    : material({ color: 0xcaa24c, roughness: 0.28, metalness: 0.85, side: THREE.DoubleSide });
  const iron = material({ color: kind === 'pail' ? 0x3b3c40 : 0x9b7832, roughness: 0.4, metalness: 0.85 });
  mesh(new THREE.CylinderGeometry(size.rim, size.foot, size.height, 18, 1, true), shell);
  const base = mesh(new THREE.CircleGeometry(size.foot, 18), shell);
  base.rotation.x = Math.PI / 2;
  base.position.y = -size.height / 2;
  const rim = mesh(new THREE.TorusGeometry(size.rim, kind === 'pail' ? 0.007 : 0.009, 6, 24), iron);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = size.height / 2;
  if (kind === 'pail') {
    for (const y of [-0.06, 0.05]) {
      const r = size.foot + ((y + size.height / 2) / size.height) * (size.rim - size.foot);
      const hoop = mesh(new THREE.TorusGeometry(r + 0.004, 0.006, 5, 24), iron);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = y;
    }
    // the bail, arching over the top from side to side
    const bail = mesh(new THREE.TorusGeometry(size.rim + 0.01, 0.005, 4, 20, Math.PI), iron);
    bail.position.y = size.height / 2;
  } else {
    // the tankard's handle, on its right (+x: the hand that holds it closes round it there), and a band round its foot
    const handle = mesh(new THREE.TorusGeometry(size.handle - 0.005, 0.013, 6, 14, Math.PI), iron);
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(size.rim + 0.005, 0.01, 0);
    const band = mesh(new THREE.TorusGeometry(size.foot + 0.003, 0.007, 5, 24), iron);
    band.rotation.x = Math.PI / 2;
    band.position.y = -size.height / 2 + 0.02;
  }
  // the slush in it, its surface rising and falling with how full it is
  const tone = new THREE.Color(...tint);
  const contents = new THREE.Mesh(new THREE.CircleGeometry(1, 18), material({ color: new THREE.Color(0xe2ecf1).lerp(new THREE.Color(0xe2ecf1).multiply(tone), 0.55), roughness: 0.3 }));
  contents.rotation.x = -Math.PI / 2;
  group.add(contents);
  // fuller than full: the slush heaped over the rim
  const heaped = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), contents.material);
  heaped.position.y = size.height / 2;
  group.add(heaped);
  scene.add(group);
  return {
    group,
    size,
    update({ position, quaternion, fill = 0, visible = true }) {
      group.visible = visible;
      if (position) group.position.copy(position);
      if (quaternion) group.quaternion.copy(quaternion);
      const over = Math.max(0, fill - 1);
      heaped.visible = over > 0.01;
      heaped.scale.set(size.rim * 0.97, Math.max(0.001, Math.min(0.1, over * 0.6)), size.rim * 0.97);
      const f = Math.max(0, Math.min(1, fill));
      contents.visible = f > 0.02;
      const y = -size.height / 2 + 0.01 + f * size.height * 0.82;
      const r = size.foot + ((y + size.height / 2) / size.height) * (size.rim - size.foot);
      contents.position.y = y;
      contents.scale.setScalar(Math.max(0.001, r * 0.97));
    },
    dispose() {
      scene.remove(group);
      group.traverse((object) => object.geometry?.dispose?.());
      for (const m of owned) m.dispose();
    },
  };
}
