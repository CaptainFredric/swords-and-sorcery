import * as THREE from 'three';
import { getWorld } from '../../shared/worlds/registry.mjs';
import { createMovementState, movePlayer, resolveSprint, shoveBody, tryStartDash } from '../../shared/src/movement.mjs';
import { separateLocal } from '../../shared/src/separation.mjs';
import { segmentAabbHit, surfaceHeightAt } from '../../shared/src/collision.mjs';
import { InputController } from './InputController.mjs';
import { TouchControls } from './TouchControls.mjs';
import { RemotePlayers } from './RemotePlayers.mjs';
import { WeaponView } from './WeaponView.mjs';
import { Effects } from './Effects.mjs';
import { SCENE_PRESENTATION } from './scenePresentation.mjs';
import { localCombatFeedback, shouldPlayWorldClang } from './combatFeedback.mjs';
import { castVisualDuration } from './weaponPose.mjs';
import { localPushDirection } from './spellbladeMotion.mjs';
import { blowDirection, glancing, hitKick, hitstopSeconds, impactPoint } from './hitFeel.mjs';
import {
  blockRecipe, burnLickRecipe, castRecipe, dashRecipe, fireballImpactRecipe, frostImpactRecipe, guardBreakRecipe, hurtRecipe, killRecipe,
  deniedRecipe, galeReleaseRecipe, gauntletHitRecipe, gauntletSwingRecipe, parryRecipe, spatialize, steelCallRecipe, steelTurnRecipe,
  swingRecipe, swordHitRecipe, wallClangRecipe,
} from './sound/soundRecipes.mjs';
import { galeRecoil } from '../../shared/src/gale.mjs';
import { gauntletTarget } from '../../shared/src/gauntlet.mjs';
import { CROUCH, POSTURES, postureOf } from '../../shared/src/body.mjs';
import { steelStrength } from '../../shared/src/steel.mjs';
import { chillScale, spellFor } from '../../shared/src/spells.mjs';
import { deathLines, gauntletLines, voicePlacement, voiceRate } from './sound/voiceRules.mjs';
import { FOOTSTEPS, footfallsCrossed, footstepPlacement, footstepRecipe, surfaceAt, variantPicker } from './sound/footsteps.mjs';
import { CombatHeat, matchClosing, nearestFoe } from './sound/combatHeat.mjs';
import { FP_MOTION } from './firstPersonMotion.mjs';
import { DEATH_CAM, deathCamera, deathCardText, killerCamPolicy } from './deathCam.mjs';
import { createWorldRenderer, rendererKeyForWorld } from '../worlds/WorldRendererFactory.mjs';
import { CastlewardRenderer } from '../worlds/CastlewardRenderer.mjs';
import { ShatteredKeepRenderer } from '../worlds/ShatteredKeepRenderer.mjs';
import {
  canPresentLocalAction,
  localWeaponReleaseForEvent,
  localWeaponReleaseForSnapshot,
} from './localActionPresentation.mjs';

