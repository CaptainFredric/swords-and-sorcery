# Castleward heralds — artwork, language, and challenge design

This is the **creative-design and challenge-revision register**, not a declaration that every design is shipped.
Keep three things distinct: (1) the authored emblem and its flavor, (2) the proposed/approved challenge rules, and (3) the rules the authoritative simulation *currently awards*. Do **not** alter the live challenge description without implementing its new award logic and tests in the same PR.

**Gameplay sources of truth:** `shared/src/heraldry.mjs`, `shared/src/challenges.mjs`, `shared/sim/challenges.mjs`, relevant server tests and profile settlement. A design appearing here does not automatically become selectable.

**Visual language:** cream/pale-gold silhouettes on deep crimson cloth, bold angular forms, clean negative space, stepped banner hem, legible at gameplay distance; the precise physical interaction matters more than tiny decorative detail. The **approved Grimoirelee** sword-and-open-grimoire is Castleward's official institutional insignia: default front tabard, default back banner, menu crest and world standards. Earned heraldry still replaces only the *personal back* emblem and is never lost by this branding update.

## Design and implementation inventory

| Herald | Artwork and narrative | Challenge state |
| --- | --- | --- |
| **Seize Thy Slayer** | Armored gauntlet grips a sword **by its exposed blade**, with flames at the grip. Flavor: **“Leverage comes with an edge.”** | **Live under older condition.** Replacement below is a *revision pending gameplay implementation*, not currently awardable by those new rules. |
| **St. Perry the Plain** | Perry's helmet and askew halo, cleaved by a blade. Flavor: **“I suppose anyone can become a saint... these days.”** | **Live**; preserve existing Canonization/no-HP-damage award rules. |
| **Mutual Mortality** | A shield **uppercuts the jaw off hooded Death**, while Death's scythe simultaneously threatens the knight's head/neck. Flavor: **“One of us won't recover.”** | **Unavailable preview**; code currently contains a tentative full-health melee/DoT-death-within-one-second condition. This is *not* an approved final condition. |
| **Strike While Hot!** | A thrown sword spins through a Fireball, **cleaving it into two distinct halves**. Flavor: **“THIS was now planned!”** | **Concept only**; unlock condition not selected. |
| **No Rock, No Paper, All Scissors** | Wing, broken sword and arrow in a closed cycle of mutual destruction. Flavor: **“Flee, Fly, Foe, Fall...”** | **Concept only**; updated proposed three-part Fight-and-Flight challenge below. |

## 1. Seize Thy Slayer — revised unlock proposal

**Keep the already-authored emblem and final flavor text unchanged.** Its significance is that the hand deliberately takes hold of the dangerous **blade**, *not* the hilt. The flame belongs to a magic-capable Spellblade who chooses an immediately dangerous sword response rather than using sorcery to finish the opponent.

### Replacement gameplay condition (approved creative direction; NOT yet the live rule)

> Defeat an enemy Spellblade with a genuine sword hit while that same opponent has committed to an imminent attack that would have struck and killed you if it had resolved first. At that decisive moment, a castable damaging spell capable of finishing the opponent was available, but you chose the sword instead, without Guarding or Dashing away from the threat.

- **Remove** the old full-100%-health-to-zero, entire-duel-sword-only and never-Guard-throughout-the-duel constraints. They distract from the decisive interaction. Earlier ordinary Guard or other legal attacks need not invalidate the achievement.
- **Keep** the distinction between human opponents (eligible) and bots (only **Spellblade**, highest difficulty).
- **Require** a real finishing sword contact and real enemy attack commitment; do not count merely being near an enemy with an attack animation or one swinging at empty air. The relevant attack must have a credible collision trajectory, valid target, contact window and unmitigated obstruction/armor results sufficient to take the current player's HP to zero.
- **Evaluate** the threat while both combatants are alive and before the player's finishing hit ends the opponent's attack. Take authoritative position, orientation, elevation, active strike sweep, geometry, occlusion, protection, and effective damage into account. A completed enemy strike that already missed or was stopped by terrain is **not** an imminent lethal threat.
- **Record** the decision at the qualifying final sword exchange, not by checking arbitrary historic Guard/Dash flags. Guard must not be active against that attack; no Dash may be used to escape that attack; the spell must truly be castable and sufficiently strong at the decision point. Merely owning a spell on cooldown does not qualify.
- **Do not pretend** a shallow distance/facing test proves that an attack would have hit. If the existing engine cannot determine the counterfactual reliably, retain the old live award rule while implementing and testing an explicit authoritative threat-proof fact before switching the challenge.
- Preserve persistent unlocks and existing claimants when changing the rule; never revoke heralds already earned.
- Test a genuinely lethal close strike interrupted by the player's sword; a nonlethal strike; attacking empty space; distant attack; obstruction; late/missed/expired swing; different enemy; inactive/no spell; insufficient nominal spell damage; player Guard/Dash; valid previous Guard earlier in the fight; other prior damage; Steel mitigation and other real defensive states; duplicate/late challenge facts; bot difficulties and multiplayer settlement.

