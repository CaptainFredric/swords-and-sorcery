# The Honorable Entry Gatehouse — Worldbuilding, Architecture, and Martial Doctrine

**Document status:** Design, narrative, and worldbuilding foundation.  
**Repository integration:** Integrated on PR #214 (`client/assets/worlds/bastion-breach/honorable-entry-gatehouse.glb`, pending merge), rendered by `client/worlds/BastionBreachRenderer.mjs` and authoritatively simulated in `shared/worlds/bastionBreach.mjs` (Argon v1.1 bounds, stepped buttress solids, door bumpers, portcullis, spawns).  
**Updated:** 2026-10-20.  
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

### Authored PBR Game-Ready Model (`honorable-entry-gatehouse.glb`)
Authored by Argon (`Honorable_Entry_Gatehouse_GameReady_PBR.glb`, v1.1 integration specifications) and integrated directly into `client/assets/worlds/bastion-breach/honorable-entry-gatehouse.glb` (3.7MB binary glTF 2.0; pre-gzipped 2.1MB candidate):
- **Model Hierarchy**: 9 primary mesh nodes (`Gatehouse_Structure`, `Portcullis`, `Door_Left`, `Door_Right`, `Winch_Drum`, `Counterweight_Left`, `Counterweight_Right`, `Banner_Left`, `Banner_Right`) and 5 alignment locators (`LOC_SpikeClearance`, `LOC_TraversalCenter`, `LOC_ArchKeystone`, `LOC_Hinge_Left`, `LOC_Hinge_Right`).
- **Material & Textures**: Single draw-call PBR material `Castleward_Gatehouse_PBR` with 2K diffuse/albedo, normal, and metallic/roughness maps capturing weathered pale ashlar limestone, dark iron fittings, oak woodgrain, and heraldic crimson fabric.
- **Embedded Animation Clips**:
  1. `Gate_ClosedIdle` (1.00s): Default barred stance with lowered portcullis spikes resting on the stone threshold and latched oak doors.
  2. `Gate_Open` (3.60s): Winch drum rotates +540°, counterweights sink -1.36m, iron portcullis ascends +1.36m (providing 3.940m overhead clearance), and twin oak doors swing inward 86° against the inner jamb stops.
  3. `Gate_OpenIdle` (1.00s): Stage 2 open hold state with unobstructed 3.088m clear traversal width.
  4. `Gate_Close` (3.60s): Reverse closure animation.

### Key Structural Dimensions & Bounds (Root = `[0.0, 0.0, +8.8]`)
- **Full Gatehouse AABB**: Local $X \in [-7.575, +7.575]$m (15.150m wide), $Y \in [-0.256, +8.636]$m (8.892m total height; 8.636m above $Y = 0$ road), $Z \in [-4.459, +2.480]$m ($6.939$m deep) $\rightarrow$ World $X \in [-7.575, +7.575]$, $Y \in [0.000, 8.636]$, $Z \in [+4.341, +11.280]$.
- **Central Portal Archway**: $X \in [-1.696, +1.696]$m ($3.392$m inner jamb width; $3.088$m clear width between open oak doors $X \in [-1.544, +1.544]$m across $Z \in [+9.04, +10.64]$m).
- **Vertical Clearances**: Raised portcullis spike clearance at $Y = 3.940$m (+2.14m above a standard 1.80m Spellblade) and $Y = 4.496$m to the arch keystone.
- **Overhead Machinery & Parapet**: High parapet and corbelled machicolations at $Y = 7.15$m, crenellated merlons reaching $Y = 8.636$m, overhead timber winch drum, twin spoked ratchet wheels, and counterweight boxes.
- **Western Wall Unfinished Construction Opening**: Located at `x = -11.5m, z = 6.8m` to `9.8m` along the breach wall. In the competitive multiplayer game, this boundary separates the Outer Courtyard from the High Sanctum. To preserve competitive match balance and prevent attackers from bypassing Stage 1, the wall is partitioned into authentic architectural segments with an authoritative defensive barricade:
  - Outer curtain masonry: `x = [-16, -13.0]`, `y = [0, 5.5]`.
  - Inner curtain masonry: `x = [-10.0, -3.5]`, `y = [0, 5.5]`.
  - Partially laid foundation course: `wall-construction-footing` at `x = [-13.0, -10.0]`, `y = [0, 0.95]`.
  - Sturdy timber hoarding barricade: `wall-construction-hoarding` at `x = [-13.0, -10.0]`, `y = [0.95, 3.2]`, material `'timber'`.
  - Scaffolding kit: Multi-tier timber scaffolding standards, horizontal ledger platforms, diagonal sway cross-braces, a leaning wooden ladder, mason's mortar mixing trough with lime mortar, stacked ashlar stone blocks, and parapet headers.
  - In competitive Breakthrough, this hoarding solidly blocks player locomotion, jumping, and bot navigation. The comedic premise of a completely open gap is preserved specifically for the scripted narrative prologue/tutorial scene described below, ensuring the competitive match flow and the narrative worldbuilding never contradict each other.

