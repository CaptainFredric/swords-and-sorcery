# Swords & Sorcery — Siege Machine Skills

> **Implementation status:** Bolt to the Occasion and Beat to the Punch have an initial playable implementation on the Siege Skills candidate branch. Fight and Flight remains a preparation contract, with no integrated apparatus or playable flight Skill. Numeric Skill tuning remains provisional.
>
> **Core principle:** Skills belong to specific machines. They extend or temporarily violate their normal mechanical operating rules in distinctive ways, rather than supplying generic damage bonuses.

The three machines have fundamentally different strengths: Bi-Bye-llista provides ranged siege pressure, SO-FIST-ICATION provides physical ground impact, and the proposed Fight-and-Flight is a wearable airborne weapons platform. Each Skill should use the actual machine geometry, movement, ammunition, collision, and damage systems.

## Shared rules

- **Machine-owned cooldowns.** Changing, removing, or defeating the Spellblade operator must not reset the Skill timer. Cooldown state is authoritative and travels with that particular machine.
- **Persistent resource debts and special states.** Disarming, dismounting, reboarding, or exchanging operators cannot erase ammunition debt, pressure expense, an armed counterattack, or a once-per-machine restriction.
- **Real combat.** Hits must arise from actual projectiles, rotor collisions, or piston sweeps. Preserve the established Guard, mitigation, knockback, component damage, and world-collision rules unless a Skill explicitly defines an exception.
- **No implicit ammunition creation or repair.** Spending a loaded bolt consumes it; activating a Skill does not restore machinery, health, cooldowns, or Ultimate charge.
- **Operator versus machine resources.** Ultimate meter belongs to the Spellblade. Machine Skill cooldowns, flight charge, ammunition, and durability belong to the machine. Terminal-dive availability belongs to the specific Fight-and-Flight machine for the match.
- **Operator changes.** Restore proper controls, cameras, animation, and ownership when entering/exiting machinery. No stale state, duplication, unintended resets, or multiplayer exploits.
- **Presentation.** Show ready/cooldown, active states, and relevant debts/risks in a comprehensible HUD. Use the existing Castleward aesthetic. Support desktop and landscape-touch inputs.
- **Inspection Yard.** Make the Skills genuinely stageable and testable within the local sandbox when implemented; the tools must not grant competitive privileges or rewards.

Numeric values below are either user-proposed baselines or provisional testing suggestions. They are not final balance decisions.

---

# 1. Fight-and-Flight

**Type:** Proposed wearable aerial siege apparatus. The Spellblade stands inside a heavy oak/iron/brass skeletal protective frame with a sword-shaped two-blade overhead rotor, helmet-like side braces, crimson heraldic cloth, and a fast-firing left-side repeating crossbow. The right arm retains the sword. It should feel like a substantial flying support weapon, **not** a small toy helicopter backpack.

### Proposed ordinary operation

- Crossbow fires approximately **7 bolts/second**, **3 raw damage** per bolt at shorter range and **2** beyond dropoff. Aimed fire remains fairly accurate; do not arbitrarily impose extreme spread.
- Bolts refill **passively**, including during firing. A depleted magazine does not wait for a full reload: the weapon fires newly produced bolts individually, as they become available. A tentative test baseline is 14 stored bolts, 2 bolts/second refill, subject to tuning.
- Rotor lift uses a charge reservoir. Faster climbing spends charge more quickly. A controlled descending/freewheeling cycle can recover charge. Skillful sustained flight may be possible, but is not unlimited rapid ascent.
- Airborne: can attack with sword and crossbow; **cannot normally Guard, Dash, or cast spells**. Grounded with intact apparatus: can Guard and jump, but has heavy, limited sprinting/movement; ordinary spellcasting and Dash remain restricted.
- **Spells and Chivalry** is the existing named Ultimate and the **explicit exception**: while it is active, permit the applicable Guard, spellcasting, and midair Dash capabilities. Do not generalize this exception to every Ultimate.
- Independently destructible proposed parts: **250 HP main apparatus, 100 HP rotor, 80 HP each side brace**, subject to tests. Braces and rotor have passive Sheathe in Steel protection/sound/effect, following finite, established mitigation rules. Hit volumes matter: body shots hurt the Spellblade; intercepted shots hurt machinery; there should be no hidden HP-dependent overkill redirection.
- Destroyed rotor ends lift and rotor weapon contact; the remaining heavy crossbow apparatus can function on the ground. Destruction of the main apparatus ends machine operation. The operator remains subject to actual body damage and fall physics.
- Intended character line after surviving a rotor-loss landing with functioning repeater: **“AHA! JUST IN TIME FOR MY GROUNDED DEBUT!”**

