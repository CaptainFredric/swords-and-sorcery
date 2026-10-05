import * as THREE from 'three';
import { ARMORY_SHOWCASES, framingAt, showcaseShot } from './showcaseSheets.mjs';
import { lerpShot } from './menuShots.mjs';
import { keyed } from './tour/tourFights.mjs';
import { dressRival } from './tour/tourProps.mjs';
import { RIVAL_DRESS } from './tour/TourDirector.mjs';
import { createSpellbladeAsset } from '../game/SpellbladeAssets.mjs';
import { createSunderBlade } from '../game/sunderBlade.mjs';
import { VORTEX_BLADES, createVortexBlade } from '../game/vortexBlade.mjs';
import { VORTEX_LIT_FROM, VORTEX_TRAIL_FROM } from '../game/RemotePlayers.mjs';
import { createElementalOrb } from '../game/elementalOrb.mjs';
import { createGaleOrb } from '../game/galeOrb.mjs';
import { THIRD_PERSON_SPELL_ARM, THIRD_PERSON_SWORD_ARM, solveArm } from '../game/swordArmIK.mjs';
import {
  blockRecipe, castRecipe, emberImpactRecipe, emberRecipe, galeGatherRecipe, galeReleaseRecipe, groundSlamRecipe, killRecipe,
  ruptureRunRecipe, spatialize, steelCallRecipe, sunderDongRecipe, sunderDropRecipe, sunderForceRecipe, swingRecipe, swordHitRecipe,
  vortexCatchRecipe, vortexEndRecipe, vortexIgniteRecipe, vortexStarRecipe, vortexWhooshRecipe, wallClangRecipe,
} from '../game/sound/soundRecipes.mjs';
import { surfaceAt } from '../game/sound/footsteps.mjs';
import { SPELLS, spellFor } from '../../shared/src/spells.mjs';
import { ULTIMATES } from '../../shared/src/ultimates.mjs';
import { RUPTURE, planRupture } from '../../shared/src/rupture.mjs';
import { findSwordWorldHit, surfaceHeightAt } from '../../shared/src/collision.mjs';
import { CASTLEWARD } from '../../shared/worlds/castleward.mjs';

// The Armory's ultimates performed on the menu's Spellblade (the sheets: showcaseSheets.mjs). It poses him and two
// rivals, and makes each cue real with what the game itself uses: the effects (Effects.mjs: the rupture, the Vortex's
// ignition and its fire, a guard's clash, a cut, a Gale, a thrown spell), the sounds (soundRecipes.mjs, heard from
// where each thing happens), and the knight's own presentation (the Sunder heat in the blade, the burning Vortex
// blade, the hardened plate of Steel). It runs no fight: everything that happens is written in the sheet.
//
// Each frame: pose(dt) gives the plan the Spellblade's animator applies; act(dt) (after it has, so his hands and his
// blade are where they are drawn) does what this moment brings. The rivals are made the first time one is wanted.

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
// the palm's prepared spells (beat 6 of Spells & Chivalry): the colour of the hand's light for each
const PALM_GLOW = Object.freeze({ fireball: 0xff7a2a, frostfire: 0x7fd6ff, gale: 0x7fd08e });
// the two rivals of Spells & Chivalry, in two of the round's colours (the Ashen and the Gilded Knight)
const SHOWCASE_DRESS = Object.freeze([RIVAL_DRESS[0], RIVAL_DRESS[2]]);
// the ground shaking under a slam: how far the camera is thrown, and how quickly that dies
const SLAM_SHAKE = Object.freeze({ size: 0.075, decay: 7 });

/** The Armory's arm gestures (armoryPreview.mjs) as procedural motion for the animator. */
export function armoryGestureMotion(gesture) {
  return {
    crouch: gesture.crouch,
    extra: [
      { bone: 'chest', axis: [0, -1, 0], angle: gesture.body },
      { bone: 'spine', axis: [-1, 0, 0], angle: gesture.crouch * 0.2 },
    ],
    solve: (bones) => {
      if (gesture.sword) solveArm(bones, THIRD_PERSON_SWORD_ARM, gesture.sword.target, gesture.sword.weight);
      if (gesture.spell) solveArm(bones, THIRD_PERSON_SPELL_ARM, gesture.spell.target, gesture.spell.weight);
    },
  };
}

