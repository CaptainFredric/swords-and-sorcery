import { wayToward } from '../../shared/sim/botNav.mjs';
import { NONLETHAL_RECOVERY } from '../game/spellbladeMotion.mjs';
import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { beginAttack, cancelAttack, endAttack, setGuard, tryCastSpell, tryDash } from '../../shared/sim/combat.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { BOT_SKILLS } from '../../shared/sim/botSkill.mjs';
import { SPRINT } from '../../shared/src/movement.mjs';
import { MELEE_CONTACT, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';
import { combatBlocksSprint } from '../../shared/src/combatActionPolicy.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const yawTo = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z));
const angle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const CHASE_MODES = new Set(['escape', 'jump', 'counter-pursuit', 'counterfire', 'complaint']);
// Where the Spellblade's sword may land on him: his lesson, the duel, the downed moment after it, the chase, and the
// final fight. Anywhere else a strike is premature and he turns it away with a real Parry (the final Guard is its own).
const HITTABLE = new Set(['target', 'duel', 'recover', ...CHASE_MODES, 'final-fight', 'final-guard']);
// how near a strike must be swung for him to answer it
const PARRY_REACH = 3.6;
// he stays down at most this long (a failsafe: the line he says while down ends it, then he gets up)
const DOWNED_HOLD_MAX = 30;
// the final Rival keeps to his post before the door: this far from it at most, and never back toward the building
const FINAL_TETHER = 5;

/** The player's next committed strike, if one is coming: when its contact is due (absolute seconds). */
function incomingStrike(player, now) {
  if (!player?.alive || !player.attackActive || now < (player.staggerUntil ?? -Infinity)) return null;
  const next = player.attackNextStrike ?? 0;
  if (next >= (player.attackCommitted ?? 1) || next >= SWORD_STRIKE_TIMES.length) return null;
  return { contact: player.attackStartedAt + SWORD_STRIKE_TIMES[next] };
}

// Decision quality only. Health, contacts, movement, stamina and cooldowns remain ordinary.
export const TUTORIAL_RIVAL_POLICIES = Object.freeze({
  duel: Object.freeze({ ...BOT_SKILLS.squire, reaction: [.4, .2], spacing: .2, yields: true,
    retreat: 18, guard: .85, punish: .12, mistakes: .15, chain: [1.25, .4] }),
  // the final Rival has learned: quicker to answer, keeps his distance, times some Guards into Parries, punishes an
  // opening and seldom swings from out of reach (decisions only: his health, damage and cooldowns are a knight's)
  final: Object.freeze({ ...BOT_SKILLS.squire, reaction: [.26, .14], think: .22, spacing: .3, yields: true,
    guard: 1, guardFloor: 10, parry: .35, punish: .4, mistakes: .05, chain: [1.3, .4] }),
});

const MODES = Object.freeze({
  'first-attack': 'target', 'rival-draw-sword': 'draw', 'rival-guard-lesson': 'guard-lesson',
  'rival-postscript': 'postscript', 'rival-give-space': 'rest', 'rival-idle': 'idle',
  'rival-attack': 'duel', 'rival-real-duel': 'duel', 'rival-depart': 'depart', 'rival-hold-afar': 'hold-afar',
  'pursuit-release': 'escape', 'rival-escape': 'escape', 'rival-jump': 'jump',
  'rival-bridge': 'escape', 'rival-pursuit': 'counter-pursuit', 'rival-counterfire': 'counterfire',
  'rival-combined-pursuit': 'counterfire', 'rival-complaint-approach': 'complaint',
  'rival-pride': 'pride', 'rival-ready': 'ready', 'rival-final-opening': 'final-opening', 'rival-final-guard': 'final-guard',
  'rival-final-fight': 'final-fight', 'rival-defeat': 'final-fight',
});

// Scene policy supplies intent. The same simulator used by multiplayer resolves every action.
export class TutorialRival {
  constructor(session) { this.session = session; this.reset(); }
  get room() { return this.session.host.room; }
  get player() { return this.session.host.player; }
  get actor() { return this.room.players.get(this.session.rivalId); }
  reset() {
    this.mode = 'idle'; this.waypoint = 1; this.lastStrike = -Infinity; this.counterShots = 0;
    this.enteredAt = 0; this.lastStepAt = null; this.sprintReactionAt = null; this.sprintWanted = false;
    this.dashReactionAt = null; this.previousGap = null; this.guardOpeningUntil = -Infinity; this.prideAt = null;
    this.jumpWaiting = false;
    this.recoveryAt = null; this.risingAt = null;
    this.parryRaisedAt = null;
    this.counterAt = null; this.lastCounterAt = -Infinity; this.lastBlockedAt = -Infinity;
    this.jumped = false; this.deadEndCrossed = false;
    this.gloatTurnUntil = -Infinity;
    this.routeMind = {strafeDirection:1};
    this.bridgeInFlight = false;
    this.bridgePrepared = false;
  }
  enter(cue, now) {
    if (!cue || !this.actor) return;
    const next = MODES[cue];
    if (cue === 'rival-rise') { this.rise(now); return; }
    if (this.mode === 'recover' && next && next !== 'recover' || next === 'duel' && this.recoveryAt !== null) return;
    if (next && next !== this.mode) {
      this.mode = next; this.enteredAt = now;
      cancelAttack(this.room, this.actor.id, now); setGuard(this.room, this.actor.id, false, now);
      this.actor.ai = null; this.parryRaisedAt = null; this.counterAt = null;
      if (next === 'escape') this.sprintWanted = true;
      if (next === 'pride') this.prideAt = null;
      // (the final Guard is raised by his own hand at his post: an ordinary held Guard, its time its own)
      if (next === 'final-guard' && !this.session.finalBroken) setGuard(this.room, this.actor.id, true, now);
    }
    if (cue === 'rival-draw-sword') { this.actor.tutorialSwordDrawn = true; this.actor.tutorialDrawAt = now; }
    if (cue === 'rival-attack') this.strike(now);
    // (the fight to the end: only after his Guard is broken, or in a route with no Guard to break)
    if (next === 'final-fight') this.room.tutorialRival.protected = false;
  }
  beginRecovery(now) {
    if (this.recoveryAt !== null || !this.actor?.alive) return;
    this.recoveryAt = now;
    this.mode = 'recover'; this.enteredAt = now; this.risingAt = null;
    cancelAttack(this.room,this.actor.id,now); setGuard(this.room,this.actor.id,false,now);
    this.actor.ai = null;
    // Down, and held down (braced) until the line he says there is over: then rise() lets him up.
    this.actor.presentationRecovery = {at:now,duration:NONLETHAL_RECOVERY.duration+DOWNED_HOLD_MAX,hold:DOWNED_HOLD_MAX};
    // Retain the actual blow's existing displacement. This is a recoverable reaction, never a corpse.
    this.inputToward(this.player.position,0);
    this.session.director.fact('rival-recovery-started');
  }
  /** Up he gets: the downed hold ends now (or as soon as the buckle allows) and the rise plays out. */
  rise(now) {
    if (this.mode !== 'recover' || this.recoveryAt === null || this.risingAt !== null) return;
    const hold = Math.max(0, now - this.recoveryAt - NONLETHAL_RECOVERY.braceUntil);
    this.actor.presentationRecovery = {at:this.recoveryAt,duration:NONLETHAL_RECOVERY.duration+hold,hold};
    this.risingAt = now;
  }
  // A strike swung at him where it does not belong is met by a Guard raised once, just as its blade goes live: the
  // sim's own Parry window (GAME.parryWindowMs) decides, exactly as it would for anyone. Lowered when it is spent.
  parry(now) {
    const { actor, player, room } = this;
    const strike = incomingStrike(player, now);
    if (this.parryRaisedAt !== null) {
      this.inputToward(player.position, 0);
      const another = strike && strike.contact - now < .2;
      if (now - this.parryRaisedAt >= .45 && !another) { setGuard(room, actor.id, false, now); this.parryRaisedAt = null; return false; }
      return true;
    }
    if (!strike || distance(actor.position, player.position) > PARRY_REACH) return false;
    // he watches the blade come (turned to it in good time: a Guard faces where he faces)
    if (strike.contact - now < .5) this.inputToward(player.position, 0);
    if (now + 1e-6 >= strike.contact - MELEE_CONTACT.window.early && now <= strike.contact + MELEE_CONTACT.follow) {
      if (!actor.guarding && setGuard(room, actor.id, true, now)) this.parryRaisedAt = now;
      return true;
    }
    return strike.contact - now < .5;
  }
  inputToward(point, scale = 1, sprint = false, face = point, pitch = 0) {
    const actor = this.actor;
    const yaw = typeof face === 'number' ? face : yawTo(actor.position, face);
    const dx = point.x - actor.position.x, dz = point.z - actor.position.z;
    const length = Math.hypot(dx, dz) || 1;
    const recoveringTurn = this.recoveryAt !== null && this.session.host.now() - this.recoveryAt < NONLETHAL_RECOVERY.duration + .5;
    const turning = recoveringTurn || this.jumpWaiting || this.session.host.now()<this.gloatTurnUntil;
    const wantedYaw = turning ? actor.yaw + Math.max(-.16,Math.min(.16,angle(actor.yaw,yaw))) : yaw;
    actor.yaw = wantedYaw; actor.pitch = pitch;
    if(turning && scale>0)scale*=Math.max(0,Math.cos(angle(wantedYaw,yaw)));
    actor.input = { forward: scale * (-Math.sin(wantedYaw) * dx - Math.cos(wantedYaw) * dz) / length,
      right: scale * (Math.cos(wantedYaw) * dx - Math.sin(wantedYaw) * dz) / length,
      yaw: wantedYaw, pitch, sprint, jump: false, crouch: false };
  }
  strike(now) {
    if (now - this.lastStrike < 1.15 || !this.player.alive) return;
    this.inputToward(this.player.position, 0);
    if (beginAttack(this.room, this.actor.id, now)) { endAttack(this.room, this.actor.id, now); this.lastStrike = now; }
  }
  observePlayerDash(now, direction) {
    if (!CHASE_MODES.has(this.mode) || this.dashReactionAt !== null) return;
    const a = this.actor.position, p = this.player.position, apart = distance(a, p);
    const toward = ((a.x - p.x) * direction.x + (a.z - p.z) * direction.z) / (apart || 1);
    if (apart < 25 && toward > .55) this.dashReactionAt = now + .65;
  }
  combat(now, final = false) {
    const { actor, room, player } = this;
    actor.botSkill = TUTORIAL_RIVAL_POLICIES[final ? 'final' : 'duel'];
    actor.botProfile = { spells: false, dash: 0, guard: final ? .9 : .8, footwork: final ? .6 : .5 };
    const post = GREENER_ROUTE.finalDefense;
    // The final Rival defends the door: with the Spellblade standing off he goes back to his post and Guards there
    // (and answers a long-range duel in kind, his Fireball on its ordinary cooldown); close in and he fights.
    if (final && distance(player.position, post) > 7.5) {
      this.holdPost(now, true);
      const apart = distance(actor.position, player.position);
      if (apart > 10 && apart < 45 && now >= actor.spellReadyAt && !actor.pendingSpell && distance(actor.position, post) < 1.5) {
        const dx = player.position.x - actor.position.x, dz = player.position.z - actor.position.z;
        const dy = (player.position.y + .9) - (actor.position.y + 1.55), length = Math.hypot(dx, dy, dz) || 1;
        setGuard(room, actor.id, false, now);
        tryCastSpell(room, actor.id, { x: dx / length, y: dy / length, z: dz / length }, now);
      }
      return;
    }
    stepBotControllers(room, now, room.world, { actorKinds: ['dummy'], aggression: final ? .85 : .75, random: this.session.random });
    // He never chases a backpedalling player into the meadow, and never backs into the building he guards.
    if (final && (distance(actor.position, post) > FINAL_TETHER || actor.position.z < post.z - 2)) this.inputToward(post, .65, false, player.position);
  }
  // At his post before the door, turned to the Spellblade; Guard up when asked.
  holdPost(now, guard) {
    const { actor, player, room } = this;
    const post = GREENER_ROUTE.finalDefense;
    const away = distance(actor.position, post);
    this.inputToward(away > .5 ? post : player.position, away > .5 ? Math.min(.6, away / 2.5) : 0, false, player.position);
    if (guard) setGuard(room, actor.id, true, now);
  }
  // The first exchange of the final fight: he waits at his post, sword ready and Guard down, and turns the first
  // strike away with the same real Parry.
  finalOpening(now) {
    if (this.parry(now)) return;
    this.holdPost(now, false);
  }
  // Then his Guard, held at his post, with a counter now and then: a chain spent on his Guard, the Spellblade still in
  // reach, and he lowers it for one blow of his own. Broken, the fight is an ordinary one to the end.
  finalGuard(now) {
    const { actor, player, room } = this;
    if (this.session.finalBroken) { this.combat(now, true); return; }
    if (this.counterAt !== null) {
      this.inputToward(player.position, 0);
      if (now - this.counterAt < .75) return;
      this.counterAt = null;
    }
    const apart = distance(actor.position, player.position);
    const spent = !player.attackActive && now - this.lastBlockedAt < 1.1;
    if (spent && apart < 2.4 && now - this.lastCounterAt > 2.4 && actor.guardStamina > 20 && player.alive) {
      setGuard(room, actor.id, false, now);
      this.inputToward(player.position, 0);
      if (beginAttack(room, actor.id, now)) { endAttack(room, actor.id, now); this.counterAt = this.lastCounterAt = now; return; }
    }
    this.holdPost(now, true);
  }
  // He walks off (no run, no sprint: the narration is of a departure) to a spot well away, and waits there, turned
  // back to watch the Spellblade.
  depart(now) {
    const { actor } = this;
    const hold = GREENER_ROUTE.rivalHold;
    if (distance(actor.position, hold) > .8) {
      this.inputToward(hold, .48, false);
      if (Math.hypot(actor.velocity.x, actor.velocity.z) > .5) this.session.director.fact('rival-departing');
      return;
    }
    this.session.director.fact('rival-departed');
    this.mode = 'hold-afar';
    this.holdAfar(now);
  }
  holdAfar(now) {
    if (this.parry(now)) return;
    const hold = GREENER_ROUTE.rivalHold, away = distance(this.actor.position, hold);
    this.inputToward(away > .8 ? hold : this.player.position, away > .8 ? .45 : 0, false, away > .8 ? hold : this.player.position);
  }
  chase(now, apart) {
    const { actor, player, room } = this;
    const route = GREENER_ROUTE.chaseWaypoints;
    while (this.waypoint < route.length - 1 && distance(actor.position, route[this.waypoint]) < 1.4) this.waypoint += 1;
    const target = route[this.waypoint];
    const closing = this.previousGap !== null && apart < this.previousGap - .015;
    this.previousGap = apart;
    if (player.sprinting && (closing || apart < 16) && apart < 26 && this.sprintReactionAt === null) this.sprintReactionAt = now + .45;
    if (this.sprintReactionAt !== null && now >= this.sprintReactionAt) { this.sprintWanted = true; this.sprintReactionAt = null; }
    if (apart > 32 || actor.guardStamina <= 2) this.sprintWanted = false;
    if (now - this.enteredAt < 1.4 && this.mode === 'escape') this.sprintWanted = true;
    // Choosing an ordinary walk or run keeps him readable to a learner; the player can still gain and catch him.
    let scale = apart > 45 ? .38 : apart > 30 ? .65 : apart < 10 ? 1 : .88;
    const jump = GREENER_ROUTE.jump;
    // Before the stile he makes sure of his lead, so that he is over it and gloating while the Spellblade is still
    // on his way (his own Sprint and stamina, nothing more).
    const toStile = jump ? actor.position.z - jump.takeoff.z : -1;
    if (jump && !this.jumped && toStile > 0 && toStile < 80 && apart < 30) {
      scale = 1;
      if (actor.guardStamina > SPRINT.restartStamina) this.sprintWanted = true;
    }
    const teachingJump = jump && this.session.director.beats.some(beat=>beat.advanceOn==='jump-crossed');
    // (over the stile with his lead, he comes back to his gloating spot if his run carried him past it)
    const gloating = teachingJump && this.jumped && !this.session.director.facts.has('jump-crossed');
    if (jump && (actor.position.z > jump.waitPoint.z - 1 || gloating)) {
      if (actor.position.z <= jump.takeoff.z + 1 && actor.position.z > jump.obstacleBounds.minZ - .5) {
        this.waypoint = Math.max(this.waypoint,route.findIndex(point=>point.id==='jump-landing'));
        this.inputToward(jump.landing, 1, false);
        actor.input.jump = actor.grounded;
        return;
      }
      if (!this.jumped && actor.grounded && actor.position.z < jump.obstacleBounds.minZ - .3) {
        this.jumped = true; this.sprintWanted = false;
        this.session.director.fact('rival-jumped');
      }
      if (teachingJump && actor.position.z <= jump.landing.z && !this.session.director.facts.has('jump-crossed')) {
        this.jumpWaiting = distance(actor.position,jump.waitPoint) < 1.4;
        this.inputToward(this.jumpWaiting ? player.position : jump.waitPoint,this.jumpWaiting ? 0 : .8,false,this.jumpWaiting ? player.position : jump.waitPoint);
        return;
      }
    }
    if(this.jumpWaiting)this.gloatTurnUntil=now+.65;
    this.jumpWaiting = false;
    const reuse=GREENER_ROUTE.jumpReuse;
    if(reuse && actor.position.z<reuse.approach.z+1 && actor.position.z>reuse.obstacleBounds.minZ-.5) {
      this.inputToward(reuse.landing,1,false);
      if(actor.position.z<=reuse.takeoff.z+1)actor.input.jump=actor.grounded;
      this.waypoint=Math.max(this.waypoint,route.findIndex(p=>p.id==='dead-end-landing'));
      return;
    }
    // The final approach has no artificial proximity slowdown. The taunt owns the stop.
    if (this.mode === 'complaint') scale = 1;
    const gap = GREENER_ROUTE.bridge;
    const crossing = actor.position.z < gap.dashStart.z + 35 && actor.position.z > gap.gapBounds.minZ;
    if (crossing && this.waypoint <= route.findIndex(p => p.id === 'bridge-landing')) {
      // Plan the real traversal before leaving supported ground. Sprint needs
      // enough stamina for the approach and flight; Dash keeps its normal cooldown.
      const ready = actor.guardStamina >= SPRINT.restartStamina + SPRINT.staminaPerSec * 2
        && now >= actor.dashReadyAt && !combatBlocksSprint(actor,now) && !actor.tornGround;
      if (!this.bridgeInFlight && !this.bridgePrepared && !ready) {
        this.inputToward(gap.waitPoint, distance(actor.position,gap.waitPoint) > .4 ? .65 : 0, false, player.position);
        return;
      }
      this.bridgePrepared = true;
      this.inputToward(gap.dashLanding, 1, true);
      if (this.bridgeInFlight || actor.position.z < gap.dashStart.z + 1) {
        actor.input.jump = actor.grounded;
        this.bridgeInFlight = true;
      }
      if (!actor.grounded && actor.velocity.y <= 0 && tryDash(room, actor.id, { x: 0, z: -1 }, now)) this.waypoint = route.findIndex(p => p.id === 'bridge-landing');
      return;
    }
    if (this.dashReactionAt !== null && now >= this.dashReactionAt) {
      const safeForDash = actor.position.z > gap.dashStart.z + 60 || actor.position.z < gap.ravineBounds.minZ - 8;
      if (apart < 23 && actor.grounded && !actor.pendingSpell && safeForDash) {
        const dx = target.x - actor.position.x, dz = target.z - actor.position.z, length = Math.hypot(dx, dz) || 1;
        tryDash(room, actor.id, { x: dx / length, z: dz / length }, now);
      }
      this.dashReactionAt = null;
    }
    if (['counterfire', 'complaint'].includes(this.mode) && apart < 55 && apart > 1 && now >= actor.spellReadyAt && !actor.pendingSpell) {
      const dx = player.position.x - actor.position.x, dz = player.position.z - actor.position.z;
      const dy = (player.position.y + .9) - (actor.position.y + 1.55), length = Math.hypot(dx, dy, dz) || 1;
      if (tryCastSpell(room, actor.id, { x: dx / length, y: dy / length, z: dz / length }, now)) this.counterShots += 1;
    }
    const lookingBack = actor.pendingSpell || now < actor.castEndsAt + .15;
    const pitch = lookingBack ? Math.atan2(player.position.y + .9 - actor.position.y - 1.55, apart) : 0;
    // Reproject movement onto the current aim. Turning back to gather must not reverse the chase.
    const travel = wayToward(room.world,actor,{position:target},this.routeMind,now) ?? target;
    this.inputToward(travel, scale, this.sprintWanted, lookingBack ? player.position : travel, pitch);
  }
  pride(now, dt) {
    const { actor, player } = this;
    this.prideAt ??= now;
    const age = now - this.prideAt;
    const remaining = distance(actor.position, GREENER_ROUTE.finalStand);
    if (remaining > .35) {
      this.inputToward(GREENER_ROUTE.finalStand, Math.min(1, remaining / 6)); return;
    }
    const wanted = yawTo(actor.position, player.position);
    const turn = angle(actor.yaw, wanted);
    const yaw = actor.yaw + Math.max(-dt * 3, Math.min(dt * 3, turn));
    this.inputToward(player.position, 0, false, yaw);
    if (age > .8 && Math.abs(turn) < .15 && Math.hypot(actor.velocity.x, actor.velocity.z) < .3) this.session.director.fact('rival-turned');
  }
  beforeStep(now) {
    const { actor, player } = this;
    const dt = this.lastStepAt === null ? 1 / 30 : Math.min(.1, Math.max(0, now - this.lastStepAt));
    this.lastStepAt = now;
    if (!actor || !player?.alive || !actor.alive) return;
    const apart = distance(actor.position, player.position);
    if (this.mode === 'recover') {
      this.inputToward(player.position,0);
      const recovery = actor.presentationRecovery;
      if(!recovery || now-recovery.at>=recovery.duration) {
        // (on his feet first: the fact moves the scene on, and its next cue must find him standing)
        this.actor.presentationRecovery=null;
        this.mode='idle'; this.enteredAt=now;
        this.session.director.fact('rival-recovered');
      }
      return;
    }
    if (!HITTABLE.has(this.mode) && this.parry(now)) return;
    if (this.mode === 'duel' || this.mode === 'final-fight') { this.combat(now, this.mode === 'final-fight'); return; }
    if (this.mode === 'final-opening') { this.finalOpening(now); return; }
    if (this.mode === 'final-guard') { this.finalGuard(now); return; }
    if (this.mode === 'depart') { this.depart(now); return; }
    if (this.mode === 'hold-afar') { this.holdAfar(now); return; }
    if (this.mode === 'ready') { this.holdPost(now, false); return; }
    if (['guard-lesson', 'postscript'].includes(this.mode)) {
      this.inputToward(player.position, apart > 1.95 ? .65 : 0);
      if (apart < 2.4) this.strike(now);
      return;
    }
    if (this.mode === 'rest') {
      const dx = actor.position.x - player.position.x, dz = actor.position.z - player.position.z;
      this.inputToward({ x: actor.position.x + dx, z: actor.position.z + dz }, apart < 6 ? .5 : 0, false, player.position); return;
    }
    if (CHASE_MODES.has(this.mode)) { this.chase(now, apart); return; }
    if (this.mode === 'pride') { this.pride(now, dt); return; }
    this.inputToward(player.position, 0);
  }
}
