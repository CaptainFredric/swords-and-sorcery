import * as THREE from 'three';
import { getWorld } from '../../shared/worlds/registry.mjs';
import { createMovementState, movePlayer, resolveSprint, tryStartDash } from '../../shared/src/movement.mjs';
import { separateLocal } from '../../shared/src/separation.mjs';
import { InputController } from './InputController.mjs';
import { TouchControls } from './TouchControls.mjs';
import { RemotePlayers } from './RemotePlayers.mjs';
import { WeaponView } from './WeaponView.mjs';
import { Effects } from './Effects.mjs';
import { SCENE_PRESENTATION } from './scenePresentation.mjs';
import { localCombatFeedback, shouldPlayWorldClang } from './combatFeedback.mjs';
import { castVisualDuration } from './weaponPose.mjs';
import { localPushDirection } from './spellbladeMotion.mjs';
import { blowDirection, hitKick, hitstopSeconds, impactPoint } from './hitFeel.mjs';
import {
  blockRecipe, castRecipe, dashRecipe, fireballImpactRecipe, hurtRecipe, killRecipe, parryRecipe, spatialize,
  swingRecipe, swordHitRecipe, wallClangRecipe,
} from './sound/soundRecipes.mjs';
import { voiceRate } from './sound/voiceRules.mjs';
import { CombatHeat, matchClosing, nearestFoe } from './sound/combatHeat.mjs';
import { createWorldRenderer, rendererKeyForWorld } from '../worlds/WorldRendererFactory.mjs';
import { CastlewardRenderer } from '../worlds/CastlewardRenderer.mjs';
import { ShatteredKeepRenderer } from '../worlds/ShatteredKeepRenderer.mjs';
import {
  canPresentLocalAction,
  localWeaponReleaseForEvent,
  localWeaponReleaseForSnapshot,
} from './localActionPresentation.mjs';

const WORLD_RENDERERS = Object.freeze({
  castleward: CastlewardRenderer,
  'shattered-keep': ShatteredKeepRenderer,
});

