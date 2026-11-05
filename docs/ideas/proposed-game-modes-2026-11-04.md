# Castleward — proposed game modes and the Rightful Renowner

**Recorded:** 2026-11-04  
**Status:** Creator-directed design archive and exploration, **not implemented gameplay, approved balance numbers, recorded voice, or a mandate to build every suggestion**. Distinguish the creator's direction below from optional design recommendations. Preserve the fast-paced 3D combat system rather than replacing it with elaborate cutscenes.

This record consolidates three recent proposals: **timed wave-based Renown Trials**, **a two-wall 5v5 siege with a sunset deadline** (provisionally called *Restless Day*), and **Edge of Victory**, a small battle royale with a shrinking psychological boundary. *Edge of Victory* is the creator-selected mode name; *Restless Day* remains provisional. References: [Renowner worldbuilding](renown-renowner-worldbuilding.md), [3D asset roadmap](../art/castleward-3d-asset-roadmap.md), and [existing Breakthrough objectives](../../shared/sim/objectives.mjs).

## Shared character premise: the Rightful Renowner

A grand, solemn knight statue atop a ceremonial stone-and-brass podium dispenses tiny coins of Renown. Its monumentality and apparent authority contrast with the unimpressive rewards. The institution's absurd verdicts are treated with total seriousness. The Renowner is **not** a cackling villain or a generic humanoid boss.

In the original ceremony concept, an ordinary award uses a sword-raising/dipping knighting movement and a modest coin dispenser. A fatal judgment drives the greatsword down, kills the applicant, then calmly dispenses a coin regardless. In another established scene, the Spellblade avoids the sword, celebrates, returns to bow for compensation, and is knocked unconscious by the unexpectedly high-velocity coin. Preserve the original character lines:

- **Spellblade:** “AHAHAHA! I have surpassed judgement”
- **Spellblade:** “I shall receive your compensation”

This same monument could play different roles in different modes: *ceremonial judge* in Renown Trials and *destructible, dangerous defended objective* in the two-wall siege. These are adaptations of one identity, not an obligation to give it every suggested capability everywhere.

**Asset caution:** The repository's existing creative/asset roadmap does not establish a shipped, integrated Renowner. Earlier recovery records identified a real six-clip game-ready GLB, with the ordinary ceremony and supporting poses, and requested separate clips `07_Judgment_Sword_Execution` and `08_Judgment_Evaded_Coin_Retaliation`. A later eight-clip build has been described, but its actual binary and integration must be inspected before treating those clips as available. Keep statue animation separate from the Spellblade's character rig.

## Mode A — timed wave survival / Renown Trials (working title)

### Creator's direction

- Fight successively harder **waves of enemy knights** using Castleward's normal, fast-paced 3D combat.
- Each wave has a **relatively strict trial time limit**. Good players should be capable of beating it consistently with effective fighting; the expectation is to finish **before** time runs out.
- Clearing the wave faster earns **more Renown**, calibrated to the wave's difficulty.
- Reaching the limit does **not** automatically end the fight. The Spellblade may persevere and finish in **overtime**.
- **Every second of overtime** raises the likelihood that the Rightful Renowner will issue an **execution verdict**. The odds of **no reward** and **one harmless consolation coin** slowly diminish as execution probability rises. Exact percentage curves have **not** been approved.
- Roll the verdict **once when the overdue wave is finally cleared**, using the accumulated overtime, rather than repeatedly executing random rolls every second while the player fights.
- The Renowner then judges the knight. If it selects execution, the **run ends automatically** in the ceremony. The point of player skill was to beat the clock, not to evade the selected judgment by another last-second input.
- An **execution verdict has two cinematic variations**:
  1. **Sword:** The Renowner raises its sword, stabs/strikes down lethally, returns to its resting posture, and dispenses a **single coin** to the fallen knight.
  2. **Coin retaliation:** The Spellblade sidesteps the sword, delivers “AHAHAHA! I have surpassed judgement”, returns near the front of the machine, bows, says “I shall receive your compensation”, and is knocked unconscious by the high-speed coin. This still **ends the run**, so it is an **execution variation**, not a successful one-coin consolation award.
