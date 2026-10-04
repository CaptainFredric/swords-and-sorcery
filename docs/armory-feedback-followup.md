# Armory feedback and camera correction

This follow up preserves the combat, balance, Steel, Gale, elemental VFX and UI copy from the preceding pass. Only menu presentation and Armory click feedback change. The earlier handoff describes the first pass; this document supersedes its camera and Armory preview behavior.

## Camera

Ordinary menu reframing takes 0.85 seconds. A camera position change greater than four metres takes 1.05 seconds. Both use quintic smootherstep, `6t^5 − 15t^4 + 10t^3`, with zero endpoint velocity and acceleration. Reduced motion keeps the existing 0.01 second path. The existing 2.8 second opening establishing shot remains separate.

Retargeting captures the last presented camera position, look target and field of view, including the tour's actual framing, instead of its old destination. The usual gentle drift remains continuous. Menu controls respond immediately; hover and press timing is unchanged. Actual repeated Main, How to Play and Armory navigation was inspected. The recorded camera check observed 2,362 frames; the largest frame movement was 0.197 metres over 18.1 ms, with no destination snap or trip queue.

## Every deliberate press sounds

The actual delegated spell and ultimate card handlers call Armory selection feedback on every press. Equipment changes only when needed. Each press cancels the preceding identity sound and starts the pressed identity. Rerendering, load restoration and opening the Armory never call the identity function.

Two loudness issues were corrected. The old helper applied effects volume twice, once itself and again in the UI bus. The global brass button recipe also overlaid each identity, obscuring their distinctions. Armory item cards now use only their identity cue, and the Armory opening button is silent. Other buttons retain their existing brass cue. The helper uses the existing UI bus, preserving master/effects/mute and leaving music/autoplay and VO logic untouched. Brief sustained onset envelopes improve presence; Gale receives a 2x local cue gain because filtered wind had substantially lower output than the other identities. This changes menu sound only.

| Item | Duration | Web Audio presentation |
| :--- | :--- | :--- |
| Fireball | 0.52 s | Bandpass ignition noise 170 to 1500 Hz; low flare tone 120 to 65 Hz |
| Frostfire | 0.48 s | High crystalline noise 6200 to 2300 Hz; sharp tone 1400 to 720 Hz |
| Gale | 0.62 s | Filtered draw and whoosh, 350 to 1700 Hz |
| Steel | 0.55 s | Two metallic tones, 1900 and 2650 Hz, separated by 0.075 s |
| Sunder | 0.70 s | Low fracture noise, 100 to 43 Hz slam after 0.12 s, restrained 580 Hz ring after 0.36 s |
| Vortex | 0.65 s | Ignition noise, 150 to 95 Hz tone, pulsing rotational envelope |

These are procedural Web Audio recipes in `armorySound.mjs`, with the existing SoundEngine noise buffer. No recorded voice or new gameplay audio assets are used.

## Six menu performances

Every preview lasts 1.5 seconds and uses the real third person rig over its authored Idle clip. Separate keyed arm targets and torso/stance channels are evaluated in `armoryPreview.mjs` through the existing arm solver. These are menu performances rather than reused Cast/Guard/Slash clips. Source Blender actions, GLBs, rig and gameplay animation remain unchanged.

| Item | Distinct gesture and presentation |
| :--- | :--- |
| Fireball | Draw palm inward and upward, cup a hot orange core, extend confidently, shed embers and return |
| Frostfire | Cock forearm and wrist sideways, extend farther and more precisely, show pale core/crystals and cold particles |
| Gale | Draw open palm toward the chest with torso turn, sweep outward with a counterturn, show circulating wind |
| Steel | Clench the offhand and brace it against the breastplate with a deeper stance; existing plate sheen runs over armor |
| Sunder | Lower stance, lift the sword overhead, deliver a compact downward threat, shed brief ground stone/dust particles |
| Vortex | Turn torso through a controlled sword flourish; ignition particles follow the actual skinned blade tip and return |

The rigid source hand has no separate finger bones. A menu owned cloned gauntlet geometry receives a reversible finger closure morph for Steel and the braced Sunder hand. It restores to zero afterward, and disposal restores the original geometry. Shared mesh data and the export remain unchanged. The six poses have different arm paths and body channels even without particles. Existing cloth response follows those body changes.

Sound and animation have independent lifetimes. Pressing the active item sounds again while retaining its original gesture start time. After completion, the same item may replay its gesture. A different item blends from the current procedural pose over 0.18 seconds, cancels the old completion timer, and starts its own performance. All gestures ease back to Idle with zero final arm weight, stance and clench. Menu effects remain cosmetic and create no projectiles, rupture, damage, Prowess or ability activation.

## Actual browser validation

All six actual Armory cards were clicked and clicked again at normal settings: master 0.8, effects 1, music 0.55, mute off. AudioContext was running. The UI bus was measured and recorded during actual clicks, rather than invoking a mocked sound function. Final measured peaks before master were Fireball 0.144, Frostfire 0.251, Gale 0.100, Steel 0.228, Sunder 0.164 and Vortex 0.143. No cue clipped. Repeated item presses produced fresh output and retained the active gesture start time for all six. Rapid alternating cards were exercised. After removing the generic opening cue, opening the Armory measured exactly zero output on its UI bus.

All six gestures were visually inspected at 1280 by 720. Screenshots and measured audio/camera evidence are saved under ignored `artifacts/combat-polish/`. The compact `armory-six-cues.wav` audition contains actual card audio in Fireball, Frostfire, Gale, Steel, Sunder, Vortex order, scaled by the tested master level and isolated from music/VO. This agent cannot hear the browser; these measurements and the recording establish real output, while subjective timbre and perceived mix still require human listening. No claim of a completed human listening check is made.

Affected menu tests pass, and `npm run verify` passes syntax checks, all 708 tests, and HTTP/WebSocket smoke checks. New tests cover six distinct gesture trajectories, settled endpoints, interruption blending, repeated audible presses without animation restart, and camera duration/easing. Blender builds are unnecessary for this correction because source actions and exported assets are unchanged. Prior asset validation remains applicable.

## Changed files

1. `client/main.mjs`
2. `client/menu/MenuScene.mjs`
3. `client/menu/armoryHand.mjs`
4. `client/menu/armoryPreview.mjs`
5. `client/menu/armoryPreview.test.mjs`
6. `client/menu/armorySelection.mjs`
7. `client/menu/armorySelection.test.mjs`
8. `client/menu/armorySound.mjs`
9. `client/menu/menuMotion.test.mjs`
10. `client/menu/menuShots.mjs`
11. `docs/armory-feedback-followup.md`

Voice logic, Credits VO, menu music/autoplay, ultimate mechanics, startup/cameras/projectiles, source animation assets, gameplay balance and the preceding UI copy remain preserved.
