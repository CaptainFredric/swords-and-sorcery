# Hydrogen's vNext (`b9539803`): evaluated, not installed (2026-11-16)

The request was sent in the Argon Gemini conversation, with the model switched to Hydrogen. Hydrogen delivered eight
files to the Drive folder.

**All four hashes match its stated values:**

| File | SHA-256 | Size |
|---|---|---|
| Third-person GLB | `b9539803…` | 15,384,400 B, 91 clips |
| First-person GLB | `7b37b5d8…` | |
| Third-person `.blend` | `1dd8616f…` | 70,677,432 B |
| First-person `.blend` | `38415484…` | |

## The Blender source: closer, and still an asset blocker

**What's real now.** Opened in Blender 4.5.14 with scripts disabled:
- no appended GLB;
- a 66-bone armature whose hierarchy matches the model bone for bone;
- 63 weighted vertex groups;
- 91 Actions, each keyed on 64 bones.

**What Blender's own exporter needs.** The Actions are in the pre-4.4 (legacy) format with no slot, so:
- assigned as the active Action, they don't drive the armature at all;
- Blender's exporter in Actions mode exports none of them.

Exported through the NLA (`scripts/spellblade-audit/blend_bind_and_export.py`, one track per Action), Blender
produces 91 clips on a 66-joint skin.

**It doesn't reproduce the model.** `scripts/spellblade-audit/source-equivalence.mjs` aligns the two skeletons once
at bind (they agree to 0.00 mm) and then compares every joint in every frame:

| Export | Clips within 1 mm | Error |
|---|---|---|
| The source, exported | **0 of 91** | median clip off by **1.9 m** at its worst joint |
| Control: the delivered GLB imported into Blender and exported by the same route | 79 of 91 | the other 12 within 43 mm (clip lengths that aren't whole 30 fps frames) |

The route is sound, so the source's Actions simply aren't the delivered animation. The keyed values differ: for
example `hand.R` is keyed at a 64° turn in `Slash_1`, and Blender's evaluation puts the pelvis 1.06 m from the model's.

**Verdict:** the delivered GLB still wasn't produced from this `.blend` by Blender.

## The third-person GLB on its merits

It's compatible: 66 joints, the same binds and sockets, plus one new clip, `Slash_3_to_2`. It changes:
- `Gauntlet.R`'s geometry (the wrist remodel);
- the weights of both gauntlets, both pauldrons and the breastplate;
- 39 clips, including locomotion, Mordhau and Riposte.

**Better:**
- **Gauntlet weights:** the whole-plate gauntlet weights of PR #503, exactly. Re-applying #503's correction changes
  nothing.
- **Shoulder:** no stretching or folding in any played frame (production: 26% stretched, 30% folded). In Castleward,
  no pauldron or breastplate edge tears.
- **Hand plates:** folding down to 2.8% of played frames (#503: 12.5%; production: 96%).
- **Wrist angles:** Walk, Run and Sprint bend the sword hand 43–44° from the grip (production 106–123°); Guard twists
  it −51° (−127°). But they sit at 43–44° on nearly every frame, just under the 45° target. That's the pattern of a
  clamp, so it needs judging by eye.
- **The cuts:** the chop reaches −44° below the aim within 0.12 s (target ≤ −40°: met for the first time); the
  steps lift 5.9–7.1 cm, with knee pops ≤ 17°/frame².
- **Slams:** 2.0–2.2 cm above the floor.
- **First person** (`7b37b5d8`, compatible, only `Slash_1` changed, by 3 cm): arm strain worst 1.6× (current 1.8×).

**Worse, or not met:**
- **Elbow:** the plates are tied wholly to the `elbow.R` cop. Offline they distort in 99% of played frames (production
  11%), because the clips don't animate the cop. In Castleward, where the game drives it, the chain's worst stretch is
  7.3× (#503: 2.3×).
- **The wrist still parts:** a median 4.1 cm further than production, worst 13 cm (#503: 3.9 / 7.2).
- **Footwork still glides:** a foot near the floor travels 21–26 cm per cut (target ≤ 2).
- **The chop has lost its line:** 13° to the side of the aim (8916d5bd: −6°).
- **Forehand hips** 8° (target 15); **backhand wrist fold** 12°.
- **The bridges are restructured:** they now start at each cut's end (0.758 s) and land on the next cut's first frame.
  The game times them to 0.467 / 0.167 s, so installing vNext needs `STRIKE_CLIPS` re-measured, a code change, or the
  chain snaps.

## Recommendation

**Don't install vNext as it is.** Its source doesn't reproduce it; its elbow, gliding feet and chop line are open; and
it needs the chain re-timed in code.

Two of its gains are separable and worth having:
- **the shoulder:** now taken into PR #503 by its own whole-plate rule, not vNext's file. No shoulder plate stretches
  or folds, and the pieces part less than vNext's (worst 5.8 cm against 10.6).
- **its first-person arm:** not yet taken.

PR #503 stays independent of vNext.
