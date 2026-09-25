# Spellblade from the concept sheet

This pipeline generated the third-person Spellblade body and helmet from `source/references/canonical-spellblade.png`. It replaced the procedural pieces, whose shapes had been tuned by hand from 2D measurements. The saved `.blend` source stays authoritative. These scripts document how it was made and can regenerate it.

Scripts expect a work folder at `artifacts/concept3d/` (git-ignored) with `mv/` and `gen/` inside. Copy `inputs/*` into `artifacts/concept3d/mv/` and `data/*` into `artifacts/concept3d/gen/`. Python tools need a venv with `gradio_client`, `pillow`, `numpy` and `rembg[cpu]`. Blender scripts run in Blender 4.5.14.

## 1. Inputs
- The front, side and back panels were cropped from the sheet at native resolution. Text labels and the spell-orb effect were painted out, and each was padded to a square (`inputs/clean_*.png`).
- The helmet detail panel was upscaled ×4 (`inputs/helmet_detail.png`).
- `rembg` (`isnet-general-use`) cuts each out; the cutouts are used only for registration.

## 2. Shape generation
Tencent Hunyuan3D-2mv (turbo DiT, public Hugging Face Space), `/shape_generation`:
- **Body:** front, back and right images (the sheet's side panel shows the right side), 30 steps, guidance 5, octree 384, seed 1234 (`gen.py`).
- **Helmet:** the helmet detail as a single front image, same settings (`gen1.py`).

The raw meshes (8–25 MB) are not committed. Rerun with these settings to regenerate them.

## 3. Cleanup and assembly
- `align.py` removes specks, finds the facing by torso mirror symmetry, turns the body to +Y and scales it to the source height.
- `prep_body.py` removes the generated sword by a cylinder fitted to its blade axis (`data/blade_axis.json`). Six sliver triangles went with it.
- `head_swap.py` cuts the soft generated head above the scarf and seats the crisp helmet (`data/helmet_transform.json`). It also deletes body geometry hidden inside the helmet.

## 4. Painting from the concept
- `register.py` fits each concept view to the body by silhouette overlap (IoU 0.80 front, 0.81 side, 0.74 back). `reg_helmet.py` fits the helmet detail (IoU 0.79).
- `bake.py` decimates the meshes and unwraps them. It then bakes the views into textures by orthographic projection, weighted by how squarely each surface faces a view and gated by per-vertex visibility. Surfaces hidden from every view borrow the nearest view at low weight.
- The textures ship as JPEG: body 1536², helmet 1024².

## 5. Rig fit and animation compensation
- `fit_joints.py` and `fit_legs.py` place the joints inside the generated body (`data/joints_fit_v2.json`), from grid readings refined by limb cross-section centroids.
- `rebuild.py` moves the rest joints into the new body and adjusts each limb's roll by the minimal swing. It then pre-multiplies every quaternion key by `inverse(new local rest) @ old local rest`, including handles. Every action therefore reproduces the previous world-space bone orientations: same poses, same contact frames, same end frames. Only the pelvis has location keys, and its rest orientation is unchanged.
- The sockets and the kept sword and palm rune move with their hands.
- The body is skinned by bone heat. Cloth weights are then set explicitly down the tabard and banner chains, and nothing below the shoulder zone follows a collarbone.
- `split.py` splits by dominant bone into the validator's named regions. Normals are locked first so no seams appear.

## Budget
- 24,014 third-person triangles (limit 35,000).
- 1.97 MB GLB (limit 2 MB).
- Painted materials: `SpellbladeBodyPaint` and `SpellbladeHelmetPaint`, lit with a 0.55 emissive share so the concept's painted light reads under game lighting. `VisorGlow` and `SorceryAccent` remain the mutable accent materials.
