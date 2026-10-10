# Castleward tutorial — draft framework

**Status:** The player-facing Solo menu offers a clearly labeled *Tutorial — in development* notice. It is not yet a playable scripted tutorial. The notice can send players into the real, existing Practice Yard rather than faking a completed feature. This branch changes no combat mechanics, HP, Guard behavior, bot balance, or VO assets.

## What is ready

- `client/tutorial/tutorialScript.mjs`: one editable sequence with stable IDs and speaker attribution for future voice takes; written from the creator's preliminary draft, not final approved dialogue.
- `client/tutorial/TutorialDirector.mjs`: an isolated, testable progression state machine. Dialogue waits for `continue`; action prompts require the appropriate real gameplay cue rather than just time elapsed.
- Solo menu entry + accessible native dialog with the temporary joke: **“Is this a joke?” “Technically.”** followed by an honest under-development notice and a link to Practice.
- Tests verifying cue order, distinct sword contact / successful Guard / damage events, and skip/restart safety.

## Deferred — do not imply these are implemented

1. Connect the director to an actual **local** solo tutorial encounter and its HUD/subtitle display, with no remote dependency or server-verified Renown.
2. Create a staged rival using existing Spellblade assets and ordinary shared combat rules. He begins in a conversational pose, then draws his sword. He should not be replaced by a generic nonreactive target.
3. Align narrator, Spellblade and rival dialogue to recorded takes using the stable `tutorial.<beat-id>` recording keys. Editing lines is expected; don't script artificial pauses over unrecorded dialogue.
4. Advance `attack-prompt` on sword **contact**, not a button press; advance `guard-prompt` on a **successful Guard**. The postscript strike happens **after Guard has visibly come down**, then triggers the **normal** player-damaged event and current health presentation (the player has 100 HP at full health). There is **no** unblockable or arbitrary forced-damage rule.
5. Transition from the instructor-controlled setup to a real responsive duel. Let the ending dialogue adapt to the encounter outcome. Never override player competence just to force a scripted exchange.
6. Retain optional skip, replay, caption accessibility and a reliable return to Solo. Test desktop Pointer Lock, touch, local game flow, and actual itch.io iframe after the implementation.

## Recording session

Separate voices/performances: `narrator`, `spellblade`, `rival`. Stage/prompt entries do not require recordings. The script's `recordingKey` values are intended as asset identifiers, not claims that the files exist. Keep alternative readings and pauses where useful, particularly **“You did,” “There was an extra,”** and **“Indeed.”**

This framework intentionally leaves the script and scene choreography open for further editing before production.
