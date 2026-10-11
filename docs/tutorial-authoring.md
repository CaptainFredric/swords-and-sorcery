# Editing Castleward tutorials

Tutorial 1 uses Chapter → Segment → Beat. The route lives in `client/tutorial/tutorialScript.mjs`; movement geometry lives in `shared/worlds/greenerPastures.mjs`. Dialogue text is never read by Rival AI.

## The three layers

| Layer | Responsibility |
| --- | --- |
| Chapter | Editorial title and grouping. Moving play does not stop at chapter boundaries. |
| Segment | Availability, control permissions, checkpoint, scene policy, branch membership and ordered beats. |
| Beat | Spoken line, prompt, title or explicit staging action. Stable ID and recording key survive reordering. |

`tutorialRouteSegments` compiles the enabled route and recomputes each `next` link. `tutorialRouteBeats` produces the director's sequence from that route. TutorialSession and TutorialDirector both consume the compiled metadata rather than a second hardcoded beat list.

## Edit a line or remove a joke

Change the beat's `line`. Keep its `id` and `recordingKey`. Adding a dialogue beat automatically derives a key from its stable ID, for example `tutorial.another-exchange`. An explicit `recordingKey` can retain an older filename.

A dialogue beat normally advances on Continue during the opening, or on its caption/audio completion in a reactive segment. Delete that beat to remove the joke. Gameplay actions belong in a separate `kind: 'stage'` beat with an explicit `stageCue`; keep that beat if its action remains necessary.

Existing examples are `duel-onset`, `counterfire-response`, `pride-turn` and `defeat-rival`. Their scene actions do not depend on the neighboring sentence, its spelling or its recording being present.

## Insert a scene

Place a segment object anywhere in the route. This small inserted exchange continues the previous movement and learned controls:

```js
{
  id: 'another-pursuit-exchange',
  required: false,
  scene: {},
  beats: [
    { id: 'another-authored-line', speaker: 'spellblade', line: 'Creator draft.' },
  ],
}
```

The compiler supplies defaults and inherits the preceding enabled chapter, permissions and presentation when omitted. Use explicit values when the new scene needs a different policy. A new dialogue exchange requires no Rival AI edit.

Scene metadata can enter an existing policy and observe geometry:

```js
scene: {
  enter: 'rival-complaint-approach',
  checkpoint: 'counterfire',
  gates: [
    { cue: 'complaint-approached', kind: 'near-entrance',
      actor: 'rival', distance: 42, playerDistance: 70 },
  ],
}
```

Spatial gates support `near-entrance`, `near-landmark` and `past-landmark`, with named route landmarks. A past gate can require `grounded`, select an axis and specify travel direction. Combat and movement adapters own factual gates such as actual Sword contact, stamina exhaustion, real Fireball hits and Rival death. String gates compile to factual observations.

An entirely new mechanic or AI policy still needs an adapter implementation. Adding dialogue, replacing a spatial threshold or inserting an exchange does not.

## Disable or reorder a segment

Set `enabled: false`, remove the segment, or pass `omitSegments` to TutorialSession. `required: false` marks an optional scene, which can also be excluded with `includeOptional: false` when compiling the route.

Declare `requiresSegments` only for a real provider dependency. The compiler drops dependent scenes if their provider is disabled. For example, regeneration teaching depends on the ordinary Guard/postscript damage lesson; removing that provider also removes its recovery lesson. Incidental jokes have no provider dependency.

Reordering narrative scenes changes their order without changing recording IDs. Reordering gameplay teaching requires checking that each explicit gate remains reachable and its controls have been taught. Metadata exposes this contract; it cannot make an arbitrary contradictory lesson order mechanically sensible.

Checkpoints use named geometry rather than dialogue indexes. Add a checkpoint position if a newly staged encounter needs one. Retry restores one Rival, clears transient projectiles and invalidates old audio completion tokens.

## Optional reactions

Declare a branch with its stable ID, factual trigger and ordered dialogue beats. Reference that branch from each applicable segment's `branches` list. Branches are optional, reactive and offered at most once per run. Removing their membership disables them without leaving a mandatory gate behind.

The current branches cover frolicking, a real first Fireball miss, burning, actual final Guard raising and actual final Guard break. Guard reactions do not prevent an ordinary lethal hit in the final fight.

## Caption rehearsal and recordings

Narrator, spellblade and rival remain separate speaker roles. The view labels spellblade as YOU. Narrator processing remains separate from helmeted knights.

`tutorialRecordingPlan()` generates filenames and recording metadata from the current main beats plus branch beats. Regenerate the plan after script edits:

```sh
node --input-type=module <<'JS'
import { writeFile } from 'node:fs/promises';
import { tutorialRecordingPlan } from './client/tutorial/tutorialRecordings.mjs';
await writeFile('docs/tutorial-recording-plan.json',
  JSON.stringify(tutorialRecordingPlan(), null, 2) + '\n');
JS
```

Reactive `rehearsalSec` and segment `captionRehearsal` are editable presentation timing for the current caption rehearsal. They do not alter combat clocks. Actual recordings still need ingestion and a decoded buffer loader; playback completion must use the director's current cue token so restarting cannot advance stale dialogue.

## Prototype boundaries

TutorialDirector retains `prototypeStop` for an intentional chapter cutoff. A prototype boundary produces development status rather than full completion. Tutorial 1's current route has no cutoff: completion follows actual Rival defeat, title sequence, departure and closing line. Tutorial 2 remains future authored content.

## Verify an authoring change

```sh
node --test client/tutorial/TutorialAuthoring.test.mjs \
  client/tutorial/TutorialSceneCues.test.mjs \
  client/tutorial/tutorialChapters.test.mjs \
  client/tutorial/tutorialPlaythrough.test.mjs
npm run verify
```

The ordinary simulation playthrough covers the full route, a genuine first Fireball miss and omission of the optional final exchange. Browser evidence complements those checks. A real unfamiliar player remains the best test of pacing and comprehension.
