# Spellblade handoff for Claude Code

## Goal and current assessment

Improve the existing avatar toward the supplied concept, one body part per review. Start with the helmet. The latest pass is closer, but artistic acceptance remains pending. The crown still reads rounder than the reference, the cheeks need more convincing plate mass and overlap, and the visor should feel recessed into the face. Prioritize silhouette, proportion, overlap and value hierarchy before decoration. Use restrained bevels. Keep the cyan bent visor lines, beveled brass crown band and red crest.

## Same repository and editable model

Repository: https://github.com/CaptainFredric/swords-and-sorcery
Branch: `art/helmet-concept-study`
Helmet commit: `5382ba4cd5d9ef8eefbaadf1cb8a7565890e864e`
Draft review: https://github.com/CaptainFredric/swords-and-sorcery/pull/49

Authoritative world model: `tools/blender/characters/spellblade/source/spellblade-third-person.blend`
First person source: `tools/blender/characters/spellblade/source/spellblade-first-person.blend`
Concept: `tools/blender/characters/spellblade/source/references/canonical-spellblade.png`
Current helmet render: `docs/art/helmet-study/current.png`

The Blender file contains packed references and a helmet comparison view. Compare the actual model and concept concurrently at matched angles. Render front, side and quarter views after each meaningful form revision. The user wants visible, focused iteration rather than another whole character reconstruction.

## Preserve and verify

Read `tools/blender/characters/spellblade/source/README.md` before editing. Edit the saved source directly. The exporter must never reconstruct the character. Preserve body meshes, existing bone/socket names, skin weights, action names and gameplay timing. Slash contact frames at 30 fps are 13, 12, 12; ending frames are 23, 23, 20. Gameplay owns displacement. Keep the root unkeyed and the reference images packed.

Blender is installed locally at `/Applications/Blender.app/Contents/MacOS/Blender`.

Run the source integration test and GLB validation commands from the source README, then inspect the candidate in the local preview. The last pass preserved body geometry, transforms, weights, bones and animation curves; Blender source tests, both GLB validators and all 231 game tests plus smoke passed. Repeat relevant checks after edits.

Production remains on the previous promoted assets. This branch changes the artistic source only. Commit and push reviewed work to this repository; distinguish source commits from asset promotion and public deployment. Check current Git status before editing and coordinate with Codex to avoid simultaneous changes to the same binary Blender file.

Next action: inspect the concept, saved model and current render; identify the two largest helmet discrepancies, then perform one focused correction and show genuine Blender renders for review. Broader anatomy and animation work follows later prompts.
