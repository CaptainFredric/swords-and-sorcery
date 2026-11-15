// The ordinary sword chain as the third-person body plays it: which authored clip each strike is, and where in that
// clip the body is at each moment of the server's chain. Pure (no three.js), so it is measured and tested in Node.
//
// The authored strikes (Slash_1/2/3) each begin and end on the Idle stance: raise, a held beat, the cut, a
// follow-through, and back to Idle. Played back to back that is a reset between every strike (the sword swept back to
// the low right and up again), and played in the chain's 0.72 s slots it lost the last 1.4 frames of each. So:
//
//   - every strike's contact frame lands on the server's contact (SWORD_STRIKE_TIMES), and through the swing window
//     around it the clip is played at the pace of the server's blade (blade.mjs), so the sword shown is the sword that
//     hits, in every view of it;
//   - a strike that may be followed comes to rest at the far end of its follow-through as its slot ends (the earliest
//     the server says whether the next is committed): the frame Argon's bridges start from;
//   - followed, Argon's authored bridge (Slash_1_to_2, Slash_2_to_3, Slash_2_to_1, Slash_1_to_3) carries the sword from
//     there up into the next strike's raise, on the side the last one finished: no return to Idle between the strikes
//     of one chain, and no cross-fade through the body;
//   - not followed (let go), the strike is handed back to the stance from the far end of its follow-through, rather
//     than swung on past it (the 89's forehand goes on round behind the knight's left shoulder there);
//   - the heavy third strike's follow-through plays to its end at the chain's restart (the server's chain is over at
//     its contact, the body's is not), and arrives on the Idle stance the next chain starts from.
//
// Nothing here changes when a blow lands: only which frame of the authored cut is shown at that moment.

import { MELEE_CONTACT, SWORD_CHAIN, SWORD_CHAINS, SWORD_STRIKE_TIMES } from '../../shared/src/combat.mjs';

/** The chain's whole cycle: the third contact and the restart after it (2.08 s). */
export const CHAIN_CYCLE = SWORD_STRIKE_TIMES[SWORD_STRIKE_TIMES.length - 1] + SWORD_CHAIN.restart;

// Authored timing of each strike clip (seconds into the clip), measured on Argon's 90-clip Spellblade (de8c8655) as the
// client composes it (spellblade.glb as authored: its manifest asks for no sidecar override; the sidecar's technique
// phases appended; scripts/spellblade-chain-sync-audit.mjs and scripts/spellblade-first-cut-probe.mjs measure them
// again). Re-measured only where the new poses showed it: Slash_2 now crosses the aim at 0.297 s (the old 0.332 left the
// shown backhand 27 degrees off the server's at contact), and every bridge lands at 0.167 s:
//   contact  the frame whose blade crosses the knight's front (a side cut's heading, the chop's pitch, through the aim);
//   swing    the frames whose blade lies where the server's does at the start and the end of the swing window
//            (MELEE_CONTACT.window, shared/src/blade.mjs bladeDirection): the authored cuts sweep about twice as fast as
//            the server's blade, so through the window the clip is played at the server's pace, not its own, and the
//            blade shown is the blade that hits;
//   far      where a follow-through is handed on: the first frame of Argon's authored bridges (Slash_1_to_2 and the rest
//            all begin exactly there). (On the 89-clip model the forehand swung on past it to 123 degrees behind the left
//            shoulder; de8c8655's own follow-through reaches 51, the wrist fold 5 degrees);
//   pickUp   where a bridge lands in this strike (the top of its raise);
//   raised   the top of its raise, the sword up as a held Guard has it: a chain begun out of the Guard starts there;
//   end      its last frame (the Idle stance).
export const STRIKE_CLIPS = Object.freeze({
  Slash_1: Object.freeze({ contact: 0.391, swing: Object.freeze([0.367, 0.426]), far: 0.467, pickUp: 0.167, raised: 0.167, end: 23 / 30 }),
  Slash_2: Object.freeze({ contact: 0.297, swing: Object.freeze([0.2, 0.38]), far: 0.467, pickUp: 0.167, end: 23 / 30 }),
  // (the chop, unchanged in de8c8655: it comes down a diagonal and stops 15 degrees below the aim, where the server's
  // goes on down to 50: past its contact it is played at half its own pace, not tracked to a blade it never reaches)
  Slash_3: Object.freeze({ contact: 0.385, swing: Object.freeze([0.346, 0.44]), far: 0.5, pickUp: 0.167, end: 20 / 30 }),
});

