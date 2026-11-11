# All-Natural Disaster: live impact contract

The shared room is authoritative for who was hit, position, damage, status duration, blast radius and timing. The same room code powers local Practice. Visual particles neither deal damage nor invent an impact.

| Track | First infusion, added once to the decisive hit before aerial falloff | Half | Full (inherits Half) |
| --- | ---: | --- | --- |
| Fire | 13 HP (Fireball's edge) | Reach, not burn. The grounded blow is 4.6 m wide (3.4 m without) and reaches 3.5 m up. The sword wave catches 1.5 m out on every side (0.9 m without) and ends in a 3.0 m explosion. No burn status. | Burning ground where the blow, or the wave's end, has ground under it. Its licks die down with it (3 falling to 1 per half second). Nothing else burns. |
| Frost | 11 HP (Frostfire's edge) | Slows for 2.5 s. The decisive contact stays open 0.3 s longer for a knight it has not yet met. | Flash Freeze for 0.9 s, slows for 3.8 s, and the field chills whoever stands in it by what is left of it and how much of them is inside. The field never freezes. |
| Gale | 1 HP (the least a gust deals; its 8-point heart is its most) | A shove two and a half times the plain blow's (about 1.8 m); Blustered on the struck; during the wind-up, a wind that turns each incoming enemy spell aside once. | Grounded gathering, airborne activation, the aimable aerial sword wave. With Full Lightning, a three-dimensional teleport that never arrives over the void. |
| Lightning | 12 HP (Line of Conduct's floor) | The 0.36 s wind-up; Shocking Conduct on the struck, on the ground and in the air. | The held logarithmic teleport; the field passes on Shocking Conduct. |
| Steel | 2 HP (the least a qualifying Steel Dash ram deals: `ramEffect(STEEL_RAM.minStrength)`) | Interrupts the struck; ordinary blows do not stagger the wind-up; the rupture becomes an eight-armed radial fracture whose arms Shake whoever they catch. | Twelve longer arms; cannot fall below 1 HP during the attack (what would have killed resolves as it ends); the struck knight's Skills all restart their cooldowns from full. |

Ground base contact is 46 HP (85 with all five first-tier infusions), aerial base contact remains 36 HP before its existing distance multiplier. No infusion adds a second direct hit at Full. The preparation vortex retains its existing damage cap. Mixed infusions share one swing and one decisive damage event per victim, kept by one registry for the whole attack: the grounded blow, the moving wave, the wave's end and Frost's longer contact all read and write the same list.

A successfully guarded Disaster costs the Guard 40 stamina, whatever the blow carries. Steel adds nothing to that and takes no Guard stamina from the struck or through its fracture.

## Order

1. The impact and any directional Guard.
2. The one decisive HP hit.
3. Shaken and the statuses the blow carries.
4. The rupture.
5. What is left behind: Full Fire's burning ground, then the field. Nothing left behind exists while the blow itself lands, so the decisive hit is never charged against its own field.

## Fire carries the rest

Fire's wider reach is the same decisive contact, not a second explosion. A knight only Fire's reach catches takes the one decisive hit with every other infusion's consequence on it: Frost's slow or freeze, Gale's shove and Blustered, Shocking Conduct, Steel's interruption and cooldown restart, and Shaken. Where the sword wave ends, a wave without Fire leaves its landing gust (2.2 m, no HP). A wave with Fire explodes (3.0 m), and whoever it had not yet met takes the decisive hit there.

## Fire and Gale

With both, the shove is by where the struck knight stood: the whole of it from the heart of the blast, a tenth of it at the edge. Struck knights come to rest in or on the 4.6 m of Full Fire's ground instead of beyond it. It is a shove, not a wall: a ledge is still a ledge. Gale without Fire throws as far as ever.

## Frost holds; Steel interrupts

Flash Freeze holds a knight for 0.9 s: no moving, no turning, and no new sword blow, spell, fist, dash, Guard or ultimate. Whatever they were already doing is held where it was and carries on when the ice lets go (a gathering spell is loosed late, a swing lands late, a wind-up resumes). A spell already in the air flies on. It writes no `actionInterrupted` event and no interruption fact. Only Steel cancels.

## What the grounded blow leaves

Every grounded Disaster leaves one field where it landed, the size of the blow. It is strongest as it lands and runs down evenly to nothing. **Every persistent field of a blow lasts 4 s plus 0.3 s for each distinct element the blow carried** (a Half or a Full stage counts once): 4.0, 4.3, 4.6, 4.9, 5.2, 5.5 s. That one rule (`fieldSeconds`) sets the baseline field, Full Fire's ground, Full Frost's ice and Full Lightning's charge. It is separate from Half Frost's 0.3 s, which is the decisive contact's, not a field's. A knight in several fields answers to the strongest only.

- Shaken recovers at only (1 − strength) of its pace inside it. Shaken is the knight's status; the field is the ground's.
- HP actually lost inside it (after any mitigation) by an enemy of its owner also costs Guard stamina equal to that damage times the field's strength, once per damage event: 20 HP at 60% costs 12.
- Full Frost: a slow of up to the direct hit's, times strength, times how much of the knight is inside.
- Full Lightning: Shocking Conduct of 12 × strength × contact. A weaker offer never replaces a stronger status; a field pays a knight again only for a clearly deeper contact than before; and it owes nothing to a knight its own blow struck. Standing in it or leaving and coming back never tops the status up.
- It needs a clear line from its centre and feet within 1.25 m of its ground. It does no HP damage itself; Full Fire's burning ground is separate and does.

An aerial Disaster leaves no ground field and no rupture. Its Full Fire still burns where its wave ended on ground.

## Statuses

- **Shaken** (every direct hit): the existing decaying Sprint suppression, three seconds.
- **Shocking Conduct**: a potential of 12 HP that decays to nothing over four seconds. The shocked knight's own next sword blow or gauntlet strike that would really land is stopped before it does any damage and what is left of the potential is dealt to them instead, once. A miss, a parried or a blocked blow does not spend it. Being struck does not spend it. (The sword contact used to read the defender's status here; a regression test holds the attacker's.)
- **Blustered** (Half Gale's direct hit): the fighting facing (sword, Guard) turns toward the look at no more than 2.4 rad/s, loosening to free over four seconds. The look itself and movement are not slowed.

## Steel, the fifth infusion

A knight carrying the Disaster earns one stage by wearing one Sheathe in Steel through its fully hardened five seconds without being staggered or killed (a mounted siege Steel does not count). A use that qualifies, by a knight who then holds a Steel stage, keeps its plate fully hardened until Steel's own cooldown is over (18 s from the call), then wears off as it always does. That longer plate earns nothing further. Full Steel's 1 HP floor covers a finite wind-up and the committed attack; a held Full Lightning aim has none, however briefly or long it is held. Half Gale's wind and Half Steel's bracing last an ordinary wind-up's length at most, so a held aim gives neither for ever.

## The sword wave

One crescent of cut air with fainter pressure arcs behind it, drawn at its real reach (larger with Fire). What it carries changes that same body: Steel makes it denser and grey, Fire burns along its lower limb, Frost rimes its tips and inner edge, Lightning branches along its arc. Embers, rime and filings stream back off the parts of the arc they belong to. There is no second projectile and nothing spins.

The sword wave can pass through eligible bodies. Real solid, floor or ramp contact emits one terminal event carrying the projectile ID and tiers. A range expiry dissipates without exploding. Directional Guard consumes one contact, and allies, protected players and occluded players cannot be caught. Zone ticks still use ordinary Steel mitigation and require floor proximity and an unobstructed path.

The third-person body plays Argon's authored Disaster clips, each placed so that the frame in which its blade reaches the ground (or throws the wave) is shown at the authoritative commit (`DISASTER_CLIPS` in `client/game/spellbladeAnimationPlan.mjs`; `Slash_3` is the fallback for a model without them). The clips are used as delivered: each slam drives the blade well below the floor and the ground spins carry it under the floor (figures in `docs/verification/refinement-v-combat-acceptance.md`). The presentation shows that as a blade scoring and then breaking the ground. Correcting it in the clips is Argon's.

## Adjacent work remaining

Rigid Riposte and Whirl Like the Wind are unavailable. Their authored lunge/parry and spinning sweep timelines need blade transforms plus shared action, cooldown, Guard and interruption handling before they can be selected. The ordinary longsword remains equipped.

The Bi-Bye-llista v4.3 asset contains `Traverse_Mount`, `Elevation_Cradle` and the paired `Main_Limb_L/R` bow meshes. The visible outer edges are baked into the bow meshes, with no contract identifying an approved striking segment or its thickness. The main cradle's ordinary lower pitch stop is approximately 0.15 rad below level. Bolt to the Occasion steers that same cradle while primed. Ask Argon for paired base/tip markers on each intended striking surface, local thickness and demonstrated standing/crouched clearance at legal pitch. Sample those along the existing cradle pose, sweep the actual edges against the existing body and world solids, and only then tune contact speed, separation and rearming. No center damage proxy or new input is introduced here.
