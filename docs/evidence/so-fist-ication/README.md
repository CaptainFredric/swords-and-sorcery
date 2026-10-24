# So Fist ication playable Practice pass

The original authored ram is playable through the existing Siege Machinations menu in Castleward and the Ruined Keep. Build selects a type; each type keeps its own instance, safe placement, rebuild and dismantle transaction. Construction waits for the authored model to load, reports failure, and supports retry. The server simulation itself remains independent of model loading.

The creator supplied GLB is unchanged, with SHA256 `64cdc7b09e88e31f4b4ff7cb65631fd036e12ba71c0c3f9466cc52b8416419c6`. It was inspected in the existing Blender window and compared with its supplied filmstrip. Four wheels, a 1.974 m wheelbase, nominal 0.437 m wheel radius, 1.308 m fist width, and actual 0.848 m exposed shaft tip govern the implementation. The measured piston stroke is 1.4575 m; its powered release occurs at 2.08 through 2.26 seconds within the original four second cycle. The original source download and ZIP remain preserved locally. The ZIP includes reconstruction scripts but omits the original scan inputs.

Ordinary forward travel reaches 4.2 m/s, with slower reverse, physical acceleration and braking, and a useful 3.25 m minimum turning radius at low speed. Held Knock on Steel accelerates toward 12 m/s. A full 100 point pressure reserve supplies approximately 5.5 seconds at peak after acceleration. Steering diminishes with speed. Wheel support, rolling and front steering follow the carriage transform. The operator stands at the actual rear frame, follows supported ground, and uses the existing character arms with the sword stowed.

The hull has 1400 HP; the independently armored fist has 500 HP. Four wheels and the accessible drive have separate damage states. Destroying the fist detaches it with its wrist ring while leaving a genuinely shorter and narrower working shaft. Damage and launch use swept contact, real closing velocity, existing Steel and Guard rules, and one result per contact episode or stroke. An ordinary parry cannot reverse the machine. Architecture limits the physical stroke and the matching animation. Other siege machinery receives one component hit per stroke.

Only explicit ram launches arm the new secondary world impact. Real incoming velocity into stone, masonry, iron or timber scales damage toward 30 HP and stagger toward 26. Contact consumes the eligibility; ordinary wall touching, reset and relocation do not inflict this damage. Existing Gale and ballista launches receive no additional world damage. Heavy Shot II retains 85 direct damage, 45 stagger and its existing shove, with the normal 0.22 second Sunder action interruption on living direct hits. Full one second balance breaks retain their own duration.

## Actual browser evidence

Chrome gameplay used ordinary keyboard, mouse and CDP touch input. Routes in the test harness change initial spawn or damage fixtures only. Assertions observe authority and event output; they do not manufacture impacts or advance weapon state.

[Profile](profile.png), [steering](wheel-steering.png), [piston release](piston-release.png), [destroyed fist](fist-broken.png), [exposed piston](exposed-piston.png), [touch charge](touch-charge.png), [Ruined Keep construction](ruined-keep-built.png).

The decisive encounter used a normal 100 HP dummy with real Steel state, the authored fist, and the actual Tourney Field stone wall. The fist dealt 76 HP after Steel and 78 stagger, then physically launched the survivor into the wall. That real contact dealt another 19 HP after Steel, added the normal 26 stagger, caused a full balance break, and credited the operator. The victim survived with 5 HP. [Capture](steel-survivor-wall-impact.png) and [events](wall-encounter.json).

Desktop construction, operating, driving, charge, piston, both views, rebuild and dismantling passed. A real sword strike destroyed a fist initialized at 19 remaining HP, preserved all 1400 hull HP, and allowed subsequent exposed shaft operation. The standalone HTML5 ZIP passed the same desktop and touch flows, plus the real wall encounter. Existing ballista desktop construction, mobile operation, aim, fire, deployment, rebuild and removal also passed. Touch at 960 by 600 passed mount, held Charge, release, piston, view and leave. Aborted GLB loading refused construction; retry loaded the genuine model and then constructed it.

Reproduction helpers: `scripts/so-fist-browser.mjs` and `scripts/so-fist-performance.mjs`. Shared regressions cover real running, Sprint and Dash evasion, side versus frontal impact, pinned contacts, normal Guard facing, mitigation, recovery, thin walls, slope ascent/descent/reverse, unsupported drops, damaged wheels and drive, precise component hits, reset, egress and both bolt types against the ram.

## Frame pacing

[Raw measurements](performance.json). Same Chrome 155, Apple M1 through ANGLE Metal, 1280 by 800 viewport, device scale 1, 78 degree field of view and identical visual settings. The old implementation was served from an isolated archive of commit `47c6d31`. The old baseline and visible ram cases sampled eight seconds each; final empty Practice and construction sampled five seconds, and active charging and piston sampled six seconds, reaching 12 m/s. One game tab ran during each sample.

| Scenario | Frame median | Frame p95 | Maximum frame | Frames at least 50 ms | Host CPU median | Host CPU p95 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Baseline, empty Practice | 16.7 ms | 16.7 ms | 16.8 ms | 0 | 0.5 ms | 0.8 ms |
| Final candidate, empty Practice | 16.7 ms | 16.8 ms | 16.8 ms | 0 | 0.5 ms | 0.9 ms |
| Ram visible, initial implementation | 16.7 ms | 16.7 ms | 16.8 ms | 0 | 1.9 ms | 3.0 ms |
| Final ram visible, idle work corrected | 16.7 ms | 16.8 ms | 16.8 ms | 0 | 0.5 ms | 0.9 ms |
| Final charge and piston active | 16.7 ms | 16.8 ms | 50.0 ms | 1 | 2.0 ms | 4.4 ms |

Measurements exposed repeated terrain and collision sweeps while the carriage was stationary. Skipping that idle work reduced host CPU cost. Frame pacing already met the display interval, so these results demonstrate no visible frame rate improvement over the baseline. Final construction recorded a 33.3 ms maximum frame and 44.7 ms maximum host scheduling interval. Final active play contained one 50 ms frame; host CPU work peaked at 5.4 ms and host scheduling intervals at 38.2 ms in that sample. That isolated frame's cause remains unresolved. These bounded desktop samples establish neither phone performance nor a general stutter guarantee.

Verification: `npm run verify` passed syntax checks, 1746 repository tests, 19 HTML5/release tests and the HTTP/WebSocket smoke check.

The tested gameplay source is commit `1db0329`, based on merged PR222 at `1109c54`. [Verification details](verification.json). The export contains 985 of the 1000 allowed itch files, with 15 remaining.

## Limits and next decisions

Map architecture currently has collision surfaces and capture objectives, without a destructible fortification health API. This pass keeps those map rules: the ram stops against walls and strikes existing siege component health, while gates and castle walls remain structurally intact. Adding destructible fortifications requires a deliberate map and objective design pass. No new fortification damage is claimed here.

Desktop Chrome and emulated touch are verified. A physical phone, Safari and a live itch iframe remain untested in this pass. No deployment, publication, paid asset generation, merge or automatic review was performed.
