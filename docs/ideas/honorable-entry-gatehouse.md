# The Honorable Entry Gatehouse — Worldbuilding, Architecture, and Martial Doctrine

**Document status:** Design, narrative, and worldbuilding foundation.  
**Repository integration:** Live in `shared/worlds/bastionBreach.mjs` (authoritative collision & spawns) and `client/worlds/BastionBreachRenderer.mjs` (Bastion Breach 2.0 at `z = 8.8`).  
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
- **Western Wall Unfinished Construction Opening**: Located at `x = -11.5m, z = 6.8m` to `9.8m` along the breach wall. In the narrative world, this is an active masonry renovation site. In the competitive multiplayer game, the wall is partitioned into authentic architectural segments:
  - Outer curtain masonry: `x = [-16, -13.0]`, `y = [0, 5.5]`.
  - Inner curtain masonry: `x = [-10.0, -3.5]`, `y = [0, 5.5]`.
  - Partially laid foundation course: `wall-construction-footing` at `x = [-13.0, -10.0]`, `y = [0, 0.95]`.
  - Sturdy timber hoarding balks: `wall-construction-hoarding` at `x = [-13.0, -10.0]`, `y = [0.95, 3.2]`, material `'timber'`.
  - Scaffolding kit: Multi-tier timber scaffolding standards, horizontal ledger platforms, diagonal sway cross-braces, a leaning wooden ladder, mason's mortar mixing trough with lime mortar, stacked ashlar stone blocks, and parapet headers.
  - This design preserves narrative authenticity while physically preventing sequence-breaking or exploiting shortcuts into the High Sanctum before Stage 1 is won.

---

## 3. Worldbuilding Scenes & Narrative Scripts

These scripted scenes and vignettes are preserved here for future cinematic trailers, tutorial character dialogue, in-match voice quips, and single-player campaign encounters.

### Scene A (Canonical): The Unfinished Gap ("I Must Go to the Entrance")
**Setting:** The outer approach of a Castleward fortress during active siege fighting. Arrows strike the stone, trebuchet horns echo in the distance.  
**Characters:** The Spellblade (attacker protagonist) and two Castleward stonemason laborers (Hob and Gyles).

> *(The Spellblade sprints past the outer barricades toward the fortress. Along the western curtain wall, an enormous renovation breach sits completely open to the sky: scaffolding towers, stacks of ashlar blocks, mortar tubs, and a low three-foot wooden hurdle. Beyond it lies an unobstructed, direct shortcut straight into the inner sanctuary.)*
>
> **Hob:** *(Leaning casually on his shovel, wiping mortar from his brow, shouting over the din)* Hey! Knight! Over here!
>
> **Gyles:** *(Waving a wooden measuring rule cheerfully)* Don’t bother with the killzone, mate! The curtain wall's down for seasonal renovation! You can literally just walk through!
>
> **Hob:** Mortar’s still a bit tacky, but if you step on the timber balks you won't even scuff your greaves! Come on through, save yourself ten minutes of crossbow bolts!
>
> *(The Spellblade stops dead in his tracks. He stares at the gaping hole in the wall. He looks at the cheerful masons. A heavy, frozen pause hangs over the battlefield.)*
>
> **Spellblade:** *(Completely deadpan)* I must go to the entrance.
>
> *(Without a single additional word, the Spellblade turns on his heel and marches straight back into the central arrow-swept killzone toward the formal gatehouse. The two masons exchange bewildered glances as arrows rain down around him.)*
>
> **Gyles:** ...Right then. Mind the boiling oil, guv'nor.

