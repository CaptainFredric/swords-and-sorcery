import { combatActionPolicy, combatBlocksSprint } from '../../shared/src/combatActionPolicy.mjs';
import * as THREE from 'three';
import { getWorld } from '../../shared/worlds/registry.mjs';
import { MOVEMENT, createMovementState, launchBody, movePlayer, resolveSprint, shoveBody, tryStartDash } from '../../shared/src/movement.mjs';
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
import { blowDirection, glancing, hitKick, hitstopSeconds, impactPoint, steelHitFeel } from './hitFeel.mjs';
import {
  blockRecipe, burnLickRecipe, castRecipe, dashRecipe, fireballImpactRecipe, frostImpactRecipe, guardBreakRecipe, hurtRecipe, killRecipe,
  deniedRecipe, galeReleaseRecipe, preciseRecipe, softStrikeRecipe, strikeSurface, woodThunkRecipe, gauntletHitRecipe, gauntletSwingRecipe, parryRecipe, spatialize, steelCallRecipe, steelClangRecipe, steelRamRecipe, steelTickRecipe,
  swingRecipe, swordHitRecipe, wallClangRecipe,
  groundSlamRecipe, ruptureRunRecipe, sunderRingRecipe, staggerBreakRecipe, staggerStrainRecipe, sunderDongRecipe, sunderDropRecipe, sunderForceRecipe,
  ultimateFizzleRecipe, ultimateReadyRecipe,
  emberImpactRecipe, emberRecipe, vortexCatchRecipe, vortexCutRecipe, vortexEndRecipe, vortexIgniteRecipe, vortexScrapeRecipe, vortexStarRecipe, vortexWhooshRecipe,
} from './sound/soundRecipes.mjs';
import { ULTIMATES, ultimateFor, ultimateStartup, ultimateWhirl, vortexAngle, vortexWindup } from '../../shared/src/ultimates.mjs';
import { PROWESS } from '../../shared/src/prowess.mjs';
import { PRACTICE_RECAST, recordUse } from '../../shared/src/practiceRecast.mjs';
import { STAGGER } from '../../shared/src/stagger.mjs';
import { RUPTURE } from '../../shared/src/rupture.mjs';
import { galeRecoil } from '../../shared/src/gale.mjs';
import { swordDamageFor } from '../../shared/src/combat.mjs';
import { CROUCH, POSTURES, postureOf } from '../../shared/src/body.mjs';
import { steelStrength } from '../../shared/src/steel.mjs';
import { STEEL_RAM, chargeTarget, ramContact, ramStrength } from '../../shared/src/steelRam.mjs';
import { STEEL_RIPPLE } from './steelSheen.mjs';
import { chillScale, spellFor } from '../../shared/src/spells.mjs';
import { cryMoment, gauntletMoment, hearingFor, voicePlacement, voiceRate } from './sound/voiceRules.mjs';
import { MOMENTS, VoiceMoments } from './sound/voiceMoments.mjs';
import { VoiceScenes } from './sound/voiceScenes.mjs';
import { VoiceWatch } from './sound/voiceWatch.mjs';
import { linesFor } from './sound/voiceLines.mjs';
import { subtitleFor } from '../ui/voiceLibrary.mjs';
import { FOOTSTEPS, footfallsCrossed, footstepPlacement, footstepRecipe, surfaceAt, variantPicker } from './sound/footsteps.mjs';
import { CombatHeat, matchClosing, nearestFoe } from './sound/combatHeat.mjs';
import { FP_MOTION } from './firstPersonMotion.mjs';
import { DEATH_CAM, deathCamera, deathCardText, killerCamPolicy } from './deathCam.mjs';
import { createWorldRenderer, rendererKeyForWorld } from '../worlds/WorldRendererFactory.mjs';
import { CastlewardRenderer } from '../worlds/CastlewardRenderer.mjs';
import { ShatteredKeepRenderer } from '../worlds/ShatteredKeepRenderer.mjs';
import { RuinedKeepRenderer } from '../worlds/RuinedKeepRenderer.mjs';
import {
  canPresentLocalAction,
  handsTaken,
  localWeaponReleaseForEvent,
  localWeaponReleaseForSnapshot,
} from './localActionPresentation.mjs';
import { VIEW_LAYER, everywhere } from './viewLayers.mjs';
import { LocalBladeSweep } from './localBladeSweep.mjs';
import { aimVector, chaseAim, chaseCamera, chaseLimit, chaseWanted, reticleDistance, stepChase } from './vortexCamera.mjs';
import { vortexHint } from '../ui/ultimateView.mjs';

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
  'ruined-keep': RuinedKeepRenderer,
});

// the server's word for a clang my own view already foretold arrives within this long (a round trip and a tick or two)
const FORETOLD_CLANG_MS = 700;

// my case for not having fallen ("Why I should not fall. One... Two... Three—"): begun this long after the fall at the
// soonest; meant to be cut this far before its end (its last word just begun: "Thr—") by my return; and, back on my
// feet a moment before that word, let run on this long at most to reach it (the take is never hurried to fit)
const APPEAL = Object.freeze({ leadSec: 0.1, interruptBeforeEnd: 0.4, runOnSec: 0.45 });

