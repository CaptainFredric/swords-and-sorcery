import * as THREE from 'three';
import { Effects } from '../../game/Effects.mjs';
import { createSpellbladeAsset } from '../../game/SpellbladeAssets.mjs';
import { THIRD_PERSON_SPELL_ARM, THIRD_PERSON_SWORD_ARM, solveArm } from '../../game/swordArmIK.mjs';
import { performanceAt } from '../menuReactions.mjs';
import {
  blockRecipe, burnLickRecipe, castRecipe, fireballImpactRecipe, parryRecipe, spatialize, swingRecipe, swordHitRecipe, wallClangRecipe,
} from '../../game/sound/soundRecipes.mjs';
import { buildTourPath, yawFacing } from './tourPath.mjs';
import { voicePlacement } from '../../game/sound/voiceRules.mjs';
import { footstepRecipe, gaitFootfall, surfaceAt, variantPicker } from '../../game/sound/footsteps.mjs';
import { CASTLEWARD } from '../../../shared/worlds/castleward.mjs';
import {
  COMPACT_SHOT, FIGHT_SHOT, castlewardBlockers, fightPair, fightShot, followAim, followEye, followPlan, lookFor, placeFight,
} from './tourCamera.mjs';
import { FIGHT_POOL } from './tourFights.mjs';
import { FIGHT_DISTANCES, buildSchedule, lineupFor, roundRandom, tourMoment } from './tourSchedule.mjs';
import { Debris, cutSword, dizzyStars, dressRival, mendSword, shatterKnight, whiteFlag } from './tourProps.mjs';

// The Spellblade's round behind the front door, played out: he runs the path, stops at each rival, and they fight to
// the script in tourFights.mjs; the camera follows him and frames each fight to the right of the menu banner. Three
// rivals are dressed in their own colours (another Spellblade, but not him), and everything they go through (burned,
// shattered, disarmed and sent running) is undone out of sight before the next round. Each round stages the pool's
// fights in a different order at the three stops (lineupFor), each placed where it has room and a clear view.

