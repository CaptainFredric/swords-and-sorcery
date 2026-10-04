import * as THREE from 'three';
import { elementalProfile } from './elementalVfxModel.mjs';

const vertexShader = /* glsl */`
  uniform float uTime;
  uniform float uCold;
  varying vec3 vPoint;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vPoint = normalize(position);
    float ripple = sin(position.x * 32.0 + uTime * 9.0) * sin(position.y * 26.0 - uTime * 7.0);
    vec3 p = position * (1.0 + ripple * mix(0.12, 0.025, uCold));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform float uCold;
  uniform vec3 uColor;
  varying vec3 vPoint;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float flow = sin(vPoint.y * 11.0 - uTime * 8.0 + sin(vPoint.x * 9.0 + uTime * 3.0) * 2.0);
    float filaments = smoothstep(0.05, 0.85, flow);
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.7);
    float alpha = mix((0.06 + filaments * 0.4) * (0.3 + rim * 0.7), 0.08 + rim * 0.22 + filaments * 0.1, uCold);
    gl_FragColor = vec4(uColor * (0.8 + filaments * 0.45), alpha);
  }
`;

// Compact cores with moving translucent skin. No light is created per particle.
export function createElementalOrb(spell = 'fireball') {
  const profile = elementalProfile(spell);
  const group = new THREE.Group();
  const coreGeometry = new THREE.OctahedronGeometry(0.145, profile.frost ? 0 : 1);
  const shellGeometry = new THREE.IcosahedronGeometry(0.24, 2);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: profile.core });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  const heart = new THREE.Mesh(coreGeometry, new THREE.MeshBasicMaterial({ color: profile.frost ? 0x85ccd9 : 0xff941e, transparent: true, opacity: 0.36, blending: THREE.AdditiveBlending, depthWrite: false }));
  heart.scale.setScalar(1.3);
  const shell = new THREE.Mesh(shellGeometry, new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCold: { value: Number(profile.frost) }, uColor: { value: new THREE.Color(profile.shell) } },
    vertexShader, fragmentShader, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  core.scale.fromArray(profile.coreScale);
  heart.scale.multiply(new THREE.Vector3(...profile.coreScale));
  shell.scale.fromArray(profile.shellScale);
  group.add(core, heart, shell);
  if (profile.frost) {
    const crystalGeometry = new THREE.OctahedronGeometry(0.045, 0);
    for (let i = 0; i < 4; i += 1) {
      const crystal = new THREE.Mesh(crystalGeometry, coreMaterial);
      const angle = i * Math.PI / 2;
      crystal.position.set(Math.cos(angle) * 0.14, Math.sin(angle) * 0.14, -0.08);
      crystal.scale.set(0.5, 0.5, 2.5);
      group.add(crystal);
    }
  }
  group.userData.update = (age) => {
    shell.material.uniforms.uTime.value = age;
    core.scale.fromArray(profile.coreScale).multiplyScalar(1 + Math.sin(age * 17) * (profile.frost ? 0.018 : 0.06));
    shell.scale.fromArray(profile.shellScale).multiplyScalar(1 + Math.sin(age * 11) * 0.035);
    heart.rotation.z = age * (profile.frost ? 0.3 : 2.1);
  };
  group.userData.dispose = () => {
    const geometries = new Set();
    const materials = new Set();
    group.traverse((child) => { if (child.geometry) geometries.add(child.geometry); if (child.material) materials.add(child.material); });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };
  return group;
}

export function createBlastFrontMaterial(spell) {
  const profile = elementalProfile(spell);
  return new THREE.ShaderMaterial({
    uniforms: { uFade: { value: 1 }, uColor: { value: new THREE.Color(profile.shell) }, uOpacity: { value: profile.frontOpacity } },
    vertexShader: `
      varying vec3 vDir; varying vec3 vNormal; varying vec3 vView;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uFade; uniform vec3 uColor; uniform float uOpacity;
      varying vec3 vDir; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 5.0);
        float breakup = smoothstep(-0.25, 0.75, sin(vDir.x * 17.0 + vDir.y * 11.0 + sin(vDir.z * 13.0) * 2.0));
        gl_FragColor = vec4(uColor, rim * breakup * uOpacity * uFade);
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}
