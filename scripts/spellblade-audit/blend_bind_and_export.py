# Export every Action of a Spellblade .blend with Blender's own glTF exporter, through the NLA: one track per Action
# on the armature (named for the Action, one strip of it over its own frame range), exported in NLA_TRACKS mode, so
# each Action becomes one clip whatever form it is stored in (a pre-4.4 "legacy" Action has no slot until assigned,
# and the exporter's ACTIONS mode skips those). No key is changed and nothing is saved back to the .blend.
#   Blender -b --disable-autoexec file.blend --python blend_bind_and_export.py -- out.glb
import bpy, sys

out = sys.argv[sys.argv.index('--') + 1:][0]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
ad = arm.animation_data_create()
ad.action = None
for track in list(ad.nla_tracks):
    ad.nla_tracks.remove(track)
for act in bpy.data.actions:
    track = ad.nla_tracks.new()
    track.name = act.name
    start = int(act.frame_range[0])
    strip = track.strips.new(act.name, start, act)
    strip.action_frame_start, strip.action_frame_end = act.frame_range
    track.mute = False
print('TRACKS', len(ad.nla_tracks))
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_def_bones=False, export_force_sampling=True, export_frame_step=1,
                          export_apply=False, export_yup=True, export_extras=False)
print('EXPORTED', out)
