import * as THREE from 'three';

// Gale Garner held in the hand: a ball of wind, white and green, turning and flowing. A bright heart of air, bands of
// wind streaming round it and twisting as they go (a little vortex), a looser shell of air turning the other way, and
// a few wisps looping round the ball like breath caught in it. As a fireball is a glowing ball of fire and a frostfire
// one of cold, this is one of wind. Built once per hand (the first-person palm, the Armory's knight); update(t) turns it.

const WHITE = new THREE.Color(0.97, 0.99, 0.96);
const GREEN = new THREE.Color(0.4, 0.84, 0.5);

const BANDS_VERTEX = /* glsl */`
  varying vec3 vDir;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vDir = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const BANDS_FRAGMENT = /* glsl */`
  uniform float uTime;
  uniform float uSpin;
  uniform float uAlpha;
  uniform vec3 uColor;
  uniform vec3 uTint;
  varying vec3 vDir;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float lat = asin(clamp(vDir.y, -1.0, 1.0));
    float lon = atan(vDir.z, vDir.x);
    // bands of wind streaming round the ball, twisting with the latitude and rippling as they flow
    float swirl = lon * 3.0 + lat * 4.0 + sin(lat * 3.0 + uTime * 2.3) * 1.3 - uTime * uSpin;
    float band = pow(0.5 + 0.5 * sin(swirl), 2.0);
    // which of them are green: a second, slower set of bands running the other way
    float green = smoothstep(0.2, 0.65, 0.5 + 0.5 * sin(lon * 2.0 - lat * 5.0 + uTime * uSpin * 0.6));
    // edge on, there is more air to see through: the ball glows at its rim
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.4);
    float alpha = (0.08 + 0.92 * band) * (0.45 + 0.55 * rim) * uAlpha;
    gl_FragColor = vec4(mix(uColor, uTint, green) * (0.7 + 0.5 * band), alpha);
  }
`;

const WISP_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// a wisp: a comet of air along its arc (uv.x from its tail to its head), white at the head, green behind
const WISP_FRAGMENT = /* glsl */`
  uniform float uAlpha;
  uniform vec3 uColor;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main() {
    float along = vUv.x;
    float alpha = smoothstep(0.0, 1.0, along) * (1.0 - smoothstep(0.93, 1.0, along)) * uAlpha;
    gl_FragColor = vec4(mix(uTint, uColor, smoothstep(0.5, 1.0, along)), alpha);
  }
`;

function bandsMaterial(alpha, spin) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpin: { value: spin },
      uAlpha: { value: alpha },
      uColor: { value: WHITE.clone() },
      uTint: { value: GREEN.clone() },
    },
    vertexShader: BANDS_VERTEX,
    fragmentShader: BANDS_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

/**
 * A Gale orb `radius` across its bands (metres). Returns a Group whose userData.update(t) turns and flows it, and
 * userData.setStrength(0..1) dims it (a gather just begun is faint); dispose() frees it.
 */
export function createGaleOrb({ radius = 0.07 } = {}) {
  const group = new THREE.Group();
  group.name = 'GaleOrb';
  const heart = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 0.26, 2),
    new THREE.MeshBasicMaterial({ color: 0xf4fff2, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const halo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius * 0.62, 2),
    new THREE.MeshBasicMaterial({ color: 0x6fd283, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const bands = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 20), bandsMaterial(0.95, 3.2));
  const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.35, 32, 20), bandsMaterial(0.45, -2.1));
  const wispMaterial = new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0.85 }, uColor: { value: WHITE.clone() }, uTint: { value: GREEN.clone() } },
    vertexShader: WISP_VERTEX,
    fragmentShader: WISP_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const wisps = [0, 1, 2].map((i) => {
    const wisp = new THREE.Mesh(new THREE.TorusGeometry(radius * (1.2 + i * 0.16), radius * 0.065, 5, 48, Math.PI * (1.2 + i * 0.25)), wispMaterial);
    wisp.rotation.set(0.6 + i * 0.9, i * 1.3, i * 0.7);
    group.add(wisp);
    return wisp;
  });
  group.add(halo, heart, bands, shell);

  group.userData.update = (t) => {
    bands.material.uniforms.uTime.value = t;
    shell.material.uniforms.uTime.value = t;
    bands.rotation.y = t * 1.6;
    shell.rotation.y = -t * 0.9;
    shell.rotation.x = Math.sin(t * 0.7) * 0.4;
    // the wisps loop round the ball, each on its own tilt, like breath caught in it
    wisps.forEach((wisp, i) => {
      wisp.rotation.z = t * (4.2 - i * 0.9) * (i % 2 ? -1 : 1);
      wisp.rotation.x = 0.6 + i * 0.9 + Math.sin(t * 1.3 + i) * 0.25;
    });
    const pulse = 1 + Math.sin(t * 5.1) * 0.05;
    heart.scale.setScalar(pulse);
    halo.scale.setScalar(1 + Math.sin(t * 3.3 + 1) * 0.08);
  };
  group.userData.setStrength = (s) => {
    const k = Math.max(0, Math.min(1, s));
    bands.material.uniforms.uAlpha.value = 0.95 * k;
    shell.material.uniforms.uAlpha.value = 0.45 * k;
    wispMaterial.uniforms.uAlpha.value = 0.85 * k;
    heart.material.opacity = 0.6 * k;
    halo.material.opacity = 0.3 * k;
  };
  group.userData.dispose = () => group.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    object.material.dispose();
  });
  return group;
}
