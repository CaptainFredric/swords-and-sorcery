# Castleward — Complete Player-Facing Writing Audit
**Date:** 2026-11-10  
**Repository:** CaptainFredric/swords-and-sorcery  
**Audit branch:** audit/player-facing-writing-20261110  
**Status:** Editorial audit and low-risk source revisions; DRAFT ONLY. Do not merge or deploy.

## Assessment

Castleward has distinct legitimate writing registers: the self-regarding Spellblade, a dry narrator, an argumentative rival, extravagantly conscientious siege engineers, the ceremonial Herald, and an impersonal operational interface. Most of the personality already lives in the *contrast*. The work is to correct false facts and unhelpful instructions, remove generic fantasy advertising, and stop the short mechanics / facts / lore layers from saying the same thing three times. It is **not** to standardize all voices or modernize jokes.

**Significant rule conflict:** All-Natural Disaster's authoritative impact base is **46**, not the Armory's former **40**. The source still grants **+8 Gale**, not the creator's intended **+1 Gale**. This draft changes the Armory to import the existing rule, so it correctly displays **+8**. Changing actual Gale bonus from +8 to +1 requires a separate *gameplay* implementation and revision of tests; this writing PR must not falsely advertise an unimplemented rule.

## Scope, search and evidence

Reviewed the GitHub repository's recursive inventory (3,371 tree entries, 1,495 source/text-file candidates including docs/tests), searched code for vocabulary such as epic, unleash, devastating, unstoppable, in development and placeholder, and directly inspected player-facing source across the following paths. This is a broad cross-system **source audit**, not a claim that every string in every one of the repository's test fixtures, historical documents and generated assets was individually examined.

- **Armory:** client/menu/armoryView.mjs, client/menu/siegeArmoryView.mjs, client/menu/showcaseSheets.mjs, client/menu/ArmoryShowcase.mjs, client/main.mjs, client/index.html.
- **Combat verification:** shared/src/ultimates.mjs, shared/src/spells.mjs, shared/src/oneHitInfusions.mjs, shared/src/oneHitOfWondersRules.mjs, shared/src/oneHitOfWondersRules.test.mjs, shared/src/blade.mjs, shared/src/combat.mjs, shared/src/modes.mjs.
- **Feats/progression:** shared/src/challenges.mjs, client/menu/ChallengesController.mjs, client/menu/renownView.mjs, client/menu/RenownController.mjs, shared/src/heraldry.mjs, shared/src/cosmetics.mjs.
- **Modes, Solo, multiplayer:** client/menu/lobbyView.mjs, client/menu/lobbyControls.mjs, client/menu/privateRoomRules.mjs, client/menu/challengeCard.mjs, client/menu/seekView.mjs, client/main.mjs, client/index.html.
- **Tutorial/characters:** client/tutorial/tutorialScript.mjs, client/tutorial/TutorialSession.mjs, client/tutorial/TutorialView.mjs, client/tutorial/TutorialOpening.mjs, client/tutorial/TutorialMovementCues.mjs, client/tutorial/TutorialCombatCues.mjs; identified voice/VO authoring in client/game/sound/voiceLines.mjs and accompanying audio.
- **HUD, results and settings:** client/ui/HUD.mjs, client/ui/ultimateView.mjs, client/ui/renownTrialsView.mjs, client/ui/restlessDayHudView.mjs, client/ui/highGroundsHudView.mjs, client/ui/fightFlightHudView.mjs, client/settings/settingsRegistry.mjs, client/ui/heraldNotices.mjs, client/ui/HeraldPanel.mjs, client/menu/menuCaption.mjs, client/ui/CreditsPanel.mjs.
- **Layout:** client/menu.css, client/mobile.css, client/challenges.css, client/renown.css.

## Voice and information contract

