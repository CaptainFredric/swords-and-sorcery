# Spellblade authoring plan

Goal: deliver a recognizable, animated Spellblade against the supplied concept, with an editable Blender source that survives export.

The user approved the assessment and requested execution. Work proceeds in an isolated local checkout. Source artwork and supplied Blender file are preserved.

1. Capture baseline verification and build evidence. Current baseline: 244 passing tests, 14 stale procedural source assertions failing. Runtime manifest disables the GLB path.
2. Replace production reconstruction with loading named export collections from versioned Blender source files. Retain sockets, action names, units, independent first person rig, slash timing, validators and explicit promotion. Test a vertex edit through source load and GLB export. Record source hashes in the build report.
3. Author major armor forms, proportions, face recess, layered shoulders, articulated hands, boots, cloth and sword. Save real geometry in the source blend. Inspect fixed front, quarter, side and rear renders after each substantive pass.
4. Inspect posed intersections, refine motion and author first person geometry/choreography. Preserve contact frames and server authority. Test exported clips and first person visibility.
5. Replace obsolete tests of retired modeling instructions with tests of source preservation, export contracts and actual artifacts. Run repository verification and Blender validators. Review assets in the browser using a local preview manifest, keeping remote promotion separate.
6. Package source, exports, comparison evidence and a candid handoff. Commit changes locally and create a focused review branch if appropriate.

Acceptance: clear silhouette and canonical design cues at gameplay distance, complete four view depth, distinct actions, usable first person view, validated GLBs loaded in browser. A passing validator is only a technical gate.

Ruling: Python may be used as an authoring tool for explicit mesh topology and repeatable review. The production exporter must never reconstruct or correct source geometry. The editable blend is the artistic authority.

## Execution record

The body was rebuilt and reviewed across repeated front, quarter, side and back renders. Major changes include connected torso armor, open recessed face, split cyan visor, overlapping shoulder plates, articulated fingers, larger boots, a continuous rear banner and a shared faceted sword. The source contains named editable meshes and preserved runtime bone/socket names.

The core third person actions were reauthored with anticipation, contact and recovery poses. Contact frames remain 13, 12 and 12 at 30 fps. Pelvis movement grounds foot contact without keying the gameplay root. First person uses a separate source with camera-specific sword proportions and choreography. A complete integer-frame sweep covered eight first person clips at two aspect ratios. It exposed held broadside windup and recovery poses, which were revised. This check is a visibility diagnostic rather than artistic approval.

The browser confirmed menu, first person and practice remote assets loaded as GLBs. A visible Chromium session acquired pointer lock and exercised Guard, Slash, Cast and Dash with no page errors. Earlier headless pointer lock attempts failed and were excluded from successful gameplay evidence.

The source test now edits a disposable copy, exports it, imports the GLB and checks that the altered coordinates survive. It also verifies action timing, names and source hashes. A separate code review identified source/output collisions; the exporter now rejects those before processing, including symlinked destinations. The regression failed before the guard and passed after it.

Baseline repository verification had 244 passing and 14 failing tests. The resulting suite has 228 passing tests. Removed tests asserted retired procedural source markers or obsolete numeric art constants. Gameplay tests and external asset validators remain active, and real source roundtrip coverage runs in asset CI.

The tracked runtime manifest and promotion request remain unchanged. The local preview script supplies the candidate pair without altering promotion. Integration and visual acceptance remain explicit review steps.
