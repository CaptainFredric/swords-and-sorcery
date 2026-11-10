// The ordinary sword chain as the third-person body plays it: which authored clip each strike is, and where in that
// clip the body is at each moment of the server's chain. Pure (no three.js), so it is measured and tested in Node.
//
// The authored strikes (Slash_1/2/3) each begin and end on the Idle stance: raise, a held beat, the cut, a
// follow-through, and back to Idle. Played back to back that is a reset between every strike (the sword swept back to
// the low right and up again), and played in the chain's 0.72 s slots it lost the last 1.4 frames of each. So:
//
//   - every strike's cut is played at the authored rate through its contact frame, which lands on the server's
//     contact (SWORD_STRIKE_TIMES), whatever else is warped around it;
//   - a strike that may be followed comes to rest at the far end of its follow-through as its slot ends (the earliest
//     the server says whether the next is committed);
//   - followed, the next strike picks up from part-way up its own raise, on the side the last one finished (the
//     forehand ends low left and the backhand rises out of the left; the backhand ends high right and the heavy
//     strike goes up on the right): no return to Idle between the strikes of one chain;
//   - not followed (let go), the strike plays its own way home from there, so a let-go chain recovers for real;
//   - the heavy third strike's follow-through plays to its end at the chain's restart (the server's chain is over at
//     its contact, the body's is not), and arrives on the Idle stance the next chain starts from.
//
// Nothing here changes when a blow lands: only which frame of the authored cut is shown at that moment.

