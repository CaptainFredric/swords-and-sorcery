# Spellblade Character Pass — Visual Vertical Slice Design

Date: 2026-09-19
Status: design review
Scope: base Spellblade character presentation only

## 1. Purpose

The next development priority is not another gameplay subsystem. It is making the existing base Spellblade look and read like the intended game rather than like a technically capable prototype.

The visual target is the concept sheet supplied in the design conversation on 2026-09-19: a chunky, faceted low-poly fantasy fighter with block-derived proportions, beveled/angled armor, an enclosed helmet with a cyan luminous visor, red crest/scarf/tabard elements, dark steel armor with warmer trim, an oversized readable sword, and a cyan magical off-hand.

The character must read as a purpose-built arena fighter, not a Minecraft-like voxel character and not a stack of primitive Three.js boxes.

This pass deliberately preserves the existing authoritative combat/networking behavior. It changes presentation and model construction while retaining the working animation-state plumbing and current gameplay timings.

## 2. Why this is a separate sub-project

The full visual rebuild naturally divides into three checkpoints:

1. Character pass — Spellblade model, rig hierarchy, remote poses, first-person weapon/arms.
2. Combat-effects pass — Fireball, Dash, clash/parry/impact effects.
3. Environment pass — Shattered Keep art direction and live playtest tuning.

This spec covers checkpoint 1 only. Effects and environment work remain dependent on the character pass because combat readability should be judged against the final base fighter silhouette rather than placeholder geometry.

## 3. Current implementation to preserve

The current client already has useful structure:

- `client/game/SpellbladeModel.mjs` builds a segmented rig with separate head, torso, upper/lower arms, upper/lower legs, sword, cloth pieces, and magic anchor.
- `client/game/RemotePlayers.mjs` resolves readable states including run, air, guard, attack, cast, dash, stagger, and death and animates the existing pivots.
- `client/game/WeaponView.mjs` already separates first-person sword, right gauntlet, left magic hand, recoil, guard, cast, parry, and Dash states.
- `client/menu/MenuScene.mjs` uses the same `createSpellbladeRig()` model for the rotatable front-door character preview.

Those interfaces are valuable. The visual rebuild should keep the existing rig names and state contract wherever practical so the project does not pay for a needless animation/network rewrite.

## 4. Construction approaches considered

### A. Keep box geometry and add more boxes

Lowest implementation risk, but it cannot reach the supplied concept. More boxes would increase detail without fixing the underlying visual language. The result would remain a decorated prototype.

Rejected.

### B. External GLTF character authored in a modeling package

Potentially produces the highest-fidelity asset, but introduces an external asset pipeline, rig import, animation-export concerns, binary asset management, and a mismatch with the project's existing procedural browser model architecture. It also makes rapid code-driven silhouette iteration harder in the present workflow.

Deferred as a possible future production path, not the base-pass approach.

### C. Procedural faceted primitives and custom low-poly armor pieces

Recommended.

Keep the model code-driven, but replace the dominant `BoxGeometry` language with reusable faceted primitives: tapered prisms, beveled boxes, wedges, plates, pyramidal caps, and low-sided cylinders. Use these pieces to create angled armor planes and deliberate silhouettes while retaining the existing pivot hierarchy.

This approach is appropriate because the target design is already geometric and stylized. It can become substantially more intentional without requiring a skeletal GLTF pipeline.

## 5. Shared faceted-geometry layer

Create a small client-only geometry helper module, tentatively:

`client/game/facetedGeometry.mjs`

It should provide a limited vocabulary rather than becoming a general modeling engine. Expected helpers include concepts such as:

- beveled/tapered box or prism,
- wedge/angled plate,
- low-sided frustum,
- diamond/crest prism,
- faceted blade profile,
- low-sided boot/gauntlet forms.

The important requirement is not helper count; it is that the final character uses visible planes and tapering rather than relying primarily on rectangular solids.

Geometry should remain inexpensive enough for eight simultaneous characters on ordinary laptops.

## 6. Base Spellblade silhouette

### Overall proportions

The base Spellblade should have a heroic compact silhouette:

- head slightly smaller relative to shoulders than the current box rig,
- broad shoulder line,
- armored chest tapering toward the waist,
- narrow belt/hip transition,
- separated thighs and substantial boots,
- gauntlets large enough to read during combat,
- sword intentionally oversized,
- cloth elements creating vertical motion through the center/back of the silhouette.