const RUN_CLIP_SPEED = 7.5;         // the Run clip's own pace (m/s): the stride rate follows the actual pace
// each rival's colours: steel tint and the glow behind the visor
export const RIVAL_DRESS = Object.freeze([
  { tint: [0.5, 0.5, 0.56], visor: 0xff5a2a },       // the Ashen Knight: blackened steel, ember eyes
  { tint: [0.6, 1.08, 0.58], visor: 0x9dff6a },      // the Verdant Knight
  { tint: [1.3, 1.02, 0.55], visor: 0xffc84a },      // the Gilded Knight
]);

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
  constructor({ scene, camera, hero, sound = null, voice = null, effects = null }) {
    this.scene = scene;
    this.camera = camera;
    this.hero = hero;
    this.sound = sound;
    this.voice = voice;
    this.path = buildTourPath();
    this.effects = effects ?? new Effects(scene, camera);
    this.ownsEffects = !effects;
    this.debris = new Debris(scene, { onLand: (point, impact) => this.#clatter(point, impact) });
    this.time = 0;
    this.lastMoment = null;
    this.rivals = [];
    this.ready = false;
    this.projectiles = [];
    this.burns = [];
    this.pause = 0;
    this.performance = null;
    // the front door's own shot: the round starts and ends on it
    this.home = null;
    // the part of the screen clear of the menu's banner (shares of its width), and whether the screen is a small one
    // (the knights a little smaller: COMPACT_SHOT), both kept up to date by MenuScene
    this.clear = FIGHT_SHOT.clear;
    this.compact = false;
    this.visible = false;
    this.blockers = castlewardBlockers();
    // where each version of each fight goes at each stop, worked out once (tourCamera.placeFight)
    this.placements = new Map();
    this.#stageRound(0);
    this.follow = followPlan(this.path, this.blockers);
    this.#spawnRivals();
  }

  // this round's fights at the three stops, their frames and the schedule they make
  #stageRound(round) {
    this.round = round;
    const random = roundRandom(round);
    const first = lineupFor(0);
    const placed = lineupFor(round).map((name, slot) => this.#placed(name, slot, random) ?? this.#placed(first[slot], slot, random));
    this.fights = placed.map((each) => each.fight);
    this.frames = placed.map((each) => this.#frame(each));
    this.schedule = buildSchedule(this.path.length, { fights: this.fights });
  }

  // the first version of a fight from the pool that has room and a clear view at this stop
  #placed(name, slot, random) {
    for (const fight of FIGHT_POOL[name](random)) {
      const key = `${fight.key ?? fight.id}@${slot}`;
      if (!this.placements.has(key)) this.placements.set(key, placeFight(this.path, fight, FIGHT_DISTANCES[slot], this.blockers));
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
      this.rivals[index] = { holder, instance, dress: dressRival(instance, RIVAL_DRESS[index]), stub: null, flag: null, shattered: false, charred: 0 };
    });
    this.ready = true;
  }

  /** Start the round over (the first round, as the fights were written): the Spellblade at his place, every rival
   * whole and waiting. */
  restart() {
    this.time = 0;
    this.lastMoment = null;
    this.pause = 0;
    this.performance = null;
    this.#stageRound(0);
    this.#resetRivals();
  }

  #resetRivals() {
    this.stars?.dispose();
    this.stars = null;
    this.debris.clear();
    this.projectiles = [];
    this.effects.syncProjectiles([]);
    this.burns = [];
    for (const rival of this.rivals) {
      if (!rival) continue;
      rival.flag?.dispose();
      rival.flag = null;
      if (rival.stub) mendSword(rival.instance, rival.stub);
      rival.stub = null;
      rival.dress.restore();
      rival.charred = 0;
      rival.shattered = false;
      rival.instance.root.visible = true;
      rival.holder.visible = true;
    }
  }

  /** Show or hide everything the round brings (the rivals and what is left of them). */
  setVisible(visible) {
    this.visible = visible;
    for (const rival of this.rivals) if (rival) rival.holder.visible = visible && !rival.shattered;
    for (const piece of this.debris.pieces) piece.mesh.visible = visible;
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
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.performance) this.performance.elapsed += dt;
    } else {
      this.performance = null;
      this.time += dt;
    }
    // a new round: another lineup, and everyone back to their places (the Spellblade is home, far from all of them)
    if (this.time >= this.schedule.duration) {
      this.time -= this.schedule.duration;
      this.#stageRound(this.round + 1);
      this.#resetRivals();
      this.lastMoment = null;
    }
    const moment = tourMoment(this.schedule, this.time);
    this.#poseHero(moment, dt);
    this.#poseRivals(moment, dt);
    this.#fireCues(moment);
    this.#stepProjectiles();
    this.#stepBurns(dt);
    this.debris.update(dt);
    for (const rival of this.rivals) rival?.flag?.update(this.time);
    this.#stepStars();
    if (this.ownsEffects) this.effects.update(dt);
    this.lastMoment = moment;
    return this.#camera(moment, dt);
  }

  // ------------------------------------------------------------------------------------------------ the Spellblade
  #poseHero(moment, dt) {
    const { root, instance } = this.hero;
    let plan;
    let position;
    let yaw;
    let snap = false;
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
      } else {
        ({ position, yaw } = this.#place(frame, pose));
      }
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
    root.position.copy(position);
    // the turn is eased (a knight turns in a moment, never snaps), except in a spin, which is all turn
    root.rotation.y = this.heroYaw === undefined || snap ? yaw : angleLerp(this.heroYaw, yaw, Math.min(1, dt * 12));
    this.heroYaw = root.rotation.y;
    instance.animator.apply(plan, dt);
    this.#footfall('hero', instance, root.position, plan.clip);
  }

  // his feet on the ground as the gait clip puts them down (its rate follows his pace), on whatever is underfoot
  #footfall(key, instance, position, clip) {
    const gait = instance.animator.gaitPhase;
    this.lastGait ??= {};
    const before = this.lastGait[key];
    this.lastGait[key] = gait;
    if (!this.sound || !this.visible || (clip !== 'Run' && clip !== 'Sprint') || !gaitFootfall(before, gait)) return;
    this.stepVariant ??= variantPicker();
    const recipe = footstepRecipe(Math.random, { surface: surfaceAt(CASTLEWARD, position.x, position.z, position.y), variant: this.stepVariant(key) });
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
      if (!rival || rival.shattered) return;
      const fight = this.fights[index];
      const t = moment.fightTimes[index];
      const pose = fight.rival(t);
      if (pose.gone) {
        rival.holder.visible = false;
        return;
      }
      rival.holder.visible = true;
      const { position, yaw } = this.#place(this.frames[index], pose);
      rival.holder.position.copy(position);
      rival.holder.rotation.y = yaw;
      // one waiting far from the Spellblade casts no shadow: nobody would see it, and each of his pieces is a draw call
      const near = position.distanceTo(this.hero.root.position) < 10;
      if (rival.shadows !== near) {
        rival.shadows = near;
        rival.instance.root.traverse((object) => { if (object.isMesh) object.castShadow = near; });
      }
      const plan = this.#plan(pose);
      rival.instance.animator.apply(plan, dt);
      this.#footfall(`rival-${index}`, rival.instance, position, plan.clip);
    });
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
    const heroRoot = this.hero.root;
    const rivalRoot = rival?.holder;
    const actor = cue.by === 'rival' ? rivalRoot : heroRoot;
    switch (cue.type) {
      case 'swing':
        this.#play(swingRecipe(Math.random, { strike: cue.heavy ? 2 : 0 }), this.#chest(actor), 0.5);
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
        this.#play(castRecipe(Math.random, { spell: cue.spell, release: 0.35 }), this.#chest(actor), 0.55);
        break;
      case 'cast': {
        if (!rivalRoot) break;
        const caster = cue.by === 'rival' ? rival.instance : this.hero.instance;
        const from = this.#socket(caster, 'socket_sorcery');
        let to;
        if (cue.over) {
          // at the Spellblade's head, and on past him: he is not there when it arrives
          const across = this.frames[index].u;
          to = this.#chest(heroRoot).add(new THREE.Vector3(0, 0.35, 0)).addScaledVector(across, -4.2);
          to.y = 1.2;
        } else {
          to = this.#chest(rivalRoot);
        }
        this.projectiles.push({ id: `tour-${index}-${cue.at}`, spell: cue.spell, from, to, start: this.time, flight: cue.flight });
        break;
      }
      case 'impact': {
        const flight = this.projectiles.find((projectile) => projectile.id.startsWith(`tour-${index}-`));
        const point = flight ? flight.to.clone() : this.#chest(rivalRoot);
        this.projectiles = this.projectiles.filter((projectile) => projectile !== flight);
        this.effects.impact(point, { spell: cue.spell, radius: 2.2, ground: 0 });
        this.#play(fireballImpactRecipe(), point, 0.75);
        break;
      }
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
        this.stars = dizzyStars(this.scene, this.hero.instance);
        this.starsUntil = this.time + (cue.seconds ?? 1.8);
        break;
      case 'voice':
        if (this.voice && Math.random() < cue.chance) this.#say(cue.line);
        break;
      default:
        break;
    }
  }

  #stepProjectiles() {
    const live = [];
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
    // heard like another knight's voice nearby: from where he stands, a touch of the courtyard, no echo
    this.camera.getWorldDirection(_p);
    const place = voicePlacement(this.camera.position, Math.atan2(-_p.x, -_p.z), this.#chest(this.hero.root));
    if (place) this.voice.say(line, { speaker: 'tour-spellblade', pan: place.pan, gain: 0.8 * place.gain, reverb: place.reverb });
  }

  // -------------------------------------------------------------------------------------------------- camera
  // following him on the run (from behind and to his left, so he runs on the right of the frame, closer and higher
  // where scenery is in the way: tourCamera.mjs), and framing each fight to the right of the banner; eased between
  #camera(moment, dt) {
    const hero = this.hero.root.getWorldPosition(new THREE.Vector3());
    const onPath = this.heroDistance ?? moment.distance;
    const here = this.path.at(onPath);
    const forward = new THREE.Vector3(here.dir[0], 0, here.dir[1]);
    // screen-left when looking along a horizontal direction d is (d.z, 0, -d.x) in this world
    const left = new THREE.Vector3(forward.z, 0, -forward.x);
    const lens = this.compact ? COMPACT_SHOT : null;
    const eye = followEye(here, this.follow.at(onPath));
    const aim = hero.clone().addScaledVector(forward, 2.6).addScaledVector(left, 1.2).add(new THREE.Vector3(0, 1.1, 0));
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
          aspect: this.camera.aspect, clear: this.clear, held: pair.held, fov: lens?.fov ?? FIGHT_SHOT.fov, fill: lens?.fill ?? 1,
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
    // at his place the front door's own shot holds; it lets him go as he sets off and takes him back as he comes home
    if (this.home) {
      const rest = this.schedule.pace.rest;
      const leaving = moment.time <= rest ? 1 : Math.max(0, 1 - (moment.time - rest) / 2.4);
      const arriving = Math.max(0, Math.min(1, (moment.time - (this.schedule.duration - 2.2)) / 1.8));
      const home = Math.max(leaving, arriving);
      const h = home * home * (3 - 2 * home);
      if (h > 0) {
        want = {
          position: want.position.clone().lerp(this.home.position, h),
          target: want.target.clone().lerp(this.home.target, h),
          fov: want.fov + (this.home.fov - want.fov) * h,
        };
      }
    }
    // a steadicam: the camera eases after the shot it wants
    if (!this.view) this.view = { position: want.position.clone(), target: want.target.clone(), fov: want.fov };
    const k = 1 - Math.exp(-dt * 3.2);
    this.view.position.lerp(want.position, k);
    this.view.target.lerp(want.target, k);
    this.view.fov += (want.fov - this.view.fov) * k;
    // and whatever it is doing, it never lets him slip behind the banner (setting off, he walks straight across the
    // front door's shot, faster than the steadicam follows)
    this.view.target.set(...followAim(this.view.position.toArray(), [hero.x, hero.z], this.view.target.toArray(), {
      aspect: this.camera.aspect, clear: this.clear, fov: this.view.fov,
    }));
    return this.view;
  }

  dispose() {
    this.#resetRivals();
    for (const rival of this.rivals) {
      if (!rival) continue;
      this.scene.remove(rival.holder);
      rival.instance.dispose();
    }
  }
}
