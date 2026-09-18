import * as THREE from 'three';

const ACCENTS = [0xd9564f, 0x48c2d8, 0xd7b84b, 0x8b6fd6, 0x59b678, 0xe17cb0, 0xe88d43, 0x6b8fe5];

function createRig(index) {
  const group = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x555f6f, roughness: 0.72, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x242934, roughness: 0.8, metalness: 0.18 });
  const accent = new THREE.MeshStandardMaterial({ color: ACCENTS[index % ACCENTS.length], emissive: ACCENTS[index % ACCENTS.length], emissiveIntensity: 0.08, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb9866b, roughness: 0.9 });

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.42), dark); legs.position.y = 0.38; group.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.85, 0.48), armor); torso.position.y = 1.05; group.add(torso);
  const tabard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.06), accent); tabard.position.set(0, 0.82, -0.275); group.add(tabard);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.5, 0.5), skin); head.position.y = 1.75; group.add(head);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.24, 0.62), dark); hood.position.y = 1.93; group.add(hood);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.82, 0.24), armor); leftArm.position.set(-0.6, 1.08, 0); group.add(leftArm);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.82, 0.24), armor); rightArm.position.set(0.6, 1.08, 0); group.add(rightArm);
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.18, 0.055), new THREE.MeshStandardMaterial({ color: 0xbac5d2, metalness: 0.82, roughness: 0.26 })); blade.position.y = 0.62; sword.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.1), accent); guard.position.y = 0.06; sword.add(guard);
  sword.position.set(0.67, 1.1, -0.05); sword.rotation.z = -0.55; group.add(sword);
  group.userData = { torso, leftArm, rightArm, sword, accent };
  return group;
}

export class RemotePlayers {
  constructor(scene, localId) {
    this.scene = scene;
    this.localId = localId;
    this.rigs = new Map();
    this.samples = new Map();
  }

  setLocalId(id) { this.localId = id; }

  pushSnapshot(snapshot, receivedAtMs) {
    let index = 0;
    const seen = new Set();
    for (const player of snapshot.players) {
      if (player.id === this.localId) continue;
      seen.add(player.id);
      if (!this.rigs.has(player.id)) {
        const rig = createRig(index++);
        this.rigs.set(player.id, rig);
        this.scene.add(rig);
      }
      const list = this.samples.get(player.id) ?? [];
      list.push({ at: receivedAtMs, player });
      while (list.length > 4) list.shift();
      this.samples.set(player.id, list);
    }
    for (const [id, rig] of this.rigs) {
      if (!seen.has(id)) {
        this.scene.remove(rig);
        this.rigs.delete(id);
        this.samples.delete(id);
      }
    }
  }

  update(nowMs) {
    const renderTime = nowMs - 100;
    for (const [id, rig] of this.rigs) {
      const samples = this.samples.get(id) ?? [];
      if (!samples.length) continue;
      let a = samples[0];
      let b = samples[samples.length - 1];
      for (let i = 0; i < samples.length - 1; i += 1) {
        if (samples[i].at <= renderTime && samples[i + 1].at >= renderTime) { a = samples[i]; b = samples[i + 1]; break; }
      }
      const span = Math.max(1, b.at - a.at);
      const t = Math.max(0, Math.min(1, (renderTime - a.at) / span));
      const pa = a.player; const pb = b.player;
      rig.position.set(
        pa.position.x + (pb.position.x - pa.position.x) * t,
        pa.position.y + (pb.position.y - pa.position.y) * t,
        pa.position.z + (pb.position.z - pa.position.z) * t,
      );
      const yawDelta = Math.atan2(Math.sin(pb.yaw - pa.yaw), Math.cos(pb.yaw - pa.yaw));
      rig.rotation.y = pa.yaw + yawDelta * t;
      rig.visible = pb.alive;
      const { sword, rightArm, accent } = rig.userData;
      if (pb.guarding) {
        sword.rotation.z += (-0.08 - sword.rotation.z) * 0.25;
        sword.rotation.x += (-1.2 - sword.rotation.x) * 0.25;
        rightArm.rotation.x = -0.7;
      } else {
        sword.rotation.z += (-0.55 - sword.rotation.z) * 0.18;
        sword.rotation.x *= 0.82;
        rightArm.rotation.x *= 0.82;
      }
      accent.emissiveIntensity = pb.spawnProtectionUntil > (pb.serverTime ?? 0) ? 0.5 : 0.08;
    }
  }

  dispose() {
    for (const rig of this.rigs.values()) this.scene.remove(rig);
    this.rigs.clear(); this.samples.clear();
  }
}