---

## 3. Worldbuilding Scenes & Narrative Scripts

These scripted scenes and vignettes are preserved here for future cinematic trailers, tutorial character dialogue, in-match voice quips, and single-player campaign encounters.

> [!NOTE] Architecture & Narrative Reconciliation
> In competitive multiplayer Breakthrough matches, the western breach is fortified with `wall-construction-hoarding` (3.2m high timber hoarding) to preserve Stage 1 progression. The scenes below reflect the canonical narrative / cinematic fiction—such as an opening tutorial or peacetime renovation scenario—where the curtain wall gap stood completely open before wartime fortification, making the Spellblade's refusal an act of purely stubborn martial decorum.

### Scene A (Canonical): The Unfinished Gap ("I Must Go to the Entrance")
**Setting:** The outer approach of a Castleward fortress during active siege fighting (narrative scenario). Arrows strike the stone, trebuchet horns echo in the distance.  
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
   - **Authoritative Gate Blocker**: `BASTION_GATE_BLOCKER = solid('gatehouse-honorable-gate-closed', [-1.696, 1.696], [0.000, 3.940], [8.550, 9.100], { material: 'iron' })`.
   - **Stepped Architectural Solids**:
     - West buttress: `[-7.575, -3.500]`, `[0.000, 8.636]`, `[4.341, 7.000]`
     - West tower / inner jamb: `[-7.575, -1.696]`, `[0.000, 8.636]`, `[7.000, 11.280]`
     - East buttress: `[3.500, 7.575]`, `[0.000, 8.636]`, `[4.341, 7.000]`
     - East tower / inner jamb: `[1.696, 7.575]`, `[0.000, 8.636]`, `[7.000, 11.280]`
     - Arch keystone overhead: `[-1.696, 1.696]`, `[3.940, 8.636]`, `[7.000, 10.600]`
   - **Authoritative World State**: Server uses `BASTION_BREACH_CLOSED` where `solids` includes `BASTION_GATE_BLOCKER`.
   - **Player Locomotion & Attacks**: Attackers cannot tunnel or walk through the closed gate; sword swings and projectile casts strike the iron gate with an authoritative metallic clang and sparks.
   - **Stage 1 Defender Spawns**: Phase 0 defenders spawn in the Outer Courtyard (`x = ±2.8, z = 4.5` and gallery ramp `z = 3.5, y = 1.25`), placing them directly on the courtyard side with clean, unobstructed ground access to defend Objective 1 at `z = -2` without clipping the stepped buttresses.
   - **Bot Navigation Graph**: In `BASTION_BREACH_CLOSED`, `botNav` does not link `breach-south` (`z = 7`) to `breach-center` (`z = 11`), preventing bots from trying to path through the closed doors.
