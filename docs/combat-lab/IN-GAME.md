# Cadence combat in the game (2026-11-16)

The lab's rules and smoothing, brought into the real game: the server, the network, the bots, the first-person arms,
the knights in the world and the Practice Yard. Holding Attack plays exactly as before. Pressing in time adds speed,
weight and feel, never damage.

## The rules

**Rhythm cancels the follow-through.** A press for the chain's next cut, made after the current cut's contact, is
judged against its beat (0.20 s after contact):

| Press | Window | What happens |
|---|---|---|
| On the beat | ±50 ms | The next cut begins at once, up to 0.14 s sooner than holding |
| In time | Elsewhere before the next cut would begin anyway | The next cut begins 0.26 s after contact, or at the press |
| Early (during the swing), late (after the chain ended) or held | — | Exactly the old chain |

**The mechanism** is one shared rule, `chainCadence` in `shared/src/combatFrameData.mjs`:
- The server and the local first-person arms both call it.
- The chain's clock (`attackStartedAt`) jumps ahead when the next cut begins, so the strike times, the body, the arms
  and the sounds all come with it.
- Presses are judged at their lag-compensated time (`compensatedInputTime`).
- Only the first press after each contact counts.
- Sundering slams and Chivalry's guarded cuts keep their own time.

**Never more damage.** Aim alone decides damage: 25–27 for a good ordinary blow, 28–30 only for centred aim. Instead:
- an on-beat cut bears 25% harder on a guard (an in-time one 10%);
- a server test checks that on-beat hits deal the same damage as held ones.

**Perfect Parry.** A guard the knight raised himself within 70 ms of the blow's contact:
- the attacker reels for 0.85 s instead of 0.45, a sure opening;
- the defender gains +2 prowess (6 in all).

Chivalry's automatic parry and a Vortex's blade never count. The event is still `parry`, with `perfect: true`, so every
existing listener (challenges, voice, Perry, prowess) keeps working.

**Bots** keep rhythm by skill:
- **Champion:** half its follow-ups, ±70 ms.
- **The Spellblade:** 80%, ±40 ms.
- **Knight and Squire:** fight as they always have.

A bot reads only its own chain, never your buttons.

**Challenge facts** for later Renown challenges: `cadenceOnBeat` and `perfectParry`.

## What you see and hear

- **On-beat ring:** a press on the beat rings the blade once, clean (in time, a quieter one). It's played the moment
  you press, on your own clock.
- **Perfect Parry:** a brighter, fuller parry ring, a bigger burst, the PERFECT PARRY flash, a held moment for the
  defender, and a longer reel for the attacker's arms.
- **The tell:** every knight in the world shows a glint along his blade a quarter of a second before each cut lands.
  It's read from his visible swing, and it comes before the parry window opens, so it can be answered.
- **No pops:**
  - the first-person arms hand over to the jumped path over 0.18 s;
  - swing sounds are keyed by the chain itself, not its clock;
  - knights in the world catch up with a jump over a few hundredths of a second (`client/game/chainClock.mjs`).
- **Inertialized knights:**
  - knights in a match (`RemotePlayers`) switch clips by inertialization in the game's own `SpellbladeAnimator`, in
    place of cross-fades;
  - the menu, the armory and the tour keep their tuned cross-fades;
  - every bone the pass moves is restored before the next frame (the lab's lesson: a held frame otherwise built up
    offsets).
- **Rhythm meter:** Settings → Display → Training → *Rhythm meter in the Practice Yard*. It's off by default and never
  shown in a match. Each press is a dot coloured on-beat, in time, early or late, and the last one is written in ms.

## Verified

- **Tests:**
  - server: `server/tests/cadence-combat.test.mjs` covers the held chain's exact old times, an on-beat chain's earlier
    cut, the same damage, and the Perfect Parry's reel;
  - client: `client/game/chainCadence.test.mjs` covers the arms' prediction, adopting the server's word, the
    catch-up and the tell's timing;
  - the legality test now bounds every press pattern by holding less the cancel.
- **Real Chrome in the Practice Yard** (`scripts/swordsmanship-capture-browser.mjs --scenario slash-cadence`, plus
  `--remote` for another player's view):
  - taps at 0, 0.6 and 1.18 s gave swings at 0.34, 0.90 and 1.47 s, against 0.31, 1.01 and 1.71 s holding;
  - the body went forehand → bridge → backhand → bridge → chop;
  - no pops at either cancel, in first person, in your own body, or as another player sees you;
  - the tell's glint shows at the raised sword before the chop.
- **Rhythm meter:** in the real Practice Yard it showed "On the beat +19 ms" with two on-beat dots.
- **Perfect Parry:** a guard raised 40 ms before a Fights-Back dummy's cut showed PERFECT PARRY, with no console errors.

## Not done

- **Not hand-played:** the timing windows need your hands on them.
- **Touch:** the meter and the ring work, but the tell's size on a phone screen hasn't been judged.
- **Gauntlet tearing:** the in-game fix is still PR #503's, not merged.
- **Bridges after a cancel:** they start a little earlier into the follow-through. It reads continuous in the captures,
  but the bridges were authored for the held timing.
