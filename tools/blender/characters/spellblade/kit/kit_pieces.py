# kit_pieces.py -- executed inside kit.py (helpers: Frame, World, bone_frame, octa, Piece, BONE, P)
ONLY = set(filter(None, __import__("os").environ.get("KIT_ONLY", "").split(",")))


def want(group): return not ONLY or group in ONLY


def boot_sec(hw, h, ct, cb=0.012):
    return [(hw, cb), (hw, h - ct), (hw - ct, h), (-(hw - ct), h), (-hw, h - ct), (-hw, cb), (-(hw - cb), 0.0), (hw - cb, 0.0)]


# ================================================================ legs
if want("legs"):
    for s, m in (("R", 1), ("L", -1)):
        ank = BONE[f"shin.{s}"][1]; knee = BONE[f"shin.{s}"][0]
        # ---------------- boot: world-aligned loft heel -> toe (x side, y up)
        pc = Piece(f"Boot.{s}")
        heel = Vector((ank.x, ank.y - 0.13, 0.0))
        fr = Frame(heel, heel + Vector((0, 1, 0)), Vector((0, 0, 1)), m)
        secs = [(0.00, 0.086, 0.150, 0.040), (0.03, 0.104, 0.170, 0.050), (0.16, 0.110, 0.165, 0.055),
                (0.27, 0.112, 0.122, 0.050), (0.36, 0.104, 0.086, 0.038), (0.41, 0.084, 0.060, 0.028)]
        pc.loft(fr, [(t, boot_sec(hw, h, c), "steel") for t, hw, h, c in secs])
        # sole: a slightly wider dark slab
        pc.loft(fr, [(t - (0.006 if i == 0 else -0.006 if i == len(secs) - 1 else 0), boot_sec(hw + 0.008, 0.026, 0.006, 0.004), "steel_dark")
                     for i, (t, hw, h, c) in enumerate(secs)])
        # instep strap with an outer buckle
        strap = [(t, boot_sec(hw + 0.007, h + 0.006, c), "leather_dark") for t, hw, h, c in ((0.200, 0.1115, 0.150, 0.053), (0.245, 0.1118, 0.139, 0.052))]
        pc.loft(fr, strap)
        pc.box(fr, 0.195, 0.250, 0.112, 0.128, 0.060, 0.118, "buckle")
        # ankle band (brass), world-vertical ring around the ankle
        wf = World((ank.x, ank.y + 0.005, 0.0), m)
        band = octa(0.104, 0.100, 0.036)
        pc.loft(wf, [(0.155, band, "brass"), (0.232, band, "brass")])
        pc.build(bone=f"foot.{s}")

        # ---------------- greave + knee cop + brass band under the knee
        pc = Piece(f"Greave.{s}")
        fr = bone_frame(f"shin.{s}", m)
        L = fr.L
        pc.loft(fr, [(0.07, octa(0.080, 0.080, 0.030), "steel"), (L - 0.02, octa(0.070, 0.070, 0.027), "steel")])
        pc.loft(fr, [(0.068, octa(0.100, 0.098, 0.040), "brass"), (0.138, octa(0.098, 0.096, 0.040), "brass")])
        kr = [(-0.130, 0.068, 0.062, 0.028, 0.020, "steel"), (-0.104, 0.100, 0.094, 0.040, 0.030, "brass"),
              (-0.084, 0.104, 0.098, 0.041, 0.034, "steel"), (0.000, 0.112, 0.106, 0.046, 0.046, "steel"),
              (0.075, 0.090, 0.086, 0.038, 0.034, "steel")]
        vs = [[pc.bm.verts.new(fr.pt(t, x, y + yo)) for x, y in octa(hw, hd, c)] for t, hw, hd, c, yo, _ in kr]
        for k in range(len(kr) - 1):
            for i in range(8):
                j = (i + 1) % 8
                pc.face((vs[k][i], vs[k][j], vs[k + 1][j], vs[k + 1][i]), kr[k][5])
        pc.face(list(reversed(vs[0])), "brass"); pc.face(vs[-1], "steel")
        pc.build(bone=f"shin.{s}")

        # ---------------- thigh: undersuit, dark cuisse lames, leather tasset straps
        pc = Piece(f"Thigh.{s}")
        fr = bone_frame(f"thigh.{s}", m)
        L = fr.L
        pc.loft(fr, [(-0.03, octa(0.118, 0.122, 0.045), "under"), (0.20, octa(0.116, 0.116, 0.045), "under"),
                     (L - 0.08, octa(0.092, 0.096, 0.036), "under"), (L + 0.02, octa(0.080, 0.084, 0.030), "under")])
        for t0, t1 in ((0.13, 0.23), (0.23, 0.33)):
            wa = 0.128 - 0.010 * (t0 - 0.13) / 0.1
            pc.loft(fr, [(t0, octa(wa, wa + 0.004, 0.045), "steel_dark"), (t1, octa(wa - 0.010, wa - 0.006, 0.040), "steel_dark")])
        for x0, x1 in ((0.010, 0.064), (0.074, 0.128)):
            ring = [(x1, 0.142), (x0, 0.142), (x0, 0.127), (x1, 0.127)]
            pc.loft(fr, [(-0.15, ring, "leather"), (0.30, ring, "leather")])
            pc.box(fr, 0.00, 0.048, x0 - 0.007, x1 + 0.007, 0.124, 0.152, "buckle")
        # outer hip tasset: dark steel plate hanging from the belt with a brass rim at the bottom
        pc.loft(fr, [(-0.13, [(0.150, 0.110), (0.118, 0.110), (0.118, -0.090), (0.150, -0.090)], "steel_dark"),
                     (0.12, [(0.162, 0.118), (0.128, 0.118), (0.128, -0.096), (0.162, -0.096)], "brass"),
                     (0.15, [(0.162, 0.118), (0.128, 0.118), (0.128, -0.096), (0.162, -0.096)], "brass")])
        pc.build(bone=f"thigh.{s}")


