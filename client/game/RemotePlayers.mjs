import * as THREE from 'three';
import { createSpellbladeAsset } from './SpellbladeAssets.mjs';
import { createSpellbladeRig } from './SpellbladeModel.mjs';
import { resolveSpellbladeAnimationPlan } from './spellbladeAnimationPlan.mjs';
import { resolveRemoteSpellbladePose } from './remoteSpellbladePose.mjs';
import {
  createRemoteVisualShell,
  disposeRemoteVisualShell,
  setRemoteVisualPlan,
  upgradeRemoteVisual,
} from './remoteVisualState.mjs';
import { bufferedServerTime, castPoseWindowFromEvent, resolveSpellbladeState } from './spellbladePose.mjs';

function damp(value, target, amount) {
  return value + (target - value) * amount;
}

function dampEuler(object, x, y, z, amount = 0.22) {
  object.rotation.x = damp(object.rotation.x, x, amount);
  object.rotation.y = damp(object.rotation.y, y, amount);
  object.rotation.z = damp(object.rotation.z, z, amount);
}

function applyCastWindow(shell, window) {
  if (!window) return;
  const d = shell.root.userData;
  if (window.endAt < (d.castPoseUntil ?? 0)) return;
  d.castPoseStartAt = window.startAt;
  d.castPoseUntil = window.endAt;
}

function animateFallbackRig(rig, state, player, serverNow, localTime) {
  const d = rig.userData;
  const pose = resolveRemoteSpellbladePose({ state, player, serverNow, localTime });

  d.visual.position.y = damp(d.visual.position.y, pose.visual.y, state === 'dead' ? 0.12 : 0.24);
  dampEuler(d.visual, pose.visual.rx, pose.visual.ry, pose.visual.rz, state === 'dead' ? 0.1 : 0.23);
  dampEuler(d.torso, pose.torso.rx, pose.torso.ry, pose.torso.rz);
  dampEuler(d.head, pose.head.rx, pose.head.ry, pose.head.rz);
  dampEuler(d.leftUpperArm, pose.leftUpperArm.rx, pose.leftUpperArm.ry, pose.leftUpperArm.rz);
  dampEuler(d.rightUpperArm, pose.rightUpperArm.rx, pose.rightUpperArm.ry, pose.rightUpperArm.rz);
  dampEuler(d.leftForearm, pose.leftForearm.rx, pose.leftForearm.ry, pose.leftForearm.rz);
  dampEuler(d.rightForearm, pose.rightForearm.rx, pose.rightForearm.ry, pose.rightForearm.rz);
  dampEuler(d.leftThigh, pose.leftThigh.rx, pose.leftThigh.ry, pose.leftThigh.rz);
  dampEuler(d.rightThigh, pose.rightThigh.rx, pose.rightThigh.ry, pose.rightThigh.rz);
  dampEuler(d.leftShin, pose.leftShin.rx, pose.leftShin.ry, pose.leftShin.rz);
  dampEuler(d.rightShin, pose.rightShin.rx, pose.rightShin.ry, pose.rightShin.rz);
  dampEuler(d.sword, pose.sword.rx, pose.sword.ry, pose.sword.rz, 0.28);
  d.tabardFront.rotation.x = damp(d.tabardFront.rotation.x, pose.tabardX, 0.18);
  d.tabardBack.rotation.x = damp(d.tabardBack.rotation.x, -pose.tabardX * 0.7, 0.18);
  d.magicAnchor.scale.setScalar(damp(d.magicAnchor.scale.x, pose.magicScale, 0.28));
  d.magicHalo.rotation.z = localTime * 2.8;
}

function disposeFallbackRig(rig) {
  const geometries = new Set();
  const materials = new Set();
  rig.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const source = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of source) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose?.();
  for (const material of materials) material.dispose?.();
}

function setGlbAccent(instance, intensity) {
  if (!instance?.materials) return;
  for (const name of ['VisorGlow', 'SorceryAccent']) {
    for (const material of instance.materials[name] ?? []) {
      if ('emissiveIntensity' in material) material.emissiveIntensity = intensity;
    }
  }
}

function createRemoteShell(index, player, pendingCast) {
  const root = new THREE.Group();
  root.name = `RemoteSpellblade-${player.id}`;

  const fallbackRig = createSpellbladeRig(index);
  const shell = createRemoteVisualShell({
    root,
    fallback: fallbackRig,
    fallbackDispose: () => disposeFallbackRig(fallbackRig),
  });
  shell.fallbackRig = fallbackRig;

  const d = root.userData;
  d.lastAlive = player.alive;
  d.deathStartedAt = null;
  d.castPoseStartAt = -Infinity;
  d.castPoseUntil = 0;
  applyCastWindow(shell, pendingCast);

  const generation = shell.generation;
  createSpellbladeAsset({ kind: 'thirdPerson' })
    .then((instance) => {
      if (!instance) return;
      upgradeRemoteVisual(shell, instance, generation);
    })
    .catch(() => {
      // The procedural fallback remains authoritative presentation until a valid GLB is available.
    });

  return shell;
}

