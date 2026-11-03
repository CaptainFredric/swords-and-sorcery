"""Build the third-person Spellblade source from Rodin's delivery (assets/source/rodin/).

Run through build.sh, or directly on the kit source:

    blender <kit source.blend> --background --factory-startup --python-exit-code 1 \
      --python tools/blender/characters/spellblade/rodin/build_source.py -- --out <source.blend> --work <dir>

Stages, in order: fit (fit.py), parts (parts.py), motion (motion.py), look (look.py). --stop-after ends early for
review. Each stage prints one summary line starting RODIN_.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[5]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.blender.characters.spellblade.rodin.fit import fit_rodin  # noqa: E402
from tools.blender.characters.spellblade.rodin.look import build_look  # noqa: E402
from tools.blender.characters.spellblade.rodin.motion import fit_motion  # noqa: E402
from tools.blender.characters.spellblade.rodin.parts import build_parts  # noqa: E402

ARCHIVE = ROOT / "assets/source/rodin"
STAGES = ("fit", "parts", "motion", "look")


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build the Rodin Spellblade source")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--work", type=Path, default=ROOT / "artifacts/rodin")
    parser.add_argument("--stop-after", choices=STAGES, default=STAGES[-1])
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args()
    stop = STAGES.index(args.stop_after)
    rig = bpy.data.objects["SpellbladeRig"]
    fit = fit_rodin(rig, ARCHIVE / "rodin-spellblade-unrigged.glb", ARCHIVE / "rodin-spellblade-autorigged.glb")
    print("RODIN_FIT", json.dumps(fit.report))
    if stop >= 1:
        print("RODIN_PARTS", json.dumps(build_parts(rig, fit, ARCHIVE)))
    if stop >= 2:
        motion = fit_motion(rig, fix=os.environ.get("RODIN_MOTION_FIX", "1") != "0",
                            search=os.environ.get("RODIN_MOTION_SEARCH", "1") != "0")
        print("RODIN_MOTION", json.dumps(motion))
    if stop >= 3:
        print("RODIN_LOOK", json.dumps(build_look(args.work)))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.out.resolve()), compress=True)
    print("RODIN_SOURCE_WRITTEN", args.out)


if __name__ == "__main__":
    main()
