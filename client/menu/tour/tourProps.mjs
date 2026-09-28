import * as THREE from 'three';

// What happens to the Spellblade's rivals on his round, made of their own armour: a knight charred black, a knight
// fallen apart into the pieces he was built from, a sword cut in two, a white flag. Everything here works on a live
// third-person Spellblade instance (createSpellbladeAsset) and leaves it restorable for the next round.

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const CHAR = new THREE.Color(0x17130f);
const EMBER = new THREE.Color(0xff5a1a);

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
        base.set(copy, { color: copy.color?.clone(), emissive: copy.emissive?.clone(), emissiveIntensity: copy.emissiveIntensity ?? 1 });
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
    restore() {
      for (const [material, original] of base) {
        if (original.color) material.color.copy(original.color);
        if (original.emissive) material.emissive.copy(original.emissive);
        material.emissiveIntensity = original.emissiveIntensity;
      }
    },
  };
}

// a skinned mesh's triangles as they stand right now, in world space, each labelled with the bone that moves it most
function bakedTriangles(mesh) {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const skinIndex = geometry.attributes.skinIndex;
  const skinWeight = geometry.attributes.skinWeight;
  const color = geometry.attributes.color;
  const uv = geometry.attributes.uv;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  mesh.updateMatrixWorld(true);
  const world = new Float32Array(position.count * 3);
  const bone = new Int16Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, _v); else _v.fromBufferAttribute(position, i);
    _v.applyMatrix4(mesh.matrixWorld);
    world[i * 3] = _v.x; world[i * 3 + 1] = _v.y; world[i * 3 + 2] = _v.z;
    if (skinIndex && skinWeight) {
      let best = 0;
      let weight = -1;
      for (let k = 0; k < 4; k += 1) {
        const w = skinWeight.getComponent(i, k);
        if (w > weight) { weight = w; best = skinIndex.getComponent(i, k); }
      }
      bone[i] = best;
    }
  }
  const triangles = [];
  for (let t = 0; t < count; t += 3) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k));
    triangles.push({ ids, bone: bone[ids[0]] });
  }
  return { triangles, world, color, uv };
}

// a static mesh from some of those triangles, centred on their middle (returned as its world position)
function pieceFrom(baked, triangles, material) {
  const positions = [];
  const colors = baked.color ? [] : null;
  const uvs = baked.uv ? [] : null;
  const centre = new THREE.Vector3();
  for (const { ids } of triangles) {
    for (const id of ids) {
      positions.push(baked.world[id * 3], baked.world[id * 3 + 1], baked.world[id * 3 + 2]);
      centre.x += baked.world[id * 3]; centre.y += baked.world[id * 3 + 1]; centre.z += baked.world[id * 3 + 2];
      if (colors) colors.push(baked.color.getX(id), baked.color.getY(id), baked.color.getZ(id));
      if (uvs) uvs.push(baked.uv.getX(id), baked.uv.getY(id));
    }
  }
  centre.divideScalar(positions.length / 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= centre.x; positions[i + 1] -= centre.y; positions[i + 2] -= centre.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, baked.color.itemSize === 4 ? 3 : 3));
  if (uvs) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(centre);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
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
  // draw call or two instead of one for every plate (and as many again for their shadows)
  #merge() {
    const groups = new Map();
    for (const piece of this.pieces) {
      const { geometry, material } = piece.mesh;
      const names = Object.keys(geometry.attributes).sort();
      const key = `${names.join(',')}`;
      if (!groups.has(material)) groups.set(material, new Map());
      const shapes = groups.get(material);
      if (!shapes.has(key)) shapes.set(key, []);
      shapes.get(key).push(piece);
    }
    const merged = [];
    for (const [material, shapes] of groups) {
      for (const pieces of shapes.values()) {
        const names = Object.keys(pieces[0].mesh.geometry.attributes);
        const parts = Object.fromEntries(names.map((name) => [name, []]));
        for (const { mesh } of pieces) {
          mesh.updateMatrixWorld();
          const placed = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          placed.applyMatrix4(mesh.matrixWorld);
          for (const name of names) parts[name].push(placed.attributes[name].array);
          placed.dispose();
          this.scene.remove(mesh);
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
        mesh.visible = pieces[0].mesh.visible;
        this.scene.add(mesh);
        merged.push({ mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), delay: 0, landed: 0, resting: true, merged: true });
      }
    }
    this.pieces = merged;
  }

  clear() {
    for (const piece of this.pieces) {
      this.scene.remove(piece.mesh);
      piece.mesh.geometry.dispose();
    }
    this.pieces = [];
  }
}

/**
 * The knight falls apart: every piece of his armour (split by the bone it rides on) drops where it was, pushed a
 * little outward and set tumbling, and he himself is hidden. `random` makes it the same every round.
 */
export function shatterKnight(instance, debris, random = Math.random) {
  const centre = new THREE.Vector3();
  instance.root.getWorldPosition(centre);
  instance.root.traverse((object) => {
    if (!object.isMesh || !object.visible || !object.geometry?.attributes?.position) return;
    if (object.geometry.attributes.position.count < 12) return;   // the palm's sorcery shards just go out
    const baked = bakedTriangles(object);
    const groups = new Map();
    for (const triangle of baked.triangles) {
      if (!groups.has(triangle.bone)) groups.set(triangle.bone, []);
      groups.get(triangle.bone).push(triangle);
    }
    for (const triangles of groups.values()) {
      const piece = pieceFrom(baked, triangles, object.material);
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
  });
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
  let reach = 0;
  const upper = [];
  const lower = [];
  for (const mesh of swords) {
    const baked = bakedTriangles(mesh);
    for (const triangle of baked.triangles) {
      const along = triangle.ids.reduce((sum, id) => sum + _v.set(baked.world[id * 3], baked.world[id * 3 + 1], baked.world[id * 3 + 2]).sub(grip).dot(axis), 0) / 3;
      reach = Math.max(reach, along);
      (along > 0 ? upper : lower).push({ mesh, baked, triangle, along });
    }
  }
  const cut = reach * at;
  const byMesh = (list) => {
    const out = new Map();
    for (const entry of list) {
      if (!out.has(entry.mesh)) out.set(entry.mesh, { baked: entry.baked, triangles: [] });
      out.get(entry.mesh).triangles.push(entry.triangle);
    }
    return out;
  };
  const kept = [...lower, ...upper.filter((entry) => entry.along <= cut)];
  const thrown = upper.filter((entry) => entry.along > cut);
  const stub = new THREE.Group();
  for (const [mesh, { baked, triangles }] of byMesh(kept)) {
    const piece = pieceFrom(baked, triangles, mesh.material);
    stub.add(piece);
  }
  // the stub rides the hand from here on
  socket.attach(stub);
  for (const [mesh, { baked, triangles }] of byMesh(thrown)) {
    debris.add(pieceFrom(baked, triangles, mesh.material), {
      velocity: throwDirection.clone().multiplyScalar(2.2).add(new THREE.Vector3(0, 2.4, 0)),
      spin: new THREE.Vector3(9, 2, 6),
    });
  }
  for (const mesh of swords) mesh.visible = false;
  return stub;
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
