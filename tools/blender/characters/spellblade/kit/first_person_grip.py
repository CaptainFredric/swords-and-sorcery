"""Fit the existing first person sword gauntlet around its actual grip.
Run on the source before this pass with a separate output .blend after --.
Only Arm.R vertex positions change; topology, weights, materials, sword, rig and actions remain artist owned.
"""
import sys
import bpy
import numpy as np
from mathutils import Vector

rig = bpy.data.objects['SpellbladeFirstPersonRig']
arm = bpy.data.objects['Arm.R']
if arm.get('authored_sword_grip'):
    raise ValueError('The authored grip refinement is already applied')
sword = bpy.data.objects['HeroSword']
hand_rest = rig.matrix_world @ rig.data.bones['hand.R'].matrix_local
hand_inverse = hand_rest.inverted()

# Identify the physical handle among the joined sword's connected components.
adjacency = {v.index: set() for v in sword.data.vertices}
for edge in sword.data.edges:
    left, right = edge.vertices
    adjacency[left].add(right)
    adjacency[right].add(left)
seen = set()
candidates = []
for vertex in sword.data.vertices:
    if vertex.index in seen:
        continue
    pending = [vertex.index]
    seen.add(vertex.index)
    indices = []
    while pending:
        index = pending.pop()
        indices.append(index)
        for neighbor in adjacency[index]:
            if neighbor not in seen:
                seen.add(neighbor)
                pending.append(neighbor)
    points = np.array([tuple(hand_inverse @ sword.matrix_world @ sword.data.vertices[i].co) for i in indices])
    center = points.mean(0)
    _, _, axes = np.linalg.svd(points - center)
    axis = axes[0]
    length = np.ptp((points - center) @ axis)
    if np.linalg.norm(center) < .15 and .15 < length < .26:
        candidates.append((center, axis, points))
if len(candidates) != 1:
    raise ValueError(f'Expected one physical grip, found {len(candidates)}')
center, axis, points = candidates[0]
grip = Vector(center)
axis = Vector(axis)
radius = max((Vector(p) - grip - axis * (Vector(p) - grip).dot(axis)).length for p in points)
print('GRIP', tuple(grip), tuple(axis), 'radius', radius)

for vertex in arm.data.vertices:
    weights = {arm.vertex_groups[g.group].name: g.weight for g in vertex.groups}
    bone_name = max(weights, key=weights.get)
    if bone_name not in ('hand.R', 'forearm.R'):
        continue
    bone_rest = rig.matrix_world @ rig.data.bones[bone_name].matrix_local
    point = bone_rest.inverted() @ arm.matrix_world @ vertex.co
    if bone_name == 'forearm.R':
        # Preserve the slim forearm profile previously applied at load time.
        point.x *= .84
        point.z *= .84
    else:
        delta = point - grip
        along = delta.dot(axis)
        radial = delta - axis * along
        distance = radial.length
        # Reduce excess glove volume around the actual handle instead of shrinking into it.
        scaled = radius + max(0, distance - radius) * .64 if distance > radius else distance
        if distance > 1e-8:
            radial *= scaled / distance
        target = grip + axis * (along * .80) + radial
        # Retain the wrist connection inside the cuff, blending into the fitted palm.
        t = max(0, min(1, (point.length - .025) / .05))
        point = point.lerp(target, t * t * (3 - 2 * t))
    vertex.co = arm.matrix_world.inverted() @ bone_rest @ point
arm.data.update()
arm['authored_sword_grip'] = True
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[sys.argv.index('--') + 1], copy=True)
