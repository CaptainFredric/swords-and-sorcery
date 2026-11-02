# Castleward heraldry — authored designs and challenge contracts

This is a **design register**, not an assertion that every entry is shipped. It preserves the intended composition, flavor text, gameplay meaning, and actual implementation status. Do not silently promote a proposal into the live unlock catalog or replace finished art with invented substitutes.

## Display rules

- Castleward's **Trident** remains the current default world/banner mark. Player-earned emblems appear on back banners and Armory cards where legible; do not erase the trident on the front tabard, small military standards, or world scenery as a side effect.
- A strong herald reads first as a **physical interaction**, then rewards closer inspection. The exact contact point matters; arbitrary hidden symbolism does not.
- Use broad pale-cream/gold shapes on deep crimson cloth, with legible negative space and a stepped hem. Detail can be greater in a challenge card than on a moving cape.
- An author's conceptual approval is **not** approval of a particular rendered PNG/SVG, unlock implementation, or deployment.

## 1. Seize Thy Slayer — implemented herald; revised challenge

**Flavor:** “Leverage comes with an edge.”

**Art:** A gauntleted hand **grips the exposed sword blade, not the hilt**; flames around the hand. The dangerous grip is the signature interaction, not a conventional knight holding a sword.

**Meaning:** An enemy's committed killing blow creates an opening. The knight declines defense, escape, and available sorcery, seizing the initiative by attacking with his own sword. The blade's edge is both advantage and mortal risk.

**Revised challenge:** Defeat an enemy Spellblade with a sword contact **while that very opponent has an imminent, geometrically credible, unguarded attack that would otherwise kill you**. At the decisive strike, the player must be able to cast a damaging spell that could finish the opponent but chooses the sword instead; the player is not Guarding or Dashing. No full-health-to-zero sword-only duel requirement, and earlier Guard use does not spoil the feat. Human players count; bots count only at the highest **Spellblade** difficulty.

**Engineering:** Never award from a generic “enemy is attacking” animation flag. Record a server-owned snapshot of the impending lethal contact before killing/interruption invalidates the opponent's attack. Check authoritative blade/attack geometry, walls, effective damage after mitigation and real timing, without trusting a client claim. Guard/Dash refusal is the decision made at that dangerous moment, not a prohibition on all prior guarding. For other incoming damage types, implement their own corresponding real-contact prediction before claiming coverage. The previous challenge was a 100-to-0, no-Guard, sword-only duel and must not remain in conflict with revised live metadata.

**State:** Emblem and original challenge shipped; this revision requires updated authoritative challenge logic and tests.

## 2. Mutual Mortality — preview, NOT finalized/art-approved

**Flavor:** “One of us won't recover.”

**Art:** An armored knight's shield **uppercuts Death's jaw completely loose**, while Death's scythe simultaneously hooks toward the knight's vulnerable helm/neck. Keep a minimal helmet cue so the scythe can endanger an actual person rather than merely a floating forearm. Death is hooded with dark eye sockets, detached jaw clearly airborne; neither fighter is an unquestionable victor.

**Meaning:** The shield, conventionally defensive, becomes an attack; harming Death does not remove Death's ability to kill. The jaw and scythe must be part of one coherent encounter, not overlapping icons without physical causality.

**Challenge:** **Not finalized.** An earlier unavailable authoring preview describes a melee-only defeat of a previously full-health foe while suffering damage-over-time that kills the player within one second. This is provisional, **not** a live unlock, and must not be silently replaced, activated, or advertised as the final requirement.

**State:** Unavailable challenge/herald preview, with previous concept-art iterations. Final illustration still needs visual approval.

## 3. Strike While Hot! — proposed herald, not implemented

**Flavor:** “THIS was now planned!”

**Art:** A **thrown sword spinning fast**, caught during a dynamic flight-path sweep as it **cleaves a Fireball into two visibly separated halves**. The separation should be unmistakable; a sword resting decoratively over one ball of flame fails the idea. Rotational movement may be conveyed with restrained motion marks. This is a dynamic **scene depicted as heraldry**, not automatically an animated asset.

**Meaning:** “Strike while the iron is hot” becomes physically literal; the Spellblade's retroactive declaration that this was “now planned” reveals his self-serving relationship with improvisation.

**Earlier working title:** “I'll Show You Spellblade!”

**Challenge:** Undecided. Do not promise a sword-versus-Fireball interception unlock unless actual authoritative combat supports it.