## Skill — Fire Away? I'm Right Here.

**Type:** Temporary firepower acceleration versus flight stabilization. **Cooldown and active duration: TBD.**

**When firing:** The Skill borrows future crossbow replenishment. During activation, the reserve receives enough *additional* bolts to support its ordinary maximum firing rate; the borrowed portion accrues a **reloading debt** on this machine. When the Skill ends, passive ammunition production must repay that debt before generating fresh usable bolts. The weapon cannot keep firing from nonexistent ammunition. Existing stored bolts must not be counted as borrowed twice.

- Debt should reflect **extra ammunition actually delivered**, not a flat penalty for activating but firing nothing.
- No special spread penalty is required. Existing projectile rules still apply.
- The debt persists across operators, mounted status, and any other normal machine state changes.
- Normal machine-specific firing-rate, timing, and ammunition limits still matter.

**When not firing:** Divert available capacity to flight: charge regeneration should approximately match the cost of maintaining stable altitude while the Skill is active. This supports hovering/steady flight, **not** unlimited high-speed climbing.

**Tactical choice:** Spend tomorrow's bolts to suppress opponents now, or forgo firing to sustain your aerial position.

**Verification:** Shoot throughout the Skill; stop early; fire zero shots; exhaust reserve; accrue and repay debt; transfer operators; verify that stored ammo plus borrowed ammo never exceeds allowed actual shots.

## Skill / special Dash — Flight to the Valkyrie

Two related operating forms, with distinct commitments and resources:

### A. Offensive flight run

**Activation:** Hold Dash while operating Fight-and-Flight. Spend the **Spellblade operator's personal Ultimate power** rapidly, provisionally from full to zero in about **2–3 seconds** of sustained use.

The apparatus pitches forward and accelerates along its aim/flight direction. The rotor becomes an attacking leading surface:

- Rotor impacts deal actual damage and stagger. Each contact episode must avoid repeated full hits from overlapping simulation ticks.
- The exposed, forward-oriented rotor is **more vulnerable to incoming damage and collisions**.
- Maneuvering becomes difficult at speed, favoring strafing/straight attack runs over tight turns. Weapons remain usable but harder to aim because of the machine orientation; do not fake aim penalties unrelated to geometry unless testing warrants them.
- Holding Dash alone **is not the terminal sacrifice**. Releasing Dash, running out of personal Ultimate power, or losing sufficient machine function ends the normal attack run.
- Remaining Ultimate charge and machine durability are not restored when the run ends.

### B. Terminal Valkyrie Dive — alternative Ultimate expenditure

**Activation:** While **Spells and Chivalry is ready but unspent**, hold **Dash + Ultimate together for about 1 second**, with an unmistakable commitment cue. After commitment, consume that ready Ultimate and the machine's **one terminal dive per match** opportunity. Do not automatically trigger it from a normal Dash hold or an ordinary Ultimate button tap.

- The apparatus tilts forward/down toward the chosen trajectory and accelerates into an **irreversible terminal charge**. Rotor contact deals legitimate physical damage.
- The operator can still fire the weapons, but cannot aim them upward independently of the committed apparatus geometry.
- The stressed structure takes progressive **burn damage every second** during the dive.
- If the rider is defeated mid-flight, the machine **continues along the committed trajectory with its actual remaining momentum** until the terminal outcome resolves. Personal respawn time begins after resolution, with a finite hard maximum to prevent indefinite delay.
- A direct collision with substantial terrain, masonry, a solid structure, or another appropriate obstacle detonates the apparatus. The explosion inflicts strong **epicenter-weighted radial damage**, falling off outward, and leaves a burning ground area. Its lifetime may depend on remaining machine integrity.
- The operator is defeated, the apparatus destroyed, and the machine's once-per-match opportunity spent. Do not treat every minor graze as a detonation; define legitimate crash contact explicitly.
- If the rotor is destroyed before impact, forward propulsion falls substantially and the apparatus drops with the physically appropriate residual momentum (not an instantaneous stop).
- If the wreck never reaches a wall, a ground impact or a bounded terminal timeout resolves it. No airborne permanent wrecks.

**Spells and Chivalry normal use:** While that Ultimate is already active, **tap** Dash to use its normal permitted midair Dash without an extra special-flight resource expense; rotor flight continues. The terminal dive instead requires the Ultimate to be **ready and unspent**.

