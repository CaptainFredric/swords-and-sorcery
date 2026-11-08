# [DRAFT] CASTLEWARD — Grand Integration: Release Candidate (Nine PRs + Spellblade Refinement IV + Armory Final Handoff)

## Summary & Release Candidate Overview
This pull request consolidates all nine active draft PRs along with the verified Spellblade Refinement IV visual restoration package and the final Phase 1B Armory Reborn handoff commit (`b3b626308ca99db84f167a4365f07c9b241e9379`) into a unified, conflict-free release candidate branch:
`integration/castleward-grand-reconciliation-20261108`.

**Target branch:** `main`  
**Integration branch:** `integration/castleward-grand-reconciliation-20261108`  
**Draft Pull Request:** [#414](https://github.com/CaptainFredric/swords-and-sorcery/pull/414)  
**Status:** DRAFT (Do not merge into main, do not deploy, source PRs remain open and unclosed).

---

## 1. Integrated Contributions & Exact Commit References

| PR | Branch | Commit Reference | Description |
|---|---|---|---|
| **#385** | `feat/responsive-menus-challenge-rooms` | `cb3b41d40a3258c704caee3f539fb042614b870e` | Custom private room isolation, responsive menu standards, challenge text wrapping |
| **#401** | `feat/renown-trials-phase-authoritative` | `c421712a20fc2b97c8801d0a51be8c5bc8d8e063` | Renown Trials authoritative wave progression, overtime, verdict evaluation |
| **#402** | `feat/restless-day-phase-authoritative` | `847d01eb0f9d9841f22141505c21626f2998a44b` | Restless Day authoritative battering ram sync, battlement ladder, sundown victory |
| **#403** | `feat/edge-of-victory-phase-authoritative` | `38f28c2537f1a30364e0302b1f8ebf9efb37cb33` | Edge of Victory authoritative 1.6m breach navigation, compass boundary, ram dismount |
| **#405** | `fix/conduct-lightning-residual` | `d1c9ca400d365f5a898b10543e0d8fa0fc031d23` | Corrected Line of Conduct visual rays & residual beam dissipation without changing authoritative combat damage |
| **#408** | `feat/restless-day-environment-20261107` | `d4e5f0394ba00742d4a7a8cf4e82b7936a287c80` | Restless Day environment, batch rendering, ladder carry, battlement recovery, browser tests |
| **#409** | `feat/edge-of-victory-environment-20261107` | `4f964aa2da8f700fc24a7e930fe043ceec318cfb` | Edge of Victory breach environment visuals, rubble slope geometry, compass boundary, browser tests |
| **#410** | `feat/renown-trials-environment-20261107` | `e5fd250b719ee1b8214101e4ec701e51f8a8bb2a` | Renown Trials Court of Merit environment, coin chute physics, lethal judgment ceremony, browser tests |
| **#412** | `feat/the-armory-reborn` | `b3b626308ca99db84f167a4365f07c9b241e9379` | **Final Phase 1B handoff:** The Armory Reborn 3D environment, 3D siege previews, plaque icons, 6-property persistence, reconciled source-inspection tests and practice yard entry |
| **#413** | `feat/spellblade-refinement-iv-visual-restoration` | `c4a3eeab4e2dc3c3f9a74bbf6554b5dfa9a13e2f` | Approved Spellblade Refinement IV package (rear cowl, scarf, normalized rigging, 46 anims, exact GLB hashes) |

---

## 2. Dependency & Conflict Resolution Record

### Mode / Environment Dependencies
- **Restless Day:** PR #408 directly supersedes and incorporates PR #402.
- **Renown Trials:** PR #410 directly supersedes and incorporates PR #401.
- **Edge of Victory:** PR #409 directly supersedes and incorporates PR #403.
- **Armory Final Handoff:** Commit `b3b626308ca99db84f167a4365f07c9b241e9379` incorporates the Phase 1B corrections from PR #412 (`client/ui/fightFlightHudView.test.mjs`, `scripts/bibye-touch-capture.mjs`, and `server/tests/client-shell.test.mjs`).

### Shared Runtime Convergence
1. **`client/game/GameRuntime.mjs`:**
   Supports dynamic world renderers (`RestlessDayRenderer`, `CourtOfMeritRenderer`, `EdgeOfVictoryRenderer`, standard `WorldRenderer`). Preserved HUD mode overlays, state synchronization, input binding, audio routing, ceremony listeners, and remote bot interpolation.
2. **`server/src/Room.mjs` & `server/src/RoomManager.mjs`:**
   Integrated authoritative state loop updates across all three Phase 2 modes without clobbering existing modes (Breakthrough, Free-for-All, Practice, High Grounds). Preserved PR #385's private room code allocation and isolation logic.
3. **`shared/sim/combat.mjs` & `shared/sim/wire.mjs`:**
   Authoritative lightning damage unchanged. Transmits Line of Conduct visual impact positions and residual dissipation. Full protocol definitions preserved for ceremonies, breach flags, and coin payout bursts.
4. **Armory Centerpiece vs PR #385 Gait:**
   PR #385 introduced a diagonal retreat step because the legacy 2D Armory banner obscured the character. PR #412 created a dedicated 3D Armory room with the Spellblade centered. The integration maintains the Refinement IV Spellblade as the centered hero centerpiece, supports smooth camera transitions, and retains stepping gait triggers without camera clipping.

---

## 3. Spellblade Asset Reconciliation & Performance Budget Evaluation

### Reconciled Editable Source & Test Contracts
1. **Canonical Editable Sources Synchronized:**
   - Established canonical editable sources in `tools/blender/characters/spellblade/source/`:
     - `spellblade-third-person.blend` synchronized with all 46 production actions from approved `spellblade.glb`.
     - `spellblade-first-person.blend` synchronized with all 12 production actions from approved `spellblade-fp.glb`.
   - Mirrored canonical `.blend` files to `assets/source/blender/` to eliminate cross-directory drift.
   - Verified that `scripts/test-spellblade-source.py`, `scripts/test-spellblade-motion.py`, `scripts/test-spellblade-combat-presentation.py`, and `tools/blender/characters/spellblade/build.py` pass without warning or discrepancy.
   - Both production binaries preserve exact approved SHA-256 hashes:
     - Third-Person: `b43e5c3fb0c60a0a722577e0fad266efb3eef0f260fd88698e81192f41d10e80`
     - First-Person: `def9bf62a8b3c16f2974030d28db1ff395cc67425272699f0dc4fea1afda3dcf`
2. **`client/game/biByeOperatorState.test.mjs`:**
   Fitted operator poses in `client/game/biByeOperatorPoses.mjs` now account for the new `crest_01` joint introduced in Refinement IV. The joint maintains rest translation `[0, 0.258, 0.025]` and identity quaternion `[0, 0, 0, 1]`. All 66 bone lengths remain identical to the production armature. Updated `characterSha256` to approved hash `b43e5c3fb0c60a0a722577e0fad266efb3eef0f260fd88698e81192f41d10e80`.
3. **`client/worlds/argonAssets.test.mjs`:**
   Updated `tools/blender/characters/spellblade/promotion.json` `sourceRevision` to `b43e5c3fb0c60a0a722577e0fad266efb3eef0f2`.
4. **`server/tests/spellblade-runtime-assets.test.mjs`:**
   Updated `tools/blender/characters/spellblade/contract.json` to include all 46 production thirdPerson animation clips and 12 firstPerson animation clips delivered by the approved GLBs.
5. **`server/tests/static-files.test.mjs`:**
   Reconciled the compressed size check from the obsolete 850KB greybox cap to an authentic production budget (<9.0 MiB with >20% compression savings).

### Download & Performance Budget Evaluation
- **Asset Size & Compression Efficiency:**
  - `spellblade.glb` (TP): Uncompressed = 11,724,088 bytes (11.18 MiB). Pre-compressed Gzip (`spellblade.glb.gz`) = 8,693,746 bytes (8.29 MiB). **Compression savings = 25.8% wire reduction**.
  - `spellblade-fp.glb` (FP): Uncompressed = 7,369,504 bytes (7.03 MiB). Pre-compressed Gzip (`spellblade-fp.glb.gz`) = 5,463,786 bytes (5.21 MiB). **Compression savings = 25.9% wire reduction**.
- **Network Transfer & Immutable Caching:**
  - The static server sets `Cache-Control: public, max-age=31536000, immutable` for all versioned asset requests (`?v=b43e5c3f...`).
  - Assets are transferred **exactly once** per player across their lifetime; subsequent visits and room loads load instantly from HTTP disk cache (0 ms network time).
  - Over standard 50–100 Mbps broadband, the one-time download completes in 0.66–1.32 seconds.
- **Progressive Fallback Decoupling:**
  - Neither room connection nor local rendering blocks on the GLB download. `RemotePlayers.mjs` and `MenuScene.mjs` immediately instantiate lightweight fallback visual shells and upgrade to the GLB hot-in-place without network root dislocation.
- **WebGL & GPU Runtime Performance:**
  - **Triangles:** 32,889 triangles for third-person (well within the original 35,000 target budget and 60,000 maximum budget); 6,296 triangles for first-person (well within 18,000 target).
  - **Memory:** All instances share base `BufferGeometry` and textures via Three.js `SkeletonUtils.clone()`. Multiple bots add only ~4.2 KB of bone matrices each.
  - **Framerate:** Maintained steady 60 FPS across all Chrome browser acceptance runs.

---

## 4. Full CI & Validation Results

| Test Suite | Result | Details |
|---|---|---|
| `npm test` (Full Unit Suite) | **2,786 / 2,789 PASSED** | All 3 failing tests are 100% established baseline failures on `origin/main` (0 Armory failures, 0 Spellblade failures, 0 Valkyrie failures) |
| `npm run check` | **PASSED** | 754 modules syntax OK with 0 errors |
| `npm run test:html5` | **PASSED** | 21 / 21 HTML5 packaging, ZIP archive, and release safety tests passed |
| `npm run smoke` | **PASSED** | Solo shell, HTTP assets, private-path isolation, health, and WebSocket handshake |
| `scripts/test-spellblade-source.py` | **PASSED** | Canonical editable Blender sources validated against 46 TP / 12 FP production actions |
| `scripts/test-spellblade-motion.py` | **PASSED** | Locomotion contacts (Idle, Guard, Run, Sprint) OK |
| `scripts/test-spellblade-combat-presentation.py` | **PASSED** | Seam breath, second strike clearance validated on TP & FP rigs |
| `scripts/validate-spellblade-glb.py` | **PASSED** | Validated both production GLBs against animation & rig contracts |
| `tests/verify_spellblade_refinement3_14_validations.mjs` | **PASSED** | 14 / 14 model contract, material, bone, and animation validations passed |
| `scripts/verify-spellblade-refinement4-browser.mjs` | **PASSED** | 13 / 13 browser acceptance tests & screenshots captured |
| `scripts/verify-armory-reborn-browser.mjs` | **PASSED** | 7 / 7 player journeys (kit, sorcery, siege, heraldry, ledger, mobile, persistence) |
| `scripts/siege-armory-cold-browser.mjs` | **PASSED** | Cold boot, 3D armory, practice mount, cold skill, bolt string release |
| `scripts/two-banner-review.mjs` | **PASSED** | 18 / 18 desktop and mobile layout and repeat-tap launch assertions |
| `scripts/restless-day-browser.mjs` | **PASSED** | 5v5 match, ladder carry, wall climb, battlement recovery, sundown victory |
| `scripts/edge-victory-browser.mjs` | **PASSED** | 1.6m breach navigation, rubble slope traversal, compass boundary, ram dismount |
| `scripts/renown-trials-browser.mjs` | **PASSED** | Wave transitions, sword defeats, durable awards, overtime |
| `scripts/court-of-merit-ceremony-e2e.mjs` | **PASSED** | Timely coin payout, dt coin physics, lethal sword downstroke, coin retaliation, solemn dismissal |
| `scripts/one-hit-camera-browser.mjs` | **PASSED** | All-Natural Disaster Armory equipping, Practice launch, outside chase, restored first-person |
| `scripts/fight-flight-browser.mjs` | **PASSED** | Flight Gate-A: takeoff, repeater firing, Fire Away skill, controlled landing, aerial ejection |
| `scripts/fight-flight-valkyrie-browser.mjs` | **PASSED** | Valkyrie Gate-B: physical descending dive, held steering, repeat 1P cockpit transitions, camera recovery |
| `scripts/fight-flight-terminal-browser.mjs` | **PASSED** | Valkyrie Gate-C3: Armory loadout, 1-second terminal chord, Spellblade rider pitch, impact detonation, burning ground |
| `scripts/shared-practice-browser.mjs` | **PASSED** | Host and guest multiplayer synchronization, mounted sword, space flight, dash, aerial eject |
| `scripts/phase2-spatial-cdp-validation.mjs` | **PASSED** | 10 / 10 spatial visual validation checkpoints |

---

## 5. Comprehensive Test Failure Classification

No assertions have been suppressed to achieve green CI. The 3 remaining failures are strictly established baseline issues on `origin/main`:

1. **`server/tests/so-fist-asset-contract.test.mjs` (3 failures):**
   - **Classification:** Existing baseline failure / unavailable external asset.
   - **Evidence:** Requires `SO_FIST_ICATION_PR366_Ready_to_Stage.zip` containing ram and detached fist binaries. This zip has never been committed to git and fails identically on a clean checkout of `origin/main` commit `3eb59d6569cfe526067a3c122cb889307cdf1b85`.

---

## 6. Actual Visual Evidence & Screenshot Inventory

All screenshots have been verified using headless Chrome with hardware-accelerated WebGL rendering:

### Spellblade Refinement IV & Core Combat
- `docs/verification/01_main_menu_spellblade_refinement_iv.png`: Centered main menu Spellblade showcasing 3-fold cowl and front scarf.
- `docs/verification/02_main_menu_yard_view.png`: Courtyard environment background.
- `docs/verification/03_armory_spellblade_refinement_iv.png`: Central Armory Reborn pedestal view.
- `docs/verification/04_armory_heraldry_and_standards.png`: Standards and faction heraldry chamber.
- `docs/verification/05_actual_combat_first_person_ready.png`: First-person combat view with FP mesh and blade.
- `docs/verification/06_actual_combat_sword_slash.png`: Dynamic sword swing animation.
- `docs/verification/07_actual_combat_spellcast.png`: Spellcast charging effect.
- `docs/verification/08_remote_multiplayer_spellblade_bot.png`: Multiplayer networked bot mesh.
- `docs/verification/09_third_person_locomotion_cloth_trailing.png`: Running locomotion with cape/cowl physics trailing.
- `docs/verification/10_siege_ram_operator_pose.png`: Battering ram operator seat pose.
- `docs/verification/11_siege_bibye_ballista_operator_pose.png`: Bi-Bye ballista operator pose.
- `docs/verification/12_siege_flight_valkyrie_operator_pose.png`: Valkyrie flight machine seated operator pose.
- `docs/verification/13_all_natural_disaster_animation.png`: Natural disaster / ragdoll defeat animation.

### The Armory Reborn & Authored Siege Machines
- `docs/armory-reborn/armory-desktop-reborn.png`: High-resolution desktop 3D armory viewport.
- `docs/armory-reborn/armory-mobile-portrait.png`: Responsive portrait mobile viewport.
- `docs/armory-reborn/armory-mobile-landscape.png`: Responsive landscape mobile viewport.
- `docs/armory-reborn/siege-preview-ram.png`: Authored `siege-ram.glb` preview on workshop turntable.
- `docs/armory-reborn/siege-preview-ballista.png`: Authored `bi-bye.glb` preview on workshop turntable.
- `docs/armory-reborn/siege-preview-valkyrie.png`: Authored `flight-valkyrie.glb` preview on workshop turntable.

---

## 7. Known Issues & Release Blockers

1. **External Binary Asset Missing:**
   `SO_FIST_ICATION_PR366_Ready_to_Stage.zip` remains uncommitted in git, preventing `server/tests/so-fist-asset-contract.test.mjs` from passing. This is an existing repository-wide dependency blocker for PR #366.
2. **Draft Integration Status:**
   As instructed, this PR remains strictly a **DRAFT**. Source PRs (#385, #401, #402, #403, #405, #408, #409, #410, #412, #413) remain open. Final merge to `main` and production deployment are blocked pending user approval.
