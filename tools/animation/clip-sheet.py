"""Draws clip-sheet.mjs output: one row per clip, front view (x, y) over side view (z, y), frame by frame.

    python3 tools/animation/clip-sheet.py out.png a.json [b.json ...]
"""
import json
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

out, files = sys.argv[1], sys.argv[2:]
sheets = [json.load(open(f)) for f in files]
cols = max(len(s["frames"]) for s in sheets)
fig, axes = plt.subplots(2 * len(sheets), cols, figsize=(cols * 1.3, 2 * len(sheets) * 1.9), squeeze=False)
for r, sheet in enumerate(sheets):
    for c in range(cols):
        for view in range(2):
            ax = axes[2 * r + view][c]
            ax.set_xticks([]); ax.set_yticks([])
            ax.set_xlim(-1.3, 1.3) if view == 0 else ax.set_xlim(-1.6, 1.0)
            ax.set_ylim(-0.05, 2.5)
            ax.set_aspect("equal")
            if c >= len(sheet["frames"]):
                ax.axis("off"); continue
            fr = sheet["frames"][c]
            h = 0 if view == 0 else 2
            for a, b in fr["bones"]:
                ax.plot([a[h], b[h]], [a[1], b[1]], color="#334", lw=1.4)
            s0, s1 = fr["sword"]
            ax.plot([s0[h], s1[h]], [s0[1], s1[1]], color="#c33", lw=1.8)
            ax.axhline(0, color="#999", lw=0.5)
            if view == 0:
                ax.set_title(f"{sheet['clip'] if c == 0 else ''} f{fr['f']}", fontsize=6)
fig.text(0.005, 0.5, "rows: front (x right), side (z: ahead is left)", rotation=90, fontsize=6, va="center")
plt.tight_layout(pad=0.2)
plt.savefig(out, dpi=110)
print(out)
