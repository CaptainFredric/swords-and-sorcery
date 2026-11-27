# DRAG-OON V4 to V4.1 Compatibility Report (For Antigravity)

## Summary of Changes
V4.1 is a drop-in mechanical and integration-readiness update to V4. All 130 V4 node names, 6 material names, 6 shared textures, 11 `Val_*` demonstration clips, and exterior silhouette are preserved.

## Breaking Changes
* **None** for existing V4 node/material/effect-origin lookups.
* **Camera orientation standardization**: `fp_camera`, `cam_aim_external`, and `cam_airborne_down` now strictly follow glTF 2.0 camera convention (local **`-Z`** = look direction, `+Y` = up), matching the 4 newly added passenger camera references. Effect origins (`fx_*`) and seats (`seat_*`) continue to use local **`+Z`** = forward/outward.

## Additions (4 Nodes, 10 Composable Clips)
* **Added 4 passenger camera reference nodes** (children of `Chassis_Suspension_Body`, identical in Master & LOD -> 134 nodes total):
  * `cam_passenger_L1`, `cam_passenger_R1`, `cam_passenger_L2`, `cam_passenger_R2`
* **Added 10 non-overlapping composable component clips (`Comp_*`)**:
  * `Comp_CampFire_Suspension_Stance`
  * `Comp_Visor_Shutter_Seal`
  * `Comp_Cannons_Fortified_Tuck`
  * `Comp_Rear_Boarding_Bay_OpenClose`
  * `Comp_Sorcery_Shutter_L1_OpenClose`, `Comp_Sorcery_Shutter_R1_OpenClose`, `Comp_Sorcery_Shutter_L2_OpenClose`, `Comp_Sorcery_Shutter_R2_OpenClose`
  * `Comp_Steam_Vents_Radial_Discharge`
  * `Comp_Brimming_Shutter_Flutter`

## Mechanical Fixes Verified
1. **Camp Fire ground penetration eliminated**: Raised low Rodin wheel-arch remnant vertices in `Chassis_Main` (`< 0.8%` of vertices) to a clean `+0.245 m` underside datum. During Camp Fire (`-0.195 m` drop), `Underside_Ignition_Assembly` skids rest at `+0.0050 m` and `Chassis_Main` sits at `+0.0519 m` (Master) / `+0.0532 m` (LOD) instead of `-0.188 m` / `-0.183 m`.
2. **Transient grounded penetration eliminated**: Full-geometry `min_Y` across `Val_09_SteamTheTeam_RadialVent` and `Val_11_Brimming_Overpressure_Tremor` is now `+0.0019 m` (Master) / `+0.0325 m` (LOD) across all 17 sampled frames.
3. **Dual-state effect origins verified**: `0` ray-cast obstructions on all 6 fuel outlets, 8 steam vents, 4 sorcery apertures, and 8 Camp Fire fire-ring origins in both resting and lowered Camp Fire states.
4. **Naming standardized**: `Fire's the Limit` is updated to **Fuel's the Limit** in all V4.1 documentation.

## File Hashes
* `drag-oon-v4.1-master.glb`: `5,650,924` B | SHA-256 `37d639e6f3eef173de16f2d450f84083b21b80b79a7f339b120933228c944c2a`
* `drag-oon-v4.1-lod.glb`: `1,862,980` B | SHA-256 `97937f893fda463ec196b3f4045179786d8150192a929f89d7b9c9b6c0c45e15`