#### Scene A Variant (Expanded Dialogue: Protocol & Turnip Sacks)
*(Optional expanded character dialogue featuring Squire Vance debating martial decorum.)*
> **Squire Vance:** *(Ducking an arrow)* Milord, look! The west curtain wall—there is only a wooden hurdle and some scaffolding! It would circumvent the entire flanking gallery!
>
> **Spellblade:** Vance, are we vagabonds? Are we drovers delivering turnip sacks through the pantry shutter?
>
> **Squire Vance:** No, sir, we are the vanguard of the Duke’s Grand Host—
>
> **Spellblade:** Then we do not scuttle through a mason’s renovation gap like delinquent rats! Where is the formal entrance?
>
> **Hob:** The Honorable Entry Gatehouse is ninety paces east, past the boiling cauldrons and the crossbow loops.
>
> **Spellblade:** Splendid. A proper gateway with an arch and a keystone. Inform your castellan that we shall present ourselves at the main portal with all due decorum!

---

### Scene B (Canonical, Self-Imposed!): The Formal Re-Entry ("This Does Not Count")
**Setting:** The quiet, incense-filled interior High Sanctum nave. Stained glass casts crimson light across the ceremonial altar dais.  
**Characters:** The Spellblade (attacker protagonist) and Warden Alden (defender castellan).

> *(Through chaotic battlefield circumstance—a miscalculated blast jump or an accidental collapse—the Spellblade finds himself deep inside the High Sanctum entirely alone, behind enemy lines, standing directly upon the sacred altar dais.)*
>
> **Warden Alden:** *(Looking up from his desk in sheer bewilderment, clutching his quill)* By the trident... How did you get in here?! The gatehouse is barred!
>
> *(The Spellblade looks down at the dais beneath his boots. He looks up at the vaulted ribs. He looks at his drawn sword. His face settles into profound, unyielding disappointment.)*
>
> **Spellblade:** *(Muttering to himself)* No. No, this does not count.
>
> **Warden Alden:** I beg your pardon?
>
> **Spellblade:** I did not cross the threshold. The portcullis was not raised. No ceremonial horns sounded. If I defeat you now, chroniclers will not record a glorious conquest; they will record a domestic break-in. It is utterly degrading.
>
> *(The Spellblade calmly sheathes his broadsword. He turns away from the defenseless castellan and walks toward the interior side of the Honorable Entry Gatehouse.)*
>
> **Warden Alden:** What are you doing?
>
> **Spellblade:** Rectifying the error.
>
> *(The Spellblade pulls the interior winch lever. The heavy iron portcullis ascends with a grinding rattle. He pushes open the twin oak doors, walks out into the contested Outer Courtyard, steps across the threshold stone, and releases the winch catch. The portcullis SLAMS shut behind him. The oak doors swing closed and latch.)*
>
> *(From inside, Warden Alden stands frozen in shock. A moment of silence. Then, three measured, thunderous KNOCKS rattle the heavy oak doors from the courtyard outside.)*
>
> **Spellblade:** *(Shouting through the gate wicket with impeccable formality)* Castleward garrison! I am the Spellblade of the Western Reaches! Open this gatehouse and prepare for honorable combat!
>
> **Warden Alden:** *(Blinking in reverent astonishment, adjusting his collar)* Now that... is an honorable gentleman. Man the winches, lads! Admit the challenger!

#### Scene B Variant (Expanded Dialogue: The Accidental Breach with Rowan & Alden)
*(Optional comedic dialogue where defending Warden Alden scolds an infiltrating young squire who crashed through a ceiling skylight.)*
> **Warden Alden:** Young man, through which threshold did you enter this sanctuary?
>
> **Squire Rowan:** Through... well, through the ceiling. The trebuchet stone punched through the roof vault and—
>
> **Warden Alden:** The ceiling. Through a hole in the roof plaster. If we strike you down here, our chronicler must write: *"And then a boy fell from the sky like an overripe pear, and we struck him."* You will sheath your blade, walk out through the main gates, wait for them to swing shut, and knock like a gentleman.

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

### 5. The Champion Challenge at the Threshold
Before a fortress gate can be legally forced or raised, the defending garrison champion often stands on the threshold platform, reciting a 14-stanza genealogical challenge. If an attacking champion steps forward and recites an equally elaborate, legally rhyming counter-challenge, the gate is winched up halfway as a sign of mutual respect before single combat begins.

