import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialMovementCues } from './TutorialMovementCues.mjs';
import { TutorialCombatCues } from './TutorialCombatCues.mjs';
import { TutorialRival } from './TutorialRival.mjs';
import { tutorialSceneCue } from './TutorialSceneCues.mjs';
import { TUTORIAL_SEGMENTS, TUTORIAL_BRANCHES, tutorialRouteSegments, tutorialRouteBeats } from './tutorialScript.mjs';
import { GREENER_ROUTE, BRIDGE_RETRY, greenerPasturesWithBridgeRetries, greenerBridgeRetryFloor } from '../../shared/worlds/greenerPastures.mjs';
import { resetPracticePlayer, spawnPracticeDummy, removePracticeDummy } from '../../shared/sim/practice.mjs';
import { cancelAttack, setGuard } from '../../shared/sim/combat.mjs';
import { HEALTH_REGEN } from '../../shared/src/combat.mjs';
import { keyLabel } from '../settings/settingsRegistry.mjs';

const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const ACTION = Object.freeze({cast:'spell',castCurrentSpell:'spell',castPreparedSpell:'prepared',castPreparedSlot:'prepared',selectPreparedSlot:'prepared',selectPreparedSpell:'prepared'});
const CONTROLLED = new Set(['look','move','sprint','attack','guard','spell','dash','jump','crouch','ultimate','gauntlet','prepared']);

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
    default: return ({'duel-damage-threshold':'Fight Rival. Attack, Guard and move.', 'rival-escaping':'Chase Rival.',
      'bridge-reached':'Follow Rival to the broken stone bridge.', 'bridge-crossed':`Cross to the far bank. Dash: ${use('dash')}.`,
      'subsequent-fireball-hit':`Aim at Rival and cast Fireball again: ${use('spell')}.`,
      'counterfire-complete':'Keep chasing. Evade his Fireballs and return fire.', 'rival-final-stand':'Close the distance to Rival.',
      'rival-defeated':'Finish Rival with your sword.', 'departure-complete':'Leave the clearing. Move forward.'})[beat?.advanceOn] ?? '';
  }
}

