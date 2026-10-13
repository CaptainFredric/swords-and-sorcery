# Unified Spellblade arms candidate

Source revision: `4495b55ada6472078db65b5ed3185ecb521e2f39`.

The canonical TP gauntlets were edited first. Both forearm shells, both raised panels, hollow fitted steel cuffs with brass rims, gray backplates, knuckles, articulated steel finger scales and thumb pieces were then transferred into the dedicated FP source. All 79 hand and forearm components retain the same topology, material assignments and colored corner connectivity between perspectives.

The left open hand transfers at scale 1.0 with a 3.26 degree alignment to the unchanged PalmRune. The right hand scales uniformly to the existing FP grip at 0.84; its armor frame turns 45 degrees around the grip for camera readability. Only the hidden FP palm contact cavity is adjusted for the raised grip bands. Forearms retain the canonical cross section, with a 20.17 mm distal extension and about 15.8 degrees of plate alignment for the longer FP forearm bones.

Canonical edits include tapered wrists, open steel cuffs with brass rims, shorter cupped spell palms, a convex dorsal plate crown, connected curled sword fingers, and a joined opposing thumb. Existing TP geometry was sculpted and cut in Blender; independent FP armor was removed. Dark leather remains on the palm and finger joints. A further visual pass reduced the original palm block to about 38.7 mm depth, kept wrist volume inside the cuff, tapered and cupped the metacarpal planes, varied the four finger curls, and grew the original glove into the thumb root. The unchanged PalmRune remains clear. These are canonical TP edits transferred to FP, rather than an independent FP hand design.

The body, upper arms, shoulders, helmet, cloth, sword, PalmRune, material slots, bone hierarchy, rig transforms and all animation curves are preserved. Gameplay and audio files are unchanged.

Verification: TP preservation and complete sword clearance through 375 poses; FP preservation and complete sword clearance through 200 poses; exact correspondence for 79 pieces; Idle/Guard loop seams; second strike sword/offhand clearance through 177 samples per perspective; source save/export/import roundtrip; production build; GLB contracts and budgets; full `npm run verify`. TP is 13,648 triangles and 2,383,952 bytes. FP is 5,356 triangles and 806,280 bytes.

Actual game inspection covered idle, grip detail, Guard, three ordinary strikes, parry, Sprint, Dash, airborne/landing, Fireball, Frostfire, Gale, Steel and Chivalry. A live input sequence also exercised the local authoritative combat implementation. A trusted arena entry click also acquired real Pointer Lock on the desktop. Native held-key inspection was interrupted by window-control availability; the full local combat sequence uses the production InputController developer scenario.

Open `comparison.html` for the early scaffold, accepted hands before this cuff pass, and the revised cuff/forearm views. The Blender comparison contains actual source geometry and the creator's original concept, rather than promotional substitutes. Its Studio cameras normalize scale; gameplay renders remain the primary visual comparison. This remains an isolated visual candidate for creator approval.

## Cuff and forearm followup

The latest pass edits only the existing five forearm components on each side. Both accepted hands are exactly preserved. Cuffs are shorter and slimmer steel collars with brass rim treatment, a raised dorsal lip and a lower palm-side lip. The steel vambraces taper toward the wrist. Their raised shield panels have broader middles, narrower ends, shallow crowns and brass chamfers taken from the concept. The elbow collars are shorter. The same edited construction transfers to first person with the existing fit transforms.

The hollow cuff liner uses two octagonal rings rather than duplicating every exterior bevel internally. Redundant forearm cuts were dissolved inside the edited components. This keeps both model exports below their original budgets without increasing the contract limits. The TP export is 16,004 bytes smaller than the accepted source export; FP is 16,128 bytes smaller.

The `--forearms` preservation mode checks both hands, upper arms, unrelated meshes, hierarchy, transforms, rig, material slots, reference and all action curves. TP sampled 375 authored poses and FP 200; complete sword surface overlap was zero. Exact topology, attachment and colored-corner correspondence passed for all 79 shared components. Source roundtrip, Idle/Guard seams, second strike clearance, production review build, GLB validation, sword visibility and full repository verification passed. The suite ran 1,313 game tests and four HTML5 tests, plus syntax and HTTP/WebSocket smoke checks.

Final production renderer inspection covered idle, Guard, Chivalry, Fireball, Frostfire, Sprint, second strike and close sword grip. The combined TP/FP image is a staged comparison of actual production assets. The pose helper freezes the local scene and samples matching action times; it is not a recording of human combat. It was removed by reloading afterward. The native Blender window was inspected earlier in the shaping pass; final source comparisons were rendered through Blender. No new motion or runtime offsets were introduced.

[Changed files in this followup](cuff-forearm-files.txt). Source changes are in the two production Blender files and `kit/arms_unified.py`; runtime changes are limited to replacing the two exported GLBs and their revisioned manifest. Gameplay, voice, music, balance, sword dimensions, PalmRune and all action timing remain unchanged. This remains draft PR 165; nothing was merged, deployed or published.
