import { chivalryTellState, chivalryVisorAccent } from './chivalryPresentation.mjs';
import { createChivalryLink } from './chivalryLink.mjs';
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
import { airborneLegFlex, crouchPose, guardTurns, landingStrength, pruneReactions } from './spellbladeMotion.mjs';
import { gaitFootfall } from './sound/footsteps.mjs';
import { STEEL_RIPPLE, createSteelSheen } from './steelSheen.mjs';
import { createSunderBlade } from './sunderBlade.mjs';
import { VORTEX_BLADES, createVortexBlade } from './vortexBlade.mjs';
import { ULTIMATES, vortexAngle, vortexWindup } from '../../shared/src/ultimates.mjs';
import { steelStrength } from '../../shared/src/steel.mjs';
import { jabTurns } from './gauntletJab.mjs';

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

// the share of a Vortex's startup from which its blade is lit (as my own arms have it: fpVortex.mjs raiseBy), from
// which the sword is held out level, and from which it leaves its trail
export const VORTEX_LIT_FROM = 0.32;
const VORTEX_LEVEL_FROM = 0.45;
export const VORTEX_TRAIL_FROM = 0.6;

const _grip = new THREE.Vector3();
const _point = new THREE.Vector3();

// where a knight's sword points across the ground, in the knight's own frame: a yaw off the way the body faces
function heldBladeYaw(shell) {
  const socket = shell.visualInstance?.sockets?.sword;
  if (!socket) return 0;
  socket.updateWorldMatrix(true, false);
  socket.localToWorld(_grip.set(0, 0, 0));
  const [x, y, z] = VORTEX_BLADES.thirdPerson.aim;
  socket.localToWorld(_point.set(x, y, z));
  const yaw = Math.atan2(-(_point.x - _grip.x), -(_point.z - _grip.z));
  return Math.atan2(Math.sin(yaw - shell.root.rotation.y), Math.cos(yaw - shell.root.rotation.y));
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
    // told each time a knight's foot comes down: (id, position, heavy 0..1), from the gait clip's own stride
    this.onFootstep = null;
    this.rigs = new Map();
    this.samples = new Map();
    this.pendingCasts = new Map();
    this.nextRigIndex = 0;
  }

  setLocalId(id) { this.localId = id; }

  onEvent(event, snapshot = null) {
    this.#react(event, snapshot);
    const lifecycleShell = this.rigs.get(event?.playerId ?? event?.victimId ?? event?.defenderId);
    lifecycleShell?.chivalryLink?.event(event);
    if (lifecycleShell && ['ultimateStart', 'actionInterrupted', 'death', 'guardBreak', 'staggerBreak'].includes(event?.type)) {
      const d = lifecycleShell.root.userData;
      d.castPoseUntil = Math.min(d.castPoseUntil, event.at ?? 0);
    }
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
    // a Steel dash ram (its blow, when it landed, came a moment before in the same tick): the one rammed is thrown
    // through it harder, or braces into a guard; the rammer jolts to a stop; hardened plate on either flashes with it
    if (event?.type === 'steelRam' && Number.isFinite(event.at)) {
      const way = { x: event.direction?.x ?? 0, z: event.direction?.z ?? 1 };
      const victim = this.rigs.get(event.targetId)?.root.userData;
      if (victim) {
        if (!event.guarded) {
          victim.reactions = victim.reactions.map((reaction) => (reaction.kind === 'hit' && reaction.at === event.at ? { ...reaction, push: way, strength: Math.min(1.5, (reaction.strength ?? 1) * 1.6) } : reaction));
          victim.lastPush = way;
        } else if (!event.guardBroken) {
          victim.reactions = [...pruneReactions(victim.reactions, event.at), { kind: 'block', at: event.at, push: way, strength: 1.25 }];
        }
        if (event.steel > 0.02) victim.steelFlashAt = event.at;
      }
      const rammer = this.rigs.get(event.playerId)?.root.userData;
      if (rammer) {
        rammer.reactions = [...pruneReactions(rammer.reactions, event.at), { kind: 'hit', at: event.at, push: { x: -way.x, z: -way.z }, strength: 0.45 }];
        rammer.steelFlashAt = event.at;
      }
      return;
    }
    // a sword blow says which strike it was (its damage came a moment before, in the same tick): the flinch turns
    // with that blade's travel
    if (event?.type === 'swordHit') {
      const d = this.rigs.get(event.targetId)?.root.userData;
      // (and two knights crashing together throws the body harder)
      const crash = 1 + 0.35 * Math.max(0, Math.min(1, Number(event.impact) || 0));
      if (d) d.reactions = d.reactions.map((reaction) => (reaction.kind === 'hit' && reaction.at === event.at ? { ...reaction, strike: event.strikeIndex, strength: (reaction.strength ?? 1) * crash } : reaction));
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

  /** Current animated sorcery socket, including the interpolated cast pose. */
  palmPosition(id, target = new THREE.Vector3()) {
    const palm = this.rigs.get(id)?.visualInstance?.sockets?.sorcery;
    return palm ? palm.getWorldPosition(target) : null;
  }

  /** A gust of wind across a knight (a Gale): their cloth is flung the way it blows. */
  gust(id, wind) {
    this.rigs.get(id)?.visualInstance?.animator?.cloth?.gust(wind);
  }

  /** Another knight throws the gauntlet (pressed at server time `at`): the left arm drives out, on their own clock. */
  jab(id, at) {
    const d = this.rigs.get(id)?.root.userData;
    if (d && Number.isFinite(at)) d.jabAt = at;
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
      if (player.castingSpell === null && snapshot.serverTime >= d.castPoseStartAt && d.castPoseUntil > snapshot.serverTime + 0.06) d.castPoseUntil = 0;

      const list = this.samples.get(player.id) ?? [];
      // a jump: leaving the ground upward (for the grunt some jumps get)
      const before = list[list.length - 1]?.player;
      if (before && player.alive && (before.velocity?.y ?? 0) < 2 && (player.velocity?.y ?? 0) > 4) this.onJump?.(player.id);
      list.push({ at: receivedAtMs, serverTime: snapshot.serverTime, player });
      while (list.length > 5) list.shift();
      this.samples.set(player.id, list);
    }

    for (const [id, shell] of this.rigs) {
      if (!seen.has(id)) {
        this.scene.remove(shell.root);
        shell.steelSheen?.dispose();
        shell.sunderBlade?.dispose();
        shell.vortexBlade?.dispose();
        shell.chivalryLink?.dispose();
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

  // where an opponent is drawn right now and where they aim: { x, y, z, yaw, pitch, crouched }
  bodyAim(id) {
    const shell = this.rigs.get(id);
    if (!shell) return null;
    const { x, y, z } = shell.root.position;
    return { x, y, z, yaw: shell.root.userData.yaw ?? shell.root.rotation.y, pitch: shell.root.userData.pitch ?? 0, crouched: Boolean(shell.root.userData.crouched) };
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
      // (where they face and aim, whatever a Vortex then does with the body)
      shell.root.userData.yaw = shell.root.rotation.y;
      shell.root.userData.pitch = (pa.pitch ?? 0) + ((pb.pitch ?? 0) - (pa.pitch ?? 0)) * t;
      shell.root.userData.crouched = Boolean(pb.crouched);

      this.#pose(id, shell, pb, bufferedServerTime(a, b, renderTime), nowMs, dt);
    }
  }

  /**
   * My own body, for when the view is outside it (a Blazing Vortex seen from behind): drawn where I am now (my own
   * steps, not the host's word a moment old), posed as any knight is. `player`: my snapshot; `at`: { position, velocity,
   * yaw, pitch } as I have them; visible: whether it is drawn (kept ready, hidden, the rest of the time).
   */
  showSelf(player, at, serverNow, nowMs, dt, visible) {
    if (!player) return;
    if (!this.self) {
      this.self = createRemoteShell(this.nextRigIndex++, player, null);
      this.self.root.visible = false;
      this.scene.add(this.self.root);
    }
    const shell = this.self;
    shell.cloth = player.cloth ?? 'crimson';
    shell.visualInstance?.setCloth(shell.cloth);
    if (!visible || !at?.position) {
      if (shell.root.visible) shell.vortexBlade?.set(0, nowMs / 1000, { swinging: false });
      shell.root.visible = false;
      return;
    }
    shell.root.position.set(at.position.x, at.position.y, at.position.z);
    shell.root.rotation.y = at.yaw ?? 0;
    shell.root.userData.yaw = at.yaw ?? 0;
    shell.root.userData.pitch = at.pitch ?? 0;
    shell.root.userData.crouched = false;
    this.#pose(null, shell, { ...player, position: at.position, velocity: at.velocity ?? player.velocity, yaw: at.yaw ?? player.yaw }, serverNow, nowMs, dt);
    shell.root.visible = true;
  }

  // a knight's body, placed and facing, is posed for this frame: what it is doing, a Vortex's spin, its blade's fire,
  // its plate's steel, its sway. id: whose (null: my own body, which makes no sounds of its own here)
  #pose(id, shell, pb, serverNow, nowMs, dt) {
    const localTime = nowMs / 1000;
    const d = shell.root.userData;
    const state = resolveSpellbladeState(pb, serverNow, d.castPoseUntil, d.castPoseStartAt);
    // a Blazing Vortex turns the whole knight: one gathering turn as it is lit, then round with its blade
    const spin = pb.alive && pb.ultimateState?.id === 'vortex' ? pb.ultimateState : null;
    const spinning = spin && serverNow >= spin.commitAt && Number.isFinite(spin.angle);
    // (turned so that the sword seen is the blade that cuts: by where the held sword points in the knight's own frame)
    const held = d.vortexBladeYaw ?? 0;
    if (spinning) {
      const angle = vortexAngle(spin, serverNow);
      shell.root.rotation.y = angle - held;
      // (its beat, once a turn)
      const turn = Math.floor(angle / (2 * Math.PI));
      if (turn !== d.vortexTurn) {
        d.vortexTurn = turn;
        if (id) this.onVortexTurn?.(id, spin.rate);
      }
    } else if (spin) {
      const share = 1 - (spin.commitAt - serverNow) / ULTIMATES.vortex.startupSec;
      const levelled = Math.max(0, Math.min(1, (share - VORTEX_LEVEL_FROM) / (1 - VORTEX_LEVEL_FROM)));
      shell.root.rotation.y = d.yaw + vortexWindup(spin, serverNow) - held * levelled * levelled * (3 - 2 * levelled);
      d.vortexTurn = null;
    } else {
      d.vortexTurn = null;
    }

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
      if (strength > 0.05 && state !== 'dead') {
        d.reactions = [...d.reactions, { kind: 'land', at: serverNow, strength }];
        // and the tabards flip out with it, then settle
        shell.visualInstance?.animator?.cloth?.land?.(strength);
      }
      d.fastestFall = 0;
    }
    d.reactions = pruneReactions(d.reactions, serverNow);

    // crouched: the body is lower at once (the server's word); the pose eases down to it in a moment
    d.crouchAmount = (d.crouchAmount ?? 0) + ((pb.crouched && state !== 'dead' ? 1 : 0) - (d.crouchAmount ?? 0)) * (1 - Math.exp(-dt * 14));
    const crouch = crouchPose(d.crouchAmount, state === 'run' || state === 'sprint');
    d.guardAmount = (d.guardAmount ?? 0) + ((pb.guarding && state !== 'stagger' && state !== 'dead' ? 1 : 0) - (d.guardAmount ?? 0)) * (1 - Math.exp(-dt * 14));

    const animationPlayer = { ...pb, castPoseStartAt: d.castPoseStartAt, castPoseUntil: d.castPoseUntil };
    if ((pb.castEndsAt ?? 0) > serverNow && !(d.castPoseUntil > serverNow)) {
      animationPlayer.castPoseUntil = pb.castEndsAt + 0.06;
      animationPlayer.castPoseStartAt = pb.castStartedAt ?? pb.castEndsAt - (pb.castingSpell === 'gale' ? 0.5 : 0.3);
    }
    const plan = resolveSpellbladeAnimationPlan({ state, player: animationPlayer, serverNow, localTime });
    plan.motion = {
      // the killing blow's flinch plays on into the death, and the body gives way under it
      reactions: d.reactions,
      now: serverNow,
      yaw: shell.root.rotation.y,
      airFlex: state === 'air' ? airborneLegFlex(verticalVelocity) : 0,
      death: plan.clip === 'Death' ? { age: plan.time, push: d.lastPush ?? null } : null,
      crouch: crouch.flex,
      // the gauntlet's jab, if one is under way, and the crouch's lean
      extra: state === 'dead' ? [] : [...crouch.turns, ...guardTurns(plan.concurrent?.attack ? 0 : d.guardAmount), ...jabTurns(serverNow - (d.jabAt ?? -Infinity))],
    };
    setRemoteVisualPlan(shell, plan, dt);
    // a foot comes down where the gait clip puts it (its rate follows the knight's speed)
    const gait = shell.visualInstance?.animator?.gaitPhase;
    if ((state === 'run' || state === 'sprint') && Number.isFinite(gait) && Number.isFinite(d.lastGait) && gaitFootfall(d.lastGait, gait)) {
      if (id) this.onFootstep?.(id, shell.root.position, state === 'sprint' ? 1 : 0, Boolean(pb.crouched));
    }
    d.lastGait = gait;

    // Sheathed in Steel: the plate's hardening, and the glint running over it as it was called
    const steel = steelStrength(pb.steel, serverNow);
    if (shell.visualInstance) {
      if (shell.steelSheenOf !== shell.visualInstance) {
        shell.steelSheen?.dispose();
        // readied with the knight: its plate's shader is built as it first appears, not when its steel is called
        shell.steelSheen = createSteelSheen(shell.visualInstance, { ready: true });
        shell.steelSheenOf = shell.visualInstance;
      }
      // (its glint runs from the gauntlet as it is called, and again as a ram lands: the plate flashing with the blow)
      const flashed = Number.isFinite(d.steelFlashAt) && serverNow - d.steelFlashAt < STEEL_RIPPLE.seconds ? serverNow - d.steelFlashAt : null;
      shell.steelSheen.set(steel, flashed ?? (pb.steel ? serverNow - pb.steel.calledAt : null));
      // Sundering: the ember heat in that knight's steel (sunderBlade.mjs)
      const sunder = pb.ultimateState?.id === 'sunder' && pb.ultimateState.phase === 'active' && serverNow < (pb.ultimateState.until ?? 0);
      if (sunder || shell.sunderBlade) {
        if (shell.sunderBladeOf !== shell.visualInstance) {
          shell.sunderBlade?.dispose();
          shell.sunderBlade = createSunderBlade(shell.visualInstance.root);
          shell.sunderBladeOf = shell.visualInstance;
        }
        shell.sunderBlade.set(sunder, nowMs / 1000);
      }
      // a Vortex: the blade lit (the star at its point first), and the arc of fire it draws as it goes round
      const share = spin ? 1 - (spin.commitAt - serverNow) / ULTIMATES.vortex.startupSec : 0;
      const lit = Boolean(spin) && (spinning || share >= VORTEX_LIT_FROM);
      if (spin || shell.vortexBlade) {
        if (shell.vortexBladeOf !== shell.visualInstance) {
          shell.vortexBlade?.dispose();
          shell.vortexBlade = createVortexBlade(shell.visualInstance, { blade: VORTEX_BLADES.thirdPerson, trailParent: this.scene });
          shell.vortexBladeOf = shell.visualInstance;
          d.vortexFire = 0;
          d.vortexLit = false;
        }
        if (lit && !d.vortexLit) {
          shell.vortexBlade.spark(nowMs / 1000);
          if (id) this.onVortexSpark?.(id);
        }
        d.vortexLit = lit;
        d.vortexFire = Math.max(0, Math.min(1, (d.vortexFire ?? 0) + (lit ? dt / 0.3 : -dt / 0.35)));
        // (the flare as the spin takes hold)
        if (spinning && !d.vortexSpinning) shell.vortexBlade.flash(nowMs / 1000);
        d.vortexSpinning = Boolean(spinning);
        shell.vortexBlade.set(d.vortexFire, nowMs / 1000, {
          swinging: Boolean(spinning) || share >= VORTEX_TRAIL_FROM,
          gather: spin && !lit ? Math.max(0, Math.min(1, share / VORTEX_LIT_FROM)) : 0,
          spinning: Boolean(spinning),
        });
        // where the sword, held out level, points in the knight's own frame (settling as the pose does)
        if (spin && share >= VORTEX_LEVEL_FROM) {
          const measured = heldBladeYaw(shell);
          const off = Math.atan2(Math.sin(measured - (d.vortexBladeYaw ?? measured)), Math.cos(measured - (d.vortexBladeYaw ?? measured)));
          d.vortexBladeYaw = (d.vortexBladeYaw ?? measured) + off * Math.min(1, dt * 10);
        }
      }
      // badly off balance: the whole knight sways as he fights to keep his feet (never his aim); dizzy after a
      // Vortex, he rocks more slowly, and it settles
      const unsteady = Math.max(0, ((pb.stagger?.level ?? 0) - 45) / 55);
      const dizzy = pb.alive ? Math.max(0, Math.min(1, ((pb.dizzyUntil ?? -Infinity) - serverNow) / ULTIMATES.vortex.dizzySec)) : 0;
      const phase = (d.swayPhase ??= Math.random() * 6);
      shell.visualInstance.root.rotation.z = (unsteady > 0 ? Math.sin(nowMs / 1000 * 5.3 + phase) * 0.06 * unsteady : 0)
        + (dizzy > 0 ? Math.sin(nowMs / 1000 * 6.6 + phase) * 0.11 * dizzy : 0);
      shell.visualInstance.root.rotation.x = dizzy > 0 ? Math.cos(nowMs / 1000 * 4.9 + phase) * 0.05 * dizzy : 0;
    }

    const glowAge = (nowMs - (shell.hitGlowAt ?? -Infinity)) / 1000;
    setHitGlow(shell, glowAge < HIT_GLOW.seconds ? 1 - glowAge / HIT_GLOW.seconds : 0);

    if (pb.ultimateState?.id === 'chivalry' || shell.chivalryLink) {
      shell.chivalryLink ??= createChivalryLink(shell.root, () => shell.visualInstance?.sockets ?? {
        sword: shell.fallbackRig.userData.sword,
        sorcery: shell.fallbackRig.userData.magicAnchor,
      });
      shell.chivalryLink.set(pb, serverNow, plan.concurrent);
    }
    const protectedNow = (pb.spawnProtectionUntil ?? 0) > serverNow;
    shell.chivalryAccent = chivalryTellState(pb, serverNow, shell.chivalryAccent);
    const accentIntensity = (protectedNow ? 2.8 : state === 'cast' ? 2.3 : 1.4) + chivalryVisorAccent(shell.chivalryAccent, serverNow);
    if (shell.visualKind === 'fallback') {
      if (!shell.visual?.visible && nowMs - (shell.createdAtMs ?? nowMs) > FALLBACK_GRACE_MS) revealRemoteFallback(shell);
      animateFallbackRig(shell.fallbackRig, state, animationPlayer, serverNow, localTime);
      shell.fallbackRig.userData.accentMaterial.emissiveIntensity = accentIntensity;
    } else {
      // the visor keeps its read (and flares for spawn protection); the gauntlet runes follow the palm sorcery
      const sorcery = shell.visualInstance?.sorceryLevel?.() ?? 0;
      setGlbAccent(shell.visualInstance, accentIntensity, (protectedNow ? 1.6 : 0.6) + 1.8 * sorcery);
    }
  }

  dispose() {
    for (const shell of [...this.rigs.values(), ...(this.self ? [this.self] : [])]) {
      setHitGlow(shell, 0);
      this.scene.remove(shell.root);
      shell.steelSheen?.dispose();
      shell.sunderBlade?.dispose();
      shell.vortexBlade?.dispose();
      shell.chivalryLink?.dispose();
      disposeRemoteVisualShell(shell);
    }
    this.rigs.clear();
    this.samples.clear();
    this.pendingCasts.clear();
  }
}