export class ArmoryShowcase {
  /**
   * holder: the group he stands in (the showcase's frame); instance: his rig; effects(): the menu's Effects (made when
   * first wanted); steel()/hand(): his plate's sheen and his left hand's fist, shared with the Armory's gestures;
   * palmLight: the light in his palm; sound: the SoundEngine (optional).
   */
  constructor({ scene, camera, holder, instance, effects, steel, hand, palmLight, sound = null, world = CASTLEWARD }) {
    Object.assign(this, { scene, camera, holder, instance, effects, steel, hand, palmLight, sound, world });
    this.sheet = null;
    this.time = 0;
    this.fired = -Infinity;
    this.rivals = [];
    this.projectiles = [];
    this.shake = 0;
    this.shots = null;
    this.framed = 0;
  }

  get active() {
    return Boolean(this.sheet);
  }

  /**
   * Begin the showcase `id`. view: how the Armory's camera is looking, so the shot that keeps the showcase in view can
   * be worked out: { look ([x, z]), aspect, clear ([from, to] shares of the screen's width clear of the panel), fov }.
   */
  start(id, view) {
    this.stop();
    const sheet = ARMORY_SHOWCASES[id];
    if (!sheet) return false;
    this.sheet = sheet;
    this.time = 0;
    this.fired = -Infinity;
    this.fire = 0;
    this.vortexLit = false;
    this.vortexSpinning = false;
    // the palm's light as the showcase has it (the fire and the steel are lit by the effects themselves)
    if (this.palmLight && sheet.palmLight) {
      this.palmLight.color.setHex(sheet.palmLight.color);
      this.palmLight.intensity = sheet.palmLight.intensity;
    }
    if (sheet.rivals.length) this.#ensureRivals();
    // its shots, worked out now from where he stands and how the Armory looks at him
    this.holder.updateWorldMatrix(true, false);
    this.shots = sheet.framing.shots.map(({ points, rise, aim }) => showcaseShot(points.map(([x, z, reach]) => {
      this.holder.localToWorld(_a.set(x, 0, z));
      return [_a.x, _a.z, reach];
    }), view.look, { ...view, ...(rise === undefined ? {} : { rise }), ...(aim === undefined ? {} : { aim }) }));
    this.framed = 0;
    return true;
  }

  /** The shot the showcase wants now (eased between its own), for as much as `framed` says. */
  get shot() {
    if (!this.sheet || !this.shots?.length) return null;
    const { from, to, share } = framingAt(this.sheet.framing, this.time);
    return share > 0 ? lerpShot(this.shots[from], this.shots[to], share) : this.shots[from];
  }

  /** End it where it is: everything it brought put away, the Spellblade standing as he was. */
  stop() {
    if (!this.sheet) return;
    this.sheet = null;
    const root = this.instance.root;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    for (const rival of this.rivals) if (rival) rival.holder.visible = false;
    this.sunderBlade?.set(false);
    this.vortexBlade?.set(0, this.time, { swinging: false });
    // (the plate's sheen and the fist only if this one used them: either is made, and its shader built, when first
    // wanted)
    if (this.steeled) this.steel().set(0, null);
    if (this.clenched) this.hand().set(0);
    this.steeled = false;
    this.clenched = false;
    for (const orb of Object.values(this.palmOrbs ?? {})) orb.visible = false;
    this.projectiles = [];
    this.effects().syncProjectiles([]);
    this.galeGather?.cancel?.();
    this.spellGather?.cancel?.();
    this.shake = 0;
    this.framed = 0;
  }

