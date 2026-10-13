# Accepted Spellblade gauntlet correspondence

This research inspects the saved accepted third person source and the PR #162 first person source before modeling. It changes documentation only. The production rig, geometry, actions and export assets remain untouched by this inspection.

The principal mismatch is material hierarchy and finger construction. The accepted third person hand has separate light steel scales over dark articulated cores. PR #162 uses a thicker curved shell for each phalanx, with light steel principally on the first segment and dark steel on the later segments. Its curved segments have approximately 80 mm principal lengths, while the accepted third person finger segments measure 28 to 52 mm. Transferring the accepted plate topology and corner colors offers a stronger correspondence than refining the existing dark shells.

## Component correspondence

Component IDs refer to connected components in the accepted `Gauntlet.R` mesh. First person scaffold IDs refer to the existing `GauntletPart` FACE attribute in `Arm.R`.

| Accepted third person components | Actual construction | PR #162 scaffold | Reuse and fit decision |
| --- | --- | --- | --- |
| 0 | Dark leather palm, one beveled closed component | Lower region of part 2 | Reuse topology and colors. Fit its lower surface clear of the physical FP grip and join the preserved wrist coherently. |
| 1, 2 | Separate proximal and distal light steel dorsal plates | Upper vaulted region of part 2 | Reuse the actual plate topology and corner colors. Adapt placement in the FP grip frame, then review dorsal thickness from the eye and side. |
| 3 | Thin brass edge on the distal dorsal plate | No direct independent hand edge | Reuse as the accepted restrained hand trim. This belongs to the hand and is distinct from the unchanged forearm cuff. |
| 4 | Light steel knuckle bar | Integral proximal caps in parts 100, 110, 120, 130 | Reuse the accepted bar geometry with coherent scale and position. Keep its back aligned with the dorsal plates. |
| 5, 12, 19, 26 | Four light steel knuckle studs | Proximal cap areas in parts 100, 110, 120, 130 | Reuse the accepted small components rather than adding larger caps. Each measures about 24.65 × 20.30 × 14.50 mm in its principal axes. |
| 6 through 11; 13 through 18; 20 through 25; 27 through 32 | Four fingers, each with alternating dark core and light steel scale for three phalanges | Parts 100 through 102 plus 109; 110 through 112 plus 119; 120 through 122 plus 129; 130 through 132 plus 139 | Reuse actual core and scale topology and exact corner colors. Adapt the wrap to the unchanged FP handle. A modest fingertip taper can improve the close view while retaining this construction. |
| 33, 34, 35, 36 | Two thumb phalanges, alternating dark core and light steel scale | Thumb armor 200, 201; core 209; web 199 | Reuse the accepted thumb components. Refit their opposition and connect the root to the palm without an unsupported gap. |
| 41 | Steel flared forearm shell | Existing rigid `forearm.R` geometry | Document for a later forearm pass. Preserve current FP vertex data during this hand pass. |
| 42, 43 | Brass elbow chevron and wrist cuff | Existing rigid `forearm.R` geometry | Document the accepted proportions. Preserve the current FP cuff and elbow pieces during this pass. |
| 44, 45 | Raised steel panels on the outer and front forearm faces | One existing FP raised panel | Record the structural difference for the next pass. Preserve the current FP forearm. |

The first finger group begins at component 5, then repeats every seven components: stud, proximal core, proximal scale, middle core, middle scale, distal core, distal scale. The thumb begins at component 33. All 37 accepted hand components are rigidly weighted to `hand.R` at 1.0. All five accepted forearm components are rigidly weighted to `forearm.R` at 1.0. Material slots are the same established `KitMatte` and `KitMetal` in both sources.

## Measured size and palette

Accepted TP middle finger cores measure 52.20, 39.15 and 30.45 mm in length. Their light steel scales measure 50.20, 37.16 and 28.45 mm in length, about 37.24 mm in width and 11.60 mm in thickness. Outer fingers are slightly shorter. These are straight beveled phalanges, with visible articulation between them. PR #162 armor uses curved approximately 80 mm segments with a nominal 21 mm radial section thickness. Curvature contributes to its bounding dimensions, so principal length is a geometry diagnostic rather than a direct anatomical length.

