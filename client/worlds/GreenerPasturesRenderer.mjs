import { GREENER_FARM_PROPS } from '../../shared/worlds/greenerFarm.mjs';
import { farmPiece } from './kit/farmPieces.mjs';
import * as THREE from 'three';
import { GREENER_PASTURES, GREENER_ROUTE, greenerBridgeRetryFloor } from '../../shared/worlds/greenerPastures.mjs';
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
  const count = Math.ceil(run.length / 3.2);
  for (let i = 0; i < count; i += 1) {
    const [x, z] = run.at(-run.length / 2 + (i + 0.5) * run.length / count);
    batch.foliage.lump({ cx: x, cy: solid.center[1], cz: z, rx: run.alongX ? 1.8 : run.thickness * 0.6,
      ry: run.height * 0.53, rz: run.alongX ? run.thickness * 0.6 : 1.8,
      color: shadeColor(P.hedge, 0.92 + random() * 0.16), rand: random, squash: 0.12 });
  }
}

// Indoors, out of the sun, a surface returns a little of its own colour as warm light, as if lamp-lit: no real
// light (dear on phones) is added to every material in the meadow for one room.
function lampLitMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * vec3(0.34, 0.27, 0.18);');
  };
  material.customProgramCacheKey = () => 'greener-lamp-lit';
  return material;
}