  /** The Spellblade's animator plan for this frame (null when the showcase is over). */
  pose(dt) {
    if (!this.sheet) return null;
    this.time += dt;
    if (this.time >= this.sheet.duration) {
      this.stop();
      return null;
    }
    const t = this.time;
    const pose = this.sheet.hero(t);
    this.current = pose;
    this.framed = keyed(this.sheet.framing.weight, t);
    const root = this.instance.root;
    root.rotation.set(0, pose.turn, 0);
    root.position.set(0, pose.lift ?? 0, 0);
    // dizzy after a Vortex: the whole knight rocks as he steadies (as a knight does in a fight: RemotePlayers.mjs)
    if (pose.dizzy > 0) {
      root.rotation.z = Math.sin(t * 6.6) * 0.11 * pose.dizzy;
      root.rotation.x = Math.cos(t * 4.9) * 0.05 * pose.dizzy;
    }
    const gesture = pose.gesture ? armoryGestureMotion(pose.gesture) : null;
    const plan = { ...pose.plan };
    plan.motion = {
      crouch: (pose.crouch ?? 0) + (gesture?.crouch ?? 0),
      extra: [...(pose.rotations ?? []), ...(gesture?.extra ?? [])],
      solve: gesture?.solve,
      reactions: pose.reactions,
      now: t,
      yaw: pose.turn,
    };
    if (pose.gesture || this.clenched) {
      this.hand().set(pose.gesture?.fist ?? 0);
      this.clenched = Boolean(pose.gesture);
    }
    return plan;
  }

  /** What this moment brings, now that he is posed: the cues, his blade and plate, the rivals, the fire in flight. */
  act(dt) {
    if (!this.sheet || !this.current) return;
    const t = this.time;
    const pose = this.current;
    for (const cue of this.sheet.cues) if (cue.at > this.fired && cue.at <= t) this.#cue(cue);
    this.fired = t;
    if (pose.steel) {
      this.steel().set(pose.steel.strength, pose.steel.ripple);
      this.steeled = true;
    }
    if (pose.sunder !== undefined) {
      this.sunderBlade ??= createSunderBlade(this.instance.root);
      this.sunderBlade.set(pose.sunder, t);
    }
    this.#vortex(pose.vortex, dt);
    this.#palm(pose.palm, t);
    this.#poseRivals(t, dt);
    this.#stepProjectiles(dt);
    this.shake *= Math.exp(-SLAM_SHAKE.decay * dt);
  }

  /** The camera's shake now: an offset to add to its position (metres). */
  shakeOffset(t) {
    if (this.shake < 1e-4) return null;
    return [Math.sin(t * 71) * this.shake, Math.sin(t * 53 + 1.3) * this.shake * 1.4, Math.sin(t * 61 + 2.1) * this.shake];
  }

