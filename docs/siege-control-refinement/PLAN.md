# Siege control and Chivalry refinement

Goal: Keep the normal mobile control appearance while making mounted actions, flight aiming and frontal Chivalry defense consistent and usable.

1. Reuse the ordinary circular button skin for all siege controls. Preserve contextual placement, custom layouts and fixed press targets. Put Leave/Eject and View at the upper right on every machine, clear of BOTH.
2. Widen the Sprint/Charge cavity and join its silhouette to the joystick with one continuous outline. Preserve thresholds, pointer mapping and authoritative movement indicators.
3. Route a held flight Dash pointer through the existing aim drag path, including off-button dragging, cancellation, rotation and multiple independent fingers. Deepen real attack pitch without changing thrust direction, resource rules or collision reach.
4. Replace the ambiguous repeater/Fire Away and ballista Skill glyphs with simple distinct SVGs. Use a mechanical fist SVG in the Armory, retaining editable data and existing controls.
5. Extend active Chivalry to ten seconds. Use one shared authoritative eligibility helper for automatic frontal parries on existing parryable contacts. A 90 degree frontal arc, stamina, stagger, Guard break and the exact active window constrain it. Rear attacks, area damage and previously unparryable heavy attacks retain their existing rules. Ordinary Guard timing stays intact.
6. Run targeted red/green regressions, inspect the actual mobile and Armory render, exercise Dash dragging, and verify frontal/rear combat events. Complete repository/HTML5 checks and prepare a separate draft PR. No merge, deployment, agents, reviews or paid work.
