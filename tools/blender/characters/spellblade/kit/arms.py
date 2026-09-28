# arms.py -- shared arm builders for the third-person kit and the first-person arms (exec'd by kit_pieces.py and
# fp_kit.py after kit.py's helpers exist). Built from the concept's "weapon & hand detail" panel:
#   cuff    octagonal steel cuff flaring to the wrist with a thick brass band
#   fist    glove wrapped round the grip, raised steel plates over the back of the hand with a brass lower band,
#           a studded knuckle guard, four rounded fingers closed side by side round the grip, a steel-capped thumb
#   open    the spell hand palm up: leather palm, steel back plate underneath, four rounded fingers fanned and
#           curling up around the palm with steel scales on their backs, thumb on the outer side


def obox(pc, c, ax, h, tag, bevel=True):
    """oriented box: centre c, axes ax = (u, v, w) unit vectors, half sizes h; bevel=False keeps it unbevelled."""
    u, v, w = ax
    P = [c + u * (su * h[0]) + v * (sv * h[1]) + w * (sw * h[2]) for su in (-1, 1) for sv in (-1, 1) for sw in (-1, 1)]
    V = [pc.bm.verts.new(p) for p in P]
    for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        f = pc.face([V[i] for i in q], tag)
        if not bevel: f[pc.nobev] = 1


def rest_dir(rig, bone, posed_dir, action="Idle", frame=1):
    """the rest-pose world direction that points along posed_dir (world) once `bone` is posed in `action`."""
    ad = rig.animation_data; keep = ad.action if ad else None
    if ad is not None and action in bpy.data.actions: ad.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    R = (rig.matrix_world @ pb.bone.matrix_local).to_3x3() @ (rig.matrix_world @ pb.matrix).to_3x3().inverted()
    if ad is not None: ad.action = keep
    bpy.context.scene.frame_set(frame)
    return (R @ posed_dir).normalized()


def orth(v, a):
    v = v - a * v.dot(a); return v.normalized()


def arm_upper(pc, fr, L, lames=True):
    if lames:   # two dark lames hanging under the pauldron (concept shoulder detail)
        pc.loft(fr, [(0.028, octa(0.120, 0.130, 0.046), "steel_dark"), (0.086, octa(0.117, 0.127, 0.045), "steel_dark")])
        pc.loft(fr, [(0.080, octa(0.110, 0.120, 0.043), "steel_dark"), (0.138, octa(0.106, 0.116, 0.042), "steel_dark")])
    pc.loft(fr, [(-0.02, octa(0.090, 0.090, 0.032), "under"), (L + 0.03, octa(0.080, 0.080, 0.029), "under")])
    pc.loft(fr, [(0.170, octa(0.100, 0.100, 0.036), "steel_dark"), (0.240, octa(0.097, 0.097, 0.035), "steel_dark")])


def arm_vambrace(pc, fr, L, scale=1.0, panels=("outer", "front")):
    """flared vambrace (narrow at the elbow, wide at the cuff), brass chevron rim rising to a point over the outer
    elbow, thick brass cuff band at the wrist, raised panels that follow the flare (concept front and side views).
    panels: faces that carry a raised panel -- "outer" (+x), "front" (+y, toward the frame's front hint)."""
    k = scale
    t0, t1 = 0.020, L - 0.058
    hw0, hw1, hd0, hd1 = 0.080 * k, 0.100 * k, 0.076 * k, 0.096 * k
    pc.loft(fr, [(t0, octa(hw0, hd0, 0.030 * k), "steel"), (t1, octa(hw1, hd1, 0.036 * k), "steel")])
    vs = pc.loft(fr, [(-0.030, octa(0.090 * k, 0.086 * k, 0.033 * k), "brass"), (0.036, octa(0.088 * k, 0.084 * k, 0.032 * k), "brass")])
    for v, (x, y) in zip(vs[0], octa(0.090 * k, 0.086 * k, 0.033 * k)):      # chevron: the rim's top rises to the outer side
        v.co -= fr.a * (0.045 * max(0.0, x / (0.090 * k)) ** 1.5)
    pc.loft(fr, [(L - 0.066, octa(0.106 * k, 0.102 * k, 0.038 * k), "brass"), (L - 0.006, octa(0.110 * k, 0.106 * k, 0.040 * k), "brass")])
    pa, pb = 0.060, L - 0.082
    lerp = lambda v0, v1, t: v0 + (v1 - v0) * (t - t0) / (t1 - t0)
    for side in panels:
        # a thin plate lying on the flaring face: its inner face just under the surface, 7 mm proud
        rows = []
        for t in (pa, pb):
            if side == "outer":
                h = lerp(hw0, hw1, t); ring = [(h + 0.007 * k, 0.034 * k), (h - 0.002, 0.034 * k), (h - 0.002, -0.034 * k), (h + 0.007 * k, -0.034 * k)]
            else:
                h = lerp(hd0, hd1, t); ring = [(0.034 * k, h + 0.007 * k), (-0.034 * k, h + 0.007 * k), (-0.034 * k, h - 0.002), (0.034 * k, h - 0.002)]
            rows.append((t, ring, "steel"))
        pc.loft(fr, rows)


