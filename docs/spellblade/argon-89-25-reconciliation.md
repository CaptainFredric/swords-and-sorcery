# Spellblade Argon 89/25 — asset and composition reconciliation

Base: `main` `41a8b082f52156feb9f912dc7d83e912c239741c`, which already includes merged PR #457. Draft-only, no merge or deployment.

## Exact model provenance
- Third-person latest: SHA-256 `161879e5a39cbcae004465163716e3a107816c960289e0611e117610918a4a83`, 13,542,132 bytes, 84 nodes, 17 meshes, 66 joints, 89 clips. Argon Drive asset `spellblade.glb.part1` + `part2`.
- First-person latest: SHA-256 `4f53671eadd8f706692f632c71892e78e92d38cfe06592c65b2254158c5953ce`, 7,298,028 bytes, 46 nodes, four meshes, 41 joints, 25 clips. Argon Drive `spellblade-fp.glb`.
- Third-person predecessor 78: SHA-256 `c8c3bf49baf1287eae27fed6057e7d5dc776e660f3d9ec6c051f20fca1abf92f` (the 89 contains all 78 unchanged animation channel/keyframe values).
- Older third-person 90: SHA-256 `9dae42a815f4108afab4fdab95673293422283b677ea97f06ac0375ba50516a1`, 90 clips, same 66 joints, matching joint inverse bind matrices with latest 89.
- Older first-person 35: SHA-256 `1b12af5551b449ff25c8b6f75c4d1a661f6edd271a18a97e31c5eb4d743be904`, 35 clips.
- PR #457 motion sidecars: 3P SHA-256 `fd67e1f2be80fe1f901b177522841e6a6f55c095bf2f5964c71e5d4b49a2a687`; FP SHA-256 `ff7b20dc333c6633cae58a587e7dd1c55945e66c4b002f85bafc3ec2be44a225`.

## Reconciliation matrix

| Animation group | New 89 TP | New 25 FP | Older 90 TP / 35 FP | PR #457 sidecars | Chosen source |
|---|---|---|---|---|---|
| Idle, Guard, Cast, Dash, ordinary Slash 1–3 | Yes | Yes | Yes | TP Slash_1 only | New canonical assets; do not overwrite improved Slash_1 |
| Sunder, Vortex, All-Natural Disaster, Chivalry | Yes | Relevant FP actions | Yes | None | New canonical assets; preserve authoritative timelines |
| Rigid Riposte combined actions | 3 | 1 | Yes | Phase-based clips | New canonical combined actions retained; active server technique phases use #457 sidecars |
| Rigid Riposte phase-specific Enter / Interception / Thrust / Recovery / Parried / Air | No | No | 6 / 6 | 6 / 6 | #457 sidecars; do not duplicate or alter combat clock |
| Whirl phase-specific Enter / Revolution / GaleLift / Exit / Interrupted / AirRecovery | No | No | 6 / 6 | 6 / 6 | #457 sidecars; existing continuous revolutions and interruption contract retained |
| Transition Slash_1_to_2 etc, Guard_From_Cut, Rise_1 | Yes | Yes | Yes | None | New canonical assets |
| Restless fall standing / seated / breathing | All 3 | Not required in FP | Present in 89-only addition | None | New 89 wired to authoritative sleep |
| Restless ladder idle / march | Yes | Yes (FP-specific names) | Not in older technique inventory | None | New 89/25 wired to actual carry state |
| Fireball, Frostfire, Gale, Coreflagration, Line of Conduct, Steel Armory | All 6 | N/A | New 89 only | None | New 89; fallback existing IK only on unsupported cards |
| Siege Workshop | Remains machine-driven | N/A | N/A | Existing production | Never use Spellblade to pantomime machine attack |

## Integration decisions
- **Accepted:** geometry, rigid armor, padded gauntlets, locomotion/footwork, third-person Restless/Armory clips and first-person carry clips; PR #457's timing, FP slash corrections, technique sidecars and compatible composition.
- **Rejected:** overwriting `SpellbladeComposition.apply()` with an older `playPlan()`; replacing production movement/combat/siege systems; overwriting newest `Slash_1` with #457 sidecar; using fallback `Death` for Restless sleep.
- **Retained provisionally:** PR #457's first-person wrist geometry correction (it has a guard against adjusting already connected geometry). Remove only after continuous wrist inspection in real gameplay.
- **Not established by static inspection:** physically convincing contact, non-clipping armor in extreme motion, proper first-person wrist throughout all phases, actual two-client or landscape-mobile acceptance. These require game/browser evidence beyond this asset audit.