export class RemotePlayers {
  constructor(scene, localId) {
    this.scene = scene;
    this.localId = localId;
    this.rigs = new Map();
    this.samples = new Map();
    this.pendingCasts = new Map();
    this.nextRigIndex = 0;
  }

  setLocalId(id) { this.localId = id; }

  onEvent(event) {
    if (event?.type !== 'fireballCast' || event.playerId === this.localId) return;
    const window = castPoseWindowFromEvent(event);
    if (!window) return;

    const shell = this.rigs.get(event.playerId);
    if (shell) {
      applyCastWindow(shell, window);
      return;
    }

    const pending = this.pendingCasts.get(event.playerId);
    if (!pending || window.endAt >= pending.endAt) this.pendingCasts.set(event.playerId, window);
  }

  pushSnapshot(snapshot, receivedAtMs) {
    const seen = new Set();
    for (const player of snapshot.players) {
      if (player.id === this.localId) continue;
      seen.add(player.id);
      if (!this.rigs.has(player.id)) {
        const shell = createRemoteShell(
          this.nextRigIndex++,
          player,
          this.pendingCasts.get(player.id),
        );
        this.pendingCasts.delete(player.id);
        this.rigs.set(player.id, shell);
        this.scene.add(shell.root);
      }

      const shell = this.rigs.get(player.id);
      const d = shell.root.userData;

      if (d.lastAlive && !player.alive) d.deathStartedAt = receivedAtMs;
      if (!d.lastAlive && player.alive) {
        d.deathStartedAt = null;
        d.castPoseStartAt = -Infinity;
        d.castPoseUntil = 0;
        if (shell.visualKind === 'fallback') {
          const fallback = shell.fallbackRig?.userData;
          fallback?.visual?.position?.set?.(0, 0, 0);
          fallback?.visual?.rotation?.set?.(0, 0, 0);
        }
      }
      d.lastAlive = player.alive;

      const list = this.samples.get(player.id) ?? [];
      list.push({ at: receivedAtMs, serverTime: snapshot.serverTime, player });
      while (list.length > 5) list.shift();
      this.samples.set(player.id, list);
    }

    for (const [id, shell] of this.rigs) {
      if (!seen.has(id)) {
        this.scene.remove(shell.root);
        disposeRemoteVisualShell(shell);
        this.rigs.delete(id);
        this.samples.delete(id);
      }
    }

    for (const [id, window] of this.pendingCasts) {
      if (!seen.has(id) && snapshot.serverTime > window.endAt + 1) this.pendingCasts.delete(id);
    }
  }

  update(nowMs) {
    const renderTime = nowMs - 100;
    const localTime = nowMs / 1000;
    for (const [id, shell] of this.rigs) {
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
      shell.root.position.set(
        pa.position.x + (pb.position.x - pa.position.x) * t,
        pa.position.y + (pb.position.y - pa.position.y) * t,
        pa.position.z + (pb.position.z - pa.position.z) * t,
      );
      const yawDelta = Math.atan2(Math.sin(pb.yaw - pa.yaw), Math.cos(pb.yaw - pa.yaw));
      shell.root.rotation.y = pa.yaw + yawDelta * t;

      const serverNow = bufferedServerTime(a, b, renderTime);
      const d = shell.root.userData;
      const state = resolveSpellbladeState(pb, serverNow, d.castPoseUntil, d.castPoseStartAt);

      if (state === 'dead') {
        if (d.deathStartedAt === null) d.deathStartedAt = nowMs;
        shell.root.visible = nowMs - d.deathStartedAt < 1050;
      } else {
        shell.root.visible = true;
        d.deathStartedAt = null;
      }

      const animationPlayer = { ...pb, castPoseStartAt: d.castPoseStartAt };
      const plan = resolveSpellbladeAnimationPlan({ state, player: animationPlayer, serverNow, localTime });
      setRemoteVisualPlan(shell, plan);

      const protectedNow = (pb.spawnProtectionUntil ?? 0) > serverNow;
      const accentIntensity = protectedNow ? 2.8 : state === 'cast' ? 2.3 : 1.4;
      if (shell.visualKind === 'fallback') {
        animateFallbackRig(shell.fallbackRig, state, pb, serverNow, localTime);
        shell.fallbackRig.userData.accentMaterial.emissiveIntensity = accentIntensity;
      } else {
        setGlbAccent(shell.visualInstance, accentIntensity);
      }
    }
  }

  dispose() {
    for (const shell of this.rigs.values()) {
      this.scene.remove(shell.root);
      disposeRemoteVisualShell(shell);
    }
    this.rigs.clear();
    this.samples.clear();
    this.pendingCasts.clear();
  }
}
