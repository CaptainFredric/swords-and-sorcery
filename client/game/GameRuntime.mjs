import * as THREE from 'three';
import { SHATTERED_KEEP } from '../../shared/src/map.mjs';
import { createMovementState, movePlayer, tryStartDash } from '../../shared/src/movement.mjs';
import { InputController } from './InputController.mjs';
import { WorldRenderer } from './WorldRenderer.mjs';
import { RemotePlayers } from './RemotePlayers.mjs';
import { WeaponView } from './WeaponView.mjs';
import { Effects } from './Effects.mjs';
import { localCombatFeedback, shouldPlayWorldClang } from './combatFeedback.mjs';
import { castVisualDuration } from './weaponPose.mjs';

export class GameRuntime {
  constructor(container, socket, hud) {
    this.container = container;
    this.socket = socket;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111625);
    this.scene.fog = new THREE.FogExp2(0x111625, 0.018);
    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 180);
    this.scene.add(this.camera);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0x8497cf, 0x17121c, 1.8); this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xc5d3ff, 2.7); moon.position.set(-12, 24, 8); moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024); moon.shadow.camera.left = -24; moon.shadow.camera.right = 24; moon.shadow.camera.top = 24; moon.shadow.camera.bottom = -24; this.scene.add(moon);

    this.world = new WorldRenderer(this.scene);
    this.remotePlayers = new RemotePlayers(this.scene, socket.playerId);
    this.weapon = new WeaponView(this.camera);
    this.effects = new Effects(this.scene, this.camera);
    this.input = new InputController(this.renderer.domElement, socket);
    this.input.onPointer = (locked) => hud.setPointerLocked(locked);
    this.input.onAttackLocal = (held) => { this.weapon.setAttack(held); if (held) this.effects.swordSwing(0); };
    this.input.onGuardLocal = (held) => this.weapon.setGuard(held);
    this.input.onDashLocal = (dir) => { this.weapon.dash(); this.effects.dash(); if (this.localState) tryStartDash(this.localState, dir, this.socket.serverNow()); this.dashFovUntil = performance.now() + 180; };

    this.localState = null;
    this.localAuth = null;
    this.latestSnapshot = null;
    this.sequence = 0;
    this.lastInputSentAt = 0;
    this.lastFrameAt = performance.now();
    this.running = true;
    this.playing = false;
    this.predictionError = 0;
    this.cameraKick = 0;
    this.dashFovUntil = 0;
    this.fps = 60;
    this.lastPingAt = 0;
    this.unsubscribe = [
      socket.on('snapshot', (snapshot) => this.onSnapshot(snapshot)),
      socket.on('events', (batch) => this.onEvents(batch.events)),
    ];
    window.addEventListener('resize', this.#resize);
    requestAnimationFrame((t) => this.#frame(t));
  }

  #resize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  };

  setPlayerId(id) {
    this.remotePlayers.setLocalId(id);
  }

  setPlaying(playing) {
    this.playing = playing;
    if (!playing && document.pointerLockElement === this.renderer.domElement) document.exitPointerLock?.();
  }

  onSnapshot(snapshot) {
    this.latestSnapshot = snapshot;
    this.remotePlayers.pushSnapshot(snapshot, performance.now());
    this.effects.syncProjectiles(snapshot.projectiles ?? []);
    const auth = snapshot.players.find((p) => p.id === this.socket.playerId);
    this.localAuth = auth ?? null;
    if (!auth) return;
    if (!this.localState) {
      this.localState = createMovementState(auth.position);
      this.localState.velocity = { ...auth.velocity };
      this.localState.dashReadyAt = auth.dashReadyAt;
      this.input.yaw = auth.yaw;
      this.input.pitch = auth.pitch;
    } else {
      const dx = auth.position.x - this.localState.position.x;
      const dy = auth.position.y - this.localState.position.y;
      const dz = auth.position.z - this.localState.position.z;
      const error = Math.hypot(dx, dy, dz);
      this.predictionError = error;
      if (!auth.alive || error > 2.2) {
        this.localState.position = { ...auth.position };
        this.localState.velocity = { ...auth.velocity };
      } else {
        this.localState.position.x += dx * 0.11;
        this.localState.position.y += dy * 0.16;
        this.localState.position.z += dz * 0.11;
      }
      this.localState.dashReadyAt = auth.dashReadyAt;
      this.localState.dashUntil = auth.dashUntil ?? this.localState.dashUntil;
    }
  }

  onEvents(events) {
    for (const event of events) {
      this.remotePlayers.onEvent(event);

      if (event.type === 'fireballCast') {
        const duration = castVisualDuration(event, this.socket.playerId, this.socket.serverNow());
        if (duration !== null) {
          this.weapon.cast(duration);
          this.effects.fireball();
        }
      }

      const combatFeedback = localCombatFeedback(event, this.socket.playerId);
      if (combatFeedback === 'block') this.effects.block();
      if (combatFeedback === 'parry') this.effects.parry();
      if (combatFeedback === 'guardBreak') this.effects.guardBreak();

      if (event.type === 'swordWorldImpact') {
        const localImpact = shouldPlayWorldClang(event, this.socket.playerId);
        if (localImpact) {
          this.weapon.wallImpact();
          this.hud.flashText('CLANG!', 'metal');
          this.cameraKick = Math.max(this.cameraKick, 0.13);
          this.effects.wallClang(event.point);
        } else {
          this.effects.sparks(event.point, 0xffd48a, 8);
        }
      }
      if (event.type === 'swordHit') {
        if (event.playerId === this.socket.playerId) { this.hud.hit('hit'); this.effects.swordHit(event.strikeIndex); }
      }
      if (event.type === 'parry') {
        if (event.defenderId === this.socket.playerId) { this.weapon.parry(); this.hud.flashText('PARRY', 'parry'); this.hud.hit('parry'); }
        if (event.attackerId === this.socket.playerId) this.weapon.parry();
      }
      if (event.type === 'guardBreak' && event.defenderId === this.socket.playerId) this.hud.flashText('GUARD BROKEN', 'danger');
      if (event.type === 'projectileImpact') this.effects.impact(event.point);
      if (event.type === 'damage') {
        if (event.attackerId === this.socket.playerId) this.hud.hit('hit');
        if (event.victimId === this.socket.playerId) document.body.classList.add('took-damage');
        setTimeout(() => document.body.classList.remove('took-damage'), 120);
      }
      if (event.type === 'death') this.#deathEvent(event);
      if (event.type === 'respawn' && event.playerId === this.socket.playerId) this.hud.flashText('FIGHT!', 'ready');
    }
  }

  #deathEvent(event) {
    const killer = this.latestSnapshot?.players.find((p) => p.id === event.killerId);
    const victim = this.latestSnapshot?.players.find((p) => p.id === event.victimId);
    if (event.victimId === this.socket.playerId) this.hud.setDeathKiller(killer?.name ?? (event.source === 'abyss' ? 'THE ABYSS' : 'UNKNOWN'));
    if (event.killerId === this.socket.playerId) { this.hud.flashText('SLAIN  +1', 'kill'); this.hud.hit('kill'); }
    if (event.source === 'abyss' && killer) this.hud.addFeed(`${killer.name} sent ${victim?.name ?? 'someone'} into the abyss`, 'abyss');
    else if (event.source?.startsWith('fireball') && killer) this.hud.addFeed(`${killer.name} incinerated ${victim?.name ?? 'someone'}`, 'fire');
    else if (killer) this.hud.addFeed(`${killer.name} slew ${victim?.name ?? 'someone'}`, 'sword');
    else this.hud.addFeed(`${victim?.name ?? 'A spellblade'} fell into the abyss`, 'abyss');
  }

  #frame(nowMs) {
    if (!this.running) return;
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameAt) / 1000));
    this.lastFrameAt = nowMs;
    this.fps += ((1 / dt) - this.fps) * 0.05;
    const timeSec = nowMs / 1000;

    if (this.localState && this.localAuth?.alive && this.playing) {
      const moveInput = this.input.movement();
      this.localState = movePlayer(this.localState, moveInput, dt, this.socket.serverNow(), SHATTERED_KEEP);
      if (nowMs - this.lastInputSentAt >= 50) {
        this.lastInputSentAt = nowMs;
        this.socket.input({ seq: ++this.sequence, ...moveInput, clientTime: this.socket.serverNow() });
      }
      this.camera.position.set(this.localState.position.x, this.localState.position.y + 1.58, this.localState.position.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.input.yaw;
      this.camera.rotation.x = this.input.pitch + this.cameraKick;
      this.camera.rotation.z = 0;
      this.cameraKick *= 0.78;
      const speed = Math.min(1, Math.hypot(this.localState.velocity.x, this.localState.velocity.z) / 7.5);
      this.weapon.update(timeSec, speed);
    } else if (this.localAuth && this.localState) {
      this.camera.position.set(this.localState.position.x, this.localState.position.y + 1.58, this.localState.position.z);
      this.weapon.update(timeSec, 0);
    }

    const targetFov = nowMs < this.dashFovUntil ? 88 : 78;
    this.camera.fov += (targetFov - this.camera.fov) * 0.18;
    this.camera.updateProjectionMatrix();
    this.remotePlayers.update(nowMs);
    this.world.update(timeSec);
    this.effects.update(dt);

    if (this.latestSnapshot && this.localAuth) {
      this.hud.update(this.localAuth, this.latestSnapshot, this.socket.serverNow());
      this.hud.setScoreboard(this.latestSnapshot, this.input.scoreboardHeld);
      this.hud.setDebug({
        fps: this.fps,
        ping: this.socket.pingMs,
        tick: this.latestSnapshot.tick,
        position: this.localState?.position ?? this.localAuth.position,
        room: this.latestSnapshot.roomCode,
        players: this.latestSnapshot.players.length,
        state: this.latestSnapshot.roomState,
        predictionError: this.predictionError,
      }, this.input.debugVisible);
    }

    if (nowMs - this.lastPingAt > 2000) { this.lastPingAt = nowMs; this.socket.ping(); }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.#frame(t));
  }

  dispose() {
    this.running = false;
    for (const off of this.unsubscribe) off();
    window.removeEventListener('resize', this.#resize);
    this.remotePlayers.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
