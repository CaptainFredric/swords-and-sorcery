# Spellblade candidate v1 in Castleward (2026-11-17)

**Verdict: integrate v1.** It looks and fights clearly better than the PR #503 model and breaks nothing. Codex is
asked for a v2 ([CODEX-V2-REQUEST.md](CODEX-V2-REQUEST.md)).

v1 is Codex's 17 November handoff (`Spellblade Blender Handoff.zip`, sha256 `97e430e3…`). It was reviewed frozen and
as one pair: third person `6a8c25ac…` and first person `c5f663d1…`. Both models were served into the same checkout
of real Castleward through CDP, so only the model files differed. #503's `d0e390b7` / `80de8aee` is the baseline.

## What players see

Every "per frame" count is of sword-arm armour triangles, as drawn, past 0.7× or 1.4× their bind length. Each comes
from the pose gallery, one 30 Hz tick at a time.

| In play | #503 | v1 |
|---|---|---|
| Sword arm idling, running, sprinting, Whirl | 143–442 per frame | 0 |
| Sword arm through the cut chain | 206 per frame (worst 913) | 20 (worst 276) |
| Sword arm in Sunder | 305 (worst 858) | 58 (worst 252) |
| Sword arm in a held Guard | 1,017 | 211 |
| Planted feet sliding over a standing chain, L / R | 70 / 119 cm | 28 / 25 cm |
| Running wrist bend | 99–123° | 14–27° |

The cuts' contact times, the bridges and the seat poses are unchanged. A second player sees the same swings, hits and
misses as on #503.

## Remaining visible defects, ranked

1. **Running and sprinting feet skate.** The clips cover about 2.4 and 3.8 m/s of ground; the game moves the knight
   at 7.5 and 11 m/s. This is true of every model so far. Codex request §3.
2. **The chop sweeps sideways.** The server comes straight down the aim; the clip's blade crosses it 37° to the left.
   This is true of every model so far. The exact frame contract is in Codex request §1.
3. **Running carry reads stiff.** This is new in v1: the blade is held level at belt height. Codex request §2.
4. **Rigid Riposte.** The wrist parts from the cuff in the thrust, and the lunge drags a planted foot. v1 eased the
   archive clip, not the one the game plays. Codex request §4.
5. **Whirl:** the feet orbit the spin. Codex request §5.
6. **The heavy strike's raise** gathers the feet. Codex request §6.
7. **Close-up only:** the Guard elbow lames squash, and the backhand wrist folds 29°. Codex request §7.

## Changed in the game

- **Guard and cast on the move keep the legs running**
  (`client/game/spellbladeAnimationPlan.mjs`). Guarding blocks Sprint but not movement. In the yard, guarding while
  running at 7.5 m/s showed the whole-body Guard clip with one foot planted, sliding 11.9 m in 1.6 s. Now the legs run
  under it (`evidence/cmp-guard-run.jpg`). Presentation only: movement and the server are untouched.
- **Stride cadence is unchanged.** Matching 7.5 m/s with today's strides would need about three times the cadence. The
  fix is longer authored strides.
- **v1 installed as a pair.** Manifest clip lists now follow Blender's name order. The seat poses' checksum moved to v1
  after confirming every bone length matches exactly.
- **Tools:**
  - the review tools take `--fp-glb`;
  - the gallery has a `guard-run` scene;
  - `spellblade-reweight-gauntlet.mjs` reads Blender's byte joint indices. Re-applying it to v1 changes no weight, so
    v1's plates are whole.

## Known, not visible

`sword-loop-audit` flags one frame in "Riposte out of Guard": the sword lowering out of the Guard moves 13.6 cm in a
1/60 s frame, against its 12 cm snap floor. #503 moved 10.8 cm there. The trace is a smooth ramp (2.9, 8.4, 13.6,
18.6 cm), not a jump. The two models' Guard and Idle poses are identical at the tip; v1 moves the Guard's twist from
the hand into the forearm, which bends the blended path. The threshold is left as it is.

## Reproduce

```sh
node scripts/spellblade-compat-check.mjs <candidate.glb>          # and --fp <first-person.glb>
node scripts/spellblade-candidate-acceptance.mjs <candidate.glb>
node --experimental-websocket scripts/spellblade-pose-gallery-browser.mjs --scenario chain|walk|sprint|guard|guard-run|riposte|whirl|sunder \
  [--glb <tp.glb> --fp-glb <fp.glb>] --views front,right,arm,fp
node --experimental-websocket scripts/swordsmanship-capture-browser.mjs --scenario slash-chain [--close|--remote] [--glb … --fp-glb …]
```
