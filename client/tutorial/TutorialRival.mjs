import { GREENER_ROUTE } from '../../shared/worlds/greenerPastures.mjs';
import { beginAttack, cancelAttack, endAttack, setGuard, tryCastSpell, tryDash } from '../../shared/sim/combat.mjs';
import { stepBotControllers } from '../../shared/sim/BotController.mjs';
import { BOT_SKILLS } from '../../shared/sim/botSkill.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const yawTo = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z));
const angle = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const CHASE_MODES = new Set(['escape', 'counter-pursuit', 'counterfire', 'complaint']);

// Decision quality only. Health, contacts, movement, stamina and cooldowns remain ordinary.
export const TUTORIAL_RIVAL_POLICIES = Object.freeze({
  duel: Object.freeze({ ...BOT_SKILLS.squire, reaction: [.4, .2], spacing: .2, yields: true,
    retreat: 18, guard: .85, punish: .12, mistakes: .15, chain: [1.25, .4] }),
  final: Object.freeze({ ...BOT_SKILLS.squire, reaction: [.32, .18], spacing: .25, yields: true,
    guard: 1, punish: .2, mistakes: .1, chain: [1.3, .4] }),
});

const MODES = Object.freeze({
  'first-attack': 'idle', 'rival-draw-sword': 'draw', 'rival-guard-lesson': 'guard-lesson',
  'rival-postscript': 'postscript', 'rival-give-space': 'rest', 'rival-idle': 'idle',
  'rival-attack': 'duel', 'rival-real-duel': 'duel', 'rival-escape': 'escape',
  'rival-bridge': 'escape', 'rival-pursuit': 'counter-pursuit', 'rival-counterfire': 'counterfire',
  'rival-combined-pursuit': 'counterfire', 'rival-complaint-approach': 'complaint',
  'rival-pride': 'pride', 'rival-final-fight': 'final-fight', 'rival-final-guard': 'final-fight',
  'rival-defeat': 'final-fight',
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
  }
  enter(cue, now) {
    if (!cue || !this.actor) return;
    const next = MODES[cue];
    if (next && next !== this.mode) {
      this.mode = next; this.enteredAt = now;
      cancelAttack(this.room, this.actor.id, now); setGuard(this.room, this.actor.id, false, now);
      this.actor.ai = null;
      if (next === 'escape') this.sprintWanted = true;
      if (next === 'pride') this.prideAt = null;
    }
    if (cue === 'rival-draw-sword') { this.actor.tutorialSwordDrawn = true; this.actor.tutorialDrawAt = now; }
    if (cue === 'rival-attack') this.strike(now);
    if (cue === 'rival-final-guard' && !this.session.finalBroken) {
      this.guardOpeningUntil = now + 1.5;
      setGuard(this.room, this.actor.id, true, now);
    }
    if (next === 'final-fight' && !this.session.requiresFinalGuard) this.room.tutorialRival.protected = false;
  }
  inputToward(point, scale = 1, sprint = false, face = point, pitch = 0) {
    const actor = this.actor;
    const yaw = typeof face === 'number' ? face : yawTo(actor.position, face);
    const dx = point.x - actor.position.x, dz = point.z - actor.position.z;
    const length = Math.hypot(dx, dz) || 1;
    actor.yaw = yaw; actor.pitch = pitch;
    actor.input = { forward: scale * (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / length,
      right: scale * (Math.cos(yaw) * dx - Math.sin(yaw) * dz) / length,
      yaw, pitch, sprint, jump: false, crouch: false };
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
    if (final && now < this.guardOpeningUntil && !this.session.finalBroken) {
      this.inputToward(player.position, distance(actor.position, player.position) > 2.4 ? .25 : 0);
      setGuard(room, actor.id, true, now);
    } else {
      stepBotControllers(room, now, room.world, { actorKinds: ['dummy'], aggression: final ? .85 : .75, random: this.session.random });
      // This encounter defends the entrance instead of chasing a backpedalling player into the meadow again.
      if (final && distance(actor.position, GREENER_ROUTE.finalStand) > 10) this.inputToward(GREENER_ROUTE.finalStand, .65, false, player.position);
    }
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
    if (this.mode === 'complaint' && distance(actor.position,GREENER_ROUTE.entrance) < 50) scale = Math.min(scale, .48);
    const gap = GREENER_ROUTE.bridge;
    const crossing = actor.position.z < gap.dashStart.z + .8 && actor.position.z > gap.gapBounds.maxZ;
    if (crossing && this.waypoint <= route.findIndex(p => p.id === 'bridge-landing')) {
      this.inputToward(gap.dashLanding, 1, false);
      if (tryDash(room, actor.id, { x: 0, z: -1 }, now)) this.waypoint = route.findIndex(p => p.id === 'bridge-landing');
      else if (actor.position.z > gap.gapBounds.maxZ + .25) this.inputToward(gap.dashLanding, 0);
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
    this.inputToward(target, scale, this.sprintWanted, lookingBack ? player.position : target, pitch);
  }
  pride(now, dt) {
    const { actor, player } = this;
    if (distance(actor.position, GREENER_ROUTE.entrance) > 18) {
      this.inputToward(GREENER_ROUTE.finalStand, .6); return;
    }
    this.prideAt ??= now;
    const age = now - this.prideAt;
    const remaining = distance(actor.position, GREENER_ROUTE.finalStand);
    if (remaining > 1.1) {
      this.inputToward(GREENER_ROUTE.finalStand, age < .45 ? .48 : .24); return;
    }
    const wanted = yawTo(actor.position, player.position);
    const turn = angle(actor.yaw, wanted);
    const yaw = actor.yaw + Math.max(-dt * 3, Math.min(dt * 3, turn));
    this.inputToward(player.position, 0, false, yaw);
    if (age > .8 && Math.abs(turn) < .15) this.session.director.fact('rival-turned');
  }
  beforeStep(now) {
    const { actor, player } = this;
    const dt = this.lastStepAt === null ? 1 / 30 : Math.min(.1, Math.max(0, now - this.lastStepAt));
    this.lastStepAt = now;
    if (!actor || !player?.alive || !actor.alive) return;
    const apart = distance(actor.position, player.position);
    if (['duel', 'final-fight'].includes(this.mode)) { this.combat(now, this.mode === 'final-fight'); return; }
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
