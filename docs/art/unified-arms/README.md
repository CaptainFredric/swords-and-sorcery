# Unified Spellblade arms candidate

Source revision: `feb292b606ea0b07163ef938c0bf00b9b3d9cef9`.

The canonical TP gauntlets were edited first. Both forearm shells, both raised panels, hollow fitted brass cuffs, gray backplates, knuckles, articulated steel finger scales and thumb pieces were then transferred into the dedicated FP source. All 79 hand and forearm components retain the same topology, material assignments and colored corner connectivity between perspectives.

The left open hand transfers at scale 1.0 with a 3.26 degree alignment to the unchanged PalmRune. The right hand scales uniformly to the existing FP grip at 0.84; its armor frame turns 45 degrees around the grip for camera readability. Only the hidden FP palm contact cavity is adjusted for the raised grip bands. Forearms retain the canonical cross section, with a 20.17 mm distal extension and about 15.8 degrees of plate alignment for the longer FP forearm bones.

Canonical edits include tapered wrists, open brass cuffs, shorter cupped spell palms, a convex dorsal plate crown, connected curled sword fingers, and a joined opposing thumb. Existing TP geometry was sculpted and cut in Blender; independent FP armor was removed. Dark leather remains on the palm and finger joints. A further visual pass reduced the original palm block to about 38.7 mm depth, kept wrist volume inside the cuff, tapered and cupped the metacarpal planes, varied the four finger curls, and grew the original glove into the thumb root. The unchanged PalmRune remains clear. These are canonical TP edits transferred to FP, rather than an independent FP hand design.

The body, upper arms, shoulders, helmet, cloth, sword, PalmRune, material slots, bone hierarchy, rig transforms and all animation curves are preserved. Gameplay and audio files are unchanged.

Verification: TP preservation and complete sword clearance through 375 poses; FP preservation and complete sword clearance through 200 poses; exact correspondence for 79 pieces; Idle/Guard loop seams; second strike sword/offhand clearance through 177 samples per perspective; source save/export/import roundtrip; production build; GLB contracts and budgets; full `npm run verify`. TP is 13,712 triangles and 2,399,956 bytes. FP is 5,420 triangles and 822,408 bytes.

Actual game inspection covered idle, grip detail, Guard, three ordinary strikes, parry, Sprint, Dash, airborne/landing, Fireball, Frostfire, Gale, Steel and Chivalry. A live input sequence also exercised the local authoritative combat implementation. A trusted arena entry click also acquired real Pointer Lock on the desktop. Native held-key inspection was interrupted by window-control availability; the full local combat sequence uses the production InputController developer scenario.

Open `comparison.html` for the before, previous candidate and unified arm views. The Blender comparison contains actual source geometry and the creator's original concept, rather than promotional substitutes. Its Studio cameras normalize scale; gameplay renders remain the primary visual comparison. This remains an isolated visual candidate for creator approval.
