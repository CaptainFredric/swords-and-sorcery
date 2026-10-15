// What the Spellblade has out, as Tutorial 1 brings it in: both arms down out of sight at the start; the sword drawn
// on the Narrator's "Try placating him." (settled before "Stand down where you belong. Please?"); the magic hand
// raised on "I knew that! I had just been waiting for you to remind me!" (coming up on "I knew that!", settled by the
// line's end). Played only as the lesson goes on through those lines; anywhere else (a retry, a checkpoint, a chapter
// begun from the transcript, the tutorial over) the arms are at once as that place has them. An action that needs one
// before its line brings it out quickly itself (WeaponView): a Fireball cast early raises the hand with the cast.

export const TUTORIAL_EQUIPMENT = Object.freeze({
  sword: Object.freeze({ beat: 'placate', atSec: 0.25 }),
  hand: Object.freeze({ beat: 'waiting-reminder', atSec: 0.1, from: 'fireball' }),
});

export class TutorialEquipment {
  constructor({ session, cues = TUTORIAL_EQUIPMENT } = {}) {
    this.session = session;
    this.cues = cues;
    this.clock = 0;
    this.line = null;       // the line being had: { key, at, heard }
    this.last = null;       // where the lesson was last frame: { runId, index }
    this.active = false;
  }

  /** Reset internal tracking clock and line state for a clean restart or chapter jump. */
  reset() {
    this.clock = 0;
    this.line = null;
    this.last = null;
    this.active = false;
  }

  /** One frame: the arms brought to what the lesson has out, played or at once. */
  step(dt, weapon) {
    this.clock += dt;
    const director = this.session()?.director;
    if (!director || director.state !== 'running') {
      // (out of the tutorial, or past its end: both out, as everywhere else)
      if (this.active) { weapon.setEquipment({ sword: true, hand: true }); this.active = false; this.last = null; }
      return;
    }
    this.active = true;
    const index = director.index, current = director.current;
    const key = `${director.runId}:${index}`;
    const heard = director.audioCue?.id === current?.id;
    if (this.line?.key !== key) this.line = { key, at: this.clock, heard };
    else if (heard && !this.line.heard) Object.assign(this.line, { at: this.clock, heard: true });
    const into = this.clock - this.line.at;
    // (the lesson going on as it is had: the same run, a step or two on; anything else is a jump to a place)
    const onward = this.last && this.last.runId === director.runId && index >= this.last.index && index - this.last.index <= 2;
    this.last = { runId: director.runId, index };
    const at = id => director.beats.findIndex(beat => beat.id === id);
    const reached = cue => index > at(cue.beat) || index === at(cue.beat) && into >= cue.atSec;

    const sword = reached(this.cues.sword);
    if (sword && weapon.equipment.sword === 'away') {
      if (onward) weapon.drawSword(); else weapon.setEquipment({ sword: true, hand: weapon.equipment.hand !== 'away' });
    } else if (!sword && weapon.equipment.sword !== 'away') weapon.setEquipment({ sword: false, hand: weapon.equipment.hand !== 'away' });

    // the hand: out once its line is reached, or once the Fireball lesson has begun and it is out already (a cast
    // before the line raised it); away before the lesson
    const lesson = director.beats.findIndex(beat => beat.segment === this.cues.hand.from);
    const hand = reached(this.cues.hand) || onward && index >= lesson && weapon.equipment.hand !== 'away';
    if (hand && weapon.equipment.hand === 'away') {
      if (onward) weapon.revealHand(); else weapon.setEquipment({ sword: weapon.equipment.sword !== 'away', hand: true });
    } else if (!hand && weapon.equipment.hand !== 'away') weapon.setEquipment({ sword: weapon.equipment.sword !== 'away', hand: false });
  }
}
