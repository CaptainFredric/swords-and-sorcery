# Chivalry Guard and Sprint correction

Base: e580bcd196a23e587c960e80f261b5b0e94a27c1, verified against origin/main before implementation and again before committing. Branch: feat/chivalry-guard-sprint. The existing isolated polish worktree was reused. Claude's primary checkout was preserved.

## Gameplay result

Chivalry commit calls the existing authoritative Guard transition once. It gives the normal perfect Parry opportunity, with no repeated Guard start when RMB or G is held. Input snapshots carrying guard=false do not undo the automatic raise. Deliberate Guard release and Stagger, Guard Break or Sunder interruption leave Guard down until a fresh Guard command. An empty stamina bar still prevents raising Guard; commit does not replenish it.

The shared Sprint exclusion helper allows sword, Guard and spell to coexist with Sprint only during living, committed Chivalry. Server simulation and local prediction use that same policy. Normal forward direction, ground eligibility, crouching, stamina threshold, Stagger, cooldown and movement rules continue to apply. Chivalry startup remains a brace rather than a Sprint. Other ultimates' startup rules are preserved.

Dash retains the existing Sprint request and build up rather than resetting them. Sprint drains real Guard stamina during Dash as it did before. After Dash, eligible held Sprint resumes from the same build up. The client now follows authoritative Guard state during Chivalry, preventing a held physical button from visually raising it after an interruption.

## Values

No damage, hit windows, chain durations, gather times, spell cooldowns or Dash damage were added or retuned. Sprint remains 11 m/s, costs 10 stamina/s, requires 25 stamina to restart, accelerates over 0.5 seconds and runs off over 0.3 seconds. Chivalry remains 0.65 seconds startup and 9 seconds active. The existing projectile gate stays 0.72 seconds.

Presentation uses a quarter of ordinary first person Sprint carriage beneath overlapping action poses, with eased entry and exit. Third person mixes at most 16 percent of the authored Sprint posture beneath the action posture, scaled by Sprint build up. These are visual weights rather than gameplay bonuses.

## Animation and connective motion

The existing GuardCut, Cast, Guard, Sprint and Dash clips remain the source of third person poses. Legs retain the Sprint cadence, while the posture overlay samples the same stride clock. Sword and sorcery retain independent authored tracks and their authoritative action clocks. The overlay loops its authored interval instead of clamping at the final frame. Its existing short fade carries posture through Dash entry and recovery.

First person keeps the accepted sword path, guarded cuts, cast gesture and Guard pose. A small amount of stride carriage now survives the overlap, while relaxed hand offsets still give way to the action. Camera bob, Sprint field of view and footfall phase continue through actions. Dash pauses rather than resets the stride phase, and the concurrent carriage contribution eases away when Chivalry ends.

No Blender source, mesh, rig, cloth, material, helmet, ordinary action, guarded cut action, production GLB or manifest changed. This pass composes the existing artist owned clips and corrects runtime ownership and motion continuity.

## Player copy

Armory before: “For 9 seconds, attack, Guard, Dash and cast together. Draw from three prepared spells. The spell you finish with stays equipped for the match.”

Armory after: “Guard rises as Chivalry begins. For 9 seconds, Sprint, attack, Guard, Dash and cast together. Draw from three prepared spells. The spell you finish with stays equipped for the match.”

How to Play before: “Spells & Chivalry lets you attack, Guard, Dash and cast together for 9 seconds.”

How to Play after: “Spells & Chivalry raises Guard, then lets you Sprint, attack, Guard, Dash and cast together for 9 seconds. Release Guard to lower it. After an interruption, raise it again yourself.” The existing prepared spell selection instructions follow this sentence. Guard bindings remain hold controls: when activation supplied Guard without a held button, press and release Guard to lower it.

## Verification

npm run verify passed: syntax, 862 tests with zero failures, and HTTP asset, private path isolation, health and WebSocket handshake smoke checks.