**Why:** the emblem depicts *seizing danger instead of avoiding it*. The name calls the attacking enemy a prospective slayer, not a harmless target. “Leverage comes with an edge” describes both the enemy's exposed commitment and the lethal risk of remaining within reach.

### Existing live behavior — do not mislabel

At the time of this documentation, `shared/src/challenges.mjs` and `shared/sim/challenges.mjs` still award Seize Thy Slayer for taking an enemy from full health to defeat using only sword damage, never guarding, and declining a lethal available spell on the finishing strike. Replacing only the prose in `shared/src/challenges.mjs` would lie to players. The actual revision requires a separately reviewable combat-logic implementation plus regression tests.

## 2. No Rock, No Paper, All Scissors — Fight-and-Flight

### Exact emblem interaction

A **wing breaks a sword near the hilt** (so the attack approaches the bearer and breaches the protective zone). The **broken sword hits an already-loosed arrow's shaft**, not its arrowhead (so the arrowhead and consequential forward motion survive the attempt to stop it). The **arrowhead pierces the wing near its root/shoulder**, threatening the part necessary to retain lift.

These details explain *where* each strike lands. At banner distance the first reading must still be an immediately legible cycle: **wing breaks sword → sword breaks arrow → arrow pierces wing**. Don't resort to tiny labels, elaborate feathers, visually fused lines, or post-hoc symbolism. At close range, the attack placement adds the second reading.

**Title:** No Rock, No Paper, All Scissors

**Flavor:** “Flee, Fly, Foe, Fall...”

The flavor is a deliberate *Fee-fi-fo-fum* transformation and connects to the machine's **fight-or-flight → Fight-and-Flight** inversion. The rock-paper-scissors title alludes to a competitive cycle of counters turned into all-out weaponry; it is not a claim that the objects literally resemble scissors.

### Updated proposed achievement

> During one uninterrupted operation of the **same Fight-and-Flight machine**, defeat an opposing Spellblade by a real close-range sword-rotor contact, subsequently have that rotor destroyed by an enemy Spellblade, then defeat the rotor-destroying Spellblade using the repeating crossbow with a bolt fired **after the rotor broke**.

Acceptance details:

1. First kill is credited to actual rotor contact, not the operator's ordinary broadsword, a repeater bolt, fall damage, or a collision from an unrelated machine.
2. Rotor destruction must be attributed to a particular enemy Spellblade. Damage to the main chassis, a brace, or environmental loss alone does not count.
3. The finishing repeater bolt must **originate after rotor destruction**, so a previously launched projectile landing afterward does not accidentally satisfy the challenge. Its actual combat kill credit belongs to the same operator, and victim identity is the enemy who destroyed the rotor.
4. The same machine lifecycle and operator must remain in play; no dismount/operator swap to complete the sequence. Retaliation may be during the fall or after landing, while the surviving chassis still supports the repeater.
5. No self-inflicted death or DoT-death requirement, no mandatory Dash and no artificial short retaliation timer. The rotor-killed foe may respawn and later be the rotor destroyer; distinct first/second enemy IDs are **not** mandatory.
6. Handle machine destruction, retirement, operator death, match reset, bot/human attribution, stale projectiles and machine recreation without leaking progress across sorties.

**Art versus reward:** The three-object **default machine herald concept** has been accepted in design, but its finished emblem art has not been supplied. A special **earned variant** for this exceptionally difficult sequence is a recommendation, not yet an approved separate artwork. Do not promise or fabricate an approved final texture. Keep the crimson cloth and replaceable emblem asset.

The intended post-rotor repeater is not hypothetical: `shared/sim/fightFlightWeapons.mjs` allows a living mounted operator to fire while the main apparatus survives; `shared/sim/fightFlightComponents.mjs` distinguishes rotor destruction from destruction of the whole machine.

