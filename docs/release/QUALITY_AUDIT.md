# Game quality and release assessment

Inspected 9 October 2026 against main `aad49e8` in the isolated `feat/itch-release` worktree. PR145 and PR146 remain Draft. The Claude checkout and ChatGPT's separate Blender candidates were preserved.

The standalone game is credible as a playable pre alpha. itch remains blocked by email verification and its untested iframe. That compatibility check has more release value than further cosmetic modeling.

## Actual observations

Menu, opponent and first person GLBs all reported source revision `76cc66a7b7f5b6e25e22d08dd55bd227285dfb99`. The cyan visor, crimson cloth, crest and brass reinforcement read at combat distance. Front, oblique, side and back views occur in the recordings. Broad armor planes belong to the low poly style. The more detailed promotional portrait is labeled as artwork.

Guard, ordinary sword strikes and recovery, Fireball and Vortex were inspected during real Practice Yard play. Close contacts reduced the dummy's Guard to zero and health to 40. Later encounters showed spell damage, reactions and a kill. Guard contact, break, flames and floating damage were legible. The hand retains a physical grip. These observations justify preserving the accepted rig and actions for this pass; they are limited sampled evidence, rather than exhaustive animation coverage.

Castleward's green yard separates the red knight, while cyan and orange distinguish visor and fire. Banners and masonry establish the setting in the opening. Existing Solo and Practice routes explain their purpose. An unfamiliar player test should precede extra tutorial machinery.

The demonstrated UI defect was command clipping at 714 × 756. Intrinsic grid widths of 166.6 and 132.7 px exceeded their 254.2 px row. The corrected cells are 123.6 px each, with both labels inside. The hanging banner, primary action and live scene are preserved. At 844 × 390, Armory tabs stayed at y 104 while the final ultimate scrolled fully into view.

## Priorities

| Value | Finding and decision | Risk |
| :--- | :--- | :--- |
| Release blocker | itch ZIP upload still requires owner email verification | Actual iframe compatibility remains unknown |
| Release blocker | Test itch controls, audio and two client networking before publication | Local success cannot establish this |
| High | Fixed compact menu command clipping | Small CSS change with direct before/after evidence |
| High | Added distinct landscape combat, sorcery, ultimate, Armory and courtyard media | Actual gameplay and promotional renders are labeled separately |
| High | Produced a 26.84 s gameplay trailer with original audio | Practice demonstrates mechanics; human opponent footage remains desirable |
| Later | Evaluate the independently edited helmet/body candidate after its author completes it | Requires source, rig and animation preservation checks |
| Later | Performance at low quality and physical mobile controls | Desktop emulation establishes layout only |

## Independent presentation ideas

1. Lead with a short real encounter. Static portraits communicate the character; contacts and sorcery communicate the game. Melee, Fireball and Vortex suit the knight's expressive combat without adding runtime effects. Low technical risk. Implemented as footage and screenshot candidates.

2. Preserve quieter menu commands at compact sizes. A clipped Settings label weakens confidence before play. Flexible tracks and natural wrapping retain the crimson panel. Low risk. Implemented.

3. Separate illustration from play in the release gallery. The preferred portrait can carry creator identity while the production knight establishes the actual experience. A responsive media board labels artwork, staged renders, UI and gameplay. Low risk. Implemented.

4. Observe a newcomer completing a first duel. Existing systems already support this test. Repair the largest observed hesitation before building more onboarding. Small implementation risk, dependent on an unfamiliar participant. Protocol prepared below.

## Media and provenance

The avatar is an AI assisted promotional refinement of CaptainFredric's original character design, following the creator's supplied provenance. The original design's authorship remains explicit. Public profile artwork upload remains pending.

Recordings use the real production renderer in local authoritative Practice Yard play. Camera facing was staged through the localhost debug view, followed by normal inputs. A temporary F attack binding prevented automation cursor motion from changing aim. Body transforms, action curves, health, damage, hit timing and simulation state remained unchanged. Reloading removed that binding.

