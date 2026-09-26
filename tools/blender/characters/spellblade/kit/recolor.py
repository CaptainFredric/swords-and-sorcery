# recolor.py -- exec'd by kit_pieces.py and fp_pieces.py: re-express pieces from the older sources (helmet parts,
# sword) in the kit's colour scheme.
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


