from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.blender.common.render import configure_render
from tools.blender.characters.spellblade.validate import load_contract


_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Build Swords & Sorcery Spellblade assets")
    parser.add_argument("--mode", choices=("bootstrap", "preview", "review"), default="bootstrap")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--source-revision", required=True)
    return parser.parse_args(argv)


def bootstrap(args: argparse.Namespace) -> None:
    if not _REVISION_RE.fullmatch(args.source_revision):
        raise ValueError("source revision must be a 40-character lowercase Git SHA")

    contract = load_contract()
    args.out.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    configure_render(bpy.context.scene, "preview")

    blend_path = args.out / "spellblade-worker-bootstrap.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    report = {
        "schemaVersion": 1,
        "workerReady": True,
        "mode": "bootstrap",
        "visualStage": "worker-bootstrap",
        "sourceRevision": args.source_revision,
        "blenderVersion": bpy.app.version_string,
        "contractVersion": contract["version"],
        "outputs": {"blend": blend_path.name},
    }
    report_path = args.out / "spellblade-build-report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"SPELLBLADE_WORKER_READY report={report_path} blender={bpy.app.version_string}")


def main() -> None:
    args = parse_args()
    if args.mode != "bootstrap":
        raise RuntimeError("SPELLBLADE_MODEL_NOT_IMPLEMENTED")
    bootstrap(args)


if __name__ == "__main__":
    main()
