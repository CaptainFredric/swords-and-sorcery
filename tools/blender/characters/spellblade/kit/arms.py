# arms.py -- shared arm builders for the third-person kit and the first-person arms (exec'd by kit_pieces.py and
# fp_kit.py after kit.py's helpers exist). Built from the concept's "weapon & hand detail" panel:
#   cuff    octagonal steel cuff flaring to the wrist with a thick brass band
#   fist    dark glove wrapped round the grip, a raised steel plate over the back of the hand with a brass lower
#           band, four separate steel finger caps stacked along the grip, a dark thumb
#   open    the spell hand palm up: dark palm, steel back plate underneath, four two-segment fingers curling up
#           around the palm (steel caps on the first segments), thumb on the outer side


def obox(pc, c, ax, h, tag):
    """oriented box: centre c, axes ax = (u, v, w) unit vectors, half sizes h."""
    u, v, w = ax
    P = [c + u * (su * h[0]) + v * (sv * h[1]) + w * (sw * h[2]) for su in (-1, 1) for sv in (-1, 1) for sw in (-1, 1)]
    V = [pc.bm.verts.new(p) for p in P]
    for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        pc.face([V[i] for i in q], tag)


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


def arm_vambrace(pc, fr, L, scale=1.0):
    k = scale
    pc.loft(fr, [(-0.035, octa(0.104 * k, 0.100 * k, 0.038 * k), "brass"), (0.040, octa(0.102 * k, 0.098 * k, 0.037 * k), "brass")])
    pc.loft(fr, [(0.03, octa(0.092 * k, 0.088 * k, 0.033 * k), "steel"), (L - 0.058, octa(0.097 * k, 0.093 * k, 0.035 * k), "steel")])
    # the cuff: flares to the wrist, a brass band at its end
    pc.loft(fr, [(L - 0.062, octa(0.102 * k, 0.098 * k, 0.037 * k), "brass"), (L - 0.012, octa(0.106 * k, 0.102 * k, 0.038 * k), "brass")])


def hand_frame(head, tail, back_hint):
    a = (tail - head).normalized(); b = orth(back_hint, a); s = a.cross(b)
    return a, b, s


def arm_fist(pc, head, tail, back_hint, thumb_sign, k=1.3):
    """fist in the hand's own frame: a toward the knuckles, b out of the back of the hand, s across the knuckles."""
    a, b, s = hand_frame(head, tail, back_hint); Lh = (tail - head).length
    ax = (a, s, b)
    obox(pc, head + a * (Lh * 0.52), ax, (Lh * 0.54, 0.049 * k, 0.043 * k), "under")               # glove fist
    obox(pc, head + a * (Lh * 0.40) + b * (0.049 * k), ax, (Lh * 0.31, 0.047 * k, 0.010 * k), "steel")   # back-of-hand plate
    obox(pc, head + a * (Lh * 0.75) + b * (0.046 * k), ax, (0.011 * k, 0.047 * k, 0.012 * k), "brass")    # knuckle-side band
    for off in (-0.0365, -0.0122, 0.0122, 0.0365):                                                   # finger caps, side by side
        obox(pc, head + a * (Lh * 1.02) + s * (off * k) + b * (0.010 * k), ax, (0.012 * k, 0.0112 * k, 0.030 * k), "steel")
    obox(pc, head + a * (Lh * 0.40) + s * (0.050 * k * thumb_sign) - b * (0.012 * k), ax, (0.030 * k, 0.014 * k, 0.022 * k), "under")


def arm_open(pc, head, tail, palm_pt, thumb_sign, k=1.3):
    """palm-up spell hand: head/tail of the hand bone, palm_pt a point on the palm (the rune)."""
    a = (tail - head).normalized(); Lh = (tail - head).length
    closest = head + a * (palm_pt - head).dot(a)
    p = orth(palm_pt - closest, a)          # palm normal
    s = a.cross(p)
    ps = (palm_pt - closest).length - 0.010  # palm surface height above the bone axis
    c0 = head + a * 0.045 * k
    obox(pc, c0 + p * (ps - 0.022 * k), (a, s, p), (0.058 * k, 0.047 * k, 0.022 * k), "under")               # palm and glove
    obox(pc, c0 + p * (ps - 0.05 * k), (a, s, p), (0.052 * k, 0.043 * k, 0.009 * k), "steel")              # back plate (underneath)
    obox(pc, c0 + p * (ps - 0.05 * k) - a * 0.052 * k, (a, s, p), (0.008 * k, 0.044 * k, 0.01 * k), "brass")  # wrist edge band
    base = head + a * 0.1 * k + p * (ps - 0.02 * k)
    for i, off in enumerate((-0.0345 * k, -0.0115 * k, 0.0115 * k, 0.0345 * k)):
        ln1 = 0.042 * k if i in (1, 2) else 0.037 * k
        c1 = base + s * off + a * (ln1 / 2)
        obox(pc, c1, (a, s, p), (ln1 / 2, 0.0108 * k, 0.013 * k), "under")
        obox(pc, c1 - p * 0.014 * k, (a, s, p), (ln1 / 2 - 0.002, 0.0112 * k, 0.005 * k), "steel")       # knuckle cap
        d2 = (a * 0.50 + p * 0.866).normalized(); q2 = d2.cross(s)
        c2 = base + s * off + a * ln1 + d2 * 0.019 * k
        obox(pc, c2, (d2, s, -q2), (0.02 * k, 0.0102 * k, 0.012 * k), "steel")                          # curled tip
    thumb_d = (a * 0.45 + p * 0.55 + s * (0.70 * thumb_sign)).normalized()
    tq = thumb_d.cross(p).normalized(); tp = tq.cross(thumb_d)
    obox(pc, c0 + s * (0.046 * k * thumb_sign) + p * (ps - 0.02 * k) + thumb_d * 0.022 * k, (thumb_d, tq, tp), (0.024 * k, 0.011 * k, 0.012 * k), "steel_dark")
