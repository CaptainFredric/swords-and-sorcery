# Castleward: DRAG-OON V4.1 Rig, Animation Composition & Integration Specification

## 1. Official Ability & Skill Naming
* **Innate Abilities**: **Desolation Spray**, **Fuel's the Limit** (formerly Fire's the Limit), **Steam the Team**, **Cooperative Boarding & Infusion**, **All Abort!**
* **Equippable Skills**: **Raze the Pasture**, **Flight Like Hell**, **Camp Fire**, **Brimming with Potential**

## 2. Asset Metrics & Full-Geometry Ground Clearance (Master vs. LOD)

| Metric | `drag-oon-v4.1-master.glb` | `drag-oon-v4.1-lod.glb` |
| :--- | :--- | :--- |
| **File Size** | `5,650,924` B (`5.39 MB`) | `1,862,980` B (`1.78 MB`) |
| **SHA-256** | `37d639e6f3eef173de16f2d450f84083b21b80b79a7f339b120933228c944c2a` | `97937f893fda463ec196b3f4045179786d8150192a929f89d7b9c9b6c0c45e15` |
| **Scene Triangles** | `57,270` | `22,171` |
| **Nodes / Meshes / Primitives (Draw Calls)** | `134` / `19` / `49` | `134` / `19` / `49` |
| **Materials / Textures / Clips** | `6` / `6` / `21` (`11 Val_*` + `10 Comp_*`) | `6` / `6` / `21` (`11 Val_*` + `10 Comp_*`) |
| **Resting Bounds (`W x H x L`)** | `4.650 x 2.994 x 6.653 m` (`Y=[+0.0019,+2.9955]`) | `4.650 x 2.963 x 6.651 m` (`Y=[+0.0325,+2.9951]`) |

### Full-Geometry Minimum Y Audit (All Meshes, 17 Samples/Clip)

| Clip | Master Full Min Y | Master `Chassis_Main` Min Y | Master Skids Min Y | LOD Full Min Y | LOD `Chassis_Main` Min Y |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `Val_01_Stationary_Rest` | `+0.0019 m` | `+0.2469 m` | `+0.2000 m` | `+0.0325 m` | `+0.2482 m` |
| `Val_02_Wheels_Forward_Reverse` | `+0.0019 m` | `+0.2469 m` | `+0.2000 m` | `+0.0145 m` | `+0.2482 m` |
| `Val_03_Wheels_CounterRotate_Turn` | `+0.0019 m` | `+0.2469 m` | `+0.2000 m` | `+0.0145 m` | `+0.2482 m` |
| `Val_04_Cannons_DesolationSpray_Aim` | `+0.0019 m` | `+0.2469 m` | `+0.2000 m` | `+0.0325 m` | `+0.2482 m` |
| `Val_05_Cannons_FlightLikeHell_Down` (Airborne) | `-0.2120 m` (Cannons) | `+0.2469 m` | `+0.2000 m` | `-0.2120 m` (Cannons) | `+0.2482 m` |
| `Val_06_Cannons_Safe_Landing_Return` (End frame) | `+0.0019 m` | `+0.2469 m` | `+0.2000 m` | `+0.0325 m` | `+0.2482 m` |
| `Val_07_Underside_Shutters_OpenClose` | `+0.0019 m` | `+0.2469 m` | `+0.2000 m` | `+0.0325 m` | `+0.2482 m` |
| `Val_08_Rear_Boarding_And_Shutters` | `+0.0019 m` | `+0.2469 m` | `+0.2000 m` | `+0.0120 m` | `+0.2482 m` |
| `Val_09_SteamTheTeam_RadialVent` | `+0.0019 m` | `+0.2232 m` | `+0.1764 m` | `+0.0325 m` | `+0.2246 m` |
| `Val_10_CampFire_Deploy_Recover` | `+0.0019 m` | `+0.0519 m` | `+0.0050 m` | `+0.0050 m` | `+0.0532 m` |
| `Val_11_Brimming_Overpressure_Tremor` | `+0.0019 m` | `+0.2362 m` | `+0.1893 m` | `+0.0325 m` | `+0.2375 m` |

Dual-state 5.0 m ray-cast audit (Master & LOD): `0/6` Fuel Outlets, `0/8` Steam Vents (open), `0/4` Sorcery Apertures (open), `0/8` Steam Vents (Camp Fire lowered), `0/8` Camp Fire Ring origins (Camp Fire lowered).

## 3. Animation Composition & Layer Priority Specification

Do **not** compose the `Val_*` demonstration clips directly in runtime gameplay; they intentionally bundle multiple sub-systems for offline inspection. Instead, compose the non-overlapping `Comp_*` component clips (plus procedural aim/wheel/additive tracks) using the four-layer hierarchy below:

| Layer / Priority | Category | Clips / Procedural Drivers | Nodes Owned | Composition Rules |
| :--- | :--- | :--- | :--- | :--- |
| **Layer 1 (Lowest)** | Persistent Mechanical Configurations | `Comp_CampFire_Suspension_Stance`, `Comp_Visor_Shutter_Seal`, `Comp_Cannons_Fortified_Tuck` | `Chassis_Suspension_Body`, `Operator_Visor_Shutter`, `CannonAssembly_L/R` | Holds lowered `-0.195 m` stance while Camp Fire is active. Never overridden by Steam the Team or Brimming. |
| **Layer 2** | Independent Mechanical Components | `Comp_Rear_Boarding_Bay_OpenClose`, `Comp_Sorcery_Shutter_L1/R1/L2/R2_OpenClose`, `Val_07_Underside_Shutters_OpenClose`, `Val_02/03` (or procedural wheel spin) | `Rear_Access_Hatch_L/R`, `Rear_Boarding_Ramp`, individual `Sorcery_Shutter_*`, `Ignition_Shutter_L/R`, `Wheel_*` | Each passenger shutter and rear bay operates independently; Camp Fire locks these to `t = 0.0` (closed). |
| **Layer 3** | Active Ability Overrides | `Comp_Steam_Vents_Radial_Discharge`, `Val_04/05/06` (or procedural cannon yaw/pitch) | 8 `Steam_Shutter_*`, `CannonMount_L/R`, `CannonAssembly_L/R` | `Comp_Steam_Vents_Radial_Discharge` owns ONLY the 8 exhaust shutters (zero `Chassis_Suspension_Body` track), so it fires cleanly while lowered in Camp Fire and overrides Layer 4 flutter. |
| **Layer 4 (Additive)** | Additive Vibration & Recoil | `Comp_Brimming_Shutter_Flutter` + runtime additive chassis shake | Additive offset on `Chassis_Suspension_Body` (clamped `Y >= -0.195 m` when grounded) and low-priority flutter on `Steam_Shutter_*` | Suppressed on `Steam_Shutter_*` while `Comp_Steam_Vents_Radial_Discharge` is active; vertical downward shake clamped to `0` when skids are grounded in Camp Fire. |

## 4. Coordinate Conventions: Effect Origins vs. Camera References

* **Global Machine Axes**: Right-handed glTF 2.0 (`+X` = Left/Port, `+Y` = Up, `+Z` = Forward, `Y = 0.0` = Ground plane).
* **Effect Origins (`fx_*`) & Seats (`seat_*`)**: Local **`+Z`** points outward along the discharge, flame, steam, or casting direction (`+Y` up).
* **Camera Reference Nodes (`fp_camera`, `cam_aim_external`, `cam_airborne_down`, `cam_passenger_L1/R1/L2/R2`)**: Standard glTF 2.0 camera convention where local **`-Z`** is the viewing direction (`+Y` up, `+X` camera-right).
  * `cam_aim_external`: `(0.0, 3.45, -4.40)`, viewing `+Z` with `-10 deg` pitch.
  * `cam_airborne_down`: `(0.0, 3.30, -3.50)`, viewing `+Z` with `-38 deg` pitch.
  * `fp_camera`: `(0.0, 2.15, +1.30)`, viewing `+Z` horizontally.
  * `cam_passenger_L1` `( +1.10, 3.25, -0.55)` / `R1` `( -1.10, 3.25, -0.55)`: viewing outward along `±75 deg` azimuth, `-12 deg` pitch.
  * `cam_passenger_L2` `( +1.10, 3.25, -1.30)` / `R2` `( -1.10, 3.25, -1.30)`: viewing outward along `±115 deg` azimuth, `-12 deg` pitch.

## 5. Passenger Active Spellcasting & Boarding Clearance Notes

* **Static Pose Clearance (Verified)**: Using authentic `spellblade-v26.glb`, braced seated casting poses keep helmet crowns `<= 2.16 m` (`+22 cm` below `2.38 m` interior ceiling), forearms extend cleanly into the `0.56 x 0.62 m` brass embrasures without armor intersection, stowed swords clear `sword_stow_*` brackets behind each bench, and `1.20 m` longitudinal station pitch prevents shoulder/arm overlap between L1/L2 (and R1/R2) across `±28 deg` yaw and `-25 deg` to `+30 deg` pitch aiming limits.
* **Traversal Clearance (Verified Static / Unverified Animated)**: The `1.12 m` central aisle (`aisle_rear -> aisle_mid -> aisle_front`) clears a `0.78 m` armored Spellblade walking past occupied rear stations (`L2/R2`) to reach `L1/R1` or `seat_operator`. Full skeletal walk-to-sit blend transitions remain to be authored in the Spellblade character rig.
