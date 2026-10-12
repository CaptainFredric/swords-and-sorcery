# First-person sword gauntlet: deferred to a source-art pass

Status (2026-10-12): **deferred**. The right gauntlet in first person stays exactly as the established model exports
it. It is a modelling problem, to be solved in the first-person source, not at load time.

## What is wrong with it

From the player's camera only the top of the sword fist shows, and the armour kit builds that top from small separate
boxes (`tools/blender/characters/spellblade/kit/arms.py`, `arm_fist`): two back plates stepped one over the other, a
brass strip, a knuckle guard with four studs along it, the leather palm block beside them; the fingers wrapping the
grip are hidden behind it. Seen edge-on from above at arm's length, that reads as a pile of overlapping boxes, not as
a gauntlet. The rig, the socket, the pose and the camera are not the cause: the left hand, built the same way but seen
from its open side, reads clearly.

A load-time simplification (the plates merged, the studs removed) was tried on 2026-10-12 and withdrawn by the creator:
the hand should be rebuilt as coherent armour, not have details deleted from it.

## The direction (the concept art is the visual target)

- a chunky, articulated armoured glove
- dark segmented fingers
- distinct knuckle and back-of-hand armour
- a layered wrist and cuff transition
- the forearm armour flowing naturally into the hand
- a readable sword grip
- stylised low-poly construction: no pile of overlapping boxes, no generic realistic glove

Exact replication is not required; the lineage to the concept should be clear.

## How to do it

- Edit the hand in `tools/blender/characters/spellblade/source/spellblade-first-person.blend` (first person only; the
  third-person knight is its own file), then export and review with `build.py --mode review` and
  `scripts/preview-spellblade.mjs` (see the source README). Promote only after visual acceptance.
- Do not regenerate that file from the kit (`build_kit.sh`): it is hand-edited since the kit last built it (the fitted
  first-person gauntlet, the authored sword grip, the Guard tangents), and a rebuild would throw that work away. Graft
  the new hand into it instead.
- Judge it from the game's camera (the first-person harness: `WeaponView` with the real rig at 78 degrees), at rest,
  walking, sprinting, in Guard, through the three strikes, Dash and a cast. The sword is turned 35 degrees about its
  own length in the hand (`REST_EDGE_TURN`, client/game/fpSlash.mjs), so the fist is seen a little from its
  thumb side at rest.
