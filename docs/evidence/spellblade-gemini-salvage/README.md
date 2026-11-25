# Spellblade: Gemini salvage on Codex's strut

This draft uses Codex's `integrate/spellblade-strut` (`a48612dc`) as the baseline and keeps everything Codex built and tested. From Gemini's "Spellblade Armor and Machine Restoration" chat it takes only:

- **First-person solver patch** (turn 73, written against `a48612dc`). It moves the wrist's axial twist onto the forearm, and the elbow cap keeps all of the forearm's twist.
- **Coaxial first-person right arm**, `spellblade-fp-coaxial.glb` (turn 77). The arm is rebuilt on its own bone axis, 0.46 cm off-axis instead of 18.8 cm. Everything else in the first-person model is unchanged: clips, joints, textures and the left arm.
- **Three clips from v15**, copied by bone name onto Codex's 84-joint model. All other clips, meshes, weights, textures and cloth bones are byte-for-byte Codex's.
  - `AllNatural_Lightning_Arrival_Slam`: the kneeling two-handed slam.
  - `AllNatural_Aerial_Vortex_Wave`: a 720° spin, a forward aim-lock, then the cut.
  - `AllNatural_Lightning_Faceplant_PopUp`: the cosmetic gag.

## Measured fixes made while copying

`scripts/transplant-spellblade-clips.mjs` reproduces each of these.

| Problem in Gemini's clip | Fix |
|---|---|
| It keys 19 bones and leaves the fingers, clavicles, knees and sword unkeyed. In three.js those would keep the previous clip's pose. | The missing channels get constant rest keys. That is what Gemini's renderer showed, and the rest fingers equal Codex's Idle grip. |
| The arrival's lead-in puts the blade 0.26 m under the floor, and its recovery 0.49 m under. | The clip is trimmed 0.15 s in, and from 0.6 s it settles into Codex's Idle by way of Guard. The lowest blade point is now +1.5 cm. |
| The faceplant ends with the blade 0.15 m in the floor. | It settles by way of Guard from 0.7 s. The lowest point is +5.4 cm. |
| The vortex ends in Gemini's own idle, not Codex's. | It settles by way of Guard after its cut. |

The new timings are:
- Arrival: contact at 0.19 s, 0.85 s long. This is measured by the plan test's own rule.
- Vortex: contact at 1.1 s. That is where the blade sweeps through the front; at 0.85 s it is still raised and braking.

## Left out, and why

| Gemini clip | Why it isn't in this draft |
|---|---|
| Flat-on-back gag | The right hand goes 0.34 m and the blade 1.49 m under the floor while he lies there. |
| White-flag suite | The sword stays in hand and sits 0.30–0.38 m in the floor the whole time; the "sets the sword aside" pose isn't there. These clips also aren't wired in yet. |
| Dash | Codex's 0.4 s Dash is better, and the game plays a 0.4 s dash. |
| Crouch | Castleward never plays the crouch clips; its crouch is a procedural leg bend. |
| v17–v26 mesh, weight and UV changes | They broke the helmet three times; Codex has its own visor clean-up. |

## Evidence

All of these come from a real Castleward server and Chrome.

- `fp-chain-before.jpg` / `fp-chain-after.jpg`: the first-person three-cut chain on Codex's build and on this draft.
- `fp-after-forehand-and-heavy.jpg`: the forearm stays one continuous bracer through the heavy cut.
  - **Known defect:** in the forehand, the jagged open end behind the elbow shows at the bottom of the screen. Codex's raised grip brings it into view; Gemini judged it off-screen. It needs a geometry fix from Gemini or Codex.
- `lightning-arrival-side.jpg`: tick-stepped side view of the kneel, the rise through Guard, and the stance. The lightning flash hides most of the kneel.
- `lightning-faceplant-gag.jpg`: the gag forced on, from the left: down on his face, then pop-up, then stance.

The audits match Codex's baseline exactly: chain sync, sword loop and `fp-sword-audit`. The blade path and contact accuracy are unchanged, because the patch keeps the sword socket fixed.

## Round two (Gemini's fixes, 2026-11-23)

The request is in `GEMINI_PROMPT_ROUND_2.md`.

**What came back**
- **First-person model:** `Arm.R` now has a capped, closed upper sleeve; nothing else in the model changed.
- **Five clips**, every core bone keyed:
  - the four white-flag clips;
  - the flat-on-back gag.

