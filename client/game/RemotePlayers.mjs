import * as THREE from 'three';
import { createSpellbladeRig } from './SpellbladeModel.mjs';
import { attackMotion, resolveSpellbladeState } from './spellbladePose.mjs';

function damp(value, target, amount) {
  return value + (target - value) * amount;
}

function dampEuler(object, x, y, z, amount = 0.22) {
  object.rotation.x = damp(object.rotation.x, x, amount);
  object.rotation.y = damp(object.rotation.y, y, amount);
  object.rotation.z = damp(object.rotation.z, z, amount);
}

function animateRig(rig, state, player, serverNow, localTime) {
  const d = rig.userData;
  const velocity = player.velocity ?? { x: 0, y: 0, z: 0 };
  const speed = Math.min(1, Math.hypot(velocity.x ?? 0, velocity.z ?? 0) / 7.5);
  const breath = Math.sin(localTime * 2.4);

  let visualY = breath * 0.008;
  let visualRX = 0; let visualRY = 0; let visualRZ = 0;
  let torsoRX = 0; let torsoRY = 0; let torsoRZ = breath * 0.008;
  let headRX = 0; let headRY = 0; let headRZ = 0;
  let luaX = 0; let luaY = 0; let luaZ = 0.08;
  let ruaX = 0; let ruaY = 0; let ruaZ = -0.08;
  let lfaX = 0; let lfaY = 0; let lfaZ = 0;
  let rfaX = 0; let rfaY = 0; let rfaZ = 0;
  let ltX = 0; let ltZ = 0; let rtX = 0; let rtZ = 0;
  let lsX = 0; let rsX = 0;
  let swordX = 0.06; let swordY = 0; let swordZ = -2.42;
  let tabardX = -0.03 - speed * 0.05;
  let magicScale = 1 + breath * 0.08;

  if (state === 'run') {
    const phase = localTime * 9.4;
    const step = Math.sin(phase) * speed;
    const lift = Math.abs(Math.cos(phase)) * speed;
    visualY += lift * 0.025;
    visualRX = 0.06 * speed;
    torsoRZ = step * 0.045;
    ltX = step * 0.68;
    rtX = -step * 0.68;
    lsX = Math.max(0, -step) * 0.55;
    rsX = Math.max(0, step) * 0.55;
    luaX = -step * 0.34;
    ruaX = step * 0.26;
    tabardX = -0.14 - speed * 0.08;
  } else if (state === 'air') {
    visualRX = 0.04;
    ltX = 0.28;
    rtX = 0.16;
    lsX = -0.55;
    rsX = -0.42;
    luaX = 0.18;
    ruaX = 0.1;
    tabardX = -0.2;
  } else if (state === 'guard') {
    torsoRY = 0.14;
    headRY = -0.08;
    ruaX = -0.5;
    ruaZ = -0.62;
    rfaX = -1.02;
    rfaZ = -0.12;
    luaX = -0.62;
    luaZ = 0.32;
    lfaX = -0.38;
    swordX = -0.38;
    swordY = -0.18;
    swordZ = -0.72;
    tabardX = -0.06;
  } else if (state === 'attack') {
    const motion = attackMotion(player, serverNow);
    const s = motion.swing;
    if (motion.strike === 0) {
      torsoRY = -0.22 + s * 0.46;
      ruaX = -0.34;
      ruaZ = -0.58 + s * 1.42;
      rfaX = -0.42;
      swordZ = -2.12 + s * 1.58;
    } else if (motion.strike === 1) {
      torsoRY = 0.24 - s * 0.48;
      ruaX = -0.26;
      ruaZ = 0.48 - s * 1.38;
      rfaX = -0.34;
      swordZ = -1.72 - s * 1.05;
    } else {
      torsoRX = -0.08 + s * 0.18;
      ruaX = -1.35 + s * 0.78;
      ruaZ = -0.16;
      rfaX = -0.7;
      swordX = -0.65 + s * 1.12;
      swordZ = -1.12;
    }
    luaX = -0.18;
    tabardX = -0.1 - s * 0.08;
  } else if (state === 'cast') {
    torsoRY = -0.18;
    headRY = -0.12;
    luaX = -1.28;
    luaZ = 0.14;
    lfaX = -0.22;
    lfaZ = -0.08;
    ruaX = 0.1;
    magicScale = 1.65 + Math.sin(localTime * 32) * 0.18;
    tabardX = -0.1;
  } else if (state === 'dash') {
    visualRX = -0.25;
    torsoRX = -0.12;
    headRX = 0.12;
    luaX = 0.7;
    ruaX = 0.62;
    ltX = -0.16;
    rtX = 0.34;
    lsX = -0.18;
    rsX = -0.48;
    tabardX = -0.34;
  } else if (state === 'stagger') {
    const jolt = Math.sin((player.staggerUntil - serverNow) * 24);
    visualRZ = 0.16 * jolt;
    torsoRX = 0.12;
    headRZ = -0.12 * jolt;
    luaZ = 0.72;
    ruaZ = -0.72;
    swordZ = -2.7;
  } else if (state === 'dead') {
    visualY = -0.32;
    visualRX = 0.08;
    visualRZ = 1.34;
    luaZ = 0.72;
    ruaZ = -0.55;
    swordZ = -2.9;
    tabardX = -0.28;
    magicScale = 0.55;
  }

  d.visual.position.y = damp(d.visual.position.y, visualY, state === 'dead' ? 0.12 : 0.24);
  dampEuler(d.visual, visualRX, visualRY, visualRZ, state === 'dead' ? 0.1 : 0.23);
  dampEuler(d.torso, torsoRX, torsoRY, torsoRZ);
  dampEuler(d.head, headRX, headRY, headRZ);
  dampEuler(d.leftUpperArm, luaX, luaY, luaZ);
  dampEuler(d.rightUpperArm, ruaX, ruaY, ruaZ);
  dampEuler(d.leftForearm, lfaX, lfaY, lfaZ);
  dampEuler(d.rightForearm, rfaX, rfaY, rfaZ);
  dampEuler(d.leftThigh, ltX, 0, ltZ);
  dampEuler(d.rightThigh, rtX, 0, rtZ);
  dampEuler(d.leftShin, lsX, 0, 0);
  dampEuler(d.rightShin, rsX, 0, 0);
  dampEuler(d.sword, swordX, swordY, swordZ, 0.28);
  d.tabardFront.rotation.x = damp(d.tabardFront.rotation.x, tabardX, 0.18);
  d.tabardBack.rotation.x = damp(d.tabardBack.rotation.x, -tabardX * 0.7, 0.18);
  d.magicAnchor.scale.setScalar(damp(d.magicAnchor.scale.x, magicScale, 0.28));
  d.magicHalo.rotation.z = localTime * 2.8;
}

