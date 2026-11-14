import * as THREE from 'three';
import { Effects } from '../../game/Effects.mjs';
import { createSpellbladeAsset } from '../../game/SpellbladeAssets.mjs';
import { THIRD_PERSON_SPELL_ARM, THIRD_PERSON_SWORD_ARM, solveArm } from '../../game/swordArmIK.mjs';
import { performanceAt } from '../menuReactions.mjs';
import {
  armourFallRecipe, blockRecipe, burnLickRecipe, castRecipe, fireballImpactRecipe, freezeRecipe, frostImpactRecipe, galeReleaseRecipe, groundSlamRecipe,
  meltHissRecipe, parryRecipe, scoopRecipe, slushCollapseRecipe, spatialize, splashRecipe, swingRecipe, swordHitRecipe, vesselRecipe, vortexEndRecipe,
  vortexWhooshRecipe, wallClangRecipe,
} from '../../game/sound/soundRecipes.mjs';
import { SPELLS } from '../../../shared/src/spells.mjs';
import { surfaceHeightAt } from '../../../shared/src/collision.mjs';
import { yawFacing } from './tourPath.mjs';
import { hearingFor, voicePlacement } from '../../game/sound/voiceRules.mjs';
import { linesFor } from '../../game/sound/voiceLines.mjs';
import { footstepRecipe, gaitFootfall, surfaceAt, variantPicker } from '../../game/sound/footsteps.mjs';
import {
  COMPACT_SHOT, FIGHT_SHOT, clearEye, fightPair, fightShot, followAim, followEye, followPlan, frameSide, lookFor, placeFight,
} from './tourCamera.mjs';
import { FIGHT_POOL, galeTurns } from './tourFights.mjs';
import { buildSchedule, lineupFor, roundRandom, tourMoment } from './tourSchedule.mjs';
import { TOUR_MAP_IDS, mapPlan, nextLeg } from './tourMaps.mjs';
import { HERO, changeHands, createCast, handOver } from './tourCast.mjs';
import { Debris, cutSword, dizzyStars, dressRival, galeFunnel, iceCrust, mendSword, shatterKnight, slushPile, vesselProp, whiteFlag } from './tourProps.mjs';

// The Spellblade's round behind the front door, played out: he runs the path, stops at each rival, and they fight to
// the script in tourFights.mjs; the camera follows him and frames each fight to the right of the menu banner. Three
// rivals are dressed in their own colours (another Spellblade, but not him), and everything they go through (burned,
// shattered, disarmed and sent running, frozen and melted down into slush and drunk) is undone out of sight before
// the next round. Each round stages the pool's fights in a different order at the three stops (lineupFor), each placed
// where it has room and a clear view. What he says on the round is heard from where he stands; `onCaption` is told
// its words (and their beats) for the menu's subtitle, and `onCaptionCut` when it is cut short.
//
// The round is not always his, nor always on the green. The Gale Lift-Off Handover passes it to a rival, and after
// that it changes hands every so often (tourCast.mjs: visual only, the player's own knight and loadout never touched;
// he is only hidden while someone else has the round, and is himself again the moment the front door is left). And
// after a round or two on a map the round moves on to another (tourMaps.mjs: a slightly shuffled carousel of the game's
// worlds, each from another start, maybe the other way round), through a quick fade, with the world itself swapped in
// behind it by the menu (`worlds`: { prepare(id) → Promise, show(id) → whether it is there to be shown }).

const RUN_CLIP_SPEED = 7.5;         // the Run clip's own pace (m/s): the stride rate follows the actual pace
// each rival's colours: steel tint and the glow behind the visor
export const RIVAL_DRESS = Object.freeze([
  { tint: [0.5, 0.5, 0.56], visor: 0xff5a2a },       // the Ashen Knight: blackened steel, ember eyes
  { tint: [0.6, 1.08, 0.58], visor: 0x9dff6a },      // the Verdant Knight
  { tint: [1.3, 1.02, 0.55], visor: 0xffc84a },      // the Gilded Knight
  { tint: [0.62, 0.78, 1.32], visor: 0x7fd2ff },     // the Azure Knight: the one waiting in the wings for a stop
]);
// the round's passage between maps: down to the dark (seconds), and back up on the next
export const TRAVEL_FADE = Object.freeze({ out: 0.55, in: 0.7 });
// how close the Gale's wind must be to catch a knight's cape, and how hard (m/s) it blows at its strongest
const GALE_REACH = 7;
const GALE_GUST = 15;
// the Gale's gust (shared/src/spells.mjs) made small: the air driven off the funnel at the one backing away from it, and
// the blast out across the ground as he leaves it
const PUSH_CONE = Object.freeze({ ...SPELLS.gale.cone, reach: 2.2, pressureReach: 3.2, halfAngleDeg: 18, pressureHalfAngleDeg: 26, lastsSec: 0.4 });
const LIFTOFF_CONE = Object.freeze({ ...SPELLS.gale.cone, reach: 1.8, pressureReach: 2.5, halfAngleDeg: 22, pressureHalfAngleDeg: 30, lastsSec: 0.35 });

const _p = new THREE.Vector3();
// his footsteps out on the round: soft, under the music and the steel
const TOUR_STEPS = 0.28;
const _q = new THREE.Quaternion();

