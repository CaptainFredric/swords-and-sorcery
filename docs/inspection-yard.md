# Inspection Yard

Open Solo, then Inspection Yard. It uses the existing local authoritative Practice simulation even while the multiplayer server is available. Ordinary Practice, Bot Duel and online rooms retain their existing routing.

Press P during play to freeze, or use the Inspection Toolbar controls. Step 1 Tick advances the simulation and presentation by 1/30 second while remaining frozen. Play Frames advances one tick every 0.2 seconds (⅙ speed). Stop Frames holds the current frame immediately. Resume returns to ordinary play.

## Director Mode & Combat Staging

The Inspection Yard provides authoritative local staging tools to compose, control, freeze, and photograph combat scenes:

1. **Full Dummy Control Parity**:
   - Possessed dummies can prepare and activate Ultimates (Sunder, Vortex, Chivalry) with full animations, timings, and combat effects.
   - Possessed dummies can mount, drive, aim, fire, and dismount both siege machines (`BI-BYE-LLISTA` and `SO-FIST-ICATION`).
   - Death, removal, and dismounting safely return control to You without leaving invalid references. Multiplayer and competitive profile prowess remain strictly protected.

2. **Selective Freezing**:
   - `Freeze All`: Freezes entire match.
   - `Freeze Others`: Pinned targets hold their poses and timers while the controlled actor moves and attacks. Frozen targets receive full combat damage and impact physics.
   - `Freeze Actor`: Pinned hero remains frozen while AI, opponents, and world continue running.
   - `Freeze Projectiles`: Projectiles hold midair without premature detonation or expiration while actors fight around them.

3. **Director Staging Controls**:
   - One-click vitals restoration (100 HP, max stamina).
   - Instant Ultimate preparation (full prowess).
   - Cooldown clearance (dash, spells, stagger).
   - Dummy AI suspension toggle.
   - Authoritative loadout and pose forcing (`IDLE`, `GUARD`, `SWING`, `CAST`).
   - Grounded placement presets (`FACE TARGET`, `COURTYARD`, `WALKWAY`, `BALLISTA`, `RAM`).
   - Authoritative siege mounting (`MOUNT BALLISTA`, `MOUNT RAM`, `DISMOUNT`).

4. **Multi-Camera & Composition**:
   - Clean UI toggling via `H` / `~` (`Full UI`, `Gameplay HUD`, `Clean View`).
   - Rule-of-thirds composition grid.
   - Variable flight camera speeds (Slow 2 m/s, Norm 8 m/s, Fast 24 m/s).
   - 3 Camera Bookmark slots with simultaneous multi-camera capture and timed sequence exports.

## Observed Browser Evidence (Scenarios A through G)

Headless Chrome automated browser verification (`scripts/verify-inspection-scenarios.mjs`):

- **Scenario A (Frozen combat target)**: Dummy staged in front of player, frozen with `Freeze Others`. Player executed sword attack; target received 39 damage (100 -> 61 HP) with impact registered. Captured: `scenario-a-frozen-combat-target.png`.
- **Scenario B (Frozen Spellblade)**: Player frozen with `Freeze Actor`. Camera orbited around frozen hero while dummy moved live in background. Captured: `scenario-b-frozen-spellblade.png`.
- **Scenario C (Midflight projectile)**: Fireball cast and suspended midair with `Freeze Projectiles`. Fly camera orbited to dramatic 3/4 angle. Captured: `scenario-c-midflight-projectile.png`.
- **Scenario D (Dummy Ultimate)**: Possessed dummy prepared and unleashed Sunder. Frozen during leap/slam. Captured: `scenario-d-dummy-ultimate.png`.
- **Scenario E (Dummy siege operator)**: Possessed dummy mounted Bi-Bye-llista and fired volley (`scenario-e1-dummy-ballista.png`). Possessed dummy mounted SO-FIST-ICATION and actuated punch (`scenario-e2-dummy-ram.png`).
- **Scenario F (Multi-camera capture)**: Scene frozen at exact simulation tick; Camera bookmarks 1 and 2 saved and previewed cleanly without simulation tick drift. Captured: `scenario-f1-camera-slot1.png`, `scenario-f2-camera-slot2.png`.
- **Scenario G (Normal gameplay regression)**: Ordinary Practice loaded without inspection privileges; verified `inspectionAvailable === false` and remote/multiplayer integrity held. Captured: `scenario-g-normal-practice-regression.png`.

## Verification

Full suite verification:
- `npm test`: 1,919 passing unit tests (0 failures).
- `scripts/check-syntax.mjs`: 535 modules syntax verified.
- `scripts/verify-inspection-scenarios.mjs`: Scenarios A through G verified in authentic headless browser.
