# Spellblade arm candidate

Source revision: `f1b2b6277fc0b222238e5c61e868189d7efd6466`.

The right sword hand is built from the accepted left spell hand’s actual 32 palm, wrist, knuckle, finger and thumb components. Their topology, material assignments, shading and exact painted corner associations are preserved. The pieces are fitted into a closed grip around the unchanged sword: the palm follows the rear quadrant, three plated phalanges close each finger, and the two thumb segments oppose the fingers. Finger curl varies across the hand; plates stay shorter than their leather supports so joints remain visible. The armored back faces the useful gameplay camera direction.

The same closed construction transfers from TP to FP. FP uses the existing physical grip scale ratio of 0.84 and the actual cuff/grip frame. Its rig, sword and animation curves remain unchanged. The left hand, PalmRune, both forearms and cuffs are exactly preserved from the accepted preceding candidate. All 74 current hand and forearm components match between perspectives.

The earlier cuff pass remains present: fitted steel collars, brass rim treatment, shorter elbow collars, tapered steel vambraces and brass framed raised shield plates. These components were left alone during the sword hand replacement.

The body, upper arms, shoulders, helmet, cloth, sword, PalmRune, bone hierarchy, rig transforms, material slots and every authored animation curve are preserved. Gameplay and audio files are unchanged.

Verification passed: strict `--right-hand` preservation and complete sword surface clearance through 375 TP poses and 200 FP poses; exact correspondence of 74 TP/FP components; exact source left to new right construction correspondence for all 32 hand components; source save/export/import roundtrip; Idle/Guard seams; second strike clearance through 177 samples per perspective; production build, GLB contracts and sword visibility. Full `npm run verify` passed 1,335 game tests and four HTML5 tests, syntax checks and HTTP/WebSocket smoke.

TP has 13,124 triangles and 2,311,316 bytes. FP has 4,832 triangles and 734,152 bytes. The unchanged targets remain 2,400,000 and 1,000,000 bytes. The exports are 72,636 and 72,128 bytes smaller respectively than the preceding accepted candidate.

Game inspection covers normal idle, Guard, Chivalry, three sword strikes, Fireball, Frostfire, Sprint and side grip detail. Matched comparison shots use a 1440 by 756 viewport and the same pose times. The combined TP/FP image stages the actual production assets together. These are controlled production renderer pose inspections; the helper freezes the local clock and samples existing actions. It was removed by reloading afterward. A developer scenario through the production InputController exercised real local attacks, Guard, casting, Sprint and Dash and collected 206 state samples. Its temporary input override was restored, and the page was reloaded afterward. The raw local recording is retained under output; the review page uses the matched pose images. Blender comparison renders show actual source geometry beside the creator’s concept.

Open `comparison.html` for the accepted previous sword hand and the copied hand. The editable `final-comparison.blend` contains the concept and both source perspectives. The source helper is `tools/blender/characters/spellblade/kit/right_hand_from_left.py`; replay it with `--baseline` pointing at the accepted source pair from commit `7f52d97` and `--out` at a separate directory. Both production Blender files remain the artist source for future direct edits.

[Changed files in this hand pass](right-hand-files.txt), [source correspondence](left-to-right-provenance.json), [focused validation](right-hand-validation.txt) and [export report](build-report.json).

This hand followup is isolated on `art/right-hand-from-left`, based on main `bf6526a` after the creator merged PRs 164 and 165. No merge, deployment or publication was performed by this pass. The final artistic assessment remains with the creator.