**Verification:** Ordinary Dash tap/hold, near-empty Ultimate meter, armed/active Ultimate distinction, 1-second commitment, mid-flight rider defeat, rotor destruction, crash damage falloff, burning aftermath, bounded respawn timer, once-per-machine flag after operator changes.

---

# 2. Bi-Bye-llista

The existing dual-shot siege ballista has an independently operated small conditioning/frostfire bolt (Bolt I) and a heavy/piercing bolt (Bolt II). Its ordinary **coupled** volley releases Bolt I before Bolt II with a **0.2-second separation**, and the main heavy-weapon mode ordinarily requires deployment. Do not confuse the inter-bolt separation with the separate upper/independent release windup.

## Skill — Bolt to the Occasion

**Type:** Two-press independent heavy aiming and firing. **Initial machine-owned cooldown: 24 seconds from deliberate Bolt II commitment.**

- Allow the **actually loaded Bolt II** to fire **independently**, including while the ballista is **mobile and not deployed**.
- If Bolt I has not fired and both are loaded, the Skill may fire **Bolt II first**; it does not have to wait for Bolt I.
- If Bolt I was already fired, the Skill may still fire an available Bolt II independently.
- **First SKILL press primes**, without firing or spending the cooldown. Both independently articulated bows track the camera even while mobile, within real constraints.
- **Second SKILL press fires Bolt II deliberately** using its actual main-launcher pose. Ordinary ATTACK continues to fire only Bolt I during priming, even with MAIN focus.
- If Bolt I fires first, there is exactly **0.2 seconds of mechanical preparation measured from Bolt I's actual projectile release**. No automatic queued Bolt II, extra coupled delay or gratuitous windup. An early SKILL press is rejected while retaining priming.
- If Bolt II fires first, Bolt I remains available through normal ATTACK and retains its independent recock clock.
- A pre-fired Bolt I may precede priming; the operator need not reload it to fire Bolt II.
- Priming has no arbitrary expiry; dismount before commitment cancels aiming without a fabricated shot or Skill cooldown. After commitment, cooldown survives operator changes/interruption.
- **Consume the heavy bolt normally.** Do not clone ammo, instant-reload Bolt II, generate a third bolt, or grant unrestricted mobile coupled volleys.
- Preserve existing heavy-bolt projectile speed, penetration, damage, collision rules, aiming geometry and legitimate reload limits.
- Give the mobile heavy release an appropriate physical recoil/readability cost without inventing an arbitrary damage bonus.
- Machine-owned Skill cooldown remains separate from the actual bolt's ammunition/reload state and persists across operators.

**Verification:** Both loaded, Bolt I spent, Bolt II spent, mobile vs deployed, simultaneous fire attempts, operator changes, animation/projectile timing, and no duplicate bolts or unintended coupled firing.

---

# 3. SO-FIST-ICATION

SO-FIST-ICATION is a wheeled piston-driven battering ram: **an enormous armored fist fixed to a reciprocating piston**, not an imagined chain-launched fist. The existing normal cycle is **4 seconds** with approximately **0.68-second mechanical release and 0.88-second maximum extension** in the recent integrated implementation. Normal impact can occur earlier based on actual target position.

## Skill — Beat to the Punch

**Type:** Primed reactive piston attack with elapsed-time stochastic instability and temporary backward pressure charge. **Initial base cooldown: 24 seconds from priming resolution.**

**Primed:** The piston assembly visibly shudders, with subtle physically coherent vibration; the machine looks mechanically unstable. The operator can use special backward pressure charging while primed.

**Trigger:** The next hostile Spellblade entering the fist's actual reachable strike zone automatically triggers a full-strength normal piston attack. **This trigger works even when the ram is still recovering from a recent strike**; it overrides the ordinary four-second recovery restriction for this one special stroke.

