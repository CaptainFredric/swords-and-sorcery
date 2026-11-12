# Castleward — elemental gameplay soundscape (Draft PR #456)

## Audio direction

**The point is recognizable material, not five louder explosions.** The default, no-infusion All-Natural Disaster has the crack of broken ground and a descending tectonic thud. Each infusion keeps its own attack, sound body and decaying environmental presence. The final sound is a **sequence** of distinguishable events.

| Mechanic | Initial / committed moment | Passive / tail |
| --- | --- | --- |
| Base Disaster | Hard fractured rock, dry first shock, delayed cavern rumble | Quiet granular rocky shiver, weakening as Shaken ground subsides |
| Fire | Ignition snap, midrange burning roar and pressure, delayed embers | Low sputtering, scattered pops; stays confined to the real burn/field envelope |
| Frost | Brittle ice compression and fracture; several falling crystalline shards | Gentle glass crackle and aspirated icy air |
| Gale | Strong moving cut of air and lower turbulent pressure | Moving wind stream on the actual sword-wave body; ordinary Gale follows its real finite gust |
| Lightning | Fast dielectric snap, jagged high arc, **delayed** lower thunder | Small irregular static crackles and resonance |
| Steel | A heavy body impact and inharmonic ringing plate | Very low, settling load-bearing metal/stone rumble, not a fire explosion |
| Line of Conduct | Rising electrical gather then high crack + separate low thunder; nearest segment of the ray carries a quieter electrical tail | Brief authorized discharge only, not a 240 m infinite loop |
| Coreflagration | Initial rock/heat contact, **0.6 s bubbling pockets** tied to actual server arm timestamp | Second blast: deeper sub-pressure, cracking core and late lava/cavern roll |

### Mix and playback contract

- All recipes are WebAudio synths consumed by the already-existing `SoundEngine`; no secondary AudioContext, browser permission, service worker, media downloader or changed settings. The browser's existing first-gesture audio start and ordinary SFX volume settings are authoritative.
- `DisasterSoundscape` receives **server events** for attack/phase transitions and **server snapshots** for long-lived fields, held charging and moving waves. It never invents a damage event.
- On actual Disaster contact, base earth goes first; Fire starts at +35 ms, Frost at +95 ms, Gale at +135 ms, Lightning at +185 ms and Steel at +230 ms. This is intentional: the player can identify which infusions were present. Increasing the infusion count reduces the combined layer gain by a square-root mix rule.
- Ground Shaken fields have audio even at **zero** infusions. Their pulse is scaled by `fieldStrength(field, nowSec)` and vanishes at actual expiry. At most two distinct elemental accents occur in any field pulse; accents rotate over the lifetime, so sustained five-infusion fields never create five full simultaneous booms.
- Sword-wave emitters follow the **actual projectile position** (not the caster's start). The terminal event destroys its ongoing sound identity; remote and local attacks share the same event listener.
- Core's bubbling fuse stops when its authoritative final explosion is raised; late or duplicated event packets cannot replay the whole explosion.
- Maximum playback scope is **three nearby fields, two charging casters and three moving waves** at full quality, reduced to two fields, one charging caster and two waves on touch/low-particle quality. Distant layers use the original spatial attenuator.
- Frozen Inspection snapshots cannot produce recurring audio, and a restarted match/rewound clock clears the active emitters.
- A voice performance is never added as part of this pass. Existing voiced actions keep their own channel, rarity and cooldown.

## Audition

The existing debug audio renderer in `client/game/sound/soundDemo.mjs` now contains two independent, exportable demonstrations:

- **magma-and-lightning** (~17 s): Core arm → bubbling → deeper secondary explosion; then Line of Conduct charge → discharge → electrical tail; then Gale blast → moving wind.
- **disaster-elements** (~43 s): base, each of the five Full-infused identities separately, then all five together. Each identity includes passive field pulses.

With the game's normal sound demo UI (`?debug`), render either named demo with the existing `__ssSoundDemo.render(name)` and WAV export path. Listening remains necessary: syntactically correct procedural sound is **not proof of satisfactory timbre or subjective loudness**.

## Review checklist

1. Desktop and mobile: first user interaction unlocks playback, and Settings → Effects/Mute still works.
2. Cast Line of Conduct toward nearby and far-away walls; lightning should be local to the actual ray, not duplicated at every victim or 240 m away.
3. Hit a wall with Coreflagration: bubbling lasts until the core's real second detonation. Compare against a defended/moved core and ensure no ghost fuse.
4. Test uninfused Disaster with the player *inside and outside* the Shaken field. Rocks should be audible quietly throughout its finite lifetime, then silent.
5. Test each Half/Full infusion and a Full Five mixture; distinguish Fire, Frost, Gale, Lightning and Steel by timbre. Repeat Gale's ground wave and aerial wave to hear the moving body and smaller terminal blast.
6. Repeated Practice Ultimates and Shared Practice multiplayer: no duplicate heavy impacts, no runaway source count, no burst after an Inspection freeze.
7. Listen while Spellblade voices and music play. A big Ultimate may be powerful but should not make every line unintelligible.
8. Run `npm run verify` plus the sound recipe, controller, demo, browser and mobile suites before marking the PR ready. Do not merge or deploy from a sound-only test pass.

## Tests

- `client/game/sound/disasterSoundRecipes.test.mjs`: sample layer safety, all distinct timbres, deferred magma pops, latency and subdued passive tails.
- `client/game/sound/DisasterSoundscape.test.mjs`: event-driven core and line, field and moving-wave emitter lifetimes, pause, stop, 3-field budget, mobile budget, duplicate event protection.
- `client/game/sound/disasterDemo.test.mjs`: offline audition sequence availability and correct multi-phase timing.