Explicit authority regressions cover commit with and without held Guard, one genuine start and one ordinary Parry opportunity, retained Guard through sword and all four spells, Sprint and Dash, deliberate release, fresh Guard while Sprinting, Stagger, Guard Break and Sunder recovery, each action combination, Sprint after Dash, ordinary exclusions, unchanged speed and stamina cost, and ordinary Sprint eligibility. Existing held G and RMB union tests still pass.

A real server test connects two clients and checks the automatic Guard on both screens, Sprint plus sword and spell, Dash from that state, Sprint afterward and deliberate release. Browser testing uses the actual InputController, GameRuntime, server and first person view. The complete sequence retained Guard and the sword chain through Dash; Sprint resumed at 11 m/s, local prediction agreed with authority, and exactly one Guard start was observed. No contact interruption occurred in that final sequence.

The production skeleton browser check passed 540 frames: 474 Sprint frames, 66 Dash frames and six Dash to Sprint handoffs. It checks shared torso and feet clocks, finite poses, preserved action clocks, moving and interrupted transitions, and expiry settling into the ordinary Guard pose.

The normal Blender preview build passed with Blender 4.5.14 LTS. Third person: 12,952 triangles, 2,294,200 bytes, within 35,000 triangles and 2,400,000 bytes. First person: 4,572 triangles, 705,700 bytes, within 16,000 triangles and 1,000,000 bytes. Both production GLB validators passed. Authored Idle and Guard seam tests and second strike offhand clearance checks passed for both sources.

Local evidence is saved in artifacts/chivalry: guard-sprint-authority.json, guard-sprint-motion.png and guard-sprint-motion.webm. The film is a production asset motion study, distinct from the real server sequence recorded in the JSON. Temporary inputs, event listeners and the comparison overlay were removed afterward. Physical phone testing remains outstanding.

## Changed files

1. shared/sim/combat.mjs: one commit Guard raise and shared Sprint exclusion policy.
2. shared/src/combatActionPolicy.mjs: shared Sprint action exclusions.
3. shared/src/combatActionPolicy.test.mjs: policy windows, interruption and ordinary action regressions.
4. server/tests/chivalry-guard-sprint.test.mjs: dedicated Guard, concurrency, Dash, stamina and eligibility regressions.
5. server/tests/chivalry.test.mjs: revised commit expectations, interruption recovery and normal Parry window.
6. server/tests/chivalry-network.test.mjs: real server sequence observed by two clients.
7. client/game/GameRuntime.mjs: matching Sprint prediction and authoritative Chivalry Guard presentation.
8. client/game/localActionPresentation.mjs: release the view Guard when authority says it is down.
9. client/game/localActionPresentation.test.mjs: interruption recovery presentation regression.
10. client/game/WeaponView.mjs: pass concurrent ownership to first person motion.
11. client/game/firstPersonMotion.mjs: restrained Sprint carriage under actions, eased across Chivalry entry and expiry.
12. client/game/firstPersonMotion.test.mjs: continuous stride, action carriage and Dash handoff.
13. client/game/spellbladeAnimationPlan.mjs: small authored Sprint posture overlay.
14. client/game/spellbladeAnimationPlan.test.mjs: concurrent clips, Dash and resumed Sprint.
15. client/game/SpellbladeAnimator.mjs: common stride clock for posture and legs.
16. client/game/spellbladeComposition.mjs: correctly loop authored overlay sampling.
17. client/game/chivalryComposition.browser.mjs: production Sprint cadence and Dash handoff verification.
18. client/menu/armoryView.mjs: automatic Guard and Sprint copy.
19. client/index.html: How to Play concurrency and Guard control copy.
20. docs/CHIVALRY_GUARD_SPRINT.md: this report.

## Concurrent Claude scope

Voice lines, voice director, Credits VO, menu music and autoplay, Sunder and Vortex tuning, ultimate startup cameras, Vortex projectiles and rupture behavior were preserved. Shared combat and runtime files have narrowly scoped Chivalry edits only. Challenges, rewards, Renown, ultimate bot tuning and Armory preview audio were preserved.

The work is delivered on an isolated pushed branch for integration. A branch push does not update the public Render main deployment. Next step is to integrate this correction with Claude's current work, then check the same sequence on the public build.