def smoothstep(a, b, x):
    u = min(1.0, max(0.0, (x - a) / (b - a))); return u * u * (3 - 2 * u)


def lerp_path(z, pts):
    """pts: [(z, y)] sorted by descending z; linear interpolation, clamped."""
    if z >= pts[0][0]: return pts[0][1]
    for (z0, y0), (z1, y1) in zip(pts, pts[1:]):
        if z1 <= z <= z0: return y0 + (y1 - y0) * (z0 - z) / (z0 - z1)
    return pts[-1][1]


TY = 0.01            # torso centre y


def torso_weights(co):
    z = co.z
    if z < 1.12: return {"pelvis": 1.0}
    if z < 1.28: u = smoothstep(1.12, 1.28, z); return {"pelvis": 1 - u, "spine": u}
    if z < 1.36: return {"spine": 1.0}
    if z < 1.48: u = smoothstep(1.36, 1.48, z); return {"spine": 1 - u, "chest": u}
    return {"chest": 1.0}


def chain_strip(pc, nodes, half_w, y_front, y_back, tag):
    """closed strip along a polyline chain of (outer_xz, inner_xz, yf(x,z)) nodes -- used for plate trims."""
    O = [(pc.bm.verts.new((o[0], y_front(*o), o[1])), pc.bm.verts.new((o[0], y_back(*o), o[1]))) for o, i in nodes]
    I = [(pc.bm.verts.new((i[0], y_front(*i), i[1])), pc.bm.verts.new((i[0], y_back(*i), i[1]))) for o, i in nodes]
    for k in range(len(nodes) - 1):
        pc.face((O[k][0], O[k + 1][0], I[k + 1][0], I[k][0]), tag)
        pc.face((I[k][1], I[k + 1][1], O[k + 1][1], O[k][1]), tag)
        pc.face((O[k][1], O[k + 1][1], O[k + 1][0], O[k][0]), tag)
        pc.face((I[k][0], I[k + 1][0], I[k + 1][1], I[k][1]), tag)
    for k in (0, len(nodes) - 1):
        pc.face((O[k][0], I[k][0], I[k][1], O[k][1]), tag)


def inset(poly, w):
    n = len(poly); out = []
    # inward normals for a CCW polygon in (x, z)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1
    def nrm(a, b):
        dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz); return (-dz / L * sgn, dx / L * sgn)
    for i in range(n):
        n1 = nrm(poly[i - 1], poly[i]); n2 = nrm(poly[i], poly[(i + 1) % n])
        d = 1 + n1[0] * n2[0] + n1[1] * n2[1]
        out.append((poly[i][0] + w * (n1[0] + n2[0]) / d, poly[i][1] + w * (n1[1] + n2[1]) / d))
    return out