def hand_frame(head, tail, back_hint):
    a = (tail - head).normalized(); b = orth(back_hint, a); s = a.cross(b)
    return a, b, s


def finger(pc, base, a, b, s, lens, bends, w, th, tag="under", scale_tag="steel", tip_tag=None, bevel=False):
    """a finger as a chain of segments bending about s (positive bends curl toward -b): each segment a glove core
    with a steel scale on its back (the articulated gauntlet finger). bevel rounds the segments (the kit bevel)."""
    P = base.copy(); ang = 0.0
    for i, (ln, bd) in enumerate(zip(lens, bends)):
        ang += bd
        d = (a * math.cos(ang) - b * math.sin(ang)).normalized(); n = (a * math.sin(ang) + b * math.cos(ang)).normalized()
        c = P + d * (ln / 2)
        obox(pc, c, (d, s, n), (ln / 2, w / 2, th / 2), tag, bevel=bevel)
        st = tip_tag if (tip_tag and i == len(lens) - 1) else scale_tag
        # the scale: as long as the segment, a touch wider than it and clearly proud, so it reads from any side
        obox(pc, c + n * (th / 2 + 0.004), (d, s, n), (ln / 2 - 0.001, w / 2 + 0.0018, 0.0058), st, bevel=bevel)
        P = P + d * ln
    return P


def fan(a, p, degrees):
    """a turned about the palm normal p (fingers spreading)."""
    t = math.radians(degrees)
    return (a * math.cos(t) + p.cross(a) * math.sin(t)).normalized()


def arm_fist(pc, head, tail, back_hint, thumb_sign, k=1.3):
    """armoured fist in the hand's own frame (a toward the knuckles, b out of the back of the hand, s across):
    two overlapping back plates, a knuckle guard with four studs, four rounded three-segment fingers closed round the
    grip side by side (no gaps for the dark grip to show through, steel on every face the eye meets), and a
    steel-capped thumb wrapping across them (concept weapon & hand detail)."""
    a, b, s = hand_frame(head, tail, back_hint)
    ax = (a, s, b)
    c = head + a * (0.050 * k)
    obox(pc, c - b * (0.004 * k), ax, (0.054 * k, 0.047 * k, 0.024 * k), "leather_dark")                   # palm and glove
    obox(pc, head + a * (0.034 * k) + b * (0.024 * k), ax, (0.026 * k, 0.048 * k, 0.008 * k), "steel")     # back plate 1
    obox(pc, head + a * (0.068 * k) + b * (0.027 * k), ax, (0.022 * k, 0.049 * k, 0.008 * k), "steel")    # back plate 2 (over 1)
    obox(pc, head + a * (0.088 * k) + b * (0.027 * k), ax, (0.005 * k, 0.049 * k, 0.0085 * k), "brass")   # its brass edge
    obox(pc, head + a * (0.104 * k) + b * (0.016 * k), ax, (0.012 * k, 0.050 * k, 0.016 * k), "steel")    # knuckle guard
    lens_mid = [0.036 * k, 0.027 * k, 0.021 * k]; lens_out = [0.032 * k, 0.024 * k, 0.019 * k]
    for i, off in enumerate((-0.0345, -0.0115, 0.0115, 0.0345)):
        lens = lens_mid if i in (1, 2) else lens_out
        knuckle = head + a * (0.108 * k) + s * (off * k)
        obox(pc, knuckle + b * (0.033 * k) - a * (0.004 * k), ax, (0.007 * k, 0.0085 * k, 0.005 * k), "steel")   # stud
        finger(pc, knuckle + b * (0.002 * k), a, b, s, lens,
               [math.radians(75), math.radians(95), math.radians(70)], 0.0232 * k, 0.022 * k,
               tag="steel_dark", scale_tag="steel", bevel=True)
    tb = head + a * (0.040 * k) + s * (0.048 * k * thumb_sign) - b * (0.012 * k)
    td = (a * 0.55 - b * 0.30 - s * (0.78 * thumb_sign)).normalized(); tn = orth(b, td); tsd = td.cross(tn)
    finger(pc, tb, td, tn, tsd, [0.032 * k, 0.026 * k], [0.0, math.radians(30)], 0.024 * k, 0.022 * k,
           tag="steel_dark", scale_tag="steel", bevel=True)


