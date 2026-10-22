# BiBye v3.2 integration

## Asset identity

Argon's supplied production candidate is active at `client/assets/props/bibye-ballista/bi-bye-llista-v3.2.glb`. The request carries a content revision query so cached v3.0 bytes cannot be mistaken for v3.2.

SHA256: `9e745f774e73e56d23c9a357ab0b180e7fab99a9396299c9728750359298e196`.

The verified export contains 39 nodes, 29 meshes, 28,506 triangles and 12 clips in 2,322,844 bytes. The original v3.0 GLB and gzip remain untouched as rollback, SHA256 `647a4ab490b5292fc1b67b5356705ae4bea743f87eab046863cff141eedad9d1`.

Sources supplied by the creator: [production GLB](https://drive.google.com/file/d/1GhgzNABw1de2z01Bax-ZHhw0MNuvVuTw/view), [Blender project and contract](https://drive.google.com/file/d/12-wzvPdvKPndQJAqMhuhVX-pMEoQRIbZ/view), [firing demonstration](https://drive.google.com/file/d/17-QUwa5awbGA58SacREm1fGq6S5Gv1yd/view), [reload demonstration](https://drive.google.com/file/d/1npHwcEmpx4ELhJC3C0LjdBMkRUWbgc2S/view). These files were retrieved, the archive checked and the demonstrations inspected. Their standalone renders establish authoring intent; gameplay evidence is recorded separately.

The geometry, topology and source materials are unchanged. The renderer supplies restrained sky/ground reflections to preserve PBR metal differentiation under Castleward's direct lighting. Flying bolts reuse independent geometry copies of the actual authored bolts and share their materials.

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

Durability remains 400 HP. Shot I remains 18 center/direct and 12 edge damage; Shot II remains 85 direct damage. Existing frost, stamina, piercing, shove, Guard, Steel and team safety rules remain in the shared simulation. Deployment/retraction still take 1.2 s, mobile recock three seconds, and full reload six seconds after 2.2 s recovery. The asset's provisional 300 HP note does not replace Castleward's 400 HP rule.

Mounted commands belong to the vehicle session. Personal spells, Guard, Dash, gauntlet and Ultimate cannot start while operating. Mounting clears stale walking/Guard input and waits for an already committed personal attack or ability to finish. Input release and ownership cleanup are applied on leaving, death, room change and disconnect. Practice reset clears pending shots and presentation clocks while repairing the machine.

## Evidence

See [actual gameplay checks and limitations](../evidence/bibye-v32/README.md). This branch changes neither publishing configuration nor multiplayer availability. Merge and release require creator approval.
