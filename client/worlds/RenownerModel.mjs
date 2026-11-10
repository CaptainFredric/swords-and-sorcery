import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appUrl } from '../appUrl.mjs';
import { RENOWNER_BLADE_TIP, RENOWNER_MOUTH, restlessRenownerBlade } from '../../shared/worlds/renownerGeometry.mjs';

const ASSET = '/client/assets/props/rightful-renowner/Rightful_Renowner_GameReady_PBR.glb?v=2a9e73a7b5991757';
const CYCLE = '01_Knighting_And_Dispense_Cycle';
const IDLE = '02_Idle_Pose';
const OPEN = '06_Dispense_Open_Pose';
const BLADE_ROOT_Y = -0.29;
const ease = (value) => THREE.MathUtils.smoothstep(value, 0, 1);

function release(root) {
  const materials = new Set();
  const textures = new Set();
  root.traverse(node => {
    node.geometry?.dispose();
    for (const mat of [node.material].flat().filter(Boolean)) materials.add(mat);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    texture.source?.data?.close?.();
  }
}

// Rigid joints in the authored rig are separate meshes, so a shoulder and
// elbow can aim at a new shared hilt without reskinning the original asset.
function aimJoint(joint, end, target) {
  const start = joint.getWorldPosition(new THREE.Vector3());
  const from = end.getWorldPosition(new THREE.Vector3()).sub(start).normalize();
  const to = target.clone().sub(start).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(from, to)
    .multiply(joint.getWorldQuaternion(new THREE.Quaternion()));
  joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation));
  joint.updateWorldMatrix(false, true);
}