def curved_plate(pc, outline, rows, yf, thick, tag, ncol=7):
    """plate bounded by a convex (x, z) outline with flat top/bottom edges; front surface y = yf(x, z)."""
    def xr(z):
        xs = []
        n = len(outline)
        for i in range(n):
            (x0, z0), (x1, z1) = outline[i], outline[(i + 1) % n]
            if min(z0, z1) - 1e-9 <= z <= max(z0, z1) + 1e-9 and abs(z1 - z0) > 1e-9:
                xs.append(x0 + (x1 - x0) * (z - z0) / (z1 - z0))
            elif abs(z1 - z0) <= 1e-9 and abs(z - z0) < 1e-9: xs += [x0, x1]
        return min(xs), max(xs)
    F, Bk = [], []
    for z in rows:
        a, b = xr(z)
        F.append([pc.bm.verts.new((a + (b - a) * i / (ncol - 1), yf(a + (b - a) * i / (ncol - 1), z), z)) for i in range(ncol)])
        Bk.append([pc.bm.verts.new((v.co.x, v.co.y - thick, v.co.z)) for v in F[-1]])
    for j in range(len(rows) - 1):
        for i in range(ncol - 1):
            pc.face((F[j][i], F[j][i + 1], F[j + 1][i + 1], F[j + 1][i]), tag)
            pc.face((Bk[j][i + 1], Bk[j][i], Bk[j + 1][i], Bk[j + 1][i + 1]), tag)
    ring = [F[0][i] for i in range(ncol)] + [F[j][ncol - 1] for j in range(1, len(rows))] + \
           [F[-1][i] for i in range(ncol - 2, -1, -1)] + [F[j][0] for j in range(len(rows) - 2, 0, -1)]
    ringb = [Bk[0][i] for i in range(ncol)] + [Bk[j][ncol - 1] for j in range(1, len(rows))] + \
            [Bk[-1][i] for i in range(ncol - 2, -1, -1)] + [Bk[j][0] for j in range(len(rows) - 2, 0, -1)]
    for k in range(len(ring)):
        l = (k + 1) % len(ring)
        pc.face((ring[k], ringb[k], ringb[l], ring[l]), tag)


def trim(pc, outline, chain_idx, w, yf, lift, depth, tag, sub=3):
    ins = inset(outline, w)
    nodes = []
    for a, b in zip(chain_idx, chain_idx[1:]):
        for s_ in range(sub):
            u = s_ / sub
            o = (outline[a][0] + (outline[b][0] - outline[a][0]) * u, outline[a][1] + (outline[b][1] - outline[a][1]) * u)
            i = (ins[a][0] + (ins[b][0] - ins[a][0]) * u, ins[a][1] + (ins[b][1] - ins[a][1]) * u)
            nodes.append((o, i))
    nodes.append((outline[chain_idx[-1]], ins[chain_idx[-1]]))
    chain_strip(pc, nodes, w, lambda x, z: yf(x, z) + lift, lambda x, z: yf(x, z) - depth, tag)


