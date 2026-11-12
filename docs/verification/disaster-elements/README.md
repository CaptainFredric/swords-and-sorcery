# All-Natural Disaster: elemental completion, Steel and the supplemental specification

What was verified, how, and what was not. The rules themselves are in [`docs/ideas/all-natural-disaster-live-effects.md`](../../ideas/all-natural-disaster-live-effects.md).

## Verdict

The rules of both briefs are in the shared room (the code the server and the local Practice host both run) and are held by tests that drive that room. The animation and effects were looked at in a real Chrome on the real client, on a desktop layout and an emulated landscape phone. Three things are not proven: a real phone, how any of it sounds, and how the fully infused blow balances against the other ultimates in real matches.

## Requirement by requirement

`server/tests/disaster-elements.test.mjs` unless another file is named. All of it runs the real room.

| # | Supplemental requirement | Held by |
| --- | --- | --- |
| 1 | The ordinary 40 Guard stamina for a guarded decisive strike | "a Guard pays its ordinary 40 whatever the blow carries" (four infusion sets, one `block` each) |
| 2 | No Steel-specific Guard stamina | the same test; "Half Steel: +2, interrupts the struck…" (struck knight and fracture victim both keep 100) |
| 3 | The decisive hit before Shaken and before the field | "order: impact and Guard, the one decisive hit, then Shaken…" (reads the struck knight at the instant the damage event is written) |
| 4 | Later HP damage in the field costs stamina by its strength, once | "the Shaken field: later HP damage inside it…" (20 HP at 60% costs 12; mitigated damage counts as taken; spawn-protected damage costs nothing); "two overlapping fields cost one Guard loss" |
| 5 | Half Fire's wider and taller contact | "Half Fire is reach, not burn" (4.2 m out and 3 m up are caught; 4 m up is not; the plain blow catches neither) |
| 6 | Half Fire applies no burn | the same test (no `burn` or ground-fire damage for 3 s after) |
| 7 | Full Fire's decaying ground, no duplicate burn | "Full Fire: burning ground at a ground-supported impact…" |
| 8 | Fire's contact carries every infusion once | "Fire's wider contact carries every other infusion, once" (a knight only the blast reaches gets 85 and each status event exactly once) |
| 9 | Gale with Full Fire leaves the struck in the fire | "Gale with Fire: the shove is by where they stood…" (rest within 4.6 m + 0.4 for five distances and both Gale stages; Gale alone throws clear; a ledge is still a ledge) |
| 10 | Half Frost's 0.3 s | "Half Frost: the decisive contact stays open 0.3 s…" (caught at 0.2 s, not at 0.45 s, not without Frost) |
| 11 | No repeated decisive damage | the same test; "all 243 infusion combinations"; "a fully infused wave" |
| 12 | Flash Freeze without Interrupted | "Flash Freeze holds; it does not interrupt" and "Flash Freeze holds a sword chain where it was" |
| 13 | Field lifetimes 4.0 to 5.5 s | "field lifetimes: four seconds and 0.3 more for each distinct element" |
| 14 | Grounded and aerial mixed infusions | "all 243 infusion combinations" (ground); "aerial: Half Fire widens the wave…"; "a fully infused wave"; `server/tests/one-hit-live.test.mjs` |
| 15 | Full Steel cooldown restart and bounded protection | "Full Steel: more arms; the struck knight's Skills all start cooling again"; "Full Steel: HP cannot fall below 1 during the attack"; "…the held Lightning aim gives no protection" |
| 16 | Effects match contact and decay | the recordings below; each run's JSON lists the room's events beside what the effects had on screen |

From the first brief: Shocking Conduct reads the attacker ("Shocking Conduct shocks the SHOCKED knight who swings…"). On `main` a healthy knight who struck a shocked one was shocked for it (89.2 HP after one swing, the shocked knight untouched); that is fixed. Also held: missed swings, the gauntlet, field transfer by strength and contact, no top-up, line of sight and terrain, Blustered's facing, the defensive wind against a real Fireball at point blank and at range, Steel earning and its plate, the radial fracture stopping at a pillar, the aerial teleport staying over the world, Practice presets, and two real sockets seeing the same blow, field and statuses (`server/tests/one-hit-live-network.test.mjs`).

The authored clips: `client/game/spellbladeAnimationPlan.test.mjs` loads the shipped `spellblade.glb`, finds the frame in which each slam's blade reaches the floor, and holds the planner to showing that frame at the commit.

`npm test` on this branch: 2901 tests, 2901 pass (Node 24).

## Recordings

