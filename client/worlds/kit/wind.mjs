import * as THREE from 'three';

// The wind over a battlefield, drawn in the vertex shader: tree crowns lean and settle in slow gusts, pennants and
// flags ripple from the pole out. One clock for a world (every material shares its uniforms), no per-frame geometry,
// nothing moved that collision knows about. Each swaying mesh carries a `windWeight` per vertex (0 = held fast: a
// trunk's top, a pole; 1 = free: a crown's crown, a pennant's tip), so nothing slides off what holds it.

/** A world's wind: the shared uniforms, and update(timeSec) for its renderer's frame. */
export function createWind({ direction = [0.8, 0.6], strength = 1 } = {}) {
  const d = new THREE.Vector2(...direction).normalize();
  const uniforms = {
    uWindTime: { value: 0 },
    uWindDir: { value: d },
    uWindStrength: { value: strength },
  };
  return {
    uniforms,
    update(timeSec) { uniforms.uWindTime.value = timeSec; },
  };
}

// gusts: two slow waves passing across the land (so neighbours lean together, a moment apart) and a faster flutter
const GUST = /* glsl */ `
  float windGust(vec2 p, float t) {
    float phase = dot(p, vec2(0.13, 0.09));
    float slow = sin(t * 0.9 - phase) * 0.55 + sin(t * 0.37 - phase * 0.6 + 1.7) * 0.45;
    return 0.55 + 0.45 * slow;
  }
`;

function inject(material, wind, body) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wind.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float windWeight;
        uniform float uWindTime;
        uniform vec2 uWindDir;
        uniform float uWindStrength;
        ${GUST}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { ${body} }`);
  };
  // (its own program: the same material without wind would otherwise share a cached one)
  material.customProgramCacheKey = () => `wind-${body.length}`;
  return material;
}

/**
 * Tree crowns: lean downwind with the gust (amplitude metres at full weight), dip a touch as they lean, and a small
 * leaf flutter on top. The crown bends from where the trunk holds it (windWeight rises from 0 there).
 */
export function swayFoliage(material, wind, { amplitude = 0.16 } = {}) {
  return inject(material, wind, `
    float w = windWeight * windWeight;
    vec4 wp = modelMatrix * vec4(transformed, 1.0);
    float gust = windGust(wp.xz, uWindTime);
    float lean = gust * ${amplitude.toFixed(3)} * uWindStrength * w;
    float flutter = sin(uWindTime * 5.3 + wp.x * 1.7 + wp.y * 2.1 + wp.z * 1.3) * 0.018 * uWindStrength * w;
    transformed.x += uWindDir.x * lean + flutter;
    transformed.z += uWindDir.y * lean - flutter * 0.6;
    transformed.y -= lean * lean * 0.6 - flutter * 0.5;
  `);
}

/**
 * Flags and pennants: a ripple running from the pole to the tip, growing toward the tip, with the gust behind it.
 */
export function flutterCloth(material, wind, { amplitude = 0.11 } = {}) {
  return inject(material, wind, `
    float w = windWeight;
    vec4 wp = modelMatrix * vec4(transformed, 1.0);
    float gust = windGust(wp.xz, uWindTime);
    float wave = sin(uWindTime * 6.2 - w * 4.2 + dot(wp.xz, vec2(0.7, 0.5)));
    float a = ${amplitude.toFixed(3)} * uWindStrength * w * (0.55 + 0.45 * gust);
    transformed.y += wave * a * 0.8;
    transformed.x += uWindDir.y * wave * a * 0.7 + uWindDir.x * a * 0.35;
    transformed.z -= uWindDir.x * wave * a * 0.7 - uWindDir.y * a * 0.35;
  `);
}

/**
 * The `windWeight` of every vertex of a geometry, from a function of its position (0..1), set on it.
 */
export function setWindWeights(geometry, weightAt) {
  const position = geometry.attributes.position;
  const weights = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) weights[i] = Math.max(0, Math.min(1, weightAt(position.getX(i), position.getY(i), position.getZ(i))));
  geometry.setAttribute('windWeight', new THREE.BufferAttribute(weights, 1));
  return weights;
}

/**
 * A lookup of the nearest holder (a tree's trunk, a pole) to a point, by a coarse grid: holders [{ x, z, ...}].
 */
export function nearestHolder(holders, cell = 6) {
  const grid = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  for (const h of holders) {
    const k = key(Math.floor(h.x / cell), Math.floor(h.z / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(h);
  }
  return (x, z) => {
    const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell);
    let best = null, bestD = Infinity;
    for (let i = i0 - 1; i <= i0 + 1; i += 1) for (let j = j0 - 1; j <= j0 + 1; j += 1) {
      for (const h of grid.get(key(i, j)) ?? []) {
        const d = (h.x - x) ** 2 + (h.z - z) ** 2;
        if (d < bestD) { bestD = d; best = h; }
      }
    }
    return best;
  };
}

/** A tree crown's weight at a vertex: 0 at the trunk's top, rising to 1 over the crown's height. */
export function crownWeight(holder, x, y, z) {
  if (!holder) return 0;
  const s = holder.scale ?? 1;
  const from = holder.y + (holder.kind === 'pine' ? 0.9 : 1.6) * s;
  return (y - from) / (3.0 * s);
}

/** A pennant's or flag's weight at a vertex: 0 at its pole, 1 at `reach` metres out. */
export function poleWeight(holder, x, y, z, reach = 0.9) {
  if (!holder) return 0;
  return Math.hypot(x - holder.x, z - holder.z) / reach;
}

/**
 * A hanging banner: billows out of its own plane (its local z) and back, the hem most, in rolls running down the
 * cloth with the gust behind them. For a segmented plane hung from its top edge: hangingWeights() gives its weights.
 */
export function hangCloth(material, wind, { amplitude = 0.09 } = {}) {
  return inject(material, wind, `
    float w = windWeight;
    vec4 wp = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float gust = windGust(wp.xz, uWindTime);
    float roll = sin(uWindTime * 2.4 - w * 3.6 + transformed.x * 1.3 + wp.x * 0.4 + wp.z * 0.3);
    transformed.z += (roll * 0.6 + gust * 0.7) * ${amplitude.toFixed(3)} * uWindStrength * w * w;
  `);
}

/** A banner plane of width × height, hung from its top edge, segmented to ripple, with its wind weights set. */
export function hangingBannerGeometry(width, height, { across = 3, down = 8 } = {}) {
  const geometry = new THREE.PlaneGeometry(width, height, across, down);
  setWindWeights(geometry, (x, y) => (height / 2 - y) / height);
  return geometry;
}