// Argon's authored hand-overs between the cuts: each begins exactly on the far end of one cut's follow-through (its
// `far`) and lands on the next cut's `pickUp`, 0.000 m apart in every joint measured, Slash_2_to_1 included (on the
// 89-clip model it landed 0.3 m off). `blend`: the cross-fade into the next cut as the bridge lands.
export const BRIDGES = Object.freeze({
  Slash_1: Object.freeze({ Slash_2: Object.freeze({ clip: 'Slash_1_to_2', duration: 0.32, blend: 0.05 }), Slash_3: Object.freeze({ clip: 'Slash_1_to_3', duration: 0.36, blend: 0.05 }) }),
  Slash_2: Object.freeze({ Slash_3: Object.freeze({ clip: 'Slash_2_to_3', duration: 0.34, blend: 0.05 }), Slash_1: Object.freeze({ clip: 'Slash_2_to_1', duration: 0.32, blend: 0.05 }) }),
});

// The authored clip of each cut (0 the forehand, 1 the backhand, 2 the heavy strike), and so of each chain's strikes in
// order (SWORD_CHAINS: the falling chain, then the rising one, which opens with the backhand from the left and comes
// back down with the forehand from the right)
export const KIND_CLIPS = Object.freeze(['Slash_1', 'Slash_2', 'Slash_3']);
export const CHAIN_CLIPS = Object.freeze(SWORD_CHAINS.map((form) => Object.freeze(form.kinds.map((kind) => KIND_CLIPS[kind]))));

// the last of a first strike's raise is eased into the swing window over this long (it is played at the authored rate
// before that)
const RAISE_EASE = 0.12;
// a let-go strike's way home from the far end of its follow-through: handed back to the stance (the Idle the knight
// stands in next), not swung on through the rest of the authored follow-through
export const RECOVERY_SEC = 0.3;
// the heavy strike's last frame (the stance) is held this long past the chain's restart time: the server restarts a held
// chain on its next tick after it (up to a 30 Hz tick later), and between the two the knight was shown one frame of
// Idle, cross-fading away from the stance and straight back
export const RESTART_GRACE_SEC = 0.07;
// the cross-fade from a follow-through into a bridge (both on the same frame: only the timing changes)
export const LINK_BLEND_SEC = 0.05;

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

/** The swing window of strike `slot` for `clipName`: the server's times and the clip's, and the clip's pace through it. */
export function swingWindow(clipName, slot) {
  const clip = STRIKE_CLIPS[clipName];
  const contact = SWORD_STRIKE_TIMES[slot];
  const from = contact - MELEE_CONTACT.window.early, to = contact + MELEE_CONTACT.window.late;
  const before = (clip.contact - clip.swing[0]) / MELEE_CONTACT.window.early;
  const after = (clip.swing[1] - clip.contact) / MELEE_CONTACT.window.late;
  return { contact, from, to, before, after, at: (before + after) / 2 };
}

/**
 * Where in its clip strike `slot` is, `elapsed` seconds into the chain. linked: it follows the strike before it in
 * this chain (it is picked up at the top of its raise, where that strike's bridge lands: `bridgeEnd` the chain time it
 * lands, `bridgePace` the bridge's pace as it does); followed: the next strike of the chain is committed (unknown until its slot begins: until then it is treated
 * as possible).
 */
export function strikeClipTime(clipName, slot, elapsed, { linked = slot > 0, followed = null, raised = false, bridgeEnd = null, bridgePace = 1 } = {}) {
  const clip = STRIKE_CLIPS[clipName];
  const w = swingWindow(clipName, slot);
  const start = SWORD_CHAIN.starts[slot];
  const next = slot + 1 < SWORD_CHAIN.starts.length ? SWORD_CHAIN.starts[slot + 1] : CHAIN_CYCLE;
  const e = elapsed;
  // the raise, to the start of the swing window
  if (e < w.from) {
    if (linked) {
      // picked up where its bridge landed (at the bridge's pace), slowing into the server's pace as the window opens
      const at = Number.isFinite(bridgeEnd) ? bridgeEnd : start;
      const dy = clip.swing[0] - clip.pickUp, dx = w.from - at;
      if (e <= at) return clip.pickUp;
      return hermite(e, at, clip.pickUp, monotone(bridgePace, dy, dx), w.from, clip.swing[0], monotone(w.before, dy, dx));
    }
    if (raised && Number.isFinite(clip.raised)) {
      const dy = clip.swing[0] - clip.raised, dx = w.from - start;
      return hermite(e, start, clip.raised, monotone(1, dy, dx), w.from, clip.swing[0], monotone(w.before, dy, dx));
    }
    // from Idle at the authored rate, the last of it eased into the window's pace
    const easeFrom = w.from - RAISE_EASE;
    if (e < easeFrom) return clamp(clip.swing[0] - (w.from - e), 0, clip.end);
    return hermite(e, easeFrom, clip.swing[0] - RAISE_EASE, 1, w.from, clip.swing[0], w.before);
  }
  // the swing window: the clip at the server's pace, the contact frame at the server's contact
  if (e <= w.contact) return hermite(e, w.from, clip.swing[0], w.before, w.contact, clip.contact, w.at);
  if (e <= w.to) return hermite(e, w.contact, clip.contact, w.at, w.to, clip.swing[1], w.after);
  // the heavy strike (or the last of a chain): its follow-through home, arriving on the stance as the chain restarts
  if (slot === SWORD_STRIKE_TIMES.length - 1) {
    const dy = clip.end - clip.swing[1], dx = next - w.to;
    return hermite(e, w.to, clip.swing[1], monotone(w.after, dy, dx), next, clip.end, 0);
  }
  // a strike that may be followed: its follow-through comes to rest at its far end as its slot ends (and is held there
  // until the next is committed, or handed home: chainPresentation)
  const dy = clip.far - clip.swing[1], dx = next - w.to;
  return hermite(Math.min(e, next), w.to, clip.swing[1], monotone(w.after, dy, dx), next, clip.far, 0);
}