The character should feel heavy enough to make sword contact credible while remaining agile enough for Dash and aerial movement.

### Helmet

The helmet is the strongest identity anchor and must be recognizable in silhouette.

Required elements:

- fully enclosed face,
- faceted cheek/jaw planes rather than a rectangular head box,
- heavy brow/forehead armor,
- cyan luminous visor seam/slit,
- red crest/plume block rising from the crown,
- darker side/back helmet mass to frame the luminous face.

The visor must remain visible at normal combat distance. It should glow, but not bloom so strongly that it erases the face shape.

### Torso and shoulders

The torso should read as layered armor rather than a cube:

- broad upper chest,
- tapered lower chest/waist,
- distinct breastplate planes,
- oversized pauldrons with outward/angled silhouettes,
- darker under-armor visible between major plates,
- warm trim used sparingly at plate boundaries.

The shoulders should help remote attack/guard poses read, not obscure the head or sword arm.

### Cloth

Preserve the red cloth identity because it breaks up the steel mass and gives motion cues.

Required:

- red neck/scarf wrap,
- front tabard,
- longer back cloth/tabard,
- optional narrow side cloth only if it remains visually clean.

Cloth should remain lightweight procedural pieces. It does not need cloth simulation; small state-driven rotations are sufficient.

### Arms and gauntlets

Arms remain segmented at shoulder/elbow so the current animation code can continue to pose them.

Each arm should read as:

- armored upper arm beneath pauldron,
- distinct forearm bracer,
- chunky gauntlet/hand,
- dark joint gaps that make articulation readable.

The left hand is the sorcery hand and should remain visually distinct through cyan light and a small restrained magical shape. The hand should still look armored; magic is an effect attached to the fighter, not a replacement for the hand.

### Legs and boots

Replace rectangular leg stacks with tapered/faceted thigh and shin armor.

Boots should be broad and slightly flared, echoing the concept sheet. They are important for making run and guard poses look grounded rather than toy-like.

### Sword

The sword should be treated as a hero prop.

Target qualities:

- broad faceted blade,
- clean readable tip,
- strong central ridge/plane change,
- substantial gold/brass crossguard,
- red inset/gem accent near the guard,
- dark leather grip,
- weighted pommel,
- larger silhouette than the current simple rectangular blade.

The remote sword and first-person sword should share the same design language and preferably the same geometry-building helper, even if their exact dimensions differ for camera readability.

The blade should not become ornate. Its strength comes from proportion and planar shape.

## 7. Palette and material hierarchy

The concept sheet's hierarchy should be preserved:

- dark under-armor: charcoal / blue-black,
- primary armor: desaturated cool gray steel,
- light armor planes: lighter steel gray,
- trim: muted warm brass/gold,
- cloth: deep crimson/red,
- leather: dark brown,
- magic/visor: cyan,
- blade: bright cool steel with a darker ridge plane.

Player accent colors should remain available, but the base cyan identity should not turn every armor plate into the player color. Accent variation belongs primarily in controlled trim/cloth/glow channels so the character remains visually coherent.

Materials should favor readable roughness/metalness differences over expensive texturing. No texture pipeline is required for this pass.

## 8. Rig compatibility and animation

The existing remote animation state system should be retained and improved rather than replaced.

The rebuilt `createSpellbladeRig()` should continue exposing the principal pivots currently consumed by `RemotePlayers` and `MenuScene`, including:

- `visual`,
- `pelvis`,
- `torso`,
- `head`,
- left/right upper arm,
- left/right forearm,
- left/right thigh,
- left/right shin,
- `sword`,
- `magicAnchor`,
- front/back cloth pieces.

If additional pivots are needed for hands, pauldrons, crest, or cloth, they may be added without changing server/network protocol.

### Pose goals

This pass does not need sophisticated keyframed animation. It does need strong silhouettes.

- Idle: stable, confident, slight breathing and magic-hand life.
- Run: clear opposing leg motion, modest torso lean, sword carried intentionally rather than flapping.
- Air: compact readable airborne pose.
- Guard: sword clearly intercepts the frontal body line; stance broadens and torso braces.
- Attack 1/2/3: each swing should have a visible windup and distinct travel direction. The third strike should read heavier.
- Cast: off-hand clearly leads; cyan buildup is obvious before projectile release.
- Dash: body compresses/leans into travel with cloth drag.
- Stagger: readable recoil without comic flailing.
- Death: simple directional collapse remains acceptable for now.