- A second attack must still involve **a new actual outward piston stroke** and swept contact, even against the same enemy. Do not reset the animation to zero, teleport the fist, or deal duplicate damage from lingering collider overlap.
- If the piston is partly retracted, smoothly reverse/reprepare from its current physical extension. If substantially extended, retract enough for a valid outward punch before release. Visual and authoritative motion must agree.
- Normal damage, Guard, mitigation, stagger, knockback, armor/component and wall/structure collision rules still apply. Two genuine hits on the same enemy are valid; its knockback usually removes it from the second strike zone but do not assume that always happens.
- Automatic triggering consumes the primed Skill and starts the normal **four-second cycle from the new special punch**.
- While primed, sufficiently threatening **chassis** damage may accidentally trigger the waiting attack early, allowing enemies to bait it. Fist damage and chassis damage are not necessarily equivalent for this purpose; define a clear threshold/condition.
- **Backward pressure charge** permits brisk repositioning/retreat, but the machine's rear does not gain the armored fist's collision damage or special structure-breaking ability. Preserve actual pressure expenditure, terrain, clearance, wheel and chassis damage behavior.
- If the operator manually attacks while primed, the primed state ends. The Skill cooldown is **not refunded**. Time spent in special backward charge adds to its cooldown obligation. Keep normal attack legality clear; manual attacking should not secretly create extra special strokes.
- There is **no fixed six-second or other deterministic expiration**. Mechanical failure follows integrated hazard `H(t) = initialHazard·t + growthRate·t²/2`, with a single server-sampled exponential failure threshold at priming. Chances grow continuously over elapsed time, independent of tick rate. Accidental discharge makes a real outward stroke and may hit nothing.
- Valid manual cancellation, actual strike/discharge, operator loss or component failure resolve priming and start `24s + accrued backward-charge debt` of machine-owned cooldown. Invalid manual attempts leave the Skill primed. Long priming never pays off cooldown in advance.

**Visual rule:** The real visible mechanism is the **piston and armored fist**. Avoid inventing tightening chains, fictional windup drums, or unrelated contraptions. A brief shudder/retraction/outward strike is sufficient if accurately synchronized.

**Verification:** Enter reach during cooldown, after cooldown, while retracting and while still extended; same victim twice via two real contacts; Guard and wall contact; bait via chassis damage; backward charge and cooldown addition; manual cancel; operator swap mid-armed state.

---

# Integration and acceptance

1. Read and preserve current authoritative machine code, weapons, components and collision systems; do not drop in unrelated replacement simulators.
2. Introduce explicit Skill state, resource ownership and cooldown ends on each machine. Serialize to the appropriate clients; never trust local UI state for authority.
3. Preserve operator/vehicle invariants and clear handling for death, dismount, disconnect, destruction, reassembly/repair and match reset.
4. Keep regular attack mechanics intact except for the exact permissions/timing the Skills override.
5. Add descriptive UI, consistent effects and accessible desktop/touch controls, without displacing required ordinary controls.
6. Test each interaction in actual Castleward, not just a proxy scene; include authoritative simulation tests, Inspector demonstrations and HTML5 export/performance checks.
7. **No unrequested merge or deployment.** The specification is a design reference until mechanics are implemented and accepted.

## Open decisions / balance-testing checklist

- Skill cooldowns and armed/active durations for all three machines.
- Crossbow reserve, passive refill rate, borrowed-ammo accounting and repayment.
- Fight-and-Flight flight charge, sustainable altitude equilibrium, rotor/brace Sheathe in Steel mitigation, movement and hit-location behavior.
- Offensive flight run speed/steering, Ultimate drain and rotor damage/vulnerability.
- Terminal dive crash threshold, maximum duration, radius/falloff, burn area persistence, interaction with opponents and objectives, and machine rebuild lifecycle.
- Bolt to the Occasion mobile recoil, precise mechanical release and coupling restoration.
- Beat to the Punch preloaded piston stroke, physical clearance requirement, trigger volume, bait threshold, backward pressure speed and extra cooldown accounting.

**Design target:** Skills should feel like exceptional uses—and occasional abuses—of the machines' existing engineering, creating strategic decisions, counterplay, and memorable failures.


# Revised October 30 siege Skills — candidate PR

The canonical revisions are the new two-press Bolt II Skill and rising probabilistic ram instability. Previous October 29 descriptions of automatic Bolt II release, a fixed six-second ram duration and cooldown beginning at priming are obsolete.

The shared `shared/sim/siegeSkills.mjs` owns machine-specific clocks, a prime/commit distinction and the continuous-time hazard model. The host validates life, ownership, stagger, mode and legitimate mechanism eligibility; LocalHost and WebSocket command paths share the same authoritative `siegeSkill` intent. Desktop still uses rebindable **U**; landscape touch retains **SKILL**. No projectile is created merely by priming, and a heavy shot cannot fire automatically because Bolt I was released or because preparation completed.

**Provisional ram tuning:** initial hazard 0.0025/s; linear growth 0.0012/s²; qualifying hull damage threshold 35; backward pressure speed up to 8 m/s; +1.5 seconds cooldown debt per second of actual backward pressure charging. These coefficients yield approximately 8% spontaneous discharge by 10 seconds and 46% by 30 seconds; playtesting should determine final balance. The random failure threshold is server-only, while the client sees elapsed priming and increasing physical strain.

