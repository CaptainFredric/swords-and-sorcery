# The Honorable Entry Gatehouse — Worldbuilding, Architecture, and Martial Doctrine

**Document status:** Design, narrative, and worldbuilding foundation.  
**Repository integration:** Live in `client/worlds/BastionBreachRenderer.mjs` (Bastion Breach 2.0 at `z = 8.8`).  
**Updated:** 2026-10-18.  
[Back to project README](../../README.md) · [3D Asset Roadmap](../art/castleward-3d-asset-roadmap.md) · [Breakthrough Battlefield Evidence](../evidence/breakthrough/README.md)

---

## 1. Central Premise: Competent Engineering Serving Questionable Doctrine

Castleward's military architecture is neither crude nor primitive. Its fortresses are formidable, geometrically imposing works of masonry and timber: thick ashlar walls, pointed Gothic arches, articulated iron portcullises, counterweighted chain winches, corbelled machicolations, and vaulted nave halls. The stonemasons and carpenters know their craft intimately.

The comedy of Castleward lies not in incompetence, but in **the tragic collision between lethal, competent engineering and an absurdly self-important martial culture**.

In Castleward martial philosophy:
1. **The Threshold is Sacred**: A warrior is defined by how they enter a room. Entering through a hole in the wall, an open window, or an unfinished section of drywall is considered the mark of a sneak-thief, a pig-thief, or a peasant delivering cabbages.
2. **Defeating the Enemy Inside is Superior**: Defenders do not hide behind locked gates out of fear. Locking an inner gate indefinitely is seen as unchivalrous cowardice—an admission that one lacks the steel to defeat the challenger face-to-face. A true castellan willingly raises the portcullis and throws open the heavy oak doors, inviting the attackers into their prepared killzone where matters can be decided with dignity.
3. **The Ceremony of the Breach**: When an outer perimeter (Objective 1: The Outer Gate) is captured, the defenders do not desperately brace the inner doors. They sound the transition horn, man the winch windlasses, and hoist the iron portcullis high, formally admitting the attackers into the High Sanctum nave for the decisive clash.

---

## 2. In-Engine Architectural Implementation (Bastion Breach at `z = 8.8`)

The Honorable Entry Gatehouse divides the contested Outer Courtyard (Objective 1, `z = -2`) from the sacred High Sanctum (Objective 2, `z = 25`).

### Key Structural Components
- **Pale-Stone Gothic Arch Facade**: Crafted from dressed pale limestone (`0x9e988f`) with molded stringcourses, impost blocks, angled voussoirs, and a carved central keystone boss bearing the Castleward brass heraldic seal (`0x9b783e`).
- **Overhead Machicolations and Parapet**: Corbel brackets support a raised crenellated parapet at `y = 7.15m` with defensive merlons and flanking crimson banners (`0x8b201a`) draped on iron corbels.
- **Interior Barrel Vault and Murder Holes**: A vaulted stone passage soffit at `y = 5.85m` features four cylindrical murder hole chutes opening into the overhead gate chamber.
- **Overhead Gate Chamber Machinery**: A heavy timber winch drum (`radius: 0.26m`, length `5.4m`) with dual spoked iron ratchet gear wheels, axle pillow blocks, and counterweight boxes (`0.55m × 1.2m`) hanging on vertical guide chains.
- **Articulated Hoisting Portcullis**: A heavy wrought-iron grille with horizontal crossbeams, nine vertical square bars, sharpened bottom spikes, and vertical hoist chains. When closed, it bars the road at `y = 0.5–4.3m`. When Stage 2 begins, the winch rotates, counterweights descend, and the portcullis smoothly hoists `3.8m` upward into the overhead arch chamber.
- **Articulated Twin Oak Gate Doors**: Heavy dark oak timbers (`0x3d2b1f`) banded with three horizontal iron strap hinges, brass pull rings, and iron bolt studs. Hinged on the inner piers (`x = ±3.1m`), they swing open inward (`+z`) by 86 degrees, folding flush against the stone passage walls to reveal the vaulted High Sanctum nave.
- **Western Wall Unfinished Construction Gap (Scene A Visual Anchor)**: Located at `x = -11.5m, z = 6.8m` along the breach wall. Features multi-tier timber scaffolding standards, horizontal ledger platforms, diagonal sway cross-braces, a leaning wooden ladder, mason's mortar mixing trough with lime mortar, stacked ashlar stone blocks, and timber headers in the parapet.

---

## 3. Worldbuilding Scenes & Narrative Scripts

These scripted scenes and vignettes are preserved here for future cinematic trailers, tutorial character dialogue, in-match voice quips, and single-player campaign encounters.

### Scene A: The Unfinished Gap ("I Must Go to the Entrance")
**Setting:** The outer approach of a Castleward fortress. Heavy siege combat is underway.  
**Characters:** The Spellblade (attacker protagonist), Squire Vance, and two Castleward stonemason laborers (Hob and Gyles).

