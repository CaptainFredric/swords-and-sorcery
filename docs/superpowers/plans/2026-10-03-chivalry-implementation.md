# Chivalry, Challenges and Ultimate Knight Implementation Plan

Goal: Build authoritative concurrent combat, a prepared arsenal, permanent mastery feats and a teaching opponent.
Architecture: Preserve existing combat clocks and add a small shared action policy. Prepared loadout validation is shared, while selection and casts are authoritative match state. Combat supplies resolved facts to a match evaluator; profile settlement persists feats and rewards once.
Tech stack: Existing JavaScript modules, node:test, WebSocket server, Three.js, Blender actions.
Spec: docs/superpowers/plans/2026-10-03-chivalry-spec.txt
Base: 30ea64816b061eeb6a092434359d9bc11efe1723

## Constraints
Implement A before B before C. Preserve audio and unrelated Sunder/Vortex tuning. Preserve strike timing, real interruptions, server authority and asset budgets. Keep the branch separate for visual acceptance; no automatic merge. No review agents, as requested.

## Verification focus
Mixed held Guard bindings never refresh parry. Malformed prepared commands cannot cast stale spells. Cooldown selection never cleanses use history. Profile retries never pay twice. Practice and disconnected participants cannot earn challenges.

## A1: Prepared data and authoritative combat
Create shared/src/preparedSpells.mjs with normalizePreparedSpells(starting, ids), three ordered unique legal spell IDs containing the saved starting identity. Add chivalry to ultimates. combatActionPolicy(player, nowSec) returns concurrent, suppressParryReel and projectileGateSec. Existing Room gains startingSpell, preparedSpells and spellReadyById. Commands castPreparedSpell(id, direction) and selectPreparedSpell(id) validate phase and membership. Cast selection and accepted gather occur atomically. Snapshot includes those authoritative fields. Test lifecycle, all action pairs, timing, expiry tails, interruptions, cooldowns and persistence. Run focused server/shared tests before committing.

## A2: Controls, HUD and loadout
Input owns physical held keys as a union. Add default G while retaining RMB. Keep Q taps; during Chivalry a brief Q hold opens a small selector, aim movement chooses an alternate and Escape cancels. Touch tap/drag shares a pure deadzone/hysteresis selector model and sends one atomic command on release. HUD exposes current, alternates and readiness. Settings retain saved prepared IDs; Armory displays three equal spells and starting marker with deterministic replacement. Server validates loadout messages and preserves current selection within a match. Test input unions, selector cancellation, loadout normalization and protocol.

## A3: Presentation
Compose existing authored actions using bone ownership: sword arm follows ordinary strike clock, sorcery arm follows accepted gather, defensive torso supports Guard, locomotion/Dash remains underneath. Use 100 ms transitions without changing authority. Add restrained heraldic cross-body linkage and prepared signature commit/end tells for other players. Correct existing source actions only if required; validate exports if changed. Verify real browser concurrent poses, startup, expiry and ordinary actions.

## B: Challenges
Create shared/src/challenges.mjs with nine authored feats, reward objects and player-safe visibility projection. Create shared/sim/challenges.mjs with authoritative fact evaluation and match-local progress. Combat exposes chain ID/strike/victim, parry, damage, Gale attribution, projectile identity, raw Steel contact and startup interruption. Server settlement persists centrally via ProfileStore with migration and completion idempotency. Menu panel groups families and match summary reveals earned feats. Test every positive and near-miss condition, visibility, profile reload, retry and exclusions. Commit only after focused verification.

## C: Ultimate Knight
Practice actor cycles Sunder, Vortex, Chivalry using existing startup and interruption systems. Refill Prowess after a short practice-only recovery. Deliberately demonstrate mixed Chivalry actions and prepared selection. Add compact spawn/cycle controls. Test cycle, startup interruption, coexistence and no progression/scoring.

## Final acceptance
Run npm run verify. Inspect desktop and small-height Armory, touch selector gestures, first/third person composition, remote tells, and real hosted commands/settlements. If Blender assets changed, validate source build/export/budgets. Record every changed file, exact values, tests, limits and base/result SHA in a durable report. Commit, push and create a draft PR; never silently merge.

## Execution ledger
Baseline: npm run verify passes 708 tests and HTTP/WebSocket smoke.
Ruling: User supplied implementation authorization and precise specification; proceed through the plan without an additional approval pause.
Ruling: A valid alternate gesture selects a cooling spell and attempts its cast atomically. Sections 16 and 21 explicitly separate selection from availability; section 19's readiness validation blocks the cast rather than the selection. Startup gestures select only. An existing gather keeps its accepted spell identity. Cost if wrong: selector feedback differs from the narrower reading of section 19, while matching the stated selection contract.