/**
 * The bridge from strike `slot - 1`'s follow-through into strike `slot`, `elapsed` into the chain: { clip, time, until }
 * while it plays (until: the chain time it lands), or null once it has landed (or there is none). The bridge and the
 * rest of the next strike's raise share the time from the slot's start to its swing window, each at the same pace.
 */
export function bridgeTime(fromClip, toClip, slot, elapsed) {
  const bridge = BRIDGES[fromClip]?.[toClip];
  if (!bridge) return null;
  const start = SWORD_CHAIN.starts[slot];
  const w = swingWindow(toClip, slot);
  const raise = STRIKE_CLIPS[toClip].swing[0] - STRIKE_CLIPS[toClip].pickUp;
  const pace = (bridge.duration + raise) / Math.max(1e-9, w.from - start);
  const until = start + bridge.duration / pace;
  if (elapsed >= until) return { landed: true, until, pace };
  // (out of the rest at the far end of the follow-through, landing at the pace the raise carries on at)
  return { ...bridge, time: hermite(elapsed, start, 0, 0, until, bridge.duration, pace), until, pace };
}

/**
 * The third-person body's place in the chain: { clip, time, slot, blend?, fallback?, fallbackTime? } while a chain is
 * shown (under way, or playing its last swing out), or null. player: a snapshot ({ attackActive, attackStartedAt,
 * attackCommitted, attackLanded, attackEnd, attackVariant }).
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
    if (slot > 0) {
      // handed on from the last strike's follow-through by Argon's bridge, then the raise from where it lands
      const bridge = bridgeTime(clips[slot - 1], clips[slot], slot, elapsed);
      if (bridge && !bridge.landed) {
        const fallbackTime = strikeClipTime(clips[slot], slot, elapsed, { followed });
        // (the bridge's short hand-over is for the follow-through it was authored from; from anything else, a Dash or a
        // stagger, the ordinary cross-fade: blendFrom)
        return { clip: bridge.clip, time: bridge.time, slot, blend: LINK_BLEND_SEC, blendFrom: clips[slot - 1], fallback: clips[slot], fallbackTime, bridge: true };
      }
      const blend = BRIDGES[clips[slot - 1]]?.[clips[slot]]?.blend ?? 0.16;
      return { clip: clips[slot], slot, time: strikeClipTime(clips[slot], slot, elapsed, { followed, bridgeEnd: bridge?.until, bridgePace: bridge?.pace }), blend,
        blendFrom: BRIDGES[clips[slot - 1]]?.[clips[slot]]?.clip ?? clips[slot - 1] };
    }
    return { clip: clips[slot], slot, time: strikeClipTime(clips[slot], slot, elapsed, { followed, raised }),
      ...(raised ? { blend: GUARD_LINK_SEC, blendFrom: 'Guard' } : {}) };
  }
  // the chain is over by the server's word: its last swing played out, unless it was broken off
  const landed = player.attackLanded ?? 0;
  if (!(landed > 0) || player.attackEnd === 'broken' || player.attackEnd == null) return null;
  const slot = Math.min(landed, clips.length) - 1;
  const lastSlot = slot === clips.length - 1;
  const until = lastSlot ? CHAIN_CYCLE + RESTART_GRACE_SEC : SWORD_CHAIN.starts[slot + 1] + RECOVERY_SEC;
  if (elapsed >= until) return null;
  // let go after a strike that could have been followed: held at the far end of its follow-through to the end of its
  // slot, then handed back to the stance (the Idle the knight stands in next, cross-faded over RECOVERY_SEC)
  if (!lastSlot && elapsed >= SWORD_CHAIN.starts[slot + 1]) return { clip: 'Idle', idle: true, time: 0, slot, blend: RECOVERY_SEC, recovering: true };
  return { clip: clips[slot], slot, time: strikeClipTime(clips[slot], slot, elapsed, { followed: false }), recovering: true };
}
