# Inspection camera

Local review candidate. Open Solo, then Inspection Yard, then **INSPECTION CAMERA** in the upper right.

### Viewing Perspective
- **YOU · 1ST PERSON** reliably restores the original Spellblade's first-person perspective, including eye height, yaw/pitch, sword, spellcasting hand, gauntlet viewmodel animation, and HUD ownership.
- **INHABIT DUMMY** takes control of the current living Practice dummy. Movement, attacks, Guard, spells and their normal validation use that actor. Its AI yields until control is returned. Removing or killing the possessed dummy safely returns control to You. The human network/profile identity stays unchanged. Dummy possession disables challenge rewards for the rest of that Inspection run. Siege operation and the Ultimate preparation tool remain with You.
- **FLY CAMERA** detaches the viewpoint from the controlled Spellblade. Move and look normally; hold Jump to rise, Crouch to descend, and Sprint for faster travel. Keyboard prompts follow current bindings. Touch uses the existing stick/look gestures with held **UP**, **DOWN** and **FAST** controls. Flight passes freely through scenery for inspection and keeps working while the simulation is frozen.
- **SPLIT VIEW** shows the actor's ordinary view beside the free camera. Tall layouts stack the views. One view receives input at a time; choose it through the camera controls or a pane label. Each view has its own aspect ratio and the first person arms appear only in the actor view. The observer sees the complete body and machinery. Both views share one simulation. Split view is optional and adds rendering cost.
- **RESET CAMERA** places the observer behind and above the current actor.

### Interface & Composition Controls
- **HIDE ALL UI [H]**: Toggles interface presentation across three clean states:
  - **Full UI**: Inspection panel + gameplay HUD.
  - **Gameplay HUD**: Standard player HUD only (no inspection/dev tools).
  - **Clean**: No UI whatsoever (canvas only).
  - Easy restoration is provided via keyboard shortcuts (`H` or `~`), Escape key, or tapping the unobtrusive floating safe-area restore pill (`SHOW UI [H]`).
- **GRID (Rule-of-Thirds)**: Subtle 3x3 composition grid overlay to aid cinematic and screenshot framing. Hidden automatically in clean captures.
- **Camera Speeds**: Selectable precision travel speeds:
  - **SLOW (2 m/s)**: Precision movement for close-up portraits and macro framing.
  - **NORM (8 m/s)**: Standard flight travel.
  - **FAST (24 m/s)**: Quick navigation across Castleward and arena boundaries.
- **Adjustable FOV**: Compact free-camera field-of-view controls (45°–95° with ±5° steps and base FOV Reset). Affects only the inspection camera; player viewmodel gameplay settings remain unmutated.
- **LEVEL HORIZON**: Instantly zeroes camera pitch and tilt for an aligned, level horizon.
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