> **Hob:** *(Wiping mortar from his trowel, shouting over the din of battle)* Hey! Knight! Over here!
>
> **Squire Vance:** *(Ducking an arrow)* Milord, look! The west curtain wall—the masonry is completely down for renovation! There is only a three-foot wooden hurdle and some scaffolding!
>
> **Gyles:** *(Waving a wooden measuring stick cheerfully)* You can literally just walk through! The mortar’s still wet, but if you step on the timber balks you won't even scuff your greaves! Come on through, save yourselves ten minutes!
>
> **Spellblade:** *(Halts, staring at the laborers in cold, scandalized disbelief)* ...Walk through?
>
> **Squire Vance:** It would circumvent the entire flanking gallery, sir!
>
> **Spellblade:** Vance, are we vagabonds? Are we drovers delivering turnip sacks through the pantry shutter?
>
> **Squire Vance:** No, sir, we are the vanguard of the Duke’s Grand Host—
>
> **Spellblade:** Then we do not scuttle through a mason’s renovation gap like delinquent rats! Where is the formal entrance?
>
> **Hob:** The Honorable Entry Gatehouse is down the killzone, ninety paces east, past the boiling oil cauldrons and the crossbow gallery.
>
> **Spellblade:** Splendid. A proper gateway with an arch and a keystone. Inform your castellan that we shall present ourselves at the main portal with all due decorum!
>
> **Hob:** *(Shrugging, returning to mixing mortar)* Right you are, guv'nor. Best of luck with the archers.

---

### Scene B: The Accidental Breach ("Exit and Re-enter Properly")
**Setting:** The interior High Sanctum. Stained glass reflections, quiet incense, vaulted quiet.  
**Characters:** Warden Alden (defender castellan), Defender Knights, and Squire Rowan (attacker).

> *(A tremendous CRASH shakes the ceiling. A stray trebuchet stone punches through the roof vault. Dust cascades down. Squire Rowan falls through the breach, crashing onto a pile of chapel cushions, coughing violently.)*
>
> **Warden Alden:** *(Lowering his devotional hymnbook, looking over his spectacles)* What was that?
>
> **Defender Knight:** An intruder, Warden! He has infiltrated the Sanctum!
>
> **Squire Rowan:** *(Scrambling up, drawing sword triumphantly)* Victory! I have breached your inner sanctum! Surrender the relic!
>
> **Warden Alden:** *(Stands up, thoroughly unimpressed)* Young man, through which threshold did you enter this sanctuary?
>
> **Squire Rowan:** Through... well, through the ceiling. The trebuchet missed the courtyard and—
>
> **Warden Alden:** The ceiling. Through a hole in the roof plaster.
>
> **Squire Rowan:** Yes! I'm behind your lines!
>
> **Warden Alden:** That does not count.
>
> **Squire Rowan:** What do you mean it doesn't count? I am standing on your dais!
>
> **Warden Alden:** Did you cross the threshold of the Honorable Entry Gatehouse? Was your arrival announced by the winch bells? Did our portcullis ascend in ceremonial acknowledgement of your martial prowess?
>
> **Squire Rowan:** No, I fell sixty feet through a skylight!
>
> **Warden Alden:** Exactly. An unannounced tumbling accident. If we kill you here, our chronicler cannot record a legitimate duel; he would have to write: *"And then a boy fell from the sky like an overripe pear, and we struck him."* It is utterly degrading to both parties.
>
> **Squire Rowan:** ...So what am I supposed to do?
>
> **Warden Alden:** *(Gestures toward the great double doors)* You will sheath your blade, walk out through the main gates, cross into the courtyard, wait for the gates to swing shut, and knock like a gentleman.
>
> *(Beat. Rowan looks at his sword, then at the open doors, sheepishly sheathes his weapon, and walks out toward the courtyard.)*
>
> **Warden Alden:** *(Calling after him)* Mind the step on the threshold! It was oiled yesterday!

---

### Scene C: The Grand Detour ("Reporting the Fire")
**Setting:** The Castleward outer guardhouse.  
**Characters:** Gate Guard Kenneth and Captain Donald.

> **Kenneth:** Captain! The hay wagons in the outer bailey are ablaze! The fire is spreading to the armory!
>
> **Donald:** Great heavens! Run to the Citadel and sound the alarm!
>
> **Kenneth:** Right away, sir! Should I use the garden side door? It is four steps from here.
>
> **Donald:** The garden side door?! Kenneth, have you lost your senses? That door has neither lintel carving nor heraldic pennants! You will take the ceremonial procession route: down the long gallery, across the tournament field, through the Honorable Entry Gatehouse, and present your report at the center of the nave!
>
> **Kenneth:** But sir, that is a two-mile march in full plate! The armory will burn to ash!
>
> **Donald:** The armory can be rebuilt, Kenneth! Our adherence to formal protocol cannot! Now lace your boots and begin your march!

