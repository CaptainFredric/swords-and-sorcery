# Performance: what a fight costs, measured

Profiled 2026-10-05 on the Ruined Keep (52 solids), Practice Yard hosted in the browser (as on a phone with no server),
four dummies round the knight, Blazing Vortex cast, on a desktop (1024 × 768, pixel ratio 1.6). Each frame's work was
timed by part (the simulation tick, the effects, the remote knights, the arms, the renderer), and the renderer's
programs, lights and draw calls were counted across both passes (the world, then the arms).

## What it found

| Cost | At rest | Blazing Vortex | Verdict |
| --- | --- | --- | --- |
| Frame (JS, average / p95 / worst) | 3.9 / 4.8 / 88 ms | 5.4 / 9.0 / 134 ms | the worst frames were all shader compiles |
| Simulation tick (the host's, in the browser) | 0.28 ms | 0.34 ms | not a cost |
| Effects update | 0.01 ms | 0.11 ms | not a cost |
| Shader programs built | | 33–59 in six seconds, a second Vortex still 19 | **the stutter** |
| Draw calls a frame (both passes) | ~90 | 238 average, 403 worst | heavy for a phone |
| Heap churn | 4.8 MB / 3 s | 9 MB / 5 s | garbage collection, a stutter of its own on a phone |
| Snapshot | 2.6 KB (a duel) to 6.6 KB (five) a tick | | not a cost locally; see Online |

### The stutter: shaders rebuilt mid-fight

In three.js the number of lights in a scene is part of every lit material's shader. Three things changed it during a
fight, and each change rebuilt every lit shader (a 120–145 ms frame on this desktop; a phone's shader compiler is many
times slower):

- every flash (a spell breaking, a rupture, a slam) and every projectile (so every Vortex ember, once a revolution)
  made a point light of its own, and took it away again;
- a gathering palm did the same;
- the first-person arms are hidden during a Vortex (and in death), and the palm's light, a child of the hand, was hidden
  with them: the scene went from 9 lights to 8.

And three.js lets a shader go with the last material that used it: a thrown spell's orb and the blast of its breaking
are made and disposed one by one, so with one ember in flight at a time, their shaders were built again for each.

### The draw calls

Every spark, splinter, ember and mote is a mesh of its own, so each is a draw call. A Vortex in a crowd peaks at about
four hundred.

## What was done

- **A fixed pool of lights** for every brief light of the fight (`client/game/lightPool.mjs`, 4 lights, made once,
  lit and let die in place; the faintest gives way when all are busy, and a projectile with none to spare flies unlit).
- **The palm's light** is a marker on the hand; the light itself is carried by the camera and only goes dark while the
  arms are hidden (`WeaponView.syncPalmLight`).
- **One of each orb and blast kept** in the effects' warm group, so their shaders are never let go between embers.
- **Particle density by render quality** (`PARTICLE_DENSITY`: Sharp as authored, Balanced 0.7, Smooth 0.45, with the
  cap on live particles scaled the same): purely cosmetic, never a projectile, a hit or a revolution.
- The blade's sweep no longer rebuilds the list of solids that stop it on every call.

Nothing authoritative changed: the projectiles, their cadence, hit registration, the revolution rate, the ruptures and
every timing are as they were.

## After

| Blazing Vortex | Before | After (Sharp) | After (Smooth) |
| --- | --- | --- | --- |
| Shaders built | 33–59 (first), 19 (second) | 2 (first), 0 (second) | |
| Worst frame | 129–134 ms | 12.7 ms (first), 8.1 ms (second) | 7.6 ms |
| p95 frame | 9.0 ms | 6.2–6.6 ms | 6.0 ms |
| Draw calls, average / p95 | | 238 / 380 | 103 / 205 |
| Heap churn over the Vortex | 9 MB | 5.1 MB | 2.4 MB |

These are desktop measurements. A phone has to be tried on a phone: the shader compiles that are gone were the
slowest thing a phone does, and Smooth halves the draw calls, but only a real device says how it feels.

## Online

The snapshot is plain JSON at 30 a second: about 2.6 KB a tick for a duel (some 80 KB/s), more with more knights; a
Vortex adds about sixteen events a second. That is modest; if the Vortex feels late only online, it is latency
(the host's word arriving), not bandwidth or the host's simulation (0.3 ms a tick). Not changed here.

## Measuring it again

In the built-in browser (`/?debug`): replace `requestAnimationFrame` with a timed `setTimeout` (timing each callback),
start the Practice Yard offline on the Ruined Keep with the ultimate set to Vortex, add dummies to `__ssLink.local.room`,
wrap `__ssLink.local.tick`, `__ssRuntime.renderer.render`, `effects.update`, `remotePlayers.update` and `weapon.update`,
set `renderer.info.autoReset = false` and reset it every second render (two passes a frame), and count
`renderer.info.programs` new by identity each render.
