import * as THREE from 'three';
import { createSpellbladeAsset, reportSpellbladeAssetStatus } from './SpellbladeAssets.mjs';
import { createSpellbladeRig } from './SpellbladeModel.mjs';
import { resolveSpellbladeAnimationPlan } from './spellbladeAnimationPlan.mjs';
import { resolveRemoteSpellbladePose } from './remoteSpellbladePose.mjs';
import {
  createRemoteVisualShell,
  disposeRemoteVisualShell,
  revealRemoteFallback,
  setRemoteVisualPlan,
  upgradeRemoteVisual,
} from './remoteVisualState.mjs';
import { bufferedServerTime, castPoseWindowFromEvent, resolveSpellbladeState } from './spellbladePose.mjs';
import { airborneLegFlex, landingStrength, pruneReactions } from './spellbladeMotion.mjs';

// which body reacts to which combat event, and how
const REACTION_EVENTS = Object.freeze({
  damage: { kind: 'hit', target: 'victimId', from: 'attackerId' },
  block: { kind: 'block', target: 'defenderId', from: 'attackerId' },
  guardBreak: { kind: 'guardBreak', target: 'defenderId', from: 'attackerId' },
  parry: { kind: 'parry', target: 'defenderId', from: 'attackerId' },
});

function damp(value, target, amount) {
  return value + (target - value) * amount;
}

function dampEuler(object, x, y, z, amount = 0.22) {
  object.rotation.x = damp(object.rotation.x, x, amount);
  object.rotation.y = damp(object.rotation.y, y, amount);
  object.rotation.z = damp(object.rotation.z, z, amount);
}

// how long an opponent may stay hidden while its production model loads before the fallback stands in
const FALLBACK_GRACE_MS = 4000;
// a struck body glows hot for a moment: a warm tint over its own shading (its own materials; never a white
// silhouette that erases the knight), strongest at the blow and gone in a tenth of a second
const HIT_GLOW = Object.freeze({ color: new THREE.Color(0xffc98f), peak: 0.42, seconds: 0.1 });

function setHitGlow(shell, amount) {
  if (shell.visualKind !== 'glb' || !shell.visual) return;
  const level = Math.max(0, Math.min(1, amount));
  if (level === 0 && !shell.hitGlowing) return;
  shell.hitGlowing = level > 0;
  shell.visual.traverse((object) => {
    if (!object.isMesh) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material?.emissive) continue;
      material.userData.restEmissive ??= material.emissive.clone();
      material.emissive.copy(material.userData.restEmissive).lerp(HIT_GLOW.color, level * HIT_GLOW.peak);
    }
  });
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