The trailer records the WebGL canvas and existing final audio mix. DOM HUD panels and captions are outside the recording. Editorial titles identify the live menu and Practice Yard. Incidental original voice lines remain in the audio; no voice director, dialogue or music changed. The MP4 is H.264, 1280 × 720, 30 fps target, stereo AAC at 48 kHz. Full decoding passed; measured peak was minus 2.6 dBFS. Listening and publication approval remain with the creator.

`capture-recorder.js` records only an owned localhost preview. `edit-trailer.py` reproduces the edit from four original WebM takes. Their hashes and metadata are in `trailer-manifest.json`; raw clips are packaged in `output/release/trailer-source.zip`. The comparison board includes the trailer and five landscape candidates. Fireball was added as the first screenshot in the private itch draft; its original four images were retained.

## Verification

`npm run verify` passed at normal concurrency: syntax for 354 modules, all 1111 game tests, four HTML5 export tests and HTTP/WebSocket smoke. Artist assets were untouched, so a Blender rebuild/export was unnecessary. Existing source, clips, materials, sockets and rig remain intact.

| Browser check | Observed result |
| :--- | :--- |
| GLBs in menu, opponent and first person | Correct revision and visible render |
| Name, Solo, practice entry, tools and leave | Worked |
| Pointer capture and Escape | Worked in Chrome |
| Guard, sword contact, Guard break, Fireball, Vortex | Worked in local practice recordings |
| Armory selection and next practice loadout | Vortex persisted |
| Layout | Checked 1280 × 720, 714 × 756 and 844 × 390 |
| Exported clients on two separate localhost origins | Both connected to `wss://swords-and-sorcery.onrender.com/ws` |
| Private room creation, code join and readiness | Two distinct players joined KWEP8 and reached the live match |
| Exported match native pointer capture | Failed during a locked Mac session; retry unlocked before attributing the failure to game code |
| itch game upload | Refused: email verification required |

This is Chrome evidence from this Mac. The adapter based semantic render harness was unavailable. Recordings are observational evidence, rather than deterministic geometry comparisons. Low health, exact perfect parry timing, every action, death/respawn camera, rare encounters, reduced graphics, storage denial, reconnect and physical touch controls need further appropriate coverage. The Mac locked during the exported two client test. Native control checks paused for the owner to unlock it; input code was preserved.

## Release and first player checks

After verification, upload the identified ZIP, mark it playable in browser and save with visibility Draft. Compare fullscreen launch and embedded play. Check assets, WebGL, pointer/keyboard input, attack/Guard/cast, fullscreen exit and resize, gesture audio/voice, saved settings, Solo, private room joins and start with two clients, reconnect, mobile landscape and touch. Record browser/device, revision and result. Keep compatibility claims conditional until those checks pass.

The prepared description accurately distinguishes current duels, bots, practice, Armory and ultimates from continued development. The introductory devlog awaits approval. itch needs a hosted trailer destination to embed the MP4. The compact support panel remains in Draft PR145. Buy Me a Coffee uses the actual creator URL and standalone play link. Ko fi requires the real creator destination.

Give an unfamiliar player the link and ask them to speak their thoughts. Explain nothing initially. Ask them to identify the premise, enter practice, move, attack, Guard, cast, fight a responding dummy, leave, then create or join a duel. Ask what the result means and how to play again. Record hesitation, mistaken controls and unreadable information separately from failures. Ask what felt satisfying and what was confusing. Fix the largest observed obstacle first.

## Preserved scope

Model geometry, materials, rig, source actions, server authority, balance, cooldowns, hit windows, voice content/director, Credits VO, menu music/autoplay, Sunder/Vortex behavior and cameras, Chivalry, continuous tour and rare Sky Bait/Slush choreography remain intact. This pass adds release evidence and one demonstrated menu correction. Merge and public publication require creator approval.
