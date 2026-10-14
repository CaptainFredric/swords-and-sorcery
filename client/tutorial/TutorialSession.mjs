import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialMovementCues } from './TutorialMovementCues.mjs';
import { TutorialCombatCues } from './TutorialCombatCues.mjs';
import { TutorialRival } from './TutorialRival.mjs';
import { tutorialSceneCue } from './TutorialSceneCues.mjs';
import { TUTORIAL_SEGMENTS, TUTORIAL_BRANCHES, tutorialRouteSegments, tutorialRouteBeats } from './tutorialScript.mjs';
import { GREENER_ROUTE, BRIDGE_RETRY, greenerOpeningProgress, greenerPasturesWithBridgeRetries, greenerBridgeRetryFloor } from '../../shared/worlds/greenerPastures.mjs';
import { resetPracticePlayer, spawnPracticeDummy, removePracticeDummy } from '../../shared/sim/practice.mjs';
import { cancelAttack, setGuard } from '../../shared/sim/combat.mjs';
import { HEALTH_REGEN } from '../../shared/src/combat.mjs';
import { SPRINT } from '../../shared/src/movement.mjs';
import { keyLabel } from '../settings/settingsRegistry.mjs';

const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const ACTION = Object.freeze({cast:'spell',castCurrentSpell:'spell',castPreparedSpell:'prepared',castPreparedSlot:'prepared',selectPreparedSlot:'prepared',selectPreparedSpell:'prepared'});
const CONTROLLED = new Set(['look','move','sprint','attack','guard','spell','dash','jump','crouch','ultimate','gauntlet','prepared']);
// The threat stops the Spellblade dead: his feet are held this long from its first word; his eyes and hands are not.
export const THREAT_HALT_SEC = 1.2;
const HALTED = new Set(['move','sprint','jump','dash','crouch']);
// Health counts as settled after this long at full (the regeneration lesson's prompt stays until then).
export const HEALTH_SETTLED_SEC = 1;
// After a final defeat, the taunt (if there is one this time) has this long at most before the rematch.
const FINAL_LOSS_MAX_SEC = 6.5;
const FINAL_LOSS_QUIET_SEC = 2.4;
const FINAL_MODES = new Set(['final-opening','final-guard','final-fight']);
// a prompt not yet answered: the moment it gives a short aside (seconds; the miss's two lines, the bridge's growth)
const PROMPT_ROOM_SEC = 6;
// How soon (seconds) a place's lines can be due: by whoever must reach it (the pursuit runs toward -z), at a Sprint.
function placeReach(place, player, rival) {
  const route = GREENER_ROUTE, reuse = route.jumpReuse, bridge = route.bridge;
  const along = (actor, z) => actor ? Math.max(0, actor.position.z - z) / SPRINT.speed : 0;
  const toward = (actor, point, within = 0) => actor ? Math.max(0, distance(actor.position, point) - within) / SPRINT.speed : 0;
  const landmark = id => route.waypointById[id] ?? route.landmarks[id];
  switch (place) {
    case 'jump': return along(rival, route.jump.takeoff.z);
    case 'jump-crossing': return along(player, route.jump.landing.z);
    case 'pursuit-banter': case 'tattle-reveal': return along(player, landmark(place).z);
    case 'dead-end': return along(rival, reuse.obstacleBounds.minZ);
    case 'dead-end-crossing': return along(player, reuse.obstacleBounds.minZ);
    case 'bridge': return Math.max(along(player, route.waypointById['bridge-approach'].z), along(rival, route.waypointById['bridge-approach'].z + 5));
    case 'bridge-crossing': return along(player, bridge.gapBounds.minZ);
    case 'complaint': return toward(rival, route.entrance, 100);
    case 'pride': return toward(rival, route.finalStand);
    default: return Infinity;
  }
}

