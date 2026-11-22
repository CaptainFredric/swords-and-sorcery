import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { appUrl } from '../appUrl.mjs';
import { RENOWNER_BLADE_TIP, RENOWNER_MOUTH, restlessRenownerBlade } from '../../shared/worlds/renownerGeometry.mjs';

const ASSET = '/client/assets/props/rightful-renowner/Rightful_Renowner_GameReady_PBR.glb?v=2a9e73a7b5991757';
const CYCLE = '01_Knighting_And_Dispense_Cycle';
const IDLE = '02_Idle_Pose';
const OPEN = '06_Dispense_Open_Pose';
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
  constructor(parent, position, { yaw = Math.PI, scale = 1, swordScale = 1, carpet = true } = {}) {
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
      // Two tiny disconnected scan fragments hang below the original blade.
      // Keep the actual blade, fuller, guard, grip and pommel from the GLB.
      const geometry = this.sword.geometry;
      const positions = geometry.getAttribute('position');
      const indices = geometry.index.array;
      const clean = [];
      for (let i = 0; i < indices.length; i += 3) {
        const triangle = [indices[i], indices[i + 1], indices[i + 2]];
        if (!triangle.every(index => positions.getY(index) < -1.49 && positions.getZ(index) < -.08)) clean.push(...triangle);
      }
      geometry.setIndex(clean);
      this.sword.scale.setScalar(swordScale);
      this.swordScale = swordScale;
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
    this.group.updateWorldMatrix(true, true);
    const rootRotation = this.group.getWorldQuaternion(new THREE.Quaternion());
    const direction = tip.clone().sub(grip).normalize();
    const axis = new THREE.Vector3(...RENOWNER_BLADE_TIP).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(axis,
      direction.applyQuaternion(rootRotation.clone().invert())).premultiply(rootRotation);
    const swordRotation = sword.getWorldQuaternion(new THREE.Quaternion()).invert();
    const wristRotations = this.arms.map(([, ,wrist]) => swordRotation.clone()
      .multiply(wrist.getWorldQuaternion(new THREE.Quaternion())));
    const wristTargets = this.arms.map(([, ,wrist]) => sword.worldToLocal(wrist.getWorldPosition(new THREE.Vector3()))
      .multiplyScalar(this.scale * this.swordScale).applyQuaternion(orientation).add(grip));

    this.arms.forEach(([shoulder, elbow, wrist], i) => {
      const target = wristTargets[i];
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
      wrist.quaternion.copy(wrist.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation).multiply(wristRotations[i]));
    });
    sword.position.copy(sword.parent.worldToLocal(grip.clone()));
    sword.quaternion.copy(sword.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));
  }

  courtPose(pitch, side = 0) {
    this.sample(CYCLE, 2.8);
    const grip = this.group.localToWorld(new THREE.Vector3(0, 2.96, .74));
    const length = Math.hypot(...RENOWNER_BLADE_TIP);
    const direction = new THREE.Vector3(Math.sin(side) * Math.cos(pitch),
      Math.sin(pitch), Math.cos(side) * Math.cos(pitch));
    const tip = this.group.localToWorld(new THREE.Vector3(0, 2.96, .74).addScaledVector(direction, length));
    this.poseBlade(grip, tip);
  }

  courtStrike(progress, alternate) {
    this.courtPose(THREE.MathUtils.lerp(.35, -.95, progress), alternate ? -.12 : .12);
  }

  court(now, ceremony, alternate = false) {
    if (!this.model) return;
    if (!ceremony) {
      // A continuous, outward presentation with a slow dip over each shoulder.
      const clock = Math.max(0, now);
      const phase = clock % 6;
      const side = Math.floor(clock / 6) % 2 === 0 ? .22 : -.22;
      const dip = Math.sin(Math.PI * Math.min(1, phase / 6)) ** 2;
      this.courtPose(.25 - dip * .70, side * dip);
      return;
    }
    const t = Math.max(0, now - ceremony.startedAt);
    const side = alternate ? -.22 : .22;
    switch (ceremony.cue) {
      case 'SWORD_RAISE':
        this.courtPose(THREE.MathUtils.lerp(.05, .35, ease(t / 1.1)));
        break;
      case 'KNIGHTING': {
        const dip = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 1.1) / 1.2)));
        this.courtPose(.35 - .8 * dip, side * dip);
        break;
      }
      case 'SWORD_EXECUTION':
        this.courtStrike(ease((t - 1.7) / .25), alternate);
        break;
      case 'SWORD_EVADED':
      case 'I_HAVE_SURPASSED_JUDGEMENT':
        this.courtStrike(ease((t - 1.8) / .25), alternate);
        break;
      case 'SWORD_RESET': {
        const progress = ease((t - (t < 5.2 ? 3 : 5.2)) / 1.8);
        this.courtStrike(1 - progress, alternate);
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
    if (['REWARD_COIN','CONSOLATION_COIN','CONSOLATION_REACTION','RECEIVE_COMPENSATION',
      'COIN_RETALIATION','LATE_COIN','SOLEMN_JUDGMENT','NO_REWARD'].includes(ceremony.cue)) {
      // courtPose samples the original arms, so preserve the dispenser channels.
      const parts = ['Renowner_Dispenser_Hatch','Renowner_Dispenser_Tray','Renowner_Token'];
      const transforms = parts.map(name => { const n=this.nodes.get(name);return [n,n.position.clone(),n.quaternion.clone()]; });
      this.courtPose(.25);
      for (const [node,position,rotation] of transforms) { node.position.copy(position);node.quaternion.copy(rotation); }
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
    if (attack.type === 'sweep') {
      const progress = THREE.MathUtils.clamp((now - attack.contactAt) / .25, 0, 1);
      const blend = ease((now - attack.startedAt) / .85) * (1 - ease((now - attack.contactAt - .25) / .1));
      this.nodes.get('Renowner_Torso_And_Head').rotation.y = (progress - .5) * 2.3 * blend;
    }
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