function setGlbAccent(instance, visor, sorcery) {
  if (!instance?.materials) return;
  for (const [name, intensity] of [['VisorGlow', visor], ['SorceryAccent', sorcery]]) {
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
    hideFallbackWhileLoading: true,
  });
  shell.createdAtMs = performance.now();
  shell.fallbackRig = fallbackRig;
  reportSpellbladeAssetStatus('remote');

  const d = root.userData;
  d.reactions = [];
  d.airborne = false;
  d.fastestFall = 0;
  d.lastAlive = player.alive;
  d.deathStartedAt = null;
  d.castPoseStartAt = -Infinity;
  d.castPoseUntil = 0;
  applyCastWindow(shell, pendingCast);

  const generation = shell.generation;
  createSpellbladeAsset({ kind: 'thirdPerson' })
    .then((instance) => {
      if (!instance) {
        revealRemoteFallback(shell);
        return;
      }
      if (upgradeRemoteVisual(shell, instance, generation)) {
        instance.setCloth(shell.cloth ?? 'crimson');
        reportSpellbladeAssetStatus('remote', instance);
      }
    })
    .catch(() => {
      // The procedural fallback remains authoritative presentation until a valid GLB is available.
      revealRemoteFallback(shell);
      reportSpellbladeAssetStatus('remote');
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

  onEvent(event, snapshot = null) {
    this.#react(event, snapshot);
    if (event?.type !== 'spellCast' || event.playerId === this.localId) return;
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

  // queue a short procedural reaction on the body that took the blow, played on the interpolated clock
  #react(event, snapshot) {
    // a sword blow says which strike it was (its damage came a moment before, in the same tick): the flinch turns
    // with that blade's travel
    if (event?.type === 'swordHit') {
      const d = this.rigs.get(event.targetId)?.root.userData;
      if (d) d.reactions = d.reactions.map((reaction) => (reaction.kind === 'hit' && reaction.at === event.at ? { ...reaction, strike: event.strikeIndex } : reaction));
      return;
    }
    const spec = REACTION_EVENTS[event?.type];
    if (!spec || !Number.isFinite(event.at)) return;
    if (event.type === 'damage' && (event.source === 'abyss' || !(event.amount > 0))) return;
    const targetId = event[spec.target];
    const shell = this.rigs.get(targetId);
    if (!shell) return;
    const players = snapshot?.players ?? [];
    const victim = players.find((p) => p.id === targetId)?.position ?? shell.root.position;
    const source = players.find((p) => p.id === event[spec.from])?.position ?? null;
    const push = source ? { x: victim.x - source.x, z: victim.z - source.z } : null;
    const strength = event.type === 'damage' ? Math.min(1.2, 0.6 + (event.amount ?? 0) / 60) : 1;
    const d = shell.root.userData;
    d.reactions = [...pruneReactions(d.reactions, event.at), { kind: spec.kind, at: event.at, push, strength }];
    // the killing blow's push carries into the fall
    if (event.type === 'damage') d.lastPush = push;
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
      shell.cloth = player.cloth ?? 'crimson';
      shell.visualInstance?.setCloth(shell.cloth);
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

  // a struck opponent glows hot for a moment (the game runtime calls this when a blow lands)
  flashHit(id) {
    const shell = this.rigs.get(id);
    if (shell) shell.hitGlowAt = performance.now();
  }

  // where an opponent is drawn right now
  bodyPosition(id) {
    const shell = this.rigs.get(id);
    if (!shell) return null;
    const { x, y, z } = shell.root.position;
    return { x, y, z };
  }

  // where the other living Spellblades are drawn right now (for the local body's separation prediction)
  bodies() {
    const list = [];
    for (const [id, shell] of this.rigs) {
      if (!shell.root.visible || shell.root.userData.lastAlive === false) continue;
      const { x, y, z } = shell.root.position;
      list.push({ id, x, y, z });
    }
    return list;
  }

  update(nowMs, dt = 0) {
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

      // landing: remember the fastest fall while airborne and absorb it on touch-down
      const verticalVelocity = pb.velocity?.y ?? 0;
      if (state === 'air') {
        d.airborne = true;
        d.fastestFall = Math.max(d.fastestFall, -verticalVelocity);
      } else if (d.airborne) {
        d.airborne = false;
        const strength = landingStrength(d.fastestFall);
        if (strength > 0.05 && state !== 'dead') d.reactions = [...d.reactions, { kind: 'land', at: serverNow, strength }];
        d.fastestFall = 0;
      }
      d.reactions = pruneReactions(d.reactions, serverNow);

      const animationPlayer = { ...pb, castPoseStartAt: d.castPoseStartAt };
      const plan = resolveSpellbladeAnimationPlan({ state, player: animationPlayer, serverNow, localTime });
      plan.motion = {
        // the killing blow's flinch plays on into the death, and the body gives way under it
        reactions: d.reactions,
        now: serverNow,
        yaw: shell.root.rotation.y,
        airFlex: state === 'air' ? airborneLegFlex(verticalVelocity) : 0,
        death: plan.clip === 'Death' ? { age: plan.time, push: d.lastPush ?? null } : null,
      };
      setRemoteVisualPlan(shell, plan, dt);

      const glowAge = (nowMs - (shell.hitGlowAt ?? -Infinity)) / 1000;
      setHitGlow(shell, glowAge < HIT_GLOW.seconds ? 1 - glowAge / HIT_GLOW.seconds : 0);

      const protectedNow = (pb.spawnProtectionUntil ?? 0) > serverNow;
      const accentIntensity = protectedNow ? 2.8 : state === 'cast' ? 2.3 : 1.4;
      if (shell.visualKind === 'fallback') {
        if (!shell.visual?.visible && nowMs - (shell.createdAtMs ?? nowMs) > FALLBACK_GRACE_MS) revealRemoteFallback(shell);
        animateFallbackRig(shell.fallbackRig, state, pb, serverNow, localTime);
        shell.fallbackRig.userData.accentMaterial.emissiveIntensity = accentIntensity;
      } else {
        // the visor keeps its read (and flares for spawn protection); the gauntlet runes follow the palm sorcery
        const sorcery = shell.visualInstance?.sorceryLevel?.() ?? 0;
        setGlbAccent(shell.visualInstance, accentIntensity, (protectedNow ? 1.6 : 0.6) + 1.8 * sorcery);
      }
    }
  }

  dispose() {
    for (const shell of this.rigs.values()) {
      setHitGlow(shell, 0);
      this.scene.remove(shell.root);
      disposeRemoteVisualShell(shell);
    }
    this.rigs.clear();
    this.samples.clear();
    this.pendingCasts.clear();
  }
}