import { SWORD_CHAIN, SWORD_CHAINS, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';

/** The chain's whole cycle: the third contact and the restart after it (2.08 s). */
export const CHAIN_CYCLE = SWORD_STRIKE_TIMES[SWORD_STRIKE_TIMES.length - 1] + SWORD_CHAIN.restart;

// Authored timing of each strike clip (seconds into the clip), measured from the shipped spellblade.glb
// (scripts/sword-loop-audit.mjs): `contact` the frame whose blade crosses the knight's front, `far` the end of its
// follow-through (before it turns for home), `linkIn` part-way up its raise on the side it is raised, `end` its last
// frame (the Idle stance).
export const STRIKE_CLIPS = Object.freeze({
  // (raised: the top of its raise, the sword up as a held Guard has it: a chain begun out of the Guard starts there)
  Slash_1: Object.freeze({ contact: 0.4, far: 0.533, linkIn: 0.1, raised: 0.167, end: 23 / 30 }),
  Slash_2: Object.freeze({ contact: 0.38, far: 0.533, linkIn: 0.1, end: 23 / 30 }),
  Slash_3: Object.freeze({ contact: 0.36, far: 0.5, linkIn: 0.1, end: 20 / 30 }),
});

// The authored clip of each cut (0 the forehand, 1 the backhand, 2 the heavy strike), and so of each chain's strikes in
// order (SWORD_CHAINS: the falling chain, then the rising one, which opens with the backhand from the left and comes
// back down with the forehand from the right)
export const KIND_CLIPS = Object.freeze(['Slash_1', 'Slash_2', 'Slash_3']);
export const CHAIN_CLIPS = Object.freeze(SWORD_CHAINS.map((form) => Object.freeze(form.kinds.map((kind) => KIND_CLIPS[kind]))));

// the cut itself, at the authored rate: this long before the contact, and after it
const CUT = Object.freeze({ before: 0.12, after: 0.04 });
// a let-go strike's way home from the far end of its follow-through
export const RECOVERY_SEC = 0.3;
// the cross-fade from one strike's follow-through into the next one's raise (its own frames moving, the last held)
export const LINK_BLEND_SEC = 0.16;

// out of the Guard into a chain: the guard's raised sword handed to the top of the first strike's raise
export const GUARD_LINK_SEC = 0.12;
// whether a chain began straight out of a raised Guard (guardSeenAt: when the knight was last seen guarding)
const fromGuard = (player, startedAt) => Number.isFinite(player.guardSeenAt) && startedAt - player.guardSeenAt <= 0.15 && startedAt - player.guardSeenAt >= -0.05;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// cubic Hermite from (x0, y0) with slope m0 to (x1, y1) with slope m1, at x
function hermite(x, x0, y0, m0, x1, y1, m1) {
  const h = x1 - x0;
  if (!(h > 1e-9)) return y1;
  const s = clamp((x - x0) / h, 0, 1);
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m1;
}
// a slope that keeps a Hermite segment from overshooting its end (Fritsch–Carlson's bound)
const monotone = (m, dy, dx) => Math.min(m, 3 * Math.max(0, dy) / Math.max(1e-9, dx));

/**
 * Where in its clip strike `slot` is, `elapsed` seconds into the chain. linked: it follows the strike before it in
 * this chain (it picks up from that strike's side); followed: the next strike of the chain is committed (unknown
 * until its slot begins: until then it is treated as possible).
 */
export function strikeClipTime(clipName, slot, elapsed, { linked = slot > 0, followed = null, raised = false } = {}) {
  const clip = STRIKE_CLIPS[clipName];
  const contact = SWORD_STRIKE_TIMES[slot];
  const start = SWORD_CHAIN.starts[slot];
  const next = slot + 1 < SWORD_CHAIN.starts.length ? SWORD_CHAIN.starts[slot + 1] : CHAIN_CYCLE;
  const cutFrom = contact - CUT.before;
  const cutTo = contact + CUT.after;
  const e = elapsed;
  // the raise: from Idle at the authored rate (a first strike), or from part-way up it (a linked one), slowing through
  // the held beat to meet the cut at the authored rate
  if (e < cutFrom) {
    const from = raised && Number.isFinite(clip.raised) ? clip.raised : linked ? clip.linkIn : null;
    if (from === null) return clamp(clip.contact - (contact - e), 0, clip.end);
    const dy = clip.contact - CUT.before - from, dx = cutFrom - start;
    return hermite(e, start, from, monotone(1, dy, dx), cutFrom, clip.contact - CUT.before, monotone(1, dy, dx));
  }
  if (e <= cutTo) return clip.contact + (e - contact);
  const afterCut = clip.contact + CUT.after;
  // the heavy strike (or the last of a chain): its follow-through home, arriving on the stance as the chain restarts
  if (slot === SWORD_STRIKE_TIMES.length - 1) {
    const dy = clip.end - afterCut, dx = next - cutTo;
    return hermite(e, cutTo, afterCut, monotone(1, dy, dx), next, clip.end, 0);
  }
  // a strike that may be followed: its follow-through comes to rest at its far end as its slot ends...
  if (e <= next) {
    const dy = clip.far - afterCut, dx = next - cutTo;
    return hermite(e, cutTo, afterCut, monotone(1, dy, dx), next, clip.far, 0);
  }
  // ...and, let go, plays its own way home from there
  if (followed === false) return hermite(e, next, clip.far, 0, next + RECOVERY_SEC, clip.end, 0);
  return clip.far;
}

/**
 * The third-person body's place in the chain: { clip, time, slot, blend? } while a chain is shown (under way, or
 * playing its last swing out), or null. player: a snapshot ({ attackActive, attackStartedAt, attackCommitted,
 * attackLanded, attackEnd, attackVariant }).
 */
export function chainPresentation(player, serverNow) {
  const startedAt = player?.attackStartedAt;
  if (!Number.isFinite(startedAt)) return null;
  const elapsed = Math.max(0, serverNow - startedAt);
  const clips = CHAIN_CLIPS[player.attackVariant ?? 0] ?? CHAIN_CLIPS[0];
  if (player.attackActive) {
    const committed = Math.max(1, player.attackCommitted ?? 1);
    // the strike whose slot this is (no further than the last committed: its swing plays on until the server
    // commits the next or ends the chain)
    let slot = 0;
    while (slot + 1 < Math.min(committed, clips.length) && elapsed >= SWORD_CHAIN.starts[slot + 1]) slot += 1;
    const followed = committed > slot + 1 ? true : null;
    // (begun straight out of the Guard, the sword already up: the first strike picks up at the top of its raise)
    const raised = slot === 0 && fromGuard(player, startedAt);
    // (swinging: from its raise through the cut. A strike broken off then carries its motion through the fade; one
    // held at the far end of its follow-through, or handing over to the next raise, does not: carried, it would run
    // on into its own way home to Idle while the next strike takes over)
    const swinging = elapsed < SWORD_STRIKE_TIMES[slot] + CUT.after;
    return { clip: clips[slot], slot, swinging, time: strikeClipTime(clips[slot], slot, elapsed, { followed, raised }),
      ...(slot > 0 ? { blend: LINK_BLEND_SEC } : raised ? { blend: GUARD_LINK_SEC } : {}) };
  }
  // the chain is over by the server's word: its last swing played out, unless it was broken off
  const landed = player.attackLanded ?? 0;
  if (!(landed > 0) || player.attackEnd === 'broken' || player.attackEnd == null) return null;
  const slot = Math.min(landed, clips.length) - 1;
  const lastSlot = slot === clips.length - 1;
  const until = lastSlot ? CHAIN_CYCLE : SWORD_CHAIN.starts[slot + 1] + RECOVERY_SEC;
  if (elapsed >= until) return null;
  return { clip: clips[slot], slot, time: strikeClipTime(clips[slot], slot, elapsed, { followed: false }), recovering: true };
}