# ================================================================ torso
if want("torso"):
    pc = Piece("TorsoUnder")
    wf = World((0, TY, 0), 1)
    rings = [(0.95, 0.200, 0.160, 0.060), (1.10, 0.212, 0.168, 0.064), (1.25, 0.214, 0.170, 0.064), (1.40, 0.232, 0.188, 0.070),
             (1.52, 0.242, 0.194, 0.072), (1.62, 0.210, 0.176, 0.068), (1.70, 0.110, 0.100, 0.036)]
    pc.loft(wf, [(z, octa(hw, hd, c), "under") for z, hw, hd, c in rings])
    # dark steel lame across the abdomen under the breastplate point
    pc.loft(wf, [(1.295, octa(0.228, 0.186, 0.070), "steel_dark"), (1.385, octa(0.238, 0.196, 0.074), "steel_dark")])
    pc.build(weights=torso_weights)

    # ---------------- breastplate (shield), brass side trims, back plate, scarf roll + front flap: chest
    pc = Piece("Breastplate")
    y0 = [(1.625, 0.214), (1.56, 0.230), (1.50, 0.234), (1.42, 0.230), (1.305, 0.208)]
    yf = lambda x, z: lerp_path(z, y0) - 1.35 * x * x
    shield = [(0.185, 1.625), (0.205, 1.50), (0.030, 1.305), (-0.030, 1.305), (-0.205, 1.50), (-0.185, 1.625)]
    curved_plate(pc, shield, [1.305, 1.36, 1.43, 1.50, 1.565, 1.625], yf, 0.028, "steel")
    trim(pc, shield, [0, 1, 2, 3, 4, 5], 0.030, yf, 0.006, 0.010, "brass")
    yb = lambda x, z: -(0.206 - 1.1 * x * x)
    back = [(0.20, 1.625), (0.215, 1.47), (0.19, 1.38), (-0.19, 1.38), (-0.215, 1.47), (-0.20, 1.625)]
    curved_plate(pc, [(x, z) for x, z in back], [1.38, 1.47, 1.55, 1.625], lambda x, z: yb(x, z) + 0.022, 0.022, "steel_dark")
    # scarf: two bulky stacked rolls around the neck (front lower than back) and a flap over the chest
    N = 16
    def roll(cy, rx, ry, zc, dip, rw, rh):
        sec = [(rw, rh * 0.62), (rw * 0.62, rh), (-rw * 0.62, rh), (-rw, rh * 0.62), (-rw, -rh * 0.62), (-rw * 0.62, -rh), (rw * 0.62, -rh), (rw, -rh * 0.62)]
        ringv = []
        for i in range(N):
            th = 2 * math.pi * i / N
            c = Vector((rx * math.cos(th), cy + ry * math.sin(th), zc - dip * math.sin(th) + 0.022 * math.cos(th)))
            rad = Vector((math.cos(th) / rx, math.sin(th) / ry, 0)).normalized()
            ringv.append([pc.bm.verts.new(c + rad * r + Vector((0, 0, zz))) for r, zz in sec])
        for i in range(N):
            j = (i + 1) % N
            for k in range(8):
                l = (k + 1) % 8
                pc.face((ringv[i][k], ringv[j][k], ringv[j][l], ringv[i][l]), "cloth" if k in (0, 1, 2, 7) else "cloth_dark")
    roll(0.050, 0.200, 0.196, 1.646, 0.052, 0.058, 0.052)       # lower, wider roll resting on the shoulders
    roll(0.060, 0.170, 0.168, 1.716, 0.040, 0.046, 0.044)       # upper roll wrapping the helmet base
    fl = [((-0.020, 0.294, 1.615), (-0.178, 0.284, 1.632)), ((-0.052, 0.302, 1.468), (-0.192, 0.292, 1.495))]
    th_ = 0.036
    q = [pc.bm.verts.new(p) for p in (fl[0][0], fl[0][1], fl[1][1], fl[1][0])]
    qb = [pc.bm.verts.new((v.co.x, v.co.y - th_, v.co.z)) for v in q]
    pc.face(q, "cloth"); pc.face(list(reversed(qb)), "cloth_dark")
    for k in range(4):
        l = (k + 1) % 4; pc.face((q[k], qb[k], qb[l], q[l]), "cloth_dark" if k == 2 else "cloth")
    pc.build(bone="chest")

    # ---------------- belt, diamond stud, buckle: pelvis
    pc = Piece("Belt")
    band = octa(0.240, 0.196, 0.074)
    pc.loft(wf, [(1.192, band, "leather"), (1.298, band, "leather")])
    yb_ = TY + 0.196
    # brass diamond with a steel pyramid centre (character's right of centre)
    cx, cz = 0.085, 1.245
    dia = [(cx, cz + 0.052), (cx - 0.046, cz), (cx, cz - 0.052), (cx + 0.046, cz)]
    fr = Frame(Vector((0, yb_ - 0.004, 0)), Vector((0, yb_ + 1, 0)), Vector((0, 0, 1)), 1)   # axis +Y; x = X, y = Z... see pt
    top_ = [pc.bm.verts.new((x, yb_ + 0.018, z)) for x, z in dia]; bot_ = [pc.bm.verts.new((x, yb_ - 0.004, z)) for x, z in dia]
    pc.face(top_, "brass"); pc.face(list(reversed(bot_)), "brass")
    for k in range(4):
        l = (k + 1) % 4; pc.face((bot_[k], bot_[l], top_[l], top_[k]), "brass")
    apex = pc.bm.verts.new((cx, yb_ + 0.042, cz))
    small = [pc.bm.verts.new((cx + (x - cx) * 0.45, yb_ + 0.019, cz + (z - cz) * 0.45)) for x, z in dia]
    for k in range(4):
        l = (k + 1) % 4; pc.face((small[k], small[l], apex), "buckle")
    # square steel buckle frame (character's left of centre) with a dark hole and tongue
    bx, bz, ow, oh, iw, ih = -0.112, 1.245, 0.058, 0.064, 0.030, 0.036
    outer = [(bx + ow, bz + oh), (bx - ow, bz + oh), (bx - ow, bz - oh), (bx + ow, bz - oh)]
    inner = [(bx + iw, bz + ih), (bx - iw, bz + ih), (bx - iw, bz - ih), (bx + iw, bz - ih)]
    F = [pc.bm.verts.new((x, yb_ + 0.020, z)) for x, z in outer]; Fi = [pc.bm.verts.new((x, yb_ + 0.020, z)) for x, z in inner]
    Bo = [pc.bm.verts.new((x, yb_ - 0.004, z)) for x, z in outer]; Bi = [pc.bm.verts.new((x, yb_ + 0.004, z)) for x, z in inner]
    for k in range(4):
        l = (k + 1) % 4
        pc.face((F[k], F[l], Fi[l], Fi[k]), "buckle")
        pc.face((Bo[k], Bo[l], F[l], F[k]), "buckle")
        pc.face((Fi[k], Fi[l], Bi[l], Bi[k]), "buckle")
    pc.face(list(reversed(Bi)), "leather_dark")
    tong = [pc.bm.verts.new(p) for p in ((bx + 0.004, yb_ + 0.026, bz + 0.008), (bx - 0.046, yb_ + 0.026, bz + 0.008),
                                         (bx - 0.046, yb_ + 0.026, bz - 0.008), (bx + 0.004, yb_ + 0.026, bz - 0.008))]
    pc.face(tong, "buckle")
    pc.build(bone="pelvis")

