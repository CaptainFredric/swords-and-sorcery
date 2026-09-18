# Experimental Sorcery Variants

These are **future ability/class modifiers**, not additions to the current base Spellblade. The base game stays Sword + Guard/Parry + Fireball + Dash until it survives human playtesting.

The design goal is not “more spells.” Each variant should change how an existing combat verb interacts with another one.

## 1. Spell Sink — held Fireball absorption

**Concept:** Holding Fireball does not immediately cast. For a short window, the forming orb absorbs nearby non-heavy hostile spells.

Potential structure:

- Hold Q to create a small absorption field for roughly 0.7–1.0 seconds.
- The caster remains vulnerable to swords and gives up ordinary Guard while channeling.
- The field can absorb at most one meaningful projectile per cast cycle.
- Releasing Q launches the stored Fireball.
- An absorbed spell could increase projectile radius/knockback rather than simply adding raw damage.

**Why it is interesting:** Fireball becomes both offense and spell defense. It creates a prediction duel between casters instead of merely increasing projectile DPS.

**Main danger:** A generous absorption radius could erase ranged combat. The field must be telegraphed, brief and punishable by melee.

## 2. Gravitic Fireball — moving vacuum projectile

**Concept:** A launched Fireball creates a weak vacuum around itself, pulling Spellblades and light/non-heavy spells toward its path.

Potential structure:

- Modest attraction radius around the projectile.
- Pull strength is enough to disturb movement/aim, not hard-stun players.
- Light projectiles have their trajectories bent toward it.
- Heavy spells ignore or resist the pull.
- Directly steering a target into the Fireball should be possible but not automatic.

**Why it is interesting:** The projectile changes nearby trajectories before impact. It becomes moving space control rather than “orange damage ball.” It can also create spell-on-spell interactions.

**Main danger:** Near cliffs, too much pull becomes an unearned environmental kill. Pull strength should be weaker on grounded players than on loose/light projectiles.

## 3. Hotfoot — self-splash movement technology

**Concept:** Fireballs detonated around the caster's feet always count as edge splash against the caster, cannot apply Burn to the caster, and grant a temporary run-speed state that lasts until the next Dash.

Potential structure:

- Self-hit is capped at edge splash damage rather than direct-hit damage.
- Self-splash grants one non-stacking `HOTFOOT` state.
- `HOTFOOT` increases run speed modestly.
- The next Arcane Dash consumes the state.
- Dash could receive slightly stronger distance/momentum when consuming it, if playtests justify the interaction.

**Why it is interesting:** This is effectively fantasy rocket-jump logic without requiring a literal rocket launcher. More importantly, Fireball and Dash stop being independent cooldown buttons: Fireball can prepare a movement state that Dash cashes out.

**Main danger:** If the health cost is negligible and the speed gain is too large, players will self-bomb on cooldown as mandatory traversal tech.

## 4. Flame Burst — Fireball replaced by a stream

**Concept:** Q no longer launches a discrete orb. It emits a short burst/stream of fire.

Potential structure:

- 0.6–1.0 second cone/stream.
- Several small damage ticks with a hard total-damage cap.
- Shorter effective range than Fireball.
- Better at sweeping close/mid-range space and pressuring multiple enemies.
- Still bypasses sword Guard.

**Why it is interesting:** This changes geometry, not just damage numbers. Projectile prediction becomes tracking/spacing.

**Main danger:** Continuous damage can become visually noisy and less skill-readable than discrete projectiles. Tick rate and total damage need strict caps.

## 5. Comet Cast — Fireball during Dash

**Concept:** This variant explicitly allows Fireball casting while Arcane Dash is active, creating a drive-by casting pattern.

Potential structure:

- Dash continues its committed movement while the caster aims independently with the reticle.
- Fireball launches from the moving caster without cancelling Dash.
- The cast does not grant invulnerability.
- Could slightly increase cast spread/error during the highest-speed part of Dash if the combination is too reliable.

**Why it is interesting:** It creates an offensive movement weave: approach, cross the target's angle, cast during transit, emerge somewhere else.

**Main danger:** If Dash already makes Fireball extremely difficult to punish, this combination may need a longer shared recovery.

## 6. Blazing Vortex — ultimate

**Concept:** Ignite the sword and spin at extreme speed for several seconds. The Spellblade can move slightly faster than walking, repeatedly cuts nearby enemies, continuously launches Fireballs toward the reticle, and spins fast enough to hover/slow descent while airborne.

Potential structure:

- 4–5 second transformation.
- Bright flaming sword + unmistakable audio telegraph.
- Repeating close-range melee sweep with per-target hit cadence limits.
- Reticle remains player-controlled while the character body spins.
- Smaller or reduced-damage Fireballs launch on a controlled cadence rather than normal full-strength Fireballs every frame.
- Movement remains steerable at about 1.05–1.15× ordinary run speed.
- Vertical fall speed is heavily reduced while active, producing the absurd hovering spin.
- Guard and ordinary Dash are disabled during the transformation.
- The user is dangerous, not invulnerable; ranged opponents can still punish bad positioning.

**Why it is interesting:** The ridiculous presentation is mechanically legible. The spin explains the melee AoE, flaming sword explains damage, reticle explains ranged output, and extreme rotation explains the midair hover. It is not arbitrary spectacle; all of its effects share one physical/comedic premise.

**Main danger:** This can easily become a “press ultimate and everybody dies” button. The counterplay must be obvious: distance, cover, focused ranged fire, or simply refusing to stand in the vortex.

## Natural future archetypes

These ideas already cluster into coherent identities:

### Gravity Spellblade

- Spell Sink
- Gravitic Fireball
- projectile manipulation / displacement

### Cinderstep Spellblade

- Hotfoot
- Comet Cast
- self-splash mobility / offensive Dash weaving

### Pyre Dancer

- Flame Burst
- Blazing Vortex
- close-range fire pressure / spectacular transformation ultimate

This is preferable to giving one class every modifier at once. A class should alter a small number of established verbs so opponents can still understand what they are fighting.
