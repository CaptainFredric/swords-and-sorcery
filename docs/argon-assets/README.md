# Argon animation integration and character review

The live machine now uses Argon's newer simulation aligned flight v3.0 GLB with 54 clips. The ram uses its actual v2.7 export with ten clips. Both were taken from the delivery linked in the requested Argon tab and verified by SHA256. The actual Blender sources, script archive, original 49 clip export and previous runtime assets are preserved in `assets/source/argon-review`.

The newer v3.1 Spellblade is staged alongside v2.9 and v3.0 for review. It has **not** replaced the approved production character. First person geometry, ordinary attacks, damage, legal Guard conditions, projectile trajectories and flight handling remain the existing game implementations. One observed destruction exit ordering bug was corrected, as described below.

## What owns each channel

1. Authority owns world position, heading, runPitch, crossbow joints, muzzle and the physical rotor phase. Authored clips cannot add a second pitch or shift the actual muzzle.
2. Narrowed clips 49 through 53 supply entry, sustained posture, release, the subordinate resting sword corridor and collision recovery. Held Practice Dash keeps the same entry clock through Prowess cycles.
3. Actual distance and speed drive walk and sprint phase. The production character uses the machine's waist harness, both hands and animated stirrups. Rest basis conversion and bounded pelvis settling accommodate the existing production limb lengths without replacing its mesh or rig.
4. A committed player sword attack takes priority on the right arm. Existing combat policy continues to decide when Guard or concurrent casting is legal.
5. Each brace owns its damage tracks. Zero HP failure stays latched. HP recovered by Steel blends only surviving parts toward their healthy pose. The rotor hub retains physical angular phase; damaged shaft wobble affects only its surface mesh.
6. Additive chassis buckle and crossbow recoil deform geometry only wrappers. Semantic children, gimbals and locators keep their original parent chain. This distinction caught and corrected an actual 21 mm muzzle drift during integration.
7. After structural destruction, authored break, falling, impact and ruin clips own the visual rig. Existing server gravity, support, cleanup and spawner rules remain authoritative. Directional ram wrecks select the proper variant and preserve an already destroyed fist.

The implementation samples filtered Three.js tracks deterministically rather than starting competing full body AnimationMixers. Supplied metadata is validated source information, not an automatic engine configuration.

## Demonstration

Open [the evidence gallery](evidence.html). The eight second [touch recording](evidence/final-touch-flight.webm) uses the real game renderer and normal touch pointer handlers. It shows entry, sustained Dash, upward and downward steering, sword attacks, gesture cancellation, ordinary recovery and ejection. Initial altitude and brace damage were staged in local Inspection; no fabricated projectile, movement or damage model is used.

Desktop W, Shift plus W, Space, E, T and Z were also exercised through native keyboard input. Measured ordinary movement reached 5.5 m/s, Sprint 9.297 m/s and Practice Dash 18 m/s. The recording has 406 authoritative samples, including 216 held Dash samples and 93 attacking samples. [Gameplay facts](evidence/gameplay-facts.json) summarize those samples. This is emulated touch, not a physical phone test.

The paused front and side Dash captures show the actual production rider, sword and feet. The Steel fixture calls the normal shared ward implementation: the surviving brace rose from 25 to 36.4 HP while the destroyed brace stayed at zero. Wreck and ram captures use normal component damage followed by authoritative frame stepping.

## Destruction exit correction

The visual pass exposed a live bug: structural failure set `DESTROYED` before querying `fightFlightExit`, which rejects destroyed machines. The rider consequently fell at the wreck's center. Clearance is now selected before the mode changes. A living airborne rider retains real momentum and normal gravity; forced collapse retains the existing 35 damage and does not acquire the voluntary ejection fall exemption. The new regression failed before the correction and passed afterward. The settled wreck capture shows one separate living rider clear of the wreck.

## Character review and remaining art work

Start `python3 tools/assets/serve-argon-review.py` from the checkout and open [the controlled comparison](http://127.0.0.1:3254/docs/argon-assets/review.html). Select all for matching front views, or one model for side, rear and three quarter inspection. Production clips use a review only rest basis retarget. Authored clips use each delivered character's actual animation. A model without a selected clip is hidden instead of displaying a misleading stale pose.

v3.1 has much clearer steel and chest material separation than v2.9 and v3.0 under the same Castleward lights. That is useful progress. It still needs shoulder clearance work in raised arm poses and a dedicated production motion fit. Hand and sword rest orientations differ from production, so the generic retarget does not establish a final weapon grip or hitbox fit. The candidates also have different full figure proportions. No artistic or production approval is inferred from successful rig tests. Promotion remains a separate creator decision.

Measured stored geometry, including the alternate hidden hand:

1. Production: 13,124 triangles, 27,285 vertices, 27 joints, five materials, 26 visible draw calls, 1,823,064 geometry buffer bytes.
2. v2.9: 14,392 triangles, 37,310 vertices, 27 joints, six materials, 13 visible draw calls, 2,560,544 geometry buffer bytes.
3. v3.0: 16,522 triangles, 41,444 vertices, 27 joints, six materials, 13 visible draw calls, 2,850,680 geometry buffer bytes.
4. v3.1: 16,080 triangles, 40,550 vertices, 27 joints, six materials, 13 visible draw calls, 2,788,160 geometry buffer bytes.

These are geometry buffer allocations and incremental draws in the review scene, not total VRAM. Stored triangle totals include 648 triangles in the alternate hand; the v3.1 default active character is 15,432 triangles. Materials are unchanged from delivery. All character candidates stay outside the playable archive.

## Frame pacing

A paired 180 frame comparison rendered the previous v2.7 machine and the new machine at the same frozen state, world, camera, 718 by 812 viewport and settings. Median and 95th percentile were 16.7 and 17.6 ms for both. The 99th percentile was 20.0 ms before and 33.3 ms after. Neither sample had a frame over 50 ms. Draw calls rose from 105 to 108, geometries from 97 to 101, textures stayed at 48. See [paired samples](evidence/paired-frame-pacing.json).

An earlier candidate only run under changing host load had a 34.2 ms 95th percentile and three frames over 50 ms; its [raw measurement](evidence/final-frame-pacing.json) is retained. This bounded frozen render comparison establishes cost, not an active gameplay performance gain or a physical mobile benchmark. No smoothness improvement is claimed from these numbers.

## Verification and limits

The final verification results are recorded in `verification.json`. `npm run verify` covers syntax, the repository suite, release tests and smoke checks. The browser Composition checks button runs actual GLB and Three.js tests: 120 moved, pitched, aimed and firing samples, authoritative muzzle and hub registration, collision interruption, 120 production rider foot samples, zero HP persistence, survivor repair, rotor coast, wreck phases and ram variants. Maximum muzzle separation was about 1.9e-15 m; sole separation stayed below 4.3 mm in this test envelope.

The two real WebSocket client regression verifies identical physical snapshots and shared Dash release and wreck impact clocks. Two simultaneously rendered remote browser observers and a physical phone were not tested. Collision recovery also has state policy and actual Three.js regression coverage; the touch video shows ordinary release rather than a collision. Existing authority tests preserve rooftop support, finite competitive resources, Practice continuity, Steel, projectile origin, legal Guard and combat rules.

HTML5 packaging excludes all source candidates, Blender files, review tools and this evidence directory. No merge, deployment, publication, generation job or account spending was performed.
