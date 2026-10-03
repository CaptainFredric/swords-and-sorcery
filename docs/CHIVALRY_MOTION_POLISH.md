# Chivalry motion and selector followup

This pass adds the distinct guarded attack and broader motion continuity requested after the initial Chivalry PR. It remains on feat/chivalry-arsenal and updates draft PR 107. Main and the public Render deployment remain unchanged.

## Motion

Three new artist source actions, GuardCut_1, GuardCut_2 and GuardCut_3, use compact one handed cuts with a braced torso and a defensive free gauntlet. They leave and return to the authored Guard pose. The original Slash action curves remain unchanged. The new actions retain the source frame ranges of the ordinary strikes, and the runtime samples their existing authoritative strike clocks. A simultaneous cast takes ownership of the free gauntlet while the defensive sword cut continues.

Composition handovers now carry the outgoing pose velocity into the incoming action and ease the remaining offset to zero. Starting another action during a handover begins from the displayed pose. Locomotion retains its shared gait phase. Expiry also carries motion into the ordinary mixer sample. Restoring that underlying sample before each exit blend fixes the mixer treating the previously composed output as new input when an unchanged binding skips its write.

First person keeps the existing sword solver and blade direction. Guard brings the wrist path inward and upward, reduces shoulder and view excursion, and frees the offhand from the sword grip so it remains defensive or casts. Entering and leaving that compact path eases over 180 ms. The superseded wrist only correction was removed.

## Spell selection

The game selector and touch fan now share the Armory's iron plaques, crimson accent, brass border, inscription typography and spell colors. The active timer has a small remaining duration line. Equipped and Selected are separate labels. Cooldown and gather states remain visible. Choosing an unavailable spell says RELEASE TO SELECT rather than implying a cast.

Cards retain their DOM identity across cooldown updates and equipped changes. Left, center and right order agrees with the real desktop gesture. The current spell occupies the center. SVG stroke styling also fixes the formerly dark or missing line icons. Touch target geometry is preserved, and reduced motion preferences disable UI transitions.

## Source and asset validation

The accepted TP source was copied before authoring. A Blender comparison verifies unchanged mesh vertices, topology, material assignments and every ordinary action curve including tangent data. New guarded cuts are finite across 89 samples per action, begin and end in Guard, preserve source durations and keep the free gauntlet defensive.

The normal Blender preview build completed successfully with Blender 4.5.14 LTS. TP export: 12,952 triangles and 2,294,200 bytes, within 35,000 triangles and 2,400,000 bytes. The FP build validated at 4,572 triangles and 705,700 bytes. Its production GLB and source were preserved because this pass changes the existing FP runtime solver rather than its source actions.

Both production GLB structural validators pass. Existing Idle and Guard breathing seam checks and ordinary second strike clearance checks pass in both source files. The manifest cache revision is the Git blob identity of the changed TP authored source: 388c586705f97135fbc69597ab7fbd94b1e7f601.

## Verification

npm run verify passes: syntax checks, 833 tests, zero failures, and HTTP/WebSocket smoke checks. Pure tests cover preserved strike clocks, distinct guarded variants, cast ownership, compact FP paths, transition boundary velocity and stable selector cards.

The persistent browser check client/game/chivalryComposition.browser.mjs verifies moving quaternion handovers, interruption continuity, exact accepted clocks, 540 real production skeleton frames, and expiry settling to an independently sampled ordinary Guard pose.

Browser inspection covered 1280 by 800 desktop, a narrow default window, and 844 by 390 touch emulation. Both touch alternate cards remained inside the viewport. A real controller and server gesture selected and gathered Gale, hid the fan on release and retained aim. The recorded comparison shows guarded and ordinary cuts, casting, stride changes, Dash, recovery and expiry. Temporary comparison overlays, input instrumentation and viewport/touch overrides were cleared afterward. Physical phone testing remains outstanding.

## Preserved scope

No server authority, damage, hit windows, action durations, cooldowns, Chivalry values, challenge rewards or bot tuning changed. Accepted body, helmet, rig, materials, cloth, ordinary clips and sword mesh are preserved. Voice logic, Credits VO, menu music/autoplay, Armory identity audio and unrelated Sunder/Vortex systems remain untouched.

## Changed files in this followup

1. client/assets/characters/spellblade/manifest.json
2. client/assets/characters/spellblade/spellblade.glb
3. client/chivalry.css
4. client/game/SpellbladeAnimator.mjs
5. client/game/TouchControls.mjs
6. client/game/WeaponView.mjs
7. client/game/chivalryComposition.browser.mjs
8. client/game/chivalryMotion.mjs
9. client/game/chivalryMotion.test.mjs
10. client/game/chivalryPresentation.test.mjs
11. client/game/spellbladeAnimationPlan.mjs
12. client/game/spellbladeAnimationPlan.test.mjs
13. client/game/spellbladeComposition.mjs
14. client/ui/HUD.mjs
15. client/ui/preparedHud.test.mjs
16. client/ui/preparedSpells.css
17. docs/CHIVALRY_HANDOFF.md
18. docs/CHIVALRY_MOTION_POLISH.md
19. scripts/test-spellblade-chivalry.py
20. tools/blender/characters/spellblade/contract.json
21. tools/blender/characters/spellblade/kit/chivalry_cuts.py
22. tools/blender/characters/spellblade/source/spellblade-third-person.blend
