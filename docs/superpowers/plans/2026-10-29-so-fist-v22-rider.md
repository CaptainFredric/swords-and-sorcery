# So Fist v2.2 rider integration

Goal: integrate the supplied candidate into the real ram, with a convincing onboard rider and prompt physical fist strike.
Architecture: keep authoritative ram simulation and existing renderer. Share measured asset locators and sampled stroke timing. Reuse the production Spellblade rig with a dedicated seated pose and normal hand/foot constraints. Existing interpolated carriage frame owns rider and camera attachment.
Spec: creator handoff db9266d4 attachment, October29. Base main9abac71, branch integrate/so-fist-v22-rider. Inline execution, no agents or reviews.

1. Preserve the current GLB and source. Read candidate package as reference only. Compare matched actual renders, independently measure wheel pivots, scale and stroke. Accept useful source geometry with separate versioned paths; record hashes and provenance. Preserve existing canonical Blender source.
2. Replace ram timing constants with the actual candidate's linear stroke curve, release0.68/peak0.88/cycle4. Carry existing obstacle arrest and collision sweeps through this curve. Retain all existing damage, durability, speed, terrain and input rules. Update HUD phase timing.
3. Separate ground boarding station from onboard player root. Check elevated rider clearance against world geometry, validate safe ground exits and player overlap, handle disconnect/death/destruction. Bind existing character pelvis and boots to station geometry, grip controls and recoil; restore normal pose on release. Use the same interpolated pitched/rolled carriage for local and remote riders and cameras.
4. Inspect real game model, rider front/side/rear, sightline, drive/turn/reverse/charge and stroke arrest. Focused tests for altered contracts and lifecycle, one regression/export pass. Keep selected matched captures and short clips. Prepare draft PR only; no merge/deploy/publish.

Constraints: hull1400/fist500/wheels180/drive250, forward4.8/reverse2.5/peak12, scale2.85, existing30Hz authority and four second interval. No independent simulator or provider replacement code. Limit repeated testing and documentation; prioritize visible integration.