# ================================================================ arms
def octa2(hw, hd, ct, cb):
    """x up (+hw top): chamfer ct at the top corners, cb at the bottom corners."""
    return [(hw - ct, hd), (-(hw - cb), hd), (-hw, hd - cb), (-hw, -(hd - cb)), (-(hw - cb), -hd), (hw - ct, -hd), (hw, -(hd - ct)), (hw, hd - ct)]


if want("arms"):
    for s, m in (("R", 1), ("L", -1)):
        # ---------------- pauldron: vertical dome, brass rim, brass inner-front edge, stud (clavicle)
        pc = Piece(f"Pauldron.{s}")
        # octagonal base walls with a brass rim, then a gabled roof: a pentagon seen from the front, a peaked
        # hexagon seen from the side (concept), the roof sloping down toward the outer edge
        # (z, dx, hw, hd, c, outward tilt, gable, tag)
        rings = [(1.545, 0.000, 0.150, 0.178, 0.042, 0.00, 0.00, "steel"), (1.705, 0.000, 0.150, 0.178, 0.042, 0.22, 0.00, "steel"),
                 (1.752, -0.012, 0.134, 0.114, 0.038, 0.30, 0.30, "steel"), (1.790, -0.028, 0.092, 0.030, 0.012, 0.34, 0.00, "steel")]
        cxp = 0.362
        vs = []
        for z, dx, hw, hd, c, tilt, gab, _ in rings:
            vs.append([pc.bm.verts.new(((cxp + dx + x) * m, y, z - tilt * (x + 0.02) - gab * abs(y))) for x, y in octa(hw, hd, c)])
        for k in range(len(rings) - 1):
            for i in range(8):
                j = (i + 1) % 8
                tg = rings[k][7]
                if tg == "steel" and i == 2 and k < 1: tg = "brass"        # brass strip up the inner front edge
                f = pc.face((vs[k][i], vs[k][j], vs[k + 1][j], vs[k + 1][i]), tg)
        # protruding brass trim band around the bottom edge
        rim = []
        for z in (1.488, 1.552):
            rim.append([pc.bm.verts.new(((cxp + x) * m, y, z)) for x, y in octa(0.164, 0.192, 0.046)])
        for i in range(8):
            j = (i + 1) % 8; pc.face((rim[0][i], rim[0][j], rim[1][j], rim[1][i]), "brass")
        pc.face(list(reversed(rim[0])), "brass"); pc.face(rim[1], "brass")
        pc.face(list(reversed(vs[0])), "steel_dark"); pc.face(vs[-1], "steel")
        # stud: brass square + steel-lit pyramid at the lower inner front
        sx, sz, hs = (cxp - 0.092) * m, 1.598, 0.034
        yfr = 0.178 - 0.002
        sq = [(sx + hs, sz + hs), (sx - hs, sz + hs), (sx - hs, sz - hs), (sx + hs, sz - hs)]
        T = [pc.bm.verts.new((x, yfr + 0.016, z)) for x, z in sq]; Bq = [pc.bm.verts.new((x, yfr - 0.004, z)) for x, z in sq]
        for k in range(4):
            l = (k + 1) % 4; pc.face((Bq[k], Bq[l], T[l], T[k]), "brass")
        ap = pc.bm.verts.new((sx, yfr + 0.046, sz))
        for k in range(4):
            l = (k + 1) % 4; pc.face((T[k], T[l], ap), "brass")
        pc.face(list(reversed(Bq)), "brass")
        pc.build(bone=f"clavicle.{s}")

        # ---------------- lame under the pauldron + upper arm undersuit and dark band (upper_arm)
        pc = Piece(f"UpperArm.{s}")
        fr = bone_frame(f"upper_arm.{s}", m)
        L = fr.L
        pc.loft(fr, [(0.035, octa(0.118, 0.128, 0.046), "steel"), (0.110, octa(0.122, 0.132, 0.048), "brass"),
                     (0.135, octa(0.122, 0.132, 0.048), "brass")])
        pc.loft(fr, [(-0.02, octa(0.090, 0.090, 0.032), "under"), (L + 0.03, octa(0.080, 0.080, 0.029), "under")])
        pc.loft(fr, [(0.165, octa(0.100, 0.100, 0.036), "steel_dark"), (0.240, octa(0.097, 0.097, 0.035), "steel_dark")])
        pc.build(bone=f"upper_arm.{s}")

        # ---------------- vambrace with brass rims (forearm)
        pc = Piece(f"Vambrace.{s}")
        fr = bone_frame(f"forearm.{s}", m)
        L = fr.L
        pc.loft(fr, [(0.03, octa(0.094, 0.090, 0.034), "steel"), (L - 0.06, octa(0.086, 0.082, 0.031), "steel")])
        pc.loft(fr, [(-0.035, octa(0.104, 0.100, 0.038), "brass"), (0.050, octa(0.102, 0.098, 0.037), "brass")])
        pc.loft(fr, [(L - 0.075, octa(0.096, 0.092, 0.035), "brass"), (L - 0.008, octa(0.094, 0.090, 0.034), "brass")])
        pc.build(bone=f"forearm.{s}")

        # ---------------- gauntlet: dark glove, steel back plate and knuckles, finger block (hand)
        pc = Piece(f"Gauntlet.{s}")
        fr = bone_frame(f"hand.{s}", m)
        pc.loft(fr, [(-0.03, octa(0.064, 0.050, 0.018), "under"), (0.16, octa(0.058, 0.042, 0.016), "under")])
        pc.loft(fr, [(-0.035, octa(0.078, 0.066, 0.026), "steel"), (0.020, octa(0.070, 0.058, 0.022), "steel")])   # flared cuff
        pc.box(fr, 0.010, 0.095, 0.034, 0.078, -0.056, 0.056, "steel")                                      # back plate
        pc.box(fr, 0.092, 0.165, 0.028, 0.070, -0.052, 0.052, "steel_dark")                                 # knuckles/fingers
        pc.box(fr, 0.100, 0.118, 0.066, 0.074, -0.050, 0.050, "brass")                                      # knuckle rim
        pc.box(fr, 0.025, 0.090, -0.024, 0.034, 0.040, 0.070, "steel_dark")                                 # thumb
        pc.build(bone=f"hand.{s}")

