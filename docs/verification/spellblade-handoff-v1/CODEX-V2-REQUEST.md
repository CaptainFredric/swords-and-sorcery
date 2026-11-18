# For Codex: Spellblade candidate v2, after in-game review of v1 (2026-11-17)

**v1 is recommended for integration.** It's the November 17 handoff (`Spellblade Blender Handoff.zip`, sha256
`97e430e3…`; third person `6a8c25ac…`, first person `c5f663d1…`), reviewed frozen and unmixed in real Castleward. It's a
clear gain:

- **The sword arm no longer tears.** In-game, the armour triangles round the sword arm that are visibly crushed or
  stretched went from hundreds per frame to none in idle, running, sprinting and Whirl. In the chain they dropped from
  206 to 20 per frame, and in Sunder from 305 to 58.
- **The running wrist sits in line with the forearm.**
- **Standing cuts step instead of skating.** The feet slide 25–28 cm over a whole chain, where #503 slid 70–119 cm.

Please send v2 as one complete pair: a third-person and a first-person file built from the same source revision.
Castleward won't take partial files or mix versions.

Every number below was measured on the frames the game draws: `scripts/spellblade-pose-gallery-browser.mjs` (fixed
cameras, one 30 Hz tick at a time) and `scripts/swordsmanship-capture-browser.mjs` (normal-speed video, including a
second player's view). Clip frames are 30 fps and 0-based. Frame f means time f/30 s.

## 1. The chop crosses to the side (most visible remaining defect)

The server's third strike comes straight down the aim: 60° above it at the start of the swing window, through the aim
at contact, and 50° below it at the window's end (`shared/src/blade.mjs` `bladeDirection`, strike 2; window
`MELEE_CONTACT.window` = 0.09 s before and 0.11 s after contact). The game keeps this path. A diagonal would change
which targets the chop catches.

v1's `Slash_3` is unchanged before f15. Its blade swings across to the knight's left instead of down, so from the
front it passes about 1.5 m to the side of where the hit lands on a knight 2 m away.

**Contract.** Below, heading is the blade's direction projected on the ground: 0° is straight ahead and negative is
to the knight's left. Pitch is above (+) or below (−) level. Measure from the `socket_sword` grip to the sword point.

| Frame | Pitch wanted (server) | v1 pitch | Heading wanted | v1 heading |
|---|---|---|---|---|
| f10, 0.333 s (end of the raise) | ≥ +60° | +69° | within ±15° | **+53°** |
| f11, 0.367 s | +28° | +25° | within ±10° | −15° |
| contact, 0.385 s | 0° | about 0° | within ±10° | **about −37°** |
| f12, 0.400 s | −14° | −15° | within ±10° | **−60°** |
| f13, 0.433 s | −44° | **−15°** | within ±10° | **−53°** |
| f14, 0.467 s | ≤ −50° | −19° | within ±15° | −43° |

- **Keep the timing.** Contact stays at 0.385 s. The game warps the clip so that 0.346 s is the server's swing
  start and 0.44 s its end.
- **Keep the grip near the midline as it descends.** At contact v1 has it at x −0.01 m, y 1.55 m: keep that, but turn
  the hand so the blade points down the aim, and let the right elbow fold as the hands come down.
- **Keep v1's deeper finish after f15** (−43° to −48°). After f16 the follow-through may turn naturally toward the
  left hip, as v1 does.