The success criterion is that an opponent can distinguish guard, attack, cast, and Dash without reading HUD text.

## 9. First-person presentation

`WeaponView` should be rebuilt with the same faceted visual language.

Required result:

- one substantial right gauntlet gripping the sword,
- visible armored forearm rather than floating weapon geometry,
- left gauntlet/off-hand visible when appropriate,
- sword framed in the lower-right without covering excessive screen area,
- crossguard and blade profile matching the remote weapon,
- idle/run/guard/slash/cast/wall-impact states remain mechanically driven by the existing pose system.

The weapon should feel present and heavy, but not enormous enough to hide targets. The existing weapon-scale constant remains tunable; this pass should not assume the current numeric scale is sacred.

## 10. Front-door showcase

Because `MenuScene` already displays the same Spellblade rig, the main menu becomes an important visual acceptance surface.

The rebuilt model should look convincing in:

- front three-quarter view,
- side view while dragged,
- back three-quarter view,
- still showcase pose.

This is useful because it exposes silhouette defects that combat screenshots can hide.

The menu stage itself is not being redesigned in this sub-project except where camera/light framing must change to present the new model accurately.

## 11. Testing and verification

### Automated contracts

Add tests that protect architecture rather than attempting to test aesthetics numerically.

Expected checks:

- the rig still exposes all pivots consumed by `RemotePlayers`/`MenuScene`,
- the model includes distinct helmet/visor/crest, pauldron, cloth, sword, and magic-hand elements,
- faceted geometry helpers produce finite positions/normals and expected bounding dimensions,
- first-person sword builder and remote sword share the intended construction path or design constants,
- existing pose/state tests remain green,
- no server/gameplay constants change as part of this pass.

### Browser evidence

The public/browser capture workflow should gain explicit evidence for the character pass.

At minimum inspect/capture:

- menu Spellblade front three-quarter view,
- menu Spellblade rotated to back/side view,
- active combat view containing a remote Spellblade,
- first-person sword/gauntlet framing,
- Guard and Cast remote silhouettes if the current automation can drive them reliably.

Visual verification is mandatory. A green unit test cannot prove that the model resembles the concept.

## 12. Acceptance criteria

This character pass is successful only if all of the following are true:

1. The base Spellblade is immediately recognizable as the same design family as the supplied concept sheet.
2. The model no longer reads primarily as stacked `BoxGeometry` primitives.
3. Helmet, shoulders, waist taper, boots, tabard, sword, and magic hand produce a strong front/side/back silhouette.
4. The rotatable menu preview looks intentional from more than one angle.
5. Remote Guard, Attack, Cast, and Dash poses are distinguishable at ordinary combat distance.
6. The first-person sword and gauntlet visually belong to the same character design.
7. Existing authoritative combat/network behavior is unchanged.
8. Repository verification passes.
9. Fresh browser screenshots are reviewed before merge.

A model that merely contains more detail but still looks like a box-stack does not pass.

## 13. Non-goals

Explicitly out of scope for this pass:

- classes or alternate character models,
- Blue Fireball / Vacuum Fireball / Flashline / other advanced sorcery variants,
- skeletal GLTF animation pipeline,
- facial customization,
- armor inventory/equipment,
- texture painting pipeline,
- environment rebuild,
- full Fireball VFX rewrite,
- new gameplay balance,
- mobile controls.

These remain future work after the base character is convincing.

## 14. Implementation sequence after approval

The implementation plan should break work into small verified steps:

1. faceted geometry helpers + tests,
2. sword geometry rebuild,
3. helmet/head identity,
4. torso/shoulder/waist silhouette,
5. arms/gauntlets and magic hand,
6. legs/boots and cloth,
7. pose retuning against the rebuilt proportions,
8. first-person weapon/arms rebuild,
9. menu camera/light adjustments if required,
10. browser screenshots and visual correction pass,
11. public capture evidence and merge only after visual review.

The governing rule is simple: preserve the working game systems, but stop allowing placeholder geometry to define the product.