Checked with the skinned-mesh floor measurement in `scripts/lib/glbSkin.mjs`, for comparison with Codex's live clips. Those already sink their boots about 17 cm in the slams and 25 cm in Death:
- **White-flag clips:** the sword rests on the ground (+2.5 cm). Only the boots dip: 12 cm while crouching to set the sword down, 3 cm in the parry. The idle loop is clean.
- **Flat-on-back gag:** the arm and sword now stay above the floor. The breastplate dips 21 cm in the kip-up, but the arrival's dust hides it.
- **Gemini's clips:** their key times carry no glTF `min`/`max`. `transplant-spellblade-clips.mjs` now derives the missing ranges from the key data.

**Wired into the game**
- **White-flag defeat**, cosmetic, about one defeat in five (a first guess). It's decided as he falls, from the player and the moment of the defeat, so every client agrees.
  - He throws the sword down at once: the draw plays at double speed, sword down at about 0.27 s, flag up by 0.8 s.
  - Then he stays on his feet until respawn. He faces the nearest living enemy within 4 m (never a teammate), swishes at it, and meets its swings with the flag's parry.
  - Nothing is server-side: a defeated knight already has no hitbox.
- **Lightning arrival gag:** when it fires, it is the faceplant or the flat-on-back kip-up, evenly.

**Evidence**
- `white-flag-defeat-front.jpg` / `white-flag-defeat-side.jpg`: in the yard against a MELEE dummy, through the game's own `killPlayer`. He crouches and lays the sword down, then holds the flag en garde and swishes at the dummy.
- `lightning-flat-on-back-gag.jpg`: flat on his back in the dust, then the kip-up, then standing.
- `fp-round2-right-arm-capped-left-arm-open.jpg`: the right arm's cap holds. The dark spikes still at the bottom belong to **Arm.L**, Codex's untouched left (magic-hand) arm. It has the same open rear end, seen when it reaches across for the two-handed heavy cut. That's a defect older than this salvage, and the next request to Gemini.

## Round three: the left arm, and the Armory's clipping

**Left arm.** Gemini capped `Arm.L`'s open rear end the same way (`spellblade-fp-coaxial-both-capped`, SHA256 `19f161e8…`). Only `Arm.L` changed. In `fp-chain-both-arms-capped.jpg`, both sleeves read as solid armour through the two-handed heavy cut.

**Armory showcases.** The blade-through-armour audit (skinned meshes at 30 fps; Codex's ordinary clips score 0) found all six Armory showcase clips driving the sword 30–35 cm into the ground and through the right boot. Those clips were carried over from Gemini's v11. Fireball did it on 9 of its 46 frames.

`transplant-spellblade-clips.mjs --restage-sword-arm Idle` re-keys only the right arm, fingers, sword socket and sword of those clips from Codex's Idle carry. The body, legs and spell hand perform exactly as authored.

Result:
- 0 frames through armour in all six;
- the blade stays 7–27 cm above the ground;
- the model is 12.39 MB, under its 12.5 MB soft target.

Before (top) and after are in `armory-showcase-before-after.jpg`, for Fireball and Gale.

## The flag in his hand, facing his victor, and the Armory lean

**Flag grip.** The white flag is skinned rigidly to `hand.L`, but its pole ran 14 cm from his fist. `--seat-prop WhiteFlagProp` finds the pole's axis from its butt ring and moves the whole prop once, in the hand's own frame. The pole now passes through the hollow of his curled fingers, 12 cm up from the butt: 0.0 cm off the axis in every white-flag clip. See `white-flag-grip-closeup.jpg`.

**Facing his victor.** The server now records who felled a knight (`defeatedBy`, set in `killPlayer`, cleared on respawn) and sends it only while he's down.
- The white-flag knight turns to face that knight within 12 m. He only swishes and parries within 4 m; otherwise he falls back to the nearest enemy.
- The turn is paced by the server clock, like the rest of his pose.
- Measured in the yard with the dummy 76° to his side: 34° off at 0.13 s, 4° at 0.4 s, 0° by 0.8 s.

**Armory lean.** Each spell showcase now either carries the sword at his hip (the clean clips) or, half the time, leans on it. In the lean, his hand rests on the pommel at mid-chest and the blade tips 20° forward, its point planted ahead of his right foot.
- It's eased in as the showcase opens and out before it ends.
- Measured in the menu: the point rests 0–4 cm above the ground, clear of the boot.
- See `armory-carry-vs-lean.jpg`: Fireball carry, Fireball lean, Steel carry, Steel lean.