The entire accepted TP hand spans about 151.27 mm along the sword grip axis. The PR #162 hand spans about 187.78 mm along that axis when the wrist and thumb are included. Those bounds have different wrist constructions; compare the individual fingers and plate profiles as well as the total.

| Surface palette | Accepted TP hand | PR #162 hand |
| --- | --- | --- |
| Light steel | 42.89% | 17.41% |
| Dark steel | 27.34% | 52.55% |
| Dark leather or joint core | 26.62% | 30.03% |
| Brass hand trim | 3.15% | 0% |

These are measured mesh surface area shares, including interior and occluded faces. They demonstrate the palette hierarchy and do not measure visible screen coverage. TP uses its preserved authoring FACE tags. The PR #162 newly built faces retain a default `tag` value, so their palette is inferred from actual calibrated `ArmorColor` values. Material names alone cannot establish the amount of light steel because both light and dark steel use `KitMetal`.

## Physical grip adaptation

The accepted TP handle is 245.00 mm long with a maximum measured radial extent of 50.44 mm. The FP handle is 203.35 mm long with a maximum radial extent of 42.37 mm. The sword, its handle, its socket, and the approved runtime roll must remain unchanged.

Blindly transferring TP radial positions would reproduce its existing handle intersections. The read only rest mesh BVH probe found exactly **218 intersecting face pairs** between the accepted TP hand and the physical handle. These are geometric surface pairs, not 218 separate visible defects. PR #162 has zero pairs under the same probe. The accepted visual identity should be transferred with grip aware placement and clearance, followed by evaluated animation checks.

For each hand piece, convert vertices into TP `hand.R` rest bone local space. Establish the physical grip center and basis there. Map that basis into the corresponding FP hand local grip basis, then convert into the existing FP mesh object space. Transfer exact face topology, flat shading, `ArmorColor` corner values and material names. Refit fingers around the actual FP handle rather than altering the sword or bones. The inspection JSON supplies both grip centers, axes, dorsal/forearm projection axes and bone matrices. Its full geometry dump remains outside the documentation at `output/gauntlet-parity/tp-inspection.json`.

## Deferred forearm disparity

The accepted TP forearm has a rest bone length of 280.00 mm. The FP forearm bone is 300.17 mm. Its geometry is substantially narrower despite that greater length.

| Measurement in forearm rest bone space | Accepted TP | Current FP |
| --- | --- | --- |
| Total transverse X span | 246.26 mm | 150.09 mm |
| Total transverse Z span | 241.05 mm | 144.90 mm |
| Total longitudinal span including rims | 346.49 mm | 366.72 mm |
| Wrist cuff principal width | 219.40 mm | 147.50 mm |
| Wrist cuff principal depth | 211.40 mm | 142.12 mm |
| Wrist cuff axial length | 60.00 mm | 60.00 mm |
| Raised steel forearm panels | Two | One |

The FP cuff is approximately 67.2% of the accepted TP cuff's transverse size. Total forearm transverse bounds are approximately 60 to 61% of TP. The palette is similar: TP forearm area is about 49.1% steel and 50.9% brass; FP is about 51.6% steel and 48.4% brass. The main difference is profile and panel arrangement. Preserve FP forearm vertices, topology, colors and weights in the current hand pass and use these measurements for the separate follow up.

## Provenance and reproducibility

Accepted TP source: `tools/blender/characters/spellblade/source/spellblade-third-person.blend`.

TP SHA256: `740301e4e9632d71f61861edacd516937deb85abe32e8cc838b39d358c38dc53`.

PR #162 FP source: `tools/blender/characters/spellblade/source/spellblade-first-person.blend`.

FP SHA256: `1b375fc91b4a95c3624a967cc958dbe5cc3f9a5b31a9b18a4367d2652fb30063`.

Inspection used Blender 4.5.14 in background mode. The read only script is `scripts/inspect-spellblade-gauntlet-parity.py`. Compact measurements are in [measurements.json](measurements.json). Full extraction preserves original connected component, vertex and polygon indexing, local vertex coordinates, face topology, exact color loops, material names, rigid weights and grip frames. The script opens source files and writes inspection data without saving either source.
