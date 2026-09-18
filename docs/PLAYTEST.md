# Swords & Sorcery Playtest Protocol

The purpose of the first playtest is not to prove the design correct. It is to discover where the design feels wrong.

## Setup

Use two desktop/laptop browser clients with different player names. Ideally test both same-network and separate-network conditions.

Keep F3 diagnostics available during the technical pass, then hide them for the blind/fun pass.

## Pass 1 — joinability

A player receiving only the URL should be able to:

1. understand the premise within 10 seconds;
2. enter a name;
3. create or join a room;
4. understand the rules from the UI without verbal coaching;
5. enter combat within roughly 30 seconds.

Record every place the tester asks, “What do I do?”

## Pass 2 — movement

Check:

- input feels immediate;
- camera sensitivity is controllable;
- stopping/turning does not feel slippery;
- jumping clears intended geometry;
- collision does not snag on ordinary corners;
- Dash feels like deliberate movement rather than teleporting.

## Pass 3 — sword

Check:

- held attack communicates the three-hit rhythm;
- all three hits are visually/audibly distinct;
- a full uninterrupted combo defeats a 100-HP opponent in about two seconds;
- misses are understandable;
- wall hits visibly stop the swing;
- wall CLANG is funny/satisfying rather than irritating;
- two players cannot simply overlap and hold attack with no readable interaction.

## Pass 4 — defense

Check:

- Guard facing is obvious;
- blocks and parries sound/feel different;
- 180 ms parry timing is learnable under real latency;
- Guard Break is clearly communicated;
- holding Guard forever is not optimal.

## Pass 5 — Fireball

Check:

- cast startup is readable;
- projectile is visible in peripheral vision;
- projectile speed permits reaction without becoming trivial to dodge;
- direct hit feels meaningfully stronger than edge splash;
- Fireball successfully pressures static Guard;
- splash/knockback creates positional decisions.

## Pass 6 — map

Check:

- players find combat within 5–10 seconds;
- courtyard, halls and battlements feel tactically different;
- no spawn has an obviously unfair sightline;
- bridge knockback creates memorable moments without dominating every match;
- landmarks make orientation possible without a minimap.

## Pass 7 — match loop

Check:

- death attribution makes sense;
- three-second respawn does not drag;
- first-to-10 is long enough to develop a rivalry but short enough to replay;
- end screen appears correctly;
- rematch requires little friction.

## Pass 8 — blind fun test

Hide debug information. Stop explaining mechanics.

After the match ends, do not prompt the player to continue.

The strongest positive signal is that someone independently presses **Play Again** or asks for another match.