function angleLerp(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

// a seeded random, so each round's debris falls the same way
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export class TourDirector {
  /**
   * scene/camera: the menu's; hero: { root (the group the knight stands in), instance }; sound/voice: optional
   * SoundEngine and VoiceBank for the fights' steel, fire and words; effects: the menu's own Effects, when it has
   * them (the round then leaves updating them to the menu).
   */
  constructor({ scene, camera, hero, sound = null, voice = null, effects = null, worlds = null, maps = TOUR_MAP_IDS, random = Math.random }) {
    this.scene = scene;
    this.camera = camera;
    this.hero = hero;
    this.sound = sound;
    this.voice = voice;
    // the menu's worlds (the carousel moves the round on only if the menu can show another), and the maps it may visit
    this.worlds = worlds;
    this.mapIds = maps.filter((id) => TOUR_MAP_IDS.includes(id));
    this.random = random;
    this.#usePlan(mapPlan('castleward'));
    this.effects = effects ?? new Effects(scene, camera);
    this.ownsEffects = !effects;
    this.debris = new Debris(scene, { onLand: (point, impact) => this.#clatter(point, impact) });
    this.time = 0;
    this.lastMoment = null;
    this.rivals = [];
    this.ready = false;
    this.projectiles = [];
    this.burns = [];
    // the Slush's vessel in his hand, while he has it out
    this.vessel = null;
    // What the rivals remember from one round to the next (Sky-Bait): the stop whose rival has been sky-baited (he
    // watched a Fireball go up into the sky while the Spellblade walked off), until he is paid off. Not what was done to
    // him (every round puts every rival back as he was: #resetRivals leaves this alone), and kept across a visit's
    // restart (it is the same menu: he still remembers); only dispose() forgets it.
    this.memory = { skyBait: null };
    this.onCaption = null;
    this.onCaptionCut = null;
    this.pause = 0;
    this.performance = null;
    // the front door's own shot: only the first departure starts on it (and, with the banner drawn aside, the same shot
    // turned to give him the middle of the stage: `homeObserve`)
    this.home = null;
    this.homeObserve = null;
    // the part of the screen clear of the menu's banner (shares of its width), and whether the screen is a small one
    // (the knights a little smaller: COMPACT_SHOT), both kept up to date by MenuScene
    this.clear = FIGHT_SHOT.clear;
    this.compact = false;
    // how far the banner is drawn aside (0: up, the round framed right of it; 1: the world has the screen, Observation
    // View): MenuScene eases it, and the camera composes for the stage it has. Nothing else of the round depends on it
    this.framing = 0;
    this.visible = false;
    this.resetFrustum = new THREE.Frustum();
    this.resetMatrix = new THREE.Matrix4();
    this.cleanupDebris = false;
    // where each version of each fight goes at each stop of each map's way round, worked out once (tourCamera.placeFight)
    this.placements = new Map();
    // who has the round, and who waits at each stop (tourCast.mjs); every rival's own record, by knight
    this.cast = createCast(RIVAL_DRESS.length, 3);
    this.knights = [];
    this.rivals = [];
    // the carousel: the leg it is on (how many rounds are left on this map), and where it goes next
    this.leg = this.#opening();
    this.seen = ['castleward'];
    this.travel = null;
    this.travelFade = 0;
    this.wind = null;
    this.#stageRound(0);
    this.#spawnRivals();
  }

  // the map the round is on, made the round's own: its path, its stops, its ground, what stands on it, how it is followed
  #usePlan(plan) {
    this.plan = plan;
    this.map = plan;
    this.path = plan.path;
    this.stops = plan.stops;
    this.world = plan.world;
    this.blockers = plan.blockers;
    this.follow = followPlan(this.path, this.blockers, { footprint: plan.footprint });
  }

  // a visit's opening stay on the green: two rounds (the Slush, then Sky-Bait's setup), or for good with nowhere to go
  #opening() {
    return { id: 'castleward', rounds: this.mapIds.length > 1 ? 2 : Infinity };
  }

  /** The one making the round: the player's knight ({ root, instance }), or a rival who has taken it over. */
  get traveller() {
    if (this.cast.traveller === HERO) return { kind: HERO, root: this.hero.root, instance: this.hero.instance, record: null };
    const record = this.knights[this.cast.traveller];
    return record ? { kind: 'rival', root: record.holder, instance: record.instance, record } : { kind: HERO, root: this.hero.root, instance: this.hero.instance, record: null };
  }

  // the cast made real: the rivals at the stops, the player's knight shown only while he has the round, everyone
  // else out of sight
  #applyCast(cast) {
    const before = this.rivals;
    this.cast = cast;
    this.rivals = cast.posted.map((index) => this.knights[index] ?? null);
    // (Sky-Bait's memory is the rival's at that stop: a stop that changes hands forgets)
    const remembered = this.memory?.skyBait;
    if (Number.isInteger(remembered) && before[remembered] !== this.rivals[remembered]) this.memory.skyBait = null;
    for (const index of cast.spare) {
      const record = this.knights[index];
      if (record) { this.#restoreRival(record, index); record.holder.visible = false; record.resetPending = false; }
    }
    if (this.hero?.root) this.hero.root.visible = cast.traveller === HERO;
  }

  // this round's fights at the three stops, their frames and the schedule they make
  #stageRound(round) {
    this.round = round;
    // (each visit to the front door rolls its own dice: the Slush that opens it is another version each time)
    const random = roundRandom(round + (this.visit ?? 0) * 97);
    const first = lineupFor(0);
    // (a stop with no room for its fight on this way round stages the first round's, or else any that fits)
    const fallback = ['fireball', 'whirlwind', 'whiteFlag'];
    const placed = lineupFor(round, undefined, { skyBaited: this.memory?.skyBait ?? null }).map((name, slot) => this.#placed(name, slot, random)
      ?? this.#placed(first[slot], slot, random) ?? fallback.map((other) => this.#placed(other, slot, random)).find(Boolean));
    this.fights = placed.map((each) => each.fight);
    this.frames = placed.map((each) => this.#frame(each));
    this.schedule = buildSchedule(this.path.length, { fights: this.fights, distances: this.stops, introduction: round === 0 && this.map.id === 'castleward' });
    // (the lift-off's funnel made, and its shaders compiled, as the round begins, not as it first appears mid-fight)
    if (!this.funnel && this.fights.some((fight) => fight.id === 'galeLiftoff')) {
      this.funnel = galeFunnel(this.scene);
      this.worlds?.warm?.(this.funnel.group);
    }
  }

  // the first version of a fight from the pool that has room and a clear view at this stop
  #placed(name, slot, random) {
    for (const fight of FIGHT_POOL[name](random)) {
      const key = `${this.map.key}/${fight.key ?? fight.id}@${slot}`;
      if (!this.placements.has(key)) this.placements.set(key, placeFight(this.path, fight, this.stops[slot], this.blockers, this.world, this.map.footprint));
      const placement = this.placements.get(key);
      if (placement) return placement;
    }
    return null;
  }

  // a fight's own frame in the world (the anchor, u toward the rival's side, v along the path), and the way its
  // camera looks: side on, turned only as far as it takes to see past whatever stands in the way
  #frame({ frame: plan, swing }) {
    return {
      origin: new THREE.Vector3(plan.origin[0], 0, plan.origin[1]),
      u: new THREE.Vector3(plan.u[0], 0, plan.u[1]),
      v: new THREE.Vector3(plan.v[0], 0, plan.v[1]),
      plan,
      look: lookFor(plan, swing),
    };
  }

  #place(frame, pose) {
    const position = frame.origin.clone().addScaledVector(frame.u, pose.u ?? 0).addScaledVector(frame.v, pose.v ?? 0);
    position.y = pose.lift ?? 0;
    const facing = frame.u.clone().multiplyScalar(Math.cos(pose.heading)).addScaledVector(frame.v, Math.sin(pose.heading));
    return { position, yaw: yawFacing([facing.x, facing.z]) };
  }

  async #spawnRivals() {
    const instances = await Promise.all(RIVAL_DRESS.map(() => createSpellbladeAsset({ kind: 'thirdPerson' }).catch(() => null)));
    instances.forEach((instance, index) => {
      if (!instance) return;
      const holder = new THREE.Group();
      holder.name = `tour-rival-${index}`;
      holder.add(instance.root);
      instance.root.traverse((object) => {
        if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      holder.visible = this.visible;
      this.scene.add(holder);
      this.knights[index] = {
        holder, instance, look: RIVAL_DRESS[index], dress: dressRival(instance, RIVAL_DRESS[index]), stub: null, flag: null, shattered: false, charred: 0,
        // the Slush: the ice on him, the heap he becomes, and the steam off him as he goes
        crust: null, pile: null, steam: 0,
      };
    });
    this.#applyCast(this.cast);
    this.ready = true;
  }

  /** Start the round over (the first round, as the fights were written): the Spellblade at his place, every rival
   * whole and waiting. */
  restart() {
    this.visit = (this.visit ?? 0) + 1;
    this.time = 0;
    this.lastMoment = null;
    this.pause = 0;
    this.performance = null;
    this.#homeAgain();
    this.#stageRound(0);
    this.#resetRivals();
  }

  // a visit begins as it always has: on the Castleward green, the round his, in the first map's order
  #homeAgain() {
    if (this.map?.id !== 'castleward' || this.map.key !== mapPlan('castleward').key) this.#usePlan(mapPlan('castleward'));
    this.worlds?.show?.('castleward');
    this.leg = this.#opening();
    this.seen = ['castleward'];
    this.travel = null;
    this.travelFade = 0;
    this.#stopWind();
    this.#applyCast(createCast(RIVAL_DRESS.length, 3));
    this.view = null;
  }

  #resetRivals() {
    this.stars?.dispose();
    this.stars = null;
    this.debris.clear();
    this.projectiles = [];
    this.effects.syncProjectiles([]);
    this.burns = [];
    this.vessel?.dispose();
    this.vessel = null;
    this.cleanupDebris = false;
    for (const [index, rival] of this.rivals.entries()) if (rival) this.#restoreRival(rival, index);
    this.hero?.instance?.root?.traverse?.((object) => { if (object.isMesh && /^HeroSword/i.test(object.name)) object.visible = true; });
  }

  // every rival back as he was (the ones waiting in the wings or making the round too), for a new map
  #resetEveryone() {
    this.#resetRivals();
    for (const [index, record] of this.knights.entries()) if (record && !this.rivals.includes(record)) this.#restoreRival(record, index);
    this.#applyCast(this.cast);
  }

  #restoreRival(rival, index) {
    // (nothing of the Slush stays: the ice off him, the heap gone, his own shape and colours back)
    rival.crust?.dispose();
    rival.crust = null;
    rival.pile?.dispose();
    rival.pile = null;
    rival.steam = 0;
    rival.heatAt = null;
    rival.holder.scale.set(1, 1, 1);
    this.effects.afflict(`tour-frost-${index}`, null);
    rival.flag?.dispose();
    rival.flag = null;
    if (rival.stub) mendSword(rival.instance, rival.stub);
    rival.stub = null;
    rival.instance?.root?.traverse?.((object) => { if (object.isMesh && /^HeroSword/i.test(object.name)) object.visible = true; });
    rival.dress.restore();
    rival.charred = 0;
    rival.shattered = false;
    rival.instance.root.visible = true;
    rival.holder.visible = true;
    rival.resetPending = false;
    rival.retiredTime = 0;
  }

  // Retain the outgoing tableau until both its old shape and its incoming location are outside the camera.
  #retireRound(completedDuration) {
    if (this.stars) this.starsUntil -= completedDuration;
    if (this.wind) this.wind.at -= completedDuration;
    for (const rival of this.rivals) if (rival) {
      rival.resetPending = true;
      rival.retiredTime = (rival.retiredTime ?? 0) + completedDuration;
    }
    for (const piece of this.debris.pieces) piece.mesh.userData.tourRetired = true;
    this.cleanupDebris = this.debris.pieces.length > 0;
    this.projectiles = [];
    this.effects.syncProjectiles([]);
    this.burns = [];
    this.vessel?.dispose();
    this.vessel = null;
  }

  #outsideView(object) {
    if (!object || !object.visible) return true;
    const box = new THREE.Box3().setFromObject(object).expandByScalar(0.5);
    return !this.resetFrustum.intersectsBox(box);
  }

  /** Show or hide everything the round brings (the rivals and what is left of them). */
  setVisible(visible) {
    this.visible = visible;
    // leaving the front door: the round is his again, he is himself and in sight, and every rival is out of it
    if (!visible) {
      this.#applyCast(createCast(RIVAL_DRESS.length, 3));
      this.#stopWind();
      this.travel = null;
      this.travelFade = 0;
    }
    for (const rival of this.rivals) {
      if (!rival) continue;
      rival.holder.visible = visible && !rival.shattered;
      if (rival.pile) rival.pile.group.visible = visible;
    }
    for (const piece of this.debris.pieces) piece.mesh.visible = visible;
    if (this.vessel) this.vessel.group.visible = visible;
    // leaving the front door: whatever he was saying out there stops, and its caption with it
    if (!visible) {
      this.#resetRivals();
      this.voice?.cut?.('tour-spellblade');
      this.onCaptionCut?.();
    }
  }

  /** A reaction on the front door (Seek a Duel's rally): he stops where he is to perform it; the round waits. */
  perform(kind, duration) {
    this.performance = { kind, elapsed: 0 };
    this.pause = duration;
  }

  /**
   * Advance the round by dt and pose everyone. Returns the camera the round wants: { position, target, fov }.
   */
  update(dt) {
    if (!this.ready) return null;
    // (a world just built: the round holds in the dark until it can be drawn without a stall)
    if (this.worlds?.busy && Number.isFinite(this.arrivedAt)) {
      this.travelFade = 1;
      return this.view ? { ...this.view, fade: 1 } : null;
    }
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.performance) this.performance.elapsed += dt;
    } else {
      this.performance = null;
      this.time += dt;
    }
    // Advance the lineup without resetting anything visible through the tracking camera.
    while (this.time >= this.schedule.duration) {
      const completedDuration = this.schedule.duration;
      this.time -= completedDuration;
      // (the round moves on to its next map at the dark, if the menu has it ready; otherwise it stays a round more)
      const moving = this.travel?.ready && this.worlds?.show?.(this.travel.leg.id);
      if (moving) this.#arrive(this.travel.leg);
      else {
        this.travel = null;
        this.leg.rounds -= 1;
      }
      this.#stageRound(this.round + 1);
      if (moving) this.#resetEveryone();
      else this.#retireRound(completedDuration);
      this.lastMoment = null;
      this.#planTravel();
    }
    this.#stepTravel(dt);
    const moment = tourMoment(this.schedule, this.time);
    this.#poseHero(moment, dt);
    if (this.rivals.some((rival) => rival?.resetPending) || this.cleanupDebris) {
      this.camera.updateMatrixWorld();
      this.resetMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.resetFrustum.setFromProjectionMatrix(this.resetMatrix);
      this.debris.remove((mesh) => mesh.userData.tourRetired && this.#outsideView(mesh));
      this.cleanupDebris = this.debris.pieces.some((piece) => piece.mesh.userData.tourRetired);
    }
    this.#poseRivals(moment, dt);
    this.#fireCues(moment);
    this.#stepProjectiles();
    this.#stepBurns(dt);
    this.debris.update(dt);
    for (const rival of this.rivals) rival?.flag?.update(this.time + (rival.retiredTime ?? 0));
    this.#stepStars();
    this.#stepWind(moment, dt);
    if (this.ownsEffects) this.effects.update(dt);
    this.lastMoment = moment;
    return this.#camera(moment, dt);
  }

  // ------------------------------------------------------------------------------------------------- the carousel
  // at the start of a map's last round: where it goes next, its world asked for (so it is there by the dark)
  #planTravel() {
    if (!this.worlds || this.mapIds.length < 2 || this.travel || this.leg.rounds > 1) return;
    const leg = nextLeg(this.random, { from: this.leg.id, seen: this.seen, maps: this.mapIds });
    const travel = { leg, ready: false };
    this.travel = travel;
    Promise.resolve(this.worlds.prepare?.(leg.id) ?? true).then((ready) => { if (this.travel === travel) travel.ready = Boolean(ready); }, () => {
      if (this.travel === travel) this.travel = null;
    });
  }

  // in the dark: the next map's round, from its start, the camera already behind him; and the round may change hands
  #arrive(leg) {
    this.#usePlan(mapPlan(leg.id, leg));
    this.seen = this.seen.length + 1 >= this.mapIds.length ? [leg.id] : [...this.seen, leg.id];
    this.leg = { id: leg.id, rounds: leg.rounds };
    this.travel = null;
    this.arrivedAt = 0;
    this.#stopWind();
    this.projectiles = [];
    this.effects.syncProjectiles([]);
    this.debris.clear();
    this.stars?.dispose();
    this.stars = null;
    // (after the first handover, now and then, out of sight: the round changes hands)
    if (this.cast.handovers > 0 && this.random() < 0.6) this.#applyCast(changeHands(this.cast, this.random));
    this.view = null;
    this.heroYaw = undefined;
  }

  // the fade: down as the round on this map runs out, back up once it has begun on the next
  #stepTravel(dt) {
    // (each on its own clock: a one-round stay is already going on as it comes up out of the dark)
    const left = this.schedule.duration - this.time;
    const down = this.travel?.ready ? Math.min(1, Math.max(0, 1 - left / TRAVEL_FADE.out)) : 0;
    let up = 0;
    if (Number.isFinite(this.arrivedAt)) {
      this.arrivedAt += dt;
      up = Math.max(0, 1 - this.arrivedAt / TRAVEL_FADE.in);
      if (up <= 0) this.arrivedAt = null;
    }
    this.travelFade = Math.max(down, up);
  }

  // ------------------------------------------------------------------------------------------------ the Spellblade
  #poseHero(moment, dt) {
    const { root, instance } = this.traveller;
    let plan;
    let position;
    let yaw;
    let snap = false;
    let away = false;
    this.flying = false;
    // how far round the path he really is (a fight can walk him on down it)
    this.heroDistance = moment.distance;
    if (moment.phase === 'fight') {
      const fight = this.fights[moment.fight];
      const frame = this.frames[moment.fight];
      const pose = fight.hero(moment.fightTimes[moment.fight]);
      if (Number.isFinite(pose.path)) {
        // walking away down the path: on it, facing along it
        this.heroDistance = frame.plan.distance + pose.path;
        const here = this.path.at(this.heroDistance);
        position = new THREE.Vector3(here.x, 0, here.z);
        yaw = yawFacing(here.dir);
        if (Number.isFinite(pose.off)) {
          // (still that far to the side of it, crossing back to it, facing as the script says)
          const side = frameSide(frame.plan);
          const across = [here.dir[1] * side, -here.dir[0] * side];
          position.x += across[0] * pose.off;
          position.z += across[1] * pose.off;
          yaw = yawFacing([across[0] * Math.cos(pose.heading) + here.dir[0] * Math.sin(pose.heading), across[1] * Math.cos(pose.heading) + here.dir[1] * Math.sin(pose.heading)]);
        }
      } else {
        ({ position, yaw } = this.#place(frame, pose));
      }
      // up in the air (the Gale's lift-off), and gone out of the sky
      this.flying = Boolean(pose.flying);
      away = Boolean(pose.away);
      // a spin is too quick to ease after: he faces exactly where the script says
      snap = Boolean(pose.snap);
      plan = this.#plan(pose);
      // the White Flag's finale: he raises his sword to the sky as the rival runs for it
      if (pose.rally !== null && pose.rally !== undefined) plan = this.#performancePlan('rally', pose.rally, plan);
    } else {
      const here = this.path.at(moment.distance);
      position = new THREE.Vector3(here.x, 0, here.z);
      yaw = yawFacing(here.dir);
      if (moment.phase === 'rest') {
        // at his place he faces the front door's camera, then turns to the road as he sets off
        const restYaw = this.restYaw ?? yaw;
        yaw = angleLerp(restYaw, yaw, Math.max(0, Math.min(1, (moment.time - (this.schedule.pace.rest - 0.7)) / 0.7)));
      }
      // the stride follows the pace all the way down to a walk, so he never snaps from a run to standing
      const running = moment.speed > 0.6;
      plan = running
        ? { clip: 'Run', loop: true, rate: Math.max(0.28, moment.speed / RUN_CLIP_SPEED) }
        : { clip: 'Idle', loop: true, time: this.time };
    }
    if (this.performance) plan = this.#performancePlan(this.performance.kind, this.performance.elapsed, { clip: 'Idle', loop: true, time: this.time });
    // (gone up out of the sky: nothing of him to draw until the round is his again)
    root.visible = this.visible && !away;
    this.travellerAway = away;
    root.position.copy(position);
    // the turn is eased (a knight turns in a moment, never snaps), except in a spin, which is all turn
    root.rotation.y = this.heroYaw === undefined || snap ? yaw : angleLerp(this.heroYaw, yaw, Math.min(1, dt * 12));
    this.heroYaw = root.rotation.y;
    instance.animator.apply(plan, dt);
    if (!this.flying) this.#footfall('hero', instance, root.position, plan.clip);
    const vessel = moment.phase === 'fight' ? this.fights[moment.fight].hero(moment.fightTimes[moment.fight]).vessel : null;
    this.#carryVessel(vessel);
    // (the heap goes as the vessel sweeps through it)
    if (Number.isFinite(vessel?.scooped)) this.rivals[moment.fight]?.pile?.scoop(vessel.scooped);
  }

  // the Slush's vessel, held against his spell hand's palm, upright but for how the script tips it (toward his visor
  // to drink, away into the heap or to pour out)
  #carryVessel(vessel) {
    if (!this.vessel) return;
    if (!vessel?.shown) {
      this.vessel.update({ visible: false });
      return;
    }
    const { root, instance } = this.traveller;
    const palm = this.#socket(instance, 'socket_sorcery');
    const yaw = root.rotation.y;
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    if (vessel.grip) {
      // (the tankard by its handle: the handle in his fist, the tankard beyond it the way his palm faces, and tipped
      // about the handle's line, as a tankard is drunk from)
      const grip = new THREE.Vector3(vessel.grip[0], 0, vessel.grip[2]).normalize();
      const position = palm.addScaledVector(grip.clone().applyQuaternion(turn), this.vessel.size.rim + this.vessel.size.handle);
      const handleIn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(grip.z, -grip.x));
      const quaternion = turn.multiply(new THREE.Quaternion().setFromAxisAngle(grip, vessel.tilt ?? 0)).multiply(handleIn);
      this.vessel.update({ position, quaternion, fill: vessel.fill ?? 0, visible: this.visible });
      return;
    }
    // (its side against the palm, which faces in toward his middle and a little forward)
    const inward = new THREE.Vector3(0.85, 0.15, -0.5).normalize().applyQuaternion(turn);
    const position = palm.addScaledVector(inward, this.vessel.size.rim * 0.95);
    const quaternion = turn.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), vessel.tilt ?? 0));
    this.vessel.update({ position, quaternion, fill: vessel.fill ?? 0, visible: this.visible });
  }

  // his feet on the ground as the gait clip puts them down (its rate follows his pace), on whatever is underfoot
  #footfall(key, instance, position, clip) {
    const gait = instance.animator.gaitPhase;
    this.lastGait ??= {};
    const before = this.lastGait[key];
    this.lastGait[key] = gait;
    if (!this.sound || !this.visible || (clip !== 'Run' && clip !== 'Sprint') || !gaitFootfall(before, gait)) return;
    this.stepVariant ??= variantPicker();
    const recipe = footstepRecipe(Math.random, { surface: surfaceAt(this.world, position.x, position.z, position.y), variant: this.stepVariant(key) });
    this.#play(recipe, position, TOUR_STEPS);
  }

  // an animator plan from a fight pose: its clip, and the procedural layer (bends, crouch, the arms by the solver)
  #plan(pose) {
    const plan = { clip: pose.clip, loop: pose.loop, time: pose.time, rate: pose.rate };
    const { sword, spell } = pose;
    plan.motion = {
      extra: pose.rotations ?? [],
      crouch: pose.crouch ?? 0,
      // a knight felled on the round goes down the way one does in the arena (the slump, then lying on the ground)
      death: pose.clip === 'Death' ? { age: pose.time, push: null } : null,
      solve: sword || spell ? (bones) => {
        if (sword) solveArm(bones, THIRD_PERSON_SWORD_ARM, sword.target, sword.weight);
        if (spell) solveArm(bones, THIRD_PERSON_SPELL_ARM, spell.target, spell.weight);
      } : undefined,
    };
    return plan;
  }

  #performancePlan(kind, elapsed, base) {
    const performance = performanceAt(kind, elapsed);
    if (!performance) return base;
    return {
      clip: 'Idle', loop: true, time: this.time,
      motion: {
        extra: performance.rotations,
        crouch: performance.crouch,
        solve: (bones) => {
          if (performance.sword) solveArm(bones, THIRD_PERSON_SWORD_ARM, performance.sword.target, performance.sword.weight);
          if (performance.spell) solveArm(bones, THIRD_PERSON_SPELL_ARM, performance.spell.target, performance.spell.weight);
        },
      },
    };
  }

  // ------------------------------------------------------------------------------------------------------ rivals
  #poseRivals(moment, dt) {
    this.rivals.forEach((rival, index) => {
      if (!rival) return;
      const fight = this.fights[index];
      const t = moment.fightTimes[index];
      const pose = fight.rival(t);
      const placed = this.#place(this.frames[index], pose);
      if (rival.resetPending) {
        const incoming = new THREE.Sphere(placed.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 2.5);
        const mustRestore = t >= -2.0;
        if (!mustRestore && (this.resetFrustum.intersectsSphere(incoming) || !this.#outsideView(rival.holder)
          || !this.#outsideView(rival.pile?.group) || !this.#outsideView(rival.flag?.group))) return;
        this.#restoreRival(rival, index);
      }
      if (rival.shattered) return;
      if (pose.gone) {
        rival.holder.visible = false;
        this.effects.afflict(`tour-frost-${index}`, null);
        return;
      }
      rival.holder.visible = true;
      const { position, yaw } = placed;
      rival.holder.position.copy(position);
      rival.holder.rotation.y = yaw;
      if (Number.isFinite(pose.frozen)) this.#frozen(rival, index, pose, position, dt);
      // one waiting far from the Spellblade casts no shadow: nobody would see it, and each of his pieces is a draw call
      const near = position.distanceTo(this.traveller.root.position) < 10;
      if (rival.shadows !== near) {
        rival.shadows = near;
        rival.instance.root.traverse((object) => { if (object.isMesh) object.castShadow = near; });
      }
      const plan = this.#plan(pose);
      rival.instance.animator.apply(plan, dt);
      this.#footfall(`rival-${index}`, rival.instance, position, plan.clip);
    });
  }

  // a knight frozen solid (pale ice over him, crystals closing, a cold mist off him), and then, the Fireball in him,
  // going soft and sinking down into the heap of slush he leaves (a little steam off him as he goes)
  #frozen(rival, index, pose, position, dt) {
    const frozen = Math.max(0, Math.min(1, pose.frozen));
    const melt = Math.max(0, Math.min(1, pose.melt ?? 0));
    // (the Fireball glowing through the ice as it strikes, fading as the statue goes soft)
    const heat = Number.isFinite(rival.heatAt) ? Math.max(0, 1 - (this.time - rival.heatAt) / 0.7) : 0;
    rival.dress.frost(frozen, melt, heat * heat);
    rival.crust?.grow(frozen);
    const sink = melt * melt * (3 - 2 * melt);
    // (it loses its stiffness first: a wobble, then down and out)
    const wobble = Math.sin(melt * Math.PI * 5) * 0.05 * (1 - melt) * Math.min(1, melt * 6);
    rival.holder.scale.set(1 + 0.3 * sink + wobble, Math.max(0.04, 1 - 0.94 * sink), 1 + 0.3 * sink - wobble);
    this.effects.afflict(`tour-frost-${index}`, melt < 0.6 ? position : null, { chill: frozen * (1 - melt / 0.6) }, dt);
    rival.pile?.grow(Math.max(0, Math.min(1, (melt - 0.12) / 0.88)));
    if (melt > 0 && melt < 1) {
      rival.steam += dt * 7;
      while (rival.steam >= 1) {
        rival.steam -= 1;
        this.effects.steam({ x: position.x, y: 0.2 + 1.3 * (1 - sink), z: position.z }, { count: 1, spread: 0.6 });
      }
    }
  }

  // a point on a knight: his chest, his sword hand's socket, his palm
  #chest(root) {
    return root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.3, 0));
  }

  #socket(instance, name) {
    const bone = instance.animator.bone(name);
    return bone ? bone.getWorldPosition(new THREE.Vector3()) : this.#chest(instance.root);
  }

  // ------------------------------------------------------------------------------------------------------- cues
  #fireCues(moment) {
    if (!this.lastMoment || moment.time < this.lastMoment.time) return;
    this.fights.forEach((fight, index) => {
      const before = this.lastMoment.fightTimes[index];
      const now = moment.fightTimes[index];
      for (const cue of fight.cues) if (cue.at > before && cue.at <= now) this.#cue(cue, index);
    });
  }

  #cue(cue, index) {
    const rival = this.rivals[index];
    const traveller = this.traveller;
    const heroRoot = traveller.root;
    const rivalRoot = rival?.holder;
    const actor = cue.by === 'rival' ? rivalRoot : heroRoot;
    switch (cue.type) {
      case 'swing':
        this.#play(swingRecipe(Math.random, { strike: cue.heavy ? 2 : 0 }), this.#chest(actor), 0.5);
        break;
      case 'parry': {
        // a blow turned aside, as the game shows one: the bright parry burst where the blades met, and its ring
        if (!rivalRoot) break;
        const a = this.#chest(heroRoot);
        const b = this.#chest(rivalRoot);
        const point = a.clone().lerp(b, 0.42).add(new THREE.Vector3(0, 0.2, 0));
        this.effects.blockBurst(point, b.clone().sub(a).normalize(), { parry: true });
        this.#play(parryRecipe(), point, 0.75);
        break;
      }
      case 'whoosh': {
        // the spin heard going round, quicker as it quickens
        const turning = (galeTurns(cue.at + 0.05) - galeTurns(cue.at - 0.05)) / 0.1;
        this.#play(vortexWhooshRecipe(Math.random, { rate: Math.max(2 * Math.PI, 2 * Math.PI * turning) }), this.#chest(heroRoot), 0.32);
        break;
      }
      case 'liftoff': {
        // the air under him all at once: a ring of it off the ground, a blast out across it, and he rises
        const feet = heroRoot.getWorldPosition(new THREE.Vector3());
        this.effects.groundShock(feet, { radius: 3.2 });
        const groundAt = (x, z, y) => surfaceHeightAt(x, z, y + 0.5, this.world);
        // (out to either side across the shot, low: never at the camera, where it would fill the frame)
        this.camera.getWorldDirection(_p);
        const across = new THREE.Vector3(-_p.z, 0, _p.x).normalize();
        for (const side of [1, -1]) {
          this.effects.galeBlast({ x: feet.x, y: feet.y + 0.3, z: feet.z }, { x: across.x * side, y: -0.06, z: across.z * side }, LIFTOFF_CONE, { groundAt });
        }
        this.#play(groundSlamRecipe(), feet, 0.45);
        this.#play(galeReleaseRecipe(), this.#chest(heroRoot), 0.8);
        // (the one standing nearest takes the blast in his cloak)
        if (rival) rival.instance.animator.cloth?.gust(this.#windAt(rivalRoot, feet, GALE_GUST * 1.6));
        break;
      }
      case 'skyward':
        this.#play(vortexEndRecipe(), this.#chest(heroRoot), 0.6);
        this.#play(galeReleaseRecipe(), this.#chest(heroRoot), 0.5);
        break;
      case 'handover':
        // the round is his now: the rival who stared after him makes it from here (tourCast.mjs: visual only)
        if (rival) this.#applyCast(handOver(this.cast, index));
        break;
      case 'clash': {
        if (!rivalRoot) break;
        const a = this.#chest(heroRoot);
        const b = this.#chest(rivalRoot);
        const point = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.1, 0));
        this.effects.blockBurst(point, b.clone().sub(a).normalize(), { heavy: Boolean(cue.heavy) });
        this.#play(blockRecipe(Math.random, { heavy: Boolean(cue.heavy) }), point, 0.6);
        break;
      }
      case 'hit': {
        if (!rivalRoot) break;
        const point = this.#chest(rivalRoot);
        this.effects.hitBurst(point, point.clone().sub(this.#chest(heroRoot)).normalize(), { strike: 1 });
        this.#play(swordHitRecipe(Math.random, { strike: 1 }), point, 0.55);
        break;
      }
      case 'spin':
        for (let k = 0; k < 3; k += 1) this.#play(swingRecipe(Math.random, { strike: 2 }), this.#chest(heroRoot), 0.45, k * cue.seconds / 3.2);
        break;
      case 'gather':
        this.#play(castRecipe(Math.random, { spell: cue.spell, release: cue.release ?? 0.35 }), this.#chest(actor), 0.55);
        break;
      case 'cast': {
        if (!rivalRoot) break;
        const caster = cue.by === 'rival' ? rival.instance : traveller.instance;
        const from = this.#socket(caster, 'socket_sorcery');
        let to;
        if (cue.over) {
          // at the Spellblade's head, and on past him: he is not there when it arrives
          const across = this.frames[index].u;
          to = this.#chest(heroRoot).add(new THREE.Vector3(0, 0.35, 0)).addScaledVector(across, -4.2);
          to.y = 1.2;
        } else if (cue.up) {
          // into the sky, a little out over the rival and on up out of the scene (unhurried enough to be seen going): it
          // hits nothing and never comes back
          to = from.clone().addScaledVector(this.frames[index].u, 1.6).add(new THREE.Vector3(0, 12, 0));
        } else {
          to = this.#chest(rivalRoot);
        }
        this.projectiles.push({ id: `tour-${index}-${cue.at}`, spell: cue.spell, from, to, start: this.time, flight: cue.flight, vanish: Boolean(cue.up) });
        break;
      }
      case 'impact': {
        const flight = this.projectiles.find((projectile) => projectile.id.startsWith(`tour-${index}-`));
        const point = flight ? flight.to.clone() : this.#chest(rivalRoot);
        this.projectiles = this.projectiles.filter((projectile) => projectile !== flight);
        this.effects.impact(point, { spell: cue.spell, radius: cue.radius ?? 2.2, ground: 0 });
        this.#play(cue.spell === 'frostfire' ? frostImpactRecipe() : fireballImpactRecipe(), point, 0.75);
        // fire into a frozen knight: it glows through the ice
        if (rival?.crust && cue.spell === 'fireball') rival.heatAt = this.time;
        break;
      }
      // the Slush: the ice closing over him, his going soft, the heap, the vessel, the scoop, the dregs
      case 'freeze':
        if (rival && !rival.crust) {
          rival.crust = iceCrust(rival.instance, seeded(11 + index));
          const point = this.#chest(rivalRoot);
          this.effects.sparks(point, 0xd8f6ff, 10);
          this.#play(freezeRecipe(Math.random, { seconds: cue.seconds ?? 0.45 }), point, 0.6);
        }
        break;
      case 'melt':
        if (rival) {
          const point = this.#chest(rivalRoot);
          rival.crust?.shed(this.debris, seeded(23 + index));
          this.effects.steam(point, { count: 5, spread: 0.5 });
          this.#play(meltHissRecipe(Math.random, { seconds: cue.seconds ?? 1 }), point, 0.6);
          this.#play(slushCollapseRecipe(), rivalRoot.getWorldPosition(new THREE.Vector3()), 0.65, 0.35);
        }
        break;
      case 'slush':
        if (rival && !rival.pile) {
          rival.pile = slushPile(this.scene, { at: rivalRoot.getWorldPosition(new THREE.Vector3()), tint: rival.look.tint, random: seeded(31 + index) });
          rival.pile.group.visible = this.visible;
        }
        break;
      case 'vessel':
        this.vessel?.dispose();
        this.vessel = vesselProp(this.scene, { kind: cue.kind, tint: rival?.look.tint ?? RIVAL_DRESS[index].tint });
        this.vessel.update({ visible: false });
        this.#play(vesselRecipe(Math.random, { kind: cue.kind }), this.#chest(heroRoot), 0.5);
        break;
      case 'scoop':
        if (rival?.pile) {
          // all of it in the one sweep (the heap goes as the vessel goes through it: #poseHero), and the ice that fell
          // in it gathered up too
          if (cue.last) rival.crust?.collect(this.debris);
          this.#play(scoopRecipe(Math.random, { kind: cue.kind, last: Boolean(cue.last) }), rival.pile.group.position, 0.65);
        }
        break;
      case 'dregs': {
        const hand = this.#socket(traveller.instance, 'socket_sorcery');
        rival?.pile?.splash({ x: hand.x, z: hand.z });
        this.#play(splashRecipe(), new THREE.Vector3(hand.x, 0, hand.z), 0.5);
        break;
      }
      // Sky-Bait: the rival now remembers the Fireball that went up; paid off, he no longer does; flat on the ground
      case 'remember':
        this.memory.skyBait = index;
        break;
      case 'forget':
        if (this.memory.skyBait === index) this.memory.skyBait = null;
        break;
      case 'fall':
        if (rivalRoot) this.#play(armourFallRecipe(), rivalRoot.getWorldPosition(new THREE.Vector3()), 0.6);
        break;
      case 'stow':
        this.#play(vesselRecipe(Math.random, { kind: cue.kind }), this.#chest(heroRoot), 0.45);
        this.vessel?.dispose();
        this.vessel = null;
        break;
      case 'burn':
        if (rival) this.burns.push({ rival, index, started: this.time, seconds: cue.seconds, lick: 0 });
        break;
      case 'shatter':
        if (rival && !rival.shattered) {
          rival.shattered = true;
          shatterKnight(rival.instance, this.debris, seeded(7 + index));
          this.#play(swordHitRecipe(Math.random, { strike: 2 }), this.#chest(rivalRoot), 0.6);
        }
        break;
      case 'cut':
        if (rival && !rival.stub) {
          const point = this.#socket(rival.instance, 'socket_sword');
          rival.stub = cutSword(rival.instance, this.debris, { aim: THIRD_PERSON_SWORD_ARM.aim, throwDirection: this.frames[index].u.clone() });
          this.effects.sparks(point, 0xfff1c2, 16);
          this.#play(parryRecipe(), point, 0.7);
        }
        break;
      case 'flag':
        if (rival) {
          const point = this.#socket(rival.instance, 'socket_sword');
          if (rival.stub) { mendSword(rival.instance, rival.stub); rival.stub = null; }
          // the sword the flag replaces is gone too
          rival.instance.root.traverse((object) => { if (object.isMesh && /^HeroSword/i.test(object.name)) object.visible = false; });
          rival.flag = whiteFlag(rival.instance, { aim: THIRD_PERSON_SWORD_ARM.aim });
          this.effects.sparks(point, 0xbfefff, 22);
          this.#play(castRecipe(Math.random, { spell: 'frostfire', release: 0 }), point, 0.45);
        }
        break;
      case 'dizzy':
        // stars round his head while the world goes round
        this.stars?.dispose();
        this.stars = dizzyStars(this.scene, traveller.instance);
        this.starsUntil = this.time + (cue.seconds ?? 1.8);
        break;
      case 'voice':
        // a line, or a moment (its lines, the first said the only one: voiceLines.mjs); his lines are his, said only
        // while the round is his
        if (this.voice && traveller.kind === HERO && Math.random() < cue.chance) {
          if (cue.moment) linesFor('tour-spellblade', [cue.moment]).some((say) => this.#say(say.line));
          else this.#say(cue.line);
        }
        break;
      default:
        break;
    }
  }

  #stepProjectiles() {
    const live = [];
    // (one sent up into the sky is gone once it has risen out of the scene: nothing comes back down)
    this.projectiles = this.projectiles.filter((projectile) => !(projectile.vanish && this.time - projectile.start >= projectile.flight));
    for (const projectile of this.projectiles) {
      const t = Math.min(1, (this.time - projectile.start) / projectile.flight);
      if (t < 0) continue;
      const position = projectile.from.clone().lerp(projectile.to, t);
      position.y += Math.sin(Math.PI * t) * 0.25;
      const velocity = projectile.to.clone().sub(projectile.from).divideScalar(projectile.flight);
      live.push({ id: projectile.id, spell: projectile.spell, position, velocity });
    }
    this.effects.syncProjectiles(live);
  }

  #stepStars() {
    if (!this.stars) return;
    // they fade in, circle, and fade as he steadies
    const left = this.starsUntil - this.time;
    if (left <= 0) {
      this.stars.dispose();
      this.stars = null;
      return;
    }
    this.stars.update(this.time, Math.min(1, left / 0.4));
  }

  #stepBurns(dt) {
    this.burns = this.burns.filter((burn) => {
      const age = this.time - burn.started;
      const { rival } = burn;
      rival.charred = Math.min(1, age / (burn.seconds * 0.75));
      rival.dress.char(rival.charred);
      const flames = age < burn.seconds + 1.5;
      this.effects.afflict(`tour-burn-${burn.index}`, flames ? rival.holder.getWorldPosition(new THREE.Vector3()) : null, { burning: flames }, dt);
      burn.lick -= dt;
      if (flames && burn.lick <= 0) {
        burn.lick = 0.42;
        this.#play(burnLickRecipe(), this.#chest(rival.holder), 0.4);
      }
      return age < burn.seconds + 2;
    });
  }

  // ------------------------------------------------------------------------------------------------------- wind
  // The Gale's wind while a fight's traveller pose has it (`wind`, 0..1): wisps of air drawn in round him as it
  // gathers, a funnel of it standing up round him (the Gale's own gust, turned to blow upward from his feet: Effects
  // galeBlast), quicker as it strengthens; and the cape of the rival he is fighting flung about by it, the harder the
  // nearer and the stronger it blows.
  #stepWind(moment, dt) {
    const fight = moment.phase === 'fight' ? this.fights[moment.fight] : null;
    const t = fight ? moment.fightTimes[moment.fight] : 0;
    const pose = fight ? fight.hero(t) : null;
    const wind = Math.max(0, Math.min(1, pose?.wind ?? 0));
    if (wind <= 0.02 || !this.visible) {
      if (this.wind && wind <= 0.02) this.#stopWind();
      return;
    }
    const root = this.traveller.root;
    const feet = root.getWorldPosition(new THREE.Vector3());
    this.wind ??= { at: this.time, wisps: 0, gust: 0, push: 0.3 };
    // the funnel: one body of air round him, turning with him, rising with him
    this.funnel ??= galeFunnel(this.scene);
    this.funnel.update({ position: feet, strength: wind, turn: -(pose.heading ?? 0), dt, visible: this.visible });
    // the wisps drawn in to him as it gathers
    this.wind.wisps -= dt;
    if (this.wind.wisps <= 0 && wind < 0.85) {
      this.wind.wisps = 0.45;
      const gather = this.effects.galeGather(() => ({ origin: this.#chest(root) }), { gatherSec: 0.6 });
      if (gather) this.wind.gathering = gather;
    }
    const rival = this.rivals[moment.fight];
    const standing = rival && rival.holder.visible ? rival.holder.getWorldPosition(new THREE.Vector3()) : null;
    // the air driven off it at the one giving ground: a low gust now and then, raising the dust about his feet
    this.wind.push -= dt;
    if (standing && this.wind.push <= 0 && wind > 0.45 && !this.flying) {
      this.wind.push = 0.75 - 0.3 * wind;
      const way = standing.clone().sub(feet).setY(0).normalize();
      const groundAt = (x, z, y) => surfaceHeightAt(x, z, y + 0.5, this.world);
      this.effects.galeBlast({ x: feet.x + way.x * 0.6, y: 0.55, z: feet.z + way.z * 0.6 }, { x: way.x, y: 0.02, z: way.z }, PUSH_CONE, { groundAt });
    }
    // the rival's cape: flung away from him, gusting (never quite the same twice), several times a second
    this.wind.gust -= dt;
    if (this.wind.gust <= 0 && standing) {
      this.wind.gust = 0.12;
      const gusting = 0.75 + 0.5 * Math.sin(this.time * 9.1) * Math.sin(this.time * 3.7);
      rival.instance.animator.cloth?.gust(this.#windAt(rival.holder, feet, GALE_GUST * wind * gusting));
    }
  }

  // the wind at a knight from a point: away from it, weaker with distance (out to GALE_REACH), swirling a little
  #windAt(object, from, strength) {
    const at = object.getWorldPosition(new THREE.Vector3());
    const away = at.sub(from).setY(0);
    const distance = away.length();
    if (distance < 1e-3) return { x: 0, z: 0 };
    const falloff = Math.max(0, 1 - distance / GALE_REACH);
    away.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
    return { x: away.x * strength * falloff, z: away.z * strength * falloff };
  }

  #stopWind() {
    this.wind?.gathering?.cancel?.();
    this.wind = null;
    this.funnel?.update({ strength: 0 });
  }

  // armour hitting the ground: a clang for each landing, but never a wall of them at once
  #clatter(point, impact) {
    if (this.time - (this.lastClatter ?? -1) < 0.05) return;
    this.lastClatter = this.time;
    this.#play(wallClangRecipe(), point, Math.min(0.45, 0.12 + impact * 0.06));
  }

  // --------------------------------------------------------------------------------------------------- sound
  #play(recipe, point, gain = 0.5, delay = 0) {
    if (!this.sound?.running) return;
    const place = this.#hear(point);
    this.sound.play(recipe, { pan: place.pan, gain: gain * place.gain, delay });
  }

  #hear(point) {
    this.camera.getWorldDirection(_p);
    const yaw = Math.atan2(-_p.x, -_p.z);
    return spatialize(this.camera.position, yaw, point);
  }

  #say(line) {
    // heard like another knight's voice nearby: from where he stands (his words carry), a touch of the courtyard, no
    // echo; and written out on the menu's subtitle, beat by beat as he gets to it (onCaption)
    this.camera.getWorldDirection(_p);
    const place = voicePlacement(this.camera.position, Math.atan2(-_p.x, -_p.z), this.#chest(this.traveller.root), hearingFor(line));
    if (!place) return false;
    const said = this.voice.say(line, { speaker: 'tour-spellblade', pan: place.pan, gain: 0.8 * place.gain, reverb: place.reverb });
    if (said) this.onCaption?.({ line, delay: said.delay ?? 0, seconds: said.seconds ?? 2, beats: said.beats ?? null });
    return Boolean(said);
  }

  // -------------------------------------------------------------------------------------------------- camera
  // following him on the run (from behind and to his left, so he runs on the right of the frame, closer and higher
  // where scenery is in the way: tourCamera.mjs), and framing each fight to the right of the banner; eased between
  #camera(moment, dt) {
    const hero = this.traveller.root.getWorldPosition(new THREE.Vector3());
    // (the camera stays on the ground with whoever is left when he flies off)
    hero.y = 0;
    const onPath = this.heroDistance ?? moment.distance;
    const here = this.path.at(onPath);
    const forward = new THREE.Vector3(here.dir[0], 0, here.dir[1]);
    // screen-left when looking along a horizontal direction d is (d.z, 0, -d.x) in this world
    const left = new THREE.Vector3(forward.z, 0, -forward.x);
    const lens = this.compact ? COMPACT_SHOT : null;
    const eye = followEye(here, this.follow.at(onPath));
    // (aimed ahead of him and to his left, so he runs on the right of the frame clear of the banner; with the banner
    // drawn aside, nearly at him: the middle of the stage, a little room kept ahead)
    const aim = hero.clone().addScaledVector(forward, 2.6).addScaledVector(left, 1.2 - 0.85 * this.framing).add(new THREE.Vector3(0, 1.1, 0));
    const followFov = lens?.followFov ?? FIGHT_SHOT.fov;
    const follow = {
      position: new THREE.Vector3(...eye),
      // turned just enough to keep him clear of the banner (on a narrow screen he runs further right of it)
      target: new THREE.Vector3(...followAim(eye, [hero.x, hero.z], aim.toArray(), { aspect: this.camera.aspect, clear: this.clear, fov: followFov })),
      fov: followFov,
    };
    // how much the nearest fight holds the frame: from a second before he stops until he is under way again
    let weight = 0;
    let fightView = null;
    this.frames.forEach((frame, index) => {
      const t = moment.fightTimes[index];
      const fight = this.fights[index];
      const w = Math.min(1, Math.max(0, (t + 1.4) / 1.2)) * Math.min(1, Math.max(0, (fight.duration + 1.0 - t) / 1.2));
      if (w > weight) {
        weight = w;
        // both knights where the script has them a beat from now (a leap back, a stroll round, a run for it), framed
        // right of the banner (tourCamera.mjs)
        const pair = fightPair(fight, frame.plan, t + FIGHT_SHOT.lead);
        const shot = fightShot(pair.hero, pair.rival, frame.look, {
          aspect: this.camera.aspect, clear: this.clear, held: pair.held, fov: lens?.fov ?? FIGHT_SHOT.fov, fill: lens?.fill ?? 1, near: pair.near, up: pair.up,
        });
        fightView = { position: new THREE.Vector3(...shot.position), target: new THREE.Vector3(...shot.target), fov: shot.fov };
      }
    });
    const eased = weight * weight * (3 - 2 * weight);
    let want = fightView ? {
      position: follow.position.clone().lerp(fightView.position, eased),
      target: follow.target.clone().lerp(fightView.target, eased),
      fov: follow.fov + (fightView.fov - follow.fov) * eased,
    } : follow;
    // The introductory shot lets him go once. Subsequent circuits keep following the closed path.
    // (the shot turned to the middle of the stage, as far as the banner is drawn aside)
    const homeShot = this.home && this.homeObserve && this.framing > 0 ? {
      position: this.home.position.clone().lerp(this.homeObserve.position, this.framing),
      target: this.home.target.clone().lerp(this.homeObserve.target, this.framing),
      fov: this.home.fov + (this.homeObserve.fov - this.home.fov) * this.framing,
    } : this.home;
    if (homeShot && this.round === 0) {
      const rest = this.schedule.pace.rest;
      const leaving = moment.time <= rest ? 1 : Math.max(0, 1 - (moment.time - rest) / 2.4);
      const home = leaving;
      const h = home * home * (3 - 2 * home);
      if (h > 0) {
        want = {
          position: want.position.clone().lerp(homeShot.position, h),
          target: want.target.clone().lerp(homeShot.target, h),
          fov: want.fov + (homeShot.fov - want.fov) * h,
        };
      }
    }
    // a steadicam: the camera eases after the shot it wants
    if (!this.view) this.view = { position: want.position.clone(), target: want.target.clone(), fov: want.fov };
    const k = 1 - Math.exp(-dt * 3.2);
    this.view.position.lerp(want.position, k);
    this.view.target.lerp(want.target, k);
    this.view.fov += (want.fov - this.view.fov) * k;
    // never inside anything, nor with anything between it and him (a pillar's edge, passing): moved on toward him
    this.view.position.set(...clearEye(this.view.position.toArray(), [hero.x, hero.y + 1.2, hero.z], this.blockers));
    // and whatever it is doing, it never lets him slip behind the banner (setting off, he walks straight across the
    // front door's shot, faster than the steadicam follows)
    if (!this.flying && !this.travellerAway) {
      this.view.target.set(...followAim(this.view.position.toArray(), [hero.x, hero.z], this.view.target.toArray(), {
        aspect: this.camera.aspect, clear: this.clear, fov: this.view.fov,
      }));
    }
    // where the light should follow (the sun's shadow box: MenuScene), and how far down the fade between maps is
    this.view.focus = hero;
    this.view.fade = this.travelFade;
    return this.view;
  }

  dispose() {
    // (the menu going: everything forgotten, the rivals' memory with it)
    this.memory.skyBait = null;
    this.#resetRivals();
    this.#stopWind();
    this.funnel?.dispose();
    this.funnel = null;
    if (this.hero?.root) this.hero.root.visible = true;
    for (const rival of this.knights) {
      if (!rival) continue;
      this.scene.remove(rival.holder);
      rival.instance.dispose();
    }
  }
}
