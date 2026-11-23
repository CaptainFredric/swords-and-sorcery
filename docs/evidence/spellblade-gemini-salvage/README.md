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