## 3. Strike While Hot! — spinning sword versus Fireball

**Artwork:** A thrown sword visibly rotates through the fireball's path and **splits the Fireball into two separated bodies**. The spinning trajectory and resulting separation must read as one decisive interception, not a stationary sword overlaid on a flame.

**Name:** Strike While Hot! — physicalizes “strike while the iron is hot” and its opportunity/timing meaning.

**Flavor:** “THIS was now planned!” — the odd placement of **now** is essential. It characterizes a Spellblade retroactively claiming a dangerous improvisation was part of his plan. Do not “correct” it to “This was planned!”

**Status:** Concept, not deployed. The exact unlock rule is **undecided**. In particular, do not add an interception challenge until sword-versus-Fireball mechanics and attribution genuinely support it. This is a dramatic event **depicted in a herald**, not automatically a requirement to animate the texture.

## 4. Mutual Mortality — simultaneous mortal threat

**Artwork:** An upward-moving shield physically detaches the lower jaw from hooded Death's skull. Death must still be dangerous: the scythe must curl around and threaten the knight's exposed helmet/neck. Use a minimal knight helmet, one armored arm and a shield; full figures produce an unreadable tangle. The hood's eye sockets stay deeply shadowed, with the jaw clearly separated from the skull. Both attacks must be in progress **at the same time**.

**Flavor:** “One of us won't recover.” This leaves the threatened subject unresolved; the image does not declare an easy conquest of Death.

**Status:** The unavailable challenge preview in code is a **working draft** involving a melee kill of a full-health enemy while the player's active damage-over-time kills them within one second. Do not represent that preview as final authorial approval or enable it without final condition, approved art and tests.

## 5. St. Perry the Plain — existing earned herald

**Art:** Perry's helmet and crooked halo cut by a sword; plainness undercuts the opponent's claimed prodigious sanctity.

**Flavor:** “I suppose anyone can become a saint... these days.”

**Live unlock:** Defeat St. Perry the Prodigious in Canonization from full 100 HP to 0 without taking **any HP damage during the player's current life**. Guard stamina loss is allowed; ordinary healing does not erase damage history. Keep this rule and art unchanged.

## Rule for future herald authors

A strong Castleward herald need not be a static fantasy noun (sword, dragon, skull). The best designs **depict a specific, physically plausible action**, often one that inverts the object’s normal role: shield as an uppercut, a gauntlet holding a blade, a sword cutting a spell, or mutually destructive weapon contacts. Titles and flavor should contribute a **different** layer—wordplay, character, or consequences—without merely explaining the picture. Reject “symbolic” claims unsupported by anything visible.

**Review checklist:** clear first-glance silhouette at small size; action and contact point physically legible; meaningful detail at large size; consistent crimson/cream heraldic art direction; no unapproved invented unlocks; authoritative proof before player-facing achievement claims; all earned rewards persist correctly in multiplayer and solo.

## Official Grimoirelee source and compatibility (November 2026)

- Approved reference: the supplied 1024×1024 crimson-and-gold Grimoirelee artwork. Treat its silhouette, diagonal scars, central blade groove, open-book crossguard and bookmark as immutable art direction.
- Production **editable master**: `client/assets/heraldry/grimoirelee.svg` (faithful traced contours and even-odd negative spaces). `grimoirelee-app-icon.svg` and `grimoirelee-standard.svg` reuse exactly those contours. Existing character portrait app images are intentionally retained as character portraits/fallbacks.
- In-game default cloth: `client/game/grimoireleeCloth.mjs` remaps the approved image into the original UV atlas at runtime without moving rigs or changing earned textures. The Blender kit and Rodin emblem source scripts use the same SVG for future asset promotions. Rebuilding GLBs is **not required** for the runtime replacement.
- Save/network policy: `trident` is a **legacy identifier** which resolves to `grimoirelee` when read or selected. It is not offered as another Armory choice. Earned emblem IDs, challenge completion records, unlock checks, and selected personal heralds retain their original meaning. Do not bulk-delete or rename saved profile fields.
- Rebuild verification: inspect third-person front and rear cloth, dye variations and earned swaps in the actual browser and check mobile menus/world banners before merging. Older baked GLBs may contain the old art internally, which the runtime overlay must conceal.