def arm_open(pc, head, tail, palm_pt, thumb_sign, k=1.3):
    """palm-up spell hand cupping the rune: a leather palm (a glove, not a hole), steel back plate underneath, four
    rounded fingers fanned a little and curling up round the rune with steel scales on their backs, and a thumb out
    to the side (concept front view)."""
    a = (tail - head).normalized()
    closest = head + a * (palm_pt - head).dot(a)
    p = orth(palm_pt - closest, a)          # palm normal
    s = a.cross(p)
    ps = (palm_pt - closest).length - 0.010
    c0 = head + a * (0.048 * k)
    obox(pc, c0 + p * (ps - 0.022 * k), (a, s, p), (0.056 * k, 0.047 * k, 0.022 * k), "leather")              # palm and glove
    obox(pc, c0 + p * (ps - 0.049 * k), (a, s, p), (0.052 * k, 0.045 * k, 0.009 * k), "steel")              # back plate (underneath)
    obox(pc, c0 + p * (ps - 0.049 * k) - a * (0.051 * k), (a, s, p), (0.007 * k, 0.046 * k, 0.010 * k), "brass")
    obox(pc, head + a * (0.100 * k) + p * (ps - 0.036 * k), (a, s, p), (0.011 * k, 0.047 * k, 0.013 * k), "steel")   # knuckle guard
    # fingers curl up toward the palm normal: in finger()'s terms b = -p (the back of the hand), bends toward +p
    lens_mid = [0.036 * k, 0.028 * k, 0.022 * k]; lens_out = [0.032 * k, 0.025 * k, 0.020 * k]
    for i, (off, spread) in enumerate(zip((-0.0345, -0.0115, 0.0115, 0.0345), (-9.0, -3.0, 3.0, 9.0))):
        lens = lens_mid if i in (1, 2) else lens_out
        d = fan(a, p, spread * thumb_sign)
        finger(pc, head + a * (0.104 * k) + s * (off * k) + p * (ps - 0.024 * k), d, -p, -d.cross(p), lens,
               [math.radians(16), math.radians(40), math.radians(34)], 0.0226 * k, 0.020 * k,
               tag="leather_dark", scale_tag="steel", bevel=True)
    tb = c0 + s * (0.050 * k * thumb_sign) + p * (ps - 0.020 * k)
    td = (a * 0.40 + p * 0.40 + s * (0.82 * thumb_sign)).normalized(); tn = orth(-p, td); tsd = td.cross(tn)
    finger(pc, tb, td, tn, tsd, [0.032 * k, 0.025 * k], [0.0, math.radians(30)], 0.024 * k, 0.021 * k,
           tag="leather_dark", scale_tag="steel", bevel=True)


def arm_fist_on_grip(pc, rig, grip_obj, guard_obj, hand_bone, forearm_bone, face_hint, k=1.3):
    """grip-driven fist (the standard way to pose a hand on a weapon): the fingers wrap the sword's real grip, the
    hand continues from the forearm as it sits in the idle pose, the back of the hand faces face_hint (posed world).
    Rigid to the hand bone like the sword itself, so the fist stays closed on the grip in every action."""
    P = np.array([tuple(grip_obj.matrix_world @ v.co) for v in grip_obj.data.vertices]); gc = Vector(P.mean(0))
    g = Vector(np.linalg.svd(P - P.mean(0))[2][0])
    gu = sum((guard_obj.matrix_world @ v.co for v in guard_obj.data.vertices), Vector()) / len(guard_obj.data.vertices)
    if g.dot(gu - gc) < 0: g = -g                                    # pommel -> guard
    fb = rig.data.bones[forearm_bone]
    fdir_rest = rest_dir(rig, hand_bone, rig_posed_dir(rig, forearm_bone))   # forearm line in the hand's rest frame
    a = orth(fdir_rest, g)
    want = rest_dir(rig, hand_bone, face_hint)
    b = g.cross(a)
    thumb = 1.0
    if b.dot(want) < 0:
        g = -g; b = g.cross(a); thumb = -1.0                         # the thumb stays on the guard side
    # arm_fist wraps its fingers round (0.0985 a - 0.016 b) * k from its origin: put that on the grip
    head = gc - a * (0.0985 * k) + b * (0.016 * k)
    arm_fist(pc, head, head + a * 0.15, b, thumb, k=k)
    return gc, g


def rig_posed_dir(rig, bone, action="Idle", frame=1):
    ad = rig.animation_data; keep = ad.action if ad else None
    if ad is not None and action in bpy.data.actions: ad.action = bpy.data.actions[action]
    bpy.context.scene.frame_set(frame); bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    d = (rig.matrix_world @ pb.tail - rig.matrix_world @ pb.head).normalized()
    if ad is not None: ad.action = keep
    bpy.context.scene.frame_set(frame)
    return d