**Ballista timing:** Bolt I's existing independent windup is preserved. Primed Bolt II uses its physically tracked lower launcher and respects clutch transition and a 0.2-second preparation if Bolt I has actually released. Cooldown starts at deliberate Bolt II commitment, not first SKILL press. Existing normal coupled volleys remain unchanged outside the Skill.

**Validation status:** focused automated tests added on this branch; runtime browser, landscape-touch and full HTML5 verification remain separate gates. No claim of live verification is made by this document.

## Fight and Flight: implementation contract, still unimplemented

No base Fight and Flight exists on main or the inspected branches. The candidate GLB is an asset reference, not a running machine. The following supersedes older broad descriptions above.

Use an instance containing id, operatorId, team, lifecycleId, mode, position, velocity, orientation, component HP, rotor angular position/velocity/energy, flightCharge/current maximum, crossbow reserve/debt/nextShotAt and machine Skill state. Keep operator Ultimate on the player. Persist resource debt and terminalDiveSpent across operator changes; rebuild/match reset must explicitly define a new lifecycle. Snapshot the physical and resource state, with renderer interpolation and independent rotor/repeater/posture tracks. Replicate event identity, release time, impact region and committed trajectory.

States and transitions: grounded with rotor intact can crouch, walk or begin takeoff; takeoff enters powered flight; flying can deliberately land through landing to grounded. Grounded crouch changes actual support and rotor height. Offensive run requires held Dash and available personal Ultimate. A separately held Dash plus ready, unspent Chivalry commits terminal dive. Rotor destruction is irreversible for that lifecycle, ends lift and leaves a grounded crossbow apparatus after actual fall physics. Main destruction ends operation. Terminal trajectory and its bounded resolution continue after rider defeat.

Repeater: maximum seven releases per second, three raw close damage and two after falloff, modest spread, finite reserve and passive production with no full magazine delay. Ordinary sword/repeater operation is exclusive. Active **Spells and Chivalry** permits independent simultaneous repeater and right sword hit events. Ordinary airborne Guard and spellcasting remain restricted; grounded Guard uses normal posture. Guard blocks all HP damage only when a bolt genuinely meets its defined frontal/vertical defended region; unprotected limbs remain vulnerable. Crouching changes geometry rather than granting immunity.

Rotor: provisional 100 HP with passive Steel protection, separate recoverable rotational energy and flight charge. Powered clean-hit potential ranges 8 to 30; grazes and defended hits can deal less or zero. Genuine swept blade crossings spend current energy proportional to contact resistance; continuous overlap creates no extra impacts, while subsequent physical crossings may hit again. Use angular substeps or conservative continuous sweeps at 30 Hz, including relative target movement. Substantial contacts slow/deflect rotation and affect lift. A protected Guard contact prevents HP loss, drains substantial stamina and rotor energy. A timed parry prevents that blade contact, briefly disrupts rotor, jolts defender, deals exactly eight actual rotor HP after Steel mitigation and spends a small amount of current flight charge, preserving its maximum.

Flight charge pays powered ascent and ordinary hover, recovers under the defined descent/energy model and permits voluntary landing. Grounded apparatus movement stays heavy. Rotor destruction does not automatically disable repeater. Ordinary Dash hold is an offensive run spending personal Ultimate quickly; terminal dive is a separate deliberate Dash plus ready Ultimate commitment, sacrifices operator/apparatus and is once per machine per match. No homing revenge blades or guaranteed destruction damage.

**Fire Away? I'm Right Here.** will share the instance Skill clock. Real extra ammunition delivered during firing creates debt; existing reserve and zero-shot activations do not. Production after expiry repays debt first, then creates usable ammunition. Debt survives swapping, dismount and operators. When not firing, capacity offsets ordinary hover expenditure only, with no unlimited ascent. Keep this contract alongside the actual reserve and flight energy integration rather than implementing a fictional Skill magazine now.

Required future tests: actual mounted flight/landing/crouch, independent repeater/sword events, bolt defended-volume contacts and exposed limbs, continuous rotor sweeps at 30 Hz, repeated genuine crossings, graze energy, parry HP after mitigation, current versus maximum flight charge, debt accounting with zero/partial/all shots and handoff, irreversible rotor loss, deliberate terminal commitment and bounded wreck/respawn resolution. None of these machine-specific tests are claimed to pass before its base integration.