# ================================================================ cloth panels (textured)
TAGS["banner"] = ("KitBanner", (255, 255, 255))
TAGL.append("banner")
if "KitBanner" not in MATS:
    mb = bpy.data.materials.new("KitBanner"); mb.use_nodes = True; nt = mb.node_tree; nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    img = bpy.data.images.load(SCR + "banner.jpg"); img.pack(); img.name = "SpellbladeBanner"; tex.image = img
    b = nt.nodes.new("ShaderNodeBsdfPrincipled"); o = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs[0], b.inputs["Base Color"]); nt.links.new(b.outputs[0], o.inputs[0])
    b.inputs["Metallic"].default_value = 0.0; b.inputs["Roughness"].default_value = 0.9
    mb.use_fake_user = True; MATS["KitBanner"] = mb


def cloth_panel(name, xs, hem, z_top, depths, ypath, curve, u0, u1, flip_u, weights, thick=0.009, back=False):
    """xs: column x positions; hem(|x|) -> bottom depth; depths: row depths from the top (m)."""
    pc = Piece(name)
    uv = pc.bm.loops.layers.uv.new("UVMap")
    W = xs[-1] - xs[0]; Hmax = max(depths)
    V = {}
    def vert(x, d, layer):
        key = (round(x, 5), round(d, 5), layer)
        if key not in V:
            z = z_top - d
            y = ypath(z) + curve * x * x
            y += (-thick if layer else 0.0) * (1 if not back else -1)
            V[key] = pc.bm.verts.new((x, y, z))
        return V[key]
    def uvof(x, d):
        u = (x - xs[0]) / W
        if flip_u: u = 1 - u
        return (u0 + (u1 - u0) * u, 1 - d / Hmax)
    faces = []
    for i in range(len(xs) - 1):
        xa, xb = xs[i], xs[i + 1]
        bottom = hem(abs((xa + xb) / 2))
        rows = [d for d in depths if d <= bottom + 1e-6]
        for j in range(len(rows) - 1):
            for layer in (0, 1):
                q = [(xa, rows[j]), (xb, rows[j]), (xb, rows[j + 1]), (xa, rows[j + 1])]
                vv = [vert(x, d, layer) for x, d in q]
                if layer == (0 if not back else 1): vv = list(reversed(vv))
                f = pc.face(vv, "banner"); faces.append((f, q))
    # side walls on the outline: walk every edge used by exactly one front face
    pc.bm.edges.ensure_lookup_table()
    front_edges = {}
    for f, q in faces:
        if f.verts[0].co.y == f.verts[0].co.y:
            pass
    bm = pc.bm
    for e in list(bm.edges):
        if len(e.link_faces) == 1:
            a, b = e.verts
            # partner verts on the other layer
            ka = next(k for k, v in V.items() if v is a); kb = next(k for k, v in V.items() if v is b)
            if ka[2] != 0: continue
            a2, b2 = V.get((ka[0], ka[1], 1)), V.get((kb[0], kb[1], 1))
            if a2 is None or b2 is None: continue
            pc.face((a, b, b2, a2), "banner"); faces.append((None, [(ka[0], ka[1]), (kb[0], kb[1]), (kb[0], kb[1]), (ka[0], ka[1])]))
    for f in bm.faces:
        for l in f.loops:
            k = next(k for k, v in V.items() if v is l.vert)
            l[uv].uv = uvof(k[0], k[1])
    return pc