export class RenownerModel {
  constructor(parent, position, { yaw = Math.PI, scale = 1, carpet = true } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'Rightful Renowner';
    this.group.position.fromArray(position);
    this.group.rotation.y = yaw;
    this.group.scale.setScalar(scale);
    this.scale = scale;
    parent.add(this.group);
    this.ready = new GLTFLoader().loadAsync(appUrl(ASSET)).then(({scene, animations}) => {
      if (this.disposed) {
        release(scene);
        return false;
      }
      this.model = scene;
      this.nodes = new Map();
      scene.traverse(node => {
        this.nodes.set(node.name, node);
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      this.nodes.get('Renowner_Interaction_Carpet').visible = carpet;
      this.sword = this.nodes.get('Renowner_Sword');
      // Restless Day retains its long melee reach. Extend steel below the
      // crossguard only, so the authored hilt still fits the gauntlets.
      const geometry = this.sword.geometry;
      const positions = geometry.getAttribute('position');
      const extension = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) extension[i * 3 + 1] = Math.min(0, positions.getY(i) - BLADE_ROOT_Y);
      geometry.morphAttributes.position = [new THREE.BufferAttribute(extension, 3)];
      geometry.morphTargetsRelative = true;
      this.sword.updateMorphTargets();
      this.sword.frustumCulled = false;
      this.arms = ['L', 'R'].map(side =>
        ['Shoulder', 'Elbow', 'Wrist'].map(part => this.nodes.get(`Renowner_${part}_${side}`)));
      this.clips = new Map(animations.map(clip => [clip.name, clip.tracks.map(track => {
        const [name, property] = track.name.split('.');
        const mirrorName = name.replace(/_([LR])$/, (_, side) => side === 'L' ? '_R' : '_L');
        return { node: this.nodes.get(name), mirrored: this.nodes.get(mirrorName),
          property, interpolate: track.createInterpolant() };
      })]));
      this.group.add(scene);
      this.sample(IDLE, 0);
      return true;
    }).catch(error => {
      console.error('Rightful Renowner asset failed to load', error);
      return false;
    });
  }

  sample(clip, time, mirror = false) {
    const wrist = this.arms[mirror ? 0 : 1][2];
    if (this.sword.parent !== wrist) wrist.add(this.sword);
    this.sword.morphTargetInfluences[0] = 0;
    for (const {node, mirrored, property, interpolate} of this.clips.get(clip)) {
      const value = interpolate.evaluate(Math.max(0, time));
      const target = (mirror ? mirrored : node)[property];
      if (!mirror) target.fromArray(value);
      else if (property === 'quaternion') target.set(value[0], -value[1], -value[2], value[3]);
      else target.set(-value[0], value[1], value[2]);
    }
  }

  mouth(out = new THREE.Vector3()) {
    return this.group.localToWorld(out.fromArray(RENOWNER_MOUTH));
  }

  poseBlade(grip, tip) {
    const sword = this.sword;
    sword.morphTargetInfluences[0] = 0;
    this.group.updateWorldMatrix(true, true);
    const rootRotation = this.group.getWorldQuaternion(new THREE.Quaternion());
    const direction = tip.clone().sub(grip);
    const [tx, ty, tz] = RENOWNER_BLADE_TIP;
    const tipY = -Math.sqrt(Math.max(0.01, (direction.length() / this.scale) ** 2 - tx ** 2 - tz ** 2));
    const axis = new THREE.Vector3(tx, tipY, tz).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(axis,
      direction.clone().normalize().applyQuaternion(rootRotation.clone().invert())).premultiply(rootRotation);
    const wristTargets = this.arms.map(([, , wrist]) => this.group.worldToLocal(wrist.getWorldPosition(new THREE.Vector3())));
    const restGrip = this.group.worldToLocal(sword.getWorldPosition(new THREE.Vector3()));

    this.arms.forEach(([shoulder, elbow, wrist], i) => {
      const target = wristTargets[i].sub(restGrip).multiplyScalar(this.scale).applyQuaternion(orientation).add(grip);
      const joint = shoulder.getWorldPosition(new THREE.Vector3());
      const mid = elbow.getWorldPosition(new THREE.Vector3());
      const hand = wrist.getWorldPosition(new THREE.Vector3());
      const first = joint.distanceTo(mid), second = mid.distanceTo(hand);
      const axis = target.clone().sub(joint);
      const reach = Math.max(0.01, axis.length());
      axis.divideScalar(reach);
      const bend = mid.sub(joint);
      bend.addScaledVector(axis, -bend.dot(axis)).normalize();
      const distance = Math.min(reach, first + second - 0.001);
      const along = (distance ** 2 + first ** 2 - second ** 2) / (2 * distance);
      const elbowTarget = joint.addScaledVector(axis, along)
        .addScaledVector(bend, Math.sqrt(Math.max(0, first ** 2 - along ** 2)));
      aimJoint(shoulder, elbow, elbowTarget);
      aimJoint(elbow, wrist, target);
      wrist.position.copy(wrist.parent.worldToLocal(target));
      wrist.quaternion.copy(wrist.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));
    });
    sword.position.copy(sword.parent.worldToLocal(grip.clone()));
    sword.quaternion.copy(sword.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));
    sword.morphTargetInfluences[0] = (tipY - ty) / (ty - BLADE_ROOT_Y);
  }

  courtStrike(progress, alternate) {
    this.sample(CYCLE, 2.05, alternate);
    const grip = this.sword.getWorldPosition(new THREE.Vector3());
    const tip = this.sword.localToWorld(new THREE.Vector3(...RENOWNER_BLADE_TIP));
    const target = this.group.localToWorld(new THREE.Vector3(0, 1.05, 2.26));
    this.poseBlade(grip, tip.lerp(target, progress));
  }

  court(now, ceremony, alternate = false) {
    if (!this.model) return;
    if (!ceremony) {
      const clock = Math.max(0, now);
      this.sample(CYCLE, clock % 6, Math.floor(clock / 6) % 2 === 1);
      return;
    }
    const t = Math.max(0, now - ceremony.startedAt);
    switch (ceremony.cue) {
      case 'SWORD_RAISE':
        if (t <= 1.1) this.sample(CYCLE, 0.45 + ease(t / 1.1) * 1.6, alternate);
        else this.courtStrike(ease((t - 1.1) / 0.6), alternate);
        break;
      case 'KNIGHTING':
        this.sample(CYCLE, 2.05 + Math.min(1, (t - 1.1) / 1.2) * 1.9, alternate);
        break;
      case 'SWORD_EXECUTION':
      case 'SWORD_EVADED':
      case 'I_HAVE_SURPASSED_JUDGEMENT':
        this.courtStrike(1, alternate);
        break;
      case 'SWORD_RESET': {
        const progress = ease((t - (t < 5.2 ? 3 : 5.2)) / 1.8);
        if (progress < 0.5) this.courtStrike(1 - progress * 2, alternate);
        else this.sample(CYCLE, 2.05 - (progress - 0.5) * 4.1, alternate);
        break;
      }
      case 'REWARD_COIN': this.sample(CYCLE, 4.20 + (t - 2.3) * 1.05, alternate); break;
      case 'CONSOLATION_COIN': this.sample(OPEN, 0.65 + t - 2.1); break;
      case 'CONSOLATION_REACTION': this.sample(OPEN, 1.3); break;
      case 'RECEIVE_COMPENSATION': this.sample(OPEN, (t - 7) * 0.48); break;
      case 'COIN_RETALIATION': this.sample(OPEN, 1.18 + (t - 9.3)); break;
      case 'LATE_COIN': this.sample(OPEN, t - 4.8); break;
      default: this.sample(IDLE, 0);
    }
  }

  restless(now, renowner) {
    this.group.visible = (renowner?.health ?? 1) > 0;
    this.group.rotation.y = renowner?.yaw ?? Math.PI;
    if (!this.model || !this.group.visible) return;
    const attack = renowner?.attack;
    if (!attack) {
      this.sample(IDLE, 0);
      return;
    }
    if (attack.type === 'coin') {
      this.sample(OPEN, Math.max(0, now - attack.startedAt));
      return;
    }
    const beforeContact = now < attack.contactAt;
    const windup = ease((now - attack.startedAt) / 0.78);
    this.sample(CYCLE, 0.45 + windup * 1.6);
    if (beforeContact && now < attack.contactAt - 0.2) return;
    const {a, b} = restlessRenownerBlade(renowner, now);
    const blend = beforeContact ? ease((now - attack.contactAt + 0.2) / 0.2)
      : 1 - ease((now - attack.contactAt - 0.25) / 0.1);
    const grip = this.sword.getWorldPosition(new THREE.Vector3()).lerp(new THREE.Vector3(...a), blend);
    const tip = this.sword.localToWorld(new THREE.Vector3(...RENOWNER_BLADE_TIP)).lerp(new THREE.Vector3(...b), blend);
    this.poseBlade(grip, tip);
  }

  dispose() {
    this.disposed = true;
    this.group.removeFromParent();
    if (this.model) release(this.model);
  }
}
