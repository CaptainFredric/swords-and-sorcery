import * as THREE from 'three';
import { GREENER_PASTURES, GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { GREENER_PRESENTATION, buildGreenerPasturesDecor, greenerBackdropHeight, greenerBackdropMeshHeight } from './greenerPasturesDecor.mjs';
import { FacetBuilder, KIT_PALETTE as P, facetMesh, kitMaterials, seededRandom, shadeColor, valueNoise } from './kit/facetKit.mjs';
import { cottage, createBatch, masonry, runOf, tree } from './kit/kitPieces.mjs';
import { floorColor, floorTile, outerTerrain, scatterGroundDetail } from './kit/kitTerrain.mjs';

export const GREENER_PASTURES_LIGHTING = GREENER_PRESENTATION;

// The meadow is deliberately broad. Coarse coloured ground facets and sparse detail keep the open distance
// legible over the extended chase route. All material batches are merged.
function meadowSurface(batch, floor, paths, random) {
  const [cx, , cz] = floor.center;
  const [sx, depth, sz] = floor.size;
  const x0 = cx - sx / 2;
  const z0 = cz - sz / 2;
  const nx = Math.ceil(sx / GREENER_PRESENTATION.groundCell);
  const nz = Math.ceil(sz / GREENER_PRESENTATION.groundCell);
  const colorAt = (x, z) => floorColor(floor.material, x, z, paths, random).lerp(shadeColor(0x749647, 1), 0.12);
  const colors = Array.from({ length: nx + 1 }, (_, i) => Array.from({ length: nz + 1 }, (_, j) => colorAt(x0 + sx * i / nx, z0 + sz * j / nz)));
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const xa = x0 + sx * i / nx;
      const xb = x0 + sx * (i + 1) / nx;
      const za = z0 + sz * j / nz;
      const zb = z0 + sz * (j + 1) / nz;
      const a = [xa, floor.y, za];
      const b = [xa, floor.y, zb];
      const c = [xb, floor.y, zb];
      const d = [xb, floor.y, za];
      batch.ground.triBlend(a, b, c, colors[i][j], colors[i][j + 1], colors[i + 1][j + 1]);
      batch.ground.triBlend(a, c, d, colors[i][j], colors[i + 1][j + 1], colors[i + 1][j]);
    }
  }
  const y = floor.y;
  const low = y - depth;
  const x1 = x0 + sx;
  const z1 = z0 + sz;
  batch.ground.quad([x1, low, z0], [x0, low, z0], [x0, y, z0], [x1, y, z0], P.earthDark);
  batch.ground.quad([x0, low, z1], [x1, low, z1], [x1, y, z1], [x0, y, z1], P.earthDark);
}

// Long field boundaries use larger weathered stones than the near bridge. This saves tens of thousands of
// tiny hidden masonry faces while retaining the same authoritative wall footprint and visible stone courses.
function fieldWall(batch, random, solid) {
  const run = runOf(solid);
  const rows = Math.max(1, Math.ceil(run.height / 0.65));
  const height = run.height / rows;
  for (let row = 0; row < rows; row += 1) {
    let along = -run.length / 2;
    while (along < run.length / 2 - 0.01) {
      const length = Math.min(1.8 + random() * 1.0, run.length / 2 - along);
      const [cx, cz] = run.at(along + length / 2);
      batch.stone.block({ cx, cy: run.bottom + row * height, cz, sx: Math.max(0.01, length - 0.025), sy: height - 0.018, sz: run.thickness,
        rotY: run.rotY, chamfer: 0.05, jitter: 0.018, color: shadeColor(P.stone, 0.9 + random() * 0.15), rand: random });
      along += length;
    }
  }
}

function pastureHedge(batch, random, solid) {
  const run = runOf(solid);
  const count = Math.ceil(run.length / 2.2);
  for (let i = 0; i < count; i += 1) {
    const [x, z] = run.at(-run.length / 2 + (i + 0.5) * run.length / count);
    batch.foliage.lump({ cx: x, cy: solid.center[1], cz: z, rx: run.alongX ? 1.3 : run.thickness * 0.6,
      ry: run.height * 0.53, rz: run.alongX ? run.thickness * 0.6 : 1.3,
      color: shadeColor(P.hedge, 0.92 + random() * 0.16), rand: random, squash: 0.12 });
  }
}

