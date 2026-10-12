# Right first person gauntlet source pass

Base: main b43b3fc, with the approved sword roll commit b8c2136 carried independently as fbe1178. The density branch is frozen at 3742965. Claude's primary checkout and voice work remain untouched.

The production hand lives inside Arm.R in spellblade-first-person.blend, rigid to hand.R. It has many disconnected bevelled blocks, two broad stacked plates and four small raised studs. The physical grip is a separate connected part of HeroSword; the existing fit script reduces excess volume but retains that construction. First person and third person have independent source files and rigs. The repair should therefore affect only first person hand vertices and faces.

1. Preserve baseline Blender source and GLBs in the local evidence workspace. Measure the grip, cuff, weights, socket, actions and material palette. Capture the baseline with the approved sword roll.
2. Build a coherent source mesh in the physical grip frame: tapered faceted hand protection, a supported wrist transition, four separated armored fingers following three segments around the grip, and a plausible thumb. Keep hand mass, forearm geometry, colors, sword, rig and all animation curves. No load time geometry surgery.
3. Validate source preservation, actual grip clearance, finger separation, source save/reload, GLB weights/actions/sockets and budgets. Export first person through the existing authored pipeline. Keep third person bytes unchanged.
4. Review matched actual WeaponView poses: idle, close, overhead/side grip, Guard/parry, all three attacks, Sprint, Dash, air/landing, each ordinary spell and concurrent Chivalry. Inspect constrained viewport and transitions. Correct source geometry if the review reveals a real defect.
5. Run focused asset/motion tests and full repository verification. Commit source and export provenance, comparison captures, limitations and a precise future Blender handoff where necessary. Push and open a draft review PR. No merge, deployment or publishing.
