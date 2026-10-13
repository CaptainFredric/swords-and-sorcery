# Spellblade first person hand parity candidate

The right hand now derives from the accepted third person gauntlet. All 37 hand components use the actual source topology, material assignments and corner colors. The first person rig, eight actions, sword dimensions, approved 35 degree roll, camera, forearm and left hand remain preserved. This candidate awaits creator artistic acceptance.

[Open the visual comparison](comparison.html). It begins with the normal gameplay idle view, then places the supplied original concept hand panel and third person reference beside the candidate. [The premodel correspondence map](PARITY_MAP.md) records what matched, what differed and what could be reused before modeling.

## Diagnosis

PR #162 was useful engineering but introduced a different hand vocabulary. Its long curved finger shells dominated the silhouette. Light steel accounted for about 17.4% of hand surface area; dark steel and dark joint structure accounted for the remaining 82.6%. The accepted third person hand uses shorter beveled cores with separate steel scales, two hand plates, a brass edge and a knuckle bar with four caps.

The candidate's measured hand area is 46.9% light steel, 30.4% dark steel, 19.6% dark leather and 3.1% brass. Accepted third person is 42.9%, 27.3%, 26.6% and 3.2% respectively. These shares include hidden surfaces and describe mesh palette distribution rather than screen coverage. The normal idle and Chivalry images provide the visual evidence.

The dedicated first person rig is retained. The accepted third person source and exported GLB remain byte unchanged. The primary concurrent checkout was untouched. PR #162 remains at `504d6303bedda662f9efb7d7aa9069f4b4ebf843` as the technical fallback; this branch started there.

## Geometry reused and adaptations

The actual third person glove palm, two steel hand plates, brass edge, knuckle bar, four caps, twelve finger cores, twelve steel finger scales and four thumb components are transferred. The [transfer receipt](transfer.json) identifies each source component. The candidate contains the same 888 hand vertices and 962 faces. The new validation compares every component's topology, flat shading, material assignment and corner color values directly against the accepted third person source.

No new armor pieces replace that architecture. The mesh adapts the copied vertex positions and retains the existing first person wrist cuff. New faces are rigidly weighted 1.0 to `hand.R`, as the accepted pieces were. Source rest conventions are mapped into the existing first person hand and physical grip frames. Normals are recalculated after the geometric transfer.

The adaptations are deliberate:

| Adaptation | Reason |
| :--- | :--- |
| Rear hand length at 59%, transverse plate width at 85%, relief at 60% of TP source coordinates | Fit the accepted plate layout into the preserved FP cuff and hand space. The FP cuff is already only 67.2% of TP width. These are local mesh coordinate fits; the sword, rig and overall viewmodel scale stay fixed. |
| Hidden palm underside raised outside the handle | Literal TP placement includes 218 hand/handle intersecting face pairs. Preserve its shape language while correcting that fit. |
| Armor frame turned 45 degrees around the physical grip | The inherited frame presented the hand plates nearly edge on from the actual idle camera. This places the back plates on the visible dorsal side without altering camera, sword roll or hand bone pose. |
| Finger length at 102% of TP, width at 69%, core depth at 60%, steel relief at 86% | Wrap the unchanged FP handle with shorter individual source phalanges rather than the PR #162 curved slabs. Narrower plates leave distinct finger gaps. |
| Up to 15% local taper toward segment tips | Reduce slab ends while retaining the same low poly finger architecture. |
| Thumb length at 88%, width at 80%, with the same core and relief fits | Oppose the fingers across the actual handle and connect the root toward the palm. |
| 1.5 mm additional finger core clearance over revision 2 | Raised grip bands protrude beyond the plain handle; the full sword check detected contact there. |

Every transferred piece remains in the editable source. The correspondence face attribute uses `GauntletPart = 1000 + TP component index`. The anatomical reference crops are isolated Blender inspection renders with corresponding plate oriented cameras. They show design identity, rather than pretending to be gameplay screenshots. Rendering isolation is temporary and never saved into either model. Runtime geometry remains complete.

## Three visual revisions

Revision 1 copied the accepted construction, fitted the handle and restored its original steel scales and material balance. It passed the inherited grip checks, but normal idle still showed too much palm and too little hand armor. Its images remain in `iterations/`.

Revision 2 corrected dorsal facing from the measured gameplay eye direction, shortened the rear hand interface, narrowed and tapered the fingers, and strengthened the visible plate hierarchy. The normal idle view now reads as steel gauntlet armor. Thumb inspection still showed that its diagonal pointed away from the following segment.

Revision 3 corrected thumb opposition and restored the knuckle caps above their bar, as the source comparison required. The complete sword check then detected slight contact with the raised grip bands. Adding 1.5 mm of local clearance resolved those contacts. The final export and every candidate image use this corrected source. All three revisions received normal gameplay and grip inspection.

## Evidence and practical limits

Twenty matched views cover normal idle, close/above/side grip, Guard, Parry, all three attacks, Sprint, Dash, air/landing, Fireball, Frostfire, Gale, Steel, concurrent Chivalry and two constrained views. Desktop views are 1440 × 812. Constrained idle and Chivalry views are 844 × 390. The same production WeaponView fixture and camera settings are used on both sides. Close inspection uses the existing alternate inspection camera; gameplay camera and FOV are unchanged.

