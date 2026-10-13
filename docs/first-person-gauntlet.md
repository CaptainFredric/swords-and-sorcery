# First person sword gauntlet source candidate

Status, October 12: rebuilt in the editable Blender source and exported for creator review. The candidate has separated dark armored fingers, aligned knuckle protection, a faceted hand plate, supported thumb and a layered wrist transition fitted around the physical sword grip.

See [the source diagnosis, Blender handoff and verification](art/right-gauntlet/README.md), [matched comparisons](art/right-gauntlet/comparison.html) and [the live controller recording](art/right-gauntlet/live-actions.webm).

The rig, authored action curves, sword dimensions and approved 35 degree roll remain preserved. The right forearm, left hand and third person source are unchanged. The exported source revision is `1048debe477eef37d2d86bd784c971ec134547c3`.

Future geometry edits belong in `tools/blender/characters/spellblade/source/spellblade-first-person.blend`, on `Arm.R`. Use `scripts/export-spellblade-first-person.py` for the established authored export pipeline. Save artistic edits directly in the source; the historical whole kit builder would reconstruct geometry and actions.

Creator review determines artistic acceptance. The focused tests establish source preservation, grip surface clearance, animation compatibility and asset budgets.
