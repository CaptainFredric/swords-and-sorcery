# Renown Trials — Phase 2B engineering handoff

**PR:** #401, branch `feat/renown-trials-phase2-20261107` — **DRAFT. No merge or deploy.**

## Ownership and dependency

This branch still descends from `main`. Restless Day PR #402 is active and changing while its
shared runtime / common Renowner presentation contract is being finalized. The developer
coordination discussion is posted on #402. **Do not quietly treat this branch as integrated.**
Once the parent branch is declared ready, merge #402's current head into **existing** #401
using an ordinary two-parent commit (never rewrite #401's history because #403 depends on it),
register `RENOWN_TRIALS_HANDLER` in `shared/sim/modeRuntime.mjs`, reconcile all shared
files and retarget #401's base to `feat/restless-day-phase-1-20261107`.
The isolated adapter exists now at `shared/sim/renownTrialsMode.mjs`.

### Required pre-combat hook

Renown Trials director progression currently occurs from `Room.tick`, before ordinary
combat physics. Restless Day's published `step` hook is **after** combat, so it cannot
advance ceremonies if the normal combat path returns early. A backwards-compatible optional
`preStep(room, nowSec)` hook must be invoked during the room's authoritative tick (or
a functionally identical shared early hook). The trial adapter provides `preStep` without
importing an unfinished registry. No change to Restless Day's existing `step` semantics.

## Reward lifecycle

The browser's ordinary Solo host may simulate Renown Trials, but it has **no account authority**.
`GameLink.startSolo('RENOWN_TRIALS')` now connects to the game server on demand; offline runs
fall back to local unranked trials with `UNAVAILABLE` reward status. The server refuses a
rewarded trial before the guest profile is established.

On each authoritative `renownTrialWaveCleared` event:
1. Validate mode, exact run/wave event identity, player/profile association and an upper bound
   against the server-computed wave reward.
2. A zero payout is `NOT_AWARDED`; no wallet call.
3. A valid positive payout receives receipt `trial-wave:<server UUID match>:w<wave>`,
   with ledger status `PENDING`.
4. `ProfileStore.settleTrialWave` reads the existing profile and atomically replaces it with
   the **balance and receipt together**; a duplicate receipt returns without credit.
5. Only after the store returns does the ledger become `SETTLED` and a profile update publish.
   Storage exceptions retain `PENDING` for server retry. No client command or animation can
   issue that receipt. Normal match-end reward settlement is suppressed for this mode.

The existing profile storage guarantees **exactly once for successfully committed receipts**
and persistence over a process restart. The retry queue is currently in process memory;
a process crash **after a failed write but before successful retry** loses the pending
intent. A durable outbox plus cold-start replay is needed for full crash-survivable eventual
settlement under storage outages. Do not say a failed pending award is already in the wallet.

Previously committed wave receipts are independent of later executed waves. The maximum
wave count defaults to **12 provisionally**, but may be configured as another positive
integer, or `room.trialMaxWaves=null` for an endless run.

## Ceremonies and ownership

A completed overdue wave does not end combat at its deadline. One roll after the final
rival dies picks none, harmless coin, sword execution or sword-evaded / lethal-coin retaliation.
No reroll on reconnect. Stable ceremony identity is
`<runId>:w<wave>`; `renownTrialCeremonyStarted` carries identity, not a premature
execution verdict. Current snapshot progression emits a stable cue sequence:
`SWORD_RAISE`, `KNIGHTING`, `REWARD_COIN`,
`SOLEMN_JUDGMENT`, `NO_REWARD`, `CONSOLATION_COIN`, `CONSOLATION_REACTION`,
`SWORD_EXECUTION`, `SWORD_EVADED`, `I_HAVE_SURPASSED_JUDGEMENT`,
`SWORD_RESET`, `RECEIVE_COMPENSATION`, `COIN_RETALIATION`, `LATE_COIN`.

The lethal contact is authoritative at sword impact or high-speed coin impact;
`renownTrialExecutionImpact` is emitted once using the ceremony ID. Client death
UI and generic match defeat music cannot override the solemn execution. The second
version preserves unrecorded text exactly: **“AHAHAHA! I have surpassed judgement”**
and **“I shall receive your compensation”**. No recorded voice is asserted.
Unrecorded harmless-coin lines are candidates only.

### Art inventory: not represented as final

- **Verified in this PR:** a responsive HUD silhouette / bronze-gray statue placeholder
  and timeline cues, rather than an authored Three.js Renowner in the trial arena.
- **Verified in #402:** a separate **procedural** low-poly articulated Renowner
  renderer in `client/worlds/RestlessDayRenderer.mjs`, including sword/coin combat
  interactions for that mode.
- **Not verified:** a game-ready Argon Renowner `.glb`, animation clips, their
  skeleton mapping or an agreed shared Three.js ceremony attachment API.
- **Still missing:** the synchronized in-world monument / knight cinematic choreography,
  authored sound and 3D animations; UI cues must not be mistaken for those assets.

## Testing and scope

Focused unit/integration tests cover monotonic overtime, one draw, all verdicts, real
bot spawning, simultaneous final death, single lethal impact, rematch, disconnect,
local unranked outcomes, atomic wallet retry/deduplication and malformed receipts.
`client/game/sound/voiceBatch2.test.mjs` preserves the real match-loss voice contract
while excluding scripted Renowner execution; no dialogue transcription was edited.

`scripts/renown-trials-browser.mjs` and its GitHub Actions workflow start an actual
headless Chrome/Three.js game client and server, then exercise real sword commands
against the existing simulation, a timely persisted reward, wave progression,
continued combat after overtime, and a mobile viewport capture. It adjusts the
**test server's** second-wave deadline to avoid a long unattended playtest. This
is an automated integration acceptance, **not** proof of a human skilled-player
combat-pacing or animation review. Record GitHub workflow conclusions and screenshot
artifacts before marking it green.

Remaining integration gates: #402 stable contract/ancestry, #403 compatibility,
actual mobile touch ergonomics, final Renowner visuals/audio, real player wave timing,
and a crash-survivable pending outbox (if eventual settlement across server crashes
must be guaranteed during storage outages). **No force-push, merge or deployment.**
