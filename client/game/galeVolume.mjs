import * as THREE from 'three';
import { windConeData, windRibbonData } from './galeVolumeModel.mjs';

export { GALE_VOLUME, galeVolumeAt } from './galeVolumeModel.mjs';

// Gale Garner's gust as a body of moving air, not a mark on the ground: a translucent cone of wind (white, streaked
// with pale sage, turbulent) whose front races out from the hand, wrapped in ribbons of air twisting round it. Built for
// a unit gust along +z from the origin (scale it by the gust's reach and turn it to the gust's way); its shapes and how
// it plays out over its short life are galeVolumeModel.mjs.

/** The cone of air's shell, for a gust this wide (tan of its half angle). */
export function windConeGeometry(tanHalf, options) {
  const { positions, uvs, indices } = windConeData(tanHalf, options);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The ribbons of air round a gust this wide. */
export function windRibbonGeometry(tanHalf, options) {
  const { positions, uvs, seeds, indices } = windRibbonData(tanHalf, options);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setIndex(indices);
  return geometry;
}

const NOISE = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // value noise that wraps round the gust every 'period' cells, so the air has no seam
  float wrapNoise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float x0 = mod(i.x, period);
    float x1 = mod(i.x + 1.0, period);
    return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x), mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), f.x), f.y);
  }
`;

const WHITE = new THREE.Color(0.96, 0.975, 0.955);
const SAGE = new THREE.Color(0.66, 0.75, 0.63);

/** The cone of air's material: one per gust (clone it; the shader is shared). */
export function createWindConeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFront: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 0.5 },
      uTurb: { value: 0.05 },
      uSwirl: { value: 0.35 },
      uNear: { value: 0.12 },
      uHaze: { value: 0.06 },          // the clear air between the streaks (a heart of dense air is hazier)
      uColor: { value: WHITE.clone() },
      uTint: { value: SAGE.clone() },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uTurb;
      varying vec2 vUv;
      varying float vRim;
      void main() {
        vUv = uv;
        vec3 p = position;
        // turbulence: the shell billows out and in in soft lumps as the gust passes through it
        float lump = sin(uv.x * 18.85 + uv.y * 9.0 - uTime * 14.0) * sin(uv.x * 31.4 - uv.y * 6.0 + uTime * 9.0);
        vec2 radial = normalize(p.xy + vec2(1e-5));
        p.xy += radial * lump * uTurb * p.z;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        // seen edge on, the shell stands for more air: denser there, as a volume would be
        vRim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uFront;
      uniform float uFade;
      uniform float uOpacity;
      uniform float uSwirl;
      uniform float uNear;
      uniform float uHaze;
      uniform vec3 uColor;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying float vRim;
      ${NOISE}
      void main() {
        float along = vUv.y;
        // streaks of air running out along the gust, twisting round it and tumbling (the streaks' own paths wander)
        float around = (vUv.x + along * uSwirl) * 24.0;
        vec2 q = vec2(around, along * 4.0 - uTime * 4.0);
        q.x += (wrapNoise(q * vec2(0.25, 0.5) + vec2(0.0, uTime), 6.0) - 0.5) * 3.0;
        float streak = wrapNoise(q, 24.0) * 0.6 + wrapNoise(q * vec2(2.0, 1.7) + vec2(0.0, 3.1), 48.0) * 0.4;
        streak = smoothstep(0.34, 0.82, streak);
        // the gust's front: nothing ahead of it yet, a billowing wall of air at it, the air behind it still rushing out
        float behind = smoothstep(uFront + 0.02, uFront - 0.12, along);
        float band = exp(-pow((along - uFront) / 0.09, 2.0));
        float ends = smoothstep(0.0, uNear, along) * (1.0 - smoothstep(0.7, 1.0, along));
        // the air is only where it streams: edge on it is denser (a volume), but never a clean line
        float body = (0.15 + 0.85 * pow(vRim, 1.2)) * streak;
        float alpha = (behind * (uHaze + (1.0 - uHaze) * body) + band * (0.15 + 0.85 * streak)) * ends * uFade * uOpacity;
        gl_FragColor = vec4(mix(uColor, uTint, streak * (1.0 - 0.6 * band) * 0.65), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** The ribbons' material: one per gust (clone it; the shader is shared). */
export function createWindRibbonMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uHead: { value: 0 },
      uFade: { value: 1 },
      uOpacity: { value: 0.7 },
      uColor: { value: WHITE.clone() },
      uTint: { value: SAGE.clone() },
    },
    vertexShader: /* glsl */`
      attribute float aSeed;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        vSeed = aSeed;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uHead;
      uniform float uFade;
      uniform float uOpacity;
      uniform vec3 uColor;
      uniform vec3 uTint;
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        float v = vUv.y;
        float head = uHead * (0.8 + 0.35 * vSeed);
        // a comet of air along the ribbon: its head white and sharp, its tail sage and long
        float streak = smoothstep(head - 0.6, head, v) * (1.0 - smoothstep(head, head + 0.035, v));
        float across = sin(3.14159 * vUv.x);
        float ends = smoothstep(0.0, 0.08, v) * (1.0 - smoothstep(0.8, 1.0, v));
        float alpha = streak * streak * across * ends * uFade * uOpacity;
        gl_FragColor = vec4(mix(uTint, uColor, smoothstep(head - 0.15, head, v)), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