export class RemotePlayers {
  constructor(scene, localId) {
    this.scene = scene;
    this.localId = localId;
    this.rigs = new Map();
    this.samples = new Map();
    this.nextRigIndex = 0;
  }

  setLocalId(id) { this.localId = id; }

  pushSnapshot(snapshot, receivedAtMs) {
    const seen = new Set();
    for (const player of snapshot.players) {
      if (player.id === this.localId) continue;
      seen.add(player.id);
      if (!this.rigs.has(player.id)) {
        const rig = createSpellbladeRig(this.nextRigIndex++);
        rig.userData.lastFireballReadyAt = player.fireballReadyAt ?? 0;
        rig.userData.lastAlive = player.alive;
        this.rigs.set(player.id, rig);
        this.scene.add(rig);
      }

      const rig = this.rigs.get(player.id);
      const d = rig.userData;
      const readyAt = player.fireballReadyAt ?? 0;
      if (d.lastFireballReadyAt !== null && readyAt > d.lastFireballReadyAt + 0.5) {
        d.castPoseUntil = snapshot.serverTime + 0.36;
      }
      d.lastFireballReadyAt = readyAt;

      if (d.lastAlive && !player.alive) d.deathStartedAt = receivedAtMs;
      if (!d.lastAlive && player.alive) {
        d.deathStartedAt = null;
        d.visual.position.y = 0;
        d.visual.rotation.set(0, 0, 0);
      }
      d.lastAlive = player.alive;

      const list = this.samples.get(player.id) ?? [];
      list.push({ at: receivedAtMs, serverTime: snapshot.serverTime, player });
      while (list.length > 5) list.shift();
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
    const localTime = nowMs / 1000;
    for (const [id, rig] of this.rigs) {
      const samples = this.samples.get(id) ?? [];
      if (!samples.length) continue;

      let a = samples[0];
      let b = samples[samples.length - 1];
      for (let i = 0; i < samples.length - 1; i += 1) {
        if (samples[i].at <= renderTime && samples[i + 1].at >= renderTime) {
          a = samples[i];
          b = samples[i + 1];
          break;
        }
      }

      const span = Math.max(1, b.at - a.at);
      const t = Math.max(0, Math.min(1, (renderTime - a.at) / span));
      const pa = a.player;
      const pb = b.player;
      rig.position.set(
        pa.position.x + (pb.position.x - pa.position.x) * t,
        pa.position.y + (pb.position.y - pa.position.y) * t,
        pa.position.z + (pb.position.z - pa.position.z) * t,
      );
      const yawDelta = Math.atan2(Math.sin(pb.yaw - pa.yaw), Math.cos(pb.yaw - pa.yaw));
      rig.rotation.y = pa.yaw + yawDelta * t;

      const snapshotAge = Math.max(0, Math.min(0.25, (nowMs - b.at) / 1000));
      const serverNow = b.serverTime + snapshotAge;
      const state = resolveSpellbladeState(pb, serverNow, rig.userData.castPoseUntil);

      if (state === 'dead') {
        if (rig.userData.deathStartedAt === null) rig.userData.deathStartedAt = nowMs;
        rig.visible = nowMs - rig.userData.deathStartedAt < 1050;
      } else {
        rig.visible = true;
        rig.userData.deathStartedAt = null;
      }

      animateRig(rig, state, pb, serverNow, localTime);
      const protectedNow = (pb.spawnProtectionUntil ?? 0) > serverNow;
      rig.userData.accentMaterial.emissiveIntensity = protectedNow ? 2.8 : state === 'cast' ? 2.3 : 1.4;
    }
  }

  dispose() {
    for (const rig of this.rigs.values()) this.scene.remove(rig);
    this.rigs.clear();
    this.samples.clear();
  }
}
