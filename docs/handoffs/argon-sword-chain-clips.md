# Argon handoff: Spellblade sword-chain clips

Owner: Argon (model, skinning, authored clips). Nothing here is integrated until a real GLB with these clips is
delivered and promoted; the game runs today on the clips already shipped in `spellblade.glb`, presented as described
in `client/game/swordChainPresentation.mjs`. Every number below was measured from the shipped GLB with
`scripts/lib/glbPose.mjs` / `scripts/sword-loop-audit.mjs` (Node FK of the real clips, driven by the real sim).

## Timing contract (unchanged, server-owned)

- Chain clock: strikes begin at 0.00 / 0.72 / 1.44 s; contacts at **0.40 / 1.10 / 1.80 s**; the next held chain starts
  0.28 s after the third contact (2.08 s cycle).
- A strike's live window runs 0.09 s before its contact to 0.045 s after (0.11 s for the swing's own motion). At the
  contact the blade lies along the knight's aim (forward, at chest height, from the eyes).
- Two chain forms (`SWORD_CHAINS`): **falling** = forehand, backhand, chop; **rising** = backhand (from the low left),
  forehand (from the high right), chop. Holding alternates them.

## What the shipped clips do, and what the game does about it

| Clip | Length | Authored contact | Shape |
| :--- | :--- | :--- | :--- |
| Slash_1 | 23 fr (0.767 s) | 0.40 | Idle → raise overhead-right → hold 0.17–0.33 → cut down-left → follow-through left (far point 0.533) → back to Idle |
| Slash_2 | 23 fr (0.767 s) | 0.38 | Idle → raise overhead-left → hold → cut down then rising to the right (far point 0.533 high right) → back to Idle |
| Slash_3 | 20 fr (0.667 s) | 0.36 | Idle → raise high → hold → chop to the ground → settle to Idle |

All three start and end exactly on the Idle stance, so played back to back each strike resets to Idle. The game now
plays each cut through its authored contact at the server's contact, holds the follow-through's far point to the end
of the slot, and cross-fades (0.16 s) into the next clip part-way up its raise (`linkIn` 0.10). That removes the reset
but it is a blend, not an authored link.

## Requested clips (priority order)

1. **Chain links, third person** — `Slash_1_to_2`, `Slash_2_to_3`, `Slash_2_to_1` (rising form), `Slash_1_to_3`
   (rising form): from each cut's follow-through far point (Slash_1 0.533 low left; Slash_2 0.533 high right) straight
   into the next cut's raise, ending on the next clip's frame at 0.167 (top of its raise). 6–8 frames each at 30 fps.
   Acceptance: no foot re-plant, hand path continuous in position and velocity at both ends.
2. **Rising opener** — `Rise_1`: the backhand as a chain opener from Idle: the blade dropped and carried across under
   the hands to a low-left chamber (by 0.25 s), rising across to the high right through the contact at **0.40 s**
   (blade forward, chest height), follow-through high right. Today the rising chain opens with Slash_2, which raises
   overhead left and cuts down-then-up; first person shows a true rising cut, so the two views disagree on the
   opener's first half.
3. **Run and sprint strides matched to their speeds** — the Run clip's planted foot travels about 2.2 m/s in clip
   space while the knight runs at 7.5 m/s (sprint ~8.2): planted feet skate at a mean 7.3 m/s in every run, attack or
   not (`sword-loop-audit` "plain run (baseline)"). A stride of ~2.5 m per step at 7.5 m/s (or the game told the
   clip's real ground speed) would fix it for locomotion and for strikes on the move (which now keep the gait under
   the upper body).
4. **Guard entry from a cut** — `Guard_From_Cut`: from any cut's follow-through into the Guard hold (frame 8) in
   0.18–0.22 s. The Guard clip's frames 1–8 swing out through the right and back; a cut broken into the Guard blends
   along that arc today (tip up to 1.04 m/frame at 60 fps, the fastest authored cut's speed).
5. **Heavy overhead for Sunder All That Rusts** — `Sunder_Strike` exists (0.76 s, raise, hold 0.17–0.33, chop to the
   ground at ~0.46, settle) but is not wired: please confirm it is final and give its contact frame. With body support
   (knee drop, hips driving down) it would replace Slash_3 for Sunder's slams.

Delivery: the usual promotion of `spellblade.glb` with the clips named as above; `contract.json` updated. The game
side (clip names, contact frames, link points) is a table in `client/game/swordChainPresentation.mjs`.