2. **The Capture Moment & Deterministic Transition**:
   - `stepObjectives` authoritatively transitions the room state to `index: 1` (The High Sanctum), stamping `lastCapturedAt`.
   - Authoritative collision keeps `BASTION_GATE_BLOCKER` active for the exact transition interval (`BASTION_GATE_OPEN_DURATION_MS = 1200` ms).
   - Once `now - lastCapturedAt >= 1200`, `room.world` authoritatively resolves to `BASTION_BREACH_OPEN`, swapping `BASTION_GATE_BLOCKER` for the open door bumpers:
     - `gatehouse-door-bumper-west`: `[-1.696, -1.544]`, `[0, 2.9]`, `[9.04, 10.64]`
     - `gatehouse-door-bumper-east`: `[1.544, 1.696]`, `[0, 2.9]`, `[9.04, 10.64]`
     - This leaves a generous $3.088$m clear central traversal corridor ($X \in [-1.544, +1.544]$m).
3. **Client Presentation & Late-Join Synchronization**:
   - In `BastionBreachRenderer.mjs`:
     - **Authored Asset Mixer**: `AnimationMixer` binds the 4 embedded clips (`Gate_ClosedIdle`, `Gate_Open`, `Gate_OpenIdle`, `Gate_Close`).
     - **Deterministic Lockstep Progress**: Instead of free-running mixer clocks, `#applyGateTransform()` maps normalized `gateOpenProgress` (0.0 to 1.0) directly onto clip duration: `openAction.time = Math.min(clip.duration, Math.max(0, this.gateOpenProgress * clip.duration))`.
     - **1.20s Lockstep ($3.0\times$)**: With a 3.60s GLB clip and 1.200s server transition window, this achieves perfect $3.0\times$ playback lockstep with server simulation.
     - **Late join / reconnect**: Snapping `gateOpenProgress = targetGateOpen` (`1.0`) immediately scrubs the animation to $3.60$s, positioning all meshes in their fully open state without animation lag.
     - **Fallback & Disposal**: Gracefully falls back to procedural meshes if the GLB fails to load or in headless tests; cleans up mixer actions and cached clones upon `dispose()`.
     - **Movement prediction**: `GameRuntime.mjs` updates `this.activeWorld = bastionBreachForObjective(snapshot.objective)` on each snapshot, synchronizing local client prediction with server truth.
4. **Stage 2 (The High Sanctum)**:
   - Attackers advance through the open gatehouse into the vaulted chapel.
   - Respawning defenders use Phase 1 spawns behind the sanctum altar (`z = 32.8` to `34.2`).
   - The battle concludes on the sacred ceremonial dais at `(0, 0.3, 25)`.

---

## 6. Verification & Implementation Summary

- **Authored Asset Delivery**: Authored game-ready PBR GLB (`honorable-entry-gatehouse.glb`) loaded and verified in-engine.
- **Server Truth**: Gate passage is strictly determined by server-authoritative collision in `Room.mjs` and `combat.mjs`. Clients cannot walk or glitch through closed doors.
- **Bot Integrity**: Defensive bot retreat logic (`BASTION_BREACH_TACTICS`) directs bots into the High Sanctum once Stage 1 falls, traversing the newly opened gate without navigation bottlenecks.
- **Visual Evidence**: In-engine WebGL screenshots recorded for Stage 1 barred gate, mid-ceremony transition ($t = 0.6$s), Stage 2 fully open portal, western construction gap, and defender sanctum perspective (see [Breakthrough Evidence](../evidence/breakthrough/README.md)).
- **Audio & Voice Quip Hooks**: In-match announcer lines when the gate opens:
  - Defender Announcer: *"The Outer Bailey is ceded! Open the Citadel Gates—let them face our steel upon the sacred flags!"*
  - Attacker Announcer: *"The Gatehouse rises! Advance into their sanctuary!"*
