// A line that turns the Spellblade's head: while it plays, the view eases round to where something is (Rival, a few
// steps ahead of where he is running), holds there a moment and is let go. The player's own look always wins: any
// turn of theirs (mouse or touch) and the guide lets go at once, for the rest of that line. It only ever turns the
// view (yaw, and pitch back to level); it moves nothing and changes no rule.
//
// A beat asks for it with lookGuide: { at: 'rival', leadSec, turnSec, holdSec } (leadSec: how far ahead of him, in
// his own running; turnSec: about how long the turn takes; holdSec: how long it is held once there).

const TAU = Math.PI * 2;
// (rad/s: about 70 degrees a second at most, a slow turn of the head)
export const MAX_TURN_RATE = 1.2;
const wrap = (angle) => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;

export class TutorialLookGuide {
  constructor({ session, rival = () => null, player = () => null } = {}) {
    this.session = session;
    this.rival = rival;
    this.player = player;
    this.guide = null;    // { key, phase: 'turning' | 'holding' | 'done', heldFor, yaw, pitch }
  }

  /** The beat whose line is guiding now (its own lookGuide), or null. */
  wanted() {
    const director = this.session()?.director;
    const beat = director?.current;
    return beat?.lookGuide && director.state === 'running' ? { beat, key: `${director.runId}:${beat.id}` } : null;
  }

  /** One frame: turns `input` (its yaw and pitch) part of the way, if a line is guiding. Returns whether it did. */
  step(dt, input) {
    const wanted = this.wanted();
    if (!wanted) { this.guide = null; return false; }
    if (this.guide?.key !== wanted.key) this.guide = { key: wanted.key, phase: 'turning', heldFor: 0, yaw: null, pitch: null };
    const guide = this.guide;
    if (guide.phase === 'done' || !input?.enabled) return false;
    // (the player looked for themselves since the last frame: theirs, from now on)
    if (guide.yaw !== null && (Math.abs(wrap(input.yaw - guide.yaw)) > 1e-4 || Math.abs(input.pitch - guide.pitch) > 1e-4)) {
      guide.phase = 'done'; return false;
    }
    const me = this.player(), target = this.target(wanted.beat.lookGuide);
    if (!me || !target) { guide.phase = 'done'; return false; }
    const { turnSec = 1.4, holdSec = .8 } = wanted.beat.lookGuide;
    // (yaw 0 looks toward -z: forward is (-sin yaw, -cos yaw))
    const goal = Math.atan2(-(target.x - me.position.x), -(target.z - me.position.z));
    const off = wrap(goal - input.yaw);
    // eased: quick to start, slowing as it comes round (never faster than a slow head turn)
    const rate = Math.min(Math.abs(off) * 3.2 / turnSec, MAX_TURN_RATE);
    const turn = Math.sign(off) * Math.min(Math.abs(off), rate * dt);
    // (the view's own yaw is never wrapped here: it is the player's, running on as theirs does)
    input.yaw += turn;
    input.pitch += (0 - input.pitch) * Math.min(1, dt * 2.4 / turnSec);
    if (guide.phase === 'turning' && Math.abs(off) < .06) guide.phase = 'holding';
    if (guide.phase === 'holding' && (guide.heldFor += dt) >= holdSec) guide.phase = 'done';
    guide.yaw = input.yaw; guide.pitch = input.pitch;
    return true;
  }

  target({ at = 'rival', leadSec = .8 } = {}) {
    if (at !== 'rival') return null;
    const rival = this.rival();
    if (!rival?.alive) return null;
    return { x: rival.position.x + (rival.velocity?.x ?? 0) * leadSec, z: rival.position.z + (rival.velocity?.z ?? 0) * leadSec };
  }
}