export class GreenerPasturesRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Greener Pastures';
    this.lighting = GREENER_PRESENTATION;
    this.presentation = GREENER_PRESENTATION;
    this.cameraFar = GREENER_PRESENTATION.cameraFar;
    this.ownsTerrainSkirts = true;
    this.decor = buildGreenerPasturesDecor();
    this.materials = kitMaterials();
    scene.background = new THREE.Color(this.lighting.background);
    scene.fog = new THREE.FogExp2(this.lighting.fog.color, this.lighting.fog.density);
    scene.add(this.group);
    this.#build();
  }

  #build() {
    const random = seededRandom(5713);
    const batch = createBatch();
    for (const floor of GREENER_PASTURES.floors) {
      if (floor.material === 'stone') floorTile(batch, floor, this.decor.paths, random);
      else meadowSurface(batch, floor, this.decor.paths, random);
    }
    this.#fieldPatches(batch, random);
    for (const ramp of GREENER_PASTURES.ramps) this.#ramp(batch, ramp, random);
    this.groundDetail = scatterGroundDetail(batch, {
      floors: GREENER_PASTURES.floors,
      paths: this.decor.paths,
      solids: GREENER_PASTURES.solids,
      seed: 108,
      density: { tufts: 0.016, flowers: 0.0015, pebbles: 0.004, clearOfPaths: 1.4, clearOfSolids: 0.5, clearOfEdges: 0.6 },
    });
    for (const solid of GREENER_PASTURES.solids) {
      if (solid.kind === 'tree' || solid.kind.startsWith('complaint-')) continue;
      if (solid.kind === 'hedge') pastureHedge(batch, random, solid);
      else if (solid.kind === 'bridge-footing') {
        const [cx, cy, cz] = solid.center;
        const [sx, sy, sz] = solid.size;
        batch.stone.block({ cx, cy: cy - sy / 2, cz, sx, sy, sz, color: P.stoneDark, rand: random, chamfer: 0.02, jitter: 0 });
      } else if (solid.kind === 'waystone') {
        const [cx, cy, cz] = solid.center;
        const [sx, sy, sz] = solid.size;
        batch.stone.block({ cx, cy: cy - sy / 2, cz, sx, sy, sz, color: P.stoneLight, rand: random, chamfer: 0.15, jitter: 0.04 });
        // A weathered cross cut near the crown, an ordinary old landmark rather than a glowing objective.
        batch.stone.block({ cx, cy: cy + sy / 2 - 0.9, cz: cz + sz / 2 + 0.006, sx: sx * 0.42, sy: 0.06, sz: 0.018, chamfer: 0, jitter: 0, color: P.stoneDark, rand: random });
        batch.stone.block({ cx, cy: cy + sy / 2 - 1.1, cz: cz + sz / 2 + 0.008, sx: 0.06, sy: 0.45, sz: 0.018, chamfer: 0, jitter: 0, color: P.stoneDark, rand: random });
      } else if (solid.kind === 'field-wall') fieldWall(batch, random, solid);
      else masonry(batch, random, solid, { style: 'drystone', color: solid.kind === 'parapet' ? P.stoneLight : P.stone, coping: true });
    }
    for (const item of this.decor.trees) tree(batch, random, item);
    this.#ravine(batch, random);
    this.#landscape(batch, random);
    for (const item of this.decor.forest) tree(batch, random, { ...item, y: greenerBackdropMeshHeight(item.x, item.z) });
    for (const house of this.decor.houses) {
      const samples = [];
      for (const fx of [-0.48, -0.24, 0, 0.24, 0.48]) {
        for (const fz of [-0.48, -0.24, 0, 0.24, 0.48]) {
          samples.push(greenerBackdropMeshHeight(house.x + house.sx * fx, house.z + house.sz * fz));
        }
      }
      const low = Math.min(...samples);
      const high = Math.max(...samples);
      // A short stone terrace bridges the coarse hillside beneath each distant cottage. The floor sits low
      // into the slope and the foundation reaches the visible mesh, so side settlements cannot levitate.
      const y = low + Math.min(0.42, (high - low) * 0.18);
      batch.stone.block({ cx: house.x, cy: low - 0.2, cz: house.z, sx: house.sx * 0.94,
        sy: Math.max(0.55, y - low + 0.4), sz: house.sz * 0.94, color: P.stoneDark, rand: random, chamfer: 0.04, jitter: 0.01 });
      cottage(batch, random, { center: [house.x, y + house.sy / 2, house.z], size: [house.sx, house.sy, house.sz] });
    }
    this.#distantCastle(batch, random);
    this.#complaintOffice(batch, random);
    this.triangleCount = 0;
    for (const [name, builder] of Object.entries(batch)) {
      if (!builder.triangleCount) continue;
      this.triangleCount += builder.triangleCount;
      this.group.add(facetMesh(builder, this.materials[name], { castShadow: name !== 'ground', receiveShadow: true, name: `greener-pastures-${name}` }));
    }
    this.#sky(random);
  }

  #fieldPatches(batch, random) {
    for (const patch of this.decor.fieldPatches ?? []) {
      const x0 = patch.x - patch.sx / 2;
      const z0 = patch.z - patch.sz / 2;
      const row = patch.sx / patch.rows;
      for (let i = 0; i < patch.rows; i += 1) {
        const inset = Math.min(0.42, row * 0.18);
        const xa = x0 + i * row + inset;
        const xb = x0 + (i + 1) * row - inset;
        const stagger = ((i % 3) - 1) * 1.4;
        const za = z0 + 1.8 + Math.max(0, stagger);
        const zb = z0 + patch.sz - 1.8 + Math.min(0, stagger);
        const tone = shadeColor(patch.color, 0.9 + random() * 0.14);
        batch.ground.quad([xa, 0.028, za], [xa, 0.028, zb], [xb, 0.028, zb], [xb, 0.028, za], tone);
      }
    }
  }

  #ramp(batch, ramp, random) {
    const { minX, maxX, minZ, maxZ, startY, endY } = ramp;
    const strips = Math.ceil((maxZ - minZ) / 1.2);
    for (let i = 0; i < strips; i += 1) {
      const t0 = i / strips;
      const t1 = (i + 1) / strips;
      const z0 = minZ + (maxZ - minZ) * t0;
      const z1 = minZ + (maxZ - minZ) * t1;
      const y0 = startY + (endY - startY) * t0;
      const y1 = startY + (endY - startY) * t1;
      batch.ground.quad([minX, y0, z0], [minX, y1, z1], [maxX, y1, z1], [maxX, y0, z0],
        shadeColor(P.paving, 0.88 + random() * 0.12));
    }
    for (const x of [minX, maxX]) {
      const side = [[x, -0.4, minZ], [x, -0.4, maxZ], [x, endY, maxZ], [x, startY, minZ]];
      if (x === maxX) side.reverse();
      batch.stone.quad(...side, P.stoneDark);
    }
  }

  #ravine(batch, random) {
    const { minX, maxX } = GREENER_ROUTE.bounds;
    const ravine = GREENER_ROUTE.bridge.ravineBounds;
    // Rock faces begin exactly at the bank floor edges and stay well below the crossable span.
    for (const [z, sign] of [[ravine.maxZ, -1], [ravine.minZ, 1]]) {
      for (let x = minX; x < maxX; x += 5) {
        const end = Math.min(maxX, x + 5);
        const a = [x, -0.4, z];
        const b = [end, -0.4, z];
        const c = [end, -12.5, z + sign * 2];
        const d = [x, -12.5, z + sign * 2];
        const tone = shadeColor(P.cliff, 0.83 + random() * 0.2);
        if (sign === -1) batch.stone.quad(a, b, c, d, tone);
        else batch.stone.quad(b, a, d, c, tone);
      }
    }
    batch.stone.quad([minX, -13, ravine.minZ], [minX, -13, ravine.maxZ], [maxX, -13, ravine.maxZ], [maxX, -13, ravine.minZ], P.cliffDark);
    // The old bridge retains masonry abutments beneath each deck; no geometry fills the missing twelve and a half metres.
    for (const floor of GREENER_PASTURES.floors.filter((floor) => floor.id === 'old-footbridge' || floor.id === 'bridge-south-deck')) {
      for (const x of [floor.center[0] - floor.size[0] / 2 + 0.8, floor.center[0] + floor.size[0] / 2 - 0.8]) {
        batch.stone.block({ cx: x, cy: -12.5, cz: floor.center[2], sx: 1.6, sy: 12.1, sz: floor.size[2], color: P.stoneDark, rand: random, chamfer: 0.12, jitter: 0.015 });
      }
    }
    // The stream is deep below the ordinary lethal fall plane, visibly separate from walkable ground.
    const water = new THREE.Mesh(new THREE.PlaneGeometry(650, 8), new THREE.MeshStandardMaterial({ color: 0x668f98, roughness: 0.38, metalness: 0.08, transparent: true, opacity: 0.82 }));
    water.name = 'greener-pastures-stream';
    water.rotation.x = -Math.PI / 2;
    water.position.set((minX + maxX) / 2, -12.25, (ravine.minZ + ravine.maxZ) / 2);
    this.group.add(water);
  }

  #landscape(batch, random) {
    const b = GREENER_ROUTE.bounds;
    const minZ = b.minZ - 220;
    const maxZ = b.maxZ + 220;
    const patches = [
      { minX: b.minX - 250, maxX: b.minX, minZ, maxZ },
      { minX: b.maxX, maxX: b.maxX + 250, minZ, maxZ },
      { minX: b.minX, maxX: b.maxX, minZ: b.maxZ, maxZ },
      { minX: b.minX, maxX: b.maxX, minZ, maxZ: b.minZ },
    ];
    for (const patch of patches) {
      outerTerrain(batch, {
        ...patch,
        cell: 14,
        exclude: () => false,
        heightAt: greenerBackdropHeight,
        colorAt: (x, y, z) => y < -2 ? shadeColor(P.cliffDark, 0.9 + random() * 0.1)
          : shadeColor(valueNoise(x * 0.025, z * 0.025, 52) < 0.42 ? 0x6b8545 : 0x7f9552, 0.86 + random() * 0.15),
      });
    }
  }

  #distantCastle(batch, random) {
    const x = 182;
    const z = GREENER_ROUTE.finalStand.z - 65;
    const y = greenerBackdropMeshHeight(x, z);
    const stone = 0x9eac99;
    batch.stone.block({ cx: x, cy: y, cz: z, sx: 23, sy: 12, sz: 17, color: stone, rand: random });
    for (const dx of [-11, 11]) {
      batch.stone.prism({ cx: x + dx, cy: y, cz: z + 7, radiusBottom: 4.2, radiusTop: 4.2, height: 19, sides: 8, color: stone, rand: random });
      batch.stone.prism({ cx: x + dx, cy: y + 19, cz: z + 7, radiusBottom: 4.5, radiusTop: 0, height: 7, sides: 8, color: 0x627675, rand: random });
    }
    batch.stone.block({ cx: x, cy: y + 12, cz: z, sx: 11, sy: 9, sz: 10, color: stone, rand: random });
  }

  #complaintOffice(batch, random) {
    const destination = this.decor.destination;
    const solids = GREENER_PASTURES.solids.filter(solid => solid.kind.startsWith('complaint-'));
    for (const solid of solids) {
      const [cx, cy, cz] = solid.center;
      const [sx, sy, sz] = solid.size;
      const bottom = cy - sy / 2;
      if (solid.kind === 'complaint-wing') {
        batch.stone.block({ cx, cy: bottom, cz, sx, sy: 1.1, sz, color: P.stone, rand: random, chamfer: 0.06 });
        batch.stone.block({ cx, cy: bottom + 1.1, cz, sx, sy: sy - 1.1, sz, color: P.plaster, rand: random, chamfer: 0.02, jitter: 0 });
        const front = cz + sz / 2 + 0.035;
        for (const x of [cx - sx / 2 + 0.12, cx, cx + sx / 2 - 0.12]) {
          batch.wood.block({ cx: x, cy: bottom + 1, cz: front, sx: 0.24, sy: sy - 1, sz: 0.12, color: P.timberDark, rand: random, chamfer: 0.01, jitter: 0 });
        }
        for (const height of [1.1, 3.4, sy - 0.18]) {
          batch.wood.block({ cx, cy: bottom + height, cz: front, sx, sy: 0.22, sz: 0.12, color: P.timberDark, rand: random, chamfer: 0.01, jitter: 0 });
        }
        // Leaded windows belong to the two wings. They create an unmistakable institution without suggesting
        // a walkable door through a solid wall; the actual entrance is the broad opening between the wings.
        for (const dx of [-sx * 0.25, sx * 0.25]) {
          batch.wood.block({ cx: cx + dx, cy: bottom + 1.8, cz: front + 0.02, sx: 1.45, sy: 1.25, sz: 0.08, color: 0x3e4e4d, rand: random, chamfer: 0.02, jitter: 0 });
          batch.metal.block({ cx: cx + dx, cy: bottom + 1.8, cz: front + 0.08, sx: 0.07, sy: 1.25, sz: 0.04, color: P.brassDark, rand: random, chamfer: 0, jitter: 0 });
        }
      } else if (solid.kind === 'complaint-lintel') {
        batch.wood.block({ cx, cy: bottom, cz, sx, sy, sz, color: P.timber, rand: random, chamfer: 0.05, jitter: 0 });
      } else if (solid.kind === 'complaint-roof') {
        batch.wood.block({ cx, cy: bottom, cz, sx, sy, sz, color: P.timberDark, rand: random, chamfer: 0.04, jitter: 0 });
        batch.stone.roof({ cx, cy: bottom + sy, cz, sx, sz, height: 3.8, overhang: 0.55, ridge: sx * 0.65, color: 0x70493e, rand: random });
      } else if (solid.kind === 'complaint-sign') {
        batch.wood.block({ cx, cy: bottom, cz, sx, sy, sz, color: P.timberDark, rand: random, chamfer: 0.035, jitter: 0 });
      }
    }
    const sign = destination.sign;
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 288;
    const context = canvas.getContext('2d');
    context.fillStyle = '#d9c58e';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#5b3925';
    context.lineWidth = 16;
    context.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
    context.fillStyle = '#322217';
    context.font = 'bold 188px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(sign.text, canvas.width / 2, canvas.height / 2 + 5, canvas.width - 110);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sign.width - 0.28, sign.height - 0.16),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 }));
    mesh.name = 'greener-pastures-tattle-sign';
    mesh.userData.text = sign.text;
    mesh.position.set(sign.center[0], sign.center[1], sign.center[2] + 0.12);
    this.sign = mesh;
    this.group.add(mesh);
  }

  #sky(random) {
    const radius = 650;
    const geometry = new THREE.SphereGeometry(radius, 24, 12);
    const position = geometry.getAttribute('position');
    const colors = [];
    const zenith = new THREE.Color(this.lighting.sky.zenith);
    const horizon = new THREE.Color(this.lighting.sky.horizon);
    const below = new THREE.Color(this.lighting.sky.below);
    for (let i = 0; i < position.count; i += 1) {
      const t = position.getY(i) / radius;
      const color = t >= 0 ? horizon.clone().lerp(zenith, Math.pow(t, 0.62)) : horizon.clone().lerp(below, Math.min(1, -t * 3));
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    this.sky.name = 'greener-pastures-sky';
    this.sky.renderOrder = -1;
    this.group.add(this.sky);
    const clouds = new FacetBuilder();
    for (const cloud of this.decor.clouds) {
      for (let i = 0; i < 3; i += 1) {
        clouds.lump({ cx: cloud.x + (i - 1) * cloud.scale * 0.6, cy: cloud.y + (i === 1 ? 2 : 0), cz: cloud.z, rx: cloud.scale, ry: cloud.scale * 0.34, rz: cloud.scale * 0.48, color: 0xf5f4e6, rand: random, shade: 0.04, squash: 0.12 });
      }
    }
    const cloudMesh = facetMesh(clouds, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), { castShadow: false, receiveShadow: false, name: 'greener-pastures-clouds' });
    this.group.add(cloudMesh);
  }

  update(timeSec, camera = null) {
    if (camera) this.sky.position.copy(camera.position);
  }

  dispose() {
    this.scene.remove(this.group);
    const materials = new Set(Object.values(this.materials));
    this.group.traverse((object) => {
      object.geometry?.dispose?.();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
    });
    for (const material of materials) {
      material.map?.dispose?.();
      material.dispose();
    }
  }
}
