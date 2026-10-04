# Ordinary motion and sword hand pass

Based on main at 4b5932ff5a1c829da6c50445428af11f21d6b9ba, isolated in branch `polish/ordinary-motion`.

The first person right gauntlet is fitted around the physical sword handle in the artist source. Excess palm volume is reduced, wrist continuity is retained, and the forearm keeps its slim profile. The former load time resize used a guessed pivot about four centimetres away from the actual handle centre. Removing it makes the Blender source accurately represent the shipped hand. The source comparison identifies exactly one changed object, `Arm.R`, and only its vertex positions. The sword, left hand, rig, weights, topology, materials and every first person action curve are preserved.

Existing third person Run and Sprint curves gain clearance on the returning knee and boot. Idle and Guard pelvis contact now uses the beveled soles. Clip lengths and upper body curves are preserved. The runtime moving crouch compensation measures the lowest actual sole across both legs, fixing the support leg sinking into the floor. Ordinary cast gestures ease through draw, release and recovery while retaining gather, release and recovery durations.

## Verification

`npm run verify`: syntax checks, 687 passing tests and HTTP/WebSocket smoke test.

Blender 4.5.14: source roundtrip integration, authored motion contacts sampled between keys, and source scope comparison. Only Idle/Guard pelvis and Run/Sprint leg/pelvis curves changed in third person. The first person grip utility reproduces the saved geometry exactly.

Both exported GLBs pass their contract validators and the first person slash image passes the render validator. Third person: 12,952 triangles, 2,176,676 bytes, within 35,000 triangles and 2,400,000 bytes. First person: 4,572 triangles, 703,992 bytes, within 16,000 triangles and 1,000,000 bytes.

The browser integration check samples the actual exported skinned soles through Idle, Run, Sprint, Guard and crouching. Every measured contact is within the test bounds of 4 millimetres below and 12 millimetres above the floor; observed moving contact stays within about 6 millimetres. Production assets load in menu, first person and remote slots. Actual practice views were inspected for neutral and Guard composition. Chromium emitted internal `UnknownError` messages during the preview; rendering, asset loading and the integration check still completed.

## Scope held for Claude

Vortex, Sunder, ruptures, ultimate startup, ultimate cameras and Vortex projectiles retain their existing code and tuning. Voice lines, voice director, menu music and Credits voice content are untouched. Server and shared gameplay code are untouched.

Slash_1, Slash_2 and Slash_3 remain unchanged because Vortex and Sunder reuse those actions. Cast, Dash, Air, Stagger and Death authored clips also remain unchanged. Gauntlet jab mechanics, ordinary spell effects, cape springs, helmet and visor geometry remain as existing. This pass corrects demonstrated presentation defects rather than changing every audited system. The right hand geometry refinement carries through every pose, including poses used by ultimates, while retaining their exact animation curves and behavior.

## Next useful pass

Assess the ordinary sword chain as a whole after Claude finishes the shared presentation work. Focus on readable shoulder driven windup, committed contact, and a convincing return to Guard. Keep the gameplay contact schedule as the constraint.

## Changed files
1. `.github/workflows/spellblade-assets.yml`
2. `client/assets/characters/spellblade/manifest.json`
3. `client/assets/characters/spellblade/spellblade-fp.glb`
4. `client/assets/characters/spellblade/spellblade.glb`
5. `client/game/SpellbladeAnimator.mjs`
6. `client/game/SpellbladeAssets.mjs`
7. `client/game/castGesture.mjs`
8. `client/game/castGesture.test.mjs`
9. `client/game/spellbladeContact.browser.mjs`
10. `client/game/spellbladeContact.mjs`
11. `client/game/spellbladeContact.test.mjs`
12. `docs/ordinary-motion-pass.md`
13. `scripts/test-spellblade-motion.py`
14. `tools/blender/characters/spellblade/kit/first_person_grip.py`
15. `tools/blender/characters/spellblade/kit/ordinary_motion.py`
16. `tools/blender/characters/spellblade/promotion.json`
17. `tools/blender/characters/spellblade/source/README.md`
18. `tools/blender/characters/spellblade/source/spellblade-first-person.blend`
19. `tools/blender/characters/spellblade/source/spellblade-third-person.blend`