Real game server, real Chrome with the GPU, the Practice inspection yard, the ultimate pressed through the real input (the R key; the ULTIMATE touch button on the phone). Desktop is the player's own view beside a fixed camera over the yard. Each name links a sheet of stills at fixed moments round the room's commit; the `.json` beside it has the room's events and what the body and the effects were doing. The videos themselves are on the [evidence branch](https://github.com/CaptainFredric/swords-and-sorcery/tree/evidence/disaster-elements-20261111) (70 MB, kept out of this branch).

| Recording | What it shows | Authored clips played | Decisive damage | Video |
| --- | --- | --- | --- | --- |
| [desktop-simple](desktop-simple-moments.jpg) | No infusions: the plain 46. | Ground_DualSpin_Slam | 46 (1 struck) | 58 fps, 321 frames |
| [desktop-fire1-multi](desktop-fire1-multi-moments.jpg) | Half Fire, four dummies: the wider blast catches all four, once each; nothing burns afterward. | Ground_DualSpin_Slam | 59, 59, 59, 59 (4 struck) | 59 fps, 329 frames |
| [desktop-fire2-gale1-frost2-multi](desktop-fire2-gale1-frost2-multi-moments.jpg) | Fire + Gale + Frost, four dummies: blast, Flash Freeze, shove by position, burning ground and ice field decaying over 4.9 s. | Ground_DualSpin_Slam | 71, 71, 71, 71 (4 struck) | 60 fps, 422 frames |
| [desktop-frost1-latecomer](desktop-frost1-latecomer-moments.jpg) | Half Frost: a second dummy stood inside the blow 0.125 s after it lands is caught by the same blow. | Ground_DualSpin_Slam | 57, 57 (2 struck) | 60 fps, 331 frames |
| [desktop-gale1-deflect](desktop-gale1-deflect-moments.jpg) | Half Gale: a real enemy Fireball turned aside by the wind of the wind-up. | Ground_DualSpin_Slam | 47 (1 struck) | 60 fps, 333 frames |
| [desktop-lightning2-field-walk-in](desktop-lightning2-field-walk-in-moments.jpg) | Full Lightning: held aim, teleport, arrival slam; a dummy stood in the electrical field a second later takes Conduct from it. | Lightning_Charge_Ground → Lightning_Arrival_Slam | - | 60 fps, 504 frames |
| [desktop-conduct-discharge](desktop-conduct-discharge-moments.jpg) | Shocking Conduct discharging into the knight who swings (status staged on the player; the swing is the real mouse button). | Slash_1 → Slash_1 | - | 58 fps, 321 frames |
| [desktop-steel1-multi](desktop-steel1-multi-moments.jpg) | Half Steel: eight-armed radial fracture; struck interrupted. | Ground_DualSpin_Slam | 48, 48 (2 struck) | 60 fps, 331 frames |
| [desktop-steel2-multi](desktop-steel2-multi-moments.jpg) | Full Steel: twelve arms, more stone; cooldowns restarted. | Ground_DualSpin_Slam | 48, 48 (2 struck) | 60 fps, 332 frames |
| [desktop-all-full-multi](desktop-all-full-multi-moments.jpg) | All five Full, three dummies: 85 each, once. | Lightning_Charge_Ground → Lightning_Arrival_Slam | 85, 85, 85 (3 struck) | 47 fps, 362 frames |
| [desktop-gale2-aerial-wave](desktop-gale2-aerial-wave-moments.jpg) | Gale only, aerial: vortex clip, one pale wave. | Lightning_Charge_Air → Aerial_Vortex_Wave | - | 46 fps, 254 frames |
| [desktop-gale2-steel1-aerial-wave](desktop-gale2-steel1-aerial-wave-moments.jpg) | Gale + Steel, aerial: the same wave, denser and grey. | Lightning_Charge_Air → Aerial_Vortex_Wave | - | 60 fps, 334 frames |
| [desktop-all-full-aerial-wave](desktop-all-full-aerial-wave-moments.jpg) | Fully infused wave out of a 3D teleport: one decisive hit, every status, burning ground where it ended. | Lightning_Charge_Air → Aerial_Vortex_Wave | 63 (1 struck) | 60 fps, 464 frames |
| [desktop-lightning2-gale2-air-hold](desktop-lightning2-gale2-air-hold-moments.jpg) | Held charge in the air (Full Gale + Full Lightning), 2.2 s, then teleport and wave. | Lightning_Charge_Air → Aerial_Vortex_Wave | - | 60 fps, 462 frames |
| [phone-all-full-multi](phone-all-full-multi-moments.jpg) | Emulated phone, real ULTIMATE touch button: all five Full, three dummies. | Lightning_Charge_Ground → Lightning_Arrival_Slam | 85, 85, 85 (3 struck) | 55 fps, 433 frames |
| [phone-fire2-gale1-frost2-multi](phone-fire2-gale1-frost2-multi-moments.jpg) | Emulated phone: Fire + Gale + Frost, four dummies. | Ground_DualSpin_Slam | 71, 71, 71, 71 (4 struck) | 59 fps, 423 frames |
| [phone-all-full-aerial-wave](phone-all-full-aerial-wave-moments.jpg) | Emulated phone: fully infused wave. | Lightning_Charge_Air → Aerial_Vortex_Wave | 66 (1 struck) | 60 fps, 469 frames |
| [phone-lightning2-ground-hold](phone-lightning2-ground-hold-moments.jpg) | Emulated phone: held charge on the ground (Full Lightning), 2 s, then teleport and arrival slam. | Lightning_Charge_Ground → Lightning_Arrival_Slam | - | 60 fps, 450 frames |
| [before-desktop-fire2-gale1-frost2-multi](before-desktop-fire2-gale1-frost2-multi-moments.jpg) | main before this branch, same stages and dummies, for comparison. | Slash_3 | 78, 78, 78, 78 (4 struck) | 60 fps, 422 frames |
| [before-desktop-gale2-aerial-wave](before-desktop-gale2-aerial-wave-moments.jpg) | main before this branch: the aerial form. | Slash_3 | - | 58 fps, 324 frames |

