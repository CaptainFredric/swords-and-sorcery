// Observe ordinary local Room events. This adapter never sends combat commands.
export class TutorialCombatCues {
  constructor(director, { playerId, rivalId, local = false } = {}) {
    if (!local || !playerId || !rivalId || playerId === rivalId) {
      throw new Error('Tutorial cues require a local player and distinct rival');
    }
    this.director = director;
    this.playerId = playerId;
    this.rivalId = rivalId;
    this.reset();
  }

  reset() {
    this.guarding = null;
    this.guarded = false;
    this.lowered = false;
    this.outcome = null;
    this.runId = this.director.runId;
  }

  accept(events) {
    if (this.runId !== this.director.runId) this.reset();
    let advanced = 0;
    for (const event of events) {
      let cue = null;
      if (event.playerId === this.playerId && event.type === 'guardStarted') {
        this.guarding = true;
        this.lowered = false;
      }
      if (event.playerId === this.playerId && event.type === 'guardEnded') {
        this.guarding = false;
        this.lowered = this.guarded;
        if (this.lowered) cue = 'guard-lowered';
      }
      if (['block', 'parry'].includes(event.type) && event.defenderId === this.playerId
        && event.attackerId === this.rivalId && !event.vortex && !event.ram) {
        this.guarding = true;
        this.guarded = true;
        cue = 'successful-guard';
      }
      if (['block', 'parry'].includes(event.type) && event.attackerId === this.playerId
        && event.defenderId === this.rivalId && !event.vortex && !event.ram) cue = 'sword-contact';
      if (event.type === 'swordHit' && event.playerId === this.playerId && event.targetId === this.rivalId) {
        cue = 'sword-contact';
      }
      if (event.type === 'damage' && event.victimId === this.playerId && event.attackerId === this.rivalId
        && event.source === 'sword' && event.amount > 0 && !event.ultimate
        && this.guarding === false && this.lowered) cue = 'player-damaged';
      if (this.director.current?.advanceOn === 'duel-complete' && event.type === 'death'
        && ((event.victimId === this.playerId && event.killerId === this.rivalId)
          || (event.victimId === this.rivalId && event.killerId === this.playerId))) {
        this.outcome = { winnerId: event.killerId, loserId: event.victimId, reason: 'death' };
        cue = 'duel-complete';
      }
      if (this.director.current?.advanceOn === 'duel-complete' && event.type === 'matchEnded' && [this.playerId, this.rivalId].includes(event.winnerId)
        && event.reason === 'score') {
        this.outcome = { winnerId: event.winnerId, reason: 'score' };
        cue = 'duel-complete';
      }
      if (cue && this.director.accept(cue)) advanced += 1;
    }
    return advanced;
  }

  // LocalHost sends events before their snapshot. Do not use the old snapshot's
  // Guard state to reinterpret those events; use snapshots only to catch a lowered
  // Guard that happened during intervening dialogue or to initialize current state.
  snapshot(snapshot) {
    if (this.runId !== this.director.runId) this.reset();
    const player = snapshot.players?.find(player => player.id === this.playerId);
    if (!player) return;
    if (this.guarded && this.guarding === true && !player.guarding) this.lowered = true;
    this.guarding = Boolean(player.guarding);
    if (this.guarding) this.lowered = false;
    if (this.lowered) this.director.accept('guard-lowered');
  }
}