def front_w(co):
    z = co.z
    if z > 1.12: return {"pelvis": 1.0}
    t = min(1.0, max(0.0, (z - 0.48) / (1.12 - 0.48)))
    if t > 0.55: u = (t - 0.55) / 0.45; return {"pelvis": u, "tabard_front_01": 1 - u}
    u = t / 0.55; return {"tabard_front_01": u, "tabard_front_02": 1 - u}


def back_w(co):
    z = co.z
    if z > 1.30: return {"chest": 1.0}
    if z > 1.10: u = smoothstep(1.10, 1.30, z); return {"chest": u, "tabard_back_01": 1 - u}
    if z > 0.84: return {"tabard_back_01": 1.0}
    u = min(1.0, max(0.0, (z - 0.40) / 0.44)); return {"tabard_back_01": u, "tabard_back_02": 1 - u}


if want("cloth"):
    fh = [(0.125, 0.675), (0.083, 0.720), (0.042, 0.765)]
    def hemf(ax, H=fh):
        for hw, d in H:
            if ax > (H[H.index((hw, d)) + 1][0] if H.index((hw, d)) + 1 < len(H) else -1): return d
        return H[-1][1]
    ypf = lambda z: lerp_path(z, [(1.26, 0.196), (1.12, 0.236), (0.80, 0.252), (0.48, 0.268)])
    xsF = [-0.125, -0.083, -0.042, 0.0, 0.042, 0.083, 0.125]
    dF = [0.0, 0.06, 0.14, 0.24, 0.34, 0.44, 0.54, 0.62, 0.675, 0.72, 0.765]
    pc = cloth_panel("TabardFront", xsF, lambda ax: hemf(ax), 1.26, dF, ypf, -0.35, 0.0, 0.5, True, front_w)
    pc.build(weights=front_w, bevel=0, grad=False)
    bh = [(0.145, 1.02), (0.097, 1.07), (0.048, 1.12)]
    ypb = lambda z: lerp_path(z, [(1.62, -0.214), (1.40, -0.228), (1.22, -0.236), (0.84, -0.262), (0.46, -0.345)])
    xsB = [-0.145, -0.097, -0.048, 0.0, 0.048, 0.097, 0.145]
    dB = [0.0, 0.12, 0.26, 0.40, 0.54, 0.68, 0.82, 0.94, 1.02, 1.07, 1.12]
    pc = cloth_panel("TabardBack", xsB, lambda ax: hemf(ax, bh), 1.62, dB, ypb, 1.1, 0.5, 1.0, False, back_w, back=True)
    pc.build(weights=back_w, bevel=0, grad=False)

# ================================================================ helmet (helmet3 parts, generation space -> rig) and sword recolour
MATMAP = {  # old material -> (tag, gain, edge)
    "DarkSteel": ("steel", 0.62, 0), "SteelFacet": ("steel", 1.0, 0), "SteelEdge": ("steel", 1.0, 1), "SteelShade": ("steel", 0.55, 0),
    "Brass": ("brass", 1.0, 0), "BrassEdge": ("brass", 1.0, 1), "CrimsonCloth": ("cloth", 1.0, 0), "ClothLight": ("cloth", 1.3, 0),
    "ClothShade": ("cloth_dark", 1.0, 0), "FaceDark": ("face", 1.0, 0), "Leather": ("leather_dark", 1.0, 0),
}
KEEPMAT = {"VisorGlow", "SorceryAccent"}


