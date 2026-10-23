# BiBye v3.2 integration

## Asset identity

Argon's supplied production candidate is active at `client/assets/props/bibye-ballista/bi-bye-llista-v3.2.glb`. The request carries a content revision query so cached v3.0 bytes cannot be mistaken for v3.2.

SHA256: `c595a2bc41db7d8c5783c0795cb24276529f72932c8ecb70f72599c099937b6a`.

The verified export contains 39 nodes, 29 meshes, 28,140 triangles and 12 clips in 2,300,544 bytes. The original v3.0 GLB and gzip remain untouched as rollback, SHA256 `647a4ab490b5292fc1b67b5356705ae4bea743f87eab046863cff141eedad9d1`.

Sources supplied by the creator: [production GLB](https://drive.google.com/file/d/1YAK4DavJ-DndxOEmMar3p5A_VSsafNA0/view), [Blender project and contract](https://drive.google.com/file/d/1SbcZEK7iNxuzq0M4MI_3_J_pALsXGRiQ/view), [firing demonstration](https://drive.google.com/file/d/17-QUwa5awbGA58SacREm1fGq6S5Gv1yd/view), [reload demonstration](https://drive.google.com/file/d/1npHwcEmpx4ELhJC3C0LjdBMkRUWbgc2S/view). These files were retrieved, the archive checked and the demonstrations inspected. Their standalone renders establish authoring intent; gameplay evidence is recorded separately.

The corrected GLB is served byte for byte. Its source fixes the trunnion, banner and sight intersections. The previous v3.2 candidate is recoverable from commit `5f5fa6c` and retained locally as `previous-v3.2-9e745f77.glb`. Source materials remain intact at full health; each component receives a separate material instance for progressive darkening and roughness as it takes damage. The renderer supplies restrained sky/ground reflections to preserve PBR metal differentiation under Castleward's direct lighting. Flying bolts reuse independent geometry copies of the actual authored bolts and share their materials.

## Mechanical contract

All values below come from the exported hierarchy, rather than the old v3.0 renderer comments.

| Node | Parent | Local translation |
| :--- | :--- | :--- |
| Traverse_Mount | Carriage_Chassis | 0, 1.240, 0 |
| Elevation_Cradle | Traverse_Mount | 0, 0.380, negative 0.120 |
| Upper_Turret_Mount | Elevation_Cradle | 0, 0.920, 0.200 |
| main_bolt_muzzle | Elevation_Cradle | 0, 0.215, 1.640 |
| small_bolt_muzzle | Upper_Turret_Mount | 0, 0.245, 0.840 |
| mounted_camera_tpv | Traverse_Mount | 0, 2.410, negative 4.800 |
| mounted_camera_sight | Elevation_Cradle | 0, 0.560, negative 1.330 |

The model's positive Z axis points forward. Its world root rotates by carriage heading plus PI to match Castleward. Deployment rotates Traverse_Mount in yaw and Elevation_Cradle by negative aim pitch. Mobile aiming rotates Upper_Turret_Mount in YXZ order. The shared closed form uses the same parent pivots, without Three.js. Tests read the actual GLB and evaluate its chain independently across headings and aiming extrema.

Snapshots carry the real commitment, cooldown, transition, reload and destruction clocks. The renderer seeks those clocks, retaining the entire recoil recovery rather than switching immediately at Shot II. Outrigger tracks have their own layer. Wheel transforms come from each wheel's actual travel and steering. Aim composes with the sampled recoil quaternion, and the uncomposed pose is restored before the next sample to prevent rotation accumulation.

The example sweep and wheel roll clips stay available in the asset but do not control gameplay motion. Destroyed animation remains authoritative visually and clamps at its terminal frame. A persistent projectile light avoids changing scene light counts during the release frames.

## Rules preserved

Hull durability is now 650 HP, each of six wheels has 120 HP, and each of four stabilizers has 150 HP. Shot I remains 18 center/direct and 12 edge damage; Shot II remains 85 direct damage. Existing frost, stamina, piercing, shove, Guard, Steel and team safety rules remain in the shared simulation. Deployment/retraction still take 1.2 s, mobile recock three seconds, and full reload six seconds after 2.2 s recovery. The source asset's provisional hull note does not control Castleward durability.

Mounted commands belong to the vehicle session. Personal spells, Guard, Dash, gauntlet and Ultimate cannot start while operating. Mounting clears stale walking/Guard input and waits for an already committed personal attack or ability to finish. Input release and ownership cleanup are applied on leaving, death, room change and disconnect. Practice reset clears pending shots and presentation clocks while repairing the machine.

## Localized durability and degraded operation

The shared simulation derives operation from component health. One failed wheel reduces driving to 75 percent; two wheels on opposite sides reduce it to 50 percent. Two on the same side, or three overall, immobilize the carriage. Two failed stabilizers prevent deployment and main bolt release. The upper launcher retains normal aim and Shot I in every surviving configuration. Hull destruction clears ownership and leaves the authored solid wreck. Practice reset restores all pools and clocks.

Oriented attack volumes follow the chassis, articulated stocks, mantlets, individual wheels and each stabilizer beam, brace and shoe. Movement collision remains the conservative carriage footprint. Direct sword/projectile contacts stop at the first eligible surface and damage one pool. Explosion exposure respects world and component cover, deduplicates hull volumes, and distributes a single bounded damage budget. Failed parts remain physical cover and reject additional damage events. Practice permits maintenance attacks; other modes preserve team safety.

Support failure retracts continuously from its current fraction, eases the main launcher toward transport, and cancels an unreleased main bolt. A committed upper release remains valid and follows the composed muzzle direction during folding. The model and hit geometry use the same component hinges and damage bends. Failed wheels tilt and jam at their last authoritative rotation.

## Motion, cameras and sound

Presentation interpolates received snapshots at one local simulation tick or 75 ms for a network host, without extrapolating carriage collision. Position, wrapped angles, steering and independent wheel rolls share the sampled animation clock. Release clocks remain authoritative. Reset, disappearance, time rewind and large teleports clear interpolation history. Frozen inspection seeks the exact current snapshot.

The third person camera orbits 6.7 m behind current aim, 3.8 m above the carriage, with the existing wall avoidance and eased transitions. This keeps the full machine visible at touch viewport aiming extrema. Sight view retains the authored locator and uses the actual composed launch direction.

Siege recipes and continuous rolling/winch loops use SoundEngine and its effects bus. Release events trigger distinct frost and main discharges. Wood, metal, failed components, deployment, retraction, settling, catches and wrecks have separate sound layers. Handles stop on pause, freeze, ownership change, dismount, destruction and room exit. No engine recordings, new paid assets or alternate combat controller were added.

## Evidence

See [actual gameplay checks and limitations](../evidence/bibye-refinement/README.md). This branch changes neither publishing configuration nor multiplayer availability. Merge and release require creator approval.
