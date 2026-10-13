import { SPRINT } from '../../shared/src/movement.mjs';

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// Read the same local authoritative movement/stamina facts that drive the HUD.
// Facts survive intervening dialogue so a genuine early action never needs a replay.
export class TutorialMovementCues {
  // progress: how far along the way to Rival a position is (metres); straight-line distance unless the way bends
  constructor(director, { local = false, playerId, rivalId, progress = null } = {}) {
    if (!local || !playerId || !rivalId || playerId === rivalId) throw new Error('Movement cues require local actors');
    this.director = director; this.playerId = playerId; this.rivalId = rivalId; this.progressOf = progress;
    this.reset();
  }
  reset() {
    this.runId = this.director.runId;
    this.facts = new Set(); this.start = null; this.previous = null;
    this.travel = 0; this.sprinted = false; this.exhausted = false;
    this.lookTravel = 0; this.sprintSince = null;
  }
  snapshot(snapshot) {
    if (this.runId !== this.director.runId) this.reset();
    const player = snapshot.players?.find(x => x.id === this.playerId);
    const rival = snapshot.players?.find(x => x.id === this.rivalId);
    if (!player?.alive || !rival?.alive) { this.previous = null; return; }
    if (!this.start || !this.previous) {
      this.start = { position: { ...player.position }, yaw: player.yaw, pitch: player.pitch,
        distance: distance(player.position, rival.position), stamina: player.guardStamina,
        along: this.progressOf?.(player.position) ?? 0 };
      this.previous = player;
      return;
    }
    const step = distance(player.position, this.previous.position);
    // A spawn/reset discontinuity never earns walking or wandering progress.
    if (step > 3) { this.previous = null; return; }
    const remaining = distance(player.position, rival.position);
    const gained = this.progressOf ? this.progressOf(player.position) - this.start.along : this.start.distance - remaining;
    this.travel += step;
    this.lookTravel += Math.min(.5, angle(player.yaw, this.previous.yaw) + Math.abs(player.pitch - this.previous.pitch));
    if (this.lookTravel >= 1.2 && (angle(player.yaw, this.start.yaw) >= .7 || Math.abs(player.pitch - this.start.pitch) >= .45)) this.facts.add('player-looked');
    if (this.travel >= 1) this.facts.add('player-moved');
    if (gained >= 4) this.facts.add('approach-progress');
    if (player.sprinting && step > .01) { this.sprinted = true; this.facts.add('sprint-started'); }
    if (player.sprinting && step > .01) this.sprintSince ??= snapshot.serverTime;
    else this.sprintSince = null;
    if (this.sprintSince !== null && snapshot.serverTime - this.sprintSince >= 2.5 && player.guardStamina >= 10) this.facts.add('sprint-sustained');
    if (this.sprinted && this.start.stamina - player.guardStamina >= 5) this.facts.add('stamina-decreased');
    if (this.sprinted && player.guardStamina <= 1e-6) this.exhausted = true;
    if (this.exhausted && !player.sprinting) this.facts.add('player-winded');
    if (this.exhausted && !player.sprinting && player.guardStamina >= SPRINT.restartStamina) this.facts.add('stamina-recovered');
    // Conversation requires proximity now, not a remembered pass during earlier narration.
    if (remaining <= 3.4 && Math.abs(player.position.y - rival.position.y) <= 2) this.facts.add('rival-reached');
    else this.facts.delete('rival-reached');
    if (this.director.current?.chapter === 'approach' && this.travel >= 45 && gained < this.travel * .2) this.director.offerBranch('frolic');
    // Milestones describe actions already performed, even if their lesson gate arrives after a long take.
    // Proximity remains a live condition and must never be remembered from a passing encounter.
    for (const fact of this.facts) if (fact !== 'rival-reached' && !this.director.facts.has(fact)) this.director.fact(fact);
    const cue = this.director.current?.advanceOn;
    if (this.facts.has(cue)) this.director.accept(cue);
    this.previous = player;
  }
}
