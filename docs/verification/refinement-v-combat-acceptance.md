# Refinement V combat acceptance and Argon handoff

This candidate starts from draft PR #417 at `07c0efb91a5aca8dedb7c3bc4820ebea492ed4ef` and carries draft PR #416 as `4c29f2e9e58e25f79452c8eeada235e1db5f320f`. The canonical model and its source assets are preserved. The exact Refinement V or V.1 ZIP and patch could not be located locally, in Drive, or in the repository. The original Rodin model remains an appearance reference. A later V.2 delivery needs its own review.

## Measured Disaster clips

Source is the existing Refinement IV `spellblade.glb`, manifest revision `b43e5c3fb0c60a0a722577e0fad266efb3eef0f2`. The [frame data](disaster-refinement-iv-tip-tracks.csv) uses exported keyframe times and metres in model space, with +Y up and −Z forward. The blade tip is the farthest `HeroSword` vertex from the bind `socket_sword`, 1.276 m away and weighted entirely to `hand.R`. The tip was transformed through the joint hierarchy and inverse bind matrix. The CSV includes sword socket and pelvis samples as well as the root transform. Across all six clips, `root` has no animated tracks. Its translation is (0, 0, 0) and its rotation is the identity quaternion. The pelvis carries the authored turns.

| Exact clip | Finding | Requested change |
| --- | --- | --- |
| `AllNatural_Ground_DualSpin_Slam` | 1.440 s and 720° pelvis turn. At 0.949 s the tip is (0.018, −0.851, −0.533). Penetration begins near 0.85 s and a smaller dip already occurs during the spin. Pelvis Y spans 0.807 to 1.030 m. | Stop the cutting edge at the floor on the 0.920 s authoritative beat. Repose the right shoulder, forearm and `hand.R` around a planted lower body. Check both spins for early clipping. Let one layer own the turn. |
| `AllNatural_FastLightning_DualSpin_Slam` | 0.920 s with 360° pelvis turn despite the name. The tip crosses below ground around 0.36 s and reaches Y −0.851 m at 0.394 s. | Fit a readable compressed turn to the actual 0.360 s startup. Keep the reach aligned with committed aim and solve floor contact through the arm chain. |
| `AllNatural_Lightning_Charge_Ground` | 0.800 s loop. Pelvis Y 0.881 to 0.893 m. The tip stays below the floor for the entire loop, at Y −0.338 to −0.316 m. | Keep the crouch and stable camera. Raise and cant the blade using the right upper arm, forearm and wrist, then check both boots, gauntlets, torso and all loop frames against terrain. |
| `AllNatural_Lightning_Charge_Air` | 0.800 s loop. Pelvis Y 1.082 to 1.112 m. Tip Y 0.129 to 0.180 m, minimum at 0.500 s. First and last sword tip samples match. The sword remains bound to the canonical hand and grip. | Preserve this lift and clean loop. Supply a matching airborne entry and exit once the arrival clip is corrected. |
| `AllNatural_Lightning_Arrival_Slam` | 0.600 s. The tip rises from roughly −0.28 m at entry to +2.905 m by the first frames, then falls to −0.852 m at 0.158 s. | Match the held grip to the arrival pose. Start the strike at the real arrival event, remove the second windup and solve the downward stop. |
| `AllNatural_Aerial_Vortex_Wave` | 1.250 s with 720° pelvis turn. Tip moves from (−0.552, 0.319, −1.448) at 0.709 s to (0.875, 3.533, −0.025) at 0.743 s. At 0.811 s the blade points roughly (0.79, 0.38, −0.48), well right of forward. The late tip drops to Y −0.051 m at 1.216 s. | Smooth the pelvis and hand transition around 0.71 to 0.78 s. Align the release with real aim at the 0.85 s aerial wave beat. Author a separate immediate arrival release and check low altitude clearances. |

Only the airborne Lightning hold is selected for the new authored animation path. Ground bracing, ground spin, wave release and recovery still use the existing provisional slash presentation. The first person asset has no dedicated Disaster clips. Keep the established airborne descent, 46 damage base ground impact and separate full Lightning hold behavior.

## Sword techniques and ordinary attacks

Rigid Riposte and Whirl Like the Wind have a server side simulation prototype. It samples the actual endpoints supplied by an authored blade track, checks a physical Riposte crossing during the brace, uses the existing Dash clock for an airborne start, steps through all intermediate Whirl frames and carries a victim set through any extra turn. Wall and floor contact end the sweep. Test track dimensions, timings, cooldown and Prowess cost are fixtures.

The room and Armory do not enable either technique yet. Supply approved blade base and tip tracks with bind transforms, authored brace and contact windows, committed facing, entry and recovery poses, and FP and TP alignment. Then connect the room adapter to normal Guard, stamina, Steel, Stagger, team and spawn rules. That adapter also needs to suppress Whirl's passive Stagger recovery during sustain and route any airborne motion through actual Gale. Verify interruption, held input, remote playback and controlled release in the game before exposing the slot.

The ordinary combo now alternates a deterministic presentation phase outside the original strike windows. Both perspectives use the same timing envelope. This is a variation in the existing windup and follow through. Distinct shoulders, torso and footwork performances still need reviewed authored clips. Preserve authoritative contact at 0.40, 1.10 and 1.80 s.

The Bi-Bye-llista model has traverse and elevation nodes, but the limb meshes supply no approved striking edge start, end or thickness markers. Supply both edge tracks and clearance evidence under actual legal traverse and elevation, including rider, platform and world geometry, before adding damage. Existing bolt operations remain in place.

## Reproducing browser evidence

Run `DISASTER_AGENCY=1 node scripts/disaster-impact-browser.mjs` for desktop R, rebound middle mouse and emulated landscape touch. The browser uses real inputs in Shared Practice. A second independent WebSocket client joins the same room and compares the resulting ground and manual wave impact events byte for byte as parsed objects. The run also asserts one explicit detonation command and no second impact from the consumed wave.

Run `DISASTER_AUTHORED_AIR=1 DISASTER_DESKTOP_ONLY=1 node scripts/disaster-impact-browser.mjs` for the live hold, real mouse aim, two animation loops, release and camera return. The script uses the Practice setup buttons and starts a temporary server by default. Captures and transition samples go to `output/playwright/disaster-impact`.
