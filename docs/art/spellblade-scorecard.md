# Spellblade concept scorecard

The canonical sheet (`tools/blender/characters/spellblade/source/references/canonical-spellblade.png`) is the ideal look, not a blueprint. It is painted in perspective and its views disagree slightly (the back view reads about 7.5 heads tall, the front about 6.75), so each region names the view that decides it. Gameplay readability wins a conflict: opponents see the Spellblade at 5 to 20 m, usually moving, and the owner sees only first-person arms.

## Review loop for every pass

1. Render matched sheets and the proportion report:
   `blender --background --factory-startup --python-exit-code 1 --python tools/blender/characters/spellblade/review/compare.py -- --out artifacts/spellblade-review`
   (`--engine CYCLES` where no GPU context exists). Each sheet is concept crop, model, and the concept with the model silhouette traced over it, registered on helmet top and ground.
2. Prove scope: `review/scope_diff.py -- <committed.blend> <working.blend> --expect <objects>` fails when anything outside the named objects changed.
3. Run the source test, build and both GLB validators from the source README, then inspect the candidate in the browser preview at gameplay distance.
4. Update the row below. Only the user moves a row to Accepted.

Cameras and landmark annotations live in `review/concept_views.json`. Ratios are directions for judgment, not pass/fail tolerances.

## Regions

| Region | Deciding view | Status | Notes |
| --- | --- | --- | --- |
| Helmet crown | Helmet detail, front | In review | Squared crown and flush band (September 24). User: "materially closer". |
| Helmet face and cheeks | Helmet detail | In review | Block cheeks flush with the crown, outer-stroke brackets, brass nose tip, straight rear. The scarf still covers the lower face. |
| Head scale | Front, side, back | In review | 5.6 to 6.2 heads (head scaled 0.88). Concept 6.5 to 7.5; the remainder is kept for readability at distance. |
| Shoulder span | Front, back | Flagged | Model 0.48 of height; concept about 0.37. An earlier pass enlarged the near shoulder on request, so this waits for a decision. |
| Scarf | Front, helmet detail | Open | Concept is a thick cowl wrapping the chin and draping to the chest. |
| Torso depth and back banner | Side | Open | Concept banner stands off the back and gives the side view mass; ours hugs the back. Length and width already match (hem 0.20 vs 0.20; width 0.19 vs 0.17). |
| Front tabard | Front | Open | Length and width close. Shape differs: concept is straight-sided with a stepped border and stepped hem; ours tapers. |
| Belt and hangers | Front | Close | Buckle, diamond and hangers present. |
| Arms and gauntlets | Front, side | Close | Hand construction pass done earlier. |
| Legs and boots | Front, back | Open | Concept layers knee cops, stacked greave plates and brass straps; feet read small. |
| Sword | Weapon detail | Close | Concept blade longer and slimmer. |
| Materials and values | All | Open | Concept steel is a darker slate with more dark undersuit, which makes the brass read. |
| Spell hand VFX | Front | Runtime | Glow orb and pixel particles belong to the game effects, not the mesh. |
