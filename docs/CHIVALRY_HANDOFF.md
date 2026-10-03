# Chivalry, mastery and practice handoff

The later [motion and selector followup](CHIVALRY_MOTION_POLISH.md) adds three authored guarded cuts and supersedes this report's original presentation and verification details.

Actual base: `30ea64816b061eeb6a092434359d9bc11efe1723`.
Implementation result: `4d6318c48f3eeea037221d6629974099aea7059c`. A subsequent documentation commit adds this report only.
Branch: `feat/chivalry-arsenal`. Worktree: `/Users/erendiracisneros/swords-and-sorcery-polish`.
Remote main was fetched again after verification and still matches the base. The primary Claude checkout was preserved. This branch is intended for a draft PR and visual acceptance before integration. The public Render deployment has not been updated by this branch.

## 1. Spells & Chivalry

| Value | Exact result |
| :--- | :--- |
| Startup | 0.65 s |
| Active | 9 s |
| Interrupted startup lockout | 2.5 s |
| Startup movement multiplier | 0.65 |
| Startup Stagger multiplier | 1.5 |
| Shared Fireball/Frostfire launch gate | 0.72 s |

`combatActionPolicy` is the shared authority for concurrent action legality. Sword, Guard, spell gathering and Dash may coexist only during active Chivalry. Ordinary parries still defeat the sword contact; the mandatory parry reel is suppressed. Balance breaks, Guard breaks, Sunder interruption and death retain their actual interruption behavior. Held Guard and Attack survive startup as intent and resume after commit. Existing hit windows, chain clocks, gather times and damage values remain intact. Ultimate damage and its projectile/burn tails cannot fund the next Prowess bar.

Prepared spells are three ordered, unique, legal identities containing the saved starting spell. Armory replacement protects that identity, prevents duplicates and supplies deterministic defaults. Changing the saved starter inside the prepared set preserves ordering; choosing a starter outside replaces the last entry. Saved settings describe the next match. Match current identity, prepared membership, active gather and cooldown histories remain authoritative and survive loadout changes, Chivalry expiry and respawn. A fresh match restores the saved starter and prepared set.

`castPreparedSpell` validates and selects the requested prepared identity, then attempts its cast atomically. A cooling identity may become current, but its cast is rejected. Startup gestures select only. An existing gather retains the identity accepted when it began. Ordinary projectile releases sample current authoritative aim and hand origin. Current identity remains equipped after expiry for that match. Per identity normal cooldowns are retained; active Chivalry's 0.72 s gate substitutes only for projectile readiness. Gale and Steel retain their own ordinary clocks. Q does not fall back to a gauntlet attack while active Chivalry is cooling; the explicit gauntlet action remains available by its ordinary rules.

Default Guard bindings include RMB and G. Physical sources form a union, so releasing one source does not release another or refresh the parry clock. Desktop Q tap casts on release; a 140 ms hold reveals the small selector. Pointer lock remains intact. Mouse deltas select an alternate, while Escape, blur, death, expiry or leaving the selection region cancels. Touch uses the existing spell button as the current slot and a local two item drag fan with deadzone and hysteresis. One valid release sends one atomic command.

## 2. Presentation and the requested correction

The cross body bond, connecting cylinders and center crest were removed completely. Three small prepared color signatures appear beside the sorcery palm for the 550 ms commit tell only. Opponent active state uses a restrained pulse in the existing visor light with a 300 ms expiry fade. The HUD carries the local active timer and current arsenal.

Existing artist owned action tracks are composed by bone ownership: locomotion owns pelvis/legs, posture owns torso/head/clavicles, sword owns the right arm, and sorcery owns the left arm. Strike posture drives the torso with 35 percent authored Guard support while guarding, and that support eases independently when Guard changes. Channels keep the accepted action clocks. Handovers use the existing 60 to 240 ms action/recovery timings. Ordinary stride phase and speed dependent cadence continue through Chivalry entry, Run/Sprint changes and exit. Composition exits over 200 ms; actual incapacitation yields faster.

First person keeps the existing sword path and arm solver. Its guarded wrist correction eases over 140 ms, while sorcery gradually releases the support grip and retains its accepted cast recovery through expiry. Presentation does not add an authoritative combat delay.

No Blender source, mesh, rig, material asset or exported GLB changed in this pass. Build/export steps were therefore unnecessary. Existing asset and authored action budget checks passed through the normal suite. The accepted helmet and body remain intact.

## 3. Challenges

Shared metadata defines authored goals, extensible reward objects and player safe visibility. Combat queues private resolved facts. The match evaluator observes health before/after, raw Steel damage, chain identity and interruption, parries, actual Gale displacement, ownership of a bent projectile, startup interruptions and the authoritative Dash contact interval. Facts are drained after a complete simulation tick and before settlement, so the winning contact and death remain eligible even when the room finishes immediately.