**Measure it with:** `node scripts/spellblade-candidate-acceptance.mjs <glb>` ("chop: blade to the side where it
crosses the aim" should be ≤ 12°).

## 2. Running carry: wrist good, silhouette stiff

v1's `Walk`, `Run` and `Sprint` hold the sword level at belt height, pointing forward and across the body. From in front
it reads like a couched lance. #503 carried it angled up, which reads as a ready knight.

**Wanted:** keep v1's neutral wrist (bend ≤ 30°), but raise the point 25–40° above level, with the blade forward of the
right shoulder and not across the belly. See the sprint (front) and run (side) comparisons.

## 3. Run and Sprint strides cover a third of the ground

This was true of every model before v1 too, and it's the biggest foot sliding in the game. The game moves a running
knight at 7.5 m/s and a sprinting one at 11 m/s. At the speed the game plays them, the clips cover far less ground:

| Clip | Duration | Step length (feet apart at contact) | Ground covered | Game speed |
|---|---|---|---|---|
| `Run` | 0.667 s | about 0.8 m | about 2.4 m/s | 7.5 m/s |
| `Sprint` | 0.500 s | about 0.95 m | about 3.8 m/s | 11 m/s |

In-game, a foot on the ground slides at roughly the knight's own speed: 4–7 m per foot over a 2.4 s run. Raising the
cadence alone can't close a 3× gap without looking frantic.

**Wanted:** a bounding stride with a real flight phase, so that played at rate 1 with the pelvis carried forward at
7.5 m/s (`Run`) or 11 m/s (`Sprint`), each foot stays within 5 cm of its touchdown point while it's down. For example,
`Run` at about 3.6 steps/s with steps of about 2.1 m, of which about 1.1 m is flight, and `Sprint` proportionally
longer. Keep the cycle a clean loop. Tell us the speed each clip is authored for, and the game will set the cadence
from ground speed (`strideRate`) off that.

Please re-measure with the handoff's own `audit_root_fixture.mjs`, pelvis translated at the game's speed.

## 4. Rigid Riposte: the live clips weren't changed

v1 eased the archive action `Rigid_Riposte_Deflect_Thrust`. Castleward plays `Technique_RigidRiposte_*` from the
motion sidecar (`client/assets/characters/spellblade/spellblade-motion.glb`). That's unchanged, so the gauntlet still
visibly parts from the cuff in the thrust (see the Riposte close-ups).

- **Bring the same forearm-twist relief to `Technique_RigidRiposte_Thrust`**, and to `_Interception`. Keep
  `socket_sword` on the contract's samples (`shared/src/swordTechniqueContracts.mjs`, `RIPOSTE_SAMPLES`) within
  2 cm and 3°.
- **Footwork of the lunge.** The server moves the knight 5.7 m between 0.22 s and 0.48 s, about 22 m/s. The left foot
  is down and dragged about 1.2 m. Author it as a driving leap, with the back foot leaving the ground and landing
  behind, rather than a planted foot.
- **Ship the `Technique_*` clips inside the v2 third-person file.** The game rebuilds the sidecar from it
  (`tools/assets/build-spellblade-motion.mjs --candidate`).

## 5. Whirl Like the Wind: feet orbit the spin

The knight turns a full revolution every 0.6 s, but both feet stay down, so each sweeps round the spin: 6–8 m over
2.4 s in-game. **Wanted:** a pivot. One foot stays planted as the axis while the other lifts and steps round each
half-turn.

## 6. The heavy strike's raise looks less braced

v1's new `Slash_3` footwork brings the feet together at the top of the raise. #503 held a wide, braced base there.
Sunder plays this strike for every slam, so the narrow stance repeats and reads lighter than a two-handed overhead
blow should (`cmp-sunder-right.jpg`). **Wanted:** keep the new step, but plant the lead foot so the stance at the top
of the raise is at least shoulder width, about 45 cm between the ankles.

## 7. Smaller arm and armour items (visible only close up)

- **Guard is the worst remaining armour pose.** About 210 visibly distorted triangles per frame near the sword arm
  (#503: about 1,000), mostly the elbow lames squashing to 0.53× in the held Guard. It's invisible at play distance.
  When convenient, model the elbow lames to overlap more in the Guard bend.
- **Backhand wrist fold after contact is 29°** (target ≤ 12°). Not noticeable in play. Low priority.
- **Right shoulder yoke against the chest:** 1.57 cm median in `GuardCut_1`, down from 1.98. No longer visible in
  play. No action needed.

## Don't change

- The 66-joint skeleton and `hand.R` pivot, the sockets, material names and clip names.
- Every contact time: `STRIKE_CLIPS` in `client/game/swordChainPresentation.mjs`. v1 kept them all, and v2 should too.
- `scripts/spellblade-compat-check.mjs` must print `compatible` for both files (`--fp` for first person).
