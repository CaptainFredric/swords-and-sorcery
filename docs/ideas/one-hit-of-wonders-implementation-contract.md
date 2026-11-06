# One Hit of Wonders / Line of Conduct — design and integration contract

**Status: rules-only draft, NOT playable yet.** The current main branch has no registered One Hit of Wonders Ultimate or Line of Conduct spell. This branch adds testable math/decision helpers, not a replacement for Argon's in-progress implementation. Integrate with Armory, authoritative combat, input, network snapshots, VFX and browser gameplay before representing it as complete.

## Core identity

The Spellblade accumulates Fire, Frost, Gale and Lightning charges by casting qualifying elemental spells or being struck by them. Each independent elemental track has levels 0, 1, and 2. These tracks discharge when the Ultimate is used. The Ultimate occupies its own slot instead of Spells & Chivalry. One committed sword blow, rather than multiple unrelated elemental projectiles, carries the accumulated effects.

## Grounded and airborne

- **Form selection after teleport:** If grounded at the moment the attack commits, perform the normal grounded spinning cleave/slam. If airborne, require **full Gale** to perform the three-dimensional aerial variation. Lock the form at commitment; landing during the animation must not swap animations or cancel the attack.
- **Ordinary aerial sequence:** Multi-axis sword rotations generate an expanding sphere of visual slash arcs and relatively modest damaging vortex contact for approximately **0.85 seconds**. The player can continually aim during the vortex, including while falling. The committed final slash fires **one stronger traveling wave** in the selected direction; it loses damage and knockback with distance. Avoid treating each visual arc as another full attack.
- **Full Lightning hold:** Holding Ultimate charges distance for a teleport with rapid initial growth and diminishing returns but no arbitrary maximum. Teleport selection must validate actual destination geometry, world bounds and collision. The charging Spellblade descends slowly when full Gale enables midair use.
- **After the full-Lightning teleport:** Immediately perform the form appropriate to the **arrival** location: grounded slam or airborne traveling slash. **No second 0.85-second vortex windup.** Even a near-tap should release immediately once teleport resolves.
- **Held vortex:** During charge, elemental motion forms a small, caster-following concentrated aura. Increase brightness and turbulence as the charge progresses, but **do not continually expand the damaging sphere**. The indefinite hold must not confer permanent damaging area contact or projectile immunity. On release, show a very brief vortex discharge as part of the instant strike, not another delayed ability.
- **Aerial baseline:** Because full Gale is required for airborne activation, an aerial attack cannot technically be element-free. “Base aerial” means Gale only, without Fire/Frost/Lightning additions.

## Elemental consequences of the single wave / impact

- **Fire level 1:** explosive wider impact. **Fire level 2:** damaging burning field; caster immune to their own field.
- **Frost level 1:** Frostfire-style slow. **Frost level 2:** freeze until grounded attack animation ends; for delayed aerial projectile arrival, use a short freeze measured from hit and then slow.
- **Gale level 1:** defensive wind during the actual attack startup. **Gale level 2:** aerial eligibility and ability to gather opponents before the blow; its wave pushes foes away on impact.
- **Lightning level 1:** electrical delivery plus aerial-wave-only *reactive backlash*: an enemy struck has decaying potential shock damage, not passive DoT. Their next melee strike that would hit another enemy is interrupted before impact; they take the remaining potential damage, then the status ends. Missing attacks do not trigger it. **Lightning level 2:** charged teleport to a validated destination; no post-arrival attack windup.
- Co-infused attacks have ONE authoritative wave and ONE primary impact, with combined VFX. Do not duplicate explosions, apply each infusion's direct bonus on each visual slash, or multiply burn/status ticks.

## Elemental first-infusion damage bonus

**Each individual level-1 infusion** contributes exactly one additive direct-hit bonus to the **decisive attack**, not just whichever element was infused first. The bonus is retained at level 2 but not doubled. These starting numbers correspond to the latest default-branch spell definitions:

| Track | Bonus at level >=1 | Rationale |
| --- | ---: | --- |
| Fire | +13 | Fireball edge damage, fixed for the Fire track even when charged by Coreflagration |
| Frost | +11 | Frostfire edge damage |
| Gale | +8 | Gale Garner's direct damaging heart (its surrounding pressure does zero damage) |
| Lightning | +12 | Line of Conduct's long-distance damage floor |

A rare four-element decisive hit therefore gains +44 direct damage above its base **once per qualifying victim**, not on all vortex ticks, secondary blasts, burning ground or backlash. Check this magnitude under Steel, Guard, and team fights; the elemental control effects themselves can be substantial. Keep bonuses sourced from shared spell constants rather than copying magic numbers into server code.

## Line of Conduct (new Lightning spell)

The user-selected new Lightning spell name is **Line of Conduct**. Do not quietly rename another existing spell. It has no artificial maximum range but still respects geometry, target validation and playable world limits. Direct damage diminishes with distance:

`round(12 + 8 / (1 + distanceMetres / 12))`

Examples: 0m=20, 5m=18, 12m=16, 24m=15, 60m=13; tends to 12 at extreme distance. The pure helper is `lineOfConductDamage`, exported by `shared/src/oneHitOfWondersRules.mjs`. Tune the 12m half-falloff distance using real combat scale if needed; preserve 20ish near and 12ish extreme damage rather than imposing a hard distance cap.

The potential reach of a fully Lightning-infused teleport uses `22 * log(1 + heldSeconds / 0.9)` as a preliminary tunable curve. An instant tap barely moves; initial distance gain exceeds normal sprint; gaining farther distance takes increasingly long.

## Integration acceptance checklist

1. The named Ultimate and Lightning spell actually appear in Armory/prepared selections and can be activated on desktop and mobile, with appropriate mutually exclusive slots.
2. Accumulation from offensive casts and received effects is authoritative, once per qualifying event, and consumed on release. Display clear four-track levels. No free charging from harmless button spam.
3. Grounded vs full-Gale aerial forms are consistent; only Gale2 enables airborne activation and aiming; no softlock if the knight touches ground mid-attack.
4. Full Lightning near-tap is immediate after teleport; longer charge builds travel reach without an infinitely growing damaging aura. Full Gale + Lightning supports 3D aerial teleport and slows falling during charge.
5. Final wave is stronger than the vortex at close range, decays with travel distance, collides correctly with terrain and enemies, and carries all qualifying effects once.
6. Line of Conduct respects distance-damage numbers, visibility, and world validity. Shock backlash interrupts only a would-hit melee attack, once.
7. Real WebGL/Chromium with two clients validates animation, aiming, movement, sound, UI, authoritative projectiles and networking; no changes break existing Ultimates or siege machines.

**Do not merge/deploy this rules-only draft as a complete Ultimate.** It exists to keep the intended mechanics stable while Argon connects them to actual gameplay.