| Speaker / surface | Positive model | What not to do |
| --- | --- | --- |
| Spellblade | Exaggerated self-importance, absolute confidence; inconveniences undermine him | Make him generic and heroic, or fully self-aware of the absurdity |
| Narrator | Short, precise, dry replies; works through silences | Speak like another boastful knight or explain jokes |
| Rival | His own combative, defensive, petty rhythm | Treat him as an interchangeable Spellblade |
| Engineers / Story of Siege | Straight-faced ridiculous contraptions, layered wordplay, bureaucratic ingenuity | Simplify the machine's story to an advertising blurb |
| Impersonal interface | Controls, durations, cooldowns, failure recovery and eligibility accurately stated | Joke at the expense of usable instructions |
| Herald and institutions | Official pronouncements whose importance exceeds their reward | Generic game-company marketing or wink at the joke |

**Card fields:** line = *what it does*; facts = *measurable behavior and restrictions*; lore = *a distinct observation or authored joke*. Repeated numbers should be imported from shared rules when safe. Do not fill all three fields with three versions of the same tutorial paragraph.

## Applied changes — source, original, replacement, reason

These are changes actually committed to the branch, not proposals.

| ID / source path | Original | Revised text / behavior | Rationale |
| --- | --- | --- | --- |
| A01 client/menu/armoryView.mjs — All-Natural Disaster facts | “40 PHYSICAL · +13 FIRE · +11 FROST · +8 GALE · +12 LIGHTNING …” | “46 PHYSICAL · +13 FIRE · +11 FROST · +8 GALE · +12 LIGHTNING …” read from the shared damage constants | 40 was false; keep +8 until gameplay changes to intended +1. |
| A02 same — All-Natural Disaster line | “Simple Sunder: a spinning sword strike and rock-breaking slam. Earn Fire, Frost, Gale and Lightning separately from real spell encounters.” | “A committed sword slam that fractures the ground. Earn Fire, Frost, Gale and Lightning infusions through separate spell encounters.” | A distinct committed strike, not a sustained spinning attack; succinct acquisition. |
| A03 same — All-Natural Disaster lore | “All-Natural Disaster channels multiple elemental aspects through the blade. Builds upon physical Sunder with distinct aerial and blink infusions.” | “Simple Sunder evidently did not account for the elements. The oversight has been corrected at considerable expense to the surrounding ground.” | Lore offers a different joke instead of redundant mechanics. |
| A04 same — Line of Conduct facts | Hardcoded “20 close → 12 extreme · 6s cooldown” | Same display, but from ONE_HIT_RULES and spell cooldown | Prevent future rules/copy drift. |
| A05 same — Line of Conduct lore | “Arcing lightning conduit. An instantaneous linear discharge that punishes tight formations and leaves an energized trace across the ground.” | “A strict line of conduct, drawn where nobody sensible should stand.” | Stop repeating the line's mechanics, preserve name-based wordplay. |
| A06 same — Fireball lore | “The classic martial sorcery. Concentrated flame gathered in the off-hand and cast with destructive conviction.” | “The off-hand makes its point with fire. It seldom requests a reply.” | Remove generic “classic” fantasy praise. |
| A07 same — Coreflagration lore | “Dense volcanic pyromancy. A hurled magma core cracks on initial contact, creating a delayed explosive threat that skilled fighters can parry away.” | “The first burst is a warning only in the technical sense: it also hurts.” | The line/facts already explain double impact and parrying. |
| A08 same — Frostfire lore | “Glacial bolt. Drains momentum upon contact, drastically reducing target movement and sprint speed during critical maneuvers.” | “The Spellblade prefers opponents who take time to compose themselves.” | Treat slow as information, not repeated lore. |
| A09 same — Gale facts | “Up to 8 damage · 11m reach · burst / balanced / sustained · 6s cooldown” | “Up to 8 close damage · shove to 11m · burst / balanced / sustained · 6s cooldown” | The pressure extends farther than the damaging core. |
| A10 same — Steel lore | “An ancient chivalric ward that fortifies armor plates. Incoming attacks glance off while your Dash transforms into a devastating physical ram.” | “Hardened plate has made the Spellblade unusually confident about running into people.” | Removes generic “devastating”, leaves ram mechanism in line/facts. |
| A11 same — Sunder lore | “Pure martial overwhelm. Each heavy strike splits stone beneath your feet, bypassing ordinary Guard and breaking defensive stances.” | “Every strike is a verdict delivered from above. Guard takes the weight of two blows; hardened Steel is less impressed.” | Ordinary Guard loses two impacts; it is not simply bypassed. Steel modifies the interaction. |
| A12 same — Chivalry lore | “The apex of Spellblade doctrine. Seamlessly weaves concurrent swordplay, automatic parrying, and prepared spell rotations without posture delay.” | “The Spellblade sees no reason to choose between swordplay, sorcery and self-preservation. The schedule is someone else’s concern.” | Replaces marketing adjectives and repetition. |
| A13 same — Vortex lore | “An unstoppable offensive whirlwind. Ignites the blade and propels the Spellblade forward in a mobile blaze of cuts and projectiles.” | “The sword goes round, the fire goes forward, and the Spellblade remains certain this counts as a plan.” | “Unstoppable” is untrue; Vortex has vulnerabilities and restrictions. |
| A14 client/index.html — How to Play | “Spells & Chivalry … for 9 seconds.” | “Spells & Chivalry … for 10 seconds.” | ULTIMATES.chivalry.activeSec = 10. |
| A15 client/main.mjs — sword-technique inspector | “Masterful stances and weapon abilities for the Castleward longsword.” | “Two sword techniques are in training. The Castleward longsword is already equipped.” | Longsword is equipment, not a third technique. |
| A16 client/main.mjs — Masterstroke inspector | “Spend built Prowess to unleash a battle-turning technique.” | “Fill your Prowess meter to use your chosen Masterstroke.” | Explain activation instead of selling spectacle. |
| A17 client/index.html — Shared Practice invite | “Friends join through Multiplayer → Join Private Room using this code.” | “Friends: open Private Match, enter this code under Join by Code, then choose Join.” | Obsolete navigation; current menu is PRIVATE MATCH / OR JOIN BY CODE. |
| A18 client/main.mjs — High Grounds foundry | “PREPARING AUTHORED SIEGE MACHINE…” (both runtime messages) | “PREPARING SIEGE MACHINE…” | “Authored” is developer-facing terminology. |