export class GameRuntime {
  constructor(container, socket, hud, { sound = null, voice = null } = {}) {
    this.container = container;
    this.socket = socket;
    this.hud = hud;
    this.sound = sound;
    this.voice = voice;
    this.heat = new CombatHeat();
    // the player's view settings (see configure)
    this.view = { fov: FP_MOTION.baseFov, pixelRatioCap: 1.6, cameraMotion: 1, damageNumbers: true, damageFlash: true, subtitles: true };
    // every line said is written out, if the player wants it (a grunt has no words to write)
    this.subtitleHook = (said) => this.#subtitle(said);
    if (this.voice) this.voice.onSpoken = this.subtitleHook;
    // and a line cut off (by a line that matters more, or a fall) takes its caption with it
    this.captionCut = (speaker) => this.hud.subtitleCut?.(speaker);
    if (this.voice) this.voice.onCut = this.captionCut;
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

    const hemi = everywhere(new THREE.HemisphereLight(
      SCENE_PRESENTATION.hemisphere.skyColor,
      SCENE_PRESENTATION.hemisphere.groundColor,
      SCENE_PRESENTATION.hemisphere.intensity,
    ));
    this.scene.add(hemi);
    this.hemi = hemi;
    const moon = everywhere(new THREE.DirectionalLight(SCENE_PRESENTATION.moon.color, SCENE_PRESENTATION.moon.intensity));
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
    // now and then a knight grunts as he jumps (an exertion: never over his other lines)
    this.remotePlayers.onJump = (id) => this.#sayMoment(id, ['jump']);
    // another knight's Blazing Vortex: the star's ting as it is lit, and the beat of the blade, once a turn
    this.remotePlayers.onVortexSpark = (id) => this.#play(vortexStarRecipe(), this.#bodyPosition(id), 0.7);
    this.remotePlayers.onVortexTurn = (id, rate) => this.#play(vortexWhooshRecipe(Math.random, { rate }), this.#bodyPosition(id), 0.6);
    // the moments he has a line for, remembered a little while (voiceMoments.mjs)
    this.moments = new VoiceMoments();
    // and his longer scenes, each part said when the game has earned it (voiceScenes.mjs)
    this.scenes = new VoiceScenes({ say: (line, speaker, options) => this.#say(line, speaker, options) });
    // and what he watches for over time: a charge, a chase, a lull, ground given and stood (voiceWatch.mjs)
    this.watch = new VoiceWatch();
    // the knights in Spells & Chivalry now, and when each one's last ended (it ends the moment a knight falls)
    this.chivalrous = new Set();
    this.chivalryEndedAt = new Map();
    // my own blade against the world, judged in my own view (localBladeSweep.mjs)
    this.bladeSweep = new LocalBladeSweep();
    this.weapon = new WeaponView(this.camera);
    // my own Vortex lit: the star's ting
    this.weapon.onVortexSpark = () => this.#play(vortexStarRecipe(), null, 1);
    this.weapon.onSwing = (strike, { slam = false } = {}) => {
      // (Sundering, every strike is swung as the heavy one)
      const heavy = slam || strike >= 2;
      this.#play(swingRecipe(Math.random, { strike: heavy ? 2 : strike }), null, 0.85);
      // the heavy third strike gets his breath behind it; the lighter ones only now and then
      // (under the Sunder sentence, a word to a slam, the ordinary breath of a swing keeps quiet)
      if (!this.scenes.sentenceRunning(this.socket.playerId, this.socket.serverNow())) this.#sayMoment(this.socket.playerId, [heavy ? 'heavySwing' : 'lightSwing']);
    };
    // my own strike committed, its swing beginning: the breath behind it leads the blade (a first swing after a while;
    // the heavy third swung at a foe it would fell)
    this.weapon.onBegin = (strike) => {
      const me = this.socket.playerId;
      const knights = (this.latestSnapshot?.players ?? []).map((p) => (p.id === me && this.localState
        ? { ...p, position: this.localState.position, yaw: this.input.yaw ?? p.yaw } : p));
      this.#sayWatched(this.watch.begin({ playerId: me, strikeIndex: strike, at: this.socket.serverNow() }, knights));
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
    this.input.onCastLocal = (metadata = {}) => {
      const now = this.socket.serverNow();
      const practice = this.#inPractice();
      const intendedSpell = metadata.spell ?? this.localAuth?.spell;
      const policy = combatActionPolicy(this.localAuth, now);
      if (!canPresentLocalAction('cast', this.localAuth, this.localState, now, { practice, gate: this.localGate, spell: intendedSpell })) {
        if (metadata.spellOnly || this.localAuth?.preparedSpellSelected || policy.concurrent || handsTaken(this.localAuth, now)) {
          this.hud.denied?.('spell');
          this.#play(deniedRecipe(), null, 0.6);
          return;
        }
        // on its cooldown the spell's key throws the gauntlet, on command (the server's word follows whether it met
        // anyone); only while the hand cannot (mid-swing, say), the cooldown's quiet no. (In the yard the key stays the
        // spell's: it comes back in a moment.)
        if (this.localAuth?.alive && now < (this.localAuth.spellReadyAt ?? 0) && (practice || !this.#tryLocalJab(now))) {
          this.hud.denied?.('spell');
          this.#play(deniedRecipe(), null, 0.6);
        }
        return;
      }
      const spell = spellFor(intendedSpell);
      this.weapon.setCombatPolicy(policy, this.localAuth, now);
      if (policy.concurrent) {
        this.localGate = { ...(this.localGate ?? {}),
          projectile: !spell.kind ? now + policy.projectileGateSec : this.localGate?.projectile ?? 0,
          gatherUntil: now + (spell.gatherSec ?? 0),
          byId: { ...(this.localGate?.byId ?? {}), [spell.id]: now + spell.cooldownSec },
        };
      }
      if (practice) this.localGate = { ...(this.localGate ?? {}), spell: now + Math.max(PRACTICE_RECAST.gateSec, spell.gatherSec ?? 0) };
      // Sheathe in Steel, carried in the spell's place: the clench and the ring of plate at once (the server hardens
      // the armour a moment later)
      if (spell.kind === 'ward') {
        this.weapon.clench();
        this.localSteelAt = now;
        this.#play(steelCallRecipe(), null, 0.9);
        return;
      }
      this.weapon.cast({ gatherSec: spell.gatherSec, spell: spell.id });
      // a Gale lets go when its breath is drawn: my own is seen and felt the moment it goes, once the server has taken it
      // (it goes where I aim as it leaves the hand, as the server's does: the aim is taken then, not now)
      if (spell.kind === 'cone') this.localGale = { at: now + spell.gatherSec, spell, confirmed: false };
    };
    // the gauntlet on its own key: the fist at once, spell or no spell (the server's word follows); only while the hand
    // cannot (mid-swing, say), the quiet no
    this.input.onGauntletLocal = () => {
      const now = this.socket.serverNow();
      if (this.localAuth?.alive && !this.#tryLocalJab(now)) this.#play(deniedRecipe(), null, 0.5);
    };
    // the ultimate's key: the host decides; with the meter short (or it already running), the quiet no
    this.input.onUltimateLocal = () => {
      const me = this.localAuth;
      // (in the Practice Yard the key readies it too: only one already under way, or its recovery, says no)
      const now = this.socket.serverNow();
      const short = (me?.prowess ?? 0) < PROWESS.full && !this.#inPractice();
      if (me?.alive && (short || me.ultimateState || handsTaken(me, now))) {
        this.hud.denied?.('ultimate');
        this.#play(deniedRecipe(), null, 0.5);
        return;
      }
      // Sunder: my arms take up the brace the moment the key goes down (the host's word follows and corrects when it
      // ends; if the host never takes the key, they are let down again). Not while the palm or the fist is busy: then
      // the host takes the key a moment later, and its word starts the brace
      const free = me?.alive && !((me.staggerUntil ?? -Infinity) > now) && this.weapon.castReleased && this.weapon.canJab();
      if (free && ultimateFor(me.ultimate).id === 'sunder') {
        this.weapon.brace(performance.now() / 1000 + ULTIMATES.sunder.startupSec);
        this.braceAskedAt = performance.now();
      }
    };
    // the meter full: a restrained note, once
    this.input.onPreparedSelector = (view) => this.hud.setPreparedSelector?.(view);
    this.hud.onUltimateReady = () => this.#play(ultimateReadyRecipe(), null, 0.9);
    this.input.onDashLocal = (dir) => {
      const now = this.socket.serverNow();
      const practice = this.#inPractice();
      if (!canPresentLocalAction('dash', this.localAuth, this.localState, now, { practice, gate: this.localGate })) return;
      // (as the host does it: the dash itself as ever, its real cooldown as the yard's rule has it)
      const running = this.localState.dashReadyAt;
      this.localState.dashReadyAt = -Infinity;
      const dashed = tryStartDash(this.localState, dir, now);
      this.localState.dashReadyAt = running;
      if (!dashed) return;
      // Sheathed in Steel (or just called, the host's word still on its way), the dash is a ram as strong as the plate
      // is now: foreseen here as it lands (#foretellRam)
      const called = Number.isFinite(this.localSteelAt) && now - this.localSteelAt < 0.6 && !this.localAuth?.steel;
      const ram = called ? 1 : ramStrength(this.localAuth?.steel, now);
      this.localRam = ram > 0 ? { strength: ram, armed: true, at: null } : null;
      recordUse(this.localState, 'dash', now, MOVEMENT.dashCooldown, practice);
      if (practice) this.localGate = { ...(this.localGate ?? {}), dash: now + PRACTICE_RECAST.gateSec };
      this.weapon.dash();
      this.effects.dash();
      this.#play(dashRecipe(), null, 0.8);
      // a Steel dash straight at someone near is a charge (head on, as he would put it): its line, if said, is the
      // only breath of the dash (the same moment: the first said is the only one)
      const toward = ram > 0 ? chargeTarget(this.localState.position, this.localState.dashDir, this.#chargeable(now)) : null;
      this.#sayMoment(this.socket.playerId, toward ? ['steelCharge', 'dash'] : ['dash']);
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
    if (release.cast) this.weapon.cancelCast();
    if (release.dash && this.localState) this.localState.dashUntil = this.socket.serverNow();
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
   * { mouse, touch, invertY, touchScale, touchGauntlet, bindings }.
   */
  configure({ view = null, input = null } = {}) {
    if (view) {
      const sharper = view.pixelRatioCap !== this.view.pixelRatioCap;
      this.view = { ...this.view, ...view };
      if (sharper) {
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.view.pixelRatioCap));
        this.#resize();
      }
      this.effects?.setDensity(this.view.particles ?? 1);
      this.#shadowDetail();
    }
    if (input) {
      this.input.configure(input);
      this.touchScale = input.touchScale ?? this.touchScale;
      this.touchGauntlet = input.touchGauntlet ?? this.touchGauntlet;
      this.touch?.setScale(this.touchScale);
      this.touch?.setGauntletButton(this.touchGauntlet);
    }
  }

  // phones and tablets: on-screen controls replace the mouse and keyboard
  enableTouch() {
    if (this.touch) return;
    this.touch = new TouchControls(this.hud.root, this.input);
    this.hud.setPreparedInputMode('touch');
    this.touch.setScale(this.touchScale);
    this.touch.setGauntletButton(this.touchGauntlet);
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
    if (snapshot.matchStartedAt !== this.latestSnapshot?.matchStartedAt) this.localGate = null;
    this.latestSnapshot = snapshot;
    this.remotePlayers.pushSnapshot(snapshot, performance.now());
    this.effects.syncProjectiles(snapshot.projectiles ?? []);
    const auth = snapshot.players.find((p) => p.id === this.socket.playerId);
    this.localAuth = auth ?? null;
    this.input.updatePreparedSpells?.(auth, this.socket.serverNow());
    this.weapon.setCombatPolicy(combatActionPolicy(auth, this.socket.serverNow()), auth, this.socket.serverNow());
    if (!auth) return;
    this.weapon.reconcileCast(auth, this.socket.serverNow());
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
        // (carried by another's gust: its push is the host's to say, not something I can foresee)
        if (auth.impulse && this.socket.serverNow() < (this.windOnMeUntil ?? -Infinity)) this.localState.impulse = { ...auth.impulse };
      }
      this.localState.dashReadyAt = auth.dashReadyAt;
      // (a ram I foresaw has stopped my dash already, whatever the host's word on it says before it has heard)
      const dashUntil = auth.dashUntil ?? this.localState.dashUntil;
      const rammedAt = this.localRam?.at;
      this.localState.dashUntil = Number.isFinite(rammedAt) && dashUntil > rammedAt && dashUntil - rammedAt < MOVEMENT.dashDuration + 0.3 ? rammedAt : dashUntil;
    }
    const released = localWeaponReleaseForSnapshot(auth, this.socket.serverNow());
    this.#applyWeaponRelease(released);
    if (released?.attack && released?.guard) this.weapon.cancelCast();
    // Guard follows authority, including its single automatic raise and later interruptions.
    const concurrent = combatActionPolicy(auth, this.socket.serverNow()).concurrent && auth.alive;
    if (concurrent && (auth.staggerUntil ?? 0) <= this.socket.serverNow()) {
      this.weapon.setGuard(Boolean(auth.guarding) && auth.guardStamina > 0);
      if (this.input.attackHeld) this.weapon.setAttack(true);
    } else if (this.wasConcurrent && !concurrent) {
      // the ultimate over, its automatic raise goes with it: my guard is whatever my own hand is doing
      this.weapon.setGuard(this.input.guardHeld && auth.alive && auth.guardStamina > 0);
    }
    this.wasConcurrent = concurrent;
  }

  onEvents(events) {
    for (const event of events) {
      this.remotePlayers.onEvent(event, this.latestSnapshot);
      this.#applyWeaponRelease(localWeaponReleaseForEvent(event, this.socket.playerId, this.localAuth, event.at ?? this.socket.serverNow()));

      const me = this.socket.playerId;
      if (event.playerId === me || event.victimId === me) this.weapon.chivalryEvent(event);
      if (event.type === 'spellCast') {
        const spell = spellFor(event.spell);
        const duration = castVisualDuration(event, me, this.socket.serverNow());
        if (duration !== null) {
          this.weapon.cast({ gatherSec: Math.max(0, duration - 0.06), spell: spell.id, accepted: true });
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
          if (body) this.effects.galeGather(() => {
            const current = this.remotePlayers.bodyAim?.(event.playerId);
            if (!current) return null;
            const direction = aimVector(current.yaw, current.pitch);
            const palm = this.remotePlayers.palmPosition(event.playerId);
            return { origin: palm ?? { x: current.x, y: current.y + 1.3, z: current.z }, direction };
          }, { gatherSec: release });
        }
        if (event.playerId !== me && (spell.id === 'fireball' || spell.id === 'frostfire') && release > 0) {
          this.effects.spellGather(spell.id, () => {
            const body = this.remotePlayers.bodyAim?.(event.playerId);
            if (!body) return null;
            const direction = aimVector(body.yaw, body.pitch);
            const palm = this.remotePlayers.palmPosition(event.playerId);
            const origin = palm ?? { x: body.x, y: body.y + (body.crouched ? POSTURES.crouched.eye : POSTURES.standing.eye), z: body.z };
            return { origin, direction };
          }, { gatherSec: release });
        }
        // SORCERY!! now and then; when it keeps quiet, the wildcard may not
        // (or, rarely, a complaint about the thing gathering in his own palm: a spell that flies, not a gust or a ward)
        this.#sayMoment(event.playerId, ['spellCast', !spell.kind && 'projectileGather']);
      }

      if (event.type === 'galeBlast') this.#galeBlast(event);
      if (event.type === 'galeCatch') this.#galeCaught(event);
      if (event.type === 'gauntletStrike') this.#gauntletStrike(event);
      if (event.type === 'gauntletHit') this.#gauntletHit(event);
      if (event.type === 'steelRam') this.#steelRam(event);
      // a blow or a blast that shoved me: my own steps carry the shove at once (the server's already do)
      if (event.type === 'damage' && event.victimId === me && event.push && this.localState) shoveBody(this.localState, event.push);
      if (event.type === 'damage') {
        // the killing blow's weight against the health it took, for the fallen's line (an overkill: voiceRules)
        const before = this.healthAfterBlow?.get(event.victimId) ?? this.latestSnapshot?.players.find((p) => p.id === event.victimId)?.health ?? 100;
        if (event.health <= 0) {
          (this.killingBlow ??= new Map()).set(event.victimId, {
            amount: event.amount, healthBefore: before, level: event.level ?? null, ultimate: Boolean(event.ultimate), clean: Boolean(event.clean),
          });
        }
        (this.healthAfterBlow ??= new Map()).set(event.victimId, event.health);
        this.scenes.damage(event);
        this.watch.damage(event);
        this.#sayMoments(this.moments.damage(event, this.#voiceWorld()), event.at);
      }
      // a sword denied by the same foe again and again (their guard, their parry, or simply not being there)
      if ((event.type === 'block' && !event.vortex) || event.type === 'parry') this.#sayMoments(this.moments.denied(event.attackerId, event.defenderId, event.at), event.at);
      if (event.type === 'swordMiss') this.#sayMoments(this.moments.denied(event.playerId, this.#nearestFoe(event.playerId, MOMENTS.denied.near), event.at), event.at);
      // a foe's sword narrowly missing a knight on the move; a swing after a while, a chain carrying on, ground stood
      if (event.type === 'swordMiss') this.#sayWatched(this.watch.miss(event, this.latestSnapshot?.players ?? []));
      if (event.type === 'swordSwing') this.#sayWatched(this.watch.swing(event, this.latestSnapshot?.players ?? []));
      if (event.type === 'ultimateActive' && event.ultimate === 'chivalry') this.chivalrous.add(event.playerId);
      if (event.type === 'ultimateEnded' && event.ultimate === 'chivalry') {
        this.chivalrous.delete(event.playerId);
        this.chivalryEndedAt.set(event.playerId, event.at);
      }

      // Sheathed in Steel: another knight's plate ringing as it hardens (mine rang as I pressed)
      if (event.type === 'steelOn' && event.playerId !== me) this.#play(steelCallRecipe(), this.#bodyPosition(event.playerId), 0.7);
      // now and then a word as it hardens
      if (event.type === 'steelOn') this.#sayMoment(event.playerId, ['steelCalled']);
      // a spell turned aside by it: now and then a word of pride (its clang and sparks come with the blow's damage)
      if (event.type === 'steelTurn' && event.turned >= 0.25) this.#sayMoment(event.playerId, ['steelTurn']);

      // Sunder All That Rusts: the brace (and the cry), the brace broken before it took hold, the ground split
      if (event.type === 'ultimateStart') this.#ultimateStart(event);
      // ...and as it takes hold, the bell
      if (event.type === 'ultimateActive' && event.ultimate === 'vortex') {
        // the fire catches as the spin takes hold; and, now and then, what he has to say at that speed (once)
        this.#play(vortexCatchRecipe(), event.playerId === me ? null : this.#bodyPosition(event.playerId), event.playerId === me ? 0.9 : 0.7);
        // (and is seen to: one short punch of light and sparks about the knight, gone at once)
        const body = this.#bodyPosition(event.playerId);
        if (body) this.effects.vortexIgnite({ x: body.x, y: body.y + 1.2, z: body.z }, { mine: event.playerId === me });
        this.#sayMoment(event.playerId, ['vortexSpin']);
      } else if (event.type === 'ultimateActive' && event.ultimate === 'chivalry') {
        this.#play(ultimateReadyRecipe(), event.playerId === me ? null : this.#bodyPosition(event.playerId), event.playerId === me ? 0.8 : 0.7);
        this.#sayMoment(event.playerId, ['ultimateActive']);
      } else if (event.type === 'ultimateActive') {
        this.#play(sunderDongRecipe(), event.playerId === me ? null : this.#bodyPosition(event.playerId), event.playerId === me ? 0.95 : 0.8);
        this.#sayMoment(event.playerId, ['ultimateActive']);
      }
      // a Vortex run out: the spin winding down
      if (event.type === 'ultimateEnded' && event.ultimate === 'vortex') {
        this.#play(vortexEndRecipe(), event.playerId === me ? null : this.#bodyPosition(event.playerId), event.playerId === me ? 0.8 : 0.6);
      }
      if (event.type === 'vortexHit') this.#vortexHit(event);
      // an ember leaving the spin: a small spit of fire
      if (event.type === 'projectileSpawned' && spellFor(event.projectile?.spell).conjured && event.projectile.spell === spellFor(event.projectile.spell).id) {
        // a Vortex's fire leaving the spin: a spit for an ember, a real launch for the fire's own (heard and seen)
        const mine = event.projectile.ownerId === me;
        const size = spellFor(event.projectile.spell).size ?? 0.5;
        this.#play(emberRecipe(Math.random, { size }), mine ? null : event.projectile.position, (mine ? 0.5 : 0.45) + 0.4 * size);
        this.effects.fireLaunch(event.projectile.position, event.projectile.velocity, size);
      }
      // what a Vortex's blade clips of the world: it rings and sparks, and the spin goes on
      if (event.type === 'vortexWorldContact') this.#vortexWorld(event);
      // a Sundering blow has ended what a knight was doing
      if (event.type === 'actionInterrupted') this.#cutShort(event);
      if (event.type === 'ultimateInterrupted') {
        this.#play(ultimateFizzleRecipe(), event.playerId === me ? null : this.#bodyPosition(event.playerId), 0.8);
        if (event.playerId === me) {
          this.hud.flashText('INTERRUPTED', 'danger');
          this.weapon.braceCancel();
        }
      }
      if (event.type === 'staggerBreak') {
        this.#staggerBreak(event);
        this.watch.staggerBreak(event);
        this.#sayMoments(this.moments.staggerBreak(event, this.#voiceWorld()), event.at);
      }
      // another knight's dash: its breath, or the wildcard, now and then (mine is said as I press it)
      if (event.type === 'dash' && event.playerId !== me) this.#sayMoment(event.playerId, event.toward ? ['steelCharge', 'dash'] : ['dash']);
      // the Sunder sentence: a Sunder taken hold may begin it at its first slam into the ground, and every slam swung
      // after that is its next word (voiceScenes.mjs)
      if (event.type === 'ultimateActive' && event.ultimate === 'sunder') this.scenes.sunderBegan(event.playerId);
      if (event.type === 'ultimateEnded') this.scenes.sunderEnded(event.playerId);
      if (event.type === 'swordSwing' && event.slam) this.scenes.slamSwung(event.playerId, event.at);
      if (event.type === 'groundStrike') this.scenes.groundSlam(event.playerId, event.at);
      if (event.type === 'groundStrike') {
        this.#play(groundSlamRecipe(), event.playerId === me ? null : event.point, 1);
        if (event.playerId === me) this.cameraKick = Math.max(this.cameraKick, 0.2);
      }
      if (event.type === 'rupture') {
        this.effects.rupture(event.origin, event.fissures, { speed: event.speed, lastsSec: RUPTURE.lastsSec, tornWidth: RUPTURE.tornWidth });
        const runs = Math.max(...event.fissures.map((fissure) => fissure.length)) / event.speed;
        this.#play(ruptureRunRecipe(Math.random, { seconds: runs }), event.origin, 0.85);
      }

      // my own swings whoosh from the local swing (no network delay); others' from the server's strike
      if (event.type === 'swordSwing' && event.playerId !== me) {
        const heavy = event.slam || event.strikeIndex >= 2;
        this.#play(swingRecipe(Math.random, { strike: heavy ? 2 : event.strikeIndex }), this.#bodyPosition(event.playerId), 0.55);
        if (!this.scenes.sentenceRunning(event.playerId, event.at)) this.#sayMoment(event.playerId, [heavy ? 'heavySwing' : 'lightSwing']);
      }
      this.#warm(event, me);

      const combatFeedback = localCombatFeedback(event, this.socket.playerId);
      if (combatFeedback === 'block') this.effects.block();
      if (combatFeedback === 'parry') this.effects.parry();
      if (combatFeedback === 'guardBreak') this.effects.guardBreak();

      // a blade stopped by the world. Mine was felt as my own view judged it (#foretellClang): the server's word for
      // the same strike only ends the swing (#applyWeaponRelease above), it does not ring twice
      if (event.type === 'swordWorldImpact') {
        const mine = shouldPlayWorldClang(event, this.socket.playerId);
        const foretold = mine && performance.now() - (this.foretoldClangAt ?? -Infinity) < FORETOLD_CLANG_MS;
        if (foretold) this.foretoldClangAt = -Infinity;
        else this.#worldClang(event, mine);
      }
      // a blade snagged on some small furnishing in passing: very rarely, the knight formally surrenders over it
      if (event.type === 'swordWorldImpact' && event.snag) this.#sayMoment(event.playerId, ['bladeSnag']);
      if (event.type === 'swordHit') this.#swordHit(event);
      if (event.type === 'parry' || event.type === 'block' || event.type === 'guardBreak') this.#guardContact(event);
      if (event.type === 'parry') {
        if (event.defenderId === me) { this.weapon.parry(); this.hud.flashText('PARRY', 'parry'); this.hud.hit('parry'); }
        if (event.attackerId === me && !(event.suppressParryReel ?? combatActionPolicy(this.localAuth, event.at ?? this.socket.serverNow()).suppressParryReel)) this.weapon.rebound();
      }
      if (event.type === 'block') {
        if (event.defenderId === me) this.weapon.block(false);
        // (a Vortex's blade is not thrown back by a guard: it is already coming round again)
        if (event.attackerId === me && !event.vortex) this.weapon.rebound();
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
        this.#play(spell.conjured ? emberImpactRecipe(Math.random, { size: spell.size }) : spell.chill ? frostImpactRecipe() : fireballImpactRecipe(), event.point, spell.conjured ? 0.6 + 0.4 * (spell.size ?? 0.5) : 1);
      }
      if (event.type === 'damage' && event.source === 'burn') this.#play(burnLickRecipe(), event.victimId === me ? null : this.#bodyPosition(event.victimId), 0.7);
      // the split ground catching a knight: a smaller ring of the same iron
      if (event.type === 'damage' && event.source === 'rupture' && event.amount > 0) {
        const involved = event.victimId === me || event.attackerId === me;
        this.#play(sunderRingRecipe(Math.random, { light: true }), event.victimId === me ? null : this.#bodyPosition(event.victimId), involved ? 0.85 : 0.65);
      }
      if (event.type === 'damage') {
        if (event.attackerId === me) {
          this.hud.hit('hit');
          // my numbers only: the blow's weight, rising off the body
          const victim = this.#bodyPosition(event.victimId);
          if (victim && event.amount > 0 && event.victimId !== me && this.view.damageNumbers) {
            this.effects.damageNumber({ x: victim.x, y: victim.y + 1.85, z: victim.z }, event.amount, { heavy: event.amount >= 40 });
          }
        }
        // (a ram knocks me through my own view itself, harder: #steelRam)
        if (event.victimId === this.socket.playerId && event.source !== 'abyss' && event.source !== 'ram' && event.amount > 0) {
          this.weapon.damage(this.#pushTowardMe(event.attackerId), event.amount);
        }
        // a blow that kills gets the death cry instead
        // (a severe one has its own sounds; a small one after a long while unhurt, its own)
        if (event.amount >= 8 && event.health > 0 && event.source !== 'abyss') this.#sayMoment(event.victimId, this.moments.hurt(event));
        // the cleanest contact there is: a short chink over the blow (mine, or on me; others' a little, from where
        // it landed), never more than one at a time
        if (event.clean && event.source !== 'burn') this.#precise(event);
        // a blow on hardened plate clangs and sparks instead (#steelStruck); otherwise, mine flashes the view red
        // (a ram on hardened plate rings in its own sound: #steelRam)
        const plated = event.source === 'ram' ? (event.steel ?? 0) >= 0.02 : this.#steelStruck(event);
        if (event.victimId === this.socket.playerId && this.view.damageFlash && !plated && event.amount > 0 && event.source !== 'abyss') {
          // (the side it came from: the push runs away from whoever struck)
          const push = this.#pushTowardMe(event.attackerId);
          this.hud.hurt?.({ amount: event.amount, side: -push.x });
        }
      }
      if (event.type === 'death') {
        this.#deathEvent(event);
        // whatever the fallen was saying stops there, and its caption fades (their fall may have words of its own)
        this.voice?.cut?.(event.victimId, 0.12);
        this.#deathVoice(event);
      }
      if (event.type === 'respawn' && event.playerId === this.socket.playerId) this.hud.flashText('FIGHT!', 'ready');
      // a life begun again (the wildcard is once a life); a new match forgets everything
      if (event.type === 'respawn') this.voice?.director?.newLife?.(event.playerId);
      // back on my feet: whatever case I was still making for not having fallen is cut short (at its last word, if
      // that is only a moment away)
      if (event.type === 'respawn' && event.playerId === me && this.appealing) {
        const wait = this.appealing.interruptAt - performance.now() / 1000;
        this.appealing = null;
        clearTimeout(this.appealCut);
        if (wait > 0 && wait <= APPEAL.runOnSec) this.appealCut = setTimeout(() => this.voice?.cut?.(me), wait * 1000);
        else this.voice?.cut?.(me);
      }
      if (event.type === 'matchStarted') {
        this.moments.reset();
        this.scenes.reset();
        this.watch.reset();
        this.chivalrous.clear();
        this.chivalryEndedAt.clear();
        this.voice?.director?.newLife?.();
        // a battle begins (any match but the yard): now and then a knight certifies the result in advance (one
        // sentence at a time: the first to pass its odds speaks for the field)
        const knights = (this.latestSnapshot?.players ?? []).filter((p) => p.actorKind !== 'dummy');
        if (!this.#inPractice() && knights.length >= 2) for (const knight of knights) this.#sayMoment(knight.id, ['battleBegins']);
      }
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
    const present = new Set(snapshot.players.map((player) => player.id));
    for (const id of this.effects.chilledBodies.keys()) if (!present.has(id)) this.effects.afflict(id, null);
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
  #say(line, playerId, { chanceScale = 1, delay = 0, force = false, cry = false, earned = false, opening = false, part = null } = {}) {
    if (!this.voice || !playerId) return false;
    if (playerId === this.socket.playerId) return this.voice.say(line, { speaker: playerId, gain: 0.8, chanceScale, delay, close: true, force, cry, earned, opening, part });
    const body = this.#bodyPosition(playerId);
    const snapshotPlayer = this.latestSnapshot?.players.find((p) => p.id === playerId);
    if (!body || snapshotPlayer?.actorKind === 'dummy') return false;
    const listener = this.localState?.position ?? this.localAuth?.position;
    // only within earshot: his words carry across a duel, his breath only to those around him (voiceRules hearingFor)
    const place = voicePlacement(listener, this.input.yaw, body, hearingFor(line));
    if (!place) return false;
    return this.voice.say(line, { speaker: playerId, pan: place.pan, gain: place.gain * 0.9, reverb: place.reverb, rate: voiceRate(playerId), chanceScale, delay, force, cry, earned, opening, part });
  }

  // another knight's line follows him while he says it (a charge begun a dozen metres off arrives with him)
  #placeVoices() {
    const bank = this.voice;
    const listener = this.localState?.position ?? this.localAuth?.position;
    if (!bank?.playing?.size || !listener) return;
    for (const speaker of bank.playing.keys()) {
      if (speaker === this.socket.playerId) continue;
      const line = bank.speakingLine?.(speaker);
      const body = line ? this.#bodyPosition(speaker) : null;
      if (!body) continue;
      const place = voicePlacement(listener, this.input.yaw, body, hearingFor(line));
      bank.place(speaker, { pan: place?.pan ?? 0, gain: (place?.gain ?? 0) * 0.9 });
    }
  }

  // the living knight nearest `id`, within `reach` metres (their id), or null
  #nearestFoe(id, reach) {
    const from = this.#bodyPosition(id);
    if (!from) return null;
    let best = null;
    for (const player of this.latestSnapshot?.players ?? []) {
      if (player.id === id || player.alive === false) continue;
      const at = this.#bodyPosition(player.id);
      const distance = at ? Math.hypot(at.x - from.x, at.z - from.z) : Infinity;
      if (distance <= reach && (!best || distance < best.distance)) best = { id: player.id, distance };
    }
    return best?.id ?? null;
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
      const view = this.effects.galeBlast(event.origin, event.direction, spell.cone, this.#groundUnder());
      (this.gustViews ??= []).push({ view, ownerId: event.playerId });
      this.#play(galeReleaseRecipe(), mine ? null : event.origin, mine ? 1 : 0.9);
      if (mine && event.recoil && this.localState) launchBody(this.localState, event.recoil, event.recoil.maxUp);
    }
    this.#galeCaught(event);
  }

  // a gust catching knights (as it leaves the hand, or a moment later, still blowing): my body goes with it at once
  // and the view is buffeted; others are shoved and their cloth flung; now and then a word from whoever loosed it
  #galeCaught(event) {
    const me = this.socket.playerId;
    for (const caught of event.affected ?? []) {
      if (caught.id === me) {
        // the gust hits me: my body goes with it at once, and the view is buffeted; and while its wind carries me on,
        // my steps take the host's push as it comes (onSnapshot), so being carried is smooth
        if (this.localState && caught.shove) shoveBody(this.localState, caught.shove);
        this.windOnMeUntil = Math.max(this.windOnMeUntil ?? -Infinity, event.at + (spellFor(event.spell).cone?.lastsSec ?? 0) + 0.15);
        this.weapon.damage(this.#pushTowardMe(event.playerId), 6 * caught.pressure);
      } else {
        this.remotePlayers.gust(caught.id, caught.shove);
      }
    }
    // the gale's jibe (only after a gust that really moved someone, likelier the harder it threw them), the thrown,
    // and anyone it rescued
    this.#sayMoments(this.moments.galeCaught(event, this.#voiceWorld()), event.at);
  }

  // the precise ring of the cleanest contact, over the blow's own sound (a cluster of them is one ring)
  #precise(event) {
    const now = performance.now() / 1000;
    if (now - (this.preciseAt ?? -Infinity) < 0.2) return;
    this.preciseAt = now;
    const me = this.socket.playerId;
    const involved = event.attackerId === me || event.victimId === me;
    this.#play(preciseRecipe(), involved ? null : this.#bodyPosition(event.victimId), involved ? (event.attackerId === me ? 0.9 : 0.55) : 0.35);
  }

  // a blow landing on Sheathed in Steel: the plate clangs as hard as it still is (a bright KLANG fresh, a TANG and a
  // scrape half worn, a dull clunk nearly gone) and throws sparks to match; on my own plate the clang is punchier, the
  // sparks fly up across the view and the health bar's frame flashes. One full clang per blow: a second within its
  // ring only ticks, and a burn's licks make none. Whether it was shown (the red flash is not, then).
  #steelStruck(event) {
    const now = performance.now() / 1000;
    const clangs = (this.steelClangAt ??= new Map());
    const feel = steelHitFeel(event, { lastClangAt: clangs.get(event.victimId) ?? -Infinity, now });
    if (!feel) return false;
    const mine = event.victimId === this.socket.playerId;
    const body = this.#bodyPosition(event.victimId);
    const attacker = this.#bodyPosition(event.attackerId);
    if (feel.full) {
      clangs.set(event.victimId, now);
      this.#play(steelClangRecipe(Math.random, { strength: feel.strength, local: mine }), mine ? null : body, mine ? 1 : 0.85);
    } else {
      this.#play(steelTickRecipe(Math.random, { strength: feel.strength }), mine ? null : body, mine ? 0.8 : 0.6);
    }
    if (mine) {
      this.hud.steelStruck?.({ strength: feel.strength, turned: event.turned ?? 0, full: feel.full, health: event.health });
      if (attacker && body) this.effects.steelSparksInView({ x: attacker.x - body.x, z: attacker.z - body.z }, feel.strength);
      if (this.view.damageFlash && feel.full) {
        document.body.style.setProperty('--steel-hit', feel.strength.toFixed(2));
        document.body.classList.add('took-steel');
        setTimeout(() => document.body.classList.remove('took-steel'), 110);
      }
    } else if (body) {
      const point = impactPoint(body, attacker);
      if (point) this.effects.steelGlint(point, blowDirection(body, attacker), { strength: feel.strength * (feel.full ? 1 : 0.4) });
    }
    return true;
  }

  // the gauntlet, thrown from my own hand on command (the local rule: the sword does not have the hand): the magic
  // hand drives out at once, with a grunt, whether or not anyone is there to meet it
  #tryLocalJab(now) {
    const auth = this.localAuth;
    if (!this.localState || (auth.staggerUntil ?? -Infinity) > now || auth.pendingSpell || handsTaken(auth, now)) return false;
    if (!this.weapon.canJab()) return false;
    this.weapon.jab();
    this.#play(gauntletSwingRecipe(), null, 0.8);
    this.#sayMoment(this.socket.playerId, ['gauntletThrow']);
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
    this.#sayMoment(event.playerId, ['gauntletThrow']);
  }

  // the gauntlet lands: a knock on a guard, or a thud into plate; and, rarely, a word from the one who threw it (the
  // rebuttal first, to a foe who has just spoken and is left low enough for a gauntlet to finish)
  // my Steel dash meeting someone, as I see them: stopped dead there and set back (as the host will have it), with its
  // KLANG, its sparks and the jolt at once. The host's word on it follows (#steelRam) and is not played twice
  #foretellRam(from, serverNow) {
    const players = this.latestSnapshot?.players ?? [];
    const bodies = this.#chargeable(serverNow);
    const met = ramContact(from, this.localState.position, bodies);
    if (!met) return;
    const target = bodies.find((body) => body.id === met.id);
    const start = [met.at.x, met.at.y + POSTURES.standing.center, met.at.z];
    const end = [target.position.x, target.position.y + POSTURES.standing.center, target.position.z];
    if ((this.activeWorld?.solids ?? []).some((box) => segmentAabbHit(start, end, box))) return;
    const dash = { ...this.localState.dashDir };
    this.localState.position = { ...this.localState.position, x: met.at.x, z: met.at.z };
    this.localState.dashUntil = serverNow;
    this.localState.velocity.x = 0;
    this.localState.velocity.z = 0;
    shoveBody(this.localState, { x: -dash.x * STEEL_RAM.setback, z: -dash.z * STEEL_RAM.setback });
    const { strength } = this.localRam;
    this.localRam = { strength, armed: false, at: serverNow, targetId: met.id };
    // what it met, as I can see it: a guard turned to me, or hardened plate
    const foe = players.find((p) => p.id === met.id);
    const toMeX = met.at.x - target.position.x;
    const toMeZ = met.at.z - target.position.z;
    const facing = Number.isFinite(foe?.yaw) && (-Math.sin(foe.yaw) * toMeX - Math.cos(foe.yaw) * toMeZ) / (Math.hypot(toMeX, toMeZ) || 1) >= Math.cos((115 * Math.PI / 180) / 2);
    const kind = foe?.guarding && facing ? 'guard' : steelStrength(foe?.steel, serverNow) >= 0.15 ? 'steel' : 'body';
    const point = { x: met.at.x + met.normal.x * STEEL_RAM.reach * 0.5, y: Math.max(met.at.y, target.position.y) + 1.15, z: met.at.z + met.normal.z * STEEL_RAM.reach * 0.5 };
    this.#rammed({ mine: true, strength, kind, point, direction: dash, targetPosition: target.position });
  }

  // the knights a Steel dash of mine could meet, where I see them: the living, none just risen (as the host has it)
  #chargeable(serverNow) {
    const players = this.latestSnapshot?.players ?? [];
    return this.remotePlayers.bodies()
      .filter((body) => {
        const player = players.find((p) => p.id === body.id);
        return player && player.alive !== false && !((player.spawnProtectionUntil ?? 0) > serverNow);
      })
      .map((body) => ({ id: body.id, position: { x: body.x, y: body.y, z: body.z } }));
  }

