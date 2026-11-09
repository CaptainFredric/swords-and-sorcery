# All-Natural Disaster: live impact contract

The shared room is authoritative for who was hit, position, damage, status duration, blast radius and timing. The same room code powers local Practice. Visual particles neither deal damage nor invent an impact.

| Track | First infusion, added once to the decisive hit before aerial falloff | Contact and Full behavior | Landing and visual read |
| --- | ---: | --- | --- |
| Fire | 13 HP | The existing burn remains 2 HP per lick, four licks. Full ground slams retain their 4.6 m area. | Full Fire can leave the existing 4.6 m, four second burning area if a wave hits near supported ground. The radius rim and coals come from the zone snapshot; an ignition core, moving embers and rising smoke resolve around the actual contact. |
| Frost | 11 HP | Partial slows for 2.5 s. Full freezes for 0.9 s and slows for 3.8 s. | Ice forms around a legitimately affected knight and breaks when the freeze expires. Partial displays frost at the feet without the cage. |
| Gale | 8 HP | The base hit applies Shaken, the existing decaying Sprint suppression. Full grounded Gale draws exposed rivals in; Full aerial Gale supports the existing glide, preparation and piercing sword wave. | A wave pushes in its travel direction. Its smaller landing gust applies Shaken to exposed new targets. There is no separate Blustered debuff in this contract. |
| Lightning | 12 HP | Partial retains the short startup. Full retains the held logarithmic teleport. Aerial contact retains the decaying electrical backlash, only resolved against a melee contact that would legally connect. | A yellow guide uses the teleport solver to show the currently reachable endpoint and dims if the endpoint is invalid. Forks and sparks indicate charge, discharge and backlash. |

Ground base contact is 48 HP (92 with all four first-tier infusions), aerial base contact remains 36 HP before its existing distance multiplier. No infusion adds a second direct hit at Full. The preparation vortex retains its existing damage cap. Mixed infusions share one swing, pressure burst and collision event, with distinct element layers.

The sword wave can pass through eligible bodies. Real solid, floor or ramp contact emits one terminal event carrying the projectile ID and tiers. A range expiry dissipates without exploding. The 2.2 m terminal splash can afflict a target that the wave has not already processed. It deals no extra decisive HP damage; Fire's existing burn and supported Full Fire ground zone still apply. Directional Guard consumes one contact, and allies, protected players and occluded players cannot be splashed. Zone ticks still use ordinary Steel mitigation and require floor proximity and an unobstructed path.

Held charge and attack use the existing Spellblade rig and animation hooks. The charge crouch is visual and does not change the collision body. For Argon: an authored held crouch with a repeatable settle loop, a driven sword release for grounded and aerial forms, and blade/contact markers aligned to the existing commit timestamps would replace the provisional poses without changing combat rules.

## Adjacent work remaining

Rigid Riposte and Whirl Like the Wind are unavailable. Their authored lunge/parry and spinning sweep timelines need blade transforms plus shared action, cooldown, Guard and interruption handling before they can be selected. The ordinary longsword remains equipped.

The Bi-Bye-llista v4.3 asset contains `Traverse_Mount`, `Elevation_Cradle` and the paired `Main_Limb_L/R` bow meshes. The visible outer edges are baked into the bow meshes, with no contract identifying an approved striking segment or its thickness. The main cradle's ordinary lower pitch stop is approximately 0.15 rad below level. Bolt to the Occasion steers that same cradle while primed. Ask Argon for paired base/tip markers on each intended striking surface, local thickness and demonstrated standing/crouched clearance at legal pitch. Sample those along the existing cradle pose, sweep the actual edges against the existing body and world solids, and only then tune contact speed, separation and rearming. No center damage proxy or new input is introduced here.
