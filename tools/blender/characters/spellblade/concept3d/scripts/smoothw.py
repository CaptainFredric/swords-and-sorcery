"""Laplacian smoothing of vertex-group weights over mesh edges, then limit to 4 influences and normalise.
Cloth vertices (dominant tabard_* weight) and body vertices are smoothed separately so neither bleeds into the other."""
import numpy as np


def smooth_weights(ob, iterations=4, factor=0.5, deform_names=None, limit=4):
    me = ob.data
    groups = [g for g in ob.vertex_groups if deform_names is None or g.name in deform_names]
    if not groups: return
    col = {g.index: i for i, g in enumerate(groups)}
    V = len(me.vertices)
    W = np.zeros((V, len(groups)), np.float64)
    for v in me.vertices:
        for g in v.groups:
            if g.group in col: W[v.index, col[g.group]] = g.weight
    cloth_cols = [i for i, g in enumerate(groups) if g.name.startswith("tabard_")]
    is_cloth = W[:, cloth_cols].sum(1) > 0.5 if cloth_cols else np.zeros(V, bool)
    E = np.array([tuple(e.vertices) for e in me.edges], np.int64)
    same = is_cloth[E[:, 0]] == is_cloth[E[:, 1]]
    E = E[same]
    deg = np.bincount(E.ravel(), minlength=V).astype(np.float64)
    for _ in range(iterations):
        acc = np.zeros_like(W)
        np.add.at(acc, E[:, 0], W[E[:, 1]]); np.add.at(acc, E[:, 1], W[E[:, 0]])
        has = deg > 0
        avg = np.where(has[:, None], acc / np.maximum(deg, 1)[:, None], W)
        W = (1 - factor) * W + factor * avg
    # keep the strongest `limit` influences, normalise
    if W.shape[1] > limit:
        cut = np.sort(W, axis=1)[:, -limit][:, None]
        W = np.where(W >= cut, W, 0.0)
    W[W < 0.01] = 0.0
    tot = W.sum(1, keepdims=True); W = np.where(tot > 0, W / np.maximum(tot, 1e-9), W)
    for i, g in enumerate(groups):
        nz = np.nonzero(W[:, i])[0]; z = np.nonzero(W[:, i] == 0)[0]
        if len(z): g.remove(z.tolist())
        for vi in nz: g.add([int(vi)], float(W[vi, i]), "REPLACE")