def recolor(ob, over=None, gain_all=1.0, grad_band=None):
    """re-express an existing piece in the kit's colour scheme: per-face ArmorColor from its old material."""
    over = over or {}
    me = ob.data
    names = [m.name.rsplit(".", 1)[0] if m and m.name[-4:-3] == "." and m.name[-3:].isdigit() else (m.name if m else "") for m in me.materials]
    new_slots = []
    def slot(mat):
        if mat not in new_slots: new_slots.append(mat)
        return new_slots.index(mat)
    idx, cols = [], []
    zs = [p.center.z for p in me.polygons]
    zlo, zhi = (min(zs), max(zs)) if zs else (0, 1)
    for p in me.polygons:
        nm = names[p.material_index] if p.material_index < len(names) else ""
        if nm in KEEPMAT:
            idx.append(slot(bpy.data.materials[nm])); cols.append((1, 1, 1)); continue
        tag, g, edge = over.get(nm, MATMAP.get(nm, ("steel", 1.0, 0)))
        c = np.array(albedo(TAGS[tag][1])) * g * gain_all
        if edge: c = c * EDGE_GAIN.get(tag, 1.15)
        if grad_band:
            u = (p.center.z - zlo) / max(1e-6, zhi - zlo); c = c * (grad_band[0] + (grad_band[1] - grad_band[0]) * u)
        idx.append(slot(MATS[TAGS[tag][0]])); cols.append(tuple(np.clip(c, 0, 1)))
    me.materials.clear()
    for mat in new_slots: me.materials.append(mat)
    for p, i in zip(me.polygons, idx): p.material_index = i
    for a in [a for a in me.color_attributes]: me.color_attributes.remove(a)
    attr = me.color_attributes.new("ArmorColor", "FLOAT_COLOR", "CORNER")
    for p, c in zip(me.polygons, cols):
        for li in p.loop_indices: attr.data[li].color = (float(c[0]), float(c[1]), float(c[2]), 1.0)
    me.color_attributes.active_color = attr


if want("helmet"):
    H3 = __import__("os").environ.get("KIT_HELMET", SCR + "helmet.blend")
    with bpy.data.libraries.load(H3, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith(("GenHelm", "GenVisor"))]
    RENAME = {"GenHelmShell": "HelmetShell", "GenHelmJaw": "HelmetJaw", "GenHelmCrest": "Crest", "GenVisor": "Visor",
              "GenHelmBrass": "HelmetBrass", "GenHelmPanels": "HelmetPanels"}
    SHIFT = Matrix.Translation(Vector((-0.03, -0.12, 0.0)))
    for ob in dst.objects:
        exp.objects.link(ob)
        ob.data.transform(SHIFT); ob.matrix_world = Matrix.Identity(4)
        # bake the bevel modifier so its edge-material faces can be lit as edges
        for md in list(ob.modifiers):
            with bpy.context.temp_override(object=ob, active_object=ob):
                bpy.ops.object.modifier_apply(modifier=md.name)
        nm = ob.name.rsplit(".", 1)[0]
        ob.name = RENAME.get(nm, nm); ob.data.name = ob.name
        over = {"SteelEdge": ("steel", 1.30, 0)} if ob.name == "HelmetPanels" else None
        recolor(ob, over, grad_band=(0.86, 1.0) if ob.name in ("HelmetShell", "HelmetJaw") else None)
        ob.parent = rig
        for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
        ob.vertex_groups.new(name="head").add(range(len(ob.data.vertices)), 1.0, "REPLACE")
        md = ob.modifiers.new("Armature", "ARMATURE"); md.object = rig
        BUILT[ob.name] = len(ob.data.polygons)

if want("sword"):
    SW = {"SteelEdge": ("steel", 1.55, 0), "SteelFacet": ("steel", 1.25, 0), "SteelShade": ("steel_dark", 1.0, 0),
          "CrimsonCloth": ("cloth", 1.9, 0), "Leather": ("leather_dark", 1.0, 0)}
    for ob in list(exp.all_objects):
        if ob.type == "MESH" and (ob.name.startswith(("HeroSword", "Sword", "GripWrap"))):
            recolor(ob, SW)

# ================================================================ merge pieces per required hero piece (fewer draw calls)
MERGE = {"Breastplate": ["TorsoUnder", "Belt"], "Gauntlet.R": ["UpperArm.R", "Vambrace.R"], "Gauntlet.L": ["UpperArm.L", "Vambrace.L"],
         "Greave.R": ["Thigh.R"], "Greave.L": ["Thigh.L"], "HelmetShell": ["HelmetBrass", "HelmetPanels"],
         "HeroSword": ["SwordGuard", "SwordGemSetting", "SwordGem", "SwordGrip", "SwordPommel"] + [f"GripWrap.{i}" for i in range(5)]}
if not ONLY:
    for target, parts in MERGE.items():
        tgt = bpy.data.objects.get(target)
        objs = [bpy.data.objects[p] for p in parts if p in bpy.data.objects]
        if tgt is None or not objs: continue
        for o in bpy.context.view_layer.objects: o.select_set(False)
        for o in objs + [tgt]: o.select_set(True)
        bpy.context.view_layer.objects.active = tgt
        with bpy.context.temp_override(active_object=tgt, selected_editable_objects=objs + [tgt], object=tgt):
            bpy.ops.object.join()
        BUILT[target] = len(tgt.data.polygons)
        for p in parts: BUILT.pop(p, None)
exec(open(KITDIR + "kit_finish.py").read())
