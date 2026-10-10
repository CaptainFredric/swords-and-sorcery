# Inspection Yard

Open Solo, then Inspection Yard. It uses the existing local authoritative Practice simulation even while the multiplayer server is available. Ordinary Practice, Bot Duel and online rooms retain their existing routing.

Press P during play to freeze, or click Freeze in the Practice tools. The mouse is released. Press P or Resume to continue, then click the arena to capture the mouse again. Step 1 Tick advances the simulation and presentation by 1/30 second while remaining frozen. Play Frames advances one tick every 0.2 seconds, equivalent to one sixth speed. Stop Frames holds the current frame immediately. Single stepping is disabled during playback. Resume returns to ordinary play. Background stalls produce one step rather than a catch-up burst. Playback clears on Resume or leaving. P is reserved for inspection in this yard.

Freeze stops simulation time, projectiles, cooldowns, movement, pose animation, cloth, particles and the scene camera. Frozen commands cannot edit the scene. Resume discards held attack, Guard and movement inputs. No elapsed wall time is added to combat timers. Leaving discards the local inspection session.

Existing music and already playing audio continue on their audio clock. This is an inspection tool, with a fixed frozen camera, rather than a replay editor or a multiplayer pause request.

## Observed browser check

Chrome, Castleward, actual Fireball cast using Q and P. At freeze, the presentation clock stopped at 46.388200 seconds, tick 965. Ten deliberate Step clicks advanced to 46.721533 seconds, tick 975, with one visible released projectile. A 1.6 second observation found simulation time, tick, projectile state and camera unchanged. Resume continued at 46.771433 seconds without adding the time spent frozen.

Screenshot: output/inspection/frozen-fireball.png, retained locally. The test session uses the production avatar and ordinary game effects.

Continuous playback check: Play Frames advanced six ticks and 0.2 simulation seconds during a 1.2 second observation, while remaining frozen. Stop held simulation time unchanged during another 0.5 second observation and enabled manual stepping. Resume during playback restored the live controls and disabled both stepping buttons. Screenshot: output/inspection/play-frames.png, retained locally.

## Verification

Eight inspection simulation tests cover frozen projectiles and deadlines, exact stepping, repeated freezes, resumed casts, held input release, exclusion of ordinary and remote rooms, continuous playback cadence and background stalls. The MenuController test checks name validation and arena choice. Full npm run verify passed with 1,120 tests, syntax checks and HTTP/WebSocket smoke. No model, animation asset, balance, server, voice content or menu tour files changed.