  // a Steel dash ram landed (steelRam.mjs): its THUNK, KLANG and rattle from where the two met, sparks there and dust
  // from under their feet; the rammer jolts to a stop, the one rammed is knocked through their own view. Mine was
  // foreseen as it landed (#foretellRam), so the host's word only confirms it
  #steelRam(event) {
    const me = this.socket.playerId;
    const kind = event.guarded ? 'guard' : (event.steel ?? 0) >= 0.15 ? 'steel' : 'body';
    if (event.playerId === me) {
      const foretold = Number.isFinite(this.localRam?.at) && Math.abs(event.at - this.localRam.at) < 0.45;
      if (!foretold) {
        // (not foreseen: my dash stops now that the host has said so)
        if (this.localState) {
          this.localState.dashUntil = Math.min(this.localState.dashUntil ?? -Infinity, this.socket.serverNow());
          shoveBody(this.localState, { x: -event.direction.x * STEEL_RAM.setback, z: -event.direction.z * STEEL_RAM.setback });
        }
        this.#rammed({ mine: true, strength: event.strength, kind, broken: event.guardBroken, point: event.point, direction: event.direction, targetPosition: this.#bodyPosition(event.targetId) });
      }
      this.localRam = null;
      // (a guard braced against it: the reticle says it met, more dully than a blow; a blow says so itself)
      if (event.guarded) this.hud.hit('glance');
      return;
    }
    this.#rammed({
      mine: false, onMe: event.targetId === me, event, strength: event.strength, kind, broken: event.guardBroken,
      point: event.point, direction: event.direction, targetPosition: this.#bodyPosition(event.targetId),
    });
  }

  #rammed({ mine, onMe = false, event = null, strength, kind, broken = false, point, direction, targetPosition }) {
    const heard = mine ? 'rammer' : onMe ? 'victim' : 'near';
    this.#play(steelRamRecipe(Math.random, { strength, kind, broken, heard }), mine || onMe ? null : point, mine || onMe ? 1 : 0.95);
    // the dust kicked from under them: only with their feet on the ground
    const ground = targetPosition && this.activeWorld ? surfaceHeightAt(targetPosition.x, targetPosition.z, targetPosition.y + 0.3, this.activeWorld) : null;
    const feet = targetPosition && ground !== null && Math.abs(targetPosition.y - ground) < 0.08 ? { x: targetPosition.x, y: ground, z: targetPosition.z } : null;
    if (!onMe && point) this.effects.steelRam(point, direction, { strength, feet, steel: kind === 'steel', close: mine });
    if (mine) {
      // the stop, felt: the arms jolt and hold a beat (only the arms: nothing waits), the view kicks, sparks across the
      // bottom of it, and my plate flashes
      this.weapon.hitstop(0.06, 0.85);
      this.cameraKick = Math.max(this.cameraKick, 0.06 + 0.06 * strength);
      this.effects.steelSparksInView(direction, strength);
      this.steelFlashAt = this.socket.serverNow();
      return;
    }
    if (!onMe) return;
    // rammed: knocked through my own view (harder than its blow alone), or braced into my guard and pushed back
    if (event.guarded) {
      this.weapon.block(Boolean(event.guardBroken));
      if (this.localState && event.push) shoveBody(this.localState, event.push);
    } else {
      this.weapon.damage(this.#pushTowardMe(event.playerId), 30 + 14 * strength);
    }
    this.effects.steelSparksInView({ x: -direction.x, z: -direction.z }, strength * (kind === 'steel' ? 1 : 0.5));
    if (kind === 'steel') this.steelFlashAt = this.socket.serverNow();
  }

  #gauntletHit(event) {
    const me = this.socket.playerId;
    const involved = event.playerId === me || event.targetId === me;
    const body = this.#bodyPosition(event.targetId);
    // (a fist on my own hardened plate is its clang alone: #steelStruck)
    if (!(event.targetId === me && event.steel >= 0.02)) {
      this.#play(gauntletHitRecipe(Math.random, { guarded: event.guarded }), involved ? null : body, involved ? 0.95 : 0.7);
    }
    if (event.targetId === me && !event.guarded) this.cameraKick = Math.max(this.cameraKick, 0.05);
    if (event.guarded) return;
    const foe = this.latestSnapshot?.players.find((p) => p.id === event.targetId);
    const foeSpokeAgo = this.voice?.director?.sentenceAgo?.(event.targetId, this.voice.engine.now) ?? Infinity;
    // (the blow's own damage word came just before, with the health it left: the snapshot may lag behind it)
    const foeHealth = this.healthAfterBlow?.get(event.targetId) ?? foe?.health ?? 100;
    this.#sayMoment(event.playerId, gauntletMoment({ foeSpokeAgo, foeHealth }));
  }

  // the ground a gust runs over, for what it blows off it: its height and what it is made of
  #groundUnder() {
    const world = this.activeWorld;
    if (!world) return {};
    return { groundAt: (x, z, y) => surfaceHeightAt(x, z, y, world), surfaceAt: (x, z, y) => surfaceAt(world, x, z, y) };
  }

  // my own Gale lets go where I aim as it goes: seen and heard at once, and its throw off the ground felt at once (the
  // server does the same)
  #releaseLocalGale(serverNow) {
    const gale = this.localGale;
    this.localGale = null;
    this.localGaleAt = serverNow;
    if (!this.localState || !gale.spell.cone) return;
    const d = this.input.lookDirection();
    const eye = { x: this.localState.position.x, y: this.localState.position.y + postureOf(this.localState).eye, z: this.localState.position.z };
    const view = this.effects.galeBlast(this.#gustOrigin(null, eye, d), d, gale.spell.cone, this.#groundUnder());
    (this.gustViews ??= []).push({ view, ownerId: this.socket.playerId });
    this.#play(galeReleaseRecipe(), null, 1);
    const recoil = galeRecoil(gale.spell, eye, d, this.activeWorld);
    if (recoil) launchBody(this.localState, recoil, recoil.maxUp);
  }

  // where a gust leaves a knight: my own from the magic hand's palm as the view draws it; another's a little in front
  // of their eyes along their aim
  #gustOrigin(id, eye, direction) {
    const palm = id === null ? this.weapon.palmPosition?.() : null;
    if (palm) return { x: palm.x + direction.x * 0.15, y: palm.y + direction.y * 0.15, z: palm.z + direction.z * 0.15 };
    return { x: eye.x + direction.x * 0.35, y: eye.y + direction.y * 0.35, z: eye.z + direction.z * 0.35 };
  }

  // the gusts still blowing stay at their casters' hands and turn with their aim
  #followGusts() {
    if (!this.gustViews?.length) return;
    const me = this.socket.playerId;
    this.gustViews = this.gustViews.filter((entry) => entry.view?.alive);
    for (const { view, ownerId } of this.gustViews) {
      if (ownerId === me) {
        if (!this.localState) continue;
        const d = this.input.lookDirection();
        const eye = { x: this.localState.position.x, y: this.localState.position.y + postureOf(this.localState).eye, z: this.localState.position.z };
        view.follow(this.#gustOrigin(null, eye, d), d);
        continue;
      }
      const body = this.remotePlayers.bodyAim?.(ownerId);
      if (!body) continue;
      const d = { x: -Math.sin(body.yaw) * Math.cos(body.pitch), y: Math.sin(body.pitch), z: -Math.cos(body.yaw) * Math.cos(body.pitch) };
      const eye = { x: body.x, y: body.y + (body.crouched ? POSTURES.crouched.eye : POSTURES.standing.eye), z: body.z };
      view.follow(this.#gustOrigin(ownerId, eye, d), d);
    }
  }

  // the fallen may protest (magic they do not believe in, or that they are a knight); if they keep quiet, whoever
  // felled them may have a word over the body
  #deathVoice(event) {
    const blow = this.killingBlow?.get(event.victimId) ?? null;
    this.killingBlow?.delete(event.victimId);
    // (his longer scenes first: a plan the fallen had announced, a verdict or a sentence the victor has words for)
    const scene = this.scenes.death(event);
    // what was watched of it: the fallen had rushed the victor, led the match, fought them fairly, fell in Chivalry
    const { victimId, at } = event;
    const killerId = event.killerId && event.killerId !== victimId ? event.killerId : null;
    const players = this.latestSnapshot?.players ?? [];
    const kills = (id) => players.find((p) => p.id === id)?.kills ?? 0;
    const victimKills = kills(victimId);
    const extra = {
      rushed: Boolean(killerId) && this.watch.rushed(victimId, killerId, at),
      fair: Boolean(killerId) && this.watch.fair(victimId, killerId, at, event.source),
      leader: Boolean(killerId) && victimKills >= 3 && players.every((p) => p.id === victimId || (p.kills ?? 0) < victimKills),
      chivalry: this.chivalrous.has(victimId) || Math.abs((this.chivalryEndedAt.get(victimId) ?? -Infinity) - at) < 1e-6,
    };
    this.chivalrous.delete(victimId);
    this.watch.death(victimId);
    const { fallen, victor, rescued } = this.moments.death(event, { ...this.#voiceWorld(), blow, practice: this.#inPractice(), planFailed: scene.planFailed, extra });
    const spoke = fallen.some((say) => this.#say(say.line, say.speaker, say));
    if (!spoke && !scene.victor) this.#sayMoments([victor], event.at);
    this.#sayMoments(rescued, event.at);
    // nothing said of my own fall: now and then, I make my case late, and my return cuts it short ("Three—")
    if (!spoke && victimId === this.socket.playerId) this.#appeal(event);
  }

  // my case for not having fallen, timed so that I am back on my feet as its last word begins (APPEAL)
  #appeal(event) {
    const length = this.voice?.takes?.get('notFall')?.[0]?.duration;
    const respawnIn = (event.respawnAt ?? event.at) - this.socket.serverNow();
    if (!length || !(respawnIn > 1)) return;
    const delay = Math.max(APPEAL.leadSec, respawnIn - (length - APPEAL.interruptBeforeEnd));
    for (const say of linesFor(this.socket.playerId, ['appeal'])) {
      const said = this.#say(say.line, say.speaker, { ...say, delay });
      if (said) this.appealing = { interruptAt: performance.now() / 1000 + said.delay + said.seconds - APPEAL.interruptBeforeEnd };
    }
  }

  // moments the watch has seen ([{ speaker, tags }]), raised as any other
  #sayWatched(list) {
    for (const moment of list) this.#sayMoment(moment.speaker, moment.tags);
  }

  // a line said, written out at the foot of the view: another knight's with his name, my own without
  #subtitle({ line, speaker, delay = 0, seconds = 2, part = null }) {
    if (!this.view.subtitles) return;
    const text = subtitleFor(line, part);
    if (!text) return;
    const mine = speaker === this.socket.playerId;
    const name = mine ? null : (this.latestSnapshot?.players.find((p) => p.id === speaker)?.name ?? 'A Spellblade');
    this.hud.subtitle({ text, name, delay, seconds, speaker });
  }

  // a Vortex's blade clipping the world as it comes round: the ring of what it clipped and sparks off it (lighter
  // than a blade stopped dead: nothing is stopped), no jolt in the arms and no word on the screen
  #vortexWorld({ playerId, point, material }) {
    const mine = playerId === this.socket.playerId;
    const surface = strikeSurface(material);
    const recipe = surface === 'wood' ? woodThunkRecipe() : surface === 'soft' ? softStrikeRecipe() : vortexScrapeRecipe();
    if (surface === 'stone') this.effects.sparks(point, 0xffc070, mine ? 10 : 7);
    else if (surface === 'wood') this.effects.splinters(point, mine ? 7 : 5);
    this.#play(recipe, point, mine ? 0.7 : 0.5);
  }

  // a Sundering blow ended what a knight was doing. Mine: my arms let go of it as the host has (the sword's chain,
  // the spell in the palm, the dash, the sprint's speed), and I am told
  #cutShort(event) {
    if (event.playerId !== this.socket.playerId) return;
    const what = event.what ?? [];
    if (what.includes('sword')) this.weapon.cancelAttack();
    if (what.includes('spell')) {
      this.weapon.cancelCast();
      this.localGale = null;
    }
    if (this.localState) {
      if (what.includes('dash')) this.localState.dashUntil = Math.min(this.localState.dashUntil ?? -Infinity, this.socket.serverNow());
      if (what.includes('sprint')) { this.localState.sprinting = false; this.localState.sprintBlend = 0; }
    }
    // (an ultimate broken off says so itself: ultimateInterrupted)
    if (what.some((kind) => kind !== 'ultimate' && kind !== 'sprint')) this.hud.flashText('INTERRUPTED', 'danger');
  }

  // a blade stopped by the world: stone rings and sparks, timber thunks and splinters, a hedge or cloth only takes it.
  // mine: my own blade (the jolt in the arms, the flash, the view's kick)
  #worldClang({ point, material }, mine) {
    const surface = strikeSurface(material);
    const recipe = surface === 'wood' ? woodThunkRecipe() : surface === 'soft' ? softStrikeRecipe() : wallClangRecipe();
    if (mine) {
      this.weapon.clang();
      if (surface === 'stone') this.hud.flashText('CLANG!', 'metal');
      this.cameraKick = Math.max(this.cameraKick, surface === 'soft' ? 0.05 : 0.13);
    }
    if (surface === 'stone') {
      if (mine) this.effects.wallClang(point);
      else this.effects.sparks(point, 0xffd48a, 8);
    } else if (surface === 'wood') {
      this.effects.splinters(point, mine ? 12 : 7);
    }
    this.#play(recipe, mine ? null : point, mine ? 0.9 : 0.5);
  }

  // my own swing, judged in my own view as the server will judge it (localBladeSweep.mjs): what it rings off is heard
  // and felt now, at its contact, not a round trip later when the sword is already swinging away
  #foretellClang(timeSec) {
    const struck = this.bladeSweep.step(timeSec, {
      chain: this.weapon.swordChain.chain,
      slam: Boolean(this.weapon.sunderActive),
      body: this.localState,
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      bodies: this.remotePlayers.bodies(),
      solids: this.activeWorld?.solids ?? [],
    });
    if (!struck) return;
    this.foretoldClangAt = performance.now();
    this.#worldClang({ point: struck.point, material: struck.solid.material ?? 'stone' }, true);
  }

  // what the voice's moments need to know of the knights (voiceMoments.mjs)
  #voiceWorld() {
    const players = this.latestSnapshot?.players ?? [];
    return {
      knight: (id) => players.find((p) => p.id === id) ?? null,
      positionOf: (id) => this.#bodyPosition(id),
      // how long ago a knight said a line (the voice's own clock), for lines that must keep apart
      saidAgo: (speaker, line) => (this.voice?.engine?.now ?? 0) - (this.voice?.director?.lastLine?.get(`${speaker}:${line}`) ?? -Infinity),
      // whether a knight's plate was still hardened (Sheathe in Steel) at a moment
      steeled: (id, at) => steelStrength(players.find((p) => p.id === id)?.steel, at) > 0,
    };
  }

  /**
   * Why each line is or is not heard this session (with `?debug`: console.table(__ssRuntime.voiceReport())): how often
   * its moments came, how often it was tried, how often said (voiceMoments.mjs report).
   */
  voiceReport() {
    return this.moments.report({ recorded: (line) => this.voice?.has?.(line), stats: this.voice?.director?.stats });
  }

  // a moment a knight is in, by its tags (voiceLines.mjs: the lines subscribe to the moments): of the lines that
  // belong to it, the first that is said is the only one
  #sayMoment(speaker, tags, options) {
    if (!this.voice || !speaker) return;
    this.#sayMoments([this.moments.lines(speaker, tags, options)], this.socket.serverNow());
  }

  // each group of lines: the first that is said is the only one (a squire's question asked opens its window)
  #sayMoments(groups, at) {
    for (const group of groups) {
      for (const say of group) {
        const said = this.#say(say.line, say.speaker, say);
        if (!said) continue;
        if (say.opens === 'squire') this.moments.squireAsked(say.speaker, at, this.#bodyPosition(say.speaker));
        // (the final duel declared: his foe answers, and the scene goes on from there)
        if (say.opens === 'finalDuel') this.scenes.duelDeclared(say.speaker, this.moments.duelFoe(say.speaker), at, (said.delay ?? 0) + (said.seconds ?? 0));
        break;
      }
    }
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
  // the Practice Yard (abilities come back after a short gate: practiceRecast.mjs)
  #inPractice() {
    return this.latestSnapshot?.mode === 'PRACTICE';
  }

  #play(recipe, source = null, gain = 1, delay = 0) {
    if (!this.sound) return;
    const listener = this.localState?.position ?? this.localAuth?.position;
    const place = source ? spatialize(listener, this.input.yaw, source) : { pan: 0, gain: 1 };
    this.sound.play(recipe, { pan: place.pan, gain: place.gain * gain, delay });
  }

  // a knight braces into Sunder: the harness drawn tight, and the cry; mine names it
  #ultimateStart(event) {
    const me = event.playerId === this.socket.playerId;
    // a Blazing Vortex is lit, not braced into: the breath drawn up into flame through its startup, and no cry
    if (event.ultimate === 'vortex') {
      this.#play(vortexIgniteRecipe(Math.random, { seconds: ULTIMATES.vortex.startupSec }), me ? null : this.#bodyPosition(event.playerId), me ? 0.9 : 0.7);
      if (me) {
        // (its small hop: the host has thrown me up already, and my own steps follow at once)
        if (event.hop && this.localState?.grounded) {
          this.localState.velocity.y = event.hop;
          this.localState.grounded = false;
        }
        // its name, and under it (for this once) how it is steered; after that the tile says what it is doing
        this.hud.flashText('BLAZING VORTEX', 'vortex', 1900, vortexHint({ touch: Boolean(this.touch), bindings: this.input.bindings }));
      }
      return;
    }
    if (event.ultimate === 'chivalry') {
      const cry = cryMoment(event.ultimate);
      if (cry) this.#sayMoment(event.playerId, [cry]);
      if (me) this.hud.flashText('SPELLS & CHIVALRY', 'chivalry', 1400);
      return;
    }
    this.#play(sunderDropRecipe(), me ? null : this.#bodyPosition(event.playerId), me ? 1 : 0.8);
    // my arms brace (already, if I pressed for it): when it ends is the host's to say
    if (me) {
      this.weapon.brace(performance.now() / 1000 + (event.commitAt - this.socket.serverNow()));
      this.braceAskedAt = null;
    }
    // its cry: most times its own, now and then MIGHT MAKES... KNIGHT! (voiceRules ULTIMATE_CRIES)
    const cry = cryMoment(event.ultimate);
    if (cry) this.#sayMoment(event.playerId, [cry]);
    if (me) {
      this.hud.flashText('SUNDER ALL THAT RUSTS', 'sunder', 1400);
      this.cameraKick = Math.max(this.cameraKick, 0.08);
    }
  }

  // my own Blazing Vortex in my arms, each frame (fpVortex.mjs): the startup, then the blade going round as the host's
  // goes round; and the beat of it, once a turn, as the blade comes in on my right
  #spin(serverNow) {
    const me = this.localAuth;
    const state = me?.alive && me.ultimateState?.id === 'vortex' ? me.ultimateState : null;
    const vortex = ULTIMATES.vortex;
    let view = null;
    if (state && serverNow < state.commitAt) {
      view = { phase: 'startup', share: 1 - (state.commitAt - serverNow) / vortex.startupSec, windup: vortexWindup(state, serverNow) };
      this.spinFrom = null;
      this.spinTurn = null;
    } else if (state && serverNow < (state.until ?? state.commitAt + vortex.activeSec)) {
      // (until the host has said where its blade is, it started round from where I faced, balanced)
      this.spinFrom ??= this.input.yaw;
      const known = Number.isFinite(state.angle) ? state : { angle: this.spinFrom, angleAt: state.commitAt, rate: 2 * Math.PI * vortex.balanced.revPerSec };
      const rel = vortexAngle(known, serverNow) - this.input.yaw;
      view = { phase: 'active', rel };
      const turn = Math.floor((rel + Math.PI / 2) / (2 * Math.PI));
      if (turn !== this.spinTurn) {
        this.spinTurn = turn;
        this.#play(vortexWhooshRecipe(Math.random, { rate: known.rate }), null, 0.8);
      }
    } else {
      this.spinFrom = null;
      this.spinTurn = null;
    }
    this.weapon.setVortex(view);
  }

  // a Vortex's blade biting a knight as it comes round: sparks and fire where it met them, and the cut heard
  #vortexHit(event) {
    const me = this.socket.playerId;
    const attacker = this.#bodyPosition(event.playerId);
    const victim = this.#bodyPosition(event.targetId);
    const point = event.point ?? impactPoint(victim, attacker);
    if (event.targetId !== me && point) {
      this.effects.hitBurst(point, blowDirection(victim, attacker), { strike: 0, quality: 1 });
      this.effects.sparks(point, 0xffa040, 8);
      this.remotePlayers.flashHit(event.targetId);
    }
    if (event.playerId === me) {
      this.cameraKick = Math.max(this.cameraKick, 0.03);
      this.#play(vortexCutRecipe(), null, 0.9);
    } else if (event.targetId === me) {
      // (on hardened plate, the clang is the whole of it: #steelStruck)
      if (!(event.steel >= 0.02)) this.#play(hurtRecipe(Math.random, { heavy: false, amount: ULTIMATES.vortex.contact.damage }), null, 1);
    } else {
      this.#play(vortexCutRecipe(), point, 0.75);
    }
  }

  // a knight's balance broken: plate clattering as they stumble; mine lurches and says so
  #staggerBreak(event) {
    const me = event.playerId === this.socket.playerId;
    this.#play(staggerBreakRecipe(), me ? null : this.#bodyPosition(event.playerId), me ? 1 : 0.8);
    if (me) {
      this.hud.flashText('STAGGERED', 'danger');
      this.weapon.damage({ x: 0, z: 1 }, 45);
      this.cameraKick = Math.max(this.cameraKick, 0.16);
    }
  }

  // my condition, each frame: Sundering (the heat in my sword) and how far off balance I am (the arms sway; near the
  // break, the harness strains, heard)
  #showCondition(serverNow) {
    const me = this.localAuth;
    if (!me) return;
    const sunder = me.ultimateState?.id === 'sunder' && me.ultimateState.phase === 'active' && serverNow < (me.ultimateState.until ?? 0);
    const level = (me.stagger?.level ?? 0) / STAGGER.max;
    // (dizzy for a moment after a Vortex: strongest as it ends, gone by the end of it)
    const dizzy = me.alive ? Math.max(0, Math.min(1, ((me.dizzyUntil ?? -Infinity) - serverNow) / ULTIMATES.vortex.dizzySec)) : 0;
    this.weapon.setCondition({ sunder, unsteady: Math.max(0, (level - 0.4) / 0.6), dizzy });
    const recovering = (me.stagger?.recoverUntil ?? -Infinity) > serverNow;
    if (me.alive && level >= 0.72 && !recovering && serverNow >= (this.strainAt ?? -Infinity)) {
      this.strainAt = serverNow + 0.7;
      this.#play(staggerStrainRecipe(), null, 0.75);
    }
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
    // a Sundering blow: its weight made felt and seen (a deep whump under the hit, heavier sparks and a shock ring)
    if (event.level === 'elevated') {
      const mine = event.playerId === me || event.targetId === me;
      this.#play(sunderForceRecipe(), mine ? null : point, mine ? 1 : 0.8);
      // and the iron rings: the bell of it is for a knight struck, never the bare ground
      this.#play(sunderRingRecipe(), mine ? null : point, mine ? 0.9 : 0.75);
      if (point) this.effects.sunderStrike(point, blowDirection(victim, attacker));
      if (event.targetId === me) this.cameraKick = Math.max(this.cameraKick, 0.14);
    }
    if (event.playerId === me) {
      this.hud.hit(glancing(quality) ? 'glance' : 'hit');
      this.weapon.hitstop(hitstopSeconds({ strike, quality }), hitKick({ strike, quality }));
      this.#play(swordHitRecipe(Math.random, { strike, quality, impact }), null, 1);
    } else if (event.targetId === me) {
      // (on hardened plate, the clang is the whole of it: #steelStruck)
      if (!(event.steel >= 0.02)) {
        this.#play(hurtRecipe(Math.random, { heavy: strike >= 2 || impact > 0.5, amount: swordDamageFor(quality) }), null, 1);
      }
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
    // (a guard a ram broke caves in within the ram's own sound and sparks: #steelRam)
    if (point && event.defenderId !== me && !event.ram) {
      this.effects.blockBurst({ ...point, y: point.y + 0.15 }, blowDirection(defender, attacker), { heavy, parry });
    }
    const recipe = parry ? parryRecipe() : heavy ? guardBreakRecipe() : blockRecipe();
    const involved = event.attackerId === me || event.defenderId === me;
    if (!event.ram) this.#play(recipe, involved ? null : point, involved ? 1 : 0.8);
    // a Sundering blow lands on a guard as two: CLANG-CLANG, the weight of it under both
    if ((event.impacts ?? 1) >= 2) {
      this.#play(blockRecipe(Math.random, { heavy: true }), involved ? null : point, involved ? 1 : 0.8, 0.09);
      this.#play(sunderForceRecipe(), involved ? null : point, involved ? 0.9 : 0.7);
      if (point && event.defenderId !== me) setTimeout(() => this.effects.blockBurst({ ...point, y: point.y + 0.15 }, blowDirection(defender, attacker), { heavy: true }), 90);
      if (event.defenderId === me) this.cameraKick = Math.max(this.cameraKick, 0.12);
    }
    // the one who broke it may gloat, once the crunch has landed
    if (heavy) this.#sayMoments(this.moments.guardBreak(event), event.at);
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
    else if (event.source === 'vortex' && killer) this.hud.addFeed(`${killer.name} spun through ${victim?.name ?? 'someone'}`, 'fire');
    else if (spellFor(event.source).conjured && spellFor(event.source).id === event.source && killer) this.hud.addFeed(`${killer.name} scorched ${victim?.name ?? 'someone'}`, 'fire');
    else if (event.source === 'gauntlet' && killer) this.hud.addFeed(`${killer.name} laid ${victim?.name ?? 'someone'} low with a gauntlet`, 'sword');
    else if (event.source === 'ram' && killer) this.hud.addFeed(`${killer.name} ran ${victim?.name ?? 'someone'} down in Steel`, 'sword');
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

  // the view is in the helm (fallen, or between matches): no chase, and my own body is not drawn
  #viewInHelm(nowMs, dt) {
    if (!this.chase && !this.remotePlayers.self?.root.visible) return;
    this.chase = 0;
    this.chaseOut = 0;
    this.chaseAim = null;
    this.remotePlayers.showSelf(this.localAuth, null, this.socket.serverNow(), nowMs, dt, false);
  }

  #frame(nowMs) {
    if (!this.running) return;
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameAt) / 1000));
    this.lastFrameAt = nowMs;
    this.fps += ((1 / dt) - this.fps) * 0.05;
    const timeSec = nowMs / 1000;

    if (this.localAuth) {
      const now = this.socket.serverNow();
      this.input.updatePreparedSpells?.(this.localAuth, now);
      this.weapon.setCombatPolicy(combatActionPolicy(this.localAuth, now), this.localAuth, now);
      this.#spin(now);
    }
    // (a brace begun on my own key that the host never took: the arms are let down again)
    if (this.braceAskedAt && nowMs - this.braceAskedAt > 400) {
      this.braceAskedAt = null;
      if (!this.localAuth?.ultimateState) this.weapon.braceCancel();
    }
    if (this.localState && this.localAuth?.alive && this.playing && this.activeWorld) {
      // back on my feet: my own eyes and arms again (once I was seen down; the death event can beat its snapshot here)
      if (this.deathCam && (this.deathCam.down || timeSec - this.deathCam.at > 1)) {
        this.deathCam = null;
        this.weapon.group.visible = true;
        this.weapon.group.position.y = 0;
      }
      const serverNow = this.socket.serverNow();
      // my own steps as the host takes them: bracing into an ultimate I move only a little (and do not jump); spinning
      // in a Vortex, at its pace, with its slow fall, no sprint and no crouch
      const wanted = this.input.movement();
      const bracing = ultimateStartup(this.localAuth, serverNow);
      const whirl = ultimateWhirl(this.localAuth, serverNow);
      // (staggered, or reeling from a Sundering blow, my feet are not my own for that moment: as the host has it)
      const reeling = (this.localAuth.staggerUntil ?? -Infinity) > serverNow;
      const moveInput = reeling
        ? { ...wanted, forward: 0, right: 0, jump: false, sprint: false }
        : bracing
          ? { ...wanted, forward: wanted.forward * bracing.startupMove, right: wanted.right * bracing.startupMove, jump: false, sprint: false }
          : whirl ? { ...wanted, sprint: false, crouch: false } : wanted;
      // ground an enemy's Sunder has torn, under my feet: no sprint while I stand on it (the host's word for it)
      const torn = Boolean(this.localAuth.tornGround);
      if (torn) {
        if (this.localState.sprinting && serverNow >= (this.tornSaidAt ?? -Infinity) + 3) {
          this.tornSaidAt = serverNow;
          this.hud.flashText('TORN GROUND', 'danger', 900);
        }
        this.localState.sprintBlend = 0;
      }
      this.localState.whirl = whirl;
      // predict the sprint with the same rule the server uses, from the last authoritative stamina
      const wasSprinting = this.localState.sprinting;
      this.localState.sprinting = resolveSprint({
        wantsSprint: wanted.sprint,
        forward: wanted.forward,
        right: wanted.right,
        grounded: this.localState.grounded,
        stamina: this.localAuth.guardStamina,
        sprinting: this.localState.sprinting,
        blocked: reeling || torn || combatBlocksSprint(this.localAuth, serverNow, {
          guarding: this.input.guardHeld || this.weapon.guard,
          attacking: this.input.attackHeld || this.weapon.attackHeld,
          casting: this.weapon.castUntil > timeSec || this.localAuth.castEndsAt > serverNow,
        }),
        crouched: Boolean(this.localState.crouched),
      });
      // breaking into a sprint with someone at my heels: the wildcard, now and then
      if (!wasSprinting && this.localState.sprinting && this.moments.underPressure(this.socket.playerId, serverNow)) this.#sayMoment(this.socket.playerId, ['sprintUnderPressure']);
      const wasGrounded = this.localState.grounded;
      const fallSpeed = -this.localState.velocity.y;
      // a chill slows my own steps exactly as the server slows them (it thaws on the same clock)
      this.localState.speedScale = chillScale(this.localAuth.chill, serverNow);
      // (a Steel dash under way: where it sets off from this step, to see whom it meets)
      const ramFrom = this.localRam?.armed && serverNow < (this.localState.dashUntil ?? -Infinity) ? { ...this.localState.position } : null;
      this.localState = movePlayer(this.localState, moveInput, dt, serverNow, this.activeWorld);
      if (ramFrom) this.#foretellRam(ramFrom, serverNow);
      if (this.localRam?.armed && serverNow >= (this.localState.dashUntil ?? -Infinity)) this.localRam = null;
      // predict the server's body separation so pressing into an opponent does not rubber-band
      separateLocal(this.localState.position, this.remotePlayers.bodies(), this.activeWorld, { crouched: this.localState.crouched });
      // my own jump: now and then a grunt with it
      if (wasGrounded && !this.localState.grounded && this.localState.velocity.y > 4) this.#sayMoment(this.socket.playerId, ['jump']);
      if (!wasGrounded && this.localState.grounded) {
        this.weapon.land(fallSpeed);
        // a hard landing: the wildcard, now and then
        if (fallSpeed > 11) this.#sayMoment(this.socket.playerId, ['hardLanding']);
        // both feet down at once, heavier the further he fell
        if (fallSpeed > 2.5) this.#footstep(null, this.localState.position, Math.min(1, fallSpeed / 10), FOOTSTEPS.landing);
      }
      if (nowMs - this.lastInputSentAt >= 50) {
        this.lastInputSentAt = nowMs;
        // (with the view out behind me, the aim is from my own eyes to what the reticle is on: this.chaseAim)
        this.socket.input({ seq: ++this.sequence, ...wanted, ...(this.chaseAim ? { pitch: this.chaseAim.pitch } : {}), clientTime: this.socket.serverNow() });
      }
      // the weapon's procedural motion also returns small camera offsets (purely visual: aim uses input yaw/pitch)
      // Sheathed in Steel on my own arms: the server's word, or my own press while that word is on the way
      const steel = this.localAuth.steel;
      const pressed = Number.isFinite(this.localSteelAt) && serverNow - this.localSteelAt < 0.6 ? this.localSteelAt : null;
      const calledAt = Math.max(steel?.calledAt ?? -Infinity, pressed ?? -Infinity);
      // (its glint runs again as a ram of mine lands, or one lands on my hardened plate: it flashes with the blow)
      const flashed = Number.isFinite(this.steelFlashAt) && serverNow - this.steelFlashAt < STEEL_RIPPLE.seconds ? serverNow - this.steelFlashAt : null;
      this.weapon.setSteel(
        Math.max(steelStrength(steel, serverNow), pressed !== null && !steel ? 1 : 0),
        flashed ?? (Number.isFinite(calledAt) ? serverNow - calledAt : null),
      );
      // my Gale lets go when its breath is drawn; one the server never took is let go of quietly
      // while the spell cools, whether its key would throw the gauntlet now (the hand free of the sword)
      const cooling = serverNow < (this.localAuth.spellReadyAt ?? 0) && !this.#inPractice();
      const fistReady = cooling && !combatActionPolicy(this.localAuth, serverNow).concurrent && this.weapon.canJab();
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
      this.#foretellClang(timeSec);
      // camera motion (a comfort setting) scales the sway, bob, kicks and the widening of the view when sprinting
      const motion = this.view.cameraMotion;
      // a Blazing Vortex, committed: the view eases out behind and above me (vortexCamera.mjs) and back in as it ends.
      // It looks where I look, as ever (the body spins, the view does not); the helm's own sway stays in the helm
      this.chase = stepChase(this.chase ?? 0, chaseWanted(this.localAuth, serverNow), dt);
      const helm = 1 - this.chase * this.chase * (3 - 2 * this.chase);
      this.camera.rotation.y = this.input.yaw + view.camera.yaw * motion * helm;
      this.camera.position.y -= view.camera.y * (1 - motion);
      this.camera.rotation.x = this.input.pitch + (this.cameraKick + view.camera.pitch * helm) * motion;
      this.camera.rotation.z = view.camera.roll * motion * helm;
      this.cameraKick *= Math.exp(-dt * 15);
      let outside = false;
      if (this.chase > 0) {
        const groundAt = (x, z, y) => surfaceHeightAt(x, z, y, this.activeWorld);
        const out = chaseCamera({
          feet: this.localState.position, eyeHeight: this.viewHeight, yaw: this.input.yaw, pitch: this.input.pitch, blend: this.chase,
          reach: this.#reach, groundAt, limit: chaseLimit(this.chaseOut, dt),
        });
        this.chaseOut = out.out;
        this.camera.position.set(out.position[0], out.position[1], out.position[2]);
        outside = out.thirdPerson;
        // the aim the host is given while the view is out: from my own eyes to what the reticle is on, so the fire
        // lands where the reticle says
        const forward = aimVector(this.input.yaw, this.input.pitch);
        const far = reticleDistance(out.position, forward, { reach: this.#reach, groundAt, bodies: this.remotePlayers.bodies() });
        const at = this.localState.position;
        this.chaseAim = chaseAim(out.position, forward, [at.x, at.y + postureOf(this.localState).eye - 0.1, at.z], far);
      } else {
        this.chaseAim = null;
        this.chaseOut = 0;
      }
      // (outside, my own body is drawn and the helm's arms are not)
      this.weapon.group.visible = !outside;
      this.remotePlayers.showSelf(this.localAuth, {
        position: this.localState.position, velocity: this.localState.velocity, yaw: this.input.yaw, pitch: this.input.pitch,
      }, serverNow, nowMs, dt, outside);
      this.#setFov(this.view.fov + (view.fov - FP_MOTION.baseFov) * motion);
    } else if (this.localAuth && this.localState && this.deathCam && this.localAuth.alive === false) {
      this.#viewInHelm(nowMs, dt);
      this.#deathView(timeSec);
      this.#setFov(this.view.fov + (this.weapon.update(timeSec, dt).fov - FP_MOTION.baseFov) * this.view.cameraMotion);
    } else if (this.localAuth && this.localState) {
      this.#viewInHelm(nowMs, dt);
      this.camera.position.set(this.localState.position.x, this.localState.position.y + POSTURES.standing.camera, this.localState.position.z);
      this.camera.rotation.z = 0;
      this.#setFov(this.view.fov + (this.weapon.update(timeSec, dt).fov - FP_MOTION.baseFov) * this.view.cameraMotion);
    }
    this.remotePlayers.update(nowMs, dt);
    this.#showAfflictions(dt);
    this.world?.update?.(timeSec, this.camera);
    this.#followGusts();
    this.effects.update(dt);

    if (this.latestSnapshot && this.localAuth) {
      // (the longer scenes' clocks: a part whose moment has come is said)
      this.scenes.step(this.socket.serverNow(), this.latestSnapshot.players);
      this.#sayWatched(this.watch.step(this.socket.serverNow(), this.latestSnapshot.players, { self: this.socket.playerId }));
      this.#placeVoices();
      this.#showCondition(this.socket.serverNow());
      this.hud.update(this.localAuth, this.latestSnapshot, this.socket.serverNow());
      this.touch?.update(this.localAuth, this.socket.serverNow(), { practice: this.#inPractice() });
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
    this.weapon.syncPalmLight();
    this.#renderView();
    requestAnimationFrame((t) => this.#frame(t));
  }

  // the world; then my own arms and sword over it, on depth cleared of the world (viewLayers.mjs), with the shadows
  // the world's pass already made
  #renderView() {
    const { renderer, scene, camera } = this;
    camera.layers.set(0);
    renderer.render(scene, camera);
    const background = scene.background;
    const shadows = renderer.shadowMap.autoUpdate;
    const clears = renderer.autoClear;
    // (a background colour would clear what the first pass drew)
    scene.background = null;
    renderer.autoClear = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.clearDepth();
    camera.layers.set(VIEW_LAYER);
    try {
      renderer.render(scene, camera);
    } finally {
      camera.layers.set(0);
      renderer.autoClear = clears;
      renderer.shadowMap.autoUpdate = shadows;
      scene.background = background;
    }
  }

  #setFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 1e-3) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.running = false;
    clearTimeout(this.appealCut);
    if (this.voice?.onSpoken === this.subtitleHook) this.voice.onSpoken = null;
    if (this.voice?.onCut === this.captionCut) this.voice.onCut = null;
    for (const off of this.unsubscribe) off();
    window.removeEventListener('resize', this.#resize);
    this.resizeObserver?.disconnect();
    this.input.dispose();
    this.touch?.dispose();
    this.world?.dispose?.();
    this.remotePlayers.dispose();
    this.weapon.dispose();
    this.renderer.dispose();
    // (its drawing context let go now, not whenever the browser gets round to it: the next match makes its own)
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
    if (globalThis.__ssRuntime === this) globalThis.__ssRuntime = null;
  }
}