- Nonfatal overtime verdicts are **no reward** or **one ordinary, harmless coin**; the knight survives judgment and can advance.

The statue's harmless one-coin award and its high-speed knockout coin should be distinguished by the actual sequence, not by an obvious warning that spoils the joke. Meaningful Renown is prestige to these self-important Spellblades; they may find a single token grandly significant.

### Creator's proposed single-coin dialogue (alternatives)

- “It's worth more in spirit.”
- “Priceless. I would never purchase this.”

The second line's contradiction is deliberate. These are **unrecorded proposed reaction lines**, not completed VO assets.

### Open tuning / recommendations, **not approved parameters**

- Trial durations should be measured against skilled-player clear times and enemy pathing, not guessed from raw enemy count. Do not give avoidance-focused bots the ability to arbitrarily stall the clock.
- Execution probability should climb predictably with overtime, but retain some possibility of nonfatal judgment; initial percentages, ceilings, and relative consolation odds remain undecided.
- Recommended: keep Renown earned and settled from earlier waves when a subsequent judgment ends a run, while ending that run's progress. Exact payout/persistence policy remains to be decided.
- Wave counts, compositions, between-wave preparation, multiplayer support, and any retire option are not yet locked.

## Mode B — two-wall assault / *Restless Day* (working title)

### Creator's direction: 5v5 physical ladder siege

- **Five attackers versus five defenders**. Attackers begin across a substantial open field from the defended fortress.
- The attackers have **only a couple of heavy metal ladders**. A Spellblade is stronger than an ordinary human and can plausibly carry one, but is not superhuman without limits.
- Suggested ladder durability is **around a dozen**, provisional and not calibrated to the game's damage model.
- Attackers must **carry the ladders across the field, place them against the outer wall, scale/breach it**, and establish access beyond it. Defenders intercept, fight, and try to prevent the approach and placement.
- After the first wall is a **separate patch of land/courtyard** leading to a **second defensive wall**. Attackers must breach this inner line as well.
- The final objective is to **destroy the Rightful Renowner** behind the defenses. Attackers regard the defenders as undeserving of Renown and want to deprive them of their dispenser.
- **Once the statue is destroyed, the defending team immediately surrenders**: without their Renown dispenser, they no longer see a point in fighting.
- **Siege machines and potentially collectible shields / ramming or shield-bashing tools** are also desired for the siege mode; exact equipment selection and interactions remain to be designed.

### Renowner combat form in this mode

- The **foundational podium/plaque stays fixed**.
- The armored **upper statue rotates/twists around the pedestal** and articulates enough to aim its sword, but **not fluidly like a human swordsman**. Preserve heavy, deliberate mechanical motion.
- It has **substantial HP**, not yet numerically decided.
- Possible attacks specifically proposed by the creator:
  - A sword strike/stab downward at attackers near it.
  - A rapid **spinning sweep** with the sword held downward/outward as the upper statue rotates.
  - **Occasional fired Renown coins**.
- Make it a serious threat during the final courtyard fight, with defenders still participating. Do not replace the statue with a freely walking humanoid monster.

### Continuous sundown deadline

- Attackers must destroy the statue **before sundown**. The setting sun visibly tracks the match time.
- For the **entire live match, including the final seconds**, Castleward's ordinary high-action combat continues normally. **No progressive exhaustion debuffs, slowed fighting, forced sleep behaviors, or elaborate character set pieces during gameplay.**
- **At the instant of sundown**, if the Renowner still stands, **all attackers suddenly fall asleep** and the **defenders win**. A very short ending view/cutscene is possible, but no extensive bespoke sleeping-animation system is wanted.
- Conversely, destroying the Renowner before sundown ends the fight with **immediate defender surrender**.
- The comedy is the symmetry: attackers give up because they need sleep; defenders give up because they have lost their means of obtaining Renown. Neither necessarily needs to be annihilated.

### Creator's dialogue candidates

- Early zeal: **“If I ever sleep, I'll surrender. Let this be a restless day.”**
- Late, near sundown: **“Whether they win or they lose, I will rest just fine.”**
- On the impending/actual failure: **“I'm too tired for this.”**