**State:** Concept only; no approved art or unlock code.

## 4. No Rock, No Paper, All Scissors — Fight-and-Flight default herald concept

**Flavor:** “Flee, Fly, Foe, Fall...”

**Art:** Three elements form a **closed cycle of mutual damage**:
1. A **wing** breaks the **sword near its hilt/guard**, threatening the bearer beyond the supposed protection of their weapon.
2. The broken sword strikes a **loosed arrow on its shaft, not its arrowhead**, too late to reliably negate its forward momentum.
3. The intact arrowhead **pierces the wing at its shoulder/root**, a consequential load-bearing point rather than an ornamental feather.

The negative-space layout must communicate three distinct objects and three distinct contacts even on a moving crimson cape. Avoid turning the device into a knot requiring explanatory labels. The wing represents flying/rotor mobility; sword represents melee; arrow represents the repeater. These are grounded visual correspondences, not claims that a specific feather symbolizes an unrelated abstract idea.

**Title:** All-scissors plays on rock-paper-scissors, replacing balanced options with a cycle in which all parties remain dangerous. Earlier candidates: “No Good Sides” and “All Around the Front.”

**Flavor-text references:** Reshapes **“Fee-fi-fo-fum”** into a four-beat miniature battle and uses the distinction between **fight or flight** and the machine's insistence on doing both.

**Revised proposed challenge:** During one uninterrupted operation of the **same Fight-and-Flight machine**:
1. Defeat an enemy Spellblade by a **real close-range sword-rotor contact** (not an ordinary sword, chassis bump, or unrelated damage).
2. Have the rotor **destroyed by an identifiable enemy Spellblade**; no environmental or uncredited damage.
3. After rotor destruction, **fire the machine's repeating crossbow** and defeat **that rotor-destroying Spellblade**, whether the machine is falling or has landed, without abandoning the apparatus.

The first rotor victim may be different from the rotor destroyer, but need not be: the same opponent's later revenge and second defeat should count if actual respawn/lifecycle rules permit. The final lethal bolt must be **released after** rotor destruction, not merely impact afterward. Do not require Dash or player death. Do not introduce an arbitrary short final timer. The common machine ID, operator identity, causal attribution, and kill attribution must be server-authoritative.

**Art vs. unlock:** The emblem is approved as the **default Fight-and-Flight insignia concept**, but final artwork has **not** been supplied or approved. The unusually specific challenge may instead earn a distinguished **variant** of the emblem rather than hiding its default identity behind an extremely rare unlock. Neither reward assignment nor unlock implementation is finalized.

**State:** Proposed. Do not create placeholder art and label it approved.

## 5. St. Perry the Plain — implemented

**Flavor:** “I suppose anyone can become a saint... these days.”

**Art:** St. Perry's helmet with an **askew halo**, cleaved by a blade. It commemorates the self-important parrying opponent's defeat rather than his glory.

**Existing challenge:** Defeat **St. Perry the Prodigious in Canonization** from 100 HP to zero, while taking **no HP damage during the player's current life**. Guard stamina damage is allowed; healing does not erase prior HP loss. See the implementation for the exact authoritative tracking.

**State:** Shipped, not part of this rules revision.

---

## Related identity concepts — not yet heralds

Two potential replacements for the **Swords & Sorcery title/logo mark**, not approved heralds:
- An upright sword blade emerging from an **open tome** whose pages imply the hilt, with a hanging arcane-inscribed bookmark suggesting the missing handle/guard. Strong conceptual fusion; needs a simplified silhouette for small sizes.
- An upright sword with a **plus-sign-like crossguard/handle** and a **glowing fireball at its pommel/base**. Cleaner small-scale geometry, but the plus sign may read as medical or religious and the fireball risks becoming generic.

These are alternatives to the current trident *for branding consideration*, not permission to replace current world heraldry.

## Implementation checklist for any future challenge

- Preserve one authoritative source of truth across challenge text, tracked combat facts, profile award/persistence, Armory lock state, HUD, and tests.
- Record identity and causal attribution at the point of actual combat contact; never infer eligibility from voice/audio/rendering events.
- Test positive and negative cases: other attackers, guard/dash, weak or cooling spells, obscured attacks, late shots, invalid damage, bot difficulty, death/reboarding, and environmental damage.
- Keep unavailable concept heralds **unavailable** until their artwork, unlock contract, and runtime tests are approved.
