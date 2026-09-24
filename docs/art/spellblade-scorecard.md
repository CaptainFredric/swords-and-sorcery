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
| Helmet crown | Helmet detail, front | In review | First squaring overshot into a lid; corrected to the concept pentagon with a wide brass beak and taller crest. |
| Helmet face and cheeks | Helmet detail | In review | Block cheeks flush with the crown, outer-stroke brackets, brass nose tip, straight rear. |
| Head scale | Front, side, back | In review | 5.6 to 6.2 heads (head scaled 0.88). Concept 6.5 to 7.5; the remainder is kept for readability at distance. |
| Shoulder span | Front, back | Flagged | Model 0.48 of height; concept about 0.37. An earlier pass enlarged the near shoulder on request, so this waits for a decision. |
| Scarf | Front, helmet detail | In review | Bulkier cowl under the helmet rim with a longer chest drape; the visor is fully visible again. |
| Back banner | Back, side | In review | Straight sides, stepped hem, light border; stands off the back toward the hem for side mass. Length and width unchanged against the concept. |
| Torso depth | Side | Open | Breastplate and backplate depth untouched so far; judge again after the banner change. |
| Front tabard | Front | In review | Straight sides, stepped hem and border; shortened and narrowed to the concept (hem 0.26 vs 0.28, width 0.15 vs 0.14). |
| Belt and hangers | Front | Close | Buckle, diamond and hangers present. |
| Arms and gauntlets | Front, side | Close | Hand construction pass done earlier. |
| Legs and boots | Front, back | In review | Thickened to the concept outline (thigh 1.15, shin 1.2, boots 1.15 wide). Layered knee cops and brass straps still missing. |
| Sword | Weapon detail | In review | Blade 12% longer and slimmer. Crossguard shape still differs. |
| Materials and values | In game | Open | Base colors are already dark; the pale look is the bright review lighting. Judge under the game's own lighting before changing materials. |
| Spell hand VFX | Front | Runtime | Glow orb and pixel particles belong to the game effects, not the mesh. |