export function tutorialPrompt(beat, { touch = false, bindings = {} } = {}) {
  const keys = action => (bindings[action] ?? []).map(keyLabel).join(' / ');
  const use = action => touch ? ({attack:'Attack',guard:'Guard',spell:'Spell',dash:'Dash',jump:'Jump'}[action] ?? action) : keys(action);
  switch (beat?.mechanic) {
    case 'look': return touch ? 'Drag the look area to scan the field.' : 'Move the mouse to scan the field. Click the arena to capture the pointer.';
    case 'move': return touch ? 'Use the left stick to approach Rival.' : `Approach Rival: ${['forward','back','left','right'].map(keys).filter(Boolean).join(' · ')}`;
    case 'sprint': return touch ? 'Push the stick fully forward to Sprint, or tap Sprint while moving. Watch Guard stamina.' : `Move forward and hold ${keys('sprint')} to Sprint. Watch Guard stamina.`;
    case 'recover': return touch ? 'Release the movement stick to stop Sprinting. Let stamina recover.' : `Stop Sprinting and lower Guard to recover stamina. Release ${keys('sprint')}.`;
    case 'attack': return `Strike Rival with your sword: ${use('attack')}. Move closer if your swing misses.`;
    case 'guard': return `Face Rival and Guard against his sword: ${use('guard')}.`;
    case 'lower-guard': return touch ? 'Release Guard when ready.' : `Release ${keys('guard')} to lower Guard.`;
    case 'health-regen': return `Health regenerates after ${HEALTH_REGEN.delaySec} seconds without damage.`;
    case 'fireball': return `Aim at Rival and cast Fireball: ${use('spell')}. Missed? Wait for the real cooldown and try again.`;
    case 'jump': return `Jump over the low stone wall: ${use('jump')}. Keep moving toward Rival.`;
    case 'dash': return `Sprint and Jump from the high broken deck. Dash toward the lower bank while airborne: ${use('dash')}.`;
    case 'guard-break': return `Keep striking Rival's Guard with ${use('attack')}. Fireball passes through Guard; sword pressure breaks it.`;
    case 'exit': return 'The gate is in the west hedge.';
    default: return ({'duel-damage-threshold':'Fight Rival. Attack, Guard and move.', 'rival-escaping':'Chase Rival.',
      'final-first-parry':`Strike Rival: ${use('attack')}.`,
      'bridge-reached':'Follow Rival to the broken stone bridge.', 'bridge-crossed':`Cross to the far bank. Dash: ${use('dash')}.`,
      'subsequent-fireball-hit':`Aim at Rival and cast Fireball again: ${use('spell')}.`,
      'counterfire-complete':'Keep chasing. Evade his Fireballs and return fire.', 'rival-final-stand':'Close the distance to Rival.',
      'departure-complete':'Leave the clearing. Move forward.'})[beat?.advanceOn] ?? '';
  }
}