**Regression tests:** client/menu/armoryView.test.mjs now checks dynamically sourced damage/infusion values, Line of Conduct bounds, Gale shove range, How to Play Chivalry duration, Shared Practice's current menu route, and foundry language. No gameplay constants or ability IDs were modified.

## Editorial approval queue — proposals **NOT** applied

These are documented, not rewritten. Protected established jokes and voiced dialogue remain in their original sources.

| ID / file | Original player-facing string | Suggested treatment | Rationale / decision needed |
| --- | --- | --- | --- |
| R01 client/menu/siegeArmoryView.mjs — Bi-Bye-llista overview | “Long-range twin-bolt mobile siege artillery. Deploys ground outriggers to align its massive physical bolt, preceded by an inconvenient frost-conditioning shot.” | “A mobile ballista. Anchor its outriggers for the heavy bolt; its first shot delivers frost.” | Clear and separate from Story; verify heavy aim restrictions. |
| R02 same — Bi-Bye-llista Story | Opens with “A traveling frost-conditioning bolt followed by a massive physical siege bolt.”, identical to preview | Consider starting at “Castleward's engineers saw no need to settle for a single warning shot.” | Potential duplication, but setup may be intentional; preserve subsequent punchline, seek approval. |
| R03 same — So-Fist-ication overview | “Piston-driven elevating battering ram. Combines heavy mobile carriage protection with an armored steel gauntlet capable of delivering mechanical uppercuts.” | “An armored, elevating ram with a piston-driven steel fist.” | Reduce overloaded nouns. Do **not** describe thrown fist as universal; depends on chosen skill. |
| R04 same — So-Fist Story | Opens by repeating “A charging, piston-driven battering ram capable of delivering a mechanical uppercut.” from preview | Candidate: remove only duplicate sentence, preserve “all the subtlety of a clenched fist” and wall-introduction sequence | Authored comic setup; approval before touching. |
| R05 same — Fight-and-Flight Story | “Why choose to Fight or Flee? When you could be Free?”; ends “It is simply doom. And it is nigh-unreachable.” | **Retain verbatim** | Layered fight/flight/flee/free and escalating doom; cannot be compressed without losing identity. |
| R06 same — heavy bolt attack | “Massive high-velocity physical bolt engineered to dismantle stone defenses and armored formations.” | “Heavy physical bolt for armor and masonry.” | Avoid inflated mechanical copy; verify stone damage behavior. |
| R07 shared/src/challenges.mjs — SEIZE THY SLAYER | “Defeat an enemy Spellblade with your sword while their committed, imminent sword or gauntlet strike would otherwise kill you. Do not Guard or Dash through the decisive contact; have a lethal damaging spell ready but use your sword instead. Bots count only at Spellblade difficulty.” | Short summary plus expandable **complete original conditions**; candidate summary: “Win a lethal sword exchange despite having a killing spell ready.” | Important eligibility details cannot be discarded; requires UI work and rules check. |
| R08 shared/src/challenges.mjs — WIND CORRECTION | Hint: “The wind is not particular about straight lines.” Flavor: “The wind was apparently not particular about straight lines.” | Possible separate completion remark: “The correction has been filed.” | Near-identical joke in hint and reward, but author approval needed. |
| R09 shared/src/challenges.mjs — ST. PERRY THE PLAIN | “I suppose anyone can become a saint... these days.” Reward: 0 Renown plus emblem | **Retain** | Grandiose canonization with a conspicuously small institutional reward is deliberate comedy. |
| R10 shared/src/challenges.mjs — MUTUAL MORTALITY | “One of us won't recover.” exists in CHALLENGE_PREVIEWS with available:false | Keep gated as “IN PREPARATION”; never silently treat as live | Preview and earnable feat must be distinguished. |
| R11 client/menu/ChallengesController.mjs — introduction | “Master combat techniques. Completed feats grant Renown once and are saved after server matches. Practice is for training.” | “Complete feats in server-hosted matches to claim Renown once. Practice awards none.” | Not every feat is a technique. Confirm settlement path before changing. |
| R12 client/menu/renownView.mjs — sufficient balance | “Within reach. Unlock this standard.” | “Enough Renown to unlock this standard.” | Use resource state instead of generic encouragement. |
| R13 same — Solo reward | “Solo training complete. Renown is earned in server hosted matches.” | “Solo training awards no Renown. Server-hosted matches can.” | Clearer restriction, subject to full reward policy review. |
| R14 client/menu/RenownController.mjs — equip feedback | “equipped. Your next battle awaits.” | “equipped for your next battle.” | Routine confirmation need not be heroic advertising; preserve dynamic item name. |
| R15 client/ui/heraldNotices.mjs — welcome | “Welcome to Castleward. Swords & Sorcery is a free fantasy arena game where swordplay meets sorcery.” | “Castleward's gates are open. Swords & Sorcery is free to play.” | “X meets Y” is generic marketing. Official publisher notices require owner approval. |
| R16 same — development note | “The game is still in its early stages. Thank you for playing, sharing feedback, and following its development. Castleward will keep growing through that work.” | Candidate: “The yard remains under construction. Reports of loose masonry are welcome.” | Has voice but loses explicit feedback request; approve or combine with a truthful CTA before replacing. Preserve dated dispatch history. |
| R17 client/index.html — Practice siege default | “A marvel of combative engineering: compact, brutal, and devoted to destruction, much like the denizens who created it.” | Machine-specific functional first sentence, e.g. “Two bolts: one for the cold, one for the conclusion.” | A default fallback may show briefly before dynamic copy; confirm update timing. |
| R18 client/main.mjs — trial settlement | “SETTLED TO PROFILE: [count] · PENDING: [count] · UNAVAILABLE: [count]” | Consider “RENOWN RECEIVED / AWAITING CONFIRMATION / NOT AWARDED” **only if state meanings align** | Backend vocabulary leaks into reward UI; must check unavailable semantics. |
| R19 client/menu/challengeCard.mjs — solo card | “THE TRIAL AWAITS” for Bot Duel, Restless Day, Edge of Victory and Renown Trials | Use mode-specific kickers, preserving the trial line for Renown | Make the modes distinct; check existing intro assertions/animation. |
| R20 client/settings/settingsRegistry.mjs — Soundtrack hint | “Choose a soundtrack theme or let the music adapt dynamically” | “Choose a theme or let the music follow the battle.” | More natural, without changing the adaptive setting. |
| R21 client/index.html — Chivalry manual block | One extended paragraph covering Guard, spell switching, desktop and touch bindings, startup exceptions | Divide into labeled short paragraphs, **preserve every restriction** | Dense on mobile but not proven clipped; requires layout/browser checks. |
| R22 client/menu/armoryView.mjs — Full Lightning label | “FULL LIGHTNING: BLINK” | Consider “FULL LIGHTNING: CHARGED TELEPORT” in detailed help, not necessarily short facts | Held, validated teleport is more conditional than casual “blink”; consult existing terminology. |
| R23 client/index.html — Solo trial choice | “Timed waves · earn prestige or face the Rightful Renowner” | Consider “Survive the waves; earn Renown or face the Rightful Renowner.” | “Prestige” may be misread as a separate currency; confirm desired distinction. |
| R24 client/menu/renownView.mjs — Heraldry missing emblem | “From Challenges. Challenge and heraldry artwork in development.” | Separate “not yet earnable” from “artwork in development” if they have different gates | Presentation readiness must not masquerade as reward availability. |
| R25 client/menu/siegeArmoryView.mjs — controls | Desktop text lists fixed letters in machine controls | Review against settings key remapping and touch input before changing | Static instructions could become inaccurate with remapped bindings; do not invent an interaction. |