Frame counts were read out of the files (`scripts/webm-frames.py`), not taken from the recorder's settings.

Two things about how they were made:

- The yard keeps one Training Dummy. For blows with several victims the script puts more passive dummies into the local room. A player cannot do that; it is a staging device.
- The first recordings came out at 5 to 15 frames a second: the in-page encoder could not keep up with the full split-view canvas. They are now recorded through a smaller copy. The canvas is what is recorded, so the phone's touch buttons are not in the picture although they are what was pressed.

A few of the single-element runs were recorded before the last change to the look of the fire (more flame on burning ground, smoke thinned near the viewer). Nothing about contact or timing changed after any recording.

## Decisions that were mine, and why

- **Steel's +2.** "The least a qualifying Steel Dash contact deals" is read as a ram at the weakest plate that still makes one: `ramEffect(STEEL_RAM.minStrength).damage`, which is 2. The other candidate is the Steel damage table's ram minimum, 6. It is one line to change.
- **Who earns Steel.** Only a knight carrying the Disaster earns a stage or the longer plate. Otherwise every Steel user's plate would last to its cooldown for no reason they could see.
- **Held aim.** A Full Lightning aim can be held for ever, so it gives no 1 HP floor at all, and Half Gale's wind and Half Steel's bracing last an ordinary wind-up's length of it and no more.
- **Full Fire's licks.** They fall from 3 to 1 as the fire dies, because every field is to decay across its life. That is less total damage than the old flat 3, not more. If the flat 3 is wanted for the whole (now longer) life, it is one function.
- **Gale's shove.** It was 0.35 m longer than the plain blow's, which no one could see. It is now about 1.8 m. With Fire it is scaled by where the knight stood, down to a tenth at the edge.
- **The wave's end.** With Fire it is now the decisive contact for a knight the wave had not met. That replaces the older rule that the landing splash never deals HP, which still holds without Fire.
- **Flash Freeze and input.** A press made while frozen is refused, not queued. A Guard already up stays up.
- **The clips.** They are Argon's as delivered. Each slam drives the blade well below the floor and the ground spins carry it under the floor; an earlier review flagged this ([refinement-v-combat-acceptance.md](../refinement-v-combat-acceptance.md)). They are used because the brief asks for them and they read far better than `Slash_3`: contact is timed to the frame the blade reaches the floor, and stone and sparks are thrown where the blade really is. Stopping the edge at the floor is a change to the clips.

## Not verified

- **A real phone.** The phone recordings are Chrome's device emulation. Touch input and layout are exercised; a phone's GPU, frame rate and thumbs are not.
- **Sound.** The anvil strike and the shock sounds are built from the game's own recipe layers and play on the right events. I cannot hear them.
- **Balance.** The numbers follow the contract. Acquisition rates and outcomes against Sunder, Chivalry and Vortex in real matches were not measured, and nothing was tuned down for being strong.
- **Bots.** They carry and use the Disaster as before. They were not taught anything about fields or statuses.
- **First person.** The Disaster is seen in its third-person reveal. There are no first-person Disaster clips; the first-person brace no longer throws an exception in its last fifth (it did on `main`), which is all that changed there.
- **An infusion meter.** Earning a stage and receiving a status are announced on the HUD as they happen. There is still no standing display of the five tracks in a match.
