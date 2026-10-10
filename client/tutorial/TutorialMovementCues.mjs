import { SPRINT } from '../../shared/src/movement.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// Read the same local authoritative movement/stamina facts that drive the HUD.
// Facts survive intervening dialogue so a genuine early action never needs a replay.
export class TutorialMovementCues {
  constructor(director, { local = false, playerId, rivalId } = {}) {
    if (!local || !playerId || !rivalId || playerId === rivalId) throw new Error('Movement cues require local actors');
    this.director = director; this.playerId = playerId; this.rivalId = rivalId;
    this.reset();
  }
  reset() {
    this.runId = this.director.runId;
    this.facts = new Set(); this.start = null; this.previous = null;
    this.travel = 0; this.sprinted = false; this.exhausted = false;
  }
  snapshot(snapshot) {
    if (this.runId !== this.director.runId) this.reset();
    const player = snapshot.players?.find(x => x.id === this.playerId);
    const rival = snapshot.players?.find(x => x.id === this.rivalId);
    if (!player?.alive || !rival?.alive) { this.previous = null; return; }
    if (!this.start || !this.previous) {
      this.start = { position: { ...player.position }, yaw: player.yaw, pitch: player.pitch,
        distance: distance(player.position, rival.position), stamina: player.guardStamina };
      this.previous = player;
      return;
    }
    const step = distance(player.position, this.previous.position);
    // A spawn/reset discontinuity never earns walking or wandering progress.
    if (step > 3) { this.previous = null; return; }
    const remaining = distance(player.position, rival.position);
    this.travel += step;
    if (angle(player.yaw, this.start.yaw) >= .2 || Math.abs(player.pitch - this.start.pitch) >= .15) this.facts.add('player-looked');
    if (this.travel >= 1) this.facts.add('player-moved');
    if (this.start.distance - remaining >= 4) this.facts.add('approach-progress');
    if (player.sprinting && step > .01) { this.sprinted = true; this.facts.add('sprint-started'); }
    if (this.sprinted && this.start.stamina - player.guardStamina >= 5) this.facts.add('stamina-decreased');
    if (this.sprinted && player.guardStamina <= 1e-6) this.exhausted = true;
    if (this.exhausted && !player.sprinting) this.facts.add('player-winded');
    if (this.exhausted && !player.sprinting && player.guardStamina >= SPRINT.restartStamina) this.facts.add('stamina-recovered');
    if (remaining <= 3.4 && Math.abs(player.position.y - rival.position.y) <= 2) this.facts.add('rival-reached');
    if (this.director.current?.chapter === 'approach' && this.travel >= 35 && remaining > this.start.distance + 6) this.director.offerBranch('frolic');
    const cue = this.director.current?.advanceOn;
    if (this.facts.has(cue)) this.director.accept(cue);
    this.previous = player;
  }
}