// Local orchestration owns permissions, checkpoints and choreography. Normal combat resolves all contacts.
export class TutorialSession {
  constructor(host, { onChange = () => {}, onBlocked = () => {}, onRestore = () => {}, random = Math.random,
    route = TUTORIAL_SEGMENTS, omitSegments = [], onResumeMovement = () => {} } = {}) {
    if (!host.local || !host.room?.localTutorial || host.room.worldId !== 'greener-pastures') throw new Error('Tutorial requires local Greener Pastures');
    this.host = host; this.onChange = onChange; this.onBlocked = onBlocked; this.onRestore = onRestore; this.random = random;
    this.onResumeMovement = onResumeMovement;
    this.route = tutorialRouteSegments(route, {omitSegments});
    const enabledBranches = new Set(this.route.flatMap(segment => segment.branches ?? []));
    const branches = Object.fromEntries(Object.entries(TUTORIAL_BRANCHES).filter(([id]) => enabledBranches.has(id)));
    this.director = new TutorialDirector({segments:this.route,beats:tutorialRouteBeats(this.route),branches,
      onChange:progress => this.changed(progress)});
    this.active = false; this.off = []; this.lastBeat = null; this.lastSegment = null;
    this.checkpoint = this.route[0].id; this.blockedHeld = new Set();
    this.bridgeFailures = 0;
    this.laterFireballs = 0;
  }
  get requiresFinalGuard() { return this.director.beats.some(beat=>beat.advanceOn==='rival-guard-broken'); }
  start() {
    if (this.active) return;
    this.active = true; this.stage(this.route[0].id);
    this.movement = new TutorialMovementCues(this.director,{local:true,playerId:this.host.player.id,rivalId:this.rivalId});
    this.combat = new TutorialCombatCues(this.director,{local:true,playerId:this.host.player.id,rivalId:this.rivalId});
    this.rival = new TutorialRival(this);
    this.host.commandFilter = message => this.filter(message);
    this.host.sessionController = this;
    this.off = [this.host.on('events',batch=>this.events(batch.events)), this.host.on('snapshot',snapshot=>this.snapshot(snapshot))];
    this.director.start();
  }
  stage(segment = this.route[0].id) {
    const room = this.host.room, now = this.host.now();
    resetPracticePlayer(room,this.host.player.id,now); removePracticeDummy(room);
    const rival = spawnPracticeDummy(room,'PASSIVE',now);
    const scene = this.route.find(x=>x.id===segment)?.scene;
    const key = scene?.checkpoint ?? 'opening';
    const at = GREENER_ROUTE.checkpointPositions[key];
    const rivalAt = ({pursuit:GREENER_ROUTE.waypointById.escape,jump:GREENER_ROUTE.jump?.waitPoint,fireball:GREENER_ROUTE.waypointById.fireball,
      bridge:GREENER_ROUTE.bridge.dashLanding,counterfire:GREENER_ROUTE.waypointById.counterfire,
      complaint:GREENER_ROUTE.waypointById.pride,final:GREENER_ROUTE.finalStand})[key] ?? GREENER_ROUTE.rivalMeeting;
    this.host.player.position = {x:at.x,y:at.y,z:at.z};
    this.host.player.yaw = at.yaw; this.host.player.pitch = 0;
    this.host.player.input = {...this.host.player.input,forward:0,right:0,yaw:at.yaw,pitch:0};
    // The saved Armory and host defaults stay intact. Only this room's actor carries Fireball.
    this.host.player.spell = this.host.player.startingSpell = 'fireball';
    this.host.player.preparedSpells = ['fireball']; this.host.player.preparedSpellSelected = true;
    rival.name = 'Rival'; rival.position = {x:rivalAt.x,y:rivalAt.y,z:rivalAt.z};
    rival.yaw = rivalAt.yaw; rival.input = {...rival.input,yaw:rival.yaw};
    rival.spell = 'fireball'; rival.botSkill = 'squire'; rival.tutorialSwordDrawn = key !== 'opening' && key !== 'introductions';
    rival.spawnProtectionUntil = now; this.rivalId = rival.id;
    room.tutorialRival = {id:rival.id,protected:true}; room.projectiles.clear();
    this.duelDamage = 0; this.finalBroken = false; this.damageBaseline = null; this.departureStart = null;
    this.firstFireballHit = ['bridge','counterfire','complaint','final'].includes(key);
    this.subsequentHit = ['complaint','final'].includes(key); this.burnSeen = false;
    this.learnerProjectiles = new Set(); this.jumpAttempt = null; this.bridgeDash = false;
    this.rivalFell = false;
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
        this.rival?.enter(segment?.scene?.enter,this.host.now());
      }
      this.rival?.enter(beat.stageCue,this.host.now());
      if (beat.stageCue === 'pursuit-release') {
        this.blockedHeld.delete('move'); this.blockedHeld.delete('sprint'); this.onResumeMovement();
        this.director.fact('pursuit-released'); return;
      }
      if (beat.stageCue === 'player-departure') this.departureStart = {...this.host.player.position};
      if (beat.stageCue === 'tutorial-complete') { this.director.fact('title-ended'); return; }
    }
    this.onChange({...progress,permissions:this.permissions,rivalHint:this.rivalHint()});
  }
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
    if (!allowed && notify) this.onBlocked(action);
    return allowed;
  }
  get permissions() {
    const progress = this.director.progress, release = progress.segment?.scene?.releaseControls;
    if (release && this.director.facts.has(release.afterCue)) return release.permissions;
    return progress.current?.permissions ?? progress.segment?.permissions ?? [];
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
    if (this.rivalFell) { this.retry({ automatic: true }); this.onBlocked('rival-fall'); return; }
    this.director.tick(now);
    if (this.director.facts.has('rival-survived-lethal') && this.director.progress.segment?.branches?.includes('rival-constitution')) this.director.offerBranch('rival-constitution');
    const actor = this.host.room.players.get(this.rivalId), me = this.host.player;
    if (!me.alive) { this.retry({ automatic: true, bridgeFall: this.bridgeFall }); return; }
    if (!actor.alive) actor.respawnAt = Infinity;
    this.rival.beforeStep(now);
    if (this.rival.mode === 'draw' && now - actor.tutorialDrawAt >= .85) this.director.fact('rival-sword-drawn');
    if (this.rival.mode === 'duel' && actor.attackActive) this.director.fact('rival-attack-started');
    if (this.rival.mode === 'guard-lesson' && actor.attackActive) this.director.fact('guard-attack-started');
    if (['escape','counter-pursuit','counterfire'].includes(this.rival.mode) && Math.hypot(actor.velocity.x,actor.velocity.z) > 1) this.director.fact('rival-escaping');
    const jump = GREENER_ROUTE.jump;
    if (jump && this.rival.jumpWaiting && distance(me.position,jump.takeoff) <= 14) this.director.fact('jump-reached');
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
      if (gate.activeOnly && segment.id !== this.lastSegment) continue;
      const earned = !this.director.facts.has(gate.cue);
      if (tutorialSceneCue(gate,{player:me,rival:actor,route:GREENER_ROUTE,elapsedSec:now-this.segmentStartedAt})) {
        this.director.fact(gate.cue);
        if (earned && segment.scene?.releaseControls?.afterCue === gate.cue) {
          this.blockedHeld.delete('move'); this.blockedHeld.delete('sprint'); this.onResumeMovement();
          this.onChange({...this.director.progress,permissions:this.permissions,rivalHint:this.rivalHint()});
        }
      }
    }
    if (this.rival.mode === 'final-fight' && actor.guarding) this.director.fact('rival-final-stand');
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
      if (event.type==='projectileImpact') this.learnerProjectiles.delete(event.projectileId);
      if (['block','parry'].includes(event.type) && event.defenderId===this.host.player.id && event.attackerId===this.rivalId && this.rival.mode==='guard-lesson') {
        this.rival.enter('rival-idle',this.host.now());
      }
      if (event.type === 'damage' && event.victimId === this.host.player.id && event.source === 'sword') {
        this.damageBaseline = event.health;
        if (this.rival.mode === 'postscript') this.rival.enter('rival-idle',this.host.now());
      }
      if (event.type === 'damage' && event.victimId === this.rivalId && event.attackerId === this.host.player.id && event.amount > 0) {
        if (this.rival.mode === 'duel') {
          this.duelDamage += event.amount;
          if (this.duelDamage >= 100) this.director.fact('duel-damage-threshold');
        }
        if (event.source === 'fireball') {
          if (this.firstFireballHit && ['counter-pursuit','counterfire','complaint'].includes(this.rival.mode)) { this.subsequentHit = true; this.director.fact('subsequent-fireball-hit'); }
          else { this.firstFireballHit = true; this.director.fact('fireball-hit'); }
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
      if (event.type==='guardBreak' && event.defenderId===this.rivalId && event.attackerId===this.host.player.id && this.rival.mode==='final-fight') {
        this.finalBroken = true; this.host.room.tutorialRival.protected = false; this.director.fact('rival-guard-broken');
        this.director.offerBranch('final-guard-broken');
      }
      if (event.type==='guardStarted' && event.playerId===this.rivalId && this.rival.mode==='final-fight') this.director.offerBranch('final-guard-reaction');
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
    if (this.rivalHint() && snapshot.serverTime-(this.hintAt??0)>=.5) {this.hintAt=snapshot.serverTime;this.onChange({...this.director.progress,permissions:this.permissions,rivalHint:this.rivalHint()});}
    if (this.damageBaseline !== null && me.health > this.damageBaseline + .5) this.director.fact('health-regenerated');
    if (me.burningUntil > snapshot.serverTime) this.burnSeen = true;
    if (this.burnSeen && me.burningUntil <= snapshot.serverTime) this.director.offerBranch('burned');
  }
  retry({ automatic = false, bridgeFall = false } = {}) {
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
    this.bridgeFailures = 0; this.bridgeFall = false; this.laterFireballs = 0;
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