## Protected authored examples — no changes authorized

- **Tutorial** at client/tutorial/tutorialScript.mjs: “That is quite exemplary of me! If I do say so myself.” / narrator's “You did.”; “You can also walk.”; “I am a Knight. And a mage. He may choose to do so himself.”; rival's “I despise this.” The pauses, abrupt replies and character awkwardness matter. Do not polish or rewrite existing voice lines.
- **Siege** at client/menu/siegeArmoryView.mjs: names **BI-BYE-LLISTA**, **SO-FIST-ICATION**, **FIGHT-AND-FLIGHT**, **Bolt to the Occasion**, **Cold, How Touching**, **Beat to the Punch**, **Long Arm to the Jaw**, **Fire Away? I'm Right Here.**, **Narrow to One**, **Do Not Stop My Ascension!**. Preserve all authored Story of Siege text pending specific approval.
- **Challenges** at shared/src/challenges.mjs: **THREE PART ARGUMENT**, **TURNABOUT**, **SEIZE THY SLAYER**, **MIND THE GAP**, **WIND CORRECTION**, **POLISHED UNDER PRESSURE**, **NOT YET**, **AGAINST BETTER JUDGMENT**, **BOTH HANDS FULL**, **PASSING REMARK**, **ST. PERRY THE PLAIN**, **WELL BALANCED**. Hide unrevealed challenges and retain actual eligibility conditions.
- **Trial/ceremony** at client/ui/renownTrialsView.mjs: “The tiny tray dispenses its reward.”; “An ordinary harmless consolation coin slides from the dispenser.”; impassive statue and Rightful Renowner lines. The contrast between majestic judgment and humble coin is the joke.
- **Mode identities:** **MODES OF METTLE**, **RAMPAGE TO RENOWN**, **RESTLESS DAY**, **EDGE OF VICTORY**, **THE HIGH GROUNDS** and **THE COURT OF MERIT** stay distinct. Edge lobby's “retreat is beneath your Spellblade” line is a useful example of mechanical stakes expressed in characterful language.
- **HUD and system errors:** “WAITING FOR ANOTHER SPELLBLADE”, “LOCK HELD · NO CLEAR SHOT · FIRE PAUSED”, “TARGET MARKED · OUTSIDE CROSSBOW ARC”, “YOUR MACHINE IS ON THE ROAD PAD · APPROACH TO MOUNT” and “Confirmation delayed. Reconnect or retry; repeat requests are safe.” are worth retaining for their clarity.
- **Settings:** camera motion, subtitle support, sound/music toggles, device-specific sensitivity, button scale and orientation labels are concrete rather than showy. Preserve control/action IDs and accessible descriptions.