export class GameRuntime {
  constructor(container, socket, hud, { sound = null, voice = null } = {}) {
    this.container = container;
    this.socket = socket;
    this.hud = hud;
    this.sound = sound;
    this.voice = voice;
    this.heat = new CombatHeat();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_PRESENTATION.background);
    this.scene.fog = new THREE.FogExp2(SCENE_PRESENTATION.fogColor, SCENE_PRESENTATION.fogDensity);
    this.camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.05, 180);
    this.scene.add(this.camera);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(
      SCENE_PRESENTATION.hemisphere.skyColor,
      SCENE_PRESENTATION.hemisphere.groundColor,
      SCENE_PRESENTATION.hemisphere.intensity,
    );
    this.scene.add(hemi);
    this.hemi = hemi;
    const moon = new THREE.DirectionalLight(SCENE_PRESENTATION.moon.color, SCENE_PRESENTATION.moon.intensity);
    moon.position.set(-12, 24, 8);
    this.sun = moon;
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -30;
    moon.shadow.camera.right = 30;
    moon.shadow.camera.top = 30;
    moon.shadow.camera.bottom = -30;
    this.scene.add(moon);

    this.world = null;
    this.activeWorld = null;
    this.worldId = null;
    this.worldError = null;
    this.remotePlayers = new RemotePlayers(this.scene, socket.playerId);
    this.weapon = new WeaponView(this.camera);
    this.weapon.onSwing = (strike) => {
      this.#play(swingRecipe(Math.random, { strike }), null, 0.85);
      // the heavy third strike gets his breath behind it; the lighter ones only now and then
      this.#say('effort', this.socket.playerId, { chanceScale: strike >= 2 ? 1 : 0.3 });
    };
    this.effects = new Effects(this.scene, this.camera);
    this.onPointer = () => {};
    this.input = new InputController(this.renderer.domElement, socket);
    this.input.onPointer = (locked) => {
      hud.setPointerLocked(locked);
      this.onPointer(locked);
    };
    this.input.onAttackLocal = (held) => {
      if (!held) {
        this.weapon.setAttack(false);
        return;
      }
      const now = this.socket.serverNow();
      if (canPresentLocalAction('attack', this.localAuth, this.localState, now)) this.weapon.setAttack(true);
    };
    this.input.onGuardLocal = (held) => {
      if (!held) {
        this.weapon.setGuard(false);
        return;
      }
      const now = this.socket.serverNow();
      if (canPresentLocalAction('guard', this.localAuth, this.localState, now)) this.weapon.setGuard(true);
    };
    this.input.onDashLocal = (dir) => {
      const now = this.socket.serverNow();
      if (!canPresentLocalAction('dash', this.localAuth, this.localState, now)) return;
      if (!tryStartDash(this.localState, dir, now)) return;
      this.weapon.dash();
      this.effects.dash();
      this.#play(dashRecipe(), null, 0.8);
      this.#say('dash', this.socket.playerId);
    };

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
    this.fps = 60;
    this.lastPingAt = 0;
    this.unsubscribe = [
      socket.on('snapshot', (snapshot) => this.onSnapshot(snapshot)),
      socket.on('events', (batch) => this.onEvents(batch.events)),
    ];
    window.addEventListener('resize', this.#resize);
    // local inspection only: /?debug exposes the runtime to the console
    if (new URLSearchParams(location.search).has('debug')) globalThis.__ssRuntime = this;
    requestAnimationFrame((t) => this.#frame(t));
  }

  #resize = () => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  };

  #applyWeaponRelease(release) {
    if (!release) return;
    if (release.attack) this.weapon.setAttack(false);
    if (release.guard) this.weapon.setGuard(false);
  }

  #ensureWorld(worldId) {
    if (this.worldId === worldId && this.world && this.activeWorld) return true;
    try {
      rendererKeyForWorld(worldId);
      const nextWorld = getWorld(worldId);
      const nextRenderer = createWorldRenderer(worldId, this.scene, WORLD_RENDERERS);
      this.world?.dispose?.();
      this.world = nextRenderer;
      this.#applyLighting(nextRenderer.lighting);
      this.activeWorld = nextWorld;
      this.worldId = worldId;
      this.worldError = null;
      this.localState = null;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.worldError !== message) this.hud.flashText('INCOMPATIBLE WORLD', 'danger');
      this.worldError = message;
      this.activeWorld = null;
      this.playing = false;
      this.#applyWeaponRelease({ attack: true, guard: true });
      return false;
    }
  }

  // a world may bring its own time of day; otherwise the default moonlit presentation applies
  #applyLighting(lighting) {
    const hemisphere = lighting?.hemisphere ?? SCENE_PRESENTATION.hemisphere;
    this.hemi.color.set(hemisphere.skyColor);
    this.hemi.groundColor.set(hemisphere.groundColor);
    this.hemi.intensity = hemisphere.intensity;
    const sun = lighting?.sun ?? { ...SCENE_PRESENTATION.moon, position: [-12, 24, 8] };
    this.sun.color.set(sun.color);
    this.sun.intensity = sun.intensity;
    this.sun.position.set(...sun.position);
  }

  setPlayerId(id) {
    this.remotePlayers.setLocalId(id);
  }

  requestPointerLock() {
    this.input.requestPointerLock();
  }

  releasePointer() {
    this.input.releaseFocus();
  }

  // phones and tablets: on-screen controls replace the mouse and keyboard
  enableTouch() {
    if (this.touch) return;
    this.touch = new TouchControls(this.hud.root, this.input);
    this.input.touch = this.touch;
    this.touch.setActive(this.input.touchFocus);
  }

  setPlaying(playing, { preservePointerLock = false } = {}) {
    this.playing = Boolean(playing) && !this.worldError;
    if (!this.playing) this.#applyWeaponRelease({ attack: true, guard: true });
    if (!this.playing && !preservePointerLock) this.input.releaseFocus();
  }

  onSnapshot(snapshot) {
    if (!this.#ensureWorld(snapshot.worldId)) return;
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
    this.#applyWeaponRelease(localWeaponReleaseForSnapshot(auth, this.socket.serverNow()));
  }

  onEvents(events) {
    for (const event of events) {
      this.remotePlayers.onEvent(event, this.latestSnapshot);
      this.#applyWeaponRelease(localWeaponReleaseForEvent(event, this.socket.playerId));

      const me = this.socket.playerId;
      if (event.type === 'fireballCast') {
        const duration = castVisualDuration(event, me, this.socket.serverNow());
        if (duration !== null) {
          this.weapon.cast(duration);
          this.effects.fireball();
        }
        this.#play(castRecipe(), event.playerId === me ? null : this.#bodyPosition(event.playerId), event.playerId === me ? 0.9 : 0.6);
        this.#say('sorcery', event.playerId);
      }

      // my own swings whoosh from the local swing (no network delay); others' from the server's strike
      if (event.type === 'swordSwing' && event.playerId !== me) {
        this.#play(swingRecipe(Math.random, { strike: event.strikeIndex }), this.#bodyPosition(event.playerId), 0.55);
        this.#say('effort', event.playerId, { chanceScale: event.strikeIndex >= 2 ? 1 : 0.3 });
      }
      this.#warm(event, me);

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
          this.#play(wallClangRecipe(), null, 0.9);
        } else {
          this.effects.sparks(event.point, 0xffd48a, 8);
          this.#play(wallClangRecipe(), event.point, 0.5);
        }
      }
      if (event.type === 'swordHit') this.#swordHit(event);
      if (event.type === 'parry' || event.type === 'block' || event.type === 'guardBreak') this.#guardContact(event);
      if (event.type === 'parry') {
        if (event.defenderId === me) { this.weapon.parry(); this.hud.flashText('PARRY', 'parry'); this.hud.hit('parry'); }
        if (event.attackerId === me) this.weapon.rebound();
      }
      if (event.type === 'block') {
        if (event.defenderId === me) this.weapon.block(false);
        if (event.attackerId === me) this.weapon.rebound();
      }
      if (event.type === 'guardBreak' && event.defenderId === me) {
        this.hud.flashText('GUARD BROKEN', 'danger');
        this.weapon.block(true);
      }
      if (event.type === 'projectileImpact') {
        this.effects.impact(event.point);
        this.#play(fireballImpactRecipe(), event.point, 1);
      }
      if (event.type === 'damage') {
        if (event.attackerId === me) {
          this.hud.hit('hit');
          // my numbers only: the blow's weight, rising off the body
          const victim = this.#bodyPosition(event.victimId);
          if (victim && event.amount > 0 && event.victimId !== me) {
            this.effects.damageNumber({ x: victim.x, y: victim.y + 1.85, z: victim.z }, event.amount, { heavy: event.amount >= 40 });
          }
        }
        if (event.victimId === this.socket.playerId && event.source !== 'abyss' && event.amount > 0) {
          this.weapon.damage(this.#pushTowardMe(event.attackerId), event.amount);
        }
        // a blow that kills gets the death cry instead
        if (event.amount >= 8 && event.health > 0 && event.source !== 'abyss') this.#say('hurt', event.victimId);
        if (event.victimId === this.socket.playerId) document.body.classList.add('took-damage');
        setTimeout(() => document.body.classList.remove('took-damage'), 120);
      }
      if (event.type === 'death') {
        this.#deathEvent(event);
        this.#say('death', event.victimId);
      }
      if (event.type === 'respawn' && event.playerId === this.socket.playerId) this.hud.flashText('FIGHT!', 'ready');
    }
  }

  // where a Spellblade is drawn right now (me: my predicted body; others: their interpolated body)
  #bodyPosition(id) {
    if (id === this.socket.playerId) return this.localState?.position ?? this.localAuth?.position ?? null;
    return this.remotePlayers.bodyPosition(id) ?? this.latestSnapshot?.players.find((p) => p.id === id)?.position ?? null;
  }

  // a Spellblade speaks: mine from inside my own helm, others from where they stand, each with their own pitch
  #say(line, playerId, { chanceScale = 1 } = {}) {
    if (!this.voice || !playerId) return;
    if (playerId === this.socket.playerId) {
      this.voice.say(line, { speaker: playerId, gain: 0.8, chanceScale });
      return;
    }
    const body = this.#bodyPosition(playerId);
    const snapshotPlayer = this.latestSnapshot?.players.find((p) => p.id === playerId);
    if (!body || snapshotPlayer?.actorKind === 'dummy') return;
    const listener = this.localState?.position ?? this.localAuth?.position;
    const place = spatialize(listener, this.input.yaw, body);
    this.voice.say(line, { speaker: playerId, pan: place.pan, gain: place.gain * 0.9, rate: voiceRate(playerId), chanceScale });
  }

  // steel anywhere stirs the music; blows that involve me put it on the fight
  #warm(event, me) {
    const now = performance.now() / 1000;
    if (['swordSwing', 'swordHit', 'projectileImpact', 'parry', 'block', 'guardBreak', 'fireballCast'].includes(event.type)) this.heat.stir(now);
    const involved = [event.playerId, event.targetId, event.attackerId, event.defenderId, event.victimId].includes(me);
    if (involved && ['swordHit', 'parry', 'block', 'guardBreak', 'damage'].includes(event.type)) this.heat.fight(now);
  }

  /** How hot the fight is for the music: 0 calm, 1 blades out nearby, 2 the fight is on. */
  musicHeat({ cap = 2 } = {}) {
    const snapshot = this.latestSnapshot;
    const me = snapshot?.players.find((p) => p.id === this.socket.playerId);
    return this.heat.level({
      now: performance.now() / 1000,
      nearestFoe: nearestFoe(me, snapshot?.players),
      closing: matchClosing(snapshot, this.socket.serverNow()),
      cap,
    });
  }

  // play a sound at a world position (null: mine, centred) with extra gain
  #play(recipe, source = null, gain = 1) {
    if (!this.sound) return;
    const listener = this.localState?.position ?? this.localAuth?.position;
    const place = source ? spatialize(listener, this.input.yaw, source) : { pan: 0, gain: 1 };
    this.sound.play(recipe, { pan: place.pan, gain: place.gain * gain });
  }

  // a sword biting into a body: burst, flash, sound and (for the attacker) hit-stop and kick
  #swordHit(event) {
    const me = this.socket.playerId;
    const strike = event.strikeIndex ?? 0;
    const attacker = this.#bodyPosition(event.playerId);
    const victim = this.#bodyPosition(event.targetId);
    const point = impactPoint(victim, attacker);
    if (event.targetId !== me) {
      if (point) this.effects.hitBurst(point, blowDirection(victim, attacker), { strike });
      this.remotePlayers.flashHit(event.targetId, 0.07);
    }
    if (event.playerId === me) {
      this.hud.hit('hit');
      this.weapon.hitstop(hitstopSeconds({ strike }), hitKick({ strike }));
      this.#play(swordHitRecipe(Math.random, { strike }), null, 1);
    } else if (event.targetId === me) {
      this.#play(hurtRecipe(Math.random, { heavy: strike >= 2 }), null, 1);
    } else {
      this.#play(swordHitRecipe(Math.random, { strike }), point, 0.8);
    }
  }

  // a blow meeting a guard: sparks where the blades met and the ring of steel
  #guardContact(event) {
    const me = this.socket.playerId;
    const attacker = this.#bodyPosition(event.attackerId);
    const defender = this.#bodyPosition(event.defenderId);
    const point = impactPoint(defender, attacker);
    const parry = event.type === 'parry';
    const heavy = event.type === 'guardBreak';
    if (point && event.defenderId !== me) {
      this.effects.blockBurst({ ...point, y: point.y + 0.15 }, blowDirection(defender, attacker), { heavy, parry });
    }
    const recipe = parry ? parryRecipe() : blockRecipe(Math.random, { heavy });
    const involved = event.attackerId === me || event.defenderId === me;
    this.#play(recipe, involved ? null : point, involved ? 1 : 0.8);
  }

  // direction a blow drove me, in view space (+x right, +z backward); straight back if the source is unknown
  #pushTowardMe(sourceId) {
    const me = this.localState?.position ?? this.localAuth?.position;
    const source = this.latestSnapshot?.players.find((p) => p.id === sourceId)?.position;
    if (!me || !source) return { x: 0, z: 1 };
    return localPushDirection({ x: me.x - source.x, z: me.z - source.z }, this.input.yaw);
  }

  #deathEvent(event) {
    const killer = this.latestSnapshot?.players.find((p) => p.id === event.killerId);
    const victim = this.latestSnapshot?.players.find((p) => p.id === event.victimId);
    if (event.victimId === this.socket.playerId) this.hud.setDeathKiller(killer?.name ?? (event.source === 'abyss' ? 'THE ABYSS' : 'UNKNOWN'));
    if (event.killerId === this.socket.playerId) {
      this.hud.flashText('SLAIN  +1', 'kill');
      this.hud.hit('kill');
      // the killing blow lands harder: a longer hit-stop, a toll in the courtyard, a shockwave at their feet
      this.weapon.hitstop(hitstopSeconds({ kill: true }), hitKick({ kill: true }));
      this.#play(killRecipe(), null, 1);
      const body = this.#bodyPosition(event.victimId);
      if (body && event.source !== 'abyss') this.effects.killBurst({ x: body.x, y: body.y + 1.1, z: body.z });
    }
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

    if (this.localState && this.localAuth?.alive && this.playing && this.activeWorld) {
      const moveInput = this.input.movement();
      const serverNow = this.socket.serverNow();
      // predict the sprint with the same rule the server uses, from the last authoritative stamina
      this.localState.sprinting = resolveSprint({
        wantsSprint: moveInput.sprint,
        forward: moveInput.forward,
        right: moveInput.right,
        grounded: this.localState.grounded,
        stamina: this.localAuth.guardStamina,
        sprinting: this.localState.sprinting,
        blocked: this.input.guardHeld || this.input.attackHeld || (this.localAuth.staggerUntil ?? 0) > serverNow,
      });
      const wasGrounded = this.localState.grounded;
      const fallSpeed = -this.localState.velocity.y;
      this.localState = movePlayer(this.localState, moveInput, dt, serverNow, this.activeWorld);
      // predict the server's body separation so pressing into an opponent does not rubber-band
      separateLocal(this.localState.position, this.remotePlayers.bodies(), this.activeWorld);
      if (!wasGrounded && this.localState.grounded) this.weapon.land(fallSpeed);
      if (nowMs - this.lastInputSentAt >= 50) {
        this.lastInputSentAt = nowMs;
        this.socket.input({ seq: ++this.sequence, ...moveInput, clientTime: this.socket.serverNow() });
      }
      // the weapon's procedural motion also returns small camera offsets (purely visual: aim uses input yaw/pitch)
      const view = this.weapon.update(timeSec, dt, {
        speed: Math.hypot(this.localState.velocity.x, this.localState.velocity.z),
        grounded: this.localState.grounded,
        yaw: this.input.yaw,
        pitch: this.input.pitch,
      });
      this.camera.position.set(this.localState.position.x, this.localState.position.y + 1.58 + view.camera.y, this.localState.position.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.input.yaw;
      this.camera.rotation.x = this.input.pitch + this.cameraKick + view.camera.pitch;
      this.camera.rotation.z = view.camera.roll;
      this.cameraKick *= Math.exp(-dt * 15);
      this.#setFov(view.fov);
    } else if (this.localAuth && this.localState) {
      this.camera.position.set(this.localState.position.x, this.localState.position.y + 1.58, this.localState.position.z);
      this.camera.rotation.z = 0;
      this.#setFov(this.weapon.update(timeSec, dt).fov);
    }
    this.remotePlayers.update(nowMs, dt);
    this.world?.update?.(timeSec, this.camera);
    this.effects.update(dt);

    if (this.latestSnapshot && this.localAuth) {
      this.hud.update(this.localAuth, this.latestSnapshot, this.socket.serverNow());
      this.touch?.update(this.localAuth, this.socket.serverNow());
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
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
      }, this.input.debugVisible);
    }

    if (nowMs - this.lastPingAt > 2000) { this.lastPingAt = nowMs; this.socket.ping(); }
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.#frame(t));
  }

  #setFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 1e-3) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.running = false;
    for (const off of this.unsubscribe) off();
    window.removeEventListener('resize', this.#resize);
    this.touch?.dispose();
    this.world?.dispose?.();
    this.remotePlayers.dispose();
    this.weapon.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
