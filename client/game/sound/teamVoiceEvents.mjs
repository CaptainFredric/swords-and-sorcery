// Authoritative semantic team voice event handling:
// - allySaved: when knight A saves knight B by felling their threat, B speaks contextual gratitude ("You defeated a lesser foe...", "I could've done that...").
// - markedTargetFelled: records victim payoff so that defeat barks are heavily biased and killer generic taunts are suppressed, even if snapshot marks clear immediately.
// - spacing rules: preserves at least 3.5s spacing between team-voice moments to prevent chatter.

export const TEAM_VOICE_SPACING_SEC = 3.5;
export const MARKED_PAYOFF_WINDOW_SEC = 4.0;

export class TeamVoiceEvents {
  constructor({ sayMoment = () => false, nowSec = () => 0 } = {}) {
    this.sayMoment = sayMoment;
    this.nowSec = nowSec;
    this.lastTeamVoicePresentationAt = -Infinity;
    this.markedVictimPayoffs = new Map();
  }

  get lastTeamVoiceAt() {
    return this.lastTeamVoicePresentationAt;
  }

  set lastTeamVoiceAt(val) {
    this.lastTeamVoicePresentationAt = val;
  }

  reset() {
    this.lastTeamVoicePresentationAt = -Infinity;
    this.markedVictimPayoffs.clear();
  }

  /**
   * Consume authoritative server semantic event (allySaved, markedTargetFelled).
   * Returns true if a voice line was triggered.
   */
  onEvent(event) {
    if (!event) return false;

    if (event.type === 'markedTargetFelled') {
      const serverAt = event.at ?? 0;
      this.markedVictimPayoffs.set(event.victimId, {
        killerId: event.killerId,
        serverAt,
      });
      return false;
    }

    if (event.type === 'allySaved') {
      const nowPresentation = this.nowSec();
      const canTeamVoice = (nowPresentation - this.lastTeamVoicePresentationAt) >= TEAM_VOICE_SPACING_SEC;
      if (canTeamVoice && event.allyId) {
        // Authoritative speaker is allyId (the saved knight B), NOT saviorId (knight A)
        const said = this.sayMoment(event.allyId, ['allySavedMe']);
        if (said) {
          this.lastTeamVoicePresentationAt = nowPresentation;
          return true;
        }
      }
      return false;
    }

    if (event.type === 'lowContribution' && event.allyId) {
      return Boolean(this.sayMoment(event.allyId, ['lowContribution']));
    }

    return false;
  }

  /**
   * Check if victim had an authoritative markedTargetFelled payoff within the valid window.
   * Cleans up the payoff record upon consumption so subsequent deaths or events do not reuse it.
   */
  consumeMarkedPayoff(victimId, serverAt) {
    const payoff = this.markedVictimPayoffs.get(victimId);
    if (!payoff) return false;
    const at = serverAt ?? payoff.serverAt;
    const withinWindow = Math.abs(at - (payoff.serverAt ?? at)) <= MARKED_PAYOFF_WINDOW_SEC;
    this.markedVictimPayoffs.delete(victimId);
    return withinWindow;
  }

  /**
   * Heavily bias defeat barks for a marked victim payoff (4x chanceScale).
   */
  biasDefeatCandidates(fallenCandidates) {
    return (fallenCandidates ?? []).map((say) => ({
      ...say,
      chanceScale: (say.chanceScale ?? 1) * 4.0,
    }));
  }
}