---

## 4. Extended Worldbuilding Concepts

### 1. The Humiliating Crawlspace
Fortresses sometimes possess small drainage culverts or dog-flaps near the foundation. While technically passable by a crouching or crawling knight, using one is considered the ultimate disgrace.
- If an attacker crawls through a drainage pipe to enter the courtyard, all fighting immediately ceases.
- Defenders and attackers alike stop swinging swords, gather around the pipe exit, and point: *"Look at him! Look at Sir Galahad on all fours like a wet badger! Did your mother not teach you how to use a doorknob?"*
- Any kill achieved while crouching in a crawlspace yields zero Renown and triggers the voice line: *"You may have my life, cur, but you shall never have the archway!"*

### 2. The Siege Catapult Launch
Castleward attackers frequently construct catapults designed not to throw stones, but to launch heavily armored knights directly over the battlements.
- To maintain legal chivalric standing, the airborne knight must yell their formal name, lineage, and intention to duel at the top of their lungs while flying through the air: *"I AM SIR PERCIVAL OF THE HIGH REACHES AND I DEMAND RECOGNITION UPON LANDING—"*
- If they fail to announce themselves before hitting the ground, the landing is ruled a trespass and defenders are legally permitted to throw buckets of dishwater at them.

### 3. Ridiculously Low Walls with Giant Gates
In frontier border posts where stone was scarce, Castleward engineers would spend 90% of their construction budget erecting a magnificent, 12-meter-tall stone gatehouse with triple portcullises, gilded keystones, and heraldic statues—flanked on either side by a simple, knee-high wooden split-rail fence.
- Invading armies will dutifully queue up in single file outside the giant gatehouse, patiently waiting for the portcullis to be raised, rather than simply stepping over the 18-inch fence.
- When an eccentric recruit suggests stepping over the fence, the veteran sergeant slaps their helmet: *"And trample the Duke's primroses? Are you a barbarian?!"*

### 4. Gates Operable from Both Sides
Because the gatehouse is seen as an instrument of mutual chivalry rather than a barrier, the winches and levers are often positioned on exterior platforms where both attackers and defenders can reach them.
- During stage transitions, this leads to polite tug-of-wars:
  - Defender: *"Allow me to open the gate for you, sir!"*
  - Attacker: *"No, no, I insist, we are the visiting party, let us winch it up!"*
  - Defender: *"I wouldn't hear of it, hospitality demands the host raise the portcullis!"*

---

## 5. Gameplay & Match Flow Integration

In Breakthrough mode (`bastionBreach.mjs` and `BastionBreachRenderer.mjs`):
1. **Stage 1 (The Outer Gate)**:
   - Contested area: `z = -10` to `+8`, centered at `(0, 0, -2)`.
   - Gatehouse state at `z = 8.8`: **Closed**. Portcullis lowered, heavy twin oak doors shut, heraldic banners displayed.
   - Attackers clash with defenders in the outer courtyard.
2. **The Capture Moment (100% Progress)**:
   - The authoritative objective server transitions to `index: 1` (The High Sanctum).
   - In `BastionBreachRenderer.mjs`, `setObjectiveState` detects `activeIdx >= 1`.
   - The gatehouse animation triggers smoothly over 1.2 seconds:
     - Winch drum begins rotating.
     - Counterweight boxes descend.
     - Heavy iron portcullis hoists `3.8m` vertically under the stone arch.
     - Twin oak doors swing inward 86 degrees, folding flat against the passage piers.
   - The 6-meter-wide grand ceremonial entrance opens up with clear sightlines into the High Sanctum.
3. **Stage 2 (The High Sanctum)**:
   - Attackers charge through the open gatehouse into the vaulted chapel.
   - Defenders fall back to their altar dais staging positions (`z = 32–36`).
   - The battle reaches its dramatic climax under the ribbed Gothic vaults.

---

## 6. Open Design & Implementation Notes

- **Collision Decoupling**: The static server navigation graph (`getNavigationGraph`) treats the `z = 8.8` passage as an open lane (`floor-breach`, width 7.0m) to preserve reliable bot pathfinding and avoid locomotion desyncs across client/server boundaries.
- **Audio Opportunities**: Future passes can hook procedural stone-grinding, chain-rattling, and timber-creaking sound effects directly to `gateOpenProgress` in `AudioManager`.
- **Dialogue Triggers**: In-match announcer lines when the gate opens:
  - Defender Announcer: *"The Outer Bailey is ceded! Open the Citadel Gates—let them face our steel upon the sacred flags!"*
  - Attacker Announcer: *"The Gatehouse rises! Advance into their sanctuary!"*