## Authoritative mechanics register

| Shared implementation | Fact verified | Consequence |
| --- | --- | --- |
| shared/src/oneHitInfusions.mjs | ONE_HIT_BASE_DAMAGE = 46 | Base physical fact now imported, not hardcoded. |
| shared/src/oneHitOfWondersRules.mjs | First partial/full decisive-impact bonuses 13 fire, 11 frost, **8 Gale**, 12 lightning; one addition per element | Do not claim Gale +1 exists. Requested gameplay balance change belongs in another PR, with tests. |
| shared/src/oneHitInfusions.mjs | Two independently earned tiers from real spell-use encounters; full Gale for aerial form | Practice presets are not ordinary multiplayer progression. |
| shared/src/oneHitOfWondersRules.mjs | Full Lightning teleport uses a charge-time reach function | Detailed instructions should not promise an unrestricted instantaneous blink. |
| shared/src/ultimates.mjs | Spells & Chivalry activeSec = 10 | Fixed manual's 9-second claim. |
| shared/src/ultimates.mjs | Sunder uses guardImpacts = 2; hardened Steel moderates contact | Guard isn't uniformly bypassed. |
| shared/src/spells.mjs | Gale: 8 close damage, pressureReach = 11m | Damage is not asserted throughout shove region. |
| client/menu/armoryView.mjs | Two named sword-technique training previews disabled; Castleward longsword separately equipped | Do not present longsword as an extra technique. |
| shared/src/challenges.mjs | MUTUAL MORTALITY is an unavailable preview, not a live CHALLENGES award | A preview must remain labeled as such. |
| shared/src/modes.mjs | Public room modes are a selected subset of available modes | Mode menu must not promise every variant as public-match joinable. |

