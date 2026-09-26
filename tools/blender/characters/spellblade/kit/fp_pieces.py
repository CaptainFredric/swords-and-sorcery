# fp_pieces.py -- executed inside kit.py with KIT_MODE=fp on the first-person source. The first-person arms are built
# by the same builders as the third-person arms (arms.py) with the same materials, so both views share one look;
# the first-person rig, camera and actions are kept as authored. The hands are drawn 15% larger and the vambraces 8%
# slimmer than in third person so the gauntlets read at arm's length.
ONLY = set()
exec(open(KITDIR + "arms.py").read())
exec(open(KITDIR + "recolor.py").read())

OLD = {"ArmUnder", "ForearmUnder", "WristGlove", "Vambrace", "VambraceLip", "GauntletCuff", "Gauntlet", "HandPlate",
       "Finger", "FingerCurl", "FingerTip", "Thumb", "ThumbTip"}
for ob in list(exp.all_objects):
    if ob.type == "MESH" and ob.name.split(".")[0] in OLD:
        bpy.data.objects.remove(ob)

UP = (0, 0, 1)      # the camera looks down +Y, so "front" of each arm piece is up, toward the view
for s, m in (("R", 1), ("L", -1)):
    pc = Piece(f"Arm.{s}")
    fr = bone_frame(f"upper_arm.{s}", m, UP)
    arm_upper(pc, fr, fr.L, lames=False)
    pc.build(bone=f"upper_arm.{s}", grad=False)
    pc = Piece(f"Vambrace.{s}")
    fr = bone_frame(f"forearm.{s}", m, UP)
    arm_vambrace(pc, fr, fr.L, scale=0.92)
    pc.build(bone=f"forearm.{s}", grad=False)
    pc = Piece(f"Gauntlet.{s}")
    hh, ht = BONE[f"hand.{s}"]
    if s == "R":
        # the back of the sword fist faces up and back toward the eye in the idle pose
        arm_fist(pc, hh, ht, rest_dir(rig, "hand.R", Vector((-0.2, -0.3, 0.93))), -1.0, k=1.5)
    else:
        rune = bpy.data.objects["PalmRune"]
        rc = sum((rune.matrix_world @ v.co for v in rune.data.vertices), Vector()) / len(rune.data.vertices)
        arm_open(pc, hh, ht, rc, -1.0, k=1.5)
    pc.build(bone=f"hand.{s}", grad=False)

SW = {"SteelEdge": ("steel", 1.55, 0), "SteelFacet": ("steel", 1.25, 0), "SteelShade": ("steel_dark", 1.0, 0),
      "CrimsonCloth": ("cloth", 1.9, 0), "Leather": ("leather_dark", 1.0, 0)}
for ob in list(exp.all_objects):
    if ob.type == "MESH" and ob.name.startswith(("HeroSword", "Sword", "GripWrap")):
        recolor(ob, SW)

MERGE = {"Arm.R": ["Vambrace.R", "Gauntlet.R"], "Arm.L": ["Vambrace.L", "Gauntlet.L"],
         "HeroSword": ["SwordGuard", "SwordGemSetting", "SwordGem", "SwordGrip", "SwordPommel"] + [f"GripWrap.{i}" for i in range(5)]}
for target, parts in MERGE.items():
    tgt = bpy.data.objects.get(target)
    objs = [bpy.data.objects[p_] for p_ in parts if p_ in bpy.data.objects]
    if tgt is None or not objs: continue
    for o in bpy.context.view_layer.objects: o.select_set(False)
    for o in objs + [tgt]: o.select_set(True)
    bpy.context.view_layer.objects.active = tgt
    with bpy.context.temp_override(active_object=tgt, selected_editable_objects=objs + [tgt], object=tgt):
        bpy.ops.object.join()
    BUILT[target] = len(tgt.data.polygons)
    for p_ in parts: BUILT.pop(p_, None)

FIN_GROUP = {"Arm.R": "armR", "Arm.L": "armL"}
FIN_OCC = {"armR": ("armR",), "armL": ("armL",)}
exec(open(KITDIR + "kit_finish.py").read())