Baseline captures are from PR #162's exported source `1048deb`; the five primary required views were freshly captured in this pass. The remaining baseline views reuse the same established fixture and exact source artifact. Candidate pose metadata records the final source commit `75c73df`. The original concept PNG is copied unchanged from the creator supplied reference. The comparison page frames its hand panel using an SVG viewport.

The silent [live recording](live-actions.webm) runs ordinary production InputController commands through real local simulation. [State samples](live-results.json) record attack, Guard, cast, Dash, Sprint and movement. This is integration evidence rather than a physical mouse test or frame rate benchmark. Automation did not establish physical Pointer Lock. Temporary input enabling was restored and the fixture tabs were closed.

The existing third strike can still overlap the two wrist cuffs, and very short windows let the ability HUD overlap part of the right arm. Their choreography and UI remain outside this hand geometry pass. Forearm thickness and cuff structure still differ from TP; that discrepancy is measured rather than disguised. The new hand should be judged by its normal gameplay view and its source lineage, with creator acceptance still pending.

## Validation and provenance

[Verification](verification.txt) records 43 focused repository tests and a successful full `npm run verify`: syntax, 1,313 repository tests, four HTML5 export tests and HTTP/WebSocket smoke.

Existing Blender source preservation and grip validation pass in 200 evaluated poses across all eight actions. The new component test confirms exact accepted topology/colors and clearance from the entire sword in another 200 evaluated poses. Source save/export/reimport, packed reference retention, Idle/Guard seam continuity and second strike offhand clearance also pass. Tests were retained and strengthened rather than relaxed.

Final first person export: 4,572 triangles against a 16,000 budget; 705,700 bytes against a 1,000,000 byte budget. The GLB validator passes, and the exported slash contains 14,043 visible sword pixels. [Build report](build-report.json) binds the source and GLB hashes to source commit `75c73dfdacf24a1c18faddcf0e7d8e556b4211d9`.

Source SHA256: `cea940936f3507ab86749edaf97bde51fe4be76f12337b51ff79ee2b0d066130`.

FP GLB SHA256: `38a83638fc739fe065f833af6ce628c4a81879694061139bc4fac704029b8fd7`.

Unchanged TP source SHA256: `740301e4e9632d71f61861edacd516937deb85abe32e8cc838b39d358c38dc53`.

Unchanged TP GLB SHA256: `cff58f675bce03eb6b34976783a4a1ee2745bd4626df541187b9b81119fcc967`.

The exporter now accepts an optional source path, so intermediate candidates can be exported without replacing the production source. Its default path and established authored export pipeline remain intact. The asset manifest versions both model URLs under the existing common revision contract; TP bytes are unchanged. No gameplay, tutorial, voice, music, balance or animation controllers were edited.

## Reproduce and continue in Blender

Edit `Arm.R` in `tools/blender/characters/spellblade/source/spellblade-first-person.blend`. The source is editable and owns the resulting geometry. Preserve the named bones, weights, socket names and all action curves. The historical whole kit builder would reconstruct these edits.

The correspondence inspector can generate transfer data using a saved PR #162 baseline. The transfer utility rejects mismatched source hashes and requires a separate output. The renderer makes source reference crops without saving visibility changes.

```sh
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/inspect-spellblade-gauntlet-parity.py -- \
  --first-person output/gauntlet-parity/baseline/spellblade-first-person.blend \
  --out output/gauntlet-parity/tp-inspection.json
blender --background output/gauntlet-parity/baseline/spellblade-first-person.blend \
  --python-exit-code 1 --python tools/blender/characters/spellblade/kit/gauntlet_parity.py -- \
  --reference-json output/gauntlet-parity/tp-inspection.json \
  --out output/gauntlet-parity/reproduced/spellblade-first-person.blend --iteration 3
blender --background --factory-startup --python-exit-code 1 \
  --python scripts/export-spellblade-first-person.py -- \
  --source output/gauntlet-parity/reproduced/spellblade-first-person.blend \
  --out output/gauntlet-parity/reproduced/export \
  --source-revision 75c73dfdacf24a1c18faddcf0e7d8e556b4211d9
```

The baseline source is recoverable from PR #162 commit `504d630`. [Changed files](changed-files.txt) enumerates the exact delta from that fallback.

## Next parity phases

1. Review and accept the right hand candidate first.
2. Transfer the accepted left gauntlet and finger scale language while preserving its open spell palm, rune attachment and casting readability.
3. Synchronize wrist and forearm proportions, cuff layering and the second raised panel. Current FP cuff width is 67.2% of TP, and total transverse forearm dimensions are about 60 to 61% of TP. Review the resulting perspective before choosing a fit.
4. Match visible elbow and upper arm portions without expanding work into unseen geometry.
5. Review the same HeroSword grip relationship in both perspectives while retaining the weapon dimensions and approved first person roll.
6. Review steel, dark articulation, brass trim and facet density across the accepted components.
7. Review the whole viewmodel after each component has been accepted.

Each phase should have separate source preservation checks, visual comparisons and creator approval. This pass stops at the right hand.