## Mobile, truncation and behavior review

**Source-only, not live-rendered:** client/menu.css provides a scrollable How to Play pane and small inspector fonts. client/renown.css provides Armory scrolling, word wrapping and narrow-width/height container adjustments. client/challenges.css lets long challenge conditions wrap and use auto-height cards. These reduce clipping risk but do **not** prove mobile readability. In particular, test All-Natural Disaster's long facts row and the unusually complex SEIZE THY SLAYER feat at touch landscape widths; do not call them "truncated" without measurements.

Required sign-off checklist:
1. Armory spell/technique/Masterstroke inspector and long facts on desktop and mobile landscape. Check 46 damage, independent elements, scroll and focus.
2. All three siege machine previews; expand Story of Siege; ensure no comedic line or paragraph was lost.
3. Challenge Ledger including long eligibility text, hidden hints, 0-Renown emblem and unavailable previews.
4. How to Play complete scrolling, Chivalry ten-second text, desktop keys and touch gestures.
5. Private Match invitation flow from Shared Practice.
6. Renown/Heraldry equip and rewards, score/end screens, matchmaker/reconnect notifications, settings screen, subtitles and accessibility.
7. Run repository's available targeted Node tests, suite/CI, and browser/mobile checks before marking ready.

**Execution limitation:** GitHub source reads/writes were available, but this session did not have a runnable checkout or an instrumented browser for the target build; Node tests, UI screenshots and deploy validation were **not executed here**. Added source-backed assertions are committed but cannot be reported as passing until CI or a developer runs them.

## Change boundaries

No voiced character dialogue, recorded VO, tutorial script, siege Story of Siege, established names, challenge conditions, reward definitions, gameplay damage, ability timing, control binding identifiers, accessibility attributes or localization pathways were changed. All uncertain edits above await approval. Keep the pull request **DRAFT**; do not merge or deploy.