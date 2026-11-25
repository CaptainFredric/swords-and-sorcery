Codex: three fixes for the in-game Spellblade, from a phone playtest. Start from the live model on `main`: `client/assets/characters/spellblade/spellblade.glb`, SHA256 `a186934d…`. It has 84 joints and 112 clips: your strut, plus Gemini's Lightning arrival, Vortex and white-flag clips copied on by bone name.

Keep the rig exactly as it is: same joints, names, rest pose and clip names. Leave the helmet and visor alone, and don't rebuild from the kit.

## 1. The cavity at the right elbow

When the sword arm is raised, a dark hollow opens at the elbow, between the upper-arm plate and the bracer. You can see it in Spells & Chivalry's guard: the arm goes up, the sword stands upright above the fist, and the hollow faces the camera. It shows in the Armory showcase and in matches.

- Cover the joint at every bend from straight to fully flexed, and at forearm twists up to ±60°.
- The fix could be a couter (elbow plate) with a padded under-layer, or a sleeve that overlaps further.
- Nothing hollow or see-through should show from any angle.

## 2. The greaves bend like cloth during attacks

In Slash_1–3, GuardCut_*, Run and Sprint, the shin plates (greaves) bend and warp as the knees work. They should behave as rigid plates:
- Weight each greave 100% to its shin bone.
- Let a knee cop (poleyn) and its padding take the knee's bend, and the ankle take the foot's.
- The thigh plates (cuisses) should do the same against the thigh bone.

Check the strikes and the runs at their deepest knee bend, from the side and from behind.

## 3. The bracer wrings when the hand rolls

The game's Guard rolls the sword hand about 58° about the forearm. In the rise into Spells & Chivalry's guard, the upper arm twists about 80°. The skin takes all of that roll at the wrist and the shoulder, so the bracer narrows and stretches.

I measured the bones: they never change length. The deformation is all in the skin.

Pick one:
- **(a), preferred:** add a twist helper on each forearm that takes about half the hand's axial roll. The game would drive it at runtime, the way the first-person arms already spread the wrist's roll onto the forearm.
- **(b):** re-key Guard and the Chivalry guard so the hand's roll stays within ±30° of the forearm.

## 4. Optional: new opening strikes

Every attack opens with the same forehand, right to left. The game can already alternate the forehand and the backhand as openers. More openers would make it read less samey, for example a rising diagonal and an overhead vertical.

Each new opener must:
- cross the knight's front at 0.391 s (Slash_1's contact);
- end on Slash_2's `pickUp` pose (0.167 s into Slash_2), so the chain links on;
- match Slash_1's length, 0.72 s.

## Send back

- One GLB containing the model fixes and the changed or new clips.
- For each fix, before-and-after stills at the worst frame.
- For each new or changed clip: its duration, contact time and lowest point of the blade.
