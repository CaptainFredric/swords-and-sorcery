# Inspection Camera & Director Tools

Local review and staging system. Open Solo, then Inspection Yard, then access the Inspection Toolbar in the upper right.

### Viewing Perspective
- **YOU · 1ST PERSON**: Reliably restores the original Spellblade's first-person perspective, including eye height, yaw/pitch, sword, spellcasting hand, gauntlet viewmodel animation, and HUD ownership.
- **INHABIT DUMMY**: Seamlessly takes control of the current living Practice dummy. Movement, attacks, Guard, spells, and their normal authoritative validation use that actor. In Inspection Yard, the possessed dummy can also prepare and execute Ultimates (Sunder, Vortex, Chivalry) and operate both siege engines (Bi-Bye-llista and SO-FIST-ICATION). Removing or killing the possessed dummy safely returns control to You. Human network/profile identity and competitive progression stay untouched.
- **FLY CAMERA**: Detaches the viewpoint from the controlled Spellblade. Move and look freely; hold Jump to rise, Crouch to descend, and Sprint for faster travel. Keyboard prompts follow current bindings. Touch uses the existing stick/look gestures with held **UP**, **DOWN**, and **FAST** controls. Flight passes freely through scenery for inspection and remains responsive even while the simulation is frozen.
- **SPLIT VIEW**: Shows the actor's first-person view beside the free camera. Tall layouts stack the views. One view receives input at a time; choose it through the camera controls or pane labels. Both views share one authoritative 30 Hz simulation.
- **RESET CAMERA**: Positions the observer behind and above the current actor.

### Director Tools & Combat Staging
- **Selective Freezing**:
  - **FREEZE ALL**: Pauses the entire simulation, holding all actors and projectiles.
  - **FREEZE OTHERS**: Holds all non-controlled actors in place with frozen poses, velocity, and action timers, while allowing the controlled actor to freely move, cast, and attack against them. Targets receive full damage, hit impacts, and stagger.
  - **FREEZE ACTOR**: Pins the controlled actor in place (preserving posture, velocity, and attack state) while other combatants, AI, and projectiles continue running in real time.
  - **UNFREEZE**: Resumes full live simulation across all entities.
  - **FREEZE PROJECTILES (ON/OFF)**: Selectively freezes in-flight projectiles (Fireballs, Coreflagration cores, Frostfire, ballista bolts) midair without expiring or detonating, while actors continue fighting around them.
- **Actor Staging Controls**:
  - **REFILL VITALS**: Instantly restores actor health to 100 and stamina to maximum.
  - **READY ULTIMATE**: Grants full prowess and clears lockouts, enabling immediate activation of Sunder, Vortex, or Chivalry for either You or the possessed Dummy.
  - **CLEAR COOLDOWNS**: Resets dash, spell cooldowns, and combat stagger.
  - **SUSPEND / RESUME AI**: Toggles practice dummy AI so the actor remains passive during scene composition.
  - **EQUIP LOADOUT**: Assigns prepared spells (Fireball, Frostfire, Coreflagration, Gale Garner) and Ultimates (Sunder, Vortex, Chivalry) to the selected actor.
  - **FORCE POSE**: Commands the actor into authoritative poses: `IDLE`, `GUARD`, `SWING`, or `CAST`.
  - **POSITION PRESETS**: Accurately places and grounds actors: `FACE TARGET`, `COURTYARD`, `WALKWAY`, `NEAR BALLISTA`, and `NEAR RAM`.
  - **SIEGE MOUNTING**: Commands the selected actor (You or Dummy) into the driver station of `BI-BYE-LLISTA` or `SO-FIST-ICATION` with full firing, punching, aiming, and dismounting capabilities.

### Interface & Composition Controls
- **HIDE ALL UI [H]**: Toggles interface presentation across three clean states:
  - **Full UI**: Inspection panel + gameplay HUD.
  - **Gameplay HUD**: Standard player HUD only (no inspection/dev tools).
  - **Clean**: No UI whatsoever (raw canvas render).
  - Restoration is provided via keyboard shortcuts (`H` or `~`), Escape key, or tapping the unobtrusive floating safe-area restore pill (`SHOW UI [H]`).
- **GRID (Rule-of-Thirds)**: Subtle 3x3 composition grid overlay to aid cinematic framing. Excluded from clean canvas captures.
- **Camera Speeds**:
  - **SLOW (2 m/s)**: Precision movement for close-up portraits and macro framing.
  - **NORM (8 m/s)**: Standard flight travel.
  - **FAST (24 m/s)**: Quick navigation across Castleward and arena boundaries.
- **Adjustable FOV**: Compact free-camera field-of-view controls (45°–95° with ±5° steps and base FOV Reset). Affects only the inspection camera; player viewmodel gameplay settings remain unmutated.
- **LEVEL HORIZON**: Zeroes camera pitch and tilt for an aligned, level horizon.
- **FOCUS SUBJECT**: Cycles target focus between player, practice dummy, and siege machinery (Bi-Bye Ballista, So-Fistication Ram) to center framing.

### Simulation Time & Authoritative Readout
- Real-time authoritative simulation readout displays status, tick number, and simulation time: e.g. `FROZEN · TICK 1,245 · 41.50s` or `LIVE · TICK 1,245 · 41.50s`.
- **FREEZE / RESUME**: Pauses and resumes the local match.
- **STEP 1 TICK**: Advances exactly 1 simulation frame (1/30s).
- **PLAY FRAMES / STOP FRAMES**: Advances simulation at 0.2s interval beats.

### Camera Bookmarks
- Three independent bookmark slots (Slots 1, 2, 3) storing 3D position, yaw, pitch, and FOV.
- **SET**: Saves current camera transform.
- **GO**: Recalls saved camera transform and FOV.
- **Include Checkboxes**: Configures which bookmarks participate in multi-camera captures.

### Captures & Timed Sequences
- **CAPTURE PNG**: Exports a high-resolution, unscaled WebGL canvas screenshot with clean filename formatting (`castleward-inspection-YYYY-MM-DD-tickXXXXXX.png`). All DOM UI, touch controls, and dev panels are excluded automatically.
- **CAPTURE ALL CAMERAS**: Synchronously renders every active camera bookmark at the exact same simulation tick and timestamp without advancing time, effects, or combat. Automatically bundles results into a ZIP archive with `manifest.json`.
- **CAPTURE SEQUENCE**: Configurable interval recording:
  - Cadence: Every 1, 3, 6 (0.2s), 15 (0.5s), or 30 (1.0s) simulation ticks.
  - Limits: 6, 12, 24, 48 moments or manual stop.
  - In frozen mode, captures advance deterministically with Step or Play Frames. In running mode, captures automatically on qualifying ticks.
  - On completion or stop, all frames and `manifest.json` are bundled and downloaded as a single ZIP archive.
