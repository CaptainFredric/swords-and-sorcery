#!/usr/bin/env python3
"""Stage *actual* authored SO-FIST-ICATION binaries from Argon's approved ZIP.

No placeholders and no generated substitutes: identify each file by its
sha256 and exact byte length, regardless of the archive's folder layout.
Usage:
  python3 scripts/release/stage-sofist-assets.py SO_FIST_ICATION_PR366_Ready_to_Stage.zip
"""
import argparse
import hashlib
from pathlib import Path
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
EXPECTED = (
    ("elevating ram GLB", 6502480,
     "bab81d9861a80e8339bd7bb479e5f41770c6acdbec22d36eb94e262d986b0efd",
     "client/assets/props/so-fist-ication/so-fist-ication-elevating-ram.glb"),
    ("detached fist GLB", 214728,
     "5e7802eacdb8ff252a0f575a3ba002287a51e73fccbd6e2a22f89a1c957597e4",
     "client/assets/props/so-fist-ication/so-fist-ication-detached-fist.glb"),
    ("editable Blender source", 4006788,
     "f8481439b5429ed0aa00c0b53c8dbc869a7c0781e7e92160f7bd221aab5c2d9e",
     "assets/source/so-fist-ication/SoFist-elevating-ram-source.blend"),
)


def verify(path, expected_size, expected_hash):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1024 * 1024):
            h.update(chunk)
    return path.stat().st_size == expected_size and h.hexdigest() == expected_hash


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Original Argon ready-to-stage ZIP, unmodified")
    args = parser.parse_args()
    if not args.archive.is_file():
        parser.error("Archive does not exist: " + str(args.archive))

    matches = {}
    with zipfile.ZipFile(args.archive) as archive:
        candidates = [m for m in archive.infolist() if not m.is_dir()
                      and m.file_size in {row[1] for row in EXPECTED}]
        for entry in candidates:
            h = hashlib.sha256()
            with archive.open(entry) as stream:
                while chunk := stream.read(1024 * 1024):
                    h.update(chunk)
            for label, size, digest, target in EXPECTED:
                if entry.file_size == size and h.hexdigest() == digest:
                    matches[target] = entry
        missing = [label for label, _, _, target in EXPECTED if target not in matches]
        if missing:
            raise SystemExit("Archive lacks original verified assets: " + ", ".join(missing)
                             + "\nDo not substitute older or generated GLBs.")

        for label, size, digest, target in EXPECTED:
            destination = ROOT / target
            if destination.is_file():
                if not verify(destination, size, digest):
                    raise SystemExit("Refusing to overwrite a different file: " + str(destination))
                print("Already verified:", target)
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as staged:
                scratch = Path(staged.name)
                try:
                    with archive.open(matches[target]) as stream:
                        while chunk := stream.read(1024 * 1024):
                            staged.write(chunk)
                except BaseException:
                    scratch.unlink(missing_ok=True)
                    raise
            if not verify(scratch, size, digest):
                scratch.unlink(missing_ok=True)
                raise SystemExit("Corrupt staged asset: " + label)
            scratch.replace(destination)
            print("Staged verified:", target)

    print("\nAll three originals verified. Run npm run verify and commit the three assets.")
    print("This does not publish an itch.io build or deploy the multiplayer server.")


if __name__ == "__main__":
    try:
        main()
    except zipfile.BadZipFile as exc:
        sys.exit("Invalid handoff archive: " + str(exc))