// A painted board or a printed notice: drawn once to a canvas and shown on a plane (its words kept as userData.text).
function paintedPanel(name, width, height, paint, { lit = false } = {}) {
  const scale = Math.min(512, 2048 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const text = paint(canvas.getContext('2d'), canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 });
  if (lit) {
    material.emissive.set(0xffffff);
    material.emissiveMap = texture;
    material.emissiveIntensity = 0.28;
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.name = name;
  mesh.userData.text = text;
  return mesh;
}

function lettering(g, text, x, y, size, { weight = 'bold', family = 'serif', color, maxWidth, spacing = 0 } = {}) {
  g.font = `${weight} ${Math.round(size)}px ${family}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  g.fillText(text, x, y, maxWidth);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}

// Where the court's paving is never seen: under the office's walls and under its floorboards (whole one-metre setts,
// so no cut cell changes the build's seeded stream). The passage keeps its paving.
function officeFootprint() {
  const box = id => GREENER_PASTURES.solids.find(solid => solid.id === id);
  const rect = solid => ({ minX: solid.center[0] - solid.size[0] / 2, maxX: solid.center[0] + solid.size[0] / 2,
    minZ: solid.center[2] - solid.size[2] / 2, maxZ: solid.center[2] + solid.size[2] / 2 });
  const west = rect(box('complaint-west-wing'));
  const east = rect(box('complaint-east-wing'));
  const rear = rect(box('complaint-rear-wall'));
  const whole = r => ({ minX: Math.ceil(r.minX), maxX: Math.floor(r.maxX), minZ: Math.ceil(r.minZ), maxZ: Math.floor(r.maxZ) });
  return [whole(west), whole(east), whole({ minX: west.minX, maxX: east.maxX, minZ: rear.maxZ, maxZ: west.minZ })];
}

// A stone gatepost: shaft, cap, a low pyramid on top.
function gatepost(batch, random, solid) {
  const [cx, cy, cz] = solid.center;
  const [sx, sy, sz] = solid.size;
  const bottom = cy - sy / 2;
  batch.stone.block({ cx, cy: bottom, cz, sx, sy: sy - 0.2, sz, color: P.stone, rand: random, chamfer: 0.05, jitter: 0.02 });
  batch.stone.block({ cx, cy: bottom + sy - 0.2, cz, sx: sx + 0.16, sy: 0.2, sz: sz + 0.16, color: P.stoneLight, rand: random, chamfer: 0.04, jitter: 0.01 });
  batch.stone.prism({ cx, cy: bottom + sy, cz, radiusBottom: sx * 0.5, radiusTop: 0, height: 0.36, sides: 4, rotY: Math.PI / 4, color: P.stoneLight, rand: random });
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
    this.materials = { ...kitMaterials(), interior: lampLitMaterial(), lamp: new THREE.MeshBasicMaterial({ vertexColors: true }) };
    scene.background = new THREE.Color(this.lighting.background);
    scene.fog = new THREE.FogExp2(this.lighting.fog.color, this.lighting.fog.density);
    scene.add(this.group);
    this.#build();
    this.bridgeRetries = 0;
  }

  setBridgeRetries(failures) {
    const floor = greenerBridgeRetryFloor(failures);
    const length = floor?.size[2] ?? 0;
    if (length === this.bridgeRetries) return false;
    if (this.retryDeck) { this.group.remove(this.retryDeck); this.retryDeck.geometry.dispose(); this.retryDeck = null; }
    this.bridgeRetries = length;
    if (floor) {
      const batch = createBatch();
      floorTile(batch, floor, [], seededRandom(5713));
      this.retryDeck = facetMesh(batch.ground, this.materials.ground, { receiveShadow: true, name: 'bridge-retry-deck' });
      this.retryDeck.userData.floor = floor;
      this.group.add(this.retryDeck);
    }
    return true;
  }

  #build() {
    const random = seededRandom(5713);
    const batch = { ...createBatch(), interior: new FacetBuilder(), lamp: new FacetBuilder() };
    for (const floor of GREENER_PASTURES.floors) {
      if (floor.id === 'complaint-court') floorTile(batch, floor, this.decor.paths, random, officeFootprint());
      else if (floor.material === 'stone') floorTile(batch, floor, this.decor.paths, random);
      else meadowSurface(batch, floor, this.decor.paths, random);
    }
    this.#fieldPatches(batch, random);
    for (const ramp of GREENER_PASTURES.ramps) this.#ramp(batch, ramp, random);
    this.groundDetail = scatterGroundDetail(batch, {
      floors: GREENER_PASTURES.floors,
      paths: this.decor.paths,
      solids: GREENER_PASTURES.solids,
      seed: 108,
      density: { tufts: 0.010, flowers: 0.0015, pebbles: 0.003, clearOfPaths: 1.4, clearOfSolids: 0.5, clearOfEdges: 0.6 },
    });
    for (const solid of GREENER_PASTURES.solids) {
      if (solid.kind.startsWith('farm-') || solid.kind === 'tree' || solid.kind.startsWith('complaint-') || solid.kind.startsWith('exit-')) continue;
      if (solid.kind === 'hedge') pastureHedge(batch, random, solid);
      else if (solid.kind === 'opening-fence') farmPiece(batch, random, { kind: 'fence', center: solid.center, size: solid.size });
      else if (solid.kind === 'gatepost') gatepost(batch, random, solid);
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
    for (const item of GREENER_FARM_PROPS) farmPiece(batch, random, item);
    this.#cartLanes(batch);
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
    this.#exitGate(batch, random);
    this.triangleCount = 0;
    for (const [name, builder] of Object.entries(batch)) {
      if (!builder.triangleCount) continue;
      this.triangleCount += builder.triangleCount;
      this.group.add(facetMesh(builder, this.materials[name], { castShadow: name !== 'ground' && name !== 'lamp', receiveShadow: name !== 'lamp', name: `greener-pastures-${name}` }));
    }
    this.#sky(random);
  }

  #cartLanes(batch) {
    // Precise worn strips complement the coarse meadow facets, with wheel ruts on each side.
    for (const path of this.decor.paths) for (let i=1;i<path.length;i++) {
      const [ax,az]=path[i-1], [bx,bz]=path[i], length=Math.hypot(bx-ax,bz-az);
      if(!length)continue;
      const nx=-(bz-az)/length,nz=(bx-ax)/length;
      // Never draw earth across a missing ravine floor or over the elevated deck.
      if(Math.min(az,bz)<-637 && Math.max(az,bz)>-695)continue;
      const strip=(offset,width,color)=>{
        const a=offset-width/2,b=offset+width/2;
        const y = offset ? .023 : .018;
        batch.ground.quad([ax+nx*a,y,az+nz*a],[ax+nx*b,y,az+nz*b],
          [bx+nx*b,y,bz+nz*b],[bx+nx*a,y,bz+nz*a],color);
      };
      strip(0,3.6,0x7c7e46);strip(-.85,.2,0x726344);strip(.85,.2,0x726344);
    }
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

  // TATTLE ON YOU: a small, proud civic office. Outside, stone quoins, a string course and cornice, framed
  // windows, a quoined doorway with its doors folded back, lanterns, a paved entry and a notice board; inside,
  // through the passage, one lamp-lit room: waiting benches, a counter with its grille and bell, files, a desk.
  // Three notices, no more: the joke is that the place exists, and that it is sincere.
  #complaintOffice(batch, random) {
    const solids = new Map(GREENER_PASTURES.solids.filter(solid => solid.kind.startsWith('complaint-')).map(solid => [solid.id, solid]));
    const box = (builder, o) => batch[builder].block({ chamfer: 0, jitter: 0, shade: 0.06, rand: random, ...o });
    const west = solids.get('complaint-west-wing');
    const east = solids.get('complaint-east-wing');
    const lintel = solids.get('complaint-lintel');
    const front = west.center[2] + west.size[2] / 2;                          // the facade (z)
    const back = west.center[2] - west.size[2] / 2;                           // the room's front wall (z)
    const rear = solids.get('complaint-rear-wall');
    const rearInner = rear.center[2] + rear.size[2] / 2;
    const rearOuter = rear.center[2] - rear.size[2] / 2;
    const left = west.center[0] - west.size[0] / 2;                           // the building's outer sides (x)
    const right = east.center[0] + east.size[0] / 2;
    const doorWest = west.center[0] + west.size[0] / 2;
    const doorEast = east.center[0] - east.size[0] / 2;
    const middle = (doorWest + doorEast) / 2;
    const roofSlab = solids.get('complaint-roof');
    const eaves = roofSlab.center[1] - roofSlab.size[1] / 2;                  // 8.1
    const roomWest = solids.get('complaint-room-west');
    const roomEast = solids.get('complaint-room-east');
    const inLeft = roomWest.center[0] + roomWest.size[0] / 2;                // the room inside (x, z)
    const inRight = roomEast.center[0] - roomEast.size[0] / 2;
    const ceiling = solids.get('complaint-room-roof').center[1] - solids.get('complaint-room-roof').size[1] / 2;
    const stoneTrim = () => shadeColor(P.stoneLight, 0.95 + random() * 0.09);

    // ---- the shell: plinth, plaster to the eaves, a string course and a two-step cornice right round ----
    for (const solid of [west, east, solids.get('complaint-room-west'), solids.get('complaint-room-east'), rear]) {
      const [cx, cy, cz] = solid.center;
      const [sx, sy, sz] = solid.size;
      const bottom = cy - sy / 2;
      box('stone', { cx, cy: bottom, cz, sx, sy: 1.1, sz, color: P.stone });
      box('stone', { cx, cy: bottom + 1.1, cz, sx, sy: eaves - bottom - 1.1, sz, color: P.plaster });
    }
    const band = (y, height, proud, { door = false } = {}) => {
      const spans = door ? [[left - proud, doorWest], [doorEast, right + proud]] : [[left - proud, right + proud]];
      for (const [a, b] of spans) box('stone', { cx: (a + b) / 2, cy: y, cz: front + proud / 2, sx: b - a, sy: height, sz: proud, color: stoneTrim() });
      box('stone', { cx: middle, cy: y, cz: rearOuter - proud / 2, sx: right - left + proud * 2, sy: height, sz: proud, color: stoneTrim() });
      for (const x of [left - proud / 2, right + proud / 2]) {
        box('stone', { cx: x, cy: y, cz: (front + rearOuter) / 2, sx: proud, sy: height, sz: front - rearOuter, color: stoneTrim() });
      }
    };
    band(3.85, 0.22, 0.1, { door: true });
    band(7.55, 0.55, 0.2);
    // quoins at the outer corners (returning round them) and up both door jambs, long and short in turn
    const courses = 10;
    const course = (7.55 - 1.1) / courses;
    for (const [x, inward, corner] of [[left, 1, true], [doorWest, -1, false], [doorEast, 1, false], [right, -1, true]]) {
      for (let i = 0; i < courses; i += 1) {
        const face = i % 2 ? 0.5 : 0.85;
        const turn = i % 2 ? 0.85 : 0.5;
        const y = 1.1 + i * course + 0.02;
        box('stone', { cx: x + inward * (face / 2 - 0.05), cy: y, cz: front + 0.05, sx: face, sy: course - 0.04, sz: 0.1, color: stoneTrim() });
        if (corner) box('stone', { cx: x - inward * 0.05, cy: y, cz: front - turn / 2 + 0.05, sx: 0.1, sy: course - 0.04, sz: turn, color: stoneTrim() });
      }
    }

    // ---- windows: stone surrounds, sills, glazing bars; shutters on the outer pair ----
    const pane = 0x34474b;
    const windowAt = (x, sill, w, h, shutters) => {
      box('stone', { cx: x, cy: sill - 0.14, cz: front + 0.09, sx: w + 0.42, sy: 0.14, sz: 0.2, color: stoneTrim(), chamfer: 0.02 });
      box('stone', { cx: x, cy: sill + h, cz: front + 0.06, sx: w + 0.36, sy: 0.2, sz: 0.12, color: stoneTrim() });
      for (const side of [-1, 1]) box('stone', { cx: x + side * (w / 2 + 0.09), cy: sill, cz: front + 0.05, sx: 0.18, sy: h, sz: 0.1, color: stoneTrim() });
      box('wood', { cx: x, cy: sill, cz: front + 0.01, sx: w, sy: h, sz: 0.02, color: pane });
      box('wood', { cx: x, cy: sill, cz: front + 0.035, sx: 0.05, sy: h, sz: 0.03, color: P.timberDark });
      for (const f of [0.36, 0.68]) box('wood', { cx: x, cy: sill + h * f, cz: front + 0.035, sx: w, sy: 0.05, sz: 0.03, color: P.timberDark });
      if (!shutters) return;
      for (const side of [-1, 1]) {
        const sx = x + side * (w / 2 + 0.18 + w * 0.26);
        box('wood', { cx: sx, cy: sill + 0.02, cz: front + 0.05, sx: w * 0.5, sy: h - 0.04, sz: 0.06, color: 0x52604d });
        for (const f of [0.18, 0.78]) box('wood', { cx: sx, cy: sill + h * f, cz: front + 0.09, sx: w * 0.5 - 0.08, sy: 0.07, sz: 0.02, color: 0x44513f });
      }
    };
    for (const [x, shutters] of [[left + 2.9, true], [doorWest - 2.6, false], [doorEast + 2.6, false], [right - 2.9, true]]) windowAt(x, 1.5, 1.2, 1.45, shutters);
    for (const x of [left + 2.9, right - 2.9]) windowAt(x, 4.45, 1.1, 1.3, false);

    // ---- the doorway: a stone sill, the lintel's soffit, the doors standing open against the passage walls ----
    box('stone', { cx: middle, cy: 0, cz: front - 0.05, sx: doorEast - doorWest, sy: 0.05, sz: 0.5, color: P.stoneLight, chamfer: 0.02 });
    box('wood', { cx: middle, cy: lintel.center[1] - lintel.size[1] / 2, cz: lintel.center[2], sx: lintel.size[0], sy: lintel.size[1], sz: lintel.size[2], color: P.timber, bottom: true });
    for (const [x, side] of [[doorWest, 1], [doorEast, -1]]) {
      const cz = front - 0.95 - 1.45;
      box('wood', { cx: x + side * 0.06, cy: 0.04, cz, sx: 0.1, sy: 4.5, sz: 2.9, color: P.timber });
      for (let i = 1; i < 4; i += 1) box('wood', { cx: x + side * 0.115, cy: 0.04, cz: cz - 1.45 + i * 0.725, sx: 0.012, sy: 4.5, sz: 0.03, color: P.timberDark });
      for (const y of [0.6, 2.25, 3.9]) box('metal', { cx: x + side * 0.125, cy: y, cz: front - 0.95 - 0.9, sx: 0.025, sy: 0.12, sz: 1.8, color: P.iron });
    }
    // (the court is paved already, through the passage and up to the door: the floor's own tiles)

    // ---- lanterns on both jambs ----
    const lantern = (x, y, z) => {
      box('metal', { cx: x, cy: y + 0.22, cz: front + 0.11, sx: 0.12, sy: 0.4, sz: 0.04, color: P.iron });
      box('metal', { cx: x, cy: y + 0.52, cz: (front + z) / 2, sx: 0.04, sy: 0.04, sz: z - front, color: P.iron });
      box('metal', { cx: x, cy: y - 0.06, cz: z, sx: 0.24, sy: 0.06, sz: 0.24, color: P.iron, bottom: true });
      box('lamp', { cx: x, cy: y, cz: z, sx: 0.17, sy: 0.3, sz: 0.17, color: 0xffd28e, bottom: true });
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) box('metal', { cx: x + dx * 0.095, cy: y, cz: z + dz * 0.095, sx: 0.03, sy: 0.3, sz: 0.03, color: P.iron });
      batch.metal.prism({ cx: x, cy: y + 0.3, cz: z, radiusBottom: 0.19, radiusTop: 0.03, height: 0.2, sides: 4, rotY: Math.PI / 4, color: P.iron, rand: random });
    };
    lantern(doorWest - 0.45, 3.35, front + 0.46);
    lantern(doorEast + 0.45, 3.35, front + 0.46);

    // ---- the eaves: a deep timber frieze, a painted fascia, corbels; the roof with its ridge and a chimney ----
    {
      const [cx, cy, cz] = roofSlab.center;
      const [sx, sy, sz] = roofSlab.size;
      box('wood', { cx, cy: cy - sy / 2, cz, sx, sy, sz, color: P.timberDark, bottom: true });
      const fascia = cz + sz / 2;
      box('wood', { cx, cy: eaves + 0.04, cz: fascia + 0.04, sx: sx + 0.1, sy: 0.16, sz: 0.08, color: P.cream });
      box('wood', { cx, cy: eaves + sy - 0.2, cz: fascia + 0.04, sx: sx + 0.1, sy: 0.16, sz: 0.08, color: P.cream });
      for (let x = left + 0.6; x <= right - 0.55; x += 2.15) {
        box('wood', { cx: x, cy: eaves - 0.42, cz: (front + fascia) / 2 + 0.1, sx: 0.22, sy: 0.42, sz: fascia - front - 0.2, color: P.timber, bottom: true });
      }
      const top = cy + sy / 2;
      batch.stone.roof({ cx, cy: top, cz, sx, sz, height: 3.8, overhang: 0.55, ridge: sx * 0.65, color: 0x70493e, rand: random });
      const hx = sx / 2 + 0.55;
      const ridge = Math.min(sx * 0.65, hx * 0.9);
      box('stone', { cx, cy: top + 3.72, cz, sx: ridge * 2 + 0.3, sy: 0.2, sz: 0.42, color: 0x5a3a31 });
      box('stone', { cx: right - 4.5, cy: top + 0.6, cz: rearInner + 2.6, sx: 1.05, sy: 4.4, sz: 0.95, color: P.stoneDark, chamfer: 0.04, jitter: 0.01 });
      box('stone', { cx: right - 4.5, cy: top + 5.0, cz: rearInner + 2.6, sx: 1.3, sy: 0.22, sz: 1.2, color: P.stone, chamfer: 0.03 });
    }

    // ---- the sign: its board, a gilt frame, two iron brackets back to the facade ----
    {
      const sign = solids.get('complaint-sign');
      const [cx, cy, cz] = sign.center;
      const [sx, sy, sz] = sign.size;
      box('wood', { cx, cy: cy - sy / 2, cz, sx, sy, sz, color: P.timberDark, chamfer: 0.035, bottom: true });
      const face = cz + sz / 2 + 0.035;
      box('metal', { cx, cy: cy + sy / 2 - 0.12, cz: face, sx: sx + 0.16, sy: 0.16, sz: 0.07, color: P.brassDark });
      box('metal', { cx, cy: cy - sy / 2 - 0.04, cz: face, sx: sx + 0.16, sy: 0.16, sz: 0.07, color: P.brassDark });
      for (const side of [-1, 1]) {
        box('metal', { cx: cx + side * (sx / 2 - 0.04), cy: cy - sy / 2 - 0.04, cz: face, sx: 0.16, sy: sy + 0.08, sz: 0.07, color: P.brassDark });
        box('metal', { cx: cx + side * (sx / 2 - 1.2), cy: cy + sy / 2 - 0.05, cz: (front + cz) / 2, sx: 0.07, sy: 0.07, sz: cz - front, color: P.iron });
        box('metal', { cx: cx + side * (sx / 2 - 1.2), cy: cy + sy / 2 - 0.05, cz: front + 0.03, sx: 0.08, sy: 0.55, sz: 0.04, color: P.iron });
      }
    }

    // ---- the notice board out front ----
    {
      const board = solids.get('complaint-notice-board');
      const [cx, , cz] = board.center;
      const [sx, sy] = board.size;
      for (const side of [-1, 1]) box('wood', { cx: cx + side * (sx / 2 - 0.1), cy: 0, cz, sx: 0.16, sy: sy + 0.1, sz: 0.16, color: P.timberDark });
      box('wood', { cx, cy: 0.88, cz, sx, sy: 1.38, sz: 0.1, color: P.timberDark, bottom: true });
      box('wood', { cx, cy: 0.93, cz: cz + 0.05, sx: sx - 0.14, sy: 1.28, sz: 0.02, color: 0x8b6f4c });
      batch.wood.roof({ cx, cy: sy + 0.02, cz, sx, sz: 0.3, height: 0.32, overhang: 0.16, ridge: sx * 0.42, color: P.timber, rand: random });
      // two plain notices beside the poster; nothing written that matters
      for (const [dx, y, w, h, tilt, tone] of [[-0.88, 1.66, 0.46, 0.6, 0.05, 0xeee6cf], [0.9, 1.5, 0.44, 0.56, -0.04, 0xe8dcab]]) {
        const c = Math.cos(tilt), s = Math.sin(tilt);
        const at = (u, v) => [cx + dx + u * c - v * s, y + u * s + v * c, cz + 0.068];
        batch.cloth.quad(at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2), tone);
        box('metal', { cx: at(0, h / 2 - 0.04)[0], cy: at(0, h / 2 - 0.04)[1], cz: cz + 0.07, sx: 0.03, sy: 0.03, sz: 0.02, color: P.brass });
      }
    }

    // ---- inside: floorboards, wainscot and plaster, a beamed ceiling ----
    const room = batch.interior;
    const panel = (builder, p, u, v, color) => builder.quad(p, [p[0] + u[0], p[1] + u[1], p[2] + u[2]],
      [p[0] + u[0] + v[0], p[1] + u[1] + v[1], p[2] + u[2] + v[2]], [p[0] + v[0], p[1] + v[1], p[2] + v[2]], color);
    for (let x = inLeft, i = 0; x < inRight - 0.01; x += 0.4, i += 1) {
      const w = Math.min(0.4, inRight - x);
      panel(room, [x, 0.02, back], [w, 0, 0], [0, 0, rearInner - back], shadeColor([0x6e5139, 0x654a34, 0x74573d][i % 3], 0.94 + random() * 0.1));
    }
    const plaster = 0xd8c9a6;
    const wainscot = 0x5e4330;
    const skin = (p, u, height0, height1, color) => panel(room, [p[0], height0, p[2]], u, [0, height1 - height0, 0], color);
    const walls = [
      // [start, along]: each runs so that it faces into the room
      [[inLeft + 0.012, 0, back], [0, 0, rearInner - back]],
      [[inRight - 0.012, 0, rearInner], [0, 0, back - rearInner]],
      [[inLeft, 0, rearInner + 0.012], [inRight - inLeft, 0, 0]],
      [[doorWest, 0, back - 0.012], [inLeft - doorWest, 0, 0]],
      [[inRight, 0, back - 0.012], [doorEast - inRight, 0, 0]],
    ];
    for (const [p, u] of walls) {
      skin(p, u, 0, 1.15, wainscot);
      skin(p, u, 1.15, ceiling - 0.01, plaster);
      const length = Math.hypot(u[0], u[2]);
      const nx = -u[2] / length, nz = u[0] / length;
      const mid = [p[0] + u[0] / 2 + nx * 0.03, p[2] + u[2] / 2 + nz * 0.03];
      room.block({ cx: mid[0], cy: 1.12, cz: mid[1], sx: Math.abs(u[0]) || 0.06, sy: 0.07, sz: Math.abs(u[2]) || 0.06, chamfer: 0, jitter: 0, color: P.timberDark, rand: random });
    }
    skin([doorEast, 0, back - 0.012], [doorWest - doorEast, 0, 0], lintel.center[1] - lintel.size[1] / 2, ceiling - 0.01, plaster);
    panel(room, [inLeft, ceiling - 0.012, rearInner], [inRight - inLeft, 0, 0], [0, 0, back - rearInner], 0x6a5038);
    for (const z of [back - 1.6, (back + rearInner) / 2, rearInner + 1.6]) {
      room.block({ cx: middle, cy: ceiling - 0.38, cz: z, sx: inRight - inLeft, sy: 0.37, sz: 0.3, chamfer: 0.02, jitter: 0, color: P.timberDark, rand: random, bottom: true });
    }

    // ---- the counter: panelled, a brass grille with its service window, the bell, forms, a clipboard ----
    {
      const counter = solids.get('complaint-counter');
      const [cx, cy, cz] = counter.center;
      const [sx, sy, sz] = counter.size;
      const top = cy + sy / 2;
      const face = cz + sz / 2;
      room.block({ cx, cy: 0, cz, sx, sy: top - 0.08, sz, chamfer: 0, jitter: 0, color: P.timberDark, rand: random });
      room.block({ cx, cy: top - 0.08, cz: cz + 0.04, sx: sx + 0.12, sy: 0.08, sz: sz + 0.1, chamfer: 0.02, jitter: 0, color: 0x7a5a3f, rand: random, bottom: true });
      room.block({ cx, cy: 0, cz: face + 0.02, sx, sy: 0.14, sz: 0.04, chamfer: 0, jitter: 0, color: 0x2f2219, rand: random });
      for (let i = 0; i < 6; i += 1) {
        room.block({ cx: cx - sx / 2 + (i + 0.5) * sx / 6, cy: 0.26, cz: face + 0.015, sx: sx / 6 - 0.2, sy: 0.6, sz: 0.03, chamfer: 0, jitter: 0, color: 0x4b3627, rand: random });
      }
      const grille = cz - sz / 2 + 0.12;
      for (const x of [cx - sx / 2 + 0.06, cx + sx / 2 - 0.06]) box('metal', { cx: x, cy: top, cz: grille, sx: 0.06, sy: 0.95, sz: 0.06, color: P.brassDark });
      box('metal', { cx, cy: top + 0.92, cz: grille, sx: sx - 0.06, sy: 0.06, sz: 0.06, color: P.brassDark });
      const opening = 0.75;
      box('metal', { cx, cy: top + 0.5, cz: grille, sx: opening * 2 + 0.06, sy: 0.05, sz: 0.05, color: P.brassDark });
      for (let x = cx - sx / 2 + 0.3; x < cx + sx / 2 - 0.2; x += 0.3) {
        const inWindow = Math.abs(x - cx) < opening;
        box('metal', { cx: x, cy: inWindow ? top + 0.5 : top, cz: grille, sx: 0.022, sy: inWindow ? 0.42 : 0.92, sz: 0.022, color: P.brass });
      }
      batch.metal.prism({ cx, cy: top, cz: cz + 0.22, radiusBottom: 0.075, radiusTop: 0.066, height: 0.02, sides: 8, color: P.brassDark, rand: random, cap: false });
      batch.metal.prism({ cx, cy: top + 0.02, cz: cz + 0.22, radiusBottom: 0.066, radiusTop: 0.04, height: 0.045, sides: 8, color: P.brass, rand: random, cap: false });
      batch.metal.prism({ cx, cy: top + 0.065, cz: cz + 0.22, radiusBottom: 0.04, radiusTop: 0.008, height: 0.035, sides: 8, color: P.brass, rand: random });
      for (let i = 0; i < 3; i += 1) {
        room.block({ cx: cx - 1.9 + (random() - 0.5) * 0.03, cy: top + i * 0.035, cz: cz + 0.18, sx: 0.3, sy: 0.034, sz: 0.4, rotY: (random() - 0.5) * 0.12, chamfer: 0, jitter: 0, color: shadeColor(P.cream, 0.95 + random() * 0.06), rand: random });
      }
      room.block({ cx: cx + 1.7, cy: top, cz: cz + 0.2, sx: 0.25, sy: 0.014, sz: 0.34, rotY: 0.22, chamfer: 0, jitter: 0, color: 0x7d6143, rand: random });
      room.block({ cx: cx + 1.7, cy: top + 0.014, cz: cz + 0.19, sx: 0.21, sy: 0.004, sz: 0.27, rotY: 0.22, chamfer: 0, jitter: 0, color: P.cream, rand: random });
      box('metal', { cx: cx + 1.7 + Math.sin(0.22) * 0.15, cy: top + 0.014, cz: cz + 0.19 + Math.cos(0.22) * 0.15, sx: 0.1, sy: 0.025, sz: 0.04, rotY: 0.22, color: P.brass });
      batch.metal.prism({ cx: cx + 2.6, cy: top, cz: cz + 0.15, radiusBottom: 0.04, radiusTop: 0.03, height: 0.06, sides: 6, color: 0x2a2b2e, rand: random });
      // the clerk's chair behind
      this.#chair(room, random, cx + 0.8, cz - sz / 2 - 0.5, 0.08);
    }

    // ---- shelves of files behind the counter ----
    {
      const shelf = solids.get('complaint-shelf');
      const [cx, cy, cz] = shelf.center;
      const [sx, sy, sz] = shelf.size;
      const bottom = cy - sy / 2;
      panel(room, [cx - sx / 2, bottom, cz - sz / 2 + 0.02], [sx, 0, 0], [0, sy, 0], 0x3f2e22);
      for (const x of [cx - sx / 2 + 0.03, cx - sx / 6, cx + sx / 6, cx + sx / 2 - 0.03]) {
        room.block({ cx: x, cy: bottom, cz, sx: 0.06, sy, sz, chamfer: 0, jitter: 0, color: P.timberDark, rand: random });
      }
      const levels = [0.04, 0.72, 1.4, 2.08, sy - 0.05];
      for (const y of levels) room.block({ cx, cy: bottom + y, cz, sx, sy: 0.05, sz, chamfer: 0, jitter: 0, color: P.timber, rand: random, bottom: true });
      const spines = [0x7a3d2c, 0x4b5a6a, 0x8c7a52, 0x5d4a32, 0x6c6a4b, 0x3f4d44];
      for (let i = 0; i < levels.length - 1; i += 1) {
        const floor = bottom + levels[i] + 0.05;
        let x = cx - sx / 2 + 0.08;
        while (x < cx + sx / 2 - 0.12) {
          const w = Math.min(0.36 + random() * 0.5, cx + sx / 2 - 0.08 - x);
          const papers = random() < 0.18;
          const h = papers ? 0.08 + random() * 0.1 : 0.34 + random() * 0.22;
          if (random() > 0.1) {
            room.block({ cx: x + w / 2, cy: floor, cz: cz + 0.02, sx: w - 0.02, sy: h, sz: sz - 0.14, chamfer: 0, jitter: 0,
              color: papers ? shadeColor(P.cream, 0.92 + random() * 0.08) : shadeColor(spines[Math.floor(random() * spines.length)], 0.9 + random() * 0.15), rand: random });
          }
          x += w;
        }
      }
    }

    // ---- the clerk's desk, and its visitor's chair ----
    {
      const desk = solids.get('complaint-desk');
      const [cx, cy, cz] = desk.center;
      const [sx, sy, sz] = desk.size;
      const top = cy + sy / 2;
      room.block({ cx, cy: top - 0.06, cz, sx, sy: 0.06, sz, chamfer: 0.015, jitter: 0, color: 0x7a5a3f, rand: random, bottom: true });
      room.block({ cx: cx + sx / 2 - 0.34, cy: 0, cz, sx: 0.62, sy: top - 0.06, sz: sz - 0.08, chamfer: 0, jitter: 0, color: P.timberDark, rand: random });
      for (const y of [0.1, 0.33, 0.52]) room.block({ cx: cx + sx / 2 - 0.34, cy: y, cz: cz + sz / 2 - 0.03, sx: 0.52, sy: 0.16, sz: 0.02, chamfer: 0, jitter: 0, color: 0x4b3627, rand: random });
      for (const dz of [-1, 1]) room.block({ cx: cx - sx / 2 + 0.07, cy: 0, cz: cz + dz * (sz / 2 - 0.07), sx: 0.08, sy: top - 0.06, sz: 0.08, chamfer: 0, jitter: 0, color: P.timberDark, rand: random });
      for (let i = 0; i < 4; i += 1) room.block({ cx: cx - 0.55, cy: top + i * 0.03, cz: cz + 0.05, sx: 0.3, sy: 0.03, sz: 0.4, rotY: (random() - 0.5) * 0.2, chamfer: 0, jitter: 0, color: shadeColor(P.cream, 0.94 + random() * 0.06), rand: random });
      box('metal', { cx: cx + 0.15, cy: top, cz: cz - 0.1, sx: 0.36, sy: 0.07, sz: 0.44, color: P.brassDark });
      room.block({ cx: cx + 0.15, cy: top + 0.03, cz: cz - 0.1, sx: 0.3, sy: 0.03, sz: 0.38, chamfer: 0, jitter: 0, color: P.cream, rand: random });
      box('metal', { cx: cx - 0.05, cy: top, cz: cz + 0.36, sx: 0.07, sy: 0.04, sz: 0.05, color: P.iron });
      batch.metal.prism({ cx: cx - 0.05, cy: top + 0.04, cz: cz + 0.36, radiusBottom: 0.012, radiusTop: 0.02, height: 0.07, sides: 5, color: P.timber, rand: random });
      batch.metal.prism({ cx: cx + 0.85, cy: top, cz: cz - 0.3, radiusBottom: 0.07, radiusTop: 0.06, height: 0.02, sides: 8, color: P.brassDark, rand: random });
      batch.metal.prism({ cx: cx + 0.85, cy: top + 0.02, cz: cz - 0.3, radiusBottom: 0.012, radiusTop: 0.012, height: 0.3, sides: 5, color: P.brassDark, rand: random });
      batch.lamp.lump({ cx: cx + 0.85, cy: top + 0.38, cz: cz - 0.3, rx: 0.09, ry: 0.08, rz: 0.09, color: 0xffd796, rand: random, shade: 0.04, squash: 0.02 });
      this.#chair(room, random, cx - 0.2, cz - sz / 2 - 0.32, -0.1);
      this.#chair(room, random, cx - 0.1, cz + sz / 2 + 0.45, Math.PI + 0.12);
    }

    // ---- the waiting benches, facing the counter ----
    for (const bench of [solids.get('complaint-bench-west'), solids.get('complaint-bench-east')]) {
      const [cx, cy, cz] = bench.center;
      const [sx, sy, sz] = bench.size;
      const seat = cy + sy / 2;
      room.block({ cx, cy: seat - 0.07, cz: cz - 0.1, sx, sy: 0.07, sz: 0.48, chamfer: 0.015, jitter: 0, color: 0x7a5a3f, rand: random, bottom: true });
      for (const dx of [-sx / 2 + 0.15, 0, sx / 2 - 0.15]) {
        room.block({ cx: cx + dx, cy: 0, cz: cz - 0.1, sx: 0.08, sy: seat - 0.07, sz: 0.4, chamfer: 0, jitter: 0, color: P.timberDark, rand: random });
        room.block({ cx: cx + dx, cy: seat - 0.07, cz: cz + 0.2, sx: 0.07, sy: 0.6, sz: 0.06, chamfer: 0, jitter: 0, color: P.timberDark, rand: random });
      }
      for (const y of [seat + 0.18, seat + 0.42]) room.block({ cx, cy: y, cz: cz + 0.2, sx, sy: 0.1, sz: 0.04, chamfer: 0.01, jitter: 0, color: 0x7a5a3f, rand: random, bottom: true });
    }

    // ---- three pendant lamps, a clock over the files, a few notices pinned above the desk ----
    for (const x of [inLeft + 4.4, middle, inRight - 4.4]) {
      const z = (back + rearInner) / 2 + 0.6;
      box('metal', { cx: x, cy: 4.9, cz: z, sx: 0.03, sy: ceiling - 4.9, sz: 0.03, color: P.iron });
      batch.metal.prism({ cx: x, cy: 4.75, cz: z, radiusBottom: 0.34, radiusTop: 0.07, height: 0.2, sides: 8, color: P.iron, rand: random });
      batch.lamp.lump({ cx: x, cy: 4.62, cz: z, rx: 0.2, ry: 0.17, rz: 0.2, color: 0xffd796, rand: random, shade: 0.04, squash: 0.02 });
    }
    {
      const [cx, cy, z] = [middle, 4.05, rearInner + 0.03];
      const ring = (radius, y0, color, depth) => {
        for (let i = 0; i < 16; i += 1) {
          const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2;
          room.tri([cx, cy, z + depth], [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, z + depth], [cx + Math.cos(b) * radius, cy + Math.sin(b) * radius, z + depth], color);
        }
      };
      ring(0.46, cy, P.timberDark, 0.0);
      ring(0.39, cy, P.cream, 0.012);
      for (const [angle, length] of [[Math.PI / 2 - 0.5, 0.2], [Math.PI / 2 + 2.2, 0.3]]) {
        const ux = Math.cos(angle), uy = Math.sin(angle);
        const nx = -uy * 0.015, ny = ux * 0.015;
        room.quad([cx - nx, cy - ny, z + 0.02], [cx + ux * length - nx, cy + uy * length - ny, z + 0.02],
          [cx + ux * length + nx, cy + uy * length + ny, z + 0.02], [cx + nx, cy + ny, z + 0.02], 0x2a2b2e);
      }
    }
    {
      const desk = solids.get('complaint-desk');
      for (const [dx, y, w, h, tilt] of [[-0.75, 1.75, 0.34, 0.46, 0.06], [-0.2, 1.95, 0.3, 0.4, -0.03], [0.35, 1.7, 0.36, 0.48, 0.02]]) {
        const c = Math.cos(tilt), s = Math.sin(tilt);
        const at = (u, v) => [desk.center[0] + dx + u * c - v * s, y + u * s + v * c, rearInner + 0.02];
        room.quad(at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2), shadeColor(P.cream, 0.93 + random() * 0.07));
      }
    }

    // ---- the painted boards ----
    const ink = '#2f2216';
    const serif = 'Georgia, "Times New Roman", serif';
    const posters = [];
    const add = (mesh, position, rotationY = 0) => {
      mesh.position.set(...position);
      mesh.rotation.y = rotationY;
      posters.push(mesh);
      this.group.add(mesh);
      return mesh;
    };
    const destination = this.decor.destination.sign;
    this.sign = add(paintedPanel('greener-pastures-tattle-sign', destination.width - 0.28, destination.height - 0.16, (g, w, h) => {
      g.fillStyle = '#d9c58e';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#5b3925';
      g.lineWidth = h * 0.055;
      g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h * 0.88);
      lettering(g, destination.text, w / 2, h / 2 + h * 0.02, h * 0.62, { color: '#322217', family: serif, maxWidth: w - h * 0.4 });
      return destination.text;
    }), [destination.center[0], destination.center[1], destination.center[2] + 0.12]);
    {
      const jamb = solids.get('complaint-east-wing');
      const x = jamb.center[0] - jamb.size[0] / 2 + 0.47;
      box('metal', { cx: x, cy: 1.42, cz: front + 0.12, sx: 0.84, sy: 0.74, sz: 0.03, color: P.brassDark });
      add(paintedPanel('greener-pastures-walk-in', 0.78, 0.68, (g, w, h) => {
        g.fillStyle = '#24453a';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#e9ddbd';
        g.lineWidth = h * 0.025;
        g.strokeRect(h * 0.07, h * 0.07, w - h * 0.14, h - h * 0.14);
        lettering(g, 'WALK IN', w / 2, h * 0.33, h * 0.24, { color: '#efe4c4', family: serif, maxWidth: w * 0.84 });
        g.fillStyle = '#e9ddbd';
        g.fillRect(w * 0.3, h * 0.5, w * 0.4, h * 0.012);
        lettering(g, 'APPOINTMENTS', w / 2, h * 0.63, h * 0.13, { color: '#efe4c4', family: serif, maxWidth: w * 0.84 });
        lettering(g, 'ONLY', w / 2, h * 0.79, h * 0.13, { color: '#efe4c4', family: serif, maxWidth: w * 0.84 });
        return 'WALK IN / APPOINTMENTS ONLY';
      }), [x, 1.79, front + 0.137]);
    }
    {
      const board = solids.get('complaint-notice-board');
      add(paintedPanel('greener-pastures-dependent', 0.82, 1.1, (g, w, h) => {
        g.fillStyle = '#efe7cf';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#7d2b24';
        g.fillRect(0, 0, w, h * 0.05);
        lettering(g, 'DEPENDENT?', w / 2, h * 0.23, h * 0.13, { color: '#7d2b24', family: serif, maxWidth: w * 0.9 });
        g.fillStyle = '#9a8a66';
        g.fillRect(w * 0.2, h * 0.36, w * 0.6, h * 0.008);
        lettering(g, 'WE ARE', w / 2, h * 0.49, h * 0.11, { color: ink, family: serif, maxWidth: w * 0.88 });
        lettering(g, 'HERE TO', w / 2, h * 0.62, h * 0.11, { color: ink, family: serif, maxWidth: w * 0.88 });
        lettering(g, 'HELP', w / 2, h * 0.75, h * 0.11, { color: ink, family: serif, maxWidth: w * 0.88 });
        lettering(g, 'Enquiries within', w / 2, h * 0.9, h * 0.045, { weight: 'italic', color: '#5c4b36', family: serif, maxWidth: w * 0.86 });
        return 'DEPENDENT? WE ARE HERE TO HELP';
      }), [board.center[0], 1.6, board.center[2] + 0.064]);
    }
    {
      const shelf = solids.get('complaint-shelf');
      const x = (inLeft + shelf.center[0] - shelf.size[0] / 2) / 2 - 0.3;
      box('wood', { cx: x, cy: 1.68, cz: rearInner + 0.015, sx: 1.18, sy: 1.58, sz: 0.02, color: P.timberDark });
      add(paintedPanel('greener-pastures-feelings', 1.1, 1.5, (g, w, h) => {
        g.fillStyle = '#dfe4cc';
        g.fillRect(0, 0, w, h);
        g.strokeStyle = '#4c6146';
        g.lineWidth = w * 0.022;
        const hx = w / 2, hy = h * 0.2, r = w * 0.09;
        g.beginPath();
        g.moveTo(hx, hy + r * 1.5);
        g.bezierCurveTo(hx - r * 2.3, hy + r * 0.2, hx - r * 1.4, hy - r * 1.5, hx, hy - r * 0.45);
        g.bezierCurveTo(hx + r * 1.4, hy - r * 1.5, hx + r * 2.3, hy + r * 0.2, hx, hy + r * 1.5);
        g.stroke();
        lettering(g, "IT'S OKAY", w / 2, h * 0.47, h * 0.12, { color: '#33452f', family: serif, maxWidth: w * 0.88 });
        lettering(g, 'TO HAVE', w / 2, h * 0.62, h * 0.12, { color: '#33452f', family: serif, maxWidth: w * 0.88 });
        lettering(g, 'FEELINGS', w / 2, h * 0.78, h * 0.13, { color: '#33452f', family: serif, maxWidth: w * 0.88 });
        return "IT'S OKAY TO HAVE FEELINGS";
      }, { lit: true }), [x, 2.47, rearInner + 0.03]);
    }
    this.posters = posters;
  }

  #chair(builder, random, x, z, facing) {
    const at = (dx, dz) => [x + dx * Math.cos(facing) + dz * Math.sin(facing), z - dx * Math.sin(facing) + dz * Math.cos(facing)];
    const piece = (dx, dz, y, sx, sy, sz, color) => {
      const [cx, cz] = at(dx, dz);
      builder.block({ cx, cy: y, cz, sx, sy, sz, rotY: facing, chamfer: 0, jitter: 0, color, rand: random, bottom: y > 0.05 });
    };
    piece(0, 0, 0.44, 0.44, 0.05, 0.42, 0x7a5a3f);
    for (const dx of [-0.19, 0.19]) for (const dz of [-0.18, 0.18]) piece(dx, dz, 0, 0.04, 0.44, 0.04, P.timberDark);
    for (const dx of [-0.19, 0.19]) piece(dx, -0.19, 0.49, 0.04, 0.48, 0.04, P.timberDark);
    piece(0, -0.19, 0.78, 0.42, 0.14, 0.03, 0x7a5a3f);
  }

  // The way out, plainly marked: two tall posts, a beam, the sign hung beneath it, and a five-bar gate, shut.
  #exitGate(batch, random) {
    const box = (builder, o) => batch[builder].block({ chamfer: 0, jitter: 0, shade: 0.06, rand: random, ...o });
    const gate = GREENER_PASTURES.solids.find(solid => solid.kind === 'exit-gate');
    const posts = GREENER_PASTURES.solids.filter(solid => solid.kind === 'exit-post');
    for (const post of posts) {
      const [cx, cy, cz] = post.center;
      const [sx, sy, sz] = post.size;
      box('wood', { cx, cy: cy - sy / 2, cz, sx, sy, sz, color: P.timber, chamfer: 0.06, jitter: 0.01 });
      box('wood', { cx, cy: cy + sy / 2, cz, sx: sx + 0.18, sy: 0.16, sz: sz + 0.18, color: P.timberDark, chamfer: 0.03 });
    }
    const [x, , z] = gate.center;
    const [, height, length] = gate.size;
    const top = posts[0].center[1] + posts[0].size[1] / 2;
    // (big enough to read from the meeting place, seventy metres off, where the Spellblade sets out for it: the board
    // is bolted across the posts' faces, under the beam)
    box('wood', { cx: x, cy: top - 0.7, cz: z, sx: 0.6, sy: 0.6, sz: length + 4.4, color: P.timberDark, chamfer: 0.05, jitter: 0.01, bottom: true });
    const board = { x: x + posts[0].size[0] / 2 + 0.08, y: 4.75, height: 2.45, width: 8.6 };
    box('wood', { cx: board.x, cy: board.y, cz: z, sx: 0.14, sy: board.height, sz: board.width + 0.24, color: P.timberDark, chamfer: 0.02, bottom: true });
    for (const dz of [-1, 1]) for (const y of [board.y + 0.35, board.y + board.height - 0.35]) {
      box('metal', { cx: board.x + 0.08, cy: y - 0.06, cz: z + dz * (length / 2 + 0.45), sx: 0.03, sy: 0.12, sz: 0.12, color: P.iron });
    }
    // the gate: two stiles, five bars and a brace
    const z0 = z - length / 2 + 0.1, z1 = z + length / 2 - 0.1;
    const wood = 0x7d6a52;
    for (const zz of [z0 + 0.07, z1 - 0.07]) box('wood', { cx: x, cy: 0.05, cz: zz, sx: 0.12, sy: height - 0.05, sz: 0.14, color: wood });
    for (const y of [0.3, 0.62, 0.94, 1.26, height - 0.13]) box('wood', { cx: x, cy: y, cz: z, sx: 0.08, sy: 0.12, sz: z1 - z0, color: wood, bottom: true });
    {
      const a = [z0 + 0.15, 0.36], b = [z1 - 0.15, height - 0.2];
      const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy);
      const nz = -dy / len * 0.06, ny = dz / len * 0.06;
      for (const side of [-1, 1]) {
        const xx = x + side * 0.05;
        const quad = [[xx, a[1] - ny, a[0] - nz], [xx, b[1] - ny, b[0] - nz], [xx, b[1] + ny, b[0] + nz], [xx, a[1] + ny, a[0] + nz]];
        if (side > 0) quad.reverse();
        batch.wood.quad(...quad, shadeColor(wood, 0.92));
      }
    }
    box('metal', { cx: x, cy: 0.98, cz: z1 - 0.02, sx: 0.06, sy: 0.08, sz: 0.3, color: P.iron });
    for (const y of [0.4, 1.3]) box('metal', { cx: x, cy: y, cz: z0 - 0.04, sx: 0.05, sy: 0.08, sz: 0.4, color: P.iron });
    const sign = paintedPanel('greener-pastures-exit-sign', board.width - 0.2, board.height - 0.15, (g, w, h) => {
      g.fillStyle = '#e3d6ab';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#5b3925';
      g.lineWidth = h * 0.04;
      g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h * 0.88);
      lettering(g, 'LEAVE', w / 2, h * 0.36, h * 0.36, { color: '#2f2216', family: 'Georgia, "Times New Roman", serif', maxWidth: w * 0.9 });
      lettering(g, 'GREENER PASTURES', w / 2, h * 0.71, h * 0.25, { color: '#2f2216', family: 'Georgia, "Times New Roman", serif', maxWidth: w * 0.9 });
      return 'LEAVE GREENER PASTURES';
    }, { lit: true });
    sign.position.set(board.x + 0.078, board.y + board.height / 2, z);
    sign.rotation.y = Math.PI / 2;
    this.exitSign = sign;
    this.group.add(sign);
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
