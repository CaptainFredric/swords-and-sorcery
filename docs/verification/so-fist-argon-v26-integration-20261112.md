# SO-FIST-ICATION — Argon v26 Integration Audit (12 November 2026)

## Scope and status

This draft adds a server-authoritative 80-HP single-target Finger Flick with physical swept fingertip and a mutually exclusive four-second normal-piston cycle; an authored Long Arm to the Jaw death-shot state; and restores Beat to the Punch use with a broken armored fist and intact piston drive.

**INCOMPLETE, DO NOT MERGE:** The production GLB and hydraulic rig have not been reconciled or replaced. The newly added animation references fall back to older clips if the delivered v26 asset is missing. A gameplay-only merge would create an invisible Finger Flick; this is prohibited. The branch is an integration work-in-progress, not a playable finished release. No deployment.

## Verified external assets

- [Source v26 GLB](https://drive.google.com/file/d/1vww5nF8szPaGaxkq_Ef2sXsPAurN26bU/view?usp=drivesdk): 7,141,380 bytes, SHA-256 `6800db7a9dd1bfa69bb8b789c5663e2e6a83b63f5406d9dbdd97e113ca2221b4`.
- [Editable v26 Blender source](https://drive.google.com/file/d/1XwfQkWwgku3VOeFGIfU1Mi7Mk4qD9f5I/view?usp=drivesdk): 4,338,912 bytes, SHA-256 `43d972282d31636fa2680b1c9933af9a26b633aed475a5399498f1dc21023da6`.
- [Contract](https://drive.google.com/file/d/1MkHDI_myvQD2WenFsFglP9gOfHQTmnLg/view?usp=drivesdk): 26 clip names and sampled contacts. **Stale file hashes and byte counts** refer to another asset revision, so use exact current GLB/BLEND hashes above.
- [Proof sheet](https://drive.google.com/file/d/14Tg3WLxgCTzgJZoYqeBFAIOO8DGdZWz5/view?usp=drivesdk), [showcase](https://drive.google.com/file/d/1itwJUC_seY0x9yIbmVi7CcNE3vHVanTl/view?usp=drivesdk).

GLB parsed successfully: **56 nodes, 37 meshes, 26 clips**. First 22 clips have identical animation channels to Argon's previous 22-clip candidate. New clips:

- `23_Finger_Flick_Single_Target_Strike`: four seconds, physical contact 0.65–0.85s; contact reaches around 27.9m/s at 2.85x. Swept fingertip track in `shared/sim/soFistFlick.mjs` reconstructed from actual v26 GLB and cross-checked with contract samples.
- `24_Final_Long_Arm_Launch_Intact_Fist_Breakdown`: release about 0.36s, projectile handoff 0.44s, hide by 0.52s.
- `25_Final_Long_Arm_Launch_Damaged_Fist_Breakdown`: same event clock, damaged clevis.
- `26_Final_Long_Arm_Absent_Fist_Collapse`: absent hand stays absent.

**The GLB does NOT contain `Elevation_Cradle_Pivot`**, despite the JSON describing it. Production has its own authored hydraulic nodes and `SO_FIST_LIFT` pitch envelope `0..50°`, pivot `[0,.385,-.560]` authored meters (world x2.85); Argon contract describes -22/+21 and pivot `[0,.365,-.455]`. Never blindly overwrite `client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb`: current `SoFisticationRenderer.mjs` relies on `Upper_Ram_Lift`, `Upper_Elevation_Pivot`, `Hydraulic_Lift_Stage1_Mid`, `Elevation_Pitch_Barrels_Lower`, `Elevation_Pitch_Rods_Upper`, which are absent from this v26 asset. Reconcile/graft necessary nodes and animation actions in Blender first, preserving existing elevator visuals, wheel/driver anchors, existing fragments, and canonical material colors.

## Accepted mechanic constraints

- Normal ram: 90–120 HP, exposed piston ~75–90 HP; `Beat to the Punch` stays operational with Fist 0 HP if Drive is intact.
- Finger Flick: 80 HP, a single legitimate fingertip swept contact, 28m/s shove, guarded 44 HP and reduced impulse, real obstruction and machine component collision; shares exact normal piston four-second cycle. No full-piston damage on the same event. Controls: mounted gauntlet action (desktop, not while on foot) and dedicated touch FLICK button.
- Long Arm terminal: only when equipped, only one physically present attached fist, actual ballistic projectile; bypass cooldown and normal piston recovery, client handles 0.36/0.44/0.52 animation clock. Zero HP fist during simultaneous fatal hit may eject as damaged fragment, about 85 near; fist already absent cannot reappear. The terminal projectile's simulation survives parent wreck.
- HELLping Hand is a separate Skill with capture, passenger and vault mechanics, not silently granted by Flick.

## Required follow-up to complete before merge

1. Produce a **production-compatible v26 GLB** merging Argon's hand clips into the existing functional hydraulic hierarchy and verify no floating joints, duplicated blue collars, finger elongation, arbitrary material changes or animation snap. Do not suppress hardware by blanket mesh deletion.
2. Transfer verified 26 clips and all existing hydraulic animations, source model and manifest into the branch. Previous attempt to push 7.14 MB GLB through the file connector failed with a transport error; **no new GLB asset is committed**.
3. Ensure renderer samples Flick authored node channels without clobbering hydraulics; use networked `flickAt`, `finalJaw` fields and server time. Confirm final attached/standalone fist are never simultaneously visible and no frame drifts from 0.36/0.44/0.52.
4. Verify 120Hz source fingertip swept track aligns with *actual* production camera, lift and pitch at multiple angles and terrain elevations. Test the 30Hz authoritative tick with two targets, Guard, shields, walls, ceilings, moving opponents, machine components and replayed snapshots. Geometry uses sample interpolation, must not invent area damage.
5. Add real Fight-and-Flight velocity deflection for flick; at present the draft routes its **component damage** but does not yet move airborne craft. Validate mobile and braced Bi-Bye-llista displacement with existing impulse and component damage.
6. Test death shot with occlusion-aware target selection, no homing, close target fallback, existing outgoing fist, fist destroyed first, same-fatal-tick fist fracture, operator disconnect, destroyed hull with ordinary Beat/Hellping equipped, zero duplicate damage, and wreck cleanup.
7. Confirm touched mobile gameplay inputs and layout pages: mounted Flick vs ordinary gauntlet, desktop mouse and touch input, binding persistence, pointer-release safety.
8. Run **full existing and new tests**; inspect browser at normal and slow motion, remote spectators, and test production build. Tests are not yet independently run/green; do not claim finished.

The existing code paths must be preserved: `soFistication.mjs`, `soFistDetachedFist.mjs`, `SoFisticationRenderer.mjs`, `soFistElevation.mjs`, `soFistGeometry.mjs`, room wire, menu and touch. No merge, deploy or production model overwrite.
