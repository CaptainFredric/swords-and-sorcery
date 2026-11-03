# Flight mobile cockpit and attack repair

Goal: Make the actual authored apparatus comfortable and readable on touch, with a committed aimed launch, steerable sustained Dash and real rotor contact.

Architecture: Preserve the v3.0 GLB, filtered animation controller and shared authority. Consolidate flight layout into a responsive placement model consumed by normal TouchControls, leaving custom placements intact. Use one shared medieval icon vocabulary. Use the actual world rider and machinery for cockpit composition instead of a second giant camera sword. Change physical attack attitude and exact rotor projection together.

Spec: /Users/erendiracisneros/.codex/attachments/b200ac71-e233-42ed-ba92-ff57639babd0/Pasted text.txt

1. Capture current main at representative mobile sizes and reproduce Practice drawer opening, cockpit obstruction and rotor misses. Run existing focused touch and flight tests before changing behavior.
2. Add failing tests for captured camera yaw and upward launch, low altitude real rotor contact, pitched rotor transform parity, cancellation and menu safety. Implement exact rotor segment geometry and bounded launch, steering and descent; preserve damage and terminal priority.
3. Consolidate the flight CSS and placement defaults. Four compact paired action rows, separate auxiliary row, integrated joystick flight cavity, stable hit areas with a pressed face. Migrate untouched legacy defaults and preserve deliberate custom placements and handedness.
4. Redraw shared icons for weapons, magic, Ultimate and siege actions. Inspect them in the real HUD at final size. Keep plain readable labels and truthful availability.
5. Recompose first person around the authored visor camera, real controls, hands and sword. Preserve physical collision and muzzle transforms. Fix the demonstrated Practice drawer command path and cancel held inputs safely across all three machines.
6. Exercise normal desktop and touch gestures, short/wide/rotated layouts, custom and mirrored presets, actual Dash steering and rotor combat. Save matching before and after views plus a short real input recording. Run relevant regression tests, full verify and exact commit HTML5 packaging. Push a separate draft PR. No merge, deployment, character promotion, reviewers or paid work.

Review focus: saved custom layouts must survive mode switches; short landscape must retain clear sight and reachable buttons; menu pointer release must not become a game action; actual blade contact must match the pitched model rather than a larger invisible disc; interrupted Dash and resource cycles must preserve authority and clear held sources.

Completed: implementation, red/green regressions, actual loaded GLB parity checks, matched baseline/current browser captures, touch/native keyboard input, all three mounted Tools paths, custom/mirrored/rotated layouts, and final full verification. Human phone hardware and extended remote latency play remain documented limitations. Evidence is in index.html and evidence/results.json.