These are character/dialogue concepts, **not existing recordings**. Keep the tonal progression: boastful zeal at the start, near-philosophical anticipation of rest toward the end. Voice lines can play during normal fighting without taking control or requiring special choreography.

**Explicit creative distinction:** A suggestion from outside the project was that a random **orc** (or other creature) attacks at sundown, explaining the deadline. The creator favors the **ordinary human need to sleep** as the funnier and more character-specific reason. Do **not** replace the sleeping endpoint with an orc, magical fog, or another arbitrary late-match enemy.

### Design suggestions, not locked rules

- Equipment should be physical and tactically meaningful: carriers can drop/retrieve ladders and teammates can protect them; shields could help a ladder carrier withstand fire and deliver a ram/shield bash.
- Solve the **both ladders destroyed** edge case with recoverability or limited delayed replacements, rather than trapping a live match in an unwinnable state. Exact inventory and replacement mechanics remain open.
- Make breaches consequential through suitable advance spawns or open gate access, so defenders cannot indefinitely force repeated traversal of the outer field.
- Keep the two wall phases distinct: an exposed transport problem first, and a shorter, more contested courtyard assault second.
- Balance a fortified five-player defense and a tough final monument against the full sundown clock; the total duration remains undecided.

## Mode C — Edge of Victory (small battle royale)

### Creator's direction

- Only a **few knights** begin scattered across a map; find and defeat each other in a last-knight-standing showdown.
- **Discoverable spells** and potentially **siege machines** change what each knight can use. Further loot/equipment details are open.
- **No conventional damaging fog, smoke circle, or poison storm**.
- Instead the map contains a **shrinking psychological boundary**. As the permissible battlefield gets smaller, the knight **refuses to retreat farther outward**. A player who tries to sprint out is immediately stopped rather than taking a step beyond the line or losing health.
- The knight may object verbally, in-character, as though leaving the fight violates honor. Creator's **tentative wording**, not finalized or recorded:
  - “I shall not leave. To retreat is to not fight for today.”
  - “No, I must get closer. I will not leave this place.”
- Keep the game recognizably fast and responsive. This is a **movement/resolve rule**, not a long refusal cutscene or literal lethal wall. Inward and sideways movement must remain usable.
- The smaller the available area, the fewer opportunities remain to evade rival knights: the contraction forces encounters without environmental damage.

### Design questions, not yet decided

- How to display a readable nonmagical boundary without turning it into a force field or fog.
- How to handle the ring shrinking **past a stationary player**, or where the knight lands after a jump; ensure no trap or bypass.
- Apply the intended outward movement limit consistently to walk, sprint, Dash, jumping, flight, and siege-machine controls, while preserving ordinary local combat, whenever those actions could otherwise bypass it. The user has explicitly described a **sprinting** refusal; precise cross-movement behavior is an implementation choice to confirm.
- How many players, how quickly the ring closes, whether siege vehicles become available at specific locations, and how their size affects the final area all remain unfinalized.
- Shields were also discussed as pickups for the two-wall siege; availability in battle royale is **possible**, not separately confirmed.

## Scope and cross-mode continuity

These concepts should **remain distinct**:

| Proposal | Primary competition | Distinctive finale |
| --- | --- | --- |
| Renown Trials | Beat increasingly demanding waves under strict time | Rising execution risk if overdue; Renowner issues verdict |
| Restless Day | Physical 5v5 ladder assault through two walls before sundown | Destroy Renowner → defenders surrender; sundown → attackers sleep |
| Edge of Victory (battle royale) | Eliminate the other scattered knights while scavenging | Psychological refusal to retreat compresses the fighting |

**Existing game:** `shared/src/modes.mjs` currently declares FFA, BOT_DUEL, PRACTICE, DUEL, BREAKTHROUGH and HIGH_GROUNDS, **not** these proposed modes. Breakthrough already offers sequential team objectives, and existing bots, combat, structures, and siege systems may be useful foundations. Do not misrepresent that as the new ladder/sundown/Renowner/battle-royale logic already working.

**Project direction:** Maintain a fast-paced 3D action game. Record the jokes and mechanically meaningful interactions, but avoid treating brainstorming, illustrative probabilities, suggested titles, art ideas, or incidental animation details as rigid implementation commands. Further design and explicit implementation work can build on this document.