---

## 5. Gameplay & Authoritative Collision Architecture

In Breakthrough mode (`shared/worlds/bastionBreach.mjs`, `shared/sim/Room.mjs`, `shared/sim/combat.mjs`, and `client/worlds/BastionBreachRenderer.mjs`):

1. **Stage 1 (The Outer Gate)**:
   - **Contested Area**: `z = -10` to `+8`, centered at `(0, 0, -2)`.
   - **Authoritative Gate Blocker**: `BASTION_GATE_BLOCKER = solid('gatehouse-honorable-gate-closed', [-3.4, 3.4], [0, 5.5], [8.5, 9.1], { material: 'iron' })`.
   - **Authoritative World State**: Server uses `BASTION_BREACH_CLOSED` where `solids` includes `BASTION_GATE_BLOCKER`.
   - **Player Locomotion & Attacks**: Attackers cannot tunnel or walk through the closed gate; sword swings and projectile casts strike the iron gate with an authoritative metallic clang and sparks.
   - **Stage 1 Defender Spawns**: Phase 0 defenders spawn in the Outer Courtyard (`z = 3.0` to `5.0`) and on the East Gallery ramp (`z = 3.5, y = 1.25`), placing them directly on the courtyard side with clean, unobstructed ground access to defend Objective 1 at `z = -2`.
   - **Bot Navigation Graph**: In `BASTION_BREACH_CLOSED`, `botNav` does not link `breach-south` (`z = 7`) to `breach-center` (`z = 11`), preventing bots from trying to path through the closed doors.
2. **The Capture Moment (100% Progress)**:
   - `stepObjectives` authoritatively transitions the room state to `index: 1` (The High Sanctum).
   - In `stepRoom`, `room.world` immediately updates to `bastionBreachForObjective(room.objectiveState)`, resolving to `BASTION_BREACH_OPEN` which omits the gate blocker.
   - Authoritative movement, weapon sweeps, and bot navigation immediately permit passage through `z = 8.8`.
3. **Client Presentation & Late-Join Synchronization**:
   - In `BastionBreachRenderer.mjs`:
     - **Live capture transition**: `isFirstSet === false`. The gate smoothly animates open over ~1.2s (`gateSpeed = 0.85`), hoists the portcullis `3.8m` upward, swings the twin oak doors 86 degrees inward, rotates the winch drum, and drops the counterweights.
     - **Late join / reconnect**: `isFirstSet === true`. The renderer immediately snaps `gateOpenProgress = targetGateOpen` (`1.0`), positioning the portcullis, doors, winch, and counterweights in their fully open state without misleading animation lag.
     - **Movement prediction**: `GameRuntime.mjs` updates `this.activeWorld = bastionBreachForObjective(snapshot.objective)` on each snapshot, synchronizing local client prediction with server truth.
4. **Stage 2 (The High Sanctum)**:
   - Attackers advance through the open gatehouse into the vaulted chapel.
   - Respawning defenders use Phase 1 spawns behind the sanctum altar (`z = 32.8` to `34.2`).
   - The battle concludes on the sacred ceremonial dais at `(0, 0.3, 25)`.

---

## 6. Verification & Implementation Summary

- **Server Truth**: Gate passage is strictly determined by server-authoritative collision in `Room.mjs` and `combat.mjs`. Clients cannot walk or glitch through closed doors.
- **Bot Integrity**: Defensive bot retreat logic (`BASTION_BREACH_TACTICS`) directs bots into the High Sanctum once Stage 1 falls, traversing the newly opened gate without navigation bottlenecks.
- **Audio & Voice Quip Hooks**: In-match announcer lines when the gate opens:
  - Defender Announcer: *"The Outer Bailey is ceded! Open the Citadel Gates—let them face our steel upon the sacred flags!"*
  - Attacker Announcer: *"The Gatehouse rises! Advance into their sanctuary!"*
