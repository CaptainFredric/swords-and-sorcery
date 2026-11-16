# Combat Lab: cadence combat, prototype (2026-11-16)

A playable prototype of the combat plan, with a generated-motion spike built into it. Open
`/client/lab/combat-lab.html` on a running server (`npm start`, then `http://localhost:3001/client/lab/combat-lab.html`).
It is a separate page: the game, the server and the shipped model are untouched.

**Controls:**

| Input | Action |
|---|---|
| Click | Fight (locks the mouse) |
| Mouse | Turn |
| WASD | Move |
| Left click / J | Cut |
| Right click / K | Guard |
| V | Duel camera / side view |
| Esc | Settings |

## The idea: one timeline, read by everything

Timing is defined once, in `shared/src/combatFrameData.mjs`. The simulation, the bots, the HUD and the clips all read
it. The animation is fitted to the data, never the other way round:

```
frame data (CUTS, CADENCE, DEFENCE, HIT_STOP)
   │
   ├─ rules ─ cadenceDuel.mjs: chains, presses judged, defence tiers, feints, stagger, root motion with warping
   ├─ bodies ─ each clip's contact frame on the cut's contact (cutClipTime); switches by inertialization
   ├─ feel ── hit-stop by outcome, sparks, camera kick, sound, the tell's glint
   ├─ skill ─ the rhythm strip, their cut's timeline, your numbers
   └─ motion pipeline ─ tools/animation/retarget-bvh.mjs retimes a generated take onto the same numbers
```

## The rules (tuning, provisional)

### The chain goes on by rhythm

Each cut has a beat 0.20 s after its contact. How the next press is judged:

| Press | Window | Effect |
|---|---|---|
| On the beat | ±50 ms | The next cut comes 0.18 s after contact, ×1.12 damage, a bright ring |
| In time | 0.04–0.42 s after contact | The next cut comes 0.26 s after contact |
| Early | Before the window | Kept, at the held pace: mashing earns nothing |
| Late | After the window | The chain lapses and starts over from the forehand |
| Held button | — | Still works, at the shipped chain's slow, safe pace (0.32 s); the test pins this to `SWORD_CHAIN` |

### Defence is graded by when the guard went up