  // ------------------------------------------------------------------------------------------------------- places
  #world(x, y, z, target = new THREE.Vector3()) {
    return this.holder.localToWorld(target.set(x, y, z));
  }

  #chest(root) {
    return root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.3, 0));
  }

  #socket(instance, name) {
    const socket = instance.sockets?.[name];
    return socket ? socket.getWorldPosition(new THREE.Vector3()) : this.#chest(instance.root);
  }

  // the point of his sword (its socket, along the blade as the Vortex's fire measures it)
  #swordTip() {
    const socket = this.instance.sockets?.sword;
    if (!socket) return this.#chest(this.instance.root);
    const [x, y, z] = VORTEX_BLADES.thirdPerson.aim;
    return socket.localToWorld(new THREE.Vector3(x, y, z).multiplyScalar(VORTEX_BLADES.thirdPerson.length));
  }

  // which way he faces in the world, level
  #facing() {
    this.instance.root.getWorldQuaternion(_q);
    const way = new THREE.Vector3(0, 0, -1).applyQuaternion(_q);
    way.y = 0;
    return way.normalize();
  }

  // --------------------------------------------------------------------------------------------------------- cues
  #cue(cue) {
    const effects = this.effects();
    const hero = this.instance;
    const chest = this.#chest(hero.root);
    switch (cue.type) {
      case 'brace':
        this.#play(sunderDropRecipe(), chest, 1);
        break;
      case 'bell':
        this.#play(sunderDongRecipe(), chest, 0.95);
        break;
      case 'swing': {
        const by = cue.by === undefined || cue.by === 'hero' ? null : this.rivals[cue.by];
        if (cue.by !== undefined && cue.by !== 'hero' && !by) break;
        this.#play(swingRecipe(Math.random, { strike: cue.heavy ? 2 : 1 }), by ? this.#chest(by.holder) : chest, cue.heavy ? 0.75 : 0.6);
        break;
      }
      case 'slam':
        this.#slam();
        break;
      case 'ignite':
        this.#play(vortexIgniteRecipe(Math.random, { seconds: ULTIMATES.vortex.startupSec }), chest, 0.9);
        break;
      case 'catch':
        this.#play(vortexCatchRecipe(), chest, 0.9);
        effects.vortexIgnite(chest);
        break;
      case 'whoosh':
        this.#play(vortexWhooshRecipe(), chest, 0.8);
        break;
      case 'launch':
        this.#launch(cue);
        break;
      case 'windDown':
        this.#play(vortexEndRecipe(), chest, 0.8);
        break;
      case 'steel':
        this.#play(steelCallRecipe(), chest, 0.95);
        break;
      case 'clash': {
        const rival = this.rivals[cue.rival];
        if (!rival) break;
        const point = chest.clone().lerp(this.#chest(rival.holder), 0.45).add(new THREE.Vector3(0, 0.1, 0));
        effects.blockBurst(point, chest.clone().sub(this.#chest(rival.holder)).normalize());
        this.#play(blockRecipe(Math.random, { heavy: false }), point, 0.8);
        break;
      }
      case 'hit': {
        const rival = this.rivals[cue.rival];
        if (!rival) break;
        const point = this.#chest(rival.holder);
        const way = point.clone().sub(chest).normalize();
        effects.hitBurst(point, way, { strike: cue.heavy ? 1 : 0 });
        this.#play(swordHitRecipe(Math.random, { strike: cue.heavy ? 1 : 0, kill: Boolean(cue.heavy) }), point, 0.8);
        if (cue.heavy) {
          effects.killBurst(point);
          this.#play(killRecipe(), point, 0.45);
        }
        break;
      }
      case 'fall': {
        const rival = this.rivals[cue.rival];
        if (rival) this.#play(wallClangRecipe(), rival.holder.getWorldPosition(new THREE.Vector3()), 0.32);
        break;
      }
      case 'gather': {
        const palm = () => ({ origin: this.#socket(hero, 'sorcery'), direction: this.#facing() });
        if (cue.spell === 'gale') {
          this.galeGather = effects.galeGather(palm);
          this.#play(galeGatherRecipe(Math.random, { seconds: SPELLS.gale.gatherSec }), palm().origin, 0.85);
        } else {
          this.spellGather = effects.spellGather(cue.spell, palm);
          this.#play(castRecipe(Math.random, { spell: cue.spell, release: SPELLS[cue.spell].gatherSec }), palm().origin, 0.85);
        }
        break;
      }
      case 'gale': {
        const rival = this.rivals[cue.rival];
        const origin = this.#socket(hero, 'sorcery');
        const direction = rival ? this.#chest(rival.holder).sub(origin).normalize() : this.#facing();
        effects.galeBlast(origin, direction, SPELLS.gale.cone, {
          groundAt: (x, z, y) => surfaceHeightAt(x, z, y, this.world), surfaceAt: (x, z, y) => surfaceAt(this.world, x, z, y),
        });
        this.#play(galeReleaseRecipe(), origin, 0.95);
        break;
      }
      case 'cast': {
        // at the viewer, going by the camera on one side of it (`past`: right and up of it), and gone behind it
        const from = this.#socket(hero, 'sorcery');
        const eye = this.camera.getWorldPosition(new THREE.Vector3());
        const by = eye.clone()
          .add(new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).multiplyScalar(cue.past[0]))
          .add(new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion).multiplyScalar(cue.past[1]));
        const way = by.sub(from).normalize();
        const speed = SPELLS[cue.spell].speed;
        const past = eye.sub(from).dot(way) + 3;
        this.projectiles.push({ id: `showcase-${cue.spell}-${cue.at}`, spell: cue.spell, from, velocity: way.multiplyScalar(speed), age: 0, life: Math.max(0.2, past / speed), burst: null });
        break;
      }
      case 'palm':
        break;
      default:
        break;
    }
  }

  // the Sundering blade driven into the green: the slam's weight (heard, and in the camera), the rupture running
  // out from where it struck, as far as the ground carries it (planned on Castleward itself, as the host plans one)
  #slam() {
    const tip = this.#swordTip();
    const ground = surfaceHeightAt(tip.x, tip.z, tip.y + 0.5, this.world) ?? 0;
    const origin = { x: tip.x, y: ground, z: tip.z };
    const forward = this.#facing();
    let fissures = planRupture(this.world, origin, { x: forward.x, z: forward.z });
    if (!fissures.length) {
      // (no ground there to plan on: the fan as it would run on open ground)
      const heading = Math.atan2(forward.x, forward.z);
      fissures = [-1, 0, 1].map((i) => {
        const angle = heading + i * RUPTURE.spreadDeg * (Math.PI / 180);
        return { dir: { x: Math.sin(angle), z: Math.cos(angle) }, length: RUPTURE.reach, level: ground };
      });
    }
    const effects = this.effects();
    effects.rupture(origin, fissures, { speed: RUPTURE.speed, lastsSec: RUPTURE.lastsSec, tornWidth: RUPTURE.tornWidth });
    effects.groundShock(origin);
    this.#play(groundSlamRecipe(), origin, 1);
    this.#play(sunderForceRecipe(), origin, 0.9);
    this.#play(ruptureRunRecipe(Math.random, { seconds: Math.max(...fissures.map((f) => f.length)) / RUPTURE.speed }), origin, 0.85);
    this.shake = SLAM_SHAKE.size;
  }

  // a ball of the Vortex's fire leaving the blade for somewhere in the background: it flies as the fire does, and
  // bursts where it meets the town (or, meeting nothing, at the end of its flight)
  #launch(cue) {
    const from = this.#swordTip();
    const to = this.#world(...cue.to);
    const way = to.clone().sub(from).normalize();
    const spell = spellFor(cue.spell);
    const range = from.distanceTo(to);
    const hit = findSwordWorldHit([from.x, from.y, from.z], [way.x, way.y, way.z], range, this.world.solids ?? []);
    const distance = hit ? hit.distance : range;
    const burst = from.clone().addScaledVector(way, distance);
    this.projectiles.push({ id: `showcase-${cue.at}`, spell: cue.spell, from, velocity: way.multiplyScalar(spell.speed), age: 0, life: distance / spell.speed, burst });
    this.effects().fireLaunch(from, this.projectiles.at(-1).velocity, spell.size);
    this.#play(emberRecipe(Math.random, { size: spell.size }), from, 0.45 + 0.4 * spell.size);
  }

  #stepProjectiles(dt) {
    if (!this.projectiles.length) return;
    const live = [];
    for (const projectile of this.projectiles) {
      projectile.age += dt;
      if (projectile.age >= projectile.life) {
        if (projectile.burst) {
          const spell = spellFor(projectile.spell);
          const ground = surfaceHeightAt(projectile.burst.x, projectile.burst.z, projectile.burst.y + 0.2, this.world);
          this.effects().impact(projectile.burst, { spell: projectile.spell, radius: spell.radius ?? 1.8, ground });
          this.#play(emberImpactRecipe(Math.random, { size: spell.size }), projectile.burst, 0.6);
        }
        continue;
      }
      live.push(projectile);
    }
    this.projectiles = live;
    this.effects().syncProjectiles(live.map((p) => ({
      id: p.id, spell: p.spell, velocity: p.velocity, position: p.from.clone().addScaledVector(p.velocity, p.age),
    })));
  }

  // ------------------------------------------------------------------------------------------- blade, palm, rivals
  // the burning blade, as a knight's is lit and spun (RemotePlayers.mjs): its star as it catches, the flare as the
  // spin takes hold, the fire running up it and the arc it leaves while it turns
  #vortex(state, dt) {
    if (!state && !this.vortexBlade) return;
    this.vortexBlade ??= createVortexBlade(this.instance, { blade: VORTEX_BLADES.thirdPerson, trailParent: this.scene });
    const t = this.time;
    const share = state?.share ?? 1;
    const spinning = Boolean(state?.spinning);
    const lit = Boolean(state?.lit) && (spinning || share >= VORTEX_LIT_FROM);
    if (lit && !this.vortexLit) {
      this.vortexBlade.spark(t);
      this.#play(vortexStarRecipe(), this.#swordTip(), 0.7);
    }
    this.vortexLit = lit;
    this.fire = Math.max(0, Math.min(1, (this.fire ?? 0) + (lit ? dt / 0.3 : -dt / 0.35)));
    if (spinning && !this.vortexSpinning) this.vortexBlade.flash(t);
    this.vortexSpinning = spinning;
    this.vortexBlade.set(this.fire, t, {
      swinging: spinning || (lit && share >= VORTEX_TRAIL_FROM),
      gather: state && !lit ? Math.max(0, Math.min(1, share / VORTEX_LIT_FROM)) : 0,
      spinning,
    });
  }

  // a prepared spell held up in the palm: its orb (as the Armory shows a spell: MenuScene showSpell) and its light
  #palm(palm, t) {
    if (!palm && !this.palmOrbs) return;
    const socket = this.instance.sockets?.sorcery;
    if (!socket) return;
    if (!this.palmOrbs) {
      const fireball = createElementalOrb('fireball');
      const frostfire = createElementalOrb('frostfire');
      fireball.scale.setScalar(0.5);
      frostfire.scale.setScalar(0.5);
      const gale = createGaleOrb({ radius: 0.1 });
      this.palmOrbs = { fireball, frostfire, gale };
      for (const orb of Object.values(this.palmOrbs)) {
        orb.position.set(0, 0.07, 0);
        orb.visible = false;
        socket.add(orb);
      }
    }
    for (const [spell, orb] of Object.entries(this.palmOrbs)) {
      const amount = palm?.spell === spell ? palm.amount : 0;
      orb.visible = amount > 0.01;
      if (!orb.visible) continue;
      orb.userData.base ??= orb.scale.x;
      orb.scale.setScalar(orb.userData.base * (0.35 + 0.65 * amount));
      orb.userData.update(t);
    }
    if (palm && this.palmLight) {
      this.palmLight.color.setHex(PALM_GLOW[palm.spell] ?? 0x8fd3ff);
      this.palmLight.intensity = 0.4 + 0.9 * palm.amount;
    }
  }

  async #ensureRivals() {
    if (this.rivalsLoading) return;
    this.rivalsLoading = true;
    const instances = await Promise.all(SHOWCASE_DRESS.map(() => createSpellbladeAsset({ kind: 'thirdPerson' }).catch(() => null)));
    instances.forEach((instance, index) => {
      if (!instance) return;
      if (this.disposed) { instance.dispose(); return; }
      const holder = new THREE.Group();
      holder.name = `armory-rival-${index}`;
      holder.add(instance.root);
      instance.root.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
      holder.visible = false;
      this.holder.add(holder);
      this.rivals[index] = { holder, instance, dress: dressRival(instance, SHOWCASE_DRESS[index]) };
    });
  }

  #poseRivals(t, dt) {
    const sheets = this.sheet.rivals;
    this.rivals.forEach((rival, index) => {
      if (!rival) return;
      const pose = sheets[index]?.(t);
      rival.holder.visible = Boolean(pose) && !pose.hidden;
      if (!rival.holder.visible) return;
      rival.holder.position.set(pose.x, pose.lift ?? 0, pose.z);
      // (turned to face, then leaning back off his feet if he is thrown)
      rival.holder.rotation.set(pose.tumble ?? 0, pose.heading, 0, 'YXZ');
      rival.instance.animator.apply({
        ...pose.plan,
        motion: { death: pose.death, reactions: pose.reactions, now: t, yaw: pose.heading },
      }, dt);
    });
  }

  // -------------------------------------------------------------------------------------------------------- sound
  // heard from where it happens, as the round's fights are (TourDirector.mjs)
  #play(recipe, point, gain = 0.6) {
    if (!this.sound?.running || !recipe) return;
    this.camera.getWorldDirection(_b);
    const place = spatialize(this.camera.position, Math.atan2(-_b.x, -_b.z), point);
    this.sound.play(recipe, { pan: place.pan, gain: gain * place.gain * (this.sheet?.level ?? 1) });
  }

  dispose() {
    this.stop();
    this.disposed = true;
    this.sunderBlade?.dispose();
    this.vortexBlade?.dispose();
    for (const orb of Object.values(this.palmOrbs ?? {})) {
      orb.removeFromParent();
      orb.userData.dispose?.();
    }
    for (const rival of this.rivals) {
      if (!rival) continue;
      rival.holder.removeFromParent();
      rival.instance.dispose();
    }
    this.rivals = [];
  }
}