Eligible hosted FFA, Duel and bot Duel participants must be connected humans with a profile at genuine settlement. Practice, offline play, forfeits, departed participants and actors without profiles are excluded. Challenge feats have no generic 30 second threshold. Ordinary match completion Renown retains its existing 30 second and combat participation requirements. Client outcome/claim messages cannot award feats.

| Family | Feat | Condition | Renown |
| :--- | :--- | :--- | ---: |
| Swordsmanship | Three Part Argument | One uninterrupted ordinary three strike chain on the same enemy | 15 |
| Swordsmanship | Turnabout | Perfect parry, then kill the same opponent within 5 s | 20 |
| Sorcery | Mind the Gap | An abyss kill attributed to actual Gale displacement | 20 |
| Sorcery | Wind Correction | The same owned ordinary projectile is bent by the owner's Gale, then damages an enemy | 20 |
| Sorcery | Polished Under Pressure | Survive a damaging Steel contact whose raw damage was lethal | 20 |
| Chivalry | Not Yet | Interrupt enemy vulnerable ultimate startup before commit | 20 |
| Chivalry | Against Better Judgment | Win a Duel after actual damage reaches 15 HP or less | 20 |
| Chivalry | Both Hands Full | Sword and prepared spell damage on the same enemy within 1.5 s, with Guard active at a relevant contact during Chivalry | 25 |
| Chivalry | Passing Remark | An ordinary damaging sword contact during authoritative Chivalry Dash | 15 |

The four hinted feats show only authored hints before completion. Numeric progress, real condition and reward remain hidden until server settlement reveals them. Three populated families appear in Armory. Oddities is reserved metadata, with no empty panel. The optional tenth feat is deferred. Total initial rewards are 175 Renown.

Profile version 1 explicitly migrates to version 2 while preserving wallet, ownership, equipment and match receipts. The nested challenge namespace stores progress maxima, completion timestamps and rewarded identities. Unknown historical IDs remain harmless on disk and are filtered from public state. One atomic profile replacement persists normal payment, new feat progress, completion, reward idempotency and the match receipt together. Write failures leave the cached wallet unchanged; retries cannot double pay. Completed feats have no manual claim button.

Armory now has Combat Kit, Heraldry and Challenges. Tab changes reset its internal scroll, and the fixed tabs remain reachable in short windows. The small match end mastery cue uses only the matching settled server receipt, and repeated profile messages do not replay it. Reward text distinguishes completion, victory and mastery, including a legitimate feat in a short match.

## 4. The Ultimate Knight

The Practice actor spawns with full Prowess and uses real Sunder, Vortex, then Chivalry commits in a deterministic cycle. Charge refills three seconds after actual active end and recovery. Interrupted startup keeps charge and retries the same ultimate after the real lockout. A committed ultimate followed by death still advances the cycle once. Ordinary rival behavior runs between demonstrations with moderate aggression.

During Chivalry the actor deliberately mixes Guard/sword, spell/sword and Dash/sword, switches through Fireball, Frostfire and Gale, and occasionally combines all four. It uses ordinary commands, cooldowns, gathering, Stagger and pathfinding. A spawn button appears in the existing compact Practice tools. The optional individual ultimate selector is deferred. Practice remains unscored and grants neither Renown nor Challenges.

## 5. Verification and practical limits

1. `npm run verify`: syntax across 312 modules, 830 tests passed, zero failures, HTTP assets, route isolation, health and WebSocket smoke passed.
2. Final focused action, Challenge/network and Practice acceptance: 44 tests passed.
3. Challenge metadata, profile migration, atomic failure/retry, visibility, UI and eligibility focused checks passed. Real combat integrations cover all nine feats and boundary cases. A real two client WebSocket test verifies short Duel settlement, winning tick facts, rejection of client claims and profile reload.
4. Real host plus observer verify requested spell identity, startup selection, changing aim during gathering, identity retention and cooldown history.
5. Production GLBs were sampled at nine strike times in a browser. Bone values remained finite, and changing the sorcery layer retained the sword pose at the same clock. Separate Three.js skeleton checks verified stride phase continuity, pose entry/exit and independent Guard posture release.
6. Browser inspection at 1280 by 800 and 1024 by 600 confirmed fixed Armory tabs, internal scroll and reachability of the last Challenge. At 844 by 390, emulated touch pointer flow selected Gale and started authoritative Gale gathering; dragging outside cancelled without changing identity or aim.
7. The Ultimate Knight spawn button and full name were verified in the actual running Practice session. Deterministic full cycle, refill, interruption and all four action overlap are covered by simulation tests.
8. Temporary browser overlays, artificial focus flags and viewport overrides were cleared. Normal caching was restored. The local preview remains available at `http://127.0.0.1:3120/?debug`.