| Guard raised before the blow's contact | Result |
|---|---|
| ≤ 70 ms | **Perfect Parry:** the attacker reels for 0.85 s, and your next cut within 0.7 s is a riposte (faster startup, ×1.25 damage) |
| ≤ 180 ms (the game's `parryWindowMs`) | **Parry:** the attacker reels for 0.45 s |
| Earlier | **Block:** costs stamina; an empty bar is a guard break |

Three more defence rules:
- **A guard tapped and dropped with nothing met is a whiff:** it can't go up again for 0.35 s.
- **A held guard that comes back up by itself only blocks,** as `heldActions.mjs` already rules in the game.
- **Raising your guard before your own cut goes live calls it off** (a feint).

### Every cut is told

A tell comes 0.25 s before contact: a glint along the blade and a breath of sound.

### Hit-stop

The whole duel holds for 50–120 ms, scaled by how good the moment was:

| Moment | Hold |
|---|---|
| Block | 50 ms |
| Hit | 55 ms |
| Clean hit | 75 ms |
| Hit on the beat | 90 ms |
| Parry | 80 ms |
| Riposte | 110 ms |
| Perfect Parry | 120 ms |

The beat cue waits out the hold, as fighting games' hit-stop does.

### Decisions I made for the open questions

You hadn't answered these from the plan, so the lab takes a position on each, and each is one constant to change:
- **Holding Attack stays,** as the accessible floor.
- **Mistakes are lightly punished:** a whiff costs 0.35 s, a lapsed chain only its rhythm.
- **Aim still sets most of the damage** (blade.mjs's quality curve). Timing adds a measured bonus on top.
- **Pace is For Honor-ish deliberate.** The shipped chain's pace is the floor.

## The animation, and how it fits the rules

**Inertialization** (`client/lab/inertialize.mjs`) replaces cross-fades. The new clip takes over at once, and the old
pose's difference (and its speed) dies away on a critically damped spring with an 85 ms half-life. The settings panel
switches between inertialization, a 0.15 s cross-fade and snapping, so the difference can be felt.

**Root motion with warping.** A generated cut steps, and the simulation moves the knight by exactly the clip's step,
so planted feet stay planted in the world. The step is scaled so the blow lands 1.5 m from the knight in front of you,
never through him: the full step with nobody there, none when he's already close. The cost: a scaled step slides the
feet by what was taken off, until stride warping bends the legs to match (next step).

## The Kimodo spike

### How the takes were made

- **Generation:** NVIDIA's hosted demo of `Kimodo-SOMA-RP-v1`, at no cost, in one 5-minute session in the browser pane.
  The prompt: "A knight holding a sword in his right hand steps forward with his right foot and swings the sword
  diagonally from high on his right down across to low on his left, then recovers to a ready guard."
- **Takes:** three seeds (42, 7, 123), each 6 s at 30 fps on the 77-joint SOMA skeleton, exported as BVH.
- **The raw takes** sit in `artifacts/kimodo-spike/raw/`, which is not committed.

### Retargeting (`tools/animation/retarget-bvh.mjs`)

1. **The bones are matched by anatomy, not by rest pose.** SOMA's zero pose isn't anatomical, so each Spellblade bone
   is turned so an anatomical frame built from joint positions matches the source's. A frame is a bone's direction
   plus one more axis: the elbow or knee hinge, the knuckle line, or the line of the shoulders or hips. The scale comes
   from leg length.
2. **The take is retimed onto the frame data.** Its start, contact (the sword hand's fastest frame) and end map onto
   the cut's 0, 0.391 s and 0.767 s, so it is a drop-in for `Slash_1`'s markers.
3. **The sword arm is driven by the server's blade.** The generated body knows no sword. Through the cut, the arm is
   solved (the game's own `swordArmIK.mjs`) so the shown blade lies along the arc the server sweeps
   (`blade.mjs bladeDirection`), its grip on that blade's line from the eye, with a raise before and a follow-through
   after. So the sword you see is the sword that hits.
4. **Feet are locked to the source's paths.** Each leg is solved so the ankle follows Kimodo's foot. The source pins
   its planted feet to the millimetre.
5. **The travel comes off the pelvis** and is written out as a root-motion curve, and the clip is stood on the floor.

### Results

Footwork is measured by `tools/animation/footwork-root.mjs`, with root motion applied:

| Forehand | Planted foot creeping | Foot skimming the floor | Steps lifted | Knee change | Step |
|---|---|---|---|---|---|
| Argon's `Slash_1` (shipped de8c8655) | 0.4–1.7 cm | 61–75 cm | 2.8 / 6.9 cm | 17.8°/frame² | none |
| Kimodo take 7 | 0.7–1.2 cm | 23–24 cm | 8.0 / 16.2 cm | 20.8°/frame² | 0.72 m |
| Kimodo take 42 | 0.4–0.6 cm | 0–22 cm | 7.1 / 7.4 cm | 6.8°/frame² | 0.26 m |
| Kimodo take 123 | 1.3–2.4 cm | 8–23 cm | 15.5 / 8.3 cm | 20.9°/frame² | 0.77 m (steps off the wrong foot) |

The skim column is the acceptance rule's glide: a foot under 4 cm that moves. For Kimodo that's take-off and landing,
compressed by the retime.

**What that means:**
- **The generated takes step.** They lift the stepping foot 7–16 cm, their planted feet hold, and the weight goes into
  the cut.
- **Argon's forehand doesn't step;** it skims its feet 61–75 cm across the floor.
- **Kimodo's take-offs and landings still skim** about 20 cm under the strict rule. Part of that is the retime squeezing
  a 0.5 s wind-up into 0.39 s.
- **Take 123 stepped off the wrong foot.** Text alone doesn't hold the details: the full pipeline should pin the feet
  with constraints, which the demo's UI can't script.

The lab plays take 7 by default. Take 42 and Argon's clip are in the settings for comparison.

**Evidence:**
- `evidence/retarget-skeleton-seed7-vs-argon.png`: skeleton and sword, frame by frame.
- `evidence/forehand-kimodo-warped-vs-argon.jpg`: in the lab, side view; the step stops at striking distance.
- `evidence/perfect-parry-and-on-beat-chain.jpg`: the drill knight's tell glint, a Perfect Parry and his reel; then
  your three-cut chain pressed on the beat (0 and +3 ms), three clean hits.

### What's not checked or not done

- **The licence.** The demo runs `Kimodo-SOMA-RP-v1`. The weights' licence, and so the generated motion's, must be
  confirmed before any of it ships in the game. It's committed here only as a lab asset.
- **Production generation** needs Kimodo run from its repository on a rented NVIDIA GPU, scripted with constraints:
  feet planted, the sword hand at contact. The hosted demo is a 5-minute web session with no API.
- **The backhand and the chop** are still Argon's in the lab. Only the forehand was generated.
- **Stride warping and runtime foot IK** (the slide a warped step costs) aren't built.
- **Not ported to the server:**
  - the authoritative simulation (`shared/sim/combat.mjs`) still runs the shipped chain;
  - hit-stop online needs the server to hold both fighters' clocks (as Flash Freeze's `holdFlashFrozen` already does);
  - presses need judging at their own timestamps, as `endAttack`'s `releasedAt` is today.
- **Not tested with a real hand.** I've driven it by script, frame by frame. The feel is yours to judge, and mobile and
  touch aren't supported in the lab.
