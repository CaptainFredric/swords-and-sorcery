"""Verify breathing seams and the authored second strike's offhand clearance."""
from pathlib import Path
import sys
import bpy
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1]
paths=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [str(ROOT/'tools/blender/characters/spellblade/source'/f'spellblade-{kind}.blend') for kind in ('third-person','first-person')]
for path in paths:
    bpy.ops.wm.open_mainfile(filepath=path)
    rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
    scene=bpy.context.scene
    for name,start,end in [('Idle',1,60),('Guard',8,56)]:
        action=bpy.data.actions[name]
        assert tuple(action.frame_range)==(1, end), f'{name} duration changed'
        bag=action.layers[0].strips[0].channelbag(action.slots[0])
        for curve in bag.fcurves:
            assert abs(curve.evaluate(start)-curve.evaluate(end))<1e-5, f'{name} seam pose {curve.data_path}'
            h=.001
            a=(curve.evaluate(start+h)-curve.evaluate(start))/h
            b=(curve.evaluate(end)-curve.evaluate(end-h))/h
            assert abs(a-b)<.00015, f'{name} seam velocity {curve.data_path}[{curve.array_index}]: {a} vs {b}'
        print('BREATHING_SEAM_OK',Path(path).name,name)
    rig.animation_data.action=bpy.data.actions['Slash_2']
    assert tuple(rig.animation_data.action.frame_range)==(1,23), 'Second strike duration changed'
    sword=bpy.data.objects['HeroSword']
    arm=bpy.data.objects.get('Gauntlet.L') or bpy.data.objects['Arm.L']
    def tree(obj):
        obj=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=obj.to_mesh()
        result=BVHTree.FromPolygons([obj.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons])
        obj.to_mesh_clear();return result
    for i in range(177):
        frame=1+i/8;scene.frame_set(int(frame),subframe=frame%1);bpy.context.view_layer.update()
        assert not tree(sword).overlap(tree(arm)), f'{Path(path).name}: sword through offhand at frame {frame}'
    print('SECOND_STRIKE_CLEARANCE_OK',Path(path).name)
print('SPELLBLADE_COMBAT_PRESENTATION_OK')