// the sun's shadows cover this far around you (a box this many metres from the middle to each side), and follow you:
// crisp where you fight instead of soft over the whole arena
const SHADOW_REACH = 16;
const _sunLook = new THREE.Matrix4();
const _sunFocus = new THREE.Vector3();
const _sunOrigin = new THREE.Vector3(0, 0, 0);
const _sunUp = new THREE.Vector3(0, 1, 0);

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
    // the player's view settings (see configure)
    this.view = { fov: FP_MOTION.baseFov, pixelRatioCap: 1.6, cameraMotion: 1, damageNumbers: true, damageFlash: true };
    this.touchScale = 1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SCENE_PRESENTATION.background);
    this.scene.fog = new THREE.FogExp2(SCENE_PRESENTATION.fogColor, SCENE_PRESENTATION.fogDensity);
    const view = this.#viewSize();
    this.camera = new THREE.PerspectiveCamera(78, view.width / view.height, 0.05, 180);
    this.scene.add(this.camera);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.view.pixelRatioCap));
    this.renderer.setSize(view.width, view.height);
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
    moon.shadow.camera.left = -SHADOW_REACH;
    moon.shadow.camera.right = SHADOW_REACH;
    moon.shadow.camera.top = SHADOW_REACH;
    moon.shadow.camera.bottom = -SHADOW_REACH;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 90;
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.03;
    this.sunOffset = new THREE.Vector3(-12, 24, 8);
    this.scene.add(moon, moon.target);

    this.world = null;
    this.activeWorld = null;
    this.worldId = null;
    this.worldError = null;
    this.remotePlayers = new RemotePlayers(this.scene, socket.playerId);
    // (a crouched knight's steps are soft and light)
    this.remotePlayers.onFootstep = (id, position, heavy, crouched) => this.#footstep(id, position, crouched ? 0 : heavy, FOOTSTEPS.other * (crouched ? 0.55 : 1));
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
    // the palm starts gathering the moment the spell is called (the server's word follows and confirms it)
    this.input.onCastLocal = () => {
      const now = this.socket.serverNow();
      if (!canPresentLocalAction('cast', this.localAuth, this.localState, now)) {
        // on its cooldown the spell's key throws the gauntlet at a foe within reach (the server's word follows); with
        // nobody there, the cooldown's quiet no
        if (this.localAuth?.alive && now < (this.localAuth.spellReadyAt ?? 0) && !this.#tryLocalJab(now)) {
          this.hud.denied?.('spell');
          this.#play(deniedRecipe(), null, 0.6);
        }
        return;
      }
      const spell = spellFor(this.localAuth?.spell);
      this.weapon.cast({ gatherSec: spell.gatherSec, spell: spell.id });
      // a Gale lets go when its breath is drawn: my own is seen and felt the moment it goes, once the server has taken it
      if (spell.kind === 'cone') this.localGale = { at: now + spell.gatherSec, direction: this.input.lookDirection(), spell, confirmed: false };
    };
    // Sheathe in Steel: the clench and the ring of plate at once (the server hardens the armour a moment later)
    this.input.onSteelLocal = () => {
      const now = this.socket.serverNow();
      if (!canPresentLocalAction('steel', this.localAuth, this.localState, now)) return;
      this.weapon.clench();
      this.localSteelAt = now;
      this.#play(steelCallRecipe(), null, 0.9);
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
    // the shell can change shape without the window changing (lying sideways on an upright phone app)
    this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this.#resize) : null;
    this.resizeObserver?.observe(container);
    // local inspection only: /?debug exposes the runtime to the console
    if (new URLSearchParams(location.search).has('debug')) globalThis.__ssRuntime = this;
    requestAnimationFrame((t) => this.#frame(t));
  }

  // the size of the arena's own frame (its container), not the window: the game may lie sideways on the screen
  #viewSize() {
    return {
      width: Math.max(1, this.container?.clientWidth || innerWidth),
      height: Math.max(1, this.container?.clientHeight || innerHeight),
    };
  }

  #resize = () => {
    const view = this.#viewSize();
    this.camera.aspect = view.width / view.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(view.width, view.height);
  };

  #applyWeaponRelease(release) {
    if (!release) return;
    if (release.attack) this.weapon.cancelAttack();
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
      // what a fight first shows mid-swing is readied now, so it does not stall the frame it appears in
      this.effects.warm(this.renderer, this.scene);
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
    // the sun keeps its direction but rides along with you, so its shadow box is always where you are
    this.sunOffset.set(...sun.position).setLength(40);
    this.sun.position.copy(this.sunOffset);
  }

  // High quality on a computer draws the sun's shadows at twice the detail (phones keep the lighter map)
  #shadowDetail() {
    const size = this.view.pixelRatioCap >= 1.6 && !this.touch ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  // move the sun (and its shadow box) to follow `focus`, in whole shadow texels as the sun sees them, so the
  // shadows never crawl as you walk
  #followSun(focus) {
    if (!focus) return;
    const texel = (2 * SHADOW_REACH) / this.sun.shadow.mapSize.x;
    _sunLook.lookAt(this.sunOffset, _sunOrigin, _sunUp);
    _sunFocus.set(focus.x, focus.y, focus.z).applyMatrix4(_sunLook.clone().transpose());
    _sunFocus.x = Math.round(_sunFocus.x / texel) * texel;
    _sunFocus.y = Math.round(_sunFocus.y / texel) * texel;
    _sunFocus.applyMatrix4(_sunLook);
    this.sun.target.position.copy(_sunFocus);
    this.sun.position.copy(_sunFocus).add(this.sunOffset);
    this.sun.target.updateMatrixWorld();
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

  /**
   * The player's settings: view { fov, pixelRatioCap, cameraMotion 0..1, damageNumbers, damageFlash } and input
   * { mouse, touch, invertY, touchScale, bindings }.
   */
  configure({ view = null, input = null } = {}) {
    if (view) {
      const sharper = view.pixelRatioCap !== this.view.pixelRatioCap;
      this.view = { ...this.view, ...view };
      if (sharper) {
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.view.pixelRatioCap));
        this.#resize();
      }
      this.#shadowDetail();
    }
    if (input) {
      this.input.configure(input);
      this.touchScale = input.touchScale ?? this.touchScale;
      this.touch?.setScale(this.touchScale);
    }
  }

  // phones and tablets: on-screen controls replace the mouse and keyboard
  enableTouch() {
    if (this.touch) return;
    this.touch = new TouchControls(this.hud.root, this.input);
    this.touch.setScale(this.touchScale);
    this.input.touch = this.touch;
    this.touch.setActive(this.input.touchFocus);
    this.#shadowDetail();
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
      if (auth.impulse) this.localState.impulse = { ...auth.impulse };
      this.localState.crouched = Boolean(auth.crouched);
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
        this.localState.impulse = auth.impulse ? { ...auth.impulse } : { x: 0, z: 0 };
        this.localState.crouched = Boolean(auth.crouched);
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
      if (event.type === 'spellCast') {
        const spell = spellFor(event.spell);
        const duration = castVisualDuration(event, me, this.socket.serverNow());
        if (duration !== null) {
          this.weapon.cast({ gatherSec: Math.max(0, duration - 0.06), spell: spell.id });
          this.effects.castFlash(spell.id);
        }
        const release = Math.max(0, (event.castEndsAt ?? event.at + spell.gatherSec) - this.socket.serverNow());
        this.#play(castRecipe(Math.random, { spell: spell.id, release }), event.playerId === me ? null : this.#bodyPosition(event.playerId), event.playerId === me ? 0.9 : 0.6);
        if (spell.kind === 'cone') {
          // my own lets go when the server's does (and now it surely will); another's is seen gathering in their hand
          if (event.playerId === me && this.localGale) {
            if (Number.isFinite(event.castEndsAt)) this.localGale.at = event.castEndsAt;
            this.localGale.confirmed = true;
          }
          const body = event.playerId === me ? null : this.#bodyPosition(event.playerId);
          if (body) this.effects.galeGather({ x: body.x, y: body.y + 1.3, z: body.z });
        }
        this.#say('sorcery', event.playerId);
      }

      if (event.type === 'galeBlast') this.#galeBlast(event);
      if (event.type === 'gauntletStrike') this.#gauntletStrike(event);
      if (event.type === 'gauntletHit') this.#gauntletHit(event);
      // a blow or a blast that shoved me: my own steps carry the shove at once (the server's already do)
      if (event.type === 'damage' && event.victimId === me && event.push && this.localState) shoveBody(this.localState, event.push);
      if (event.type === 'damage') (this.healthAfterBlow ??= new Map()).set(event.victimId, event.health);

      // Sheathed in Steel: another knight's plate ringing as it hardens (mine rang as I pressed)
      if (event.type === 'steelOn' && event.playerId !== me) this.#play(steelCallRecipe(), this.#bodyPosition(event.playerId), 0.7);
      // a spell turned aside by it: a glint where it struck the plate, a ping, and now and then a word of pride
      if (event.type === 'steelTurn') {
        const body = this.#bodyPosition(event.playerId);
        const point = body && event.point ? impactPoint(body, event.point) : null;
        if (point && event.playerId !== me) this.effects.steelGlint(point, blowDirection(body, event.point));
        this.#play(steelTurnRecipe(), event.playerId === me ? null : point, 0.85);
        if (event.turned >= 0.25) this.#say('steelBoast', event.playerId, { delay: 0.35 });
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
        const spell = spellFor(event.spell);
        // the ground under it, for the wave and the mark the blast leaves
        const ground = this.activeWorld ? surfaceHeightAt(event.point.x, event.point.z, event.point.y, this.activeWorld) : null;
        this.effects.impact(event.point, { spell: spell.id, radius: event.radius ?? spell.radius, ground });
        this.#play(spell.chill ? frostImpactRecipe() : fireballImpactRecipe(), event.point, 1);
      }
      if (event.type === 'damage' && event.source === 'burn') this.#play(burnLickRecipe(), event.victimId === me ? null : this.#bodyPosition(event.victimId), 0.7);
      if (event.type === 'damage') {
        if (event.attackerId === me) {
          this.hud.hit('hit');
          // my numbers only: the blow's weight, rising off the body
          const victim = this.#bodyPosition(event.victimId);
          if (victim && event.amount > 0 && event.victimId !== me && this.view.damageNumbers) {
            this.effects.damageNumber({ x: victim.x, y: victim.y + 1.85, z: victim.z }, event.amount, { heavy: event.amount >= 40 });
          }
        }
        if (event.victimId === this.socket.playerId && event.source !== 'abyss' && event.amount > 0) {
          this.weapon.damage(this.#pushTowardMe(event.attackerId), event.amount);
        }
        // a blow that kills gets the death cry instead
        if (event.amount >= 8 && event.health > 0 && event.source !== 'abyss') this.#say('hurt', event.victimId);
        if (event.victimId === this.socket.playerId && this.view.damageFlash) document.body.classList.add('took-damage');
        setTimeout(() => document.body.classList.remove('took-damage'), 120);
      }
      if (event.type === 'death') {
        this.#deathEvent(event);
        this.#deathVoice(event);
      }
      if (event.type === 'respawn' && event.playerId === this.socket.playerId) this.hud.flashText('FIGHT!', 'ready');
    }
  }

  // where a Spellblade is drawn right now (me: my predicted body; others: their interpolated body)
  #bodyPosition(id) {
    if (id === this.socket.playerId) return this.localState?.position ?? this.localAuth?.position ?? null;
    return this.remotePlayers.bodyPosition(id) ?? this.latestSnapshot?.players.find((p) => p.id === id)?.position ?? null;
  }

  // burning and chilled bodies show it (flames licking up, frost drifting off); my own show at the edges of my view
  #showAfflictions(dt) {
    const snapshot = this.latestSnapshot;
    if (!snapshot) return;
    const serverNow = this.socket.serverNow();
    for (const player of snapshot.players) {
      const burning = player.alive !== false && (player.burningUntil ?? 0) > serverNow;
      const chill = player.alive !== false ? 1 - chillScale(player.chill, serverNow) : 0;
      if (player.id === this.socket.playerId) {
        this.hud.setAfflictions({ burning, chill: chill / 0.55 });
        continue;
      }
      this.effects.afflict(player.id, burning || chill > 0.01 ? this.#bodyPosition(player.id) : null, { burning, chill: chill / 0.55 }, dt);
    }
  }

  // a Spellblade speaks: mine from inside my own helm, others from where they stand, each with their own pitch.
  // Returns whether anything was said.
  #say(line, playerId, { chanceScale = 1, delay = 0 } = {}) {
    if (!this.voice || !playerId) return false;
    if (playerId === this.socket.playerId) return this.voice.say(line, { speaker: playerId, gain: 0.8, chanceScale, delay, close: true });
    const body = this.#bodyPosition(playerId);
    const snapshotPlayer = this.latestSnapshot?.players.find((p) => p.id === playerId);
    if (!body || snapshotPlayer?.actorKind === 'dummy') return false;
    const listener = this.localState?.position ?? this.localAuth?.position;
    // only within earshot: a bark is for the knights around him, not the whole map (voiceRules VOICE_HEARING)
    const place = voicePlacement(listener, this.input.yaw, body);
    if (!place) return false;
    return this.voice.say(line, { speaker: playerId, pan: place.pan, gain: place.gain * 0.9, reverb: place.reverb, rate: voiceRate(playerId), chanceScale, delay });
  }

  // a footstep on whatever is underfoot: mine (from = null) at my own feet, another knight's from where he stands and
  // only near him (footsteps.mjs)
  #footstep(from, position, heavy = 0, gain = FOOTSTEPS.other) {
    if (!this.sound || !position) return;
    this.stepVariant ??= variantPicker();
    const surface = surfaceAt(this.activeWorld, position.x, position.z, position.y ?? 0);
    const recipe = footstepRecipe(Math.random, { surface, heavy, variant: this.stepVariant(from ?? 'me') });
    if (!from) {
      this.sound.play(recipe, { gain });
      return;
    }
    const listener = this.localState?.position ?? this.localAuth?.position;
    const place = footstepPlacement(listener, this.input.yaw, position);
    if (place && place.gain > 0.01) this.sound.play(recipe, { pan: place.pan, gain: place.gain * gain / FOOTSTEPS.other });
  }

  // a Gale let go: the gust seen and heard, the knights it caught shoved and their cloth flung, and now and then a word
  // from whoever loosed it. My own was shown the moment it went (#releaseLocalGale), so only its shoves are left
  #galeBlast(event) {
    const me = this.socket.playerId;
    const spell = spellFor(event.spell);
    const mine = event.playerId === me;
    // the server's word can beat my own frame to it: then this is the moment it goes, and it goes once
    const pending = mine && this.localGale;
    if (pending) this.localGale = null;
    const shownAlready = mine && !pending && Number.isFinite(this.localGaleAt) && Math.abs(event.at - this.localGaleAt) < 0.5;
    if (mine) this.localGaleAt = event.at;
    if (!shownAlready && spell.cone) {
      this.effects.galeBlast(event.origin, event.direction, spell.cone, this.#groundUnder());
      this.#play(galeReleaseRecipe(), mine ? null : event.origin, mine ? 1 : 0.9);
      if (mine && event.recoil && this.localState) shoveBody(this.localState, event.recoil);
    }
    for (const caught of event.affected ?? []) {
      if (caught.id === me) {
        // the gust hits me: my body goes with it at once, and the view is buffeted
        if (this.localState && caught.shove) shoveBody(this.localState, caught.shove);
        this.weapon.damage(this.#pushTowardMe(event.playerId), 6 * caught.pressure);
      } else {
        this.remotePlayers.gust(caught.id, caught.shove);
      }
    }
    if ((event.affected ?? []).some((caught) => caught.pressure >= 0.3 && !caught.guarded)) this.#say('galeTaunt', event.playerId, { delay: 0.7 });
  }

  // the gauntlet, thrown from my own hand (the local rule: the sword does not have the hand, a foe within reach, as far
  // as I can see them): the magic hand drives out at once, with a grunt
  #tryLocalJab(now) {
    const auth = this.localAuth;
    if (!this.localState || (auth.staggerUntil ?? -Infinity) > now || auth.pendingSpell) return false;
    if (!this.weapon.canJab()) return false;
    const foes = this.remotePlayers.bodies().map((body) => ({ id: body.id, position: body }));
    if (!gauntletTarget(this.localState.position, this.input.yaw, foes)) return false;
    this.weapon.jab();
    this.#play(gauntletSwingRecipe(), null, 0.8);
    this.#say('fistEffort', this.socket.playerId);
    this.localJabAt = now;
    return true;
  }

  // another knight's gauntlet going out (mine was shown as I pressed, unless the server saw a foe I did not)
  #gauntletStrike(event) {
    const me = this.socket.playerId;
    if (event.playerId === me) {
      if (!(Math.abs((this.localJabAt ?? -Infinity) - event.at) < 0.5)) {
        this.weapon.jab();
        this.#play(gauntletSwingRecipe(), null, 0.8);
      }
      return;
    }
    this.remotePlayers.jab(event.playerId, event.at);
    this.#play(gauntletSwingRecipe(), this.#bodyPosition(event.playerId), 0.6);
    this.#say('fistEffort', event.playerId);
  }

  // the gauntlet lands: a knock on a guard, or a thud into plate; and, rarely, a word from the one who threw it (the
  // rebuttal first, to a foe who has just spoken and is left low enough for a gauntlet to finish)
  #gauntletHit(event) {
    const me = this.socket.playerId;
    const involved = event.playerId === me || event.targetId === me;
    const body = this.#bodyPosition(event.targetId);
    this.#play(gauntletHitRecipe(Math.random, { guarded: event.guarded }), involved ? null : body, involved ? 0.95 : 0.7);
    if (event.targetId === me && !event.guarded) this.cameraKick = Math.max(this.cameraKick, 0.05);
    if (event.guarded) return;
    const foe = this.latestSnapshot?.players.find((p) => p.id === event.targetId);
    const foeSpokeAgo = this.voice?.director?.sentenceAgo?.(event.targetId, this.voice.engine.now) ?? Infinity;
    // (the blow's own damage word came just before, with the health it left: the snapshot may lag behind it)
    const foeHealth = this.healthAfterBlow?.get(event.targetId) ?? foe?.health ?? 100;
    for (const say of gauntletLines({ attackerId: event.playerId, foeSpokeAgo, foeHealth })) {
      if (this.#say(say.line, say.speaker, say)) break;
    }
  }

  // the ground a gust runs over, for what it blows off it: its height and what it is made of
  #groundUnder() {
    const world = this.activeWorld;
    if (!world) return {};
    return { groundAt: (x, z, y) => surfaceHeightAt(x, z, y, world), surfaceAt: (x, z, y) => surfaceAt(world, x, z, y) };
  }

  // my own Gale lets go: seen and heard at once, and its throw off the ground felt at once (the server does the same)
  #releaseLocalGale(serverNow) {
    const gale = this.localGale;
    this.localGale = null;
    this.localGaleAt = serverNow;
    if (!this.localState || !gale.spell.cone) return;
    const d = gale.direction;
    const eye = { x: this.localState.position.x, y: this.localState.position.y + 1.35, z: this.localState.position.z };
    const origin = { x: eye.x + d.x * 0.35, y: eye.y + d.y * 0.35, z: eye.z + d.z * 0.35 };
    this.effects.galeBlast(origin, d, gale.spell.cone, this.#groundUnder());
    this.#play(galeReleaseRecipe(), null, 1);
    const recoil = galeRecoil(gale.spell, eye, d, this.activeWorld);
    if (recoil) shoveBody(this.localState, recoil);
  }

  // the fallen may protest (magic they do not believe in, or that they are a knight); if they keep quiet, whoever
  // felled them may have a word over the body
  #deathVoice(event) {
    const { fallen, victor } = deathLines(event);
    if (fallen.some((say) => this.#say(say.line, say.speaker, say))) return;
    victor.some((say) => this.#say(say.line, say.speaker, say));
  }

  // steel anywhere stirs the music; blows that involve me put it on the fight
  #warm(event, me) {
    const now = performance.now() / 1000;
    if (['swordSwing', 'swordHit', 'projectileImpact', 'parry', 'block', 'guardBreak', 'spellCast'].includes(event.type)) this.heat.stir(now);
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
    // how cleanly it landed (a glancing blow skates off with a scrape) and how hard the two met
    const quality = Number.isFinite(event.quality) ? event.quality : 1;
    const impact = Number.isFinite(event.impact) ? event.impact : 0;
    const attacker = this.#bodyPosition(event.playerId);
    const victim = this.#bodyPosition(event.targetId);
    const point = impactPoint(victim, attacker);
    if (event.targetId !== me) {
      if (point) this.effects.hitBurst(point, blowDirection(victim, attacker), { strike, quality });
      this.remotePlayers.flashHit(event.targetId);
    }
    if (event.playerId === me) {
      this.hud.hit(glancing(quality) ? 'glance' : 'hit');
      this.weapon.hitstop(hitstopSeconds({ strike, quality }), hitKick({ strike, quality }));
      this.#play(swordHitRecipe(Math.random, { strike, quality, impact }), null, 1);
    } else if (event.targetId === me) {
      this.#play(hurtRecipe(Math.random, { heavy: strike >= 2 || impact > 0.5 }), null, 1);
    } else {
      this.#play(swordHitRecipe(Math.random, { strike, quality, impact }), point, 0.8);
    }
  }

  // a blow meeting a guard: sparks where the blades met and the ring of steel (or the crunch of it breaking)
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
    const recipe = parry ? parryRecipe() : heavy ? guardBreakRecipe() : blockRecipe();
    const involved = event.attackerId === me || event.defenderId === me;
    this.#play(recipe, involved ? null : point, involved ? 1 : 0.8);
    // the one who broke it may gloat, once the crunch has landed
    if (heavy) this.#say('breakTaunt', event.attackerId, { delay: 0.7 });
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
    if (event.victimId === this.socket.playerId) this.#dying(event, killer);
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
    else if (event.source === 'fireball' && killer) this.hud.addFeed(`${killer.name} incinerated ${victim?.name ?? 'someone'}`, 'fire');
    else if (event.source === 'burn' && killer) this.hud.addFeed(`${killer.name} burned ${victim?.name ?? 'someone'} down`, 'fire');
    else if (event.source === 'frostfire' && killer) this.hud.addFeed(`${killer.name} shattered ${victim?.name ?? 'someone'}`, 'frost');
    else if (event.source === 'gale' && killer) this.hud.addFeed(`${killer.name} blew ${victim?.name ?? 'someone'} away`, 'gale');
    else if (event.source === 'gauntlet' && killer) this.hud.addFeed(`${killer.name} laid ${victim?.name ?? 'someone'} low with a gauntlet`, 'sword');
    else if (killer) this.hud.addFeed(`${killer.name} slew ${victim?.name ?? 'someone'}`, 'sword');
    else this.hud.addFeed(`${victim?.name ?? 'A spellblade'} fell into the abyss`, 'abyss');
  }

  // I fell: the card says who and how close it was, and the view plays out the death (deathCam.mjs)
  #dying(event, killer) {
    const me = this.socket.playerId;
    const felledBy = killer && killer.id !== me ? killer : null;
    this.hud.setDeath(deathCardText({ killerName: felledBy?.name ?? null, source: event.source, killerHealth: felledBy?.health }));
    const body = this.localState?.position ?? this.localAuth?.position;
    if (!body) return;
    const from = felledBy ? this.#bodyPosition(felledBy.id) : null;
    this.deathCam = {
      at: performance.now() / 1000,
      killerId: felledBy?.id ?? null,
      seen: null,
      death: {
        eye: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        yaw: this.input.yaw,
        pitch: this.input.pitch,
        push: from ? [body.x - from.x, body.z - from.z] : null,
        ground: body.y,
      },
    };
  }

  // how much of the segment from→to is clear of the arena's walls (the death camera stays out of them)
  #reach = (from, to) => {
    let free = 1;
    for (const box of this.activeWorld?.solids ?? []) {
      const hit = segmentAabbHit(from, to, box);
      if (hit && hit.t < free) free = hit.t;
    }
    return free;
  };

  // the camera while I am down, and my arms falling out of view
  #deathView(timeSec) {
    const dying = this.deathCam;
    dying.down = true;
    const age = timeSec - dying.at;
    const policy = killerCamPolicy(this.latestSnapshot?.mode);
    const body = dying.killerId ? this.#bodyPosition(dying.killerId) : null;
    const killer = body ? [body.x, body.y, body.z] : null;
    const glimpsed = DEATH_CAM.react * 0.5 + DEATH_CAM.fall + DEATH_CAM.hold + DEATH_CAM.lift + (policy.seconds ?? 0.8);
    if (policy.look === 'glimpse' && killer && !dying.seen && age >= glimpsed) dying.seen = killer;
    const view = deathCamera(age, dying.death, killer, { policy, motion: this.view.cameraMotion, seen: dying.seen, reach: this.#reach });
    this.camera.position.set(...view.position);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(view.pitch, view.yaw, view.roll);
    this.weapon.group.visible = view.arms > 0.02;
    this.weapon.group.position.y = -0.35 * (1 - view.arms);
  }

  #frame(nowMs) {
    if (!this.running) return;
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameAt) / 1000));
    this.lastFrameAt = nowMs;
    this.fps += ((1 / dt) - this.fps) * 0.05;
    const timeSec = nowMs / 1000;

    if (this.localState && this.localAuth?.alive && this.playing && this.activeWorld) {
      // back on my feet: my own eyes and arms again (once I was seen down; the death event can beat its snapshot here)
      if (this.deathCam && (this.deathCam.down || timeSec - this.deathCam.at > 1)) {
        this.deathCam = null;
        this.weapon.group.visible = true;
        this.weapon.group.position.y = 0;
      }
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
        crouched: Boolean(this.localState.crouched),
      });
      const wasGrounded = this.localState.grounded;
      const fallSpeed = -this.localState.velocity.y;
      // a chill slows my own steps exactly as the server slows them (it thaws on the same clock)
      this.localState.speedScale = chillScale(this.localAuth.chill, serverNow);
      this.localState = movePlayer(this.localState, moveInput, dt, serverNow, this.activeWorld);
      // predict the server's body separation so pressing into an opponent does not rubber-band
      separateLocal(this.localState.position, this.remotePlayers.bodies(), this.activeWorld, { crouched: this.localState.crouched });
      if (!wasGrounded && this.localState.grounded) {
        this.weapon.land(fallSpeed);
        // both feet down at once, heavier the further he fell
        if (fallSpeed > 2.5) this.#footstep(null, this.localState.position, Math.min(1, fallSpeed / 10), FOOTSTEPS.landing);
      }
      if (nowMs - this.lastInputSentAt >= 50) {
        this.lastInputSentAt = nowMs;
        this.socket.input({ seq: ++this.sequence, ...moveInput, clientTime: this.socket.serverNow() });
      }
      // the weapon's procedural motion also returns small camera offsets (purely visual: aim uses input yaw/pitch)
      // Sheathed in Steel on my own arms: the server's word, or my own press while that word is on the way
      const steel = this.localAuth.steel;
      const pressed = Number.isFinite(this.localSteelAt) && serverNow - this.localSteelAt < 0.6 ? this.localSteelAt : null;
      const calledAt = Math.max(steel?.calledAt ?? -Infinity, pressed ?? -Infinity);
      this.weapon.setSteel(
        Math.max(steelStrength(steel, serverNow), pressed !== null && !steel ? 1 : 0),
        Number.isFinite(calledAt) ? serverNow - calledAt : null,
      );
      // my Gale lets go when its breath is drawn; one the server never took is let go of quietly
      // while the spell cools, whether its key would throw the gauntlet now (a foe in reach, the hand free)
      const cooling = serverNow < (this.localAuth.spellReadyAt ?? 0);
      const fistReady = cooling && this.weapon.canJab() && Boolean(gauntletTarget(this.localState.position, this.input.yaw,
        this.remotePlayers.bodies().map((body) => ({ id: body.id, position: body }))));
      this.hud.setFistReady?.(fistReady);
      this.touch?.setFistReady(fistReady);
      if (this.localGale && serverNow >= this.localGale.at) {
        if (this.localGale.confirmed) this.#releaseLocalGale(serverNow);
        else if (serverNow > this.localGale.at + 0.4) this.localGale = null;
      }
      const strideBefore = this.weapon.motion.stride;
      const view = this.weapon.update(timeSec, dt, {
        speed: Math.hypot(this.localState.velocity.x, this.localState.velocity.z),
        grounded: this.localState.grounded,
        yaw: this.input.yaw,
        pitch: this.input.pitch,
      });
      // my footsteps fall where the stride puts them (the view's own bob), so they keep pace with the legs
      if (this.localState.grounded && footfallsCrossed(strideBefore, this.weapon.motion.stride) > 0) {
        // (crouched, the steps are soft and light)
        this.#footstep(null, this.localState.position, this.localState.crouched ? 0 : this.weapon.motion.sprint, FOOTSTEPS.own * (this.localState.crouched ? 0.55 : 1));
      }
      // the view sits where the body's eyes are, settling quickly to a crouch and back (the body itself changes at once)
      const eyes = postureOf(this.localState).camera;
      this.viewHeight = Number.isFinite(this.viewHeight) ? this.viewHeight + (eyes - this.viewHeight) * (1 - Math.exp(-dt / CROUCH.viewSec)) : eyes;
      this.camera.position.set(this.localState.position.x, this.localState.position.y + this.viewHeight + view.camera.y, this.localState.position.z);
      this.camera.rotation.order = 'YXZ';
      // camera motion (a comfort setting) scales the sway, bob, kicks and the widening of the view when sprinting
      const motion = this.view.cameraMotion;
      this.camera.rotation.y = this.input.yaw + view.camera.yaw * motion;
      this.camera.position.y -= view.camera.y * (1 - motion);
      this.camera.rotation.x = this.input.pitch + (this.cameraKick + view.camera.pitch) * motion;
      this.camera.rotation.z = view.camera.roll * motion;
      this.cameraKick *= Math.exp(-dt * 15);
      this.#setFov(this.view.fov + (view.fov - FP_MOTION.baseFov) * motion);
    } else if (this.localAuth && this.localState && this.deathCam && this.localAuth.alive === false) {
      this.#deathView(timeSec);
      this.#setFov(this.view.fov + (this.weapon.update(timeSec, dt).fov - FP_MOTION.baseFov) * this.view.cameraMotion);
    } else if (this.localAuth && this.localState) {
      this.camera.position.set(this.localState.position.x, this.localState.position.y + POSTURES.standing.camera, this.localState.position.z);
      this.camera.rotation.z = 0;
      this.#setFov(this.view.fov + (this.weapon.update(timeSec, dt).fov - FP_MOTION.baseFov) * this.view.cameraMotion);
    }
    this.remotePlayers.update(nowMs, dt);
    this.#showAfflictions(dt);
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
    this.#followSun(this.localState?.position ?? this.camera.position);
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
    this.resizeObserver?.disconnect();
    this.touch?.dispose();
    this.world?.dispose?.();
    this.remotePlayers.dispose();
    this.weapon.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