Physical phone testing remains outstanding. Screenshots show the production assets and emulated browser UI; they do not establish subjective feel on a real handset or under high network latency. Chivalry composes existing clips, so a future authored combined motion pass may improve weight transfer further. Active opponent visibility deserves playtesting after the requested link removal. Public deployment remains unchanged while this isolated branch awaits integration.

Preserved concurrent work: Armory identity SFX, `client/menu/armorySound.mjs`, recorded VO/voice processing, Credits VO, menu music/autoplay and unrelated Sunder/Vortex tuning. Challenge hooks observe their resolved contacts, and the practice actor calls their existing commands. This pass does not change those systems' balance or presentation assets. The conceptual Chivalry activation voice line remains for the separate voice work.

## 6. Every changed file

1. `client/challenges.css`
2. `client/chivalry.css`
3. `client/game/GameRuntime.mjs`
4. `client/game/InputController.mjs`
5. `client/game/InputController.test.mjs`
6. `client/game/RemotePlayers.mjs`
7. `client/game/SpellbladeAnimator.mjs`
8. `client/game/SpellbladeAssets.mjs`
9. `client/game/TouchControls.mjs`
10. `client/game/TouchControls.test.mjs`
11. `client/game/WeaponView.mjs`
12. `client/game/chivalryLink.mjs`
13. `client/game/chivalryMotion.mjs`
14. `client/game/chivalryMotion.test.mjs`
15. `client/game/chivalryPresentation.mjs`
16. `client/game/chivalryPresentation.test.mjs`
17. `client/game/localActionPresentation.mjs`
18. `client/game/preparedSpellSelector.mjs`
19. `client/game/preparedSpellSelector.test.mjs`
20. `client/game/remoteSpellbladePose.mjs`
21. `client/game/spellbladeAnimationPlan.mjs`
22. `client/game/spellbladeComposition.mjs`
23. `client/game/spellbladePose.mjs`
24. `client/game/weaponPose.mjs`
25. `client/index.html`
26. `client/main.mjs`
27. `client/menu/ChallengesController.mjs`
28. `client/menu/ChallengesController.test.mjs`
29. `client/menu/RenownController.mjs`
30. `client/menu/armoryView.mjs`
31. `client/menu/armoryView.test.mjs`
32. `client/menu/renownView.mjs`
33. `client/menu/renownView.test.mjs`
34. `client/network/GameLink.mjs`
35. `client/network/GameSocket.mjs`
36. `client/network/LocalHost.mjs`
37. `client/network/preparedCommands.test.mjs`
38. `client/settings/SettingsStore.mjs`
39. `client/settings/settings.test.mjs`
40. `client/settings/settingsRegistry.mjs`
41. `client/ui/HUD.mjs`
42. `client/ui/icons.mjs`
43. `client/ui/preparedHud.test.mjs`
44. `client/ui/preparedSpells.css`
45. `client/ui/ultimateView.mjs`
46. `client/ui/ultimateView.test.mjs`
47. `docs/superpowers/plans/2026-10-03-chivalry-implementation.md`
48. `docs/superpowers/plans/2026-10-03-chivalry-spec.txt`
49. `server/src/ProfileStore.mjs`
50. `server/src/challengeSettlement.mjs`
51. `server/src/savedLoadout.mjs`
52. `server/src/server.mjs`
53. `server/tests/challenge-network.test.mjs`
54. `server/tests/challenge-profiles.test.mjs`
55. `server/tests/challenge-settlement.test.mjs`
56. `server/tests/challenges.test.mjs`
57. `server/tests/chivalry-network.test.mjs`
58. `server/tests/chivalry.test.mjs`
59. `server/tests/practice.test.mjs`
60. `server/tests/saved-loadout.test.mjs`
61. `server/tests/ultimate-knight.test.mjs`
62. `shared/sim/Room.mjs`
63. `shared/sim/UltimateKnight.mjs`
64. `shared/sim/challenges.mjs`
65. `shared/sim/combat.mjs`
66. `shared/sim/practice.mjs`
67. `shared/sim/wire.mjs`
68. `shared/src/challenges.mjs`
69. `shared/src/challenges.test.mjs`
70. `shared/src/combatActionPolicy.mjs`
71. `shared/src/combatActionPolicy.test.mjs`
72. `shared/src/preparedSpells.mjs`
73. `shared/src/preparedSpells.test.mjs`
74. `shared/src/ultimates.mjs`

This report is the only additional documentation file beyond the inventory above.
