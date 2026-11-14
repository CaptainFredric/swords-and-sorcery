# Bi-Bye-llista — original Argon v26 integration contract

## Actual uploaded donor, inspected 2026-11-14

The uploaded **Bi_Bye_llista_GameReady_PBR.glb** contains 69 named nodes, 46 meshes, and 26 actual exported animations, not placeholders. SHA-256: `9d1a8e7920b445c29546336d1bf00190b6837549941bd84c75858f64662619e6`. The source archive ZIP SHA-256 is `cdb304075c515d0313fdcd65673e8927d07232894c97fe2a11e8666501957d60`; its only entry is `Bi_Bye_llista.blend.xz`, which decompresses to a native Blender 4.05 header.

| Existing clip | Duration | Intended use |
|---|---:|---|
| 22_BiBye_A_Sharp_Turn | 1.65 s | committed lower-bow 360-degree physical sweep |
| 23_BiBye_Look_Around_Spin_Loop | 1.20 s | uninterrupted repeating revolution |
| 24_BiBye_Look_Around_Reversed_Fire_Settle | 2.20 s | physical reversal, settle, recoil/firing transition |
| 25_BiBye_Ram_Impact_Force_Mobile | 1.40 s | additional mobile impact response, not a new attack |
| 26_BiBye_Melee_Lowered_Stance | 1.00 s | braced bow posture under loop |

Original pivots: Traverse_Mount is parented to Carriage_Chassis at local (0,1.24,0); Elevation_Cradle is parented to Traverse_Mount at (0,.38,-.12). The cradle lowers by .22m. Both Main_Limb_L and Main_Limb_R carry actual locator children: socket_frame_blade_L/R and frame_sweep_volume_L/R. The last locators sit at X=-1.82 / +1.82, Z=.12 in their respective limb frames. They are **empty locator nodes**, not authored collision box dimensions. Do not fabricate contact-event markers.

Clip 22 samples show lowering by .26s, traverse around 60 degrees by .45s, 180 degrees by .68s, nearly 360 degrees by 1.04s and completion at 1.65s. Clip 23 traverses a full 360 degrees in 1.20s. Clip 24 starts from an authored ~48-degree reversed pose and returns the traverse home by .24s. An arbitrary spin stop cannot jump into that exact starting pose. A mechanically limited settling phase must reconcile actual orientation before any release.

**Critical original-animation conflict resolved without new art:** clip 24's Main_Siege_Bolt begins its visual flight around 0.28s and scales out at 0.48s; its Upper_Conditioning_Bolt does not scale out until 0.98s. That authored heavy-first sequence cannot universally represent mobile Bolt I or an unloaded Bolt II. Therefore, the integration samples **only the original 0–0.24s stop/settle portion of clip 24**, holding its final aligned pose for any additional physical settling. Actual firing/recoil then comes exclusively from the previously working Bolt I/Bolt II animation and ammunition pipeline. The server never advances either projectile on those discarded decorative clip-24 release tracks.

## Mechanical contract

Server owns yaw, limb swept volumes, body hits, component damage, Guard, clearances, wheel immobility, and Skill resolution. The moving bow geometry is sampled in angular substeps, not replaced by a radial hit. Maximum one collision consequence per target per revolution. Ordinary turret aim limits remain unchanged outside the attack. A Sharp Turn has windup/recovery but no Skill cooldown. The selectable sustained Skill starts its machine-owned 24s cooldown **only after resolution**, never during indefinite spin.

Bolt II, coupled launch, and queued heavy fire are locked during committed spinning. Stopping must physically settle first. Then use the actual original loaded bow/muzzle, recock, shot timing and projectile pipeline; no ammunition creation or mobile Bolt II. Existing Bolt I and Bolt II remain available outside the special action, including when the third Skill is equipped. Destruction, dismount, support failure and strong machine impulse interrupt the spin.

On the client, clip 22 is the single-attack layer, clip 23 the repeated loop, clip 24 the settle, and clip 26 the author-provided lowered stance. To avoid double transformations, clip 23 and the clip 26 stance must never both own the cradle or main-limb tracks simultaneously; world-space turret yaw and lowered pitch remain authoritative. Do not override six wheel transforms, damaged components, stabilizer health or existing dual-bolt recoil/reload presentation.

## Draft-only asset staging requirement

The original donor GLB and source ZIP were inspected as **conversation uploads**, but the connected GitHub code-writing tool accepts UTF-8 text, not raw mounted binary files. They are not yet committed to this branch. The renderer will prefer the new original donor from `client/assets/props/bibye-ballista/Bi_Bye_llista_GameReady_PBR.glb` once staged; in its absence, it retains the known-good v4.3 visual model. This is **not proof of in-browser v26 animation acceptance**.

From a checkout with both originals, stage the exact bytes without replacing v4.3:

    node scripts/stage-bibye-argon-v26.mjs /path/to/Bi_Bye_llista_GameReady_PBR.glb /path/to/Bi_Bye_llista_blend_archive.zip

That command checks both SHA-256 hashes, all five named clips and all four contact locator nodes before copying. Add both binaries to the PR, run the focused machine tests, and inspect one local mounted operator plus one remote observer in real Chrome. Inspect collisions at walls/terrain, actual limb contact, Guard, stagger and knockback, impact to ram and Fight-and-Flight components, duration of stationary spin, arbitrary-angle settle, ammo and reload. **Do not merge/deploy the incomplete handoff.**

Only request animation changes from Argon if a specific demonstrated visual/geometry defect remains after integrating and inspecting these original clips. No additional Skills or features authorized.
