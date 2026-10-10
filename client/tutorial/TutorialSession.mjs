import { TutorialDirector } from './TutorialDirector.mjs';
import { TutorialMovementCues } from './TutorialMovementCues.mjs';
import { TutorialCombatCues } from './TutorialCombatCues.mjs';
import { TUTORIAL_PREVIEW_STOP } from './tutorialScript.mjs';
import { resetPracticePlayer, spawnPracticeDummy } from '../../shared/sim/practice.mjs';
import { keyLabel } from '../settings/settingsRegistry.mjs';

const LOCKED = new Set(['attack', 'guard', 'spell', 'cast', 'castCurrentSpell', 'castPreparedSpell',
  'castPreparedSlot', 'gauntlet', 'dash', 'ultimate', 'jump', 'crouch']);

export function tutorialPrompt(beat, { touch = false, bindings = {} } = {}) {
  const keys = action => (bindings[action] ?? []).map(keyLabel).join(' / ');
  if (beat?.mechanic === 'look') return touch ? 'Drag the look area to turn toward Rival.' : 'Move the mouse to look. Click the arena to capture the pointer.';
  if (beat?.mechanic === 'move') return touch ? 'Use the left stick to approach Rival.' : `Move toward Rival: ${['forward', 'back', 'left', 'right'].map(keys).filter(Boolean).join(' · ')}`;
  if (beat?.mechanic === 'sprint') return touch ? 'Move forward with the stick and hold Sprint. The Guard stamina bar shows your energy.' : `Move forward and hold ${keys('sprint')} to sprint. Watch Guard stamina.`;
  if (beat?.mechanic === 'recover') return touch ? 'Release Sprint and Guard. Wait for the real stamina bar to recover.' : `Release ${keys('sprint')} and Guard to recover stamina.`;
  return '';
}

// A local Practice session, with input restrictions and staging owned here.
// No tutorial damage, health, collision, stamina or combat rules exist.
export class TutorialSession {
  constructor(host, { onChange = () => {}, onBlocked = () => {} } = {}) {
    if (!host.local || host.room?.mode !== 'PRACTICE' || host.room.worldId !== 'castleward') throw new Error('Tutorial requires local Castleward Practice');
    this.host = host; this.onBlocked = onBlocked;
    this.director = new TutorialDirector({ prototypeStop: TUTORIAL_PREVIEW_STOP, onChange });
    this.active = false; this.off = [];
  }
  start() {
    if (this.active) return;
    this.active = true;
    this.stage();
    this.movement = new TutorialMovementCues(this.director, {local:true,playerId:this.host.player.id,rivalId:this.rivalId});
    this.combat = new TutorialCombatCues(this.director, {local:true,playerId:this.host.player.id,rivalId:this.rivalId});
    this.host.commandFilter = message => this.filter(message);
    this.off = [this.host.on('events', batch => this.combat.accept(batch.events)), this.host.on('snapshot', snapshot => {
      const me = snapshot.players.find(player => player.id === this.host.player.id);
      if (!me?.alive && this.director.state === 'running') { this.interrupted = true; this.director.skip(); return; }
      this.combat.snapshot(snapshot); this.movement.snapshot(snapshot);
    })];
    this.director.start();
  }
  stage() {
    resetPracticePlayer(this.host.room, this.host.player.id, this.host.now());
    const rival = spawnPracticeDummy(this.host.room, 'PASSIVE', this.host.now());
    rival.name = 'Rival'; rival.position = {x:19,y:0,z:-4.5}; rival.velocity = {x:0,y:0,z:0};
    rival.yaw = Math.PI / 2; rival.input = {...rival.input,yaw:rival.yaw};
    this.host.player.yaw = -Math.PI / 2;
    this.host.player.input = {...this.host.player.input,yaw:this.host.player.yaw};
    this.rivalId = rival.id;
  }
  allows(action, notify = true) {
    const allowed = !this.active || (!LOCKED.has(action) && (!action.startsWith('practice') && !action.startsWith('selectPrepared')));
    if (!allowed && notify) this.onBlocked(action);
    return allowed;
  }
  filter(message) {
    if (message.type === 'input') return {...message, attack:false, guard:false, jump:false, crouch:false};
    if (['attack','guard'].includes(message.type) && !message.down) return message;
    return this.allows(message.type) ? message : null;
  }
  restart() {
    if (!this.active) return;
    this.interrupted = false; this.stage(); this.director.start();
  }
  stop() {
    if (!this.active) return;
    this.active = false;
    this.host.commandFilter = null;
    this.off.splice(0).forEach(off => off());
    this.director.skip();
  }
}