// Local orchestration owns permissions, checkpoints and choreography. Normal combat resolves all contacts.
export class TutorialSession {
  constructor(host, { onChange = () => {}, onBlocked = () => {}, onRestore = () => {}, random = Math.random,
    route = TUTORIAL_SEGMENTS, omitSegments = [], onResumeMovement = () => {}, lineSeconds = () => null } = {}) {
    if (!host.local || !host.room?.localTutorial || host.room.worldId !== 'greener-pastures') throw new Error('Tutorial requires local Greener Pastures');
    this.host = host; this.onChange = onChange; this.onBlocked = onBlocked; this.onRestore = onRestore; this.random = random;
    this.onResumeMovement = onResumeMovement;
    this.route = tutorialRouteSegments(route, {omitSegments});
    const enabledBranches = new Set(this.route.flatMap(segment => segment.branches ?? []));
    const branches = Object.fromEntries(Object.entries(TUTORIAL_BRANCHES).filter(([id]) => enabledBranches.has(id)));
    this.director = new TutorialDirector({segments:this.route,beats:tutorialRouteBeats(this.route),branches,
      onChange:progress => this.changed(progress)});
    // an aside is fitted into the story's room, by its recordings' own lengths
    this.director.optionalRoom = () => this.storyRoom();
    this.director.lineSeconds = lineSeconds;
    this.active = false; this.off = []; this.lastBeat = null; this.lastSegment = null;
    this.checkpoint = this.route[0].id; this.blockedHeld = new Set();
    this.bridgeFailures = 0;
    this.laterFireballs = 0;
    this.finalLosses = 0;
    this.gateMemory = new Map();
  }
  /**
   * The story's room for an aside (seconds): how soon, at the quickest, its next place can come, its lines due there
   * (the ground still to cover by whoever has to reach it, at a full Sprint). A prompt the Spellblade has yet to answer
   * gives a short aside its moment; a place already reached has none to give.
   */
  storyRoom() {
    const director = this.director, current = director.current;
    if (!current || !this.host.player) return Infinity;
    let place = null;
    for (let i = director.index; i < director.beats.length && !place; i += 1) {
      const beat = director.beats[i];
      if (beat.place && !director.skips(beat)) place = beat;
    }
    let room = Infinity;
    if (place) room = director.facts.has(place.advanceOn) ? 0 : placeReach(place.place, this.host.player, this.host.room.players.get(this.rivalId));
    if (current.kind === 'prompt' && !director.facts.has(current.advanceOn)) room = Math.max(room, PROMPT_ROOM_SEC);
    return room;
  }
  get requiresFinalGuard() { return this.director.beats.some(beat=>beat.advanceOn==='rival-guard-broken'); }
  start() {
    if (this.active) return;
    this.active = true; this.stage(this.route[0].id);
    // (the opening's way to Rival is a slalom: progress is measured along it, not as the crow flies)
    this.movement = new TutorialMovementCues(this.director,{local:true,playerId:this.host.player.id,rivalId:this.rivalId,
      progress:position=>greenerOpeningProgress(position)});
    this.combat = new TutorialCombatCues(this.director,{local:true,playerId:this.host.player.id,rivalId:this.rivalId});
    this.rival = new TutorialRival(this);
    this.host.commandFilter = message => this.filter(message);
    this.host.sessionController = this;
    this.off = [this.host.on('events',batch=>this.events(batch.events)), this.host.on('snapshot',snapshot=>this.snapshot(snapshot))];
    this.director.start();
  }
  stage(segment = this.route[0].id, { rematch = false } = {}) {
    const room = this.host.room, now = this.host.now();
    resetPracticePlayer(room,this.host.player.id,now); removePracticeDummy(room);
    const rival = spawnPracticeDummy(room,'PASSIVE',now);
    const scene = this.route.find(x=>x.id===segment)?.scene;
    const key = scene?.checkpoint ?? 'opening';
    // (a rematch puts the Spellblade back down the lane, to walk up to Rival at his door again)
    const at = rematch ? GREENER_ROUTE.checkpointPositions.rematch : GREENER_ROUTE.checkpointPositions[key];
    const rivalAt = ({pursuit:GREENER_ROUTE.waypointById.escape,jump:GREENER_ROUTE.jump?.waitPoint,fireball:GREENER_ROUTE.waypointById.fireball,
      bridge:GREENER_ROUTE.bridge.dashLanding,counterfire:GREENER_ROUTE.waypointById.counterfire,
      complaint:GREENER_ROUTE.waypointById.pride,final:GREENER_ROUTE.finalStand})[key] ?? GREENER_ROUTE.rivalMeeting;
    this.host.player.position = {x:at.x,y:at.y,z:at.z};
    this.host.player.yaw = at.yaw; this.host.player.pitch = 0;
    this.host.player.input = {...this.host.player.input,forward:0,right:0,yaw:at.yaw,pitch:0};
    // The saved Armory and host defaults stay intact. Only this room's actor carries Fireball.
    this.host.player.spell = this.host.player.startingSpell = 'fireball';
    this.host.player.preparedSpells = ['fireball']; this.host.player.preparedSpellSelected = true;
    const rivalPost = rematch ? GREENER_ROUTE.finalDefense : rivalAt;
    rival.name = 'Rival'; rival.position = {x:rivalPost.x,y:rivalPost.y,z:rivalPost.z};
    rival.yaw = rivalPost.yaw; rival.input = {...rival.input,yaw:rival.yaw};
    rival.spell = 'fireball'; rival.botSkill = 'squire'; rival.tutorialSwordDrawn = key !== 'opening' && key !== 'introductions';
    rival.spawnProtectionUntil = now; this.rivalId = rival.id;
    room.tutorialRival = {id:rival.id,protected:true}; room.projectiles.clear();
    this.duelDamage = 0; this.duelCounting = false; this.finalBroken = false; this.damageBaseline = null; this.departureStart = null;
    this.firstFireballHit = ['bridge','counterfire','complaint','final'].includes(key);
    this.subsequentHit = ['complaint','final'].includes(key); this.burnSeen = false;
    this.learnerProjectiles = new Set(); this.jumpAttempt = null; this.bridgeDash = false;
    this.rivalFell = false;
    this.haltUntil = null; this.healthFullSince = null; this.finalLoss = null; this.finalPhase = 'opening';
    this.gateMemory.clear();
    this.lastBeat = null; this.lastSegment = null; this.blockedHeld.clear(); this.rival?.reset();
    if (this.rival) this.rival.waypoint = Math.max(1,GREENER_ROUTE.chaseWaypoints.findIndex(p=>p.id===rivalAt.id));
  }
  changed(progress) {
    const beat = progress.current;
    if (beat && beat.id !== this.lastBeat) {
      this.lastBeat = beat.id;
      const segment = progress.segment;
      if (segment?.id !== this.lastSegment) {
        this.lastSegment = segment?.id; this.segmentStartedAt = this.host.now();
        if (segment?.checkpoint) this.checkpoint = segment.id;
        this.gateMemory.clear();
        this.rival?.enter(segment?.scene?.enter,this.host.now());
      }
      this.rival?.enter(beat.stageCue,this.host.now());
      // (halt() states its fact at once, which moves the director on and shows the next beat itself)
      if (beat.stageCue === 'player-halt') { this.halt(); return; }
      if (beat.id === 'duel-midway' || beat.id === 'real-duel') this.duelCounting = true;
      if (beat.id === 'final-guard') this.finalPhase = 'guard';
      if (beat.id === 'defeat-rival') this.finalPhase = 'fight';
      if (beat.stageCue === 'player-departure') this.departureStart = {...this.host.player.position};
      if (beat.stageCue === 'tutorial-complete') { this.director.fact('title-ended'); return; }
    }
    this.onChange(this.present(progress));
  }
  /** What the view is given: the director's progress, and what is allowed, taught, standing and where Rival is. */
  present(progress = this.director.progress) {
    return {...progress,permissions:this.permissions,taught:this.taught,standing:this.standing(progress),rivalHint:this.rivalHint()};
  }
  // A segment's standing instruction (from one fact until another), shown under whatever is being said meanwhile:
  // health regenerates, from the hit itself until it has settled
  standing(progress = this.director.progress) {
    const standing = progress.segment?.standingPrompt;
    const facts = this.director.facts;
    return standing && facts.has(standing.from) && !facts.has(standing.until) ? standing : null;
  }
  // The threat's first word stops the Spellblade where he stands: a short hold on his feet (look stays free), then
  // whatever movement he is still holding carries on.
  halt() {
    const me = this.host.player;
    this.haltUntil = this.host.now() + THREAT_HALT_SEC;
    me.velocity.x = 0; me.velocity.z = 0;
    this.director.fact('player-halted');
  }
  get halted() { return this.haltUntil !== null && this.host.now() < this.haltUntil; }
  rivalHint() {
    if (!['look','move'].includes(this.director.current?.mechanic)) return '';
    const me=this.host.player, actor=this.host.room.players.get(this.rivalId);
    if (!actor) return '';
    const yaw=Math.atan2(-(actor.position.x-me.position.x),-(actor.position.z-me.position.z));
    const angle=Math.atan2(Math.sin(yaw-me.yaw),Math.cos(yaw-me.yaw));
    const direction=Math.abs(angle)>2.3?'behind you':angle>.45?'to your left':angle<-.45?'to your right':'ahead';
    return `Rival is ${direction} · ${Math.round(distance(me.position,actor.position))} m.`;
  }
  allows(action, notify = true) {
    const normal = ACTION[action] ?? action;
    const permissions = this.permissions;
    const allowed = !this.active || !action.startsWith('practice') && (!CONTROLLED.has(normal) || permissions.includes(normal));
    if (!allowed && notify && !this.halted) this.onBlocked(action);
    return allowed;
  }
  // What has been taught so far (the touch controls show exactly these); permissions are these less any hold.
  get taught() {
    const progress = this.director.progress, release = progress.segment?.scene?.releaseControls;
    if (release && this.director.facts.has(release.afterCue)) return release.permissions;
    return progress.current?.permissions ?? progress.segment?.permissions ?? [];
  }
  get permissions() {
    const taught = this.taught;
    return this.halted ? taught.filter(action => !HALTED.has(action)) : taught;
  }
  filter(message) {
    if (message.type === 'input') {
      const copy = {...message};
      const moving = Math.hypot(message.forward ?? 0,message.right ?? 0) > .01;
      if (!moving) this.blockedHeld.delete('move');
      if (!this.allows('move',false) && moving) this.blockedHeld.add('move');
      if (!this.allows('move',false) || this.blockedHeld.has('move')) copy.forward = copy.right = 0;
      if (!this.allows('look',false)) { copy.yaw = this.host.player.yaw; copy.pitch = this.host.player.pitch; }
      for (const action of ['attack','guard','jump','crouch','sprint']) {
        if (!message[action]) this.blockedHeld.delete(action);
        if (!this.allows(action,false)) {
          if (message[action]) this.blockedHeld.add(action);
          copy[action] = false;
        } else if (this.blockedHeld.has(action)) copy[action] = false;
      }
      return copy;
    }
    if (['attack','guard'].includes(message.type)) {
      if (!message.down) { this.blockedHeld.delete(message.type); return message; }
      if (!this.allows(message.type)) { this.blockedHeld.add(message.type); return null; }
      if (this.blockedHeld.has(message.type)) return null;
    }
    return this.allows(message.type) ? message : null;
  }
  beforeStep(now) {
    if (!this.active || this.director.state !== 'running') return;
    // a held Attack or Guard comes back by itself (heldActions.mjs) only while it is the Spellblade's: one the lesson has
    // not given, or has taken away, is let go (pressed again once it is given)
    const hands = this.host.player;
    if (hands?.attackButton && !this.allows('attack', false)) hands.attackButton = false;
    if (hands?.guardButton && !this.allows('guard', false)) hands.guardButton = false;
    if (this.rivalFell) { this.retry({ automatic: true }); this.onBlocked('rival-fall'); return; }
    // (a fall in the final duel is taken before anything waiting to be said may begin: his taunt comes first)
    if (!this.host.player.alive) this.loseFinal();
    this.director.tick(now);
    if (this.director.facts.has('rival-survived-lethal') && this.director.progress.segment?.branches?.includes('rival-constitution')) this.director.offerBranch('rival-constitution');
    const actor = this.host.room.players.get(this.rivalId), me = this.host.player;
    if (this.finalLoss) {
      // Rival won the final duel: his taunt (this time's, if any) is heard over the fallen Spellblade, then a rematch.
      const loss = this.finalLoss, taunt = this.director.optionalCue;
      if (taunt) loss.heard = true;
      const busy = taunt || this.director.audioCue || this.director.pendingCompletion;
      const done = loss.branch ? loss.heard && !busy : now - loss.at >= FINAL_LOSS_QUIET_SEC;
      if (done || now - loss.at >= FINAL_LOSS_MAX_SEC) this.retry({ rematch: true });
      return;
    }
    if (!me.alive && this.loseFinal()) return;
    if (!me.alive) { this.retry({ automatic: true, bridgeFall: this.bridgeFall }); return; }
    if (!actor.alive) actor.respawnAt = Infinity;
    if (this.haltUntil !== null && now >= this.haltUntil) {
      this.haltUntil = null;
      this.blockedHeld.delete('move'); this.blockedHeld.delete('sprint'); this.onResumeMovement();
      this.onChange(this.present());
    }
    this.rival.beforeStep(now);
    // the threshold blow has him down (buckled and braced): the line he says there may begin
    if (this.rival.mode === 'recover' && now - this.rival.recoveryAt >= .45) this.director.fact('rival-downed');
    if (this.rival.mode === 'draw' && now - actor.tutorialDrawAt >= .85) this.director.fact('rival-sword-drawn');
    if (this.rival.mode === 'duel' && actor.attackActive) this.director.fact('rival-attack-started');
    if (this.rival.mode === 'guard-lesson' && actor.attackActive) this.director.fact('guard-attack-started');
    if (['escape','counter-pursuit','counterfire'].includes(this.rival.mode) && Math.hypot(actor.velocity.x,actor.velocity.z) > 1) this.director.fact('rival-escaping');
    // the sheepfold's low wall: Rival over it while the Spellblade is still coming; then the Spellblade over it too
    const reuse = GREENER_ROUTE.jumpReuse;
    if (reuse) {
      const wall = reuse.obstacleBounds;
      if (actor.grounded && actor.position.z < wall.minZ - .3 && actor.position.z > reuse.exit.z - 60) this.rival.deadEndCrossed = true;
      // Rival over it with the Spellblade on his way (still coming, or already leaping after him: "Your dead-end!" is
      // his gloat either way); over it before him, the Spellblade has taken the line from him
      const near = me.position.z - wall.maxZ < 70;
      if (this.rival.deadEndCrossed && near && !this.director.facts.has('dead-end-first')) this.director.fact('dead-end-rival-over');
      if (me.grounded && me.position.z < wall.minZ - .3 && me.position.z > reuse.exit.z - 40) {
        if (!this.rival.deadEndCrossed) this.director.fact('dead-end-first');
        this.director.fact('dead-end-crossed');
      }
    }
    const jump = GREENER_ROUTE.jump;
    if (jump && this.rival.jumpWaiting) this.director.fact('jump-reached');
    if (jump && !me.grounded && me.jumpHeld && me.velocity.y > 0 && distance(me.position,jump.takeoff) < 12) {
      this.jumpAttempt ??= {...me.position}; this.director.fact('jump-used');
    }
    if (jump && this.jumpAttempt && me.grounded && me.position.z <= jump.landing.z && Math.abs(me.position.x-jump.landing.x) < 15) this.director.fact('jump-crossed');
    const bridge = GREENER_ROUTE.bridge;
    if (me.position.z <= GREENER_ROUTE.waypointById['bridge-approach'].z && actor.position.z <= GREENER_ROUTE.waypointById['bridge-approach'].z+5) this.director.fact('bridge-reached');
    const farEdge = greenerBridgeRetryFloor(this.bridgeFailures);
    const landingZ = farEdge ? farEdge.center[2] + farEdge.size[2] / 2 : bridge.gapBounds.minZ;
    if (this.bridgeDash && me.position.z < landingZ && me.grounded) this.director.fact('bridge-crossed');
    if (['counterfire','complaint'].includes(this.rival.mode) && this.rival.counterShots > 0) this.director.fact('rival-counterfire-started');
    if (this.rival.counterShots >= 2 && me.position.z < GREENER_ROUTE.landmarks.counterfire.z) this.director.fact('counterfire-complete');
    // Scene gates compose observations. The dialogue may be freely replaced or removed.
    for (const segment of this.route) for (const gate of segment.scene?.gates ?? []) {
      if (gate.activeBeat && gate.activeBeat !== this.director.current?.id) continue;
      if (gate.activeOnly && segment.id !== this.lastSegment) continue;
      const earned = !this.director.facts.has(gate.cue);
      const key = `${segment.id}:${gate.cue}`;
      if (!this.gateMemory.has(key)) this.gateMemory.set(key, {});
      if (tutorialSceneCue(gate,{player:me,rival:actor,route:GREENER_ROUTE,elapsedSec:now-this.segmentStartedAt,memory:this.gateMemory.get(key)})) {
        this.director.fact(gate.cue);
        if (earned && segment.scene?.releaseControls?.afterCue === gate.cue) {
          this.blockedHeld.delete('move'); this.blockedHeld.delete('sprint'); this.onResumeMovement();
          this.onChange(this.present());
        }
      }
    }
    if (this.departureStart && distance(me.position,this.departureStart) >= 5) this.director.fact('departure-complete');
  }
  events(events) {
    if (!this.active || this.director.state !== 'running') return;
    this.combat.accept(events);
    const hits = events.some(e=>e.type==='damage' && e.attackerId===this.host.player.id && e.victimId===this.rivalId && e.source==='fireball' && e.amount>0);
    for (const event of events) {
      if (event.type === 'death' && event.victimId === this.host.player.id && event.source === 'abyss') {
        const p = this.host.player.position, b = GREENER_ROUTE.bridge;
        this.bridgeFall = this.director.current?.chapter === 'bridge'
          && Math.abs(p.x - b.centerX) < b.width / 2
          && p.z < b.ravineBounds.maxZ && p.z > b.ravineBounds.minZ;
      }
      if (event.type === 'projectileSpawned' && event.projectile.ownerId === this.host.player.id && event.projectile.spell === 'fireball'
        && this.firstFireballHit && ['counterfire', 'complaint'].includes(this.rival.mode)) {
        const projectile = event.projectile, actor = this.host.room.players.get(this.rivalId);
        const dx = actor.position.x - projectile.position.x, dz = actor.position.z - projectile.position.z;
        const speed = Math.hypot(projectile.velocity.x, projectile.velocity.z);
        const apart = Math.hypot(dx, dz);
        const aimedAtRival = (dx * projectile.velocity.x + dz * projectile.velocity.z) / (apart * speed || 1) > .7;
        if (apart <= 70 && aimedAtRival) this.laterFireballs += 1;
        if (this.laterFireballs >= 3 && this.director.progress.segment?.branches?.includes('permission-to-stop')) this.director.offerBranch('permission-to-stop');
      }
      if (event.type==='projectileSpawned' && event.projectile.ownerId===this.host.player.id && event.projectile.spell==='fireball' && !this.firstFireballHit) this.learnerProjectiles.add(event.projectile.id);
      if (event.type==='projectileSpawned' && event.projectile.ownerId===this.host.player.id && FINAL_MODES.has(this.rival.mode)) this.rival.lastPlayerCastAt = this.host.now();
      if (event.type==='projectileImpact') this.learnerProjectiles.delete(event.projectileId);
      if (['block','parry'].includes(event.type) && event.defenderId===this.host.player.id && event.attackerId===this.rivalId && this.rival.mode==='guard-lesson') {
        this.rival.enter('rival-idle',this.host.now());
      }
      if (event.type === 'damage' && event.victimId === this.host.player.id && event.source === 'sword') {
        this.damageBaseline = event.health;
        if (this.rival.mode === 'postscript') this.rival.enter('rival-idle',this.host.now());
      }
      if (event.type === 'damage' && event.victimId === this.host.player.id && event.amount > 0) this.healthFullSince = null;
      if (event.type === 'block' && event.defenderId === this.rivalId && event.attackerId === this.host.player.id) this.rival.lastBlockedAt = this.host.now();
      if (event.type === 'parry' && event.defenderId === this.rivalId && event.attackerId === this.host.player.id && this.rival.mode === 'final-opening') {
        this.finalPhase = 'guard'; this.director.fact('final-first-parry');
      }
      if (event.type === 'death' && event.victimId === this.host.player.id) this.loseFinal();
      if (event.type === 'damage' && event.victimId === this.rivalId && event.attackerId === this.host.player.id && event.amount > 0) {
        // (the duel's damage counts from the fight proper: hits during its opening exchange land, but he does not go
        // down until the banter has been had)
        if (this.rival.mode === 'duel' && this.duelCounting) {
          this.duelDamage += event.amount;
          if (this.duelDamage >= 45) this.director.fact('duel-damage-midway');
        if (this.duelDamage >= 100) { this.rival.beginRecovery(this.host.now()); this.director.fact('duel-damage-threshold'); }
        }
        if (event.source === 'fireball' && FINAL_MODES.has(this.rival.mode)) {
          this.director.fact('final-fireball-hit'); this.director.offerBranch('final-feelings');
        }
        if (event.source === 'fireball') {
          // (the first hit is the Fireball lesson's, its reactions with it; later ones are the pursuit's, or the final
          // duel's own aside: never the first lesson's reactions again)
          if (!this.firstFireballHit) { this.firstFireballHit = true; this.director.fact('fireball-hit'); }
          else if (['counter-pursuit','counterfire','complaint'].includes(this.rival.mode)) { this.subsequentHit = true; this.director.fact('subsequent-fireball-hit'); }
        }
        if (event.health <= 1 && this.host.room.tutorialRival.protected && ['escape','counter-pursuit','counterfire','complaint','jump'].includes(this.rival.mode)) {
          this.director.fact('rival-survived-lethal');
          if (this.director.progress.segment?.branches?.includes('rival-constitution')) this.director.offerBranch('rival-constitution');
        }
      }
      if (event.type==='projectileImpact' && event.ownerId===this.host.player.id && event.spell==='fireball' && !hits && !this.firstFireballHit) this.director.offerBranch('first-fireball-miss');
      if (event.type==='dash' && event.playerId===this.host.player.id) {
        this.rival.observePlayerDash(this.host.now(),event.direction ?? this.host.player.dashDir);
        this.director.fact('dash-used');
        const me = this.host.player, bridge = GREENER_ROUTE.bridge;
        if (!me.grounded && Math.abs(me.position.x-bridge.centerX) < bridge.width/2 && me.position.z < bridge.dashStart.z+3 && me.position.z > bridge.gapBounds.minZ) this.bridgeDash = true;
      }
      if (event.type==='guardBreak' && event.defenderId===this.rivalId && event.attackerId===this.host.player.id && ['final-guard','final-fight'].includes(this.rival.mode)) {
        this.finalBroken = true; this.finalPhase = 'fight'; this.host.room.tutorialRival.protected = false; this.director.fact('rival-guard-broken');
      }
      if (event.type==='death' && event.victimId===this.rivalId) {
        if (event.source === 'abyss') { this.rivalFell = true; continue; }
        const actor = this.host.room.players.get(this.rivalId);
        actor.deathAt = event.at; actor.respawnAt = Infinity;
        this.director.fact('rival-defeated');
      }
    }
  }
  snapshot(snapshot) {
    if (!this.active || this.director.state !== 'running') return;
    const me = snapshot.players.find(x=>x.id===this.host.player.id);
    if (!me?.alive) return;
    this.combat.snapshot(snapshot); this.movement.snapshot(snapshot);
    // A shot that expires into open sky is also a genuine miss. Impacts are handled by events.
    for (const id of this.learnerProjectiles) if (!this.host.room.projectiles.has(id)) {
      this.learnerProjectiles.delete(id);
      if (!this.firstFireballHit) this.director.offerBranch('first-fireball-miss');
    }
    if (this.rivalHint() && snapshot.serverTime-(this.hintAt??0)>=.5) {this.hintAt=snapshot.serverTime;this.onChange(this.present());}
    if (this.damageBaseline !== null && me.health > this.damageBaseline + .5) this.director.fact('health-regenerated');
    // Settled: back at full health, and kept there a moment (a new hit starts it over)
    if (this.damageBaseline !== null && me.health >= (me.maxHealth ?? 100) - 1e-6) {
      this.healthFullSince ??= snapshot.serverTime;
      if (snapshot.serverTime - this.healthFullSince >= HEALTH_SETTLED_SEC) this.director.fact('health-settled');
    } else this.healthFullSince = null;
    if (me.burningUntil > snapshot.serverTime) this.burnSeen = true;
    if (this.burnSeen && me.burningUntil <= snapshot.serverTime && this.director.progress.segment?.branches?.includes('burned')) this.director.offerBranch('burned');
  }
  // Rival has won the final duel. (A rematch, not a replay: the chase and the terms stand. His taunt for the first
  // defeat, another for the second, and quiet after that.) True once the loss is in hand.
  loseFinal() {
    if (this.finalLoss) return true;
    if (!FINAL_MODES.has(this.rival?.mode) || this.host.player.alive) return false;
    this.finalLosses += 1;
    const branch = this.finalLosses === 1 ? 'final-loss-1' : this.finalLosses === 2 ? 'final-loss-2' : null;
    this.finalLoss = { at: this.host.now(), branch, heard: false };
    this.host.player.respawnAt = Infinity;
    cancelAttack(this.host.room,this.rivalId,this.host.now());
    if (branch) this.director.fact('player-defeated-final');
    // (his taunt is what is heard over the fallen Spellblade: an aside still waiting its turn is dropped for it)
    if (branch) this.director.branchQueue.splice(this.director.optionalActive ? 1 : 0);
    if (branch && !this.director.offerBranch(branch)) this.finalLoss.branch = null;
    return true;
  }
  retry({ automatic = false, bridgeFall = false, rematch = false } = {}) {
    if (rematch) {
      // The final duel again from where it stood: the first Parry and his held Guard are not asked for twice.
      const phase = this.finalPhase;
      this.stage('rival-defeat', { rematch: true });
      this.finalPhase = phase;
      if (phase === 'fight') this.finalBroken = true;
      this.director.resumeAt(phase === 'fight' ? 'defeat-rival' : phase === 'guard' ? 'final-guard' : 'final-opening');
      this.onRestore(this.host.player);
      return;
    }
    const previous = this.bridgeFailures;
    this.bridgeFailures = automatic ? Math.min(BRIDGE_RETRY.maxFailures, previous + (bridgeFall ? 1 : 0)) : 0;
    this.host.room.world = greenerPasturesWithBridgeRetries(this.bridgeFailures);
    this.host.room.tutorialBridgeFailures = this.bridgeFailures;
    this.bridgeFall = false;
    const segment = this.checkpoint;
    this.stage(segment); this.director.resumeAt(this.route.find(x=>x.id===segment).beats[0].id);
    if (previous === 0 && this.bridgeFailures > 0) this.director.offerBranch('bridge-growth');
    this.onRestore(this.host.player);
  }
  restart() {
    if (!this.active) return;
    this.bridgeFailures = 0; this.bridgeFall = false; this.laterFireballs = 0; this.finalLosses = 0;
    this.host.room.world = greenerPasturesWithBridgeRetries(); this.host.room.tutorialBridgeFailures = 0;
    this.checkpoint = this.route[0].id; this.stage(); this.director.start(); this.onRestore(this.host.player);
  }
  stop() {
    if (!this.active) return;
    this.active = false; this.host.commandFilter = null; this.host.sessionController = null;
    if (this.host.room) {
      delete this.host.room.tutorialRival;
      cancelAttack(this.host.room,this.rivalId,this.host.now()); setGuard(this.host.room,this.rivalId,false,this.host.now());
    }
    this.off.splice(0).forEach(off=>off()); this.director.skip();
  }
}
