# turn each pauldron's geometry about its shoulder joint toward the arm's line, by `turn` (0..1 of the way), in the rest pose
import json, os
TP = json.loads(os.environ.get('PAULDTURN', '{"turn": 1.0}'))
W = arm.matrix_world
for side in ('L', 'R'):
    j = W @ arm.data.bones['upper_arm.' + side].head_local; e = W @ arm.data.bones['forearm.' + side].head_local
    pl = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Pauldron.' + side))
    pts = [pl.matrix_world @ v.co for v in pl.data.vertices]
    c = sum(pts, mathutils.Vector()) / len(pts)
    q = (c - j).normalized().rotation_difference((e - j).normalized())
    q = mathutils.Quaternion().slerp(q, TP['turn'])
    M = pl.matrix_world.inverted() @ mathutils.Matrix.Translation(j) @ q.to_matrix().to_4x4() @ mathutils.Matrix.Translation(-j) @ pl.matrix_world
    pl.data.transform(M); pl.data.update()
    print('PAULDRON', side, 'turned', round(math.degrees(q.angle), 1))
exec(open(os.environ['CAND_FILE']).read()) if os.environ.get('CAND_FILE') else None